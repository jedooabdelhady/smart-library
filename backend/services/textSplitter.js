/**
 * تقسيم النصوص العربية الذكي
 * يراعي هيكل النص العربي: الأبواب، الفصول، الأحاديث، الآيات
 */
class ArabicTextSplitter {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 1000;
    this.chunkOverlap = options.chunkOverlap || 200;
    this.separators = options.separators || [
      // فواصل هيكلية
      '\nالباب ',
      '\nالفصل ',
      '\nالمبحث ',
      '\nالمطلب ',
      '\nالفرع ',
      // فواصل فقرات
      '\n\n\n',
      '\n\n',
      '\n',
      // فواصل جمل عربية
      '۝',   // علامة نهاية آية
      '﴾',   // نهاية قوس قرآني
      '.',    // نقطة
      '。',
      '؟',   // علامة استفهام عربية
      '!',
      '،',   // فاصلة عربية
      ',',
      ' ',
    ];
  }

  /**
   * تقسيم النص إلى أجزاء مع معلومات الموقع
   */
  splitText(text, bookId = null, startPage = 1) {
    const chunks = [];
    const rawChunks = this._recursiveSplit(text, this.separators);

    let currentChunk = '';
    let chunkIndex = 0;

    for (const piece of rawChunks) {
      if ((currentChunk + piece).length <= this.chunkSize) {
        currentChunk += piece;
      } else {
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            index: chunkIndex++,
            bookId,
            pageEstimate: startPage + Math.floor(chunkIndex / 2),
            metadata: this._extractMetadata(currentChunk),
          });
        }

        // Overlap: keep the last part
        const overlapText = currentChunk.slice(-this.chunkOverlap);
        currentChunk = overlapText + piece;
      }
    }

    // Last chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        bookId,
        pageEstimate: startPage + Math.floor(chunkIndex / 2),
        metadata: this._extractMetadata(currentChunk),
      });
    }

    return chunks;
  }

  /**
   * تقسيم صفحات الكتاب
   */
  splitPages(pages, bookId = null) {
    const allChunks = [];
    let globalIndex = 0;

    for (const page of pages) {
      const pageChunks = this.splitText(page.content, bookId, page.number);
      for (const chunk of pageChunks) {
        chunk.index = globalIndex++;
        chunk.pageStart = page.number;
        chunk.pageEnd = page.number;
        allChunks.push(chunk);
      }
    }

    // Merge small adjacent chunks from same page
    return this._mergeSmallChunks(allChunks);
  }

  /**
   * تقسيم تكراري بالفواصل
   */
  _recursiveSplit(text, separators) {
    if (!text || text.length <= this.chunkSize) {
      return [text];
    }

    const sep = separators[0];
    const restSeparators = separators.slice(1);
    const parts = text.split(sep);

    const result = [];
    for (let i = 0; i < parts.length; i++) {
      const part = i < parts.length - 1 ? parts[i] + sep : parts[i];
      if (part.length > this.chunkSize && restSeparators.length > 0) {
        result.push(...this._recursiveSplit(part, restSeparators));
      } else {
        result.push(part);
      }
    }

    return result;
  }

  /**
   * استخراج بيانات وصفية من النص
   */
  _extractMetadata(text) {
    const metadata = {};

    // Check for Quran verses
    const quranMatch = text.match(/﴿([^﴾]+)﴾/);
    if (quranMatch) {
      metadata.hasQuranVerse = true;
    }

    // Check for Hadith
    const hadithPatterns = [
      /قال رسول الله صلى الله عليه وسلم/,
      /عن النبي صلى الله عليه وسلم/,
      /حدثنا .+ قال حدثنا/,
      /رواه البخاري|رواه مسلم|متفق عليه/,
    ];
    if (hadithPatterns.some(p => p.test(text))) {
      metadata.hasHadith = true;
    }

    // Check for chapter headings
    const chapterMatch = text.match(/(الباب|الفصل|المبحث|المطلب)\s+(.+)/);
    if (chapterMatch) {
      metadata.chapterType = chapterMatch[1];
      metadata.chapterTitle = chapterMatch[2].slice(0, 100);
    }

    return metadata;
  }

  /**
   * دمج الأجزاء الصغيرة المتجاورة
   */
  _mergeSmallChunks(chunks, minSize = 200) {
    const merged = [];
    let buffer = null;

    for (const chunk of chunks) {
      if (!buffer) {
        buffer = { ...chunk };
        continue;
      }

      if (buffer.content.length < minSize && buffer.pageStart === chunk.pageStart) {
        buffer.content += '\n' + chunk.content;
        buffer.pageEnd = chunk.pageEnd;
        buffer.metadata = { ...buffer.metadata, ...chunk.metadata };
      } else {
        merged.push(buffer);
        buffer = { ...chunk };
      }
    }

    if (buffer) merged.push(buffer);
    return merged;
  }
}

module.exports = ArabicTextSplitter;
