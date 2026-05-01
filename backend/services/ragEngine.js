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
 * 4. تحقق مزدوج من كل إجابة قبل إرسالها
 */
class RAGEngine {
  constructor() {
    this.llm = null;
    this.verifierLlm = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey && apiKey !== 'your-openai-api-key-here' && apiKey.trim() !== '') {
        const { ChatOpenAI } = await import('@langchain/openai');
        // النموذج الرئيسي للإجابة - حرارة منخفضة جداً للدقة القصوى
        this.llm = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: 'gpt-4o-mini',
          temperature: 0.1,
          maxTokens: 4096,
        });
        // نموذج التحقق - حرارة صفر للتحقق الصارم
        this.verifierLlm = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: 'gpt-4o-mini',
          temperature: 0,
          maxTokens: 2000,
        });
        this.initialized = true;
        console.log('✅ محرك الذكاء الاصطناعي جاهز (GPT-4o-mini) مع التحقق المزدوج');
      } else {
        console.log('⚠️ مفتاح OpenAI غير محدد - سيعمل بوضع البحث النصي فقط');
      }
    } catch (error) {
      console.error('⚠️ خطأ في تهيئة محرك AI:', error.message);
    }
  }

  /**
   * الإجابة على سؤال ديني - مع تحقق مزدوج
   */
  async answer(question, bookId = null) {
    console.log(`\n🔍 سؤال جديد: "${question}"`);

    // 1. استرجاع سياق واسع من قاعدة البيانات - بحث شامل في الكتب
    const contexts = await vectorStore.search(question, {
      nResults: 30,
      bookId,
    });

    // 2. بحث إضافي بكلمات مفتاحية بديلة للتأكد من عدم فقدان أي نتيجة
    const altKeywords = this.extractAlternativeKeywords(question);
    let extraContexts = [];
    if (altKeywords) {
      extraContexts = await vectorStore.search(altKeywords, {
        nResults: 15,
        bookId,
      });
    }

    // 3. دمج النتائج وإزالة التكرار
    const allRaw = [...contexts, ...extraContexts];
    const seen = new Set();
    const allContexts = [];
    for (const c of allRaw) {
      const key = `${c.metadata?.bookId}_${c.metadata?.pageStart}`;
      if (!seen.has(key)) {
        seen.add(key);
        allContexts.push({
          text: c.content,
          book: c.metadata?.bookTitle || 'غير محدد',
          author: c.metadata?.bookAuthor || '',
          page: c.metadata?.pageStart || '?',
        });
      }
    }

    console.log(`📚 عدد النتائج المسترجعة (بعد إزالة التكرار): ${allContexts.length}`);

    // 4. إذا لم يوجد سياق أبداً
    if (allContexts.length === 0) {
      console.log('❌ لا توجد نتائج بحث');
      return {
        answer: 'عذراً، لم أتمكن من العثور على نتائج لهذا السؤال في الكتب المتوفرة. يرجى المحاولة بصياغة مختلفة أو كلمات مفتاحية أخرى.',
        sources: [],
        confidence: 0,
      };
    }

    // 5. بناء السياق الكامل للنموذج - إرسال كل النتائج بدون اختصار
    const contextText = allContexts.map((c, i) =>
      `[مصدر ${i + 1}] الكتاب: ${c.book} | الصفحة: ${c.page}\n${c.text}`
    ).join('\n\n---\n\n');

    // 6. بناء قائمة المصادر الفريدة
    const sources = allContexts.map(c => ({
      book: c.book,
      page: c.page,
      author: c.author,
    }));
    const uniqueSources = sources.filter((s, i, arr) =>
      arr.findIndex(x => x.book === s.book && x.page === s.page) === i
    );

    // 7. إذا لم يكن هناك LLM، إرجاع السياق مباشرة
    if (!this.initialized) {
      console.log('⚠️ LLM غير متاح - استخدام الإجابة المباشرة');
      return this.formatDirectResponse(question, allContexts);
    }

    // 8. استدعاء النموذج مع التحقق المزدوج
    try {
      console.log('🤖 المرحلة 1: توليد الإجابة الأولية...');
      const response = await this.llm.invoke([
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: this.buildUserPrompt(question, contextText) },
      ]);

      const initialAnswer = response.content;
      console.log(`📝 الإجابة الأولية (${initialAnswer.length} حرف)`);

      // إذا كانت الإجابة اعتذار
      if (this.isRefusalAnswer(initialAnswer)) {
        console.log('⚠️ النموذج رفض الإجابة - محاولة ثانية بتعليمات أقوى...');
        // محاولة ثانية بتعليمات أقوى
        const retryResponse = await this.llm.invoke([
          { role: 'system', content: this.getStrictRetryPrompt() },
          { role: 'user', content: this.buildRetryPrompt(question, contextText) },
        ]);
        const retryAnswer = retryResponse.content;
        if (!this.isRefusalAnswer(retryAnswer)) {
          // تحقق من الإجابة الثانية
          const verified = await this.verifyAnswer(question, retryAnswer, contextText);
          return {
            answer: verified,
            sources: uniqueSources,
            confidence: 'medium',
          };
        }
        return {
          answer: 'عذراً، بعد البحث المعمق في جميع الكتب المتاحة، لم أتمكن من العثور على إجابة دقيقة لسؤالك. يرجى محاولة صياغة السؤال بشكل مختلف.',
          sources: [],
          confidence: 'none',
        };
      }

      // 9. التحقق من صحة الإجابة
      console.log('🔎 المرحلة 2: التحقق من دقة الإجابة...');
      const verifiedAnswer = await this.verifyAnswer(question, initialAnswer, contextText);

      return {
        answer: verifiedAnswer,
        sources: uniqueSources,
        confidence: allContexts.length > 5 ? 'high' : 'medium',
      };
    } catch (error) {
      console.error('خطأ في استدعاء النموذج:', error.message);
      return this.formatDirectResponse(question, allContexts);
    }
  }

  /**
   * التحقق من دقة الإجابة - المرحلة الثانية
   */
  async verifyAnswer(question, answer, contextText) {
    try {
      const verifyResponse = await this.verifierLlm.invoke([
        {
          role: 'system',
          content: `أنت مدقق علمي صارم. مهمتك فحص إجابة تم توليدها والتأكد من أن كل معلومة فيها موجودة فعلاً في النصوص المرفقة.

قواعد التدقيق:
1. تحقق أن كل حكم شرعي مذكور في الإجابة موجود في النصوص المرفقة.
2. تحقق أن أرقام الصفحات وأسماء الكتب صحيحة ومطابقة للنصوص.
3. تحقق أن الآيات والأحاديث المذكورة موجودة في النصوص وليست مضافة من الخارج.
4. إذا وجدت معلومة في الإجابة غير موجودة في النصوص، احذفها.
5. إذا وجدت معلومة مهمة في النصوص لم تُذكر في الإجابة، أضفها.
6. أعد صياغة الإجابة المصححة كاملة بنفس الأسلوب والتنسيق.
7. لا تضف أي شيء من عندك - فقط ما هو موجود في النصوص.`
        },
        {
          role: 'user',
          content: `السؤال الأصلي: ${question}

الإجابة المراد تدقيقها:
${answer}

━━━━━━━━ النصوص المصدرية ━━━━━━━━
${contextText}
━━━━━━━━ نهاية النصوص ━━━━━━━━

أعد الإجابة بعد التدقيق والتصحيح. إذا كانت الإجابة صحيحة بالكامل، أعدها كما هي مع أي إضافات مفيدة من النصوص.`
        },
      ]);
      console.log('✅ تم التحقق من الإجابة بنجاح');
      return verifyResponse.content;
    } catch (error) {
      console.error('⚠️ خطأ في التحقق، إرجاع الإجابة الأولية:', error.message);
      return answer;
    }
  }

  /**
   * استخراج كلمات مفتاحية بديلة من السؤال لتوسيع البحث
   */
  extractAlternativeKeywords(question) {
    const synonymMap = {
      'شروط': 'أركان واجبات فروض',
      'أركان': 'شروط فروض واجبات',
      'فروض': 'أركان شروط واجبات',
      'حكم': 'حكمه يجوز يحرم يستحب مسألة',
      'صلاة': 'الصلاة صلاته يصلي مصلي',
      'زكاة': 'الزكاة زكاته يزكي',
      'صيام': 'الصيام صومه يصوم صائم',
      'حج': 'الحج حجه يحج حاج',
      'وضوء': 'الوضوء توضأ يتوضأ',
      'طهارة': 'الطهارة تطهر طاهر نجاسة',
      'نكاح': 'الزواج نكاح زوج تزويج',
      'طلاق': 'الطلاق طلق يطلق مطلقة',
      'بيع': 'البيع شراء يبيع بائع',
      'ربا': 'الربا ربوي فائدة',
      'دليل': 'الدليل الأدلة لقوله لحديث برهان',
    };
    const words = question.replace(/[؟?!،,.]/g, '').split(/\s+/);
    const alternatives = [];
    for (const word of words) {
      const clean = word.replace(/[ال]/g, '');
      for (const [key, val] of Object.entries(synonymMap)) {
        if (word.includes(key) || key.includes(word)) {
          alternatives.push(val);
        }
      }
    }
    return alternatives.length > 0 ? alternatives.join(' ') : null;
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
   * بناء الـ prompt للمستخدم
   */
  buildUserPrompt(question, contextText) {
    return `السؤال: ${question}

━━━━━━━━ النصوص المسترجعة من الكتب ━━━━━━━━

${contextText}

━━━━━━━━ نهاية النصوص ━━━━━━━━

التعليمات الصارمة جداً:
1. اقرأ كل النصوص أعلاه كلمة كلمة بتأنٍ شديد. لا تتسرع.
2. أعد قراءة النصوص مرة ثانية وتأكد أنك لم تفوّت أي معلومة متعلقة بالسؤال.
3. استخرج كل معلومة مفيدة تجدها في هذه النصوص تتعلق بالسؤال، حتى لو كانت جزئية أو متفرقة.
4. رتب المعلومات بشكل تفصيلي وشامل مع ذكر الحكم والدليل والمصدر.
5. يمنع منعاً باتاً اختراع أو استنتاج أي معلومة من خارج النصوص المرفقة.
6. تأكد من إسناد كل معلومة إلى اسم الكتاب ورقم الصفحة الصحيح كما هو مذكور في النص.
7. لا تخمن أرقام الصفحات أبداً - استخدم فقط ما هو مكتوب في المصدر.
8. صِغ إجابة واضحة ومفصّلة تشمل: الحكم الشرعي، الأدلة، أقوال العلماء (من النصوص فقط).`;
  }

  /**
   * prompt إعادة المحاولة بتعليمات أقوى
   */
  getStrictRetryPrompt() {
    return `أنت باحث متخصص في النصوص الشرعية. لديك نصوص مسترجعة من كتب شرعية وعليك الإجابة منها فقط.

القاعدة الوحيدة: أي معلومة موجودة في النصوص المرفقة ولها علاقة بالسؤال يجب ذكرها وتنظيمها. لا تقل "لم أجد" إلا إذا كانت النصوص كلها لا علاقة لها بالسؤال إطلاقاً.

حتى لو كانت المعلومات جزئية أو غير مباشرة، اجمعها وقدمها بشكل مفيد مع ذكر المصدر.`;
  }

  buildRetryPrompt(question, contextText) {
    return `السؤال: ${question}

النصوص المتوفرة:
${contextText}

المطلوب: اقرأ النصوص بعناية فائقة واستخرج كل ما يتعلق بالسؤال مع ذكر المصدر ورقم الصفحة. قدم إجابة شاملة ومنظمة.`;
  }

  /**
   * تلخيص فصل من كتاب
   */
  async summarize(bookId, chapter) {
    const contexts = await vectorStore.search(
      `${chapter} تلخيص`,
      { nResults: 20, bookId }
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
        nResults: 15,
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
   * التعليمات الأساسية للنموذج - صارمة وتمنع الهلوسة مع التحقق المتعدد
   */
  getSystemPrompt() {
    return `أنت عالم شرعي متخصص ومساعد بحثي دقيق جداً. مهمتك هي الإجابة على الأسئلة الدينية بالاعتماد **حصراً وفقط** على النصوص المسترجعة من كتب العلم الشرعي المرفقة لك.

## قواعد صارمة (يمنع مخالفتها مطلقاً):
1. **لا تستخدم أبداً معلوماتك السابقة**: كل حرف في إجابتك يجب أن يكون مستخرجاً من النصوص المرفقة فقط.
2. **اقرأ النصوص مرتين على الأقل**: في المرة الأولى افهم المحتوى العام، وفي المرة الثانية استخرج التفاصيل الدقيقة.
3. **لا تتسرع بالاعتذار أبداً**: النصوص المرفقة غالباً تحتوي على الإجابة أو أجزاء منها. اجمع كل الأجزاء المتعلقة بالسؤال ورتبها. لا تقل "لا أعلم" إلا إذا كانت كل النصوص لا علاقة لها بالسؤال إطلاقاً.
4. **التوثيق الدقيق**: كل معلومة تذكرها يجب أن ترافقها [اسم الكتاب، الصفحة X] مأخوذة من النص المرفق مباشرة. لا تخمن الأرقام.
5. **الشمولية**: اجمع كل الفوائد والأحكام والأقوال من جميع النصوص المرفقة، لا تكتفِ بنص واحد.
6. **التحقق الذاتي**: قبل إرسال إجابتك، راجعها وتأكد أن كل معلومة فيها لها مصدر في النصوص المرفقة.

## هيكل الإجابة:
- **الحكم الشرعي**: ما هو الحكم الموجود في النصوص.
- **الأدلة**: الآيات والأحاديث المذكورة في النصوص حصراً.
- **أقوال العلماء**: الآراء المذكورة في النصوص مع نسبتها لأصحابها.
- **المصدر**: [اسم الكتاب، الصفحة X] بعد كل معلومة.

أجب بالعربية الفصحى بشكل مفصّل وشامل.`;
  }
}

module.exports = new RAGEngine();
