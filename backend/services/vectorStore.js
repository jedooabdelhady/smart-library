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
      const searchType = options.searchType || 'thematic';

      // ── مرادفات المصطلحات الفقهية ──
      const fiqhSynonyms = {
        'شروط':    ['فروض', 'أركان', 'واجبات', 'صفة'],
        'فروض':    ['شروط', 'أركان', 'واجبات'],
        'أركان':   ['فروض', 'شروط', 'واجبات'],
        'واجبات':  ['فروض', 'شروط', 'أركان'],
        'حكم':     ['حكمه', 'حكمها', 'يجوز', 'يحرم', 'يستحب'],
        'دليل':    ['دليله', 'الأدلة', 'لقوله', 'لحديث'],
        'أقسام':   ['أنواع', 'أصناف'],
        'أنواع':   ['أقسام', 'أصناف'],
        'سنن':     ['سنة', 'مستحب', 'مندوب'],
        'مكروه':   ['مكروهات', 'يكره'],
        'مبطلات':  ['نواقض', 'يبطل', 'ينقض'],
        'نواقض':   ['مبطلات', 'ينقض', 'يبطل'],
        'صلاة':    ['الصلاة', 'يصلي', 'مصلي', 'صلاته'],
        'زكاة':    ['الزكاة', 'يزكي', 'زكاته'],
        'صيام':    ['الصيام', 'يصوم', 'صائم', 'صومه'],
        'حج':      ['الحج', 'يحج', 'حاج', 'حجه'],
        'وضوء':    ['الوضوء', 'توضأ', 'يتوضأ'],
        'طهارة':   ['تطهر', 'طاهر', 'نجاسة'],
        'نكاح':    ['زواج', 'تزويج'],
        'طلاق':    ['طلق', 'يطلق', 'مطلقة'],
        'بيع':     ['شراء', 'يبيع', 'بائع'],
        'ربا':     ['ربوي', 'فائدة'],
        'جماعة':   ['الجماعة', 'جمعة', 'الجمعة'],
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
      ]);

      const keywords = cleanQuery
        .replace(/[؟?!،,.]/g, '')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w));

      // Strip ال prefix for root matching
      const rootKeywords = keywords
        .map(w => w.replace(/^(ال|وال|بال|فال|كال|لل)/, ''))
        .filter(w => w.length >= 2);

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

      // Simple query runner - NO scoring in SQL (prevents timeout)
      const runQuery = async (conditions, params, limit = nResults) => {
        let sql = `
          SELECT tc.content, tc.page_start, tc.page_end, tc.book_id,
                 b.title as book_title, b.author as book_author
          FROM text_chunks tc
          JOIN books b ON tc.book_id = b.id
          WHERE (${conditions})
        `;
        if (bookId) { sql += ' AND tc.book_id = ?'; params.push(bookId); }
        sql += ` LIMIT ${limit}`;
        const [rows] = await pool.execute(sql, params);
        return rows;
      };

      // ════════════════════════════════════════
      // ── تطابق تام (Exact Match) ──
      // ════════════════════════════════════════
      if (searchType === 'exact') {
        const rows = await runQuery(
          `${col} LIKE ?`,
          [`%${cleanQuery}%`],
          nResults
        );
        return mapRows(rows);
      }

      if (rootKeywords.length === 0) return [];

      // ════════════════════════════════════════
      // ── بحث بالجذر (Root) ──
      // يبحث بالكلمات المجردة من "ال" بدون مرادفات
      // ════════════════════════════════════════
      if (searchType === 'root') {
        // محاولة 1: كل الكلمات معاً (AND)
        const andCond = rootKeywords.map(() => `${col} LIKE ?`).join(' AND ');
        const andParams = rootKeywords.map(k => `%${k}%`);
        const andRows = await runQuery(andCond, andParams, nResults);

        if (andRows.length >= 5) return mapRows(andRows);

        // محاولة 2: أي كلمة (OR) لتكملة النتائج
        const orCond = rootKeywords.map(() => `${col} LIKE ?`).join(' OR ');
        const orParams = rootKeywords.map(k => `%${k}%`);
        const orRows = await runQuery(orCond, orParams, nResults);

        // دمج بدون تكرار
        const seen = new Set(andRows.map(r => `${r.book_id}_${r.page_start}`));
        const combined = [...andRows];
        for (const row of orRows) {
          const key = `${row.book_id}_${row.page_start}`;
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(row);
          }
        }
        return mapRows(combined.slice(0, nResults));
      }

      // ════════════════════════════════════════
      // ── بحث موضوعي (Thematic - Default) ──
      // يوسع البحث بالمرادفات الفقهية
      // ════════════════════════════════════════

      // بناء مجموعات البحث: لكل كلمة = [الكلمة الأصلية + مرادفاتها]
      const keywordGroups = rootKeywords.map(k => {
        const group = [k];
        if (fiqhSynonyms[k]) {
          group.push(...fiqhSynonyms[k]);
        }
        return group;
      });

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

      // المستوى 1: كل الكلمات الأصلية معاً (AND) — سريع ودقيق
      {
        const cond = rootKeywords.map(() => `${col} LIKE ?`).join(' AND ');
        const params = rootKeywords.map(k => `%${k}%`);
        const rows = await runQuery(cond, params, nResults);
        addUnique(rows);
      }

      // المستوى 2: مرادفات مع باقي الكلمات (استبدال كلمة واحدة في كل مرة)
      // هذا ما يميز البحث الموضوعي عن بحث الجذر
      if (allResults.length < nResults) {
        for (let i = 0; i < keywordGroups.length && allResults.length < nResults; i++) {
          const syns = keywordGroups[i];
          if (syns.length <= 1) continue; // لا مرادفات لهذه الكلمة

          // لكل مرادف، ابحث عنه مع باقي الكلمات الأصلية
          for (let s = 1; s < syns.length && allResults.length < nResults; s++) {
            const otherKeywords = rootKeywords.filter((_, idx) => idx !== i);
            if (otherKeywords.length === 0) {
              // كلمة واحدة فقط: ابحث بالمرادف وحده
              const rows = await runQuery(
                `${col} LIKE ?`,
                [`%${syns[s]}%`],
                nResults - allResults.length
              );
              addUnique(rows);
            } else {
              const cond = [
                `${col} LIKE ?`,
                ...otherKeywords.map(() => `${col} LIKE ?`)
              ].join(' AND ');
              const params = [
                `%${syns[s]}%`,
                ...otherKeywords.map(k => `%${k}%`)
              ];
              const rows = await runQuery(cond, params, nResults - allResults.length);
              addUnique(rows);
            }
          }
        }
      }

      // المستوى 3: أي كلمة أو مرادفاتها (OR) — لملء النتائج
      if (allResults.length < nResults) {
        // جمع كل الكلمات والمرادفات
        const allTerms = [];
        for (const group of keywordGroups) {
          for (const term of group) {
            if (!allTerms.includes(term)) allTerms.push(term);
          }
        }
        const cond = allTerms.map(() => `${col} LIKE ?`).join(' OR ');
        const params = allTerms.map(t => `%${t}%`);
        const rows = await runQuery(cond, params, nResults + 10);
        addUnique(rows);
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
