require('dotenv').config();
const vectorStore = require('./services/vectorStore');

async function test() {
  await vectorStore.initialize();
  const question = 'ما هي شروط الصلاة';
  
  const contexts = await vectorStore.search(question, { nResults: 8 });
  console.log(`Found ${contexts.length} contexts.`);
  contexts.forEach((c, i) => {
    console.log(`\n--- Context ${i + 1} (Page ${c.metadata.pageStart}) ---`);
    console.log(c.content);
  });
  
  process.exit(0);
}
test().catch(console.error);
