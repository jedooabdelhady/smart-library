require('dotenv').config();

const { initDatabase } = require('../backend/config/database');
const vectorStore = require('../backend/services/vectorStore');
const ragEngine = require('../backend/services/ragEngine');
const app = require('../backend/app');

// Module-level promise so initialization runs once per function instance (cold start)
let initPromise = null;

const ensureInitialized = () => {
  if (!initPromise) {
    initPromise = (async () => {
      await initDatabase();
      await vectorStore.initialize();
      await ragEngine.initialize();
    })().catch((err) => {
      // Reset so next request retries if init failed
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
};

module.exports = async (req, res) => {
  await ensureInitialized();
  return app(req, res);
};
