const { pool } = require('../config/database');
require('dotenv').config();

/**
 * إدارة البحث النصي في قاعدة البيانات (بديل عن ChromaDB)
 * يعمل مباشرة مع TiDB/MySQL بدون خدمات خارجية
 */
class VectorStore {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    try {
      // Test database connection
      const conn = await pool.getConnection();
      conn.release();
      this.initialized = true;
      console.log('✅ قاعدة البحث النصي جاهزة (SQL mode)');
    } catch (error) {
      console.error('⚠️ خطأ في الاتصال بقاعدة البيانات:', error.message);
      this.initialized = false;
    }
  }

  /**
   * إضافة أجزاء نص إلى قاعدة البيانات (بدلاً من ChromaDB)
   * يتم الحفظ في جدول text_chunks مباشرة
   */
  async addChunks(chunks, bookTitle, bookAuthor) {
    // Chunks are already saved to the database in admin.js upload route
    // This method just marks them as indexed
    console.log(`✅ تم فهرسة ${chunks.length} جزء نصي للكتاب: ${bookTitle}`);
    return chunks.map((c, i) => ({ ...c, vectorId: `sql_${c.bookId}_${i}` }));
  }

  /**
   * البحث النصي في الكتب باستخدام SQL LIKE
   */
  async search(query, options = {}) {
    if (!this.initialized) return [];

    try {
      const nResults = options.nResults || 5;

      // Strip diacritics for better Arabic search
      const stripDiacritics = (s) => s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
      const cleanQuery = stripDiacritics(query);

      // Extract keywords
      const stopWords = new Set([
        'ما', 'هي', 'هو', 'في', 'من', 'إلى', 'على', 'عن', 'مع', 'أو', 'هل',
        'كم', 'متى', 'أين', 'كيف', 'لماذا', 'ماذا', 'التي', 'الذي', 'ذلك',
        'هذا', 'هذه', 'هناك', 'بعد', 'قبل', 'بين', 'حول', 'عند', 'لأن',
        'لكن', 'ثم', 'بل', 'قد', 'لا', 'لم', 'لن', 'إن', 'أن', 'كان',
      ]);

      const keywords = cleanQuery
        .replace(/[؟?!،,.]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      if (keywords.length === 0) return [];

      const col = 'IFNULL(tc.content_clean, tc.content)';

      // Build SQL query
      let sql = `
        SELECT tc.content, tc.page_start, tc.page_end, tc.book_id,
               b.title as book_title, b.author as book_author
        FROM text_chunks tc
        JOIN books b ON tc.book_id = b.id
        WHERE (${keywords.map(() => `${col} LIKE ?`).join(' OR ')})
      `;
      const params = keywords.map(k => `%${k}%`);

      if (options.bookId) {
        sql += ' AND tc.book_id = ?';
        params.push(options.bookId);
      }

      sql += ` LIMIT ${nResults}`;

      const [rows] = await pool.execute(sql, params);

      return rows.map(row => ({
        content: row.content,
        metadata: {
          bookId: String(row.book_id),
          bookTitle: row.book_title,
          bookAuthor: row.book_author,
          pageStart: String(row.page_start || ''),
          pageEnd: String(row.page_end || ''),
        },
        distance: 0,
        id: `sql_${row.book_id}_${row.page_start}`,
      }));
    } catch (error) {
      console.error('خطأ في البحث النصي:', error.message);
      return [];
    }
  }

  /**
   * حذف كل أجزاء كتاب معين
   */
  async deleteBookChunks(bookId) {
    // Deletion is handled by CASCADE in the database
    console.log(`✅ تم حذف فهرس الكتاب ${bookId}`);
  }

  /**
   * عدد الأجزاء المفهرسة
   */
  async getCount() {
    if (!this.initialized) return 0;
    try {
      const [rows] = await pool.execute('SELECT COUNT(*) as count FROM text_chunks');
      return rows[0].count;
    } catch {
      return 0;
    }
  }
}

module.exports = new VectorStore();
