const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load production environment variables
dotenv.config({ path: path.join(__dirname, '.env.production') });

const { pool } = require('./config/database');
const textExtractor = require('./services/textExtractor');
const vectorStore = require('./services/vectorStore');
const TextSplitter = require('./services/textSplitter');

const BOOKS_DIR = path.join(__dirname, '..', 'new_books');

// Strip Arabic diacritics for search
const stripDiacritics = (text) => {
  if (!text) return '';
  return text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
};

const cleanFileName = (name) => {
  return name.replace(/\.(epub|pdf|docx|doc)$/i, '').replace(/-\s*\(\d+\)/g, '').replace(/-\s*$/, '').trim();
};

async function uploadBooks() {
  console.log('🚀 بدء عملية رفع الكتب إلى قاعدة البيانات...');
  
  if (!fs.existsSync(BOOKS_DIR)) {
    console.error(`❌ المجلد غير موجود: ${BOOKS_DIR}`);
    process.exit(1);
  }

  const allowedExts = ['.epub', '.pdf', '.docx', '.doc'];
  const files = fs.readdirSync(BOOKS_DIR).filter(f => allowedExts.includes(path.extname(f).toLowerCase()));
  console.log(`📁 تم العثور على ${files.length} كتاب في المجلد.`);

  for (const file of files) {
    const filePath = path.join(BOOKS_DIR, file);
    const rawTitle = cleanFileName(file);
    const fileExt = path.extname(file).toLowerCase();
    
    // Check for duplicates
    try {
      const [existing] = await pool.execute('SELECT id FROM books WHERE title LIKE ?', [`%${rawTitle}%`]);
      if (existing.length > 0) {
        console.log(`⏭️ تخطي الكتاب: "${rawTitle}" - موجود مسبقاً في قاعدة البيانات.`);
        continue;
      }
    } catch (e) {
      console.error('خطأ في التحقق من وجود الكتاب:', e.message);
    }

    console.log(`\n📚 جاري معالجة الكتاب: "${rawTitle}"`);
    
    try {
      console.log('📄 استخراج النص...');
      const extracted = await textExtractor.extract(filePath);
      
      if (!extracted.pages || extracted.pages.length === 0) {
        console.log('⚠️ لم يتم العثور على نص مفيد في الكتاب.');
        continue;
      }

      console.log(`📖 تم استخراج ${extracted.pages.length} صفحة. حفظ في قاعدة البيانات...`);

      // Determine category (optional - default to general or null)
      let categoryId = null;

      // Insert book
      const [result] = await pool.execute(
        'INSERT INTO books (title, author, category_id, file_path, file_type, pages_count) VALUES (?, ?, ?, ?, ?, ?)',
        [rawTitle, 'غير محدد', categoryId, '', fileExt, extracted.totalPages]
      );
      const bookId = result.insertId;

      // Save pages in batches
      const BATCH_SIZE = 1000;
      let savedPages = 0;
      for (let i = 0; i < extracted.pages.length; i += BATCH_SIZE) {
        const batch = extracted.pages.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '(?, ?, ?)').join(',');
        const values = [];
        batch.forEach(page => {
          values.push(bookId, page.number, page.content);
        });
        
        try {
          await pool.execute(
            `INSERT INTO book_pages (book_id, page_number, content) VALUES ${placeholders}`,
            values
          );
          savedPages += batch.length;
        } catch (e) {
          console.error('خطأ في حفظ دفعة صفحات:', e.message);
        }
      }

      // Split text
      console.log('✂️ تقسيم النص للبحث...');
      const splitter = new TextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
      const chunks = splitter.splitPages(extracted.pages, bookId);
      
      // Save chunks in batches
      console.log(`💾 حفظ ${chunks.length} جزء نصي...`);
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
        const values = [];
        batch.forEach(chunk => {
          const cleanContent = stripDiacritics(chunk.content);
          values.push(bookId, chunk.index, chunk.content, cleanContent, chunk.pageStart, chunk.pageEnd);
        });

        try {
          await pool.execute(
            `INSERT INTO text_chunks (book_id, chunk_index, content, content_clean, page_start, page_end) VALUES ${placeholders}`,
            values
          );
        } catch (e) {
          console.error('خطأ في حفظ دفعة أجزاء:', e.message);
        }
      }

      // Mark as indexed
      await pool.execute('UPDATE books SET indexed = TRUE WHERE id = ?', [bookId]);
      
      console.log(`✅ تمت إضافة الكتاب "${rawTitle}" بنجاح!`);

    } catch (err) {
      console.error(`❌ فشل معالجة الكتاب "${rawTitle}":`, err.message);
    }
  }

  console.log('\n🎉 اكتملت عملية الرفع بالكامل!');
  process.exit(0);
}

uploadBooks();
