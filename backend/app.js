const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const booksRouter = require('./routes/books');
const adminRouter = require('./routes/admin');
const chatRouter = require('./routes/chat');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files only when running locally (Vercel uses /tmp, no static serving needed)
if (!process.env.VERCEL) {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

app.use('/api/books', booksRouter);
app.use('/api/admin', adminRouter);
app.use('/api/chat', chatRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'المكتبة الدينية الذكية - الخادم يعمل',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM books');
    res.json({ success: true, count: rows[0].count, env: { DB_HOST: process.env.DB_HOST, DB_USER: process.env.DB_USER, DB_NAME: process.env.DB_NAME } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: error.code, env: { DB_HOST: process.env.DB_HOST, DB_USER: process.env.DB_USER, DB_NAME: process.env.DB_NAME } });
  }
});

app.use((err, req, res, next) => {
  console.error('خطأ:', err.message);
  res.status(500).json({
    error: 'حدث خطأ في الخادم',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

module.exports = app;
