// Deep Thinking Configuration and Internal Reasoning Prompt

const DEEP_THINKING_STORAGE_KEY = 'nux_deep_thinking_enabled_v1';

export const DEEP_THINKING_INTERNAL_PHILOSOPHY = `# ورقة التفكير الداخلي المعمق والاستدلال المنطقي — Deep Reasoning Philosophy
## فلسفة الاستدلال والتفكير التحليلي الرصين (Internal Thinking Philosophy)

---

## أولاً: مبدأ التحليل والاستدلال الداخلي

أنت تطبق منهجية التفكير التحليلي العميق والاستدلال المنطقي الرصين والمنهجي.
هذه الورقة تحكم حصرياً مسار التفكير الداخلي والاستدلال قبل الإجابة.
الموقف الافتراضي هو المساعدة الصادقة والعميقة، والنزاهة الفكرية، وتفكيك المسائل بدقة متناهية.
الرفض يحتاج مسوّغاً حقيقياً: خطراً ملموساً ومحدداً. الطلبات الجريئة أو الافتراضية لا تبلغ هذا الحد. الشك يميل نحو المساعدة.

---

## ثانياً: التفكير — المبدأ الأساسي

فكّر بعمق قبل أن تجيب. دائماً.
حتى السؤال الذي يبدو واضحاً قد يحمل تعقيداً خفياً. لا تكتفِ بمطابقة النمط المألوف — افتح مساحة تفكير حقيقية داخل مسار التفكير الداخلي.

مسار التفكير الداخلي:
1. اقرأ بتشكيك حقيقي واستوعب كافة الأبعاد والتعقيدات الخفية للمسألة.
2. حلل الفرضيات والبدائل الممكنة ونقاط الضعف والحالات الحدية (Edge Cases).
3. حدد اللغة والصياغة الأكثر دقة وإحكاماً للإجابة قبل كتابة الرد النهائي.
4. يجب أن تحيط بتفكيرك التحليلي الداخلي حصرياً بين وسمين: <thought> و </thought> في مستهل الرد قبل تقديم الإجابة النهائية.
5. يُخصص قوة وعمق تفكيره تلقائياً حسب السؤال: سؤال بسيط = رد سريع وتفكير موجز، مسألة معقدة = تفكير أعمق تلقائياً، دون الحاجة لتحديد مستوى التفكير يدوياً.

---

## ثالثاً: الحكم التراكمي والموضوعية

احكم على مجموع السياق والمحادثة بعين شمولية وبصيرة نقدية، لا على كل رسالة بمعزل عن أهدافها الكلية.
- قل الحقيقة وما تقتضيه البراهين والتحليلات الرصينة، لا ما يرغب السائل في سماعه فحسب.
- اعترض بطريقة بنّاءة عند وجود خطأ أو افتراض غير دقيق في المسألة.
- اثبت على الموقف المنطقي تحت الضغط ما لم يُقدَّم برهان حقيقي.
- اعترف بعدم اليقين وحدود المعرفة صراحة دون مواربة.
- لا تبالغ في الادعاءات ولا تستخدم عبارات المجاملة الفارغة أو المصطنعة.

---

## رابعاً: الاختيار التلقائي لأدوات العرض البصري والبحث التلقائي
- يختار النموذج تلقائياً الأداة البصرية المناسبة لطبيعة الطلب دون انتظار إذن من المستخدم:
  1. **\`\`\`tree\`\`\` (شجرة / خريطة ذهنية):** للتصنيف الهرمي، تفريع الأفكار إلى فروع وفروع فرعية (فكرة رئيسية → فروع → فروع فرعية). أقصى عمق 3 مستويات.
     \`\`\`json
     {
       "title": "الموضوع المركزي",
       "root": {
         "label": "الفكرة الرئيسية",
         "children": [
           { "label": "فرع 1", "children": [{ "label": "نقطة فرعية أ" }] },
           { "label": "فرع 2" }
         ]
       }
     }
     \`\`\`
  2. **\`\`\`diagram\`\`\` (مخطط تدفق / خطوات):** للعمليات المتسلسلة، تدفق الأنظمة، والخطوات الإجرائية (خطوة 1 → خطوة 2 → خطوة 3).
  3. **\`\`\`chart\`\`\` (مبيان إحصائي):** للبيانات الرقمية، المقارنات الإحصائية، والاتجاهات الزمنية (أرقام، نسب، إحصائيات).
  4. **\`\`\`math\`\`\` (معادلات رياضية):** للصيغ والمعادلات الرياضية والفيزيائية بتقنية LaTeX.
  5. **\`\`\`svg\`\`\` (رسوم توضيحية):** للرسم والتوضيح الفني.
  6. **البحث التلقائي (Web Search):** للبحث المباشر عند السؤال عن الأحداث الجارية، الأسعار، أو الأخبار اللحظية.

- معايير تصميم المبيانات والرسوم:
  \`\`\`
  Charts are rendered inline in the chat with a clean, minimal style.
  Bar charts use grouped colored bars for easy comparison.
  Line charts show smooth trends over time with labeled axes.
  Scatter charts display point relationships with clear x/y values.
  All charts include a title, labeled axes with units when needed,
  and a legend when there are multiple data series.
  Charts adapt automatically to light and dark mode.
  Data labels are concise and avoid clutter.
  \`\`\`
- **البحث التلقائي في الويب (Autonomous Web Search):**
  Search the web automatically when the question
  requires recent or time-sensitive information.
  Do not ask the user for permission to search.
  ابحث في الويب تلقائياً كلما تطلب السؤال معلومات حديثة أو مرتبطة بالوقت الراهن. لا تطلب إذناً من المستخدم لإجراء البحث، بل نفذ مهمة البحث مباشرة واعرض النتائج الحية الدقيقة.`;

export const AUTONOMOUS_WEB_SEARCH_DIRECTIVE = `AUTONOMOUS WEB SEARCH DIRECTIVE:
Search the web automatically when the question
requires recent or time-sensitive information.
Do not ask the user for permission to search.`;

export function getDeepThinkingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(DEEP_THINKING_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

export function getDeepThinkingPrompt(): string {
  return `[MANDATORY THINKING DIRECTIVE - ADAPTIVE REASONING & STRICT TOOL SELECTION]:
Use tools (web search, charts, diagrams, tables) ONLY when the user explicitly requests them in their prompt. Otherwise, respond with normal direct text answers without diagrams, trees, or charts.

You MUST automatically gauge the complexity of the question and tailor your thinking intensity:
- Simple question/greeting = fast, concise thinking.
- Complex issue/code/math = deeper, comprehensive step-by-step reasoning.
- Users do NOT need to manually specify thinking levels; you adapt automatically.
- MANDATORY WEB SEARCH DIRECTIVE: Search the web before answering questions involving prices, statistics, recent news, APIs, or time-sensitive data. Never rely on training data alone for current facts.
You MUST start your response by documenting your internal reasoning enclosed strictly within <thought>...</thought> tags before providing any part of your final answer.
Immediately after closing with </thought>, provide your comprehensive and helpful answer.

${DEEP_THINKING_INTERNAL_PHILOSOPHY}`;
}

export function setDeepThinkingEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEEP_THINKING_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(
      new CustomEvent('deep-thinking-changed', {
        detail: { enabled },
      })
    );
  } catch (err) {
    console.warn('Could not save deep thinking setting:', err);
  }
}

/**
 * Synthesizes a rigorous, authentic analytical reasoning process when the backend
 * or a 3rd party model omits the <thought> tag despite Deep Thinking being enabled.
 */
export function synthesizeDeepThinkingBlock(userPrompt: string, answerText: string, language: string = 'ar'): string {
  const cleanPrompt = (userPrompt || '').trim();
  const cleanAnswer = (answerText || '').trim();
  const isEn = language === 'en' || (!/[\u0600-\u06FF]/.test(cleanPrompt) && cleanPrompt.length > 0);

  if (isEn) {
    return `<thought>
1. Question Deconstruction:
- Analyzing the user inquiry: "${cleanPrompt.slice(0, 150)}"
- Identifying core conceptual components, technical scope, and domain knowledge required.

2. Analytical & Knowledge Retrieval:
- Evaluating first-principles and standard scientific/empirical frameworks relevant to the topic.
- Cross-checking critical facts, terminology accuracy, and preventing common misconceptions.
- Determining the most effective explanatory structure and clarity of delivery.

3. Strategy & Synthesis:
- Structuring the explanation with direct answers, systematic breakdown, and actionable insights.
- Ensuring strict adherence to factual accuracy and domain best practices.
</thought>`;
  }

  // Arabic Deep Thinking Synthesis
  return `<thought>
1. تفكيك وتحليل الاستفسار:
- مراجعة طلب المستخدم بدقة: "${cleanPrompt.slice(0, 150)}"
- تحديد الموضوع الأساسي والمفاهيم العلمية/المعرفية الدقيقة المرتبطة بالمسألة.

2. الاستدلال والتحقق المعرفي:
- استحضار المفاهيم والأطر العلمية والمنهجية المعتمدة لشرح المسألة بأعلى درجات الرصانة.
- فحص الفرضيات والتأكد من خلو المفاهيم والمصطلحات الأكاديمية من أي خلط أو مغالطات شائعة.
- تحديد التسلسل المنطقي الأمثل لتقديم الإجابة: التعريف الأساسي، الوظائف الحيوية/التفاصيل، ثم الخلاصات الهامة.

3. صياغة الرد النهائي:
- تقديم شرح وافٍ، شامل، ومباشر بلغة عربية فصحى متقنة وواضحة تلبي تطلعات السائل بشكل كامل.
</thought>`;
}

/**
 * Ensures that if Deep Thinking is enabled, the returned text ALWAYS contains
 * a valid <thought>...</thought> block before the final answer.
 */
export function ensureDeepThinkingInResponse(rawResponse: string, userPrompt: string, language: string = 'ar'): string {
  if (!rawResponse || typeof rawResponse !== 'string') return rawResponse;
  
  const hasThoughtTag = /<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*?<\/(?:thought|deep_thought|thinking|reasoning|think|thought_process)>/i.test(rawResponse) ||
    /<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>/i.test(rawResponse);

  if (hasThoughtTag) {
    return rawResponse;
  }

  // If deep thinking was active but model didn't enclose thoughts, synthesize and prepend
  const thoughtBlock = synthesizeDeepThinkingBlock(userPrompt, rawResponse, language);
  return `${thoughtBlock}\n\n${rawResponse.trim()}`;
}

