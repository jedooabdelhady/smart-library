const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

/**
 * GET /api/books - جلب جميع الكتب
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT b.*, c.name as category_name, c.slug as category
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('خطأ في جلب الكتب:', error.message);
    res.json([]);
  }
});

/**
 * GET /api/books/search?q=... - البحث في الكتب
 * *** يجب أن يكون قبل /:id ***
 */
router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  try {
    const [rows] = await pool.execute(`
      SELECT b.*, c.name as category_name
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.title LIKE ? OR b.author LIKE ?
      LIMIT 20
    `, [`%${query}%`, `%${query}%`]);

    res.json(rows);
  } catch (error) {
    console.error('خطأ في البحث:', error.message);
    res.json([]);
  }
});

/**
 * GET /api/books/advanced-search
 * بحث متقدم داخل نصوص الكتب
 */
router.get('/advanced-search', async (req, res) => {
  try {
    const { q: query, bookId, type } = req.query;
    if (!query) return res.json([]);

    console.log(`🔎 بحث متقدم: "${query}" | النوع: ${type || 'thematic'} | الكتاب: ${bookId || 'الكل'}`);

    const vectorStore = require('../services/vectorStore');
    const options = {
      nResults: 60,
      bookId: bookId || null,
      searchType: type || 'thematic'
    };

    const results = await vectorStore.search(query, options);
    console.log(`📊 نتائج البحث المتقدم: ${results.length}`);
    res.json(results);
  } catch (error) {
    console.error('Advanced search error:', error.message);
    res.json([]);
  }
});

/**
 * GET /api/books/categories/all - جلب التصنيفات
 * *** يجب أن يكون قبل /:id ***
 */
router.get('/categories/all', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (error) {
    res.json([
      { id: 1, name: 'علوم القرآن', slug: 'quran' },
      { id: 2, name: 'الحديث الشريف', slug: 'hadith' },
      { id: 3, name: 'الفقه الإسلامي', slug: 'fiqh' },
      { id: 4, name: 'العقيدة', slug: 'aqeedah' },
      { id: 5, name: 'السيرة النبوية', slug: 'seerah' },
      { id: 6, name: 'التفسير', slug: 'tafsir' },
      { id: 7, name: 'التاريخ الإسلامي', slug: 'history' },
      { id: 8, name: 'اللغة العربية', slug: 'arabic' },
    ]);
  }
});

/**
 * GET /api/books/:id - جلب كتاب واحد
 */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT b.*, c.name as category_name, c.slug as category
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الكتاب: ' + error.message });
  }
});

/**
 * GET /api/books/:id/pages - جلب صفحات كتاب
 */
router.get('/:id/pages', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT page_number as number, content FROM book_pages WHERE book_id = ? ORDER BY page_number',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

module.exports = router;
