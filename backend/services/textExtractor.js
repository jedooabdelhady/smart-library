const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

class TextExtractor {
  async extractFromPDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);

      const pages = [];
      const textPerPage = data.text.split(/\f/);

      for (let i = 0; i < textPerPage.length; i++) {
        const content = textPerPage[i].trim();
        if (content) {
          pages.push({ number: i + 1, content: this.cleanArabicText(content) });
        }
      }

      if (pages.length <= 1 && data.text.length > 2000) {
        const cleanedText = this.cleanArabicText(data.text);
        const estimatedPages = this.splitIntoPages(cleanedText, 2000);
        return { pages: estimatedPages, totalPages: estimatedPages.length, metadata: data.info };
      }

      return { pages, totalPages: pages.length || data.numpages, metadata: data.info };
    } catch (error) {
      console.error('خطأ في استخراج النص من PDF:', error.message);
      // Fallback for PDF: Tesseract cannot read PDFs directly without conversion
      return { pages: [], totalPages: 0, metadata: {} };
    }
  }

  async extractFromWord(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      const cleanedText = this.cleanArabicText(result.value);
      const pages = this.splitIntoPages(cleanedText, 2000);
      return { pages, totalPages: pages.length, metadata: {} };
    } catch (error) {
      console.error('خطأ في استخراج النص من Word:', error.message);
      throw error;
    }
  }

  async extractFromLegacyWord(filePath) {
    try {
      const WordExtractor = require('word-extractor');
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(filePath);
      const text = extracted.getBody();
      const cleanedText = this.cleanArabicText(text);
      const pages = this.splitIntoPages(cleanedText, 2000);
      return { pages, totalPages: pages.length, metadata: {} };
    } catch (error) {
      console.error('خطأ في استخراج النص من ملف Word القديم (doc):', error.message);
      throw error;
    }
  }

  async extractFromEPUB(filePath) {
    try {
      const { EPub } = require('epub2');
      const epub = await EPub.createAsync(filePath, '', '');

      const pages = [];
      let pageNum = 1;

      for (const chapter of epub.flow) {
        if (!chapter.id) continue;
        try {
          const rawHtml = await epub.getChapterAsync(chapter.id);
          const text = this.stripHTML(rawHtml);
          const cleaned = this.cleanArabicText(text);

          if (cleaned.trim().length < 30) continue;

          const chapterPages = this.splitIntoPages(cleaned, 2000);
          for (const p of chapterPages) {
            pages.push({ number: pageNum++, content: p.content });
          }
        } catch (chapterErr) {
          // Skip unreadable chapters
        }
      }

      const meta = epub.metadata || {};
      return {
        pages,
        totalPages: pages.length,
        metadata: {
          title: meta.title || '',
          creator: meta.creator || '',
          language: meta.language || 'ar',
        },
      };
    } catch (error) {
      console.error('خطأ في استخراج EPUB:', error.message);
      throw error;
    }
  }

  // Strip HTML tags and decode entities
  stripHTML(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&[a-z]+;/g, ' ');
  }

  async extractWithOCR(filePath) {
    try {
      const Tesseract = require('tesseract.js');
      const { data } = await Tesseract.recognize(filePath, 'ara', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const cleanedText = this.cleanArabicText(data.text);
      const pages = this.splitIntoPages(cleanedText, 2000);
      return { pages, totalPages: pages.length, metadata: { ocrUsed: true } };
    } catch (error) {
      console.error('خطأ في OCR:', error.message);
      return { pages: [], totalPages: 0, metadata: { error: error.message } };
    }
  }

  async extract(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.pdf':
        return this.extractFromPDF(filePath);
      case '.doc':
        return this.extractFromLegacyWord(filePath);
      case '.docx':
        return this.extractFromWord(filePath);
      case '.epub':
        return this.extractFromEPUB(filePath);
      default:
        throw new Error(`نوع الملف غير مدعوم: ${ext}`);
    }
  }

  cleanArabicText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^ +| +$/gm, '')
      .trim();
  }

  splitIntoPages(text, charsPerPage = 2000) {
    const pages = [];
    const paragraphs = text.split(/\n\n+/);
    let currentPage = '';
    let pageNum = 1;

    for (const para of paragraphs) {
      if ((currentPage + '\n\n' + para).length > charsPerPage && currentPage) {
        pages.push({ number: pageNum++, content: currentPage.trim() });
        currentPage = para;
      } else {
        currentPage = currentPage ? currentPage + '\n\n' + para : para;
      }
    }

    if (currentPage.trim()) {
      pages.push({ number: pageNum, content: currentPage.trim() });
    }

    return pages;
  }
}

module.exports = new TextExtractor();
