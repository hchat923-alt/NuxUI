import { AIModel } from '../types';
import { getStoredCustomModels } from '../services/apiKeys';

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash';

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google Gemini',
    description: 'نموذج فائق السرعة والأداء للذكاء الاصطناعي مع إمكانيات تحليل واستدلال متقدمة',
    descriptionEn: 'Ultra-fast high-performance model by Google Gemini',
    badge: 'مجاني',
    badgeEn: 'Free',
    highlight: true,
    contextWindow: '1M',
    iconType: 'gemini',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google Gemini',
    description: 'أقوى نموذج للاستدلال المعمق وحل المسائل البرمجية والرياضية المعقدة',
    descriptionEn: 'Most powerful model for deep reasoning and complex problem solving',
    badge: 'احترافي',
    badgeEn: 'Pro',
    highlight: true,
    contextWindow: '2M',
    iconType: 'gemini',
  },
  {
    id: 'gemini-flash-lite',
    name: 'Gemini Flash Lite',
    provider: 'Google Gemini',
    description: 'نموذج سريع جداً ومخفف للإجابات اللحظية والمحادثات السريعة',
    descriptionEn: 'Ultra-lightweight model for instant responses',
    badge: 'سريع',
    badgeEn: 'Fast',
    contextWindow: '1M',
    iconType: 'gemini',
  },
  {
    id: 'gemini-thinking',
    name: 'Gemini Deep Reasoner',
    provider: 'Google Gemini',
    description: 'نموذج الاستدلال المنطقي والتفكير الداخلي المعمق لفك الحسابات الدقيقة',
    descriptionEn: 'Deep logical reasoning and adaptive internal thought model',
    badge: 'استدلال',
    badgeEn: 'Thinking',
    highlight: true,
    contextWindow: '1M',
    iconType: 'gemini',
  },
];

export function prettifyModelSlug(slug: string): string {
  if (!slug) return 'AI Model';
  const clean = slug.replace(/^pollinations:/, '').replace(/^gemini:/, '').trim().toLowerCase();
  const known: Record<string, string> = {
    'openai-fast': 'GPT-4o Mini',
    'openai': 'GPT-4o',
    'openai-large': 'GPT-4o Large',
    'claude': 'Claude 3.5 Sonnet',
    'claude-sonnet': 'Claude 3.5 Sonnet',
    'deepseek': 'DeepSeek V3',
    'deepseek-r1': 'DeepSeek R1',
    'deepseek-chat': 'DeepSeek V3',
    'llama': 'Llama 3.3 70B',
    'llama-3.3-70b': 'Llama 3.3 70B',
    'qwen': 'Qwen 2.5 72B',
    'qwen-coder': 'Qwen 2.5 Coder',
    'mistral': 'Mistral Large',
    'mistral-large': 'Mistral Large',
    'grok': 'Grok 2',
    'glm': 'GLM-4',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-flash-lite': 'Gemini Flash Lite',
    'gemini-thinking': 'Gemini Deep Reasoner',
  };
  if (known[clean]) return known[clean];

  return clean
    .split(/[-_/]+/)
    .map((w) => {
      if (['gpt', 'ai', 'llm', 'glm', 'r1', 'v3', '70b', 'mini', 'pro', 'lite'].includes(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

export function inferProviderFromModelId(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes('deepseek')) return 'DeepSeek';
  if (lower.includes('openai') || lower.includes('gpt')) return 'OpenAI';
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Anthropic';
  if (lower.includes('llama') || lower.includes('meta')) return 'Meta';
  if (lower.includes('qwen') || lower.includes('alibaba')) return 'Alibaba';
  if (lower.includes('mistral')) return 'Mistral AI';
  if (lower.includes('grok') || lower.includes('xai')) return 'xAI';
  if (lower.includes('gemini') || lower.includes('google')) return 'Google Gemini';
  if (lower.startsWith('custom:')) return 'Custom Server';
  return 'Pollinations';
}

export function getModelById(id: string, dynamicModels: AIModel[] = []): AIModel {
  if (!id) return AVAILABLE_MODELS[0];
  const cleanId = id.replace(/^gemini:/, '').replace(/^pollinations:/, '').trim();

  // 1. Check custom saved models
  if (id.startsWith('custom:')) {
    const customList = getStoredCustomModels();
    const foundCustom = customList.find((m) => m.id === id);
    if (foundCustom) {
      return {
        id: foundCustom.id,
        name: foundCustom.name,
        provider: 'Custom Server',
        groupName: foundCustom.groupName,
        description: '',
        descriptionEn: '',
        badge: 'Custom',
        badgeEn: 'Custom',
        iconType: 'openai',
      };
    }
  }

  // 2. Check dynamic or available models list
  const allModels = [...AVAILABLE_MODELS, ...dynamicModels];
  const found = allModels.find((m) => m.id === cleanId || m.id === id || m.id === `pollinations:${cleanId}`);
  if (found) {
    return found;
  }

  // 3. If explicit Gemini model requested
  if (cleanId.startsWith('gemini') || id.startsWith('gemini')) {
    const geminiMatch = AVAILABLE_MODELS.find((m) => m.id === cleanId || m.id === id);
    return geminiMatch || AVAILABLE_MODELS[0];
  }

  // 4. Construct high-fidelity AIModel for the requested non-Gemini ID rather than overwriting to Gemini
  const modelName = prettifyModelSlug(cleanId);
  const provider = inferProviderFromModelId(cleanId);
  return {
    id: id.startsWith('pollinations:') ? id : `pollinations:${cleanId}`,
    name: modelName,
    provider: provider,
    description: `نموذج ${modelName} المتاح للذكاء الاصطناعي`,
    descriptionEn: `${modelName} AI model`,
    badge: 'مجاني',
    badgeEn: 'Free',
    contextWindow: '128K',
    iconType: provider.toLowerCase().includes('openai') ? 'openai' : 'pollinations',
  };
}
