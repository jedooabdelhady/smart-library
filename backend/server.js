const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/database');
const vectorStore = require('./services/vectorStore');
const ragEngine = require('./services/ragEngine');

// Routes
const booksRouter = require('./routes/books');
const adminRouter = require('./routes/admin');
const chatRouter = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
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

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/books', booksRouter);
app.use('/api/admin', adminRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'المكتبة الدينية الذكية - الخادم يعمل',
    timestamp: new Date().toISOString(),
  });
});

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('خطأ:', err.message);
  res.status(500).json({
    error: 'حدث خطأ في الخادم',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const startServer = async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     المكتبة الدينية الذكية              ║');
  console.log('║     Smart Religious Library              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  console.log('📦 جاري إعداد قاعدة البيانات...');
  await initDatabase();

  // Initialize vector store
  console.log('🧠 جاري إعداد قاعدة المتجهات...');
  await vectorStore.initialize();

  // Initialize RAG engine
  console.log('🤖 جاري إعداد محرك الذكاء الاصطناعي...');
  await ragEngine.initialize();

  app.listen(PORT, () => {
    console.log('');
    console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📚 API: http://localhost:${PORT}/api`);
    console.log(`❤️  الواجهة: http://localhost:3000`);
    console.log('');
  });
};

startServer().catch(console.error);
