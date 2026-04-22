require('dotenv').config();
const { pool } = require('./config/database');
async function test() {
  const query = 'ما هي شروط الصلاة';
  const stripDiacritics = (s) => s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const cleanQuery = stripDiacritics(query);
  const stopWords = new Set(['ما', 'هي', 'هو', 'في', 'من']);
  const keywords = cleanQuery.replace(/[؟?!،,.]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  console.log('Keywords:', keywords);
  const exactPhrases = [keywords.join(' ')];
  const col = 'IFNULL(tc.content_clean, tc.content)';
  const exactConditions = exactPhrases.map(() => `${col} LIKE ?`).join(' OR ');
  console.log('Cond:', exactConditions);
  const [rows] = await pool.execute(`SELECT page_start, content FROM text_chunks tc WHERE ${exactConditions} LIMIT 2`, exactPhrases.map(p => `%${p}%`));
  console.log('Rows:', rows.map(r => r.page_start));
  process.exit(0);
}
test().catch(console.error);
