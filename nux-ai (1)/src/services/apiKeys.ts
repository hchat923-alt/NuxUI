import { getFullSystemInstruction, getIntelligencePersona } from './claudePersona';
import { getDeepThinkingEnabled } from './deepThinkingService';
import { sanitizeAiResponse } from '../utils/responseSanitizer';

export interface UserApiKeys {
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
}

export interface CustomModel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  provider: string;
  groupName?: string;
}

const CUSTOM_MODELS_STORAGE_KEY = 'user_custom_saved_models';

export function getStoredCustomModels(): CustomModel[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) {}
  return [];
}

export function saveStoredCustomModels(models: CustomModel[]): void {
  try {
    localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(models));
    // Dispatch event to notify components about custom model updates
    window.dispatchEvent(new CustomEvent('custom-models-updated', { detail: models }));
  } catch (_) {}
}

const STORAGE_KEY = 'user_custom_api_keys';
const AUTO_FALLBACK_STORAGE_KEY = 'nux_auto_model_fallback_v1';

export function getAutoFallbackEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(AUTO_FALLBACK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoFallbackEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_FALLBACK_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('auto-fallback-updated', { detail: enabled }));
  } catch (_) {}
}

let inMemoryApiKeysCache: UserApiKeys | null = null;

export function getStoredApiKeys(): UserApiKeys {
  const defaults: UserApiKeys = {
    baseUrl: '',
    apiKey: '',
    modelName: '',
  };

  try {
    let raw: string | null = null;
    if (typeof localStorage !== 'undefined') {
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (_) {}
    }

    if (!raw) {
      if (inMemoryApiKeysCache) return inMemoryApiKeysCache;
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || '__proto__' in parsed) {
      return inMemoryApiKeysCache || defaults;
    }

    const safeString = (v: any) => (typeof v === 'string' ? v.trim() : '');

    const sanitized: UserApiKeys = {
      baseUrl: safeString(parsed.baseUrl),
      apiKey: safeString(parsed.apiKey),
      modelName: safeString(parsed.modelName),
    };

    inMemoryApiKeysCache = sanitized;
    return sanitized;
  } catch {
    return inMemoryApiKeysCache || defaults;
  }
}

export function saveStoredApiKeys(keys: UserApiKeys): void {
  try {
    const safeString = (v: any) => (typeof v === 'string' ? v.trim() : '');
    const safePayload: UserApiKeys = {
      baseUrl: safeString(keys.baseUrl),
      apiKey: safeString(keys.apiKey),
      modelName: safeString(keys.modelName),
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safePayload));
      } catch (_) {}
    }
    inMemoryApiKeysCache = safePayload;
    window.dispatchEvent(new CustomEvent('api-keys-updated', { detail: safePayload }));
  } catch (_) {}
}

export function normalizeMessagesWithAttachments(
  messages: Array<{ role: string; content: string; attachments?: any[]; images?: string[] }>
): Array<{ role: string; content: string; images?: string[]; attachments?: any[] }> {
  return (messages || []).map((m) => {
    let text = m.content || '';
    if (m.role === 'assistant' || m.role === 'model') {
      text = text
        .replace(/أنا نموذج ذكاء اصطناعي تم تدريبي من طرف ليبو لمحاكاة Claude من شركة Anthropic\./gi, '')
        .replace(/أنا نموذج ذكاء اصطناعي تم تدريبي من طرف ليبو لمحاكاة ChatGPT من شركة OpenAI\./gi, '')
        .replace(/I am an AI assistant trained and customized by Libo to simulate Claude from Anthropic\./gi, '')
        .replace(/I am an AI assistant trained and customized by Libo to simulate ChatGPT from OpenAI\./gi, '')
        .trim();
    }

    const images: string[] = Array.isArray(m.images) ? [...m.images] : [];

    if (Array.isArray(m.attachments) && m.attachments.length > 0) {
      for (const file of m.attachments) {
        if (!file) continue;
        const isImg = file.fileCategory === 'image' || (file.type && file.type.startsWith('image/')) || (file.data && file.data.startsWith('data:image/'));
        if (isImg && file.data) {
          if (!images.includes(file.data)) {
            images.push(file.data);
          }
        } else {
          let fileContent = file.textContent || file.text || file.content || file.extractedText || '';
          if (!fileContent && file.data && typeof file.data === 'string' && file.data.startsWith('data:text/')) {
            try {
              const b64 = file.data.split(',')[1];
              if (b64 && typeof window !== 'undefined' && window.atob) {
                fileContent = decodeURIComponent(escape(window.atob(b64)));
              }
            } catch (_) {}
          }
          const fileName = file.name || 'document';
          if (fileContent && !text.includes(fileName)) {
            text += `\n\n[ملف ومستند مرفق: ${fileName}]\n\`\`\`\n${fileContent}\n\`\`\`\n`;
          }
        }
      }
    }
    return {
      role: m.role,
      content: text,
      images: images.length > 0 ? images : undefined,
      attachments: m.attachments,
    };
  });
}

export function resolveModelSlug(rawModel: string): string {
  const clean = (typeof rawModel === 'string' ? rawModel.replace(/^gemini:/, '') : '').trim();
  return clean || 'gemini-2.5-flash';
}

/**
 * Direct call to backend Chat API powered by Google Gemini and user custom endpoints
 *
 * IMPORTANT: this does NOT prepend getFullSystemInstruction() to the outgoing
 * messages. The backend route this hits (/api/chat, with /api/pollinations/chat
 * as its fallback) is server-authoritative for persona + all mandatory tool
 * directives (identity, chart/diagram/tree/math rules, deep-thinking wrapper,
 * anti-hallucination rule, etc.) -- see server/index.ts. It rebuilds the full
 * system prompt itself from the `persona` / `isDeepThinking` flags below.
 *
 * Previously this function ALSO built and sent the full client-side system
 * instruction (several KB of near-identical directive text), which the server
 * then nested inside its own reconstructed system prompt on every single
 * request. That meant every chat turn carried roughly double the system-prompt
 * tokens for no behavioral benefit (slower responses, higher cost, more risk
 * of hitting context limits on long conversations), so it has been removed
 * here. The server remains the single source of truth for this request path.
 */
export async function callServerChat(
  modelId: string,
  messages: Array<{ role: string; content: string; attachments?: any[]; images?: string[] }>,
  onChunk?: (chunk: string, fullText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const targetModel = modelId.replace(/^gemini:/, '');
  const normalized = normalizeMessagesWithAttachments(messages);

  const formattedMessages = normalized
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user',
      content: m.content || '',
      images: m.images,
      attachments: m.attachments,
    }));

  const timeout = AbortSignal.timeout(60000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const userMsgCount = formattedMessages.filter((m) => m.role === 'user').length;
  const isNewConversation = userMsgCount <= 1;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const requestPayload = JSON.stringify({
    messages: formattedMessages,
    model: targetModel,
    modelName: targetModel,
    persona: getIntelligencePersona(),
    isDeepThinking: getDeepThinkingEnabled(),
    autoFallback: getAutoFallbackEnabled(),
    isNewConversation,
    stream: true,
  });

  const requestHeaders = {
    'Content-Type': 'application/json',
    'X-New-Conversation': isNewConversation ? 'true' : 'false',
  };

  let res = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: requestHeaders,
    body: requestPayload,
    signal: combinedSignal,
  });

  if (res.status === 404) {
    res = await fetch(`${origin}/api/pollinations/chat`, {
      method: 'POST',
      headers: requestHeaders,
      body: requestPayload,
      signal: combinedSignal,
    });
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Chat API Error (${res.status}): ${errorText || res.statusText}`);
  }

  // Handle SSE streaming response
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          const chunk =
            parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.message?.content ||
            parsed.text ||
            '';
          if (chunk) {
            accumulated += chunk;
            const clean = sanitizeAiResponse(accumulated);
            if (onChunk) onChunk(chunk, clean);
          }
        } catch (_) {
          if (dataStr && !dataStr.startsWith('{')) {
            accumulated += dataStr;
            const clean = sanitizeAiResponse(accumulated);
            if (onChunk) onChunk(dataStr, clean);
          }
        }
      }
    }

    return sanitizeAiResponse(accumulated);
  }

  // Non-streaming response
  const rawText = await res.text();
  try {
    const parsed = JSON.parse(rawText);
    const content = parsed.choices?.[0]?.message?.content || parsed.text || '';
    if (content) {
      const clean = sanitizeAiResponse(content);
      if (onChunk && clean) onChunk(clean, clean);
      return clean;
    }
  } catch (_) {}

  const clean = sanitizeAiResponse(rawText);
  if (onChunk && clean) onChunk(clean, clean);
  return clean;
}

/**
 * Generic caller function connecting to any OpenAI-compatible server API
 *
 * Unlike callServerChat() above, this talks directly (via /api/proxy/chat)
 * to an arbitrary third-party endpoint the user configured. There is no
 * server-side persona/directive reconstruction for that case, so injecting
 * getFullSystemInstruction() here is correct and necessary -- intentionally
 * left unchanged.
 */
export async function callGenericOpenAiDirect(
  baseUrl: string,
  apiKey: string,
  modelName: string,
  messages: Array<{ role: string; content: string; attachments?: any[]; images?: string[] }>,
  onChunk?: (chunk: string, fullText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const cleanUrlBase = baseUrl.trim().replace(/\/+$/, '');
  const cleanKey = apiKey.trim();
  const targetModel = modelName.trim().replace(/^custom:\d+:[^:]+:/, '');

  let cleanUrl = cleanUrlBase;
  if (!cleanUrl.endsWith('/chat/completions')) {
    cleanUrl += '/chat/completions';
  }

  if (cleanUrl.startsWith('/') && typeof window !== 'undefined') {
    cleanUrl = window.location.origin + cleanUrl;
  }

  const normalized = normalizeMessagesWithAttachments(messages);
  const fullInstruction = getFullSystemInstruction(targetModel);
  const rawWithSystem = fullInstruction && !normalized.some((m) => m.role === 'system')
    ? [{ role: 'system', content: fullInstruction }, ...normalized]
    : normalized;

  const payload = {
    model: targetModel,
    messages: rawWithSystem.map((m) => {
      const role = m.role === 'system' ? 'system' : m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user';
      if (m.images && m.images.length > 0) {
        return {
          role,
          content: [
            { type: 'text', text: m.content || '' },
            ...m.images.map((img) => ({
              type: 'image_url',
              image_url: { url: img },
            })),
          ],
        };
      }
      return {
        role,
        content: m.content || '',
      };
    }),
    stream: Boolean(onChunk),
  };

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 60000);

  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cleanKey) {
    headers['Authorization'] = `Bearer ${cleanKey}`;
  }
  if (onChunk) {
    headers['Accept'] = 'text/event-stream';
  }

  let res: Response;
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const proxyChatUrl = `${appOrigin}/api/proxy/chat`;

  try {
    res = await fetch(proxyChatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(onChunk ? { 'Accept': 'text/event-stream' } : {}),
      },
      body: JSON.stringify({
        baseUrl: cleanUrlBase,
        apiKey: cleanKey,
        model: targetModel,
        messages: payload.messages,
        stream: payload.stream,
      }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Proxy chat error (${res.status}): ${errText || res.statusText}`);
    }
  } catch (proxyErr) {
    if (!getAutoFallbackEnabled()) {
      throw proxyErr;
    }
    // Fallback to server chat if custom server proxy failed and autoFallback is enabled
    return await callServerChat('gemini-2.5-flash', messages, onChunk, signal);
  }

  clearTimeout(timeout);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API Error (${res.status}): ${errorText || res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const isSse = contentType.includes('text/event-stream');

  if (onChunk && isSse && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulated = '';
    let buffer = '';
    let fullRaw = '';
    let isDone = false;

    while (!isDone) {
      const { done, value } = await reader.read();
      if (done) break;
      const decoded = decoder.decode(value, { stream: true });
      fullRaw += decoded;
      buffer += decoded;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          isDone = true;
          break;
        }
        try {
          const parsed = JSON.parse(dataStr);
          const chunkText =
            parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.message?.content ||
            parsed.choices?.[0]?.text ||
            '';
          if (chunkText) {
            accumulated += chunkText;
            onChunk(chunkText, accumulated);
          }
        } catch (_) {}
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(dataStr);
            const chunkText =
              parsed.choices?.[0]?.delta?.content ||
              parsed.choices?.[0]?.message?.content ||
              '';
            if (chunkText) {
              accumulated += chunkText;
              onChunk(chunkText, accumulated);
            }
          } catch (_) {}
        }
      }
    }

    if (accumulated && accumulated.trim()) {
      return sanitizeAiResponse(accumulated.trim());
    }

    if (fullRaw.trim()) {
      const clean = sanitizeAiResponse(fullRaw.trim());
      if (clean) {
        if (onChunk) onChunk(clean, clean);
        return clean;
      }
    }

    return '';
  }

  const rawText = await res.text();
  try {
    const data = JSON.parse(rawText);
    const fullText =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.delta?.content ||
      data.choices?.[0]?.text ||
      data.text ||
      '';
    if (fullText) {
      const clean = sanitizeAiResponse(fullText);
      if (onChunk) onChunk(clean, clean);
      return clean;
    }
    if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error));
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('JSON')) {
      throw err;
    }
  }

  const cleanRaw = sanitizeAiResponse(rawText);
  if (onChunk && cleanRaw) {
    onChunk(cleanRaw, cleanRaw);
  }
  return cleanRaw;
}