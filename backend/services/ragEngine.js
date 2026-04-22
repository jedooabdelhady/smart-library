const { ChatOpenAI } = require('@langchain/openai');
const vectorStore = require('./vectorStore');
const { pool } = require('../config/database');
require('dotenv').config();

/**
 * محرك RAG (الاسترجاع المعزز بالتوليد) للإجابة على الأسئلة الدينية
 *
 * القواعد الصارمة:
 * 1. لا هلوسة - الإجابة فقط من الكتب المتوفرة
 * 2. استشهاد إلزامي بالمصدر ورقم الصفحة
 * 3. تنسيق: [الأقوال] + [الأدلة] + [المصدر]
 */
class RAGEngine {
  constructor() {
    this.llm = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
        this.llm = new ChatOpenAI({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: 'gpt-4o-mini',
          temperature: 0.1, // حرارة منخفضة جداً لمنع الهلوسة
          maxTokens: 2000,
        });
        this.initialized = true;
        console.log('✅ محرك الذكاء الاصطناعي جاهز');
      } else {
        console.log('⚠️ مفتاح OpenAI غير محدد - سيعمل بوضع البحث النصي فقط');
      }
    } catch (error) {
      console.error('⚠️ خطأ في تهيئة محرك AI:', error.message);
    }
  }

  /**
   * الإجابة على سؤال ديني
   */
  async answer(question, bookId = null) {
    // 1. استرجاع السياق من قاعدة المتجهات
    const contexts = await vectorStore.search(question, {
      nResults: 50, // تم رفع الحد الأقصى إلى 50 لجلب أكبر قدر ممكن من السياق من جميع الكتب
      bookId,
    });

    const allContexts = contexts.map(c => ({
      text: c.content,
      book: c.metadata?.bookTitle || 'غير محدد',
      author: c.metadata?.bookAuthor || '',
      page: c.metadata?.pageStart || '?',
    }));

    // 3. إذا لم يوجد سياق أبداً
    if (allContexts.length === 0) {
      return {
        answer: 'عذراً، لم أتمكن من العثور على إجابة لهذا السؤال في الكتب المتوفرة في المكتبة.\n\nيرجى المحاولة بصياغة مختلفة أو التأكد من أن الكتب ذات الصلة قد تم رفعها وفهرستها.',
        sources: [],
        confidence: 0,
      };
    }

    // 4. بناء السياق للنموذج
    const contextText = allContexts.map((c, i) =>
      `[مصدر ${i + 1}] الكتاب: ${c.book} | الصفحة: ${c.page}\n${c.text}`
    ).join('\n\n---\n\n');

    // 5. إذا لم يكن هناك LLM، إرجاع السياق مباشرة
    if (!this.initialized) {
      return this.formatDirectResponse(question, allContexts);
    }

    // 6. استدعاء النموذج مع التعليمات الصارمة
    try {
      const response = await this.llm.invoke([
        {
          role: 'system',
          content: this.getSystemPrompt(),
        },
        {
          role: 'user',
          content: `السؤال: ${question}\n\n--- السياق المسترجع من الكتب ---\n\n${contextText}\n\n--- نهاية السياق ---\n\nأجب على السؤال بناءً على السياق أعلاه فقط. استخرج كل النقاط أو الآراء المتعلقة بالسؤال من السياق واذكرها. إذا كان السياق يحتوي على جزء من الإجابة فقط (مثل بعض الشروط وليس كلها)، فاذكر ما وجدته بوضوح. لا تعتذر إلا إذا كان السياق لا يحتوي على أي معلومة مفيدة للإجابة على السؤال إطلاقاً.`,
        },
      ]);

      const sources = allContexts.map(c => ({
        book: c.book,
        page: c.page,
        author: c.author,
      }));

      // Remove duplicate sources
      const uniqueSources = sources.filter((s, i, arr) =>
        arr.findIndex(x => x.book === s.book && x.page === s.page) === i
      );

      return {
        answer: response.content,
        sources: uniqueSources,
        confidence: allContexts.length > 3 ? 'high' : 'medium',
      };
    } catch (error) {
      console.error('خطأ في استدعاء النموذج:', error.message);
      return this.formatDirectResponse(question, allContexts);
    }
  }

  /**
   * تلخيص فصل من كتاب
   */
  async summarize(bookId, chapter) {
    const contexts = await vectorStore.search(
      `${chapter} تلخيص`,
      { nResults: 15, bookId }
    );

    if (contexts.length === 0) {
      return {
        answer: 'عذراً، لم أتمكن من العثور على هذا الفصل في الكتاب المحدد.',
        sources: [],
      };
    }

    const contextText = contexts.map(c => c.content).join('\n\n');

    if (!this.initialized) {
      return {
        answer: `ملخص النصوص المسترجعة:\n\n${contextText.slice(0, 1500)}...`,
        sources: contexts.map(c => ({
          book: c.metadata?.bookTitle,
          page: c.metadata?.pageStart,
        })),
      };
    }

    const response = await this.llm.invoke([
      {
        role: 'system',
        content: 'أنت مساعد أكاديمي متخصص في تلخيص النصوص الدينية العربية. لخص النص التالي بدقة مع الحفاظ على المعلومات الجوهرية والأدلة الشرعية. اذكر المصادر.',
      },
      {
        role: 'user',
        content: `لخص هذا النص:\n\n${contextText}`,
      },
    ]);

    return {
      answer: response.content,
      sources: contexts.map(c => ({
        book: c.metadata?.bookTitle,
        page: c.metadata?.pageStart,
      })),
    };
  }

  /**
   * مقارنة الآراء بين كتب مختلفة
   */
  async compare(topic, bookIds) {
    const allResults = [];

    for (const bId of bookIds) {
      const results = await vectorStore.search(topic, {
        nResults: 8,
        bookId: bId,
      });
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      return {
        answer: 'عذراً، لم أجد معلومات كافية حول هذا الموضوع في الكتب المحددة.',
        sources: [],
      };
    }

    const contextText = allResults.map((c, i) =>
      `[الكتاب: ${c.metadata?.bookTitle} | الصفحة: ${c.metadata?.pageStart}]\n${c.content}`
    ).join('\n\n---\n\n');

    if (!this.initialized) {
      return this.formatDirectResponse(topic, allResults.map(c => ({
        text: c.content,
        book: c.metadata?.bookTitle,
        page: c.metadata?.pageStart,
      })));
    }

    const response = await this.llm.invoke([
      {
        role: 'system',
        content: this.getSystemPrompt() + '\n\nمهمتك الآن هي مقارنة الآراء والأقوال في الموضوع المطلوب بين الكتب المختلفة. رتب المقارنة بشكل واضح مع ذكر كل رأي ودليله ومصدره.',
      },
      {
        role: 'user',
        content: `قارن الآراء حول: ${topic}\n\n${contextText}`,
      },
    ]);

    return {
      answer: response.content,
      sources: allResults.map(c => ({
        book: c.metadata?.bookTitle,
        page: c.metadata?.pageStart,
      })),
    };
  }


  /**
   * تنسيق إجابة مباشرة بدون LLM — نسخة محسّنة
   */
  formatDirectResponse(question, contexts) {
    // إزالة التكرار وأخذ أفضل 5 نصوص
    const seen = new Set();
    const unique = contexts.filter(ctx => {
      const key = `${ctx.book}-${ctx.page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);

    if (unique.length === 0) {
      return {
        answer: 'عذراً، لم أتمكن من العثور على إجابة لهذا السؤال في الكتب المتوفرة.',
        sources: [],
        confidence: 'none',
      };
    }

    // بناء الإجابة بشكل منسّق
    let answer = `## ما وجدناه في المكتبة حول سؤالك\n\n`;

    unique.forEach((ctx, i) => {
      const bookLine = `**📖 ${ctx.book}${ctx.page ? ` — الصفحة ${ctx.page}` : ''}:**`;
      answer += `${bookLine}\n\n`;

      // اقتطاع النص بشكل ذكي عند آخر جملة كاملة
      let excerpt = ctx.text || '';
      if (excerpt.length > 600) {
        excerpt = excerpt.slice(0, 600);
        const lastDot = Math.max(excerpt.lastIndexOf('.'), excerpt.lastIndexOf('،'), excerpt.lastIndexOf('\n'));
        if (lastDot > 300) excerpt = excerpt.slice(0, lastDot + 1);
        excerpt += '...';
      }
      answer += `${excerpt}\n\n`;

      if (i < unique.length - 1) answer += `---\n\n`;
    });

    // ملاحظة في الأسفل
    answer += `\n> 💡 *هذه نتائج البحث المباشر — المساعد الذكي سيصيغ الإجابة قريباً.*`;

    const uniqueSources = unique.map(c => ({ book: c.book, page: c.page, author: c.author }));

    return {
      answer,
      sources: uniqueSources,
      confidence: 'direct',
    };
  }

  /**
   * التعليمات الأساسية للنموذج
   */
  getSystemPrompt() {
    return `أنت مساعد أكاديمي متخصص في العلوم الشرعية والدينية الإسلامية. مهمتك الإجابة على الأسئلة بناءً حصرياً على النصوص المسترجعة من الكتب المتوفرة.

## القواعد الصارمة:

1. **لا هلوسة أبداً**: لا تختلق معلومات من خارج السياق. إذا كان السياق لا يحتوي على أي إجابة مرتبطة بالسؤال، حينها فقط قل: "عذراً، لم أجد إجابة لهذا السؤال في الكتب المتوفرة في المكتبة." أما إذا احتوى على إجابة جزئية فاذكرها.

2. **تنسيق الإجابة الإلزامي**:
   - عرض الأقوال المختلفة إن وُجدت
   - ذكر الدليل لكل قول (آية، حديث، إجماع، قياس)
   - المصدر: اسم الكتاب، الصفحة

3. **الاستشهاد الإلزامي**: كل معلومة يجب أن تكون مرتبطة بمصدر محدد من السياق المسترجع.

4. **اللغة**: أجب بالعربية الفصحى بأسلوب أكاديمي واضح.

5. **الأمانة العلمية**: إذا كان السياق يحتوي على آراء مختلفة، اعرضها جميعاً بإنصاف.

6. **التحفظ**: إذا كان السياق غير كافٍ للإجابة الشاملة، نبّه على ذلك واذكر ما توفر فقط.`;
  }
}

module.exports = new RAGEngine();
