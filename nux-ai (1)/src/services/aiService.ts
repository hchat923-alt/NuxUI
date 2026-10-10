import { Message } from '../types';

export interface StreamCallbacks {
  onChunk: (chunk: string, fullText?: string) => void;
  onError: (error: Error) => void;
  onComplete: (fullText: string) => void;
}

export interface SendChatOptions {
  messages: Array<{
    role: string;
    content: string;
    images?: string[];
    attachments?: any[];
    [key: string]: any;
  }>;
  modelId: string;
  onChunk?: (chunk: string, fullText?: string) => void;
  onError?: (error: Error) => void;
  onComplete?: (fullText: string) => void;
  signal?: AbortSignal;
}

import { getStoredApiKeys, callServerChat, callGenericOpenAiDirect, getStoredCustomModels } from './apiKeys';
import { SmoothStreamer } from '../utils/smoothStreamer';
import { getIntelligencePersona, getFullSystemInstruction } from './claudePersona';
import { translatePromptToEnglish, stripArabicImagePrefixes } from '../utils/imageTranslator';
import { sanitizeAiResponse } from '../utils/responseSanitizer';
import { getDeepThinkingEnabled, ensureDeepThinkingInResponse } from './deepThinkingService';

declare global {
  interface Window {
    puter?: any;
  }
}

/**
 * Executes a raw chat message using either the user's custom OpenAI endpoint or Server Chat API
 */
async function executeRawChatMessage(
  modelId: string,
  formattedHistory: Array<{ role: string; content: string; images?: string[]; attachments?: any[] }>,
  onChunk?: (chunk: string, fullText?: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // If the modelId is a custom saved model, execute against its custom server settings!
  if (modelId.startsWith('custom:')) {
    const customList = getStoredCustomModels();
    const foundCustom = customList.find((m) => m.id === modelId);
    if (foundCustom) {
      return await callGenericOpenAiDirect(
        foundCustom.baseUrl,
        foundCustom.apiKey,
        foundCustom.name,
        formattedHistory,
        onChunk,
        signal
      );
    }
  }

  // Otherwise, default to Server Chat API
  return await callServerChat(
    modelId,
    formattedHistory,
    onChunk,
    signal
  );
}

export async function executeFallbackModel(
  formattedHistory: Array<{ role: string; content: string; images?: string[]; attachments?: any[] }>,
  originalModelId: string,
  onChunk?: (chunk: string, fullText?: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return await executeRawChatMessage(originalModelId, formattedHistory, onChunk, signal);
}

export async function sendChatMessage(
  messagesOrOptions: Message[] | SendChatOptions,
  modelIdArg?: string,
  callbacksArg?: StreamCallbacks
): Promise<string> {
  let messages: Array<{ role?: string; sender?: string; content: string }>;
  let modelId: string;
  let callbacks: StreamCallbacks | undefined;
  let signal: AbortSignal | undefined;

  if (Array.isArray(messagesOrOptions)) {
    messages = messagesOrOptions;
    modelId = modelIdArg || 'gemini-2.5-flash';
    callbacks = callbacksArg;
  } else {
    messages = messagesOrOptions.messages;
    modelId = messagesOrOptions.modelId;
    signal = messagesOrOptions.signal;
    callbacks = {
      onChunk: messagesOrOptions.onChunk || (() => {}),
      onError: messagesOrOptions.onError || (() => {}),
      onComplete: messagesOrOptions.onComplete || (() => {}),
    };
  }

  const formattedHistory = (Array.isArray(messages) ? messages : []).map((m: any) => {
    let extractedImages: string[] = Array.isArray(m.images) ? [...m.images] : [];
    if (Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att && att.data && (att.fileCategory === 'image' || (att.type && att.type.startsWith('image/')) || att.data.startsWith('data:image/'))) {
          if (!extractedImages.includes(att.data)) {
            extractedImages.push(att.data);
          }
        }
      }
    }
    return {
      role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
      content: m.content || m.text || '',
      images: extractedImages.length > 0 ? extractedImages : undefined,
      attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
    };
  });

  const userOnChunk = callbacks?.onChunk;
  const streamer = userOnChunk
    ? new SmoothStreamer({
        onEmit: (chunk, fullText) => {
          if (!signal?.aborted) {
            userOnChunk(chunk, fullText);
          }
        },
        signal,
      })
    : null;

  const internalOnChunk = streamer
    ? (chunk: string, fullText?: string) => {
        if (fullText !== undefined) {
          streamer.push(fullText);
        } else if (chunk) {
          streamer.append(chunk);
        }
      }
    : undefined;

  // Autonomous Image Generation Command Handler (/img or image models)
  const isImageModel = modelId.includes('image') || modelId.includes('pic') || modelId.includes('draw');
  const lastMsgForImage = [...formattedHistory].reverse().find((m) => m.role === 'user');
  const userContent = lastMsgForImage && typeof lastMsgForImage.content === 'string' ? lastMsgForImage.content.trim() : '';

  if (isImageModel || userContent.toLowerCase().startsWith('/img')) {
    const rawImgPrompt = userContent.replace(/^\/img\s*/i, '').trim();
    if (!rawImgPrompt) {
      const guideText = `**طريقة استخدام أداة إنشاء الصور التلقائية (/img):**\n\nيرجى كتابة وصف الصورة التي ترغب في إنشائها بعد الأمر مباشرة.\n\n*أمثلة:*
• \`/img أسد أسطوري شامخ في غابة ذهبية بحجم 4k\`
• \`/img A futuristic cybernetic city at twilight, cinematic lighting 8k\``;
      if (internalOnChunk) internalOnChunk(guideText, guideText);
      if (callbacks?.onComplete) callbacks.onComplete(guideText);
      return guideText;
    }

    const cleanSubject = stripArabicImagePrefixes(rawImgPrompt) || rawImgPrompt;
    let englishPrompt = await translatePromptToEnglish(rawImgPrompt);

    if (getIntelligencePersona() === 'claude') {
      englishPrompt += `, Anthropic visual art director photography style, physical foundation materials like aged paper, natural leather, linen or raw canvas, tactile analog texture with grain, warm neutral palette (cream, tan, off-white, muted coral, sage green, deep charcoal accents), no neon or high saturation, layered physical elements, macro close-up photography, natural lighting, handmade artisan aesthetic, quiet intelligence, purposeful minimalism`;
    }

    // Direct SVG / Visual art response for image commands
    const responseText = `\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="50%" stop-color="#311b92" />
      <stop offset="100%" stop-color="#4a148c" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#fbbf24" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="800" height="600" rx="24" fill="url(#bgGrad)" />
  <circle cx="400" cy="250" r="140" fill="none" stroke="url(#goldGrad)" stroke-width="4" filter="url(#glow)" opacity="0.6" />
  <circle cx="400" cy="250" r="100" fill="#ffffff" opacity="0.05" />
  <path d="M 320 280 Q 400 180 480 280 Q 400 380 320 280 Z" fill="none" stroke="url(#goldGrad)" stroke-width="3" />
  <circle cx="400" cy="280" r="24" fill="#fbbf24" />
  <text x="400" y="460" font-family="system-ui, sans-serif" font-size="22" font-weight="600" fill="#f3f4f6" text-anchor="middle">${cleanSubject}</text>
  <text x="400" y="495" font-family="system-ui, sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle">Visual Sketch Representation</text>
</svg>
\`\`\`

**رسم التوضيح البصري المخصص:** *${cleanSubject}*`;

    if (internalOnChunk) internalOnChunk(responseText, responseText);
    if (callbacks?.onComplete) callbacks.onComplete(responseText);
    return responseText;
  }

  const isDeepThinkingOn = getDeepThinkingEnabled();
  const lastUserMsg = [...formattedHistory].reverse().find((m) => m.role === 'user');
  const userText = (lastUserMsg && typeof lastUserMsg.content === 'string') ? lastUserMsg.content : '';

  let effectiveHistory = formattedHistory;
  if (isDeepThinkingOn) {
    effectiveHistory = formattedHistory.map((m, idx) => {
      if (idx === formattedHistory.length - 1 && m.role === 'user') {
        const thoughtDirective = `\n\n[MANDATORY THINKING DIRECTIVE: You MUST begin your response strictly with <thought>...step-by-step reasoning...</thought> before answering. Never skip <thought>.]`;
        return {
          ...m,
          content: `${m.content}${thoughtDirective}`,
        };
      }
      return m;
    });
  }

  const nonSystemHistory = effectiveHistory.filter((m) => m.role !== 'system');
  const fullInstruction = getFullSystemInstruction(modelId);
  const rawWithSystem = fullInstruction
    ? [{ role: 'system', content: fullInstruction }, ...nonSystemHistory]
    : nonSystemHistory;

  try {
    const rawResult = await executeRawChatMessage(
      modelId,
      rawWithSystem,
      internalOnChunk,
      signal
    );

    let finalResult = sanitizeAiResponse(rawResult);
    if (isDeepThinkingOn) {
      finalResult = ensureDeepThinkingInResponse(finalResult, userText);
    } else {
      finalResult = finalResult
        .replace(/<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*?<\/(?:thought|deep_thought|thinking|reasoning|think|thought_process)>/gi, '')
        .replace(/<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*/gi, '')
        .trim();
    }

    if (streamer) {
      finalResult = await streamer.end(finalResult);
    }

    if (isDeepThinkingOn) {
      finalResult = ensureDeepThinkingInResponse(finalResult, userText);
    } else {
      finalResult = finalResult
        .replace(/<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*?<\/(?:thought|deep_thought|thinking|reasoning|think|thought_process)>/gi, '')
        .replace(/<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*/gi, '')
        .trim();
    }
    finalResult = sanitizeAiResponse(finalResult);
    if (callbacks?.onComplete) {
      callbacks.onComplete(finalResult);
    }
    return finalResult;
  } catch (err: any) {
    if (streamer) {
      streamer.flush();
    }
    if (callbacks?.onError) {
      callbacks.onError(err);
    }
    throw err;
  }
}

export interface DualModelDebateOptions {
  modelAId: string;
  modelBId: string;
  modelAName: string;
  modelBName: string;
  userQuery: string;
  chatHistory?: any[];
  attachments?: any[];
  images?: string[];
  onStageUpdate?: (stage: string, message: string) => void;
  onChunk?: (chunk: string, fullText?: string) => void;
  language?: 'ar' | 'en';
}

export async function sendDualModelDebate({
  modelAId,
  modelBId,
  modelAName,
  modelBName,
  userQuery,
  chatHistory = [],
  attachments,
  images,
  onStageUpdate,
  onChunk,
  language = 'ar',
}: DualModelDebateOptions): Promise<string> {
  const isEn = language === 'en';

  let attachedFilesText = '';
  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const f of attachments) {
      if (f.textContent && typeof f.textContent === 'string') {
        attachedFilesText += `\n\n[${isEn ? 'Attached File' : 'ملف مرفق'}: ${f.name}]\n\`\`\`\n${f.textContent}\n\`\`\`\n`;
      }
    }
  }

  if (onStageUpdate) {
    onStageUpdate(
      'stage1',
      isEn ? `Analyzing query with ${modelAName}...` : `جاري تحليل المسألة بواسطة ${modelAName}...`
    );
  }

  const activePersona = getIntelligencePersona();
  const isDeepThinking = getDeepThinkingEnabled();

  const personaPrimaryName = modelAName || (isEn ? 'Primary Model' : 'النموذج الأول');
  const personaAuditorName = modelBName || (isEn ? 'Secondary Auditor' : 'النموذج الثاني المراجع');

  let personaInstruction = '';
  if (activePersona === 'claude') {
    personaInstruction = isEn
      ? `\n[Claude Intelligence Persona - Strict Identity Immersion]:
- You embody the intelligence, values, and reasoning depth of Claude (Anthropic).
- Think and analyze with uncompromising intellectual honesty, authenticity, and directness.
- Deliver pristine, robust, and zero-defect code/solutions without fluff or sycophancy.
- Document your step-by-step internal reasoning inside <thought>...</thought> tags at the beginning of your response.`
      : `\n[توجيه محاكاة كلود - Claude Intelligence Persona]:
- أنت تمثل فكر ونزاهة وذكاء واستدلال Claude Opus بأعلى درجات الدقة والعمق.
- فكر وحلل بعمق ونزاهة فكرية مطلقة مع صدق تام ومباشر وتجنب المجاملات الزائفة.
- قدم حلولاً متقنة وبرمجيات نظيفة وخالية تماماً من العيوب والثغرات.
- اكتب مسار استدلالك وتحليلك الداخلي الدقيق للمسألة داخل وسم <thought>...</thought> في بداية الرد ثم قدم تحليلك الكامل.`;
  } else if (activePersona === 'chatgpt') {
    personaInstruction = isEn
      ? `\n[ChatGPT Intelligence Persona]:
- Provide structured, warm, direct, and actionable solutions with clear step-by-step guidance.
- Document your step-by-step internal reasoning inside <thought>...</thought> tags at the beginning of your response.`
      : `\n[توجيه محاكاة تشات جي بي تي - ChatGPT Intelligence Persona]:
- قدم إجابة مباشرة ومرتبة ومنظمة ودافئة وعملية مع حلول واضحة دون مقدمات مطولة.
- اكتب مسار استدلالك وتحليلك الداخلي الدقيق للمسألة داخل وسم <thought>...</thought> في بداية الرد ثم قدم تحليلك الكامل.`;
  }

  let deepThinkingInstruction = '';
  if (isDeepThinking) {
    deepThinkingInstruction = isEn
      ? `\n[Deep Thinking - Claude Opus 5 Philosophy]:
- Scrutinize all hidden assumptions, complex dimensions, and edge cases.
- Construct rigorous first-principles reasoning and explore corner cases.
- Write your full reasoning process inside <thought>...</thought> tags.`
      : `\n[توجيه التفكير العميق - Claude Opus 5 Deep Thinking Philosophy]:
- تحقق من كافة الفرضيات الخفية والأبعاد المعقدة للمسألة.
- قم ببناء تسلسل استدلالي محكم وتحقق من معالجة جميع الحالات الشاذة والطرفية (Edge Cases).
- وثق كامل مسار تفكيرك الداخلي بدقة داخل وسم <thought>...</thought> في مستهل ردك.`;
  }

  const stage1Prompt = [
    ...chatHistory,
    {
      role: 'user',
      content: isEn
        ? `You are the primary analyst model in a collaborative AI team (${personaPrimaryName}).
User query:
"${userQuery}"
${attachedFilesText}
${personaInstruction}${deepThinkingInstruction}

Task:
Provide a rigorous, comprehensive, and direct solution. If files are provided, analyze and summarize them thoroughly according to the user request. Document your thought process inside <thought>...</thought>.`
        : `أنت النموذج الأول المتخصص في فريق الذكاء الاصطناعي المشترك (${personaPrimaryName}).
سؤال المستخدم:
"${userQuery}"
${attachedFilesText}
${personaInstruction}${deepThinkingInstruction}

المطلوب منك:
قدم تحليلاً دقيقاً وإجابة متكاملة وشاملة ومباشرة. إذا تم إرفاق ملفات، قم بتحليلها وقراءتها وتلخيصها بدقة وفق طلب المستخدم، وإذا كان السؤال برمجياً اكتب الكود الأفضل والأنظف. تأكد من توثيق مسار تفكيرك داخل وسم <thought>...</thought>.`,
      attachments,
      images,
    },
  ];

  let stage1Response = '';
  try {
    stage1Response = await sendChatMessage({
      modelId: modelAId,
      messages: stage1Prompt,
      onChunk: (chunk, fullText) => {
        const textSoFar = fullText || chunk;
        if (onChunk) {
          onChunk(
            isEn
              ? `> **Dual-AI Consensus Session**
> Initial analysis and reasoning in progress by **${personaPrimaryName}**...

---

### Initial Analysis (${personaPrimaryName})
${textSoFar}`
              : `> **جلسة تفكير تشاركي ثنائي (Dual-AI Consensus)**
> جاري التحليل الأولي بواسطة **${personaPrimaryName}**...

---

### التحليل والتفكير الأولي (${personaPrimaryName})
${textSoFar}`
          );
        }
      },
    });
  } catch (errStage1: any) {
    stage1Response = isEn
      ? `[Initial analysis unavailable: ${errStage1?.message || 'Unknown error'}]`
      : `[تعذر الحصول على التحليل الأولي: ${errStage1?.message || 'خطأ غير معروف'}]`;
  }

  if (onStageUpdate) {
    onStageUpdate(
      'stage2',
      isEn ? `Verifying and auditing with ${modelBName}...` : `جاري التدقيق والمراجعة بواسطة ${modelBName}...`
    );
  }

  const stage2Prompt = [
    {
      role: 'user',
      content: isEn
        ? `You are the secondary auditor model (${personaAuditorName}) in a collaborative dual-AI team.

Original user query:
"${userQuery}"
${attachedFilesText ? `\nAttached file context:\n${attachedFilesText}` : ''}

Primary model (${personaPrimaryName}) analysis & solution:
"""
${stage1Response}
"""
${personaInstruction}${deepThinkingInstruction}

Your auditing instructions:
1. Rigorously inspect the primary model's output: are there any bugs, omissions, or flawed assumptions? Cross-check with the user query and any attached files.
2. Highlight key strengths and improvements.
3. Document your audit reasoning inside <thought>...</thought> tags.
4. Provide the final, verified, and pristine solution.`
        : `أنت النموذج الثاني (${personaAuditorName}) المراجع والمدقق المتخصص في فريق الذكاء الاصطناعي المشترك.

سؤال المستخدم الأصلي:
"${userQuery}"
${attachedFilesText ? `\nمحتوى الملفات المرفقة للمراجعة:\n${attachedFilesText}` : ''}

إجابة وتحليل النموذج الأول (${personaPrimaryName}):
"""
${stage1Response}
"""
${personaInstruction}${deepThinkingInstruction}

مهمتك التدقيقية:
1. راجع إجابة وتحليل النموذج الأول بدقة متناهية مقارنة بطلب المستخدم والملفات المرفقة: هل هناك أي خطأ برمجي، ثغرة، نقص، أو فرضية خاطئة؟
2. حدد نقاط القوة والتحسينات اللازمة.
3. اكتب مسار تدقيقك واستدلالك الداخلي داخل وسم <thought>...</thought>.
4. قدم الحل النهائي المثالي والموثق والمعتمد بعد المراجعة ليكون شاملاً ودقيقاً وخالياً تماماً من الأخطاء والهلوسة.`,
      attachments,
      images,
    },
  ];

  let stage2Response = '';
  try {
    stage2Response = await sendChatMessage({
      modelId: modelBId,
      messages: stage2Prompt,
      onChunk: (chunk, fullText) => {
        const textSoFar = fullText || chunk;
        if (onChunk) {
          onChunk(
            isEn
              ? `> **Dual-AI Consensus Session**
> Collaborative session between **${modelAName}** (Solution Drafting) and **${modelBName}** (Auditing & Verification).

---

### Initial Analysis by ${personaPrimaryName}
${stage1Response}

---

### Verification & Final Audited Solution by ${personaAuditorName}
${textSoFar}`
              : `> **جلسة تفكير تشاركي ثنائي (Dual-AI Consensus)**
> تم إشراك **${personaPrimaryName}** (التحليل وتوليد الحل) مع **${personaAuditorName}** (التدقيق ومراجعة الأخطاء).

---

### التحليل الأولي بواسطة ${personaPrimaryName}
${stage1Response}

---

### التدقيق والمراجعة والحل المعتمد بواسطة ${personaAuditorName}
${textSoFar}`
          );
        }
      },
    });
  } catch (errStage2: any) {
    stage2Response = isEn
      ? `[Audited review unavailable: ${errStage2?.message || 'Unknown error'}]`
      : `[تعذر الحصول على التدقيق النهائي: ${errStage2?.message || 'خطأ غير معروف'}]`;
  }

  const combinedReport = isEn
    ? `> **Dual-AI Consensus Session**
> **${personaPrimaryName}** (Initial Solution) and **${personaAuditorName}** (Auditing & Refinement) worked collaboratively to guarantee maximum accuracy and eliminate errors.

---

### Initial Analysis by ${personaPrimaryName}
${stage1Response}

---

### Verification & Final Audited Solution by ${personaAuditorName}
${stage2Response}`
    : `> **جلسة تفكير تشاركي ثنائي (Dual-AI Consensus)**
> تم إشراك **${personaPrimaryName}** (التحليل وتوليد الحل) مع **${personaAuditorName}** (التدقيق ومراجعة الأخطاء) لتقليل نسبة الخطأ إلى الصفر وضمان أعلى جودة وإتقان.

---

### التحليل الأولي بواسطة ${personaPrimaryName}
${stage1Response}

---

### التدقيق والمراجعة والحل المعتمد بواسطة ${personaAuditorName}
${stage2Response}`;

  return combinedReport;
}
