const { pool } = require('../config/database');
require('dotenv').config();

/**
 * إدارة البحث النصي في قاعدة البيانات (بديل عن ChromaDB)
 * يعمل مباشرة مع TiDB/MySQL بدون خدمات خارجية
 * محسّن للبحث الشامل والدقيق في الكتب الدينية
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
   * البحث النصي الشامل في الكتب باستخدام SQL
   * استراتيجية بحث متعددة المستويات للدقة القصوى
   */
  async search(query, options = {}) {
    if (!this.initialized) return [];

    try {
      const nResults = options.nResults || 15;
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
        'سنن':     ['سنن', 'سنة', 'مستحب', 'مستحبات', 'مندوب'],
        'مكروه':   ['مكروه', 'مكروهات', 'يكره'],
        'مبطلات':  ['مبطلات', 'نواقض', 'يبطل', 'ينقض'],
        'نواقض':   ['نواقض', 'مبطلات', 'ينقض', 'يبطل'],
      };

      // Strip diacritics for better Arabic search
      const stripDiacritics = (s) => s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
      const cleanQuery = stripDiacritics(query);

      // Extract keywords - improved stop word list
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
        .filter(w => w.length >= 2 && !stopWords.has(w));

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

      const runQuery = async (conditions, params, scoreExpr = null, scoreParams = [], limit = nResults) => {
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
        sql += ` LIMIT ${limit}`;
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

      // Build scoring expression with higher weights
      const scoreExprs = [];
      const scoreParams = [];
      
      // Full query match gets highest score
      scoreExprs.push(`(${col} LIKE ?) * 10`);
      scoreParams.push(`%${cleanQuery}%`);

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
        const exactRows = await runQuery(`${col} LIKE ?`, [`%${cleanQuery}%`], scoreSql || '1', scoreSql ? scoreParams : []);
        return mapRows(exactRows);
      }

      if (keywords.length === 0) return [];

      // ── بحث بالجذر (Root) ──
      if (searchType === 'root') {
        // AND first
        const andConditions = keywords.map(() => `${col} LIKE ?`).join(' AND ');
        const andParams = keywords.map(k => `%${k}%`);
        const andRows = await runQuery(andConditions, andParams, scoreSql, scoreParams);
        if (andRows.length > 0) return mapRows(andRows);
        // Fallback to OR
        const orConditions = keywords.map(() => `${col} LIKE ?`).join(' OR ');
        const orParams = keywords.map(k => `%${k}%`);
        const orRows = await runQuery(orConditions, orParams, scoreSql, scoreParams);
        return mapRows(orRows);
      }

      // ── بحث موضوعي (Thematic - Default) - بحث شامل متعدد المستويات ──
      const allResults = [];
      const seenIds = new Set();

      const addUnique = (rows) => {
        for (const row of rows) {
          const key = `${row.book_id}_${row.page_start}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            allResults.push(row);
          }
        }
      };

      // المستوى 1: كل الكلمات معاً (AND) - الأعلى دقة
      const andConditions = keywords.map(() => `${col} LIKE ?`).join(' AND ');
      const andParams = keywords.map(k => `%${k}%`);
      const andRows = await runQuery(andConditions, andParams, scoreSql, scoreParams, nResults);
      addUnique(andRows);

      // المستوى 2: العبارات المتجاورة
      if (exactPhrases.length > 0 && allResults.length < nResults) {
        const exactConditions = exactPhrases.map(() => `${col} LIKE ?`).join(' OR ');
        const exactParams = exactPhrases.map(p => `%${p}%`);
        const remaining = nResults - allResults.length;
        const exactRows = await runQuery(exactConditions, exactParams, scoreSql, scoreParams, remaining + 5);
        addUnique(exactRows);
      }

      // المستوى 3: المرادفات الفقهية
      if (synonymPhrases.length > 0 && allResults.length < nResults) {
        const synConditions = synonymPhrases.map(() => `${col} LIKE ?`).join(' OR ');
        const synParams = synonymPhrases.map(p => `%${p}%`);
        const remaining = nResults - allResults.length;
        const synRows = await runQuery(synConditions, synParams, scoreSql, scoreParams, remaining + 5);
        addUnique(synRows);
      }

      // المستوى 4: أي كلمة (OR) - لملء النتائج إذا لم تكفِ
      if (allResults.length < nResults) {
        const orConditions = keywords.map(() => `${col} LIKE ?`).join(' OR ');
        const orParams = keywords.map(k => `%${k}%`);
        const remaining = nResults - allResults.length;
        const orRows = await runQuery(orConditions, orParams, scoreSql, scoreParams, remaining + 5);
        addUnique(orRows);
      }

      return mapRows(allResults.slice(0, nResults));

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
