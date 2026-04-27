const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const textExtractor = require('../services/textExtractor');
const ArabicTextSplitter = require('../services/textSplitter');
const vectorStore = require('../services/vectorStore');

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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.epub'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. الأنواع المسموحة: PDF, DOC, DOCX, EPUB'));
    }
  },
});

// Strip Arabic diacritics for search
const stripDiacritics = (text) => {
  if (!text) return '';
  return text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
};

/**
 * POST /api/admin/upload - رفع ومعالجة كتاب جديد
 */
router.post('/upload', upload.single('file'), async (req, res) => {
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
      extracted = await textExtractor.extract(file.path);
    } catch (extractErr) {
      console.error('❌ فشل استخراج النص:', extractErr.message);
      return res.status(500).json({ error: 'فشل في استخراج النص من الملف: ' + extractErr.message });
    }

    if (!extracted.pages || extracted.pages.length === 0) {
      return res.status(400).json({ error: 'لم يتم العثور على نص في الملف. تأكد من أن الملف يحتوي على نصوص وليس صوراً فقط.' });
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
    for (const page of extracted.pages) {
      try {
        await pool.execute(
          'INSERT INTO book_pages (book_id, page_number, content) VALUES (?, ?, ?)',
          [bookId, page.number, page.content]
        );
        savedPages++;
      } catch (e) {
        // Skip duplicate pages silently
      }
    }
    console.log(`✅ تم حفظ ${savedPages} صفحة`);

    // Step 5: Smart text splitting
    console.log('✂️ تقسيم النص الذكي...');
    const splitter = new ArabicTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = splitter.splitPages(extracted.pages, bookId);
    console.log(`✅ تم تقسيم النص إلى ${chunks.length} جزء`);

    // Step 6: Save chunks to database with content_clean for better search
    console.log(`💾 حفظ ${chunks.length} جزء...`);
    let savedChunks = 0;
    for (const chunk of chunks) {
      try {
        const cleanContent = stripDiacritics(chunk.content);
        await pool.execute(
          'INSERT INTO text_chunks (book_id, chunk_index, content, content_clean, page_start, page_end) VALUES (?, ?, ?, ?, ?, ?)',
          [bookId, chunk.index, chunk.content, cleanContent, chunk.pageStart, chunk.pageEnd]
        );
        savedChunks++;
      } catch (e) {
        // Skip errors silently
      }
    }
    console.log(`✅ تم حفظ ${savedChunks} جزء`);

    // Step 7: Index in vector store (now SQL-based, always succeeds)
    console.log('🧠 فهرسة البحث...');
    await vectorStore.addChunks(chunks, title, author);

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
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة الكتاب: ' + error.message });
  }
});

/**
 * DELETE /api/admin/books/:id - حذف كتاب
 */
router.delete('/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;

    // Delete from vector store
    await vectorStore.deleteBookChunks(bookId);

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
