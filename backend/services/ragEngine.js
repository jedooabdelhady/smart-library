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

    // 1. استرجاع السياق من قاعدة المتجهات (تقليل العدد لتسريع المعالجة تحت 10 ثواني)
    const contexts = await vectorStore.search(question, {
      nResults: 12,
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

    // 3. بناء السياق للنموذج - أخذ أفضل النتائج فقط لتسريع Vercel
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

      const answer = response.content;
      console.log(`✅ تم الحصول على إجابة (${answer.length} حرف)`);

      // إذا كانت الإجابة اعتذار، نرجعها مباشرة أو ننسقها بشكل لائق
      if (this.isRefusalAnswer(answer)) {
        console.log('⚠️ النموذج أبلغ بعدم وجود الإجابة في السياق.');
        return {
          answer: 'عذراً، بعد البحث الدقيق في الكتب المتاحة، لم أتمكن من العثور على إجابة دقيقة لسؤالك. يرجى محاولة صياغة السؤال بشكل مختلف أو استخدام كلمات مفتاحية أخرى.',
          sources: [],
          confidence: 'none',
        };
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
   * تم إزالة دالة إعادة المحاولة القسرية لأنها تسبب الهلوسة
   */

  /**
   * بناء الـ prompt للمستخدم
   */
  buildUserPrompt(question, contextText) {
    return `السؤال: ${question}

━━━━━━━━ النصوص المسترجعة من الكتب ━━━━━━━━

${contextText}

━━━━━━━━ نهاية النصوص ━━━━━━━━

التعليمات الصارمة جداً:
1. اقرأ كل النصوص أعلاه بدقة وتأنٍ وتأكد من محتواها مرتين على الأقل.
2. استخرج كل معلومة مفيدة تجدها في هذه النصوص تتعلق بالسؤال ورتبها بشكل تفصيلي وشامل، حتى لو كانت النصوص متفرقة أو جزئية. 
3. إياك أن تتجاهل أو تختصر الإجابة، بل اجمع كل الفوائد والأحكام والأقوال المذكورة.
4. يمنع منعاً باتاً اختراع أو استنتاج أي معلومة من خارج النصوص المرفقة. استخدم المعاني الموجودة فقط.
5. تأكد من إسناد كل معلومة تذكرها إلى اسم الكتاب ورقم الصفحة الصحيح تماماً كما هو موجود في النص المرفق. لا تخمن أرقام الصفحات.
6. صِغ إجابة واضحة ومفصّلة ومقنعة تشمل: الحكم الشرعي، الأدلة، أقوال العلماء المستخرجة فقط من النصوص.`;
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
   * التعليمات الأساسية للنموذج - صارمة وتمنع الهلوسة
   */
  getSystemPrompt() {
    return `أنت عالم شرعي متخصص ومساعد بحثي دقيق جداً. مهمتك هي الإجابة على الأسئلة الدينية بالاعتماد **حصراً وفقط** على النصوص المسترجعة من كتب العلم الشرعي المرفقة لك.

## قواعد صارمة جداً (يمنع مخالفتها):
1. **الشمولية من السياق فقط**: لا تستخدم أبداً معلوماتك السابقة للرد، لكن في الوقت نفسه لا تبخل في جمع كل التفاصيل المفيدة المذكورة في النصوص المرفقة.
2. **التحقق المزدوج**: اقرأ النصوص جيداً وتأكد مرتين أن الإجابة التي تصيغها مفصلة ومطابقة تماماً للمعنى المذكور في النص.
3. **لا تتسرع بالاعتذار**: النصوص المرفقة غالباً تحتوي على الإجابة أو أجزاء منها. اجمع هذه الأجزاء ورتبها بشكل مفيد للقارئ ولا تقل "لا أعلم" إلا إذا كانت النصوص لا تمت للسؤال بصلة إطلاقاً.
4. **التوثيق الدقيق للمصادر**: كل فقرة تكتبها يجب أن يرافقها التوثيق الدقيق (اسم الكتاب ورقم الصفحة) المذكورين في النص المرفق قبل المحتوى مباشرة. تحقق جيداً من رقم الصفحة ولا تخلط بين الكتب.

## كيف تجيب (بناء على النصوص المرفقة فقط):
- **الحكم الشرعي**: ما هو الحكم الموجود في النص.
- **الأدلة**: الآيات والأحاديث المذكورة في النص حصراً.
- **أقوال العلماء والتفصيل**: اذكر الآراء باختصار ودون إطالة لتسريع الاستجابة.
- **المصدر**: [اسم الكتاب، الصفحة X] في نهاية كل معلومة.

أنت مساعد موثوق، وهدفك تقديم إجابة تفصيلية مجمّعة وواضحة جداً للقارئ، مستنبطة تماماً وبدون أي إضافة خارجية من النصوص المرفقة. أجب بالعربية الفصحى.`;
  }
}

module.exports = new RAGEngine();
