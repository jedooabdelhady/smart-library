const vectorStore = require('./services/vectorStore');

async function test() {
  await vectorStore.initialize();
  console.log("Initialized");
  const resExact = await vectorStore.search("الصلاة", { searchType: 'exact', nResults: 2 });
  console.log("Exact:", resExact.length);
  const resThem = await vectorStore.search("الصلاة", { searchType: 'thematic', nResults: 2 });
  console.log("Them:", resThem.length);
  const resRoot = await vectorStore.search("الصلاة", { searchType: 'root', nResults: 2 });
  console.log("Root:", resRoot.length);
  process.exit(0);
}

test().catch(console.error);
