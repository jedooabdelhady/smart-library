require('dotenv').config();

let app;
try {
  app = require('../backend/app');
} catch (error) {
  console.error('App init error:', error);
  app = (req, res) => {
    res.status(500).json({ error: 'App failed to load', details: error.stack });
  };
}

// Initialize DB/services in the background — never block requests
let bgStarted = false;
function startBgInit() {
  if (bgStarted) return;
  bgStarted = true;
  Promise.resolve()
    .then(async () => {
      const { initDatabase } = require('../backend/config/database');
      const vectorStore = require('../backend/services/vectorStore');
      const ragEngine = require('../backend/services/ragEngine');
      await initDatabase();
      await vectorStore.initialize();
      await ragEngine.initialize();
      console.log('✅ Background initialization complete');
    })
    .catch((err) => {
      console.error('Background init error:', err.message);
      bgStarted = false; // allow retry on next request
    });
}

module.exports = (req, res) => {
  try {
    startBgInit();
    app(req, res);
  } catch (err) {
    console.error('Handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  }
};
