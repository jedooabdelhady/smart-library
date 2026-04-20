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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
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

    // Step 1: Extract text
    console.log('📄 استخراج النص...');
    const extracted = await textExtractor.extract(file.path);

    // Step 2: Get category ID
    let categoryId = null;
    try {
      const [cats] = await pool.execute('SELECT id FROM categories WHERE slug = ?', [category]);
      if (cats.length > 0) categoryId = cats[0].id;
    } catch (e) {}

    // Step 3: Insert book into database
    let bookId;
    try {
      const [result] = await pool.execute(
        'INSERT INTO books (title, author, category_id, file_path, file_type, pages_count) VALUES (?, ?, ?, ?, ?, ?)',
        [title, author || 'غير محدد', categoryId, file.path, path.extname(file.originalname), extracted.totalPages]
      );
      bookId = result.insertId;
    } catch (e) {
      bookId = Date.now(); // Fallback
    }

    // Step 4: Save pages to database
    console.log(`📖 حفظ ${extracted.pages.length} صفحة...`);
    for (const page of extracted.pages) {
      try {
        await pool.execute(
          'INSERT INTO book_pages (book_id, page_number, content) VALUES (?, ?, ?)',
          [bookId, page.number, page.content]
        );
      } catch (e) {}
    }

    // Step 5: Smart text splitting
    console.log('✂️ تقسيم النص الذكي...');
    const splitter = new ArabicTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = splitter.splitPages(extracted.pages, bookId);

    // Step 6: Save chunks to database
    console.log(`💾 حفظ ${chunks.length} جزء...`);
    for (const chunk of chunks) {
      try {
        await pool.execute(
          'INSERT INTO text_chunks (book_id, chunk_index, content, page_start, page_end) VALUES (?, ?, ?, ?, ?)',
          [bookId, chunk.index, chunk.content, chunk.pageStart, chunk.pageEnd]
        );
      } catch (e) {}
    }

    // Step 7: Index in vector database
    console.log('🧠 فهرسة في قاعدة المتجهات...');
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
    console.error('خطأ في رفع الكتاب:', error);
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
    try {
      const [book] = await pool.execute('SELECT file_path FROM books WHERE id = ?', [bookId]);
      await pool.execute('DELETE FROM books WHERE id = ?', [bookId]);

      // Delete physical file
      if (book[0]?.file_path && fs.existsSync(book[0].file_path)) {
        fs.unlinkSync(book[0].file_path);
      }
    } catch (e) {}

    res.json({ success: true, message: 'تم حذف الكتاب بنجاح' });
  } catch (error) {
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
