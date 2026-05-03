const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');

// Lazy-load heavy deps so pdf-parse / mammoth don't load at startup
let _textExtractor = null;
let _vectorStore = null;
function getTextExtractor() {
  if (!_textExtractor) _textExtractor = require('../services/textExtractor');
  return _textExtractor;
}
function getVectorStore() {
  if (!_vectorStore) _vectorStore = require('../services/vectorStore');
  return _vectorStore;
}
function makeTextSplitter(opts) {
  const ArabicTextSplitter = require('../services/textSplitter');
  return new ArabicTextSplitter(opts);
}

// Multer setup for file uploads
// On Vercel the filesystem is read-only except /tmp; locally use backend/uploads
const getUploadDir = () => {
  const dir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.epub'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. الأنواع المسموحة: PDF, DOC, DOCX, EPUB'));
    }
  },
}).single('file');

// Strip Arabic diacritics for search
const stripDiacritics = (text) => {
  if (!text) return '';
  return text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
};

/**
 * POST /api/admin/upload - رفع ومعالجة كتاب جديد
 */
router.post('/upload', (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (100 ميجابايت)' });
      }
      return res.status(400).json({ error: 'خطأ في رفع الملف: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title, author, category } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'لم يتم إرفاق ملف' });
    }

    if (!title) {
      return res.status(400).json({ error: 'عنوان الكتاب مطلوب' });
    }

    console.log(`📚 بدء معالجة الكتاب: ${title}`);
    console.log(`📁 نوع الملف: ${path.extname(file.originalname)} | الحجم: ${(file.size / 1024 / 1024).toFixed(1)} MB`);

    // Step 1: Extract text
    console.log('📄 استخراج النص...');
    let extracted;
    try {
      extracted = await getTextExtractor().extract(file.path);
    } catch (extractErr) {
      console.error('❌ فشل استخراج النص:', extractErr.message);
      return res.status(500).json({ error: 'فشل في استخراج النص من الملف: ' + extractErr.message });
    }

    if (!extracted.pages || extracted.pages.length === 0) {
      // Clean up the uploaded file if extraction fails
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'لم يتم العثور على نص في الملف. هذا يعني غالباً أن الكتاب مصور (Scanned PDF) أو به حماية، يرجى رفع نسخة نصية قابلة للقراءة.' });
    }

    console.log(`📖 تم استخراج ${extracted.pages.length} صفحة`);

    // Step 2: Get category ID
    let categoryId = null;
    try {
      const [cats] = await pool.execute('SELECT id FROM categories WHERE slug = ?', [category]);
      if (cats.length > 0) categoryId = cats[0].id;
    } catch (e) {
      console.log('⚠️ لم يتم العثور على التصنيف:', category);
    }

    // Step 3: Insert book into database
    let bookId;
    try {
      const [result] = await pool.execute(
        'INSERT INTO books (title, author, category_id, file_path, file_type, pages_count) VALUES (?, ?, ?, ?, ?, ?)',
        [title, author || 'غير محدد', categoryId, file.path, path.extname(file.originalname), extracted.totalPages]
      );
      bookId = result.insertId;
      console.log(`✅ تم حفظ الكتاب في قاعدة البيانات - ID: ${bookId}`);
    } catch (e) {
      console.error('❌ فشل حفظ الكتاب:', e.message);
      return res.status(500).json({ error: 'فشل في حفظ الكتاب في قاعدة البيانات: ' + e.message });
    }

    // Step 4: Save pages to database (in batches for performance)
    console.log(`📖 حفظ ${extracted.pages.length} صفحة...`);
    let savedPages = 0;
    try {
      const pageBatchSize = 100;
      for (let i = 0; i < extracted.pages.length; i += pageBatchSize) {
        const batch = extracted.pages.slice(i, i + pageBatchSize);
        const placeholders = batch.map(() => '(?, ?, ?)').join(',');
        const values = [];
        for (const page of batch) {
          values.push(bookId, page.number, page.content || '');
        }
        await pool.execute(
          `INSERT IGNORE INTO book_pages (book_id, page_number, content) VALUES ${placeholders}`,
          values
        );
        savedPages += batch.length;
      }
    } catch (e) {
      console.error('❌ خطأ أثناء حفظ الصفحات:', e.message);
    }
    console.log(`✅ تم حفظ ${savedPages} صفحة`);

    // Step 5: Smart text splitting
    console.log('✂️ تقسيم النص الذكي...');
    const splitter = makeTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const chunks = splitter.splitPages(extracted.pages, bookId);
    console.log(`✅ تم تقسيم النص إلى ${chunks.length} جزء`);

    // Step 6: Save chunks to database with content_clean for better search
    console.log(`💾 حفظ ${chunks.length} جزء...`);
    let savedChunks = 0;
    try {
      const chunkBatchSize = 100;
      for (let i = 0; i < chunks.length; i += chunkBatchSize) {
        const batch = chunks.slice(i, i + chunkBatchSize);
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
        const values = [];
        for (const chunk of batch) {
          const cleanContent = stripDiacritics(chunk.content);
          values.push(bookId, chunk.index, chunk.content, cleanContent, chunk.pageStart, chunk.pageEnd);
        }
        await pool.execute(
          `INSERT IGNORE INTO text_chunks (book_id, chunk_index, content, content_clean, page_start, page_end) VALUES ${placeholders}`,
          values
        );
        savedChunks += batch.length;
      }
    } catch (e) {
      console.error('❌ خطأ أثناء حفظ الأجزاء:', e.message);
    }
    console.log(`✅ تم حفظ ${savedChunks} جزء`);

    // Step 7: Index in vector store (now SQL-based, always succeeds)
    console.log('🧠 فهرسة البحث...');
    await getVectorStore().addChunks(chunks, title, author);

    // Step 8: Mark as indexed
    try {
      await pool.execute('UPDATE books SET indexed = TRUE WHERE id = ?', [bookId]);
    } catch (e) {}

    console.log(`✅ تم معالجة الكتاب "${title}" بنجاح`);

    res.json({
      success: true,
      message: `تم رفع وفهرسة الكتاب "${title}" بنجاح`,
      book: {
        id: bookId,
        title,
        author,
        pagesCount: extracted.totalPages,
        chunksCount: chunks.length,
      },
    });
  } catch (error) {
    console.error('❌ خطأ في رفع الكتاب:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة الكتاب: ' + error.message });
  }
  });
});

/**
 * DELETE /api/admin/books/:id - حذف كتاب
 */
router.delete('/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;

    // Delete from vector store
    await getVectorStore().deleteBookChunks(bookId);

    // Delete from database (cascades to pages and chunks)
    const [book] = await pool.execute('SELECT file_path FROM books WHERE id = ?', [bookId]);
    await pool.execute('DELETE FROM books WHERE id = ?', [bookId]);

    // Delete physical file
    if (book[0]?.file_path && fs.existsSync(book[0].file_path)) {
      fs.unlinkSync(book[0].file_path);
    }

    res.json({ success: true, message: 'تم حذف الكتاب بنجاح' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/stats - إحصائيات لوحة التحكم
 */
router.get('/stats', async (req, res) => {
  try {
    const [booksCount] = await pool.execute('SELECT COUNT(*) as count FROM books');
    const [pagesCount] = await pool.execute('SELECT SUM(pages_count) as count FROM books');
    const [chunksCount] = await pool.execute('SELECT COUNT(*) as count FROM text_chunks');
    const [indexedCount] = await pool.execute('SELECT COUNT(*) as count FROM books WHERE indexed = TRUE');

    res.json({
      totalBooks: booksCount[0].count,
      totalPages: pagesCount[0].count || 0,
      totalChunks: chunksCount[0].count,
      indexedBooks: indexedCount[0].count,
    });
  } catch (error) {
    res.json({
      totalBooks: 0,
      totalPages: 0,
      totalChunks: 0,
      indexedBooks: 0,
    });
  }
});

module.exports = router;
