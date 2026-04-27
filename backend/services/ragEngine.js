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
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey && apiKey !== 'your-openai-api-key-here' && apiKey.trim() !== '') {
        // Dynamic import for ESM modules to prevent ERR_REQUIRE_ESM on Vercel
        const { ChatOpenAI } = await import('@langchain/openai');
        this.llm = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: 'gpt-4o-mini',
          temperature: 0.3, // حرارة معتدلة للسماح بصياغة أفضل
          maxTokens: 3000,
        });
        this.initialized = true;
        console.log('✅ محرك الذكاء الاصطناعي جاهز (GPT-4o-mini)');
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
    console.log(`\n🔍 سؤال جديد: "${question}"`);

    // 1. استرجاع السياق من قاعدة المتجهات
    const contexts = await vectorStore.search(question, {
      nResults: 15,
      bookId,
    });

    const allContexts = contexts.map(c => ({
      text: c.content,
      book: c.metadata?.bookTitle || 'غير محدد',
      author: c.metadata?.bookAuthor || '',
      page: c.metadata?.pageStart || '?',
    }));

    console.log(`📚 عدد النتائج المسترجعة: ${allContexts.length}`);

    // 2. إذا لم يوجد سياق أبداً
    if (allContexts.length === 0) {
      console.log('❌ لا توجد نتائج بحث');
      return {
        answer: 'عذراً، لم أتمكن من العثور على نتائج لهذا السؤال. يرجى المحاولة بصياغة مختلفة.',
        sources: [],
        confidence: 0,
      };
    }

    // 3. بناء السياق للنموذج - أخذ أفضل النتائج فقط
    const bestContexts = allContexts.slice(0, 10);
    const contextText = bestContexts.map((c, i) =>
      `[مصدر ${i + 1}] الكتاب: ${c.book} | الصفحة: ${c.page}\n${c.text}`
    ).join('\n\n---\n\n');

    // 4. بناء قائمة المصادر
    const sources = allContexts.map(c => ({
      book: c.book,
      page: c.page,
      author: c.author,
    }));
    const uniqueSources = sources.filter((s, i, arr) =>
      arr.findIndex(x => x.book === s.book && x.page === s.page) === i
    );

    // 5. إذا لم يكن هناك LLM، إرجاع السياق مباشرة مع تنسيق ذكي
    if (!this.initialized) {
      console.log('⚠️ LLM غير متاح - استخدام الإجابة المباشرة');
      return this.formatDirectResponse(question, allContexts);
    }

    // 6. استدعاء النموذج
    try {
      console.log('🤖 إرسال للنموذج...');
      const response = await this.llm.invoke([
        {
          role: 'system',
          content: this.getSystemPrompt(),
        },
        {
          role: 'user',
          content: this.buildUserPrompt(question, contextText),
        },
      ]);

      let answer = response.content;
      console.log(`✅ تم الحصول على إجابة (${answer.length} حرف)`);

      // 7. فحص الإجابة - منع "لم أجد" إذا كان هناك سياق
      if (this.isRefusalAnswer(answer) && allContexts.length > 0) {
        console.log('⚠️ النموذج رفض الإجابة رغم وجود سياق - إعادة المحاولة بتعليمات أقوى');
        answer = await this.retryWithStrongerPrompt(question, contextText);
      }

      // 8. إذا لا يزال يرفض، استخدم الإجابة المباشرة
      if (this.isRefusalAnswer(answer) && allContexts.length > 0) {
        console.log('⚠️ النموذج لا يزال يرفض - استخدام الإجابة المباشرة');
        return this.formatDirectResponse(question, allContexts);
      }

      return {
        answer,
        sources: uniqueSources,
        confidence: allContexts.length > 3 ? 'high' : 'medium',
      };
    } catch (error) {
      console.error('خطأ في استدعاء النموذج:', error.message);
      return this.formatDirectResponse(question, allContexts);
    }
  }

  /**
   * فحص هل الإجابة هي رفض/اعتذار
   */
  isRefusalAnswer(answer) {
    const refusalPhrases = [
      'عذراً، لم أجد',
      'لم أجد إجابة',
      'لم أتمكن من العثور',
      'لا يحتوي على',
      'غير كافٍ',
      'غير كاف',
      'لا توجد معلومات',
      'لم يتضمن',
      'لا يتضمن السياق',
      'السياق لا يحتوي',
      'النصوص لا تحتوي',
      'لم أعثر',
    ];
    const lower = answer.trim();
    return refusalPhrases.some(phrase => lower.includes(phrase));
  }

  /**
   * إعادة المحاولة مع تعليمات أقوى
   */
  async retryWithStrongerPrompt(question, contextText) {
    try {
      const response = await this.llm.invoke([
        {
          role: 'system',
          content: `أنت مساعد أكاديمي. لديك نصوص من كتب دينية. مهمتك الوحيدة هي تلخيص وشرح ما في هذه النصوص.

⛔ ممنوع منعاً باتاً أن تقول "لم أجد" أو "عذراً" أو أي عبارة اعتذار.
⛔ ممنوع أن تقول "السياق غير كافٍ".

✅ اقرأ النصوص بعناية واستخرج منها كل ما يتعلق بالسؤال.
✅ إذا وجدت أي معلومة ولو بسيطة، اذكرها وفصّلها.
✅ رتّب إجابتك: الحكم، ثم الدليل، ثم المصدر.`,
        },
        {
          role: 'user',
          content: `اقرأ هذه النصوص من الكتب وأجب عن السؤال:

السؤال: ${question}

النصوص:
${contextText}

اكتب إجابة شاملة مبنية على هذه النصوص. اذكر كل ما وجدته متعلقاً بالموضوع.`,
        },
      ]);
      return response.content;
    } catch (error) {
      console.error('خطأ في إعادة المحاولة:', error.message);
      return 'عذراً، حدث خطأ تقني.';
    }
  }

  /**
   * بناء الـ prompt للمستخدم
   */
  buildUserPrompt(question, contextText) {
    return `السؤال: ${question}

━━━━━━━━ النصوص المسترجعة من الكتب ━━━━━━━━

${contextText}

━━━━━━━━ نهاية النصوص ━━━━━━━━

التعليمات:
1. اقرأ كل النصوص أعلاه بعناية شديدة.
2. استخرج كل ما يتعلق بالسؤال "${question}" من هذه النصوص.
3. صِغ إجابة واضحة ومفصّلة تشمل: الحكم الشرعي، الأدلة، أقوال العلماء.
4. اذكر المصدر (اسم الكتاب والصفحة) لكل معلومة.
5. لا تعتذر ولا تقل "لم أجد" - النصوص أمامك وفيها الإجابة.`;
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
   * تنسيق إجابة مباشرة بدون LLM — نسخة محسّنة تعرض المحتوى بشكل مفيد
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

    // بناء الإجابة بشكل منسّق - عرض محتوى الكتب مباشرة
    let answer = `فيما يلي ما ورد في الكتب المتوفرة حول سؤالك:\n\n`;

    unique.forEach((ctx, i) => {
      const bookLine = `📖 **${ctx.book}${ctx.page ? ` — الصفحة ${ctx.page}` : ''}:**`;
      answer += `${bookLine}\n\n`;

      // اقتطاع النص بشكل ذكي عند آخر جملة كاملة
      let excerpt = ctx.text || '';
      if (excerpt.length > 800) {
        excerpt = excerpt.slice(0, 800);
        const lastDot = Math.max(excerpt.lastIndexOf('.'), excerpt.lastIndexOf('،'), excerpt.lastIndexOf('\n'));
        if (lastDot > 400) excerpt = excerpt.slice(0, lastDot + 1);
        excerpt += '...';
      }
      answer += `${excerpt}\n\n`;

      if (i < unique.length - 1) answer += `---\n\n`;
    });

    const uniqueSources = unique.map(c => ({ book: c.book, page: c.page, author: c.author }));

    return {
      answer,
      sources: uniqueSources,
      confidence: 'direct',
    };
  }

  /**
   * التعليمات الأساسية للنموذج - نسخة محسّنة تمنع الاعتذار
   */
  getSystemPrompt() {
    return `أنت عالم شرعي متخصص ومساعد أكاديمي. مهمتك الإجابة على الأسئلة الدينية بناءً على النصوص المسترجعة من كتب العلم الشرعي.

## القاعدة الأهم - ممنوع الاعتذار:
⛔ لا تقل أبداً "عذراً" أو "لم أجد" أو "السياق غير كافٍ" أو "لا يحتوي على إجابة" عندما تُعطى نصوصاً من الكتب.
⛔ النصوص التي تُعطاها هي نتائج بحث من كتب فقهية حقيقية - وهي بالتأكيد تحتوي على معلومات مفيدة.
✅ مهمتك هي قراءة هذه النصوص واستخراج الفائدة منها وتقديمها بأسلوب واضح.

## كيف تجيب:
1. اقرأ كل النصوص المقدمة بعناية فائقة.
2. استخرج كل ما يتعلق بالسؤال - حتى لو كانت الصلة غير مباشرة.
3. رتّب إجابتك بهذا الشكل:
   - **الحكم الشرعي**: ما هو الحكم
   - **الأدلة**: الآيات والأحاديث والإجماع
   - **أقوال العلماء**: إن وجدت آراء مختلفة اذكرها
   - **المصدر**: اسم الكتاب ورقم الصفحة
4. إذا وجدت آراء مختلفة، اعرضها جميعاً بإنصاف.
5. أجب بالعربية الفصحى بأسلوب أكاديمي واضح.

## تذكّر:
- كل نص يُعطى لك هو من كتاب حقيقي وفيه فائدة.
- لا تتجاهل أي نص - اقرأه واستفد منه.
- الأسئلة دينية والكتب دينية، فالإجابة موجودة حتماً.`;
  }
}

module.exports = new RAGEngine();
