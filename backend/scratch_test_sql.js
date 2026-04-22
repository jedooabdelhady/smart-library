const { pool } = require('./config/database');

async function test() {
  const query = "حكم مسابقة الامام في الصلاة";
  const keywords = ["حكم", "مسابقة", "الامام", "الصلاة"];
  
  const exactPhrases = ["مسابقة الامام", "الامام الصلاة", "حكم مسابقة"];
  
  let orderCols = [];
  
  exactPhrases.forEach(p => {
    orderCols.push(`(IFNULL(tc.content_clean, tc.content) LIKE ?) * 5`);
  });
  
  keywords.forEach(k => {
    orderCols.push(`(IFNULL(tc.content_clean, tc.content) LIKE ?)`);
  });
  
  const whereExpr = keywords.map(() => `IFNULL(tc.content_clean, tc.content) LIKE ?`).join(' OR ');
  
  const orderParams = [];
  exactPhrases.forEach(p => orderParams.push(`%${p}%`));
  keywords.forEach(k => orderParams.push(`%${k}%`));
  
  const whereParams = [];
  keywords.forEach(k => whereParams.push(`%${k}%`));
  
  const finalSql = `
    SELECT tc.book_id, tc.page_start, tc.content, (${orderCols.join(' + ')}) as score
    FROM text_chunks tc
    WHERE (${whereExpr})
    ORDER BY score DESC
    LIMIT 10
  `;
  
  const finalParams = [...whereParams, ...orderParams];
  
  console.log('Testing sorting in SQL...');
  
  try {
    const [rows] = await pool.execute(finalSql, finalParams);
    rows.forEach(r => {
      console.log(`Score: ${r.score} | Book: ${r.book_id}, Page: ${r.page_start}`);
      console.log(r.content.substring(0, 150).replace(/\n/g, ' '));
      console.log('---');
    });
  } catch (e) {
    console.error(e);
  }
  process.exit();
}

test();
