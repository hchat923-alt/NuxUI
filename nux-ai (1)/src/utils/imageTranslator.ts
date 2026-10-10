/**
 * Fast & Reliable Image Prompt Translator (Arabic/Multilingual -> English)
 * Translates prompts to rich descriptive English for AI visual sketch generation.
 */

export function stripArabicImagePrefixes(input: string): string {
  if (!input) return '';
  let text = input.trim();

  // Strip wrapping quotes
  text = text.replace(/^["'«»“”]|["'«»“”]$/g, '').trim();

  // Strip common conversational image request prefixes in Arabic and English
  const prefixRegexes = [
    /^(أريد|اريد|أنشئ|انشئ|اصنع|توليد|ولد|ارسم|صمم|اعطني|هات)\s+(صورة|صور|رسوم|تصميم)\s+(لـ|عن|بـ|تظهر|تجسد)?/i,
    /^(صورة|صور|تصميم)\s+(لـ|عن|بـ|تظهر|تجسد)/i,
    /^(أريد|اريد|أنشئ|انشئ|اصنع|توليد|ولد|ارسم|صمم)\s+/i,
    /^(i want|generate|create|draw|make|show me)\s+(a|an)?\s+(picture|image|photo|drawing|design)\s+(of)?/i,
    /^\/img\s*/i,
  ];

  for (const rx of prefixRegexes) {
    text = text.replace(rx, '').trim();
  }

  // Strip leading/trailing punctuation left behind
  text = text.replace(/^["'«»“”:]|["'«»“”:]$/g, '').trim();

  return text;
}

const COMMON_AR_TO_EN_MAP: Record<string, string> = {
  'مكتبة بغداد': 'The Grand House of Wisdom Library of Baghdad with ancient Islamic architecture and manuscripts',
  'مكتبة': 'grand library with bookshelves',
  'بغداد': 'historic Baghdad',
  'فتاة': 'a young woman',
  'بنت': 'a girl',
  'رجل': 'a man',
  'شاب': 'a young man',
  'حجاب': 'hijab',
  'أسد': 'a majestic lion',
  'غابة': 'a lush forest',
  'ذهبية': 'golden',
  'سيارة': 'a luxury sports car',
  'مدينة': 'a futuristic city',
  'نيون': 'neon lighting',
  'غروب': 'sunset twilight',
  'صحراء': 'a golden desert',
  'قطة': 'a cute cat',
  'كلب': 'a cute dog',
  'وردة': 'a beautiful rose flower',
  'عمارة إسلامية': 'islamic architecture with carved arches',
  'مسجد': 'a grand mosque with minarets',
  'طبيعة': 'breathtaking landscape nature',
  'قلعة': 'ancient fortress castle',
  'جبل': 'majestic mountain peak',
  'بحر': 'deep blue ocean',
};

export async function translatePromptToEnglish(rawPrompt: string): Promise<string> {
  const stripped = stripArabicImagePrefixes(rawPrompt);
  if (!stripped) return 'a realistic high quality masterpiece image';

  // If prompt is already mostly English (>70% ASCII letters), return clean
  const asciiCount = (stripped.match(/[a-zA-Z]/g) || []).length;
  if (asciiCount / Math.max(stripped.length, 1) > 0.7) {
    return stripped;
  }

  // 1. Try server-side AI translation endpoint
  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/translate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: stripped }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.translated && typeof data.translated === 'string' && data.translated.length > 3) {
        return data.translated;
      }
    }
  } catch (_) {}

  // 2. Local fallback dictionary replacement
  let translated = stripped;
  for (const [ar, en] of Object.entries(COMMON_AR_TO_EN_MAP)) {
    translated = translated.replace(new RegExp(ar, 'g'), en);
  }

  return `${translated}, photorealistic, 8k resolution, cinematic lighting, highly detailed`;
}
