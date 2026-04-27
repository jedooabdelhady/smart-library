const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Lazy-load ragEngine so @langchain/openai is not required at startup
let _ragEngine = null;
function getRagEngine() {
  if (!_ragEngine) _ragEngine = require('../services/ragEngine');
  return _ragEngine;
}

/**
 * POST /api/chat - إرسال سؤال للمساعد الذكي
 */
router.post('/', async (req, res) => {
  try {
    const { message, bookId, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }

    const sid = sessionId || uuidv4();

    // Save user message
    try {
      await pool.execute(
        'INSERT INTO chat_history (session_id, role, content, book_id) VALUES (?, ?, ?, ?)',
        [sid, 'user', message, bookId || null]
      );
    } catch (e) {}

    // Get AI answer
    const result = await getRagEngine().answer(message, bookId);

    // Save AI response
    try {
      await pool.execute(
        'INSERT INTO chat_history (session_id, role, content, book_id, sources) VALUES (?, ?, ?, ?, ?)',
        [sid, 'assistant', result.answer, bookId || null, JSON.stringify(result.sources)]
      );
    } catch (e) {}

    res.json({
      answer: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      sessionId: sid,
    });
  } catch (error) {
    console.error('خطأ في المحادثة:', error);
    res.status(500).json({
      error: 'حدث خطأ في معالجة السؤال',
      answer: 'عذراً، حدث خطأ تقني. يرجى المحاولة مرة أخرى.',
      sources: [],
    });
  }
});

/**
 * POST /api/chat/summarize - تلخيص فصل
 */
router.post('/summarize', async (req, res) => {
  try {
    const { bookId, chapter } = req.body;

    if (!bookId || !chapter) {
      return res.status(400).json({ error: 'معرف الكتاب والفصل مطلوبان' });
    }

    const result = await getRagEngine().summarize(bookId, chapter);
    res.json(result);
  } catch (error) {
    console.error('خطأ في التلخيص:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chat/compare - مقارنة آراء
 */
router.post('/compare', async (req, res) => {
  try {
    const { topic, bookIds } = req.body;

    if (!topic || !bookIds || bookIds.length < 2) {
      return res.status(400).json({ error: 'الموضوع وكتابين على الأقل مطلوبان' });
    }

    const result = await getRagEngine().compare(topic, bookIds);
    res.json(result);
  } catch (error) {
    console.error('خطأ في المقارنة:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
