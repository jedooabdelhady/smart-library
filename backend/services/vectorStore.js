const { ChromaClient } = require('chromadb');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

/**
 * إدارة قاعدة البيانات المتجهية (ChromaDB)
 */
class VectorStore {
  constructor() {
    this.client = null;
    this.collection = null;
    this.collectionName = 'islamic_library';
    this.initialized = false;
  }

  async initialize() {
    try {
      this.client = new ChromaClient({
        path: process.env.CHROMA_URL || 'http://localhost:8000',
      });

      // Get or create collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: {
          description: 'المكتبة الدينية الذكية - فهرس الكتب',
          'hnsw:space': 'cosine',
        },
      });

      this.initialized = true;
      console.log('✅ قاعدة المتجهات جاهزة');
    } catch (error) {
      console.error('⚠️ لم يتم الاتصال بـ ChromaDB:', error.message);
      console.log('⚠️ سيعمل النظام بوضع البحث النصي البديل');
      this.initialized = false;
    }
  }

  /**
   * إضافة أجزاء نص إلى قاعدة المتجهات
   */
  async addChunks(chunks, bookTitle, bookAuthor) {
    if (!this.initialized) {
      console.log('⚠️ ChromaDB غير متصل - تخطي الفهرسة المتجهية');
      return chunks.map((c, i) => ({ ...c, vectorId: `local_${i}` }));
    }

    try {
      const ids = [];
      const documents = [];
      const metadatas = [];

      for (const chunk of chunks) {
        const id = uuidv4();
        ids.push(id);
        documents.push(chunk.content);
        metadatas.push({
          bookId: String(chunk.bookId || ''),
          bookTitle: bookTitle || '',
          bookAuthor: bookAuthor || '',
          pageStart: String(chunk.pageStart || chunk.pageEstimate || ''),
          pageEnd: String(chunk.pageEnd || chunk.pageEstimate || ''),
          chunkIndex: String(chunk.index || 0),
          hasQuranVerse: String(chunk.metadata?.hasQuranVerse || false),
          hasHadith: String(chunk.metadata?.hasHadith || false),
          chapterTitle: chunk.metadata?.chapterTitle || '',
        });
        chunk.vectorId = id;
      }

      // Add in batches of 100
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        await this.collection.add({
          ids: ids.slice(i, i + batchSize),
          documents: documents.slice(i, i + batchSize),
          metadatas: metadatas.slice(i, i + batchSize),
        });
      }

      console.log(`✅ تم فهرسة ${chunks.length} جزء في قاعدة المتجهات`);
      return chunks;
    } catch (error) {
      console.error('خطأ في الفهرسة:', error.message);
      return chunks;
    }
  }

  /**
   * البحث الدلالي في الكتب
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      return [];
    }

    try {
      const nResults = options.nResults || 5;
      const where = {};

      if (options.bookId) {
        where.bookId = String(options.bookId);
      }

      const results = await this.collection.query({
        queryTexts: [query],
        nResults,
        ...(Object.keys(where).length > 0 ? { where } : {}),
      });

      if (!results || !results.documents || !results.documents[0]) {
        return [];
      }

      return results.documents[0].map((doc, idx) => ({
        content: doc,
        metadata: results.metadatas[0][idx],
        distance: results.distances?.[0]?.[idx] || 0,
        id: results.ids[0][idx],
      }));
    } catch (error) {
      console.error('خطأ في البحث:', error.message);
      return [];
    }
  }

  /**
   * حذف كل أجزاء كتاب معين
   */
  async deleteBookChunks(bookId) {
    if (!this.initialized) return;

    try {
      await this.collection.delete({
        where: { bookId: String(bookId) },
      });
      console.log(`✅ تم حذف فهرس الكتاب ${bookId}`);
    } catch (error) {
      console.error('خطأ في حذف الفهرس:', error.message);
    }
  }

  /**
   * عدد الأجزاء المفهرسة
   */
  async getCount() {
    if (!this.initialized) return 0;
    try {
      return await this.collection.count();
    } catch {
      return 0;
    }
  }
}

module.exports = new VectorStore();
