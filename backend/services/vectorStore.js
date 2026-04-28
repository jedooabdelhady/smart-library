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
      const nResults = options.nResults || 8;
      const bookId = options.bookId || null;

      // ── مرادفات المصطلحات الفقهية ──
      const fiqhSynonyms = {
        'شروط':    ['شروط', 'فروض', 'أركان', 'واجبات', 'صفة', 'باب'],
        'فروض':    ['فروض', 'شروط', 'أركان', 'واجبات'],
        'أركان':   ['أركان', 'فروض', 'شروط', 'واجبات'],
        'واجبات':  ['واجبات', 'فروض', 'شروط', 'أركان'],
        'حكم':     ['حكم', 'حكمه', 'حكمها', 'يجوز', 'يحرم', 'يستحب'],
        'دليل':    ['دليل', 'دليله', 'الدليل', 'الأدلة', 'لقوله', 'لحديث'],
        'أقسام':   ['أقسام', 'أنواع', 'أصناف'],
        'أنواع':   ['أنواع', 'أقسام', 'أصناف'],
      };

      // Strip diacritics for better Arabic search
      const stripDiacritics = (s) => s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
      const cleanQuery = stripDiacritics(query);

      // Extract keywords
      const stopWords = new Set([
        'ما', 'هي', 'هو', 'في', 'من', 'إلى', 'على', 'عن', 'مع', 'أو', 'هل', 'كم',
        'متى', 'أين', 'كيف', 'لماذا', 'ماذا', 'التي', 'الذي', 'ذلك', 'هذا', 'هذه',
        'تلك', 'هناك', 'حين', 'بعد', 'قبل', 'بين', 'حول', 'خلال', 'عند', 'لأن',
        'لكن', 'ثم', 'بل', 'قد', 'لا', 'لم', 'لن', 'إن', 'أن', 'كان', 'يكون',
        'حتى', 'إذا', 'إذ', 'أما', 'فإن', 'وإن', 'كما',
        'المغني', 'الممتع', 'الروض', 'المربع', 'الزركشي', 'الوجيز', 'المقنع',
        'الخرقي', 'المستقنع', 'الكتاب', 'الكتب', 'المكتبة',
      ]);

      const keywords = cleanQuery
        .replace(/[؟?!،,.]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      if (keywords.length === 0) return [];

      const col = 'IFNULL(tc.content_clean, tc.content)';

      const mapRows = (rows) => rows.map(row => ({
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

      const runQuery = async (conditions, params, scoreExpr = null, scoreParams = []) => {
        let sql = `
          SELECT tc.content, tc.page_start, tc.page_end, tc.book_id,
                 b.title as book_title, b.author as book_author
        `;
        if (scoreExpr) {
          sql += `, ${scoreExpr} as score`;
        } else {
          sql += `, 0 as score`;
        }
        sql += `
          FROM text_chunks tc
          JOIN books b ON tc.book_id = b.id
          WHERE (${conditions})
        `;
        const finalParams = [...scoreParams, ...params];
        if (bookId) { sql += ' AND tc.book_id = ?'; finalParams.push(bookId); }
        if (scoreExpr) {
          sql += ` ORDER BY score DESC`;
        }
        sql += ` LIMIT ${nResults}`;
        const [rows] = await pool.execute(sql, finalParams);
        return rows;
      };

      const exactPhrases = [];
      const synonymPhrases = [];
      
      if (keywords.length >= 2) {
        for (let i = 0; i < keywords.length - 1; i++) {
          exactPhrases.push(`${keywords[i]} ${keywords[i + 1]}`);
          
          const w1 = keywords[i];
          const w2 = keywords[i + 1];
          if (fiqhSynonyms[w1]) for (const syn of fiqhSynonyms[w1]) synonymPhrases.push(`${syn} ${w2}`);
          if (fiqhSynonyms[w2]) for (const syn of fiqhSynonyms[w2]) synonymPhrases.push(`${w1} ${syn}`);
        }
      }

      // Build scoring expression
      const scoreExprs = [];
      const scoreParams = [];
      
      exactPhrases.forEach(p => {
        scoreExprs.push(`(${col} LIKE ?) * 5`);
        scoreParams.push(`%${p}%`);
      });
      
      synonymPhrases.forEach(p => {
        scoreExprs.push(`(${col} LIKE ?) * 3`);
        scoreParams.push(`%${p}%`);
      });
      
      keywords.forEach(k => {
        scoreExprs.push(`(${col} LIKE ?) * 1`);
        scoreParams.push(`%${k}%`);
      });
      
      const scoreSql = scoreExprs.length > 0 ? `(${scoreExprs.join(' + ')})` : null;

      const searchType = options.searchType || 'thematic';

      // ── تطابق تام (Exact Match) ──
      if (searchType === 'exact') {
        const exactRows = await runQuery(`${col} LIKE ?`, [`%${cleanQuery}%`], scoreSql, scoreParams);
        return mapRows(exactRows);
      }

      // ── 1: كل الكلمات (AND) ──
      const andConditions = keywords.map(() => `${col} LIKE ?`).join(' AND ');
      const andParams = keywords.map(k => `%${k}%`);
      const andRows = await runQuery(andConditions, andParams, scoreSql, scoreParams);
      
      // إذا كان البحث 'root' (جذر/كلمات مفتاحية) نكتفي بالـ AND
      if (searchType === 'root' && andRows.length > 0) {
        return mapRows(andRows);
      } else if (searchType === 'root' && andRows.length === 0) {
        // Fallback to OR if no AND found in root search
        const orConditions = keywords.map(() => `${col} LIKE ?`).join(' OR ');
        const orParams = keywords.map(k => `%${k}%`);
        const orRows = await runQuery(orConditions, orParams, scoreSql, scoreParams);
        return mapRows(orRows);
      }

      // ── بحث موضوعي (Thematic - Default) ──
      if (andRows.length > 0) return mapRows(andRows);

      // ── 2: العبارات المتجاورة (OR) ──
      if (exactPhrases.length > 0) {
        const exactConditions = exactPhrases.map(() => `${col} LIKE ?`).join(' OR ');
        const exactParams = exactPhrases.map(p => `%${p}%`);
        const exactRows = await runQuery(exactConditions, exactParams, scoreSql, scoreParams);
        if (exactRows.length > 0) return mapRows(exactRows);
      }

      // ── 3: أي كلمة (OR) ──
      const orConditions = keywords.map(() => `${col} LIKE ?`).join(' OR ');
      const orParams = keywords.map(k => `%${k}%`);
      const orRows = await runQuery(orConditions, orParams, scoreSql, scoreParams);
      return mapRows(orRows);

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
