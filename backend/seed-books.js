/**
 * ═══════════════════════════════════════════════════════
 *  مستورد الكتب الجماعي — المكتبة الدينية الذكية
 * ═══════════════════════════════════════════════════════
 *
 *  الاستخدام:
 *    node seed-books.js
 *
 *  ضع ملفات EPUB في المصفوفة BOOKS أدناه مع بيانات كل كتاب.
 *  أو ضع جميع ملفات EPUB في مجلد واحد وعدّل EPUB_FOLDER.
 *
 *  يدعم: .epub و .pdf و .docx
 * ═══════════════════════════════════════════════════════
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────
//  إعداد — عدّل هذه القائمة لإضافة كتبك
// ────────────────────────────────────────────────────────

// المجلد الذي تضع فيه كتبك (اختياري — بديل عن BOOKS)
// إذا كانت فارغة سيستخدم القائمة BOOKS التالية
const EPUB_FOLDER = '';

// قائمة الكتب المراد استيرادها
// المسار يمكن أن يكون مطلقاً أو نسبياً من هذا الملف
const BOOKS = [
  {
    file: 'C:\\Users\\hp\\Downloads\\المغني لابن قدامة - (1).epub',
    title: 'المغني',
    author: 'ابن قدامة - تحقيق التركي',
    category: 'fiqh',
    description: 'أحد أهم موسوعات الفقه الحنبلي وأوسعها، للإمام موفق الدين ابن قدامة المقدسي',
  },
  {
    file: 'C:\\Users\\hp\\Downloads\\شرح الزركشي على مختصر الخرقي -.epub',
    title: 'شرح الزركشي على مختصر الخرقي',
    author: 'الزركشي الحنبلي',
    category: 'fiqh',
    description: 'شرح مفصل على مختصر الخرقي في الفقه الحنبلي',
  },
  {
    file: 'C:\\Users\\hp\\Downloads\\الممتع في شرح المقنع ت ابن دهيش ط 3 -.epub',
    title: 'الممتع في شرح المقنع',
    author: 'زين الدين المُنَجَّى',
    category: 'fiqh',
    description: 'شرح على كتاب المقنع في الفقه الحنبلي لابن قدامة',
  },
  {
    file: 'C:\\Users\\hp\\Downloads\\الوجيز في الفقه على مذهب الإمام أحمد بن حنبل.epub',
    title: 'الوجيز في الفقه على مذهب الإمام أحمد بن حنبل',
    author: 'الحسين بن يوسف الدجيلي',
    category: 'fiqh',
    description: 'متن موجز في الفقه الحنبلي',
  },
];

// ────────────────────────────────────────────────────────
//  خرائط التصنيفات
// ────────────────────────────────────────────────────────
const CATEGORY_NAMES = {
  quran:   'علوم القرآن',
  hadith:  'الحديث الشريف',
  fiqh:    'الفقه الإسلامي',
  aqeedah: 'العقيدة',
  seerah:  'السيرة النبوية',
  tafsir:  'التفسير',
  history: 'التاريخ الإسلامي',
  arabic:  'اللغة العربية',
};

// ────────────────────────────────────────────────────────
//  أدوات النص
// ────────────────────────────────────────────────────────
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
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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
        for (const p of parts) { if (p.trim()) next.push(p.trim()); }
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
          chunks.push({ index: chunkIndex++, content: buffer, pageStart: page.number, pageEnd: page.number, bookId });
        }
        buffer = buffer.slice(-overlap) + ' ' + seg;
        buffer = buffer.trim();
      }
    }
    if (buffer.length >= 30) {
      chunks.push({ index: chunkIndex++, content: buffer, pageStart: page.number, pageEnd: page.number, bookId });
    }
  }
  return chunks;
}

// ────────────────────────────────────────────────────────
//  استخراج EPUB
// ────────────────────────────────────────────────────────
async function extractEPUB(filePath) {
  const { EPub } = require('epub2');
  const epub = await EPub.createAsync(filePath, '', '');
  const pages = [];
  let pageNum = 1;
  let processed = 0;
  process.stdout.write(`   📖 ${epub.flow.length} فصل — `);
  for (const chapter of epub.flow) {
    if (!chapter.id) continue;
    try {
      const rawHtml = await epub.getChapterAsync(chapter.id);
      const text = stripHTML(rawHtml);
      const cleaned = cleanText(text);
      if (cleaned.length < 30) continue;
      const chapterPages = splitIntoPages(cleaned, 2000);
      for (const p of chapterPages) pages.push({ number: pageNum++, content: p.content });
      processed++;
      process.stdout.write(`\r   📖 معالجة الفصل ${processed}/${epub.flow.length}، الصفحات: ${pages.length}  `);
    } catch (e) {}
  }
  console.log();
  return pages;
}

// ────────────────────────────────────────────────────────
//  استخراج PDF
// ────────────────────────────────────────────────────────
async function extractPDF(filePath) {
  const pdfParse = require('pdf-parse');
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  const rawPages = data.text.split(/\f/);
  let pages = rawPages
    .map((content, i) => ({ number: i + 1, content: cleanText(content) }))
    .filter(p => p.content.length >= 30);
  if (pages.length <= 1 && data.text.length > 2000) {
    pages = splitIntoPages(cleanText(data.text), 2000);
  }
  return pages;
}

// ────────────────────────────────────────────────────────
//  الدالة الرئيسية لاستيراد كتاب واحد
// ────────────────────────────────────────────────────────
async function importBook(pool, bookMeta, uploadsDir) {
  const filePath = bookMeta.file;
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`📚 استيراد: ${bookMeta.title}`);
  console.log(`   المؤلف: ${bookMeta.author}`);
  console.log(`   الملف: ${baseName}`);

  // التحقق من وجود الملف
  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ الملف غير موجود: ${filePath}`);
    return false;
  }

  // التحقق من عدم التكرار
  const [existing] = await pool.execute('SELECT id FROM books WHERE title = ?', [bookMeta.title]);
  if (existing.length > 0) {
    console.log(`   ⏭️  الكتاب موجود بالفعل (ID: ${existing[0].id}) — تم التخطي`);
    return false;
  }

  // نسخ الملف إلى uploads
  const destName = `book-${Date.now()}${ext}`;
  const destPath = path.join(uploadsDir, destName);
  fs.copyFileSync(filePath, destPath);

  // الحصول على ID التصنيف
  let categoryId = null;
  try {
    const [cats] = await pool.execute('SELECT id FROM categories WHERE slug = ?', [bookMeta.category || 'fiqh']);
    if (cats.length > 0) categoryId = cats[0].id;
  } catch (e) {}

  // استخراج النص
  console.log(`   📄 استخراج النص...`);
  let pages = [];
  try {
    if (ext === '.epub') pages = await extractEPUB(destPath);
    else if (ext === '.pdf') pages = await extractPDF(destPath);
    else {
      console.error(`   ❌ نوع الملف غير مدعوم: ${ext}`);
      return false;
    }
  } catch (e) {
    console.error(`   ❌ فشل الاستخراج: ${e.message}`);
    return false;
  }

  if (pages.length === 0) {
    console.error(`   ❌ لم يُستخرج أي محتوى`);
    return false;
  }
  console.log(`   ✅ ${pages.length} صفحة`);

  // إدراج الكتاب
  const [bookResult] = await pool.execute(
    'INSERT INTO books (title, author, category_id, file_path, file_type, pages_count, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [bookMeta.title, bookMeta.author, categoryId, destPath, ext, pages.length, bookMeta.description || '']
  );
  const bookId = bookResult.insertId;
  console.log(`   💾 ID الكتاب: ${bookId}`);

  // إدراج الصفحات
  process.stdout.write(`   📖 حفظ الصفحات...`);
  for (let i = 0; i < pages.length; i++) {
    try {
      await pool.execute(
        'INSERT INTO book_pages (book_id, page_number, content) VALUES (?, ?, ?)',
        [bookId, pages[i].number, pages[i].content]
      );
    } catch (e) {}
    if ((i + 1) % 100 === 0) process.stdout.write(`\r   📖 الصفحات: ${i + 1}/${pages.length}  `);
  }
  console.log(`\r   ✅ ${pages.length} صفحة محفوظة`);

  // تقسيم إلى أجزاء
  const chunks = splitIntoChunks(pages, bookId, 1000, 200);
  process.stdout.write(`   ✂️  حفظ ${chunks.length} جزء نصي...`);
  for (let i = 0; i < chunks.length; i++) {
    try {
      await pool.execute(
        'INSERT INTO text_chunks (book_id, chunk_index, content, page_start, page_end) VALUES (?, ?, ?, ?, ?)',
        [bookId, chunks[i].index, chunks[i].content, chunks[i].pageStart, chunks[i].pageEnd]
      );
    } catch (e) {}
    if ((i + 1) % 200 === 0) process.stdout.write(`\r   ✂️  الأجزاء: ${i + 1}/${chunks.length}  `);
  }
  console.log(`\r   ✅ ${chunks.length} جزء محفوظ`);

  // تحديث indexed
  try { await pool.execute('UPDATE books SET indexed = TRUE WHERE id = ?', [bookId]); } catch (_) {}

  console.log(`   🎉 اكتمل استيراد: ${bookMeta.title}`);
  return true;
}

// ────────────────────────────────────────────────────────
//  الدالة الرئيسية
// ────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(52));
  console.log('  مستورد الكتب الجماعي — المكتبة الدينية الذكية');
  console.log('═'.repeat(52));

  // تحضير قائمة الكتب
  let booksList = [...BOOKS];

  // إضافة كتب من المجلد (إن وُجد)
  if (EPUB_FOLDER && fs.existsSync(EPUB_FOLDER)) {
    const files = fs.readdirSync(EPUB_FOLDER).filter(f => /\.(epub|pdf)$/i.test(f));
    console.log(`\n📂 وجدت ${files.length} ملف في المجلد: ${EPUB_FOLDER}`);
    for (const f of files) {
      const alreadyAdded = booksList.some(b => path.basename(b.file) === f);
      if (!alreadyAdded) {
        const nameNoExt = path.basename(f, path.extname(f));
        booksList.push({
          file: path.join(EPUB_FOLDER, f),
          title: nameNoExt,
          author: 'غير محدد',
          category: 'fiqh',
          description: '',
        });
      }
    }
  }

  // تصفية الكتب الموجودة فعلاً
  booksList = booksList.filter(b => {
    if (!fs.existsSync(b.file)) {
      console.log(`⚠️  ملف غير موجود، سيُتخطى: ${b.file}`);
      return false;
    }
    return true;
  });

  if (booksList.length === 0) {
    console.log('\n❌ لا توجد كتب للاستيراد.');
    console.log('   عدّل قائمة BOOKS في أعلى الملف وأضف مسارات ملفاتك.\n');
    process.exit(0);
  }

  console.log(`\n✅ ${booksList.length} كتاب سيتم استيرادهم\n`);

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
    await pool.execute('SELECT 1');
    console.log('✅ اتصال MySQL ناجح');
  } catch (err) {
    console.error('❌ فشل الاتصال بـ MySQL:', err.message);
    process.exit(1);
  }

  // إنشاء مجلد uploads
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // إنشاء الجداول
  try {
    const conn = await pool.getConnection();
    await conn.execute(`CREATE TABLE IF NOT EXISTS categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, slug VARCHAR(100) UNIQUE NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS books (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(500) NOT NULL, author VARCHAR(300), category_id INT, file_path VARCHAR(1000), file_type VARCHAR(20), pages_count INT DEFAULT 0, indexed BOOLEAN DEFAULT FALSE, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS book_pages (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, page_number INT NOT NULL, content LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_book_page (book_id, page_number)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS text_chunks (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, chunk_index INT NOT NULL, content LONGTEXT, page_start INT, page_end INT, vector_id VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_book_chunk (book_id, chunk_index)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const cats = [['علوم القرآن','quran'],['الحديث الشريف','hadith'],['الفقه الإسلامي','fiqh'],['العقيدة','aqeedah'],['السيرة النبوية','seerah'],['التفسير','tafsir'],['التاريخ الإسلامي','history'],['اللغة العربية','arabic']];
    for (const [name, slug] of cats) {
      await conn.execute('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
    }
    conn.release();
  } catch (e) {
    console.error('⚠️  تحذير إعداد الجداول:', e.message);
  }

  // استيراد الكتب واحداً تلو الآخر
  let success = 0, failed = 0, skipped = 0;

  for (const bookMeta of booksList) {
    const result = await importBook(pool, bookMeta, uploadsDir);
    if (result === true) success++;
    else if (result === false) {
      const [chk] = await pool.execute('SELECT id FROM books WHERE title = ?', [bookMeta.title]);
      if (chk.length > 0) skipped++;
      else failed++;
    }
  }

  await pool.end();

  // ملخص النتائج
  console.log('\n' + '═'.repeat(52));
  console.log('✅ اكتمل الاستيراد!');
  console.log('═'.repeat(52));
  console.log(`  نجح:    ${success} كتاب`);
  console.log(`  موجود:  ${skipped} كتاب (تم تخطيه)`);
  console.log(`  فشل:    ${failed} كتاب`);
  console.log('\n🚀 أعد تشغيل الخادم إذا كان يعمل بالفعل لتفعيل التغييرات.\n');
}

main().catch(err => {
  console.error('\n❌ خطأ غير متوقع:', err.message);
  console.error(err.stack);
  process.exit(1);
});
