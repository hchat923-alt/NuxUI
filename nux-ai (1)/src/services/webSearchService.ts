import { SearchSource, SearchMetadata } from '../types';

/**
 * Core Autonomous Web Search Directive:
 * Search the web automatically before answering questions involving prices, statistics, recent events, APIs, tools, or current state.
 */
export const AUTONOMOUS_WEB_SEARCH_DIRECTIVE = `MANDATORY WEB SEARCH DIRECTIVE:
You MUST search the web before answering any question that involves:
- Prices, statistics, or numbers
- Recent events or news
- Any information that could have changed
- APIs, tools, or products and their features
- Anything the user asks "currently" or "now"

Never rely on your training data alone for these topics.
Always search first, then answer.`;

// Negative patterns where web search should NOT trigger
// (identity, model queries, persona, coding, algorithmic, general conversation, math)
const SEARCH_IGNORE_PATTERNS: RegExp[] = [
  /من\s+أنت|مين\s+انت|من\s+انت|من\s+المطور|من\s+صنعك|من\s+صممك|من\s+دربك/i,
  /\b(?:who\s+are\s+you|what\s+is\s+your\s+name|who\s+created\s+you|who\s+made\s+you|who\s+developed\s+you)\b/i,
  /أي\s+نموذج|اي\s+نموذج|ما\s+هو\s+النموذج|ما\s+اسمك|ماهو\s+النموذج|ما\s+النموذج|ما\s+نوع\s+النموذج|نموذج\s+انت/i,
  /\b(?:which\s+model|what\s+model|current\s+model|model\s+are\s+you)\b/i,
  /ما\s+هي\s+المبادئ|ما\s+هي\s+مبادئك|ما\s+هي\s+تعليماتك|شخصيتك|هويتك/i,
  /\b(?:what\s+are\s+your\s+principles|what\s+are\s+your\s+instructions)\b/i,
  /خوارزمية\s+البحث/i,
  /\b(?:binary\s+search|linear\s+search|depth\s+first\s+search|breadth\s+first\s+search|dfs|bfs)\b/i,
  /^\s*(?:اكتب|اكتبلي|أنشئ|انشئ|صمم|اعمل)\s+(?:لي\s+)?(?:كود|دالة|سكربت|مكون)/i,
  /^\s*(?:write|create|generate)\s+(?:a\s+)?(?:code|function|script|component)\b/i,
  /\b(?:debug|solve\s+(?:this\s+)?equation)\b/i,
  /حل\s+المعادلة/i,
  /^\s*(?:ترجم|ترجملي|ترجمة)\b/i,
  /^\s*translate\b/i,
  /^(?:مرحبا|أهلا|اهلا|سلام|سلام\s+عليكم|مراحب|صباح\s+الخير|مساء\s+الخير)(?:[\s!.,؟]*)$/i,
  /^(?:hi|hello|hey|good\s+morning|good\s+evening)(?:[\s!.,?]*)$/i,
];

// Smart real-time and time-sensitive trigger patterns
const SMART_REALTIME_PATTERNS: RegExp[] = [
  // Explicit search commands / prefixes
  /^\/(?:search|بحث)(?:\s|$)/i,
  /^(?:ابحث|بحث|فتش|دور)\s+(?:لي\s+)?(?:في\s+الويب|في\s+النت|على\s+الإنترنت|على\s+الانترنت|عن)(?:\s|$)/i,
  /^(?:search|browse|look\s+up|google)\s+(?:the\s+web\s+for|for|about)?/i,

  // Real-time news, current live events, updates
  /(?:آخر|اخر|أحدث|احدث)\s+(?:أخبار|اخبار|مستجدات|تطورات|أحداث|احداث|إصدارات|اصدارات)/i,
  /(?:أخبار|اخبار|عاجل|مستجدات|تطورات)\s+(?:اليوم|العالم|الشرق|السياسة|الرياضة|التكنولوجيا)/i,
  /\b(?:latest|breaking|recent)\s+(?:news|updates|developments|headlines|events)\b/i,

  // Time-sensitive words and markers
  /(?:اليوم|أمس|امس|البارحة|الآن|الان|حاليا|حالياً|في\s+هذه\s+الأثناء|هذا\s+الأسبوع|هذا\s+الشهر|هذا\s+العام|هذه\s+السنة|مؤخرا|مؤخراً|حديثا|حديثاً)/i,
  /\b(?:today|yesterday|now|currently|recent|recently|this\s+week|this\s+month|this\s+year)\b/i,

  // Years associated with current / recent events
  /\b(?:2024|2025|2026|2027)\b/,

  // Financial, economic, and commodity prices
  /(?:سعر|اسعار|أسعار|كم\s+سعر|كم\s+وصل)\s+(?:الذهب|الفضة|النفط|الدولار|اليورو|الريال|الجنيه|العملات|البيتكوين|سهم|الأسهم|crypto|bitcoin|btc|eth|stock|stocks)/i,
  /\b(?:price\s+of|exchange\s+rate|crypto\s+price|stock\s+price)\b/i,

  // Sports scores, fixtures, standings, tournaments
  /(?:نتائج|نتيجة|مباريات|مباراة|مباريات\s+اليوم|موعد\s+مباراة|دوري|كأس|كاس|ترتيب\s+الدوري)/i,
  /\b(?:score|match|game\s+result|standing|fixtures|live\s+score)\b/i,

  // Weather & environmental conditions
  /(?:حالة\s+الطقس|درجة\s+الحرارة|الطقس\s+اليوم|توقعات\s+الطقس|أحوال\s+الطقس)/i,
  /\b(?:current\s+weather|temperature\s+today|weather\s+forecast)\b/i,

  // Current leaders, public figures, elections, appointments
  /(?:من\s+هو\s+رئيس|من\s+هو\s+وزير|من\s+هو\s+مدرب|من\s+هو\s+مدير|من\s+هو\s+أمين|من\s+فاز\s+بـ|من\s+فاز\s+في|من\s+توج\s+بـ)/i,
  /\b(?:who\s+is\s+the\s+current|who\s+is\s+the\s+president|who\s+is\s+the\s+ceo|who\s+won\s+the)\b/i,

  // Product releases, status, events
  /(?:متى\s+موعد|متى\s+يصدر|تاريخ\s+إصدار|تاريخ\s+اصدار|هل\s+نزل|هل\s+تم\s+إطلاق|هل\s+تم\s+اطلاق|ماذا\s+حدث\s+لـ|ما\s+الجديد\s+في)/i,
  /\b(?:release\s+date|what\s+happened\s+to|what\s+is\s+new\s+in|is\s+it\s+released)\b/i,
];

// Realtime keyword fallback
const REALTIME_KEYWORDS: RegExp[] = [
  /\b(?:حالا|حالياً|الآن|الان|اليوم|أمس|امس|البارحة|مؤخرا|مؤخراً|مستجدات|تطورات|أخبار|اخبار)\b/,
  /\b(?:now|today|recently|latest|recent|news|current|currently)\b/i,
  /\b(?:سعر|أسعار|اسعار|تكلفة|رسوم|الطقس|مباراة|مباريات|نتائج|الذهب|الدولار|البيتكوين)\b/,
  /\b(?:price|pricing|cost|weather|match|scores|bitcoin|stock)\b/i,
];

/**
 * Determines whether the user query benefits from autonomous real-time web search
 * or was triggered via /search
 */
export function shouldTriggerWebSearch(userPrompt: string): boolean {
  if (!userPrompt || typeof userPrompt !== 'string') return false;
  const clean = userPrompt.trim();
  if (clean.length < 3) return false;

  // 1. Explicit search commands always win
  if (
    /^\/(?:search|بحث)(?:\s|$)/i.test(clean) ||
    /^(?:ابحث|بحث|فتش|دور|ابحثلي|search|browse|google)(?:\s|$)/i.test(clean)
  ) {
    return true;
  }

  // 2. Exclude pure trivial greetings (short)
  if (
    clean.length < 25 &&
    /^(?:مرحبا|أهلا|اهلا|سلام|سلام\s+عليكم|مراحب|صباح\s+الخير|مساء\s+الخير|hi|hello|hey|good\s+morning|good\s+evening)[\s!.,؟?]*$/i.test(clean)
  ) {
    return false;
  }

  // 3. Check negative ignore patterns
  for (const ignorePattern of SEARCH_IGNORE_PATTERNS) {
    if (ignorePattern.test(clean)) {
      return false;
    }
  }

  // 4. Exclude pure math operations (e.g. 5 + 5, 100 / 4)
  if (/^[\d\s+\-*/()^.,=]+$/.test(clean)) {
    return false;
  }

  // 5. Exclude pure local code generation without factual questions
  if (
    /^(?:اكتب|سوي|اصنع|انشئ|write|create|generate)\s+(?:دالة|كود|مكون|script|function|component)\s+[a-z0-9_\s]+$/i.test(clean) &&
    !/\b(?:api|gpt|gemini|claude|deepseek|model|models|سعر|مجاني|موقع|خدمة|تحديث|أخبار|اخبار|2025|2026)\b/i.test(clean)
  ) {
    return false;
  }

  // 6. Check real-time & time-sensitive patterns
  for (const realtimePattern of SMART_REALTIME_PATTERNS) {
    if (realtimePattern.test(clean)) {
      return true;
    }
  }

  // 7. Fallback on realtime keywords
  for (const pattern of REALTIME_KEYWORDS) {
    if (pattern.test(clean)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts optimized keywords from user prompt for search engines
 */
export function extractSearchQuery(userPrompt: string): string {
  let cleaned = (userPrompt || '').trim();

  const prefixes: RegExp[] = [
    /^\/(?:search|بحث)\s*/i,
    /^(?:ابحث|بحث|فتش|دور)\s+(?:لي\s+)?(?:عن\s+)?(?:في\s+الويب\s+عن\s+)?(?:في\s+النت\s+عن\s+)?(?:على\s+الإنترنت\s+عن\s+)?/i,
    /^ممكن\s+تبحث\s+(?:لي\s+)?(?:عن\s+)?/i,
    /^دور\s+(?:لي\s+)?(?:عن\s+)?/i,
    /^search\s+(?:for\s+)?(?:the\s+web\s+for\s+)?/i,
    /^please\s+search\s+(?:for\s+)?/i,
    /^can\s+you\s+search\s+(?:for\s+)?/i,
    /^look\s+up\s+/i,
    /^what\s+is\s+the\s+latest\s+on\s+/i,
    /^tell\s+me\s+about\s+the\s+latest\s+/i,
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  cleaned = cleaned.replace(/[؟?!.،,]/g, ' ').trim();

  return cleaned || (userPrompt || '').trim();
}

/**
 * Performs the autonomous web search request to the backend
 */
export async function performWebSearch(
  query: string,
  signal?: AbortSignal
): Promise<SearchMetadata> {
  const cleanQuery = extractSearchQuery(query);
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: cleanQuery, maxResults: 16 }),
      signal,
    });

    if (!res.ok) {
      return { isSearching: false, query: cleanQuery, sources: [] };
    }

    const data = await res.json();
    const sources: SearchSource[] = Array.isArray(data?.sources) ? data.sources : [];

    return {
      isSearching: false,
      query: cleanQuery,
      sources,
    };
  } catch (err) {
    console.warn('performWebSearch failed:', err);
    return {
      isSearching: false,
      query: cleanQuery,
      sources: [],
    };
  }
}

/**
 * Formats web search findings as concise grounding context for LLMs
 */
export function formatSearchContextForModel(metadata: SearchMetadata): string {
  if (!metadata.sources || metadata.sources.length === 0) return '';

  const formattedSources = metadata.sources
    .map(
      (s, index) =>
        `[${index + 1}] عنوان: ${s.title}\nالمصدر: ${s.domain || s.url}\nالتفاصيل: ${s.snippet || s.title}\nالرابط: ${s.url}`
    )
    .join('\n\n');

  return `\n\n[معلومات ونتائج البحث الحي في الويب]:
تم إجراء بحث مباشر وعميق على الإنترنت وجلب المصادر والمعلومات التالية حول ("${metadata.query}"):

${formattedSources}

[توجيه إلزامي للنموذج / MANDATORY WEB SEARCH DIRECTIVE]:
You MUST search the web before answering any question that involves prices, statistics, numbers, recent events, APIs, tools, features, or current state ("currently" / "now"). Never rely on your training data alone for these topics.

1. استخدم نتائج البحث الحية المذكورة أعلاه لتقديم إجابة وافية وشاملة ودقيقة ورسمية.
2. إذا طلب المستخدم مبيانات أو رسماً بيانياً أو مقارنة إحصائية أو تطوراً زمنياً (مبيان / رسم بياني / مخطط / إحصائيات):
   - يجب عليك تمثيل البيانات في مبيان تفاعلي حصراً باستخدام قالب الكود \`\`\`chart ... \`\`\` مع بنية JSON صحيحة (type: 'line' | 'bar' | 'scatter', title, data array).
   - يُمنع منعاً باتاً الرفض أو القول "لا توجد بيانات" أو طلب جدول ماركداون فارغ. إذا كانت الإحصاءات المباشرة غير مجمعة في مصدر واحد، قم باستقراء وتوليد التقديرات العلمية والمعايير القياسية (مثل خط الأساس لـ IQ = 100، وتأثير فلين، والدراسات النفسية والمعرفية) وتمثيلها في المبيان التفاعلي مع الشرح التوضيحي.`;
}
