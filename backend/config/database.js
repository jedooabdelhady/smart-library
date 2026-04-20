const mysql = require('mysql2/promise');
require('dotenv').config();

// TiDB Cloud requires SSL — detect if we're connecting to TiDB
const isTiDB = (process.env.DB_HOST || '').includes('tidbcloud.com');

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || (isTiDB ? 4000 : 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_library',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // SSL required for TiDB Cloud
  ...(isTiDB && {
    ssl: { rejectUnauthorized: true },
  }),
};

const pool = mysql.createPool(poolConfig);

// Initialize database and tables
const initDatabase = async () => {
  try {
    // For TiDB Cloud, database already exists — skip CREATE DATABASE
    if (!isTiDB) {
      const tempConn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
      });
      await tempConn.execute(
        `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'smart_library'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await tempConn.end();
    }

    // Create tables
    const conn = await pool.getConnection();

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        author VARCHAR(300),
        category_id INT,
        file_path VARCHAR(1000),
        file_type VARCHAR(20),
        pages_count INT DEFAULT 0,
        indexed BOOLEAN DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS book_pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        page_number INT NOT NULL,
        content LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        INDEX idx_book_page (book_id, page_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS text_chunks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        chunk_index INT NOT NULL,
        content LONGTEXT,
        content_clean MEDIUMTEXT,
        page_start INT,
        page_end INT,
        embedding_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        INDEX idx_book_chunk (book_id, chunk_index)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(100),
        role ENUM('user', 'assistant') NOT NULL,
        content LONGTEXT NOT NULL,
        book_id INT,
        sources JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insert default categories
    const defaultCategories = [
      ['علوم القرآن', 'quran', 'كتب علوم القرآن الكريم'],
      ['الحديث الشريف', 'hadith', 'كتب الحديث النبوي الشريف'],
      ['الفقه الإسلامي', 'fiqh', 'كتب الفقه والأحكام الشرعية'],
      ['العقيدة', 'aqeedah', 'كتب العقيدة الإسلامية'],
      ['السيرة النبوية', 'seerah', 'كتب سيرة النبي صلى الله عليه وسلم'],
      ['التفسير', 'tafsir', 'كتب تفسير القرآن الكريم'],
      ['التاريخ الإسلامي', 'history', 'كتب التاريخ والحضارة الإسلامية'],
      ['اللغة العربية', 'arabic', 'كتب النحو والصرف والبلاغة'],
    ];

    for (const [name, slug, desc] of defaultCategories) {
      await conn.execute(
        'INSERT IGNORE INTO categories (name, slug, description) VALUES (?, ?, ?)',
        [name, slug, desc]
      );
    }

    conn.release();
    console.log('✅ قاعدة البيانات جاهزة');
  } catch (error) {
    console.error('❌ خطأ في إعداد قاعدة البيانات:', error.message);
    console.log('⚠️ سيعمل الخادم بدون قاعدة بيانات (وضع العرض التوضيحي)');
  }
};

module.exports = { pool, initDatabase };
