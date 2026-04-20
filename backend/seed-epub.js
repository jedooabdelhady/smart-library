/**
 * سكريبت استيراد كتاب EPUB مباشرة في قاعدة البيانات
 * الاستخدام: node seed-epub.js
 *
 * المتطلبات:
 *  - MySQL يعمل على localhost:3306
 *  - قاعدة بيانات smart_library موجودة (أو تشغيل الخادم مرة واحدة لإنشائها)
 *  - ملف .env موجود في نفس المجلد
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────────
// إعدادات الكتاب
// ────────────────────────────────────────────────────────────
const EPUB_SOURCE = 'C:\\Users\\hp\\Downloads\\الروض المربع شرح زاد المستقنع.epub';
const BOOK_META = {
  title: 'الروض المربع شرح زاد المستقنع',
  author: 'منصور بن يونس البهوتي',
  category: 'fiqh',   // slug في جدول categories
  description: 'شرح مختصر على كتاب زاد المستقنع في اختصار المقنع، من أشهر متون الفقه الحنبلي',
};

// ────────────────────────────────────────────────────────────
// أداة تقسيم النص العربي (مطابقة لـ textSplitter.js)
// ────────────────────────────────────────────────────────────
function splitIntoChunks(pages, bookId, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.content;
    if (!text || text.length < 30) continue;

    const separators = ['\nالباب', '\nالفصل', '\nالمبحث', '\nالمسألة', '\n\n', '\n', '. '];

    let segments = [text];
    for (const sep of separators) {
      const next = [];
      for (const seg of segments) {
        if (seg.length <= chunkSize) { next.push(seg); continue; }
        const parts = seg.split(sep);
        for (const p of parts) {
          if (p.trim()) next.push(p.trim());
        }
      }
      segments = next;
      if (segments.every(s => s.length <= chunkSize)) break;
    }

    let buffer = '';
    for (const seg of segments) {
      if ((buffer + ' ' + seg).trim().length <= chunkSize) {
        buffer = (buffer + ' ' + seg).trim();
      } else {
        if (buffer.length >= 30) {
          chunks.push({
            index: chunkIndex++,
            content: buffer,
            pageStart: page.number,
            pageEnd: page.number,
            bookId,
          });
        }
        // Overlap: carry last `overlap` chars into next chunk
        buffer = buffer.slice(-overlap) + ' ' + seg;
        buffer = buffer.trim();
      }
    }
    if (buffer.length >= 30) {
      chunks.push({
        index: chunkIndex++,
        content: buffer,
        pageStart: page.number,
        pageEnd: page.number,
        bookId,
      });
      buffer = '';
    }
  }

  return chunks;
}

// ────────────────────────────────────────────────────────────
// استخراج نص EPUB
// ────────────────────────────────────────────────────────────
function stripHTML(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&[a-z]+;/g, ' ');
}

function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +| +$/gm, '')
    .trim();
}

function splitIntoPages(text, charsPerPage = 2000) {
  const pages = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';
  let num = 1;
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > charsPerPage && current) {
      pages.push({ number: num++, content: current.trim() });
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) pages.push({ number: num, content: current.trim() });
  return pages;
}

async function extractEPUB(filePath) {
  const { EPub } = require('epub2');
  console.log('📖 فتح ملف EPUB...');
  const epub = await EPub.createAsync(filePath, '', '');

  const pages = [];
  let pageNum = 1;
  let chaptersProcessed = 0;

  console.log(`📚 عدد الفصول: ${epub.flow.length}`);

  for (const chapter of epub.flow) {
    if (!chapter.id) continue;
    try {
      const rawHtml = await epub.getChapterAsync(chapter.id);
      const text = stripHTML(rawHtml);
      const cleaned = cleanText(text);
      if (cleaned.length < 30) continue;

      const chapterPages = splitIntoPages(cleaned, 2000);
      for (const p of chapterPages) {
        pages.push({ number: pageNum++, content: p.content });
      }
      chaptersProcessed++;
      process.stdout.write(`\r   تمت معالجة ${chaptersProcessed} فصل، ${pages.length} صفحة`);
    } catch (e) { /* تجاهل الفصول التالفة */ }
  }

  console.log('\n');
  return pages;
}

// ────────────────────────────────────────────────────────────
// الدالة الرئيسية
// ────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  مستورد كتاب EPUB → قاعدة البيانات');
  console.log('═══════════════════════════════════════════════\n');

  // التحقق من وجود الملف
  if (!fs.existsSync(EPUB_SOURCE)) {
    console.error(`❌ الملف غير موجود:\n   ${EPUB_SOURCE}`);
    process.exit(1);
  }
  console.log(`✅ تم العثور على الملف: ${path.basename(EPUB_SOURCE)}\n`);

  // نسخ الملف إلى مجلد uploads
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const destFile = path.join(uploadsDir, `rawdh-almurba-${Date.now()}.epub`);
  fs.copyFileSync(EPUB_SOURCE, destFile);
  console.log(`📂 تم نسخ الملف إلى: uploads/\n`);

  // الاتصال بقاعدة البيانات
  let pool;
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'smart_library',
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
    const [rows] = await pool.execute('SELECT 1');
    console.log('✅ اتصال MySQL ناجح\n');
  } catch (err) {
    console.error('❌ فشل الاتصال بـ MySQL:', err.message);
    console.log('\nتأكد من:');
    console.log('  1. تشغيل MySQL (XAMPP أو غيره)');
    console.log('  2. وجود قاعدة البيانات smart_library');
    console.log('  3. إعدادات .env صحيحة\n');
    process.exit(1);
  }

  // إنشاء الجداول إن لم تكن موجودة
  console.log('🗄️  إعداد الجداول...');
  try {
    const conn = await pool.getConnection();
    await conn.execute(`CREATE TABLE IF NOT EXISTS categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, slug VARCHAR(100) UNIQUE NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS books (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(500) NOT NULL, author VARCHAR(300), category_id INT, file_path VARCHAR(1000), file_type VARCHAR(20), pages_count INT DEFAULT 0, indexed BOOLEAN DEFAULT FALSE, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS book_pages (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, page_number INT NOT NULL, content LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_book_page (book_id, page_number)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS text_chunks (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, chunk_index INT NOT NULL, content LONGTEXT, page_start INT, page_end INT, vector_id VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_book_chunk (book_id, chunk_index)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Insert default categories
    const cats = [['علوم القرآن','quran'],['الحديث الشريف','hadith'],['الفقه الإسلامي','fiqh'],['العقيدة','aqeedah'],['السيرة النبوية','seerah'],['التفسير','tafsir'],['التاريخ الإسلامي','history'],['اللغة العربية','arabic']];
    for (const [name, slug] of cats) {
      await conn.execute('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
    }
    conn.release();
    console.log('✅ الجداول جاهزة\n');
  } catch (e) {
    console.error('⚠️  تحذير إعداد الجداول:', e.message);
  }

  // الحصول على ID تصنيف الفقه
  let categoryId = null;
  try {
    const [cats] = await pool.execute('SELECT id FROM categories WHERE slug = ?', [BOOK_META.category]);
    if (cats.length > 0) categoryId = cats[0].id;
  } catch (e) {}

  // التحقق من عدم تكرار الكتاب
  try {
    const [existing] = await pool.execute('SELECT id FROM books WHERE title = ?', [BOOK_META.title]);
    if (existing.length > 0) {
      console.log(`⚠️  الكتاب "${BOOK_META.title}" موجود بالفعل (ID: ${existing[0].id})`);
      console.log('   لحذفه وإعادة الاستيراد، شغّل:\n');
      console.log(`   DELETE FROM books WHERE id = ${existing[0].id};\n`);
      await pool.end();
      process.exit(0);
    }
  } catch (e) {}

  // استخراج النص من EPUB
  console.log('📄 استخراج النص من EPUB...');
  const pages = await extractEPUB(destFile);
  console.log(`✅ تم استخراج ${pages.length} صفحة\n`);

  if (pages.length === 0) {
    console.error('❌ لم يتم استخراج أي محتوى من الكتاب');
    await pool.end();
    process.exit(1);
  }

  // إدراج الكتاب في جدول books
  console.log('💾 حفظ بيانات الكتاب...');
  const [bookResult] = await pool.execute(
    'INSERT INTO books (title, author, category_id, file_path, file_type, pages_count, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [BOOK_META.title, BOOK_META.author, categoryId, destFile, '.epub', pages.length, BOOK_META.description]
  );
  const bookId = bookResult.insertId;
  console.log(`✅ تم إنشاء الكتاب (ID: ${bookId})\n`);

  // إدراج الصفحات
  console.log(`📖 حفظ ${pages.length} صفحة...`);
  const pagesBatch = 50;
  for (let i = 0; i < pages.length; i += pagesBatch) {
    const batch = pages.slice(i, i + pagesBatch);
    for (const page of batch) {
      try {
        await pool.execute(
          'INSERT INTO book_pages (book_id, page_number, content) VALUES (?, ?, ?)',
          [bookId, page.number, page.content]
        );
      } catch (e) {}
    }
    process.stdout.write(`\r   ${Math.min(i + pagesBatch, pages.length)}/${pages.length} صفحة`);
  }
  console.log('\n✅ تم حفظ الصفحات\n');

  // تقسيم النص إلى أجزاء
  console.log('✂️  تقسيم النص إلى أجزاء ذكية...');
  const chunks = splitIntoChunks(pages, bookId, 1000, 200);
  console.log(`✅ تم إنشاء ${chunks.length} جزء\n`);

  // إدراج الأجزاء
  console.log(`💾 حفظ ${chunks.length} جزء...`);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      await pool.execute(
        'INSERT INTO text_chunks (book_id, chunk_index, content, page_start, page_end) VALUES (?, ?, ?, ?, ?)',
        [bookId, chunk.index, chunk.content, chunk.pageStart, chunk.pageEnd]
      );
    } catch (e) {}
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r   ${i + 1}/${chunks.length} جزء`);
    }
  }
  console.log(`\r   ${chunks.length}/${chunks.length} جزء`);
  console.log('✅ تم حفظ الأجزاء\n');

  // محاولة الفهرسة في ChromaDB
  console.log('🧠 محاولة الفهرسة في ChromaDB...');
  try {
    const vectorStore = require('./services/vectorStore');
    await vectorStore.initialize();
    await vectorStore.addChunks(chunks, BOOK_META.title, BOOK_META.author);
    await pool.execute('UPDATE books SET indexed = TRUE WHERE id = ?', [bookId]);
    console.log('✅ تم الفهرسة في ChromaDB\n');
  } catch (e) {
    console.log(`⚠️  ChromaDB غير متاح (${e.message})`);
    console.log('   سيعمل البحث النصي كبديل تلقائياً\n');
    // Mark as indexed anyway so the fallback text search works
    try { await pool.execute('UPDATE books SET indexed = TRUE WHERE id = ?', [bookId]); } catch (_) {}
  }

  await pool.end();

  console.log('═══════════════════════════════════════════════');
  console.log('✅ اكتمل الاستيراد بنجاح!');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n   الكتاب: ${BOOK_META.title}`);
  console.log(`   المؤلف: ${BOOK_META.author}`);
  console.log(`   الصفحات: ${pages.length}`);
  console.log(`   الأجزاء: ${chunks.length}`);
  console.log(`   ID في قاعدة البيانات: ${bookId}`);
  console.log('\n🚀 الآن شغّل الخادم وتصفح الموقع لاختبار الذكاء الاصطناعي!\n');
}

main().catch(err => {
  console.error('\n❌ خطأ غير متوقع:', err.message);
  console.error(err.stack);
  process.exit(1);
});
