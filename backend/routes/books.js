const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// كتب المكتبة المعتمدة - الفقه الحنبلي (الدفعة الأولى)
const demoBooks = [
  { id: 1, title: 'المغني', author: 'ابن قدامة - تحقيق التركي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 2, title: 'الممتع في شرح المقنع', author: 'زين الدين المُنَجَّى', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 3, title: 'شرح عمدة الفقه', author: 'ابن تيمية - ط عطاءات العلم', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 4, title: 'الوجيز في الفقه على مذهب الإمام أحمد بن حنبل', author: 'الحسين بن يوسف الدجيلي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 5, title: 'شرح الزركشي على مختصر الخرقي', author: 'الزركشي الحنبلي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 6, title: 'الاستخراج لأحكام الخراج', author: 'ابن رجب الحنبلي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 7, title: 'المبدع شرح المقنع', author: 'برهان الدين ابن مفلح الحفيد - ط ركائز', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 8, title: 'الإنصاف في معرفة الراجح من الخلاف', author: 'المرداوي - تحقيق التركي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 9, title: 'شرح منتهى الإرادات - معونة أولي النهى', author: 'ابن النجار الفتوحي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 10, title: 'الروض المربع بشرح زاد المستقنع', author: 'البهوتي - ط ركائز', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 11, title: 'غاية المنتهى في جمع الإقناع والمنتهى', author: 'مرعي الكرمي - ط غراس', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 12, title: 'كشاف القناع عن متن الإقناع', author: 'البهوتي - ط وزارة العدل', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 13, title: 'أخصر المختصرات', author: 'ابن بلبان الحنبلي - ط ركائز', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 14, title: 'حاشية الخلوتي على منتهى الإرادات', author: 'الخلوتي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 15, title: 'شرح دليل الطالب', author: 'عبد الله المقدسي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 16, title: 'مطالب أولي النهى في شرح غاية المنتهى', author: 'الرحيباني', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 17, title: 'منار السبيل في شرح الدليل', author: 'ابن ضويان', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 18, title: 'شرح زاد المستقنع', author: 'محمد بن عبد الله آل حسين', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 19, title: 'شرح كتاب آداب المشي إلى الصلاة (العبادات)', author: 'محمد بن إبراهيم آل الشيخ', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 20, title: 'حاشية الروض المربع', author: 'عبد الرحمن بن قاسم', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 21, title: 'الشرح الممتع على زاد المستقنع', author: 'ابن عثيمين', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 22, title: 'تيسير مسائل الفقه شرح الروض المربع', author: 'عبد الكريم النملة', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 23, title: 'المذهب الحنبلي - دراسة في تاريخه وسماته', author: 'عبد الله بن عبد المحسن التركي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 24, title: 'مدارج تفقه الحنبلي', author: 'أحمد بن ناصر القعيمي', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 25, title: 'الجامع لعلوم الإمام أحمد - الفقه', author: 'أحمد بن حنبل', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 26, title: 'أحكام النساء - من الجامع للخلال', author: 'أبو بكر الخلال', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
  { id: 27, title: 'أحكام النساء - من الجامع للخلال (نسخة ثانية)', author: 'أبو بكر الخلال', category: 'hanbali_fiqh', category_name: 'الفقه الحنبلي', pages_count: 0, indexed: false },
];

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

    if (rows.length === 0) {
      return res.json(demoBooks);
    }
    res.json(rows);
  } catch (error) {
    res.json(demoBooks);
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
    const filtered = demoBooks.filter(b =>
      b.title.includes(query) || b.author.includes(query)
    );
    res.json(filtered);
  }
});

/**
 * GET /api/categories/all - جلب التصنيفات
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
      const demo = demoBooks.find(b => b.id === parseInt(req.params.id));
      return demo ? res.json(demo) : res.status(404).json({ error: 'الكتاب غير موجود' });
    }
    res.json(rows[0]);
  } catch (error) {
    const demo = demoBooks.find(b => b.id === parseInt(req.params.id));
    return demo ? res.json(demo) : res.status(500).json({ error: error.message });
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
