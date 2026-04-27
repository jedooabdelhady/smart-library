const express = require('express');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/database');
const vectorStore = require('./services/vectorStore');
const ragEngine = require('./services/ragEngine');
const app = require('./app');

const PORT = process.env.PORT || 5000;

// Serve React frontend in production (Render/Railway — Vercel serves frontend statically)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));
  // Express v5 requires named wildcard param
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
  });
}

const startServer = async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     المكتبة الدينية الذكية              ║');
  console.log('║     Smart Religious Library              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  console.log('📦 جاري إعداد قاعدة البيانات...');
  await initDatabase();

  console.log('🧠 جاري إعداد قاعدة المتجهات...');
  await vectorStore.initialize();

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
