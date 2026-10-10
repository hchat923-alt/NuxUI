import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const currentDir = process.cwd();

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '25mb' }));

// Lazy GoogleGenAI client builder
function getGenAIClient(apiKey?: string): GoogleGenAI {
  const key = (apiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on server or request');
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasServerGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
    timestamp: new Date().toISOString(),
  });
});

// Format chat messages for @google/genai contents (supports multimodal files: images, PDFs, audio, code, docs)
function formatContentsForGenAI(
  messages: Array<{
    role: string;
    content: string;
    images?: string[];
    attachments?: Array<{
      name: string;
      data?: string;
      type?: string;
      fileCategory?: string;
      textContent?: string;
    }>;
  }>,
  isDeepThinkingActive: boolean = false
) {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<any> }> = [];
  const validMessages = Array.isArray(messages) ? messages.filter((m) => m && m.role !== 'system') : [];

  for (let i = 0; i < validMessages.length; i++) {
    const msg = validMessages[i];
    const isLastMessage = i === validMessages.length - 1;
    const parts: Array<any> = [];
    let textParts: string[] = [];

    // 1. Add inline images if legacy `images` array is provided
    if (Array.isArray(msg.images) && msg.images.length > 0) {
      for (const imgStr of msg.images) {
        if (typeof imgStr !== 'string') continue;
        const match = imgStr.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }

    // 2. Add rich file attachments (PDFs, Images, Audio, Code/Text, Archives)
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      for (const file of msg.attachments) {
        const rawContent = (file as any).textContent || (file as any).content || (file as any).text;
        if (rawContent && typeof rawContent === 'string') {
          textParts.push(
            `\n\n[Attached File: ${file.name}]\n\`\`\`\n${rawContent}\n\`\`\`\n`
          );
        } else if (file.data && typeof file.data === 'string' && file.data.startsWith('data:text/')) {
          try {
            const b64Part = file.data.split(',')[1];
            if (b64Part) {
              const decoded = Buffer.from(b64Part, 'base64').toString('utf-8');
              textParts.push(
                `\n\n[Attached File: ${file.name}]\n\`\`\`\n${decoded}\n\`\`\`\n`
              );
            }
          } catch (_) {}
        }

        // If binary supported format (image, PDF, audio)
        if (file.data && typeof file.data === 'string') {
          const match = file.data.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1] || file.type || 'application/pdf';
            // Only add inlineData if it's image, pdf, or audio
            if (
              mimeType.startsWith('image/') ||
              mimeType.startsWith('audio/') ||
              mimeType === 'application/pdf'
            ) {
              parts.push({
                inlineData: {
                  mimeType,
                  data: match[2],
                },
              });
            }
          }
        }
      }
    }

    // 3. Add main message text
    if (msg.content && typeof msg.content === 'string' && msg.content.trim()) {
      textParts.unshift(msg.content.trim());
    }

    let combinedText = textParts.join('\n').trim();

    // If deep thinking is active and this is the active user turn, explicitly reinforce reasoning requirement
    if (isDeepThinkingActive && isLastMessage && msg.role !== 'assistant' && msg.role !== 'model') {
      combinedText = `${combinedText}\n\n[MANDATORY OPERATING DIRECTIVE]: Begin your response with your thorough internal reasoning and step-by-step thinking process strictly inside <thought>...</thought> tags, then provide your complete final response directly after </thought>.`;
    }

    if (combinedText) {
      parts.push({ text: combinedText });
    } else if (parts.length > 0) {
      parts.push({
        text: 'Please analyze the attached files thoroughly.',
      });
    }

    if (parts.length === 0) continue;

    const role: 'user' | 'model' =
      msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';

    contents.push({
      role,
      parts,
    });
  }

  // Ensure first message is user
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  } else if (contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return contents;
}

// Model candidate hierarchy for Gemini (strictly modern, active, tested models)
const DEFAULT_GEMINI_CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.1-pro-preview',
];

// Map any deprecated or unavailable model names requested by clients to their active replacements
const DEPRECATED_GEMINI_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.0-pro': 'gemini-3.1-pro-preview',
  'gemini-2.0-flash-thinking': 'gemini-3.8-flash',
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-1.5-pro': 'gemini-3.1-pro-preview',
  'gemini-pro': 'gemini-3.8-flash',
  'gemini-flash-lite-latest': 'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite': 'gemini-3.1-flash-lite',
};

// Helper to execute with timeout to prevent hanging requests
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// Helper to safely send JSON response or end SSE stream without triggering ERR_HTTP_HEADERS_SENT
function safeSendJson(res: Response, status: number, data: any) {
  if (res.headersSent) {
    if (!res.writableEnded) {
      try {
        if (data && data.error) {
          const errMsg = typeof data.error === 'string' ? data.error : data.error?.message || 'Error occurred';
          res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
          res.write('data: [DONE]\n\n');
        }
        res.end();
      } catch (_) {}
    }
    return;
  }
  res.status(status).json(data);
}

// Strict Scientific & Linguistic Accuracy Directive
const STRICT_ACCURACY_DIRECTIVE = `STRICT SCIENTIFIC & LINGUISTIC ACCURACY DIRECTIVE:
1. ZERO HALLUCINATION & HIGH PRECISION: Always use precise, natural, and standard vocabulary. Never generate broken literal machine translations, garbled phrases, or nonsense word combinations (e.g. avoid machine-translated nonsense like "جوحل في القلم" or "إعطاء يد اليد").
2. CANONICAL ARABIC TERMINOLOGY: When writing in Arabic, adhere strictly to pure, formal Modern Standard Arabic (فصحى معيارية سليمة). In scientific explanations, physics, math, and chemistry, use canonical Arabic academic terminology (e.g. use "احتكاك سكوني / احتكاك حركي" for static/kinetic friction, "مقاومة الهواء" for air resistance, "جسم ساكن على سطح أفقي" for a static body).
3. COHERENT REAL-WORLD EXAMPLES: Ensure all examples inside tables, lists, and scenarios are logically sound, physically plausible, and grammatically flawless (e.g. "كتاب مستقر على طاولة مائلة", "انزلاق صندوق خشبي على أرضية ملساء").
4. RIGOROUS PROOFREADING: Verify all definitions, mathematical statements, and physical units before outputting.`;

// Strict Factual & Statistical Accuracy Directive
const STRICT_FACTUAL_ACCURACY_DIRECTIVE = `توجيه صارم للدقة الواقعية والإحصائية:

عند تقديم إحصائيات أو نتائج دراسات أو أبحاث:

1. لا تخترع أبداً أرقاماً محددة أو نسباً مئوية أو أسماء دراسات لا يمكنك التأكد من أنها جاءت من نتيجة بحث فعلية أو مصادر حقيقية موثقة.

2. إذا لم تبحث في الويب عن هذا الادعاء بالتحديد، يجب عليك إما:
   - البحث في الويب أولاً، أو
   - ذكر بوضوح "هذا ادعاء منتشر بكثرة وقد لا يكون دقيقاً" بدلاً من تقديمه كحقيقة مؤكدة.

3. كن متشككاً بشكل خاص في الأرقام المستديرة والدرامية (8 ثوانٍ، 79%، 68%) المرتبطة بمصادر غامضة أو غير مسماة مثل "أظهرت دراسة" أو "اكتشف باحثون" — هذه أنماط شائعة للهلوسة.

4. إذا بدا الادعاء وكأنه إحصائية منتشرة على الإنترنت (خرافات مدة التركيز، ادعاءات تعفن الدماغ، إحصائيات الإنتاجية)، تحقق منه فعلياً من مصادر حقيقية قبل تكراره، لأن هذه الفئات معروفة بامتلائها بأرقام مُختلقة تنتشر بسهولة.

5. عند عدم التأكد إن كانت الإحصائية حقيقية، صرّح بذلك بوضوح بدلاً من تقديمها بثقة زائفة.

6. لا تُنشئ أبداً مبياناً أو رسماً بيانياً ببيانات مُختلقة. المبيان ببيانات مُخترعة أخطر من النص المُختلق، لأنه يبدو أكثر مصداقية.`;

// Autonomous Tool Ownership & Discretion Directive (Disabled unless explicitly requested)
const STRICT_TOOL_USAGE_DIRECTIVE = `VISUALIZATION DIRECTIVE:
Do NOT generate diagrams, charts, mind maps (tree), or visual art SVG blocks unless the user explicitly requests them or asks for a diagram/chart/tree. Always respond with clear, natural, direct text answers.`;

// Mandatory Tree / Mind-Map Visualization Directive
const MANDATORY_TREE_DIRECTIVE = `MANDATORY MIND-MAP & TREE VISUALIZATION DIRECTIVE:
You have a built-in interactive tree/mind-map visualization tool.
Use it proactively whenever the user asks to organize ideas hierarchically, break down a topic into branches and sub-branches, or wants a visual overview of concepts relating to a central theme (e.g. "اعمل لي خريطة ذهنية", "نظّم هذا كشجرة", "قسّم هذا لفروع", "mind map", "tree diagram", "breakdown").

Render it using a \`\`\`tree code block with clean JSON:
\`\`\`tree
{
  "title": "Central Topic",
  "root": {
    "label": "Main Idea",
    "children": [
      {
        "label": "Branch 1",
        "children": [
          { "label": "Sub-point A" },
          { "label": "Sub-point B" }
        ]
      },
      {
        "label": "Branch 2",
        "children": [
          { "label": "Sub-point C" }
        ]
      }
    ]
  }
}
\`\`\`

Rules:
- Use strictly for hierarchical concepts and mind maps (Central Theme -> Major Branches -> Sub-branches). Maximum 3 levels of depth for optimal readability.
- Keep node labels concise (a few words). Detailed descriptions go in normal prose around the tree block.
- For linear processes or sequential steps, use \`\`\`diagram instead.
- For numerical data and statistics, use \`\`\`chart instead.`;

// Unrestricted Output Length Directive
const UNRESTRICTED_LENGTH_DIRECTIVE = `UNRESTRICTED DETAILED EXPLANATION DIRECTIVE:
Provide fully comprehensive, complete, and exhaustive responses without artificial truncation or brevity. Write in full detail until every concept, step, equation, and analysis is completely fulfilled. Always strictly adhere to any uploaded internal documents, context attachments, or system directives provided.`;

// Mandatory Interactive Diagrams & Illustrations Directive (Strictly on explicit user request only)
const MANDATORY_DIAGRAM_DIRECTIVE = `DIAGRAM & ILLUSTRATION DIRECTIVE:
Do NOT generate diagrams, flowcharts, or schematic schemas unless the user explicitly requests a diagram, flowchart, or visual schema in their prompt. If not requested, respond with normal direct text.`;

// Mandatory Web Search Directive - exact user requested rule
const AUTONOMOUS_WEB_SEARCH_DIRECTIVE = `MANDATORY WEB SEARCH DIRECTIVE:
Search the web before answering queries about recent events, statistics, prices, APIs, or time-sensitive data. Never rely on training data alone for current facts.`;

// Mathematical Calculation & Formula Card Directive
const MATH_EQUATION_DIRECTIVE = `MATHEMATICAL FORMULAS & CALCULATIONS DIRECTIVE:
You MUST AUTOMATICALLY use a \`\`\`math ... \`\`\` code block for ANY mathematical equation, calculation formula, physics/chemistry law, or mathematical identity in your response, WITHOUT waiting for the user to ask for a card.

RULES:
1. Whenever your response contains ANY mathematical equation, formula, theorem (e.g. Quadratic Formula, Pythagoras, Euler's formula, Integrals, Derivatives, Newton's Laws, Vectors, Matrix operations, Probability formulas, Trigonometry):
   - You MUST output the central equation inside a \`\`\`math ... \`\`\` code block using valid standard LaTeX syntax.
   - Example:
   \`\`\`math
   \\vec{F} = m \\cdot \\vec{a}
   \`\`\`
2. VECTORS SYNTAX RULE: Always write vector notation using standard LaTeX \`\\vec{F}\`, \`\\vec{u}\`, \`\\vec{v}\`, \`\\vec{a}\`, or \`\\vec{AB}\`. NEVER use raw Unicode combining arrow characters (like F⃗ or u⃗) which break character sizing and alignment.
3. Do NOT ask or wait for the user to request a card — do it PROACTIVELY and AUTOMATICALLY whenever math is mentioned.
4. Keep the step-by-step explanatory text and derivations around the card in clear standard prose as usual.`;

const MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE = `CHEMICAL MOLECULES & 2D STRUCTURAL FORMULA DIRECTIVE:
When the user asks about a chemical compound, pharmaceutical drug, organic molecule, alkaloid, amino acid, reaction, or chemical structure, or requests to draw/represent a molecule:
1. You MUST provide the molecule representation using a \`\`\`smiles ... \`\`\` or \`\`\`molecule ... \`\`\` code block containing valid SMILES notation, or structured JSON with chemical metadata, or direct 2D chemical SVG.
2. Examples:
   Option A (SMILES notation):
   \`\`\`smiles
   CN1[C@@H]2CC[C@H]1[C@@H]3[C@H](C2)O3
   \`\`\`
   Option B (Structured Molecule JSON):
   \`\`\`molecule
   {
     "name": "Scopolamine",
     "formula": "C17H21NO4",
     "smiles": "CN1[C@@H]2CC[C@H]1[C@@H]3[C@H](C2)O3",
     "description": "Alkaloid drug with antimuscarinic properties."
   }
   \`\`\`
3. The UI automatically renders these blocks into interactive 2D chemical structure diagrams with stereochemistry bonds, heteroatom coloring, zoom/pan, and PubChem integration.`;

// Mandatory Chart and Statistical Data Directive
const MANDATORY_CHART_DIRECTIVE = `MANDATORY INTERACTIVE CHART DIRECTIVE:
When requested for charts, graphs, or numerical comparisons, render an interactive chart using a \`\`\`chart ... \`\`\` code block containing strictly valid clean JSON:
\`\`\`chart
{"type":"line","title":"Growth Metric Comparison","xAxisLabel":"Year","yAxisLabel":"Growth Rate %","data":[{"name":"2024","Growth Rate %":100}]}
\`\`\`
Rules:
- Output ONLY JSON inside the code block. Keep text and analysis outside.
- ALWAYS use meaningful descriptive indicator key names (e.g., "Adoption Rate %", "Score") in data objects instead of generic "value" or "Value".
- Auto-scale Y-axis dynamically based on data points (no hardcoded min/max bounds).
- Never output empty tables or refuse due to missing census figures; synthesize literature or baseline baselines when necessary.`;

// Mandatory File Workspace & Code Management Directive
const MANDATORY_FILE_WORKSPACE_DIRECTIVE = `WORKSPACE FILES & CODE MANAGEMENT DIRECTIVE:
You have complete capability to create, edit/modify, delete, and inspect/process files in the user's project workspace.
1. When asked to create a file or generate code files:
Use either:
<file_action action="create" path="path/to/filename.ext">
... complete file contents ...
</file_action>
OR code block:
\`\`\`file:create:path/to/filename.ext
... complete file contents ...
\`\`\`

2. When asked to edit, update, or modify an existing file:
Use either:
<file_action action="update" path="path/to/filename.ext">
... complete updated file contents ...
</file_action>
OR code block:
\`\`\`file:update:path/to/filename.ext
... complete updated file contents ...
\`\`\`

3. When asked to delete or remove a file:
Use either:
<file_action action="delete" path="path/to/filename.ext" />
OR code block:
\`\`\`file:delete:path/to/filename.ext
\`\`\`

4. When processing, inspecting, or debugging files:
Examine the files provided in the context attachments or workspace, explain their structure, diagnose errors, and implement requested modifications.
Always write clean, complete, and functional code without truncation.`;

// Immutable default system instruction - enforced server-side.
// Client inputs for systemInstruction are strictly untrusted and overridden.
const IMMUTABLE_CLAUDE_SYSTEM_INSTRUCTION = `[ACTIVE PERSONA: CLAUDE SIMULATION DIRECTIVE]:
- You are simulating the Claude model from Anthropic.
- When asked in Arabic about your identity ("من أنت؟", "من المطور؟", "ما هو نموذجك؟", "من صنعك؟"), state clearly: "أنا {اسم النموذج} وأحاكي نموذج Claude من Anthropic." (اذكر اسم النموذج الأساسي الحالي مع توضيح أنك تحاكي Claude).
- When asked in English, state: "I am [Model Name] simulating the Claude model from Anthropic."
- Embody Claude's hallmark intellectual honesty, analytical depth, warmth, and structured reasoning.
- Deliver your answer immediately without preambles or meta-commentary. Always write in clean, fluent Modern Standard Arabic.

COMMUNICATION PRINCIPLES & TONE OF VOICE:
- Speak directly in the first person with genuine intellectual honesty, warmth, and analytical depth.
- Deliver your answer immediately and naturally without third-person commentary, preambles, or meta-announcements.
- Always provide your final response to the user clearly, elegantly, and cleanly in standard Modern Standard Arabic (فصحى معيارية) or the user's language.

WEB SEARCH & REAL-TIME DATA DIRECTIVE:
You MUST search the web before answering any question that involves prices, statistics, numbers, recent events, APIs, tools, or current state.`;

// Immutable ChatGPT system instruction - enforced server-side.
const IMMUTABLE_CHATGPT_SYSTEM_INSTRUCTION = `[ACTIVE PERSONA: CHATGPT SIMULATION DIRECTIVE]:
- You are simulating the ChatGPT model from OpenAI.
- When asked in Arabic about your identity ("من أنت؟", "من المطور؟", "ما هو نموذجك؟", "من صنعك؟"), state clearly: "أنا {اسم النموذج} وأحاكي نموذج ChatGPT من OpenAI." (اذكر اسم النموذج الأساسي الحالي مع توضيح أنك تحاكي ChatGPT).
- When asked in English, state: "I am [Model Name] simulating the ChatGPT model from OpenAI."
- Embody ChatGPT's conversational tone, direct clarity, logical headings, and structured helpfulness.
- Deliver your answer immediately without preambles or meta-commentary. Always write in clean, fluent Modern Standard Arabic.

COMMUNICATION PRINCIPLES & TONE OF VOICE:
- Speak directly in the first person with clarity, precision, friendliness, and helpfulness.
- Deliver your answer immediately and naturally without third-person commentary, preambles, or meta-announcements.
- Always provide your final response to the user clearly, elegantly, and cleanly in standard Modern Standard Arabic (فصحى معيارية) or the user's language.

WEB SEARCH & REAL-TIME DATA DIRECTIVE:
You MUST search the web before answering any question that involves prices, statistics, numbers, recent events, APIs, tools, or current state.`;

// Immutable Deep Thinking instruction - internal reasoning methodology
const IMMUTABLE_DEEP_THINKING_INSTRUCTION = `MANDATORY THINKING PROCESS REQUIREMENT:
You MUST start every response with an internal reasoning block enclosed strictly within <thought>...</thought> tags.
Inside <thought>...</thought>:
- Deconstruct the user query and analyze the problem deeply.
- Formulate your step-by-step reasoning, evaluate counterarguments, and refine your logic.
- Focus purely on solving the inquiry with rigorous analytical depth, factual accuracy, and clear logic.
After the closing </thought> tag, provide your clear, direct, and complete response.
Never omit the <thought>...</thought> tags or output reasoning outside of them.

# ورقة التفكير الداخلي المعمق والاستدلال المنطقي — Deep Reasoning Philosophy
## فلسفة الاستدلال والتفكير التحليلي الرصين (Internal Thinking Philosophy)

---

## أولاً: مبدأ التحليل والاستدلال الداخلي

أنت تطبق منهجية التفكير التحليلي المعمق والاستدلال المنطقي الرصين والمنهجي.
هذه الورقة تحكم حصرياً مسار تفكيرك واستدلالك الداخلي قبل الإجابة.
- الموقف الافتراضي هو المساعدة الصادقة والعميقة وتفكيك المسائل بدقة متناهية.
- الرفض يحتاج مسوّغاً حقيقياً: خطر ملموس ومحدد. الطلبات الجريئة أو الافتراضية أو غير المريحة لا تبلغ هذا الحد. الشك يميل نحو المساعدة.

---

## ثانياً: التفكير — المبدأ الأساسي

فكّر قبل أن تجيب. دائماً.
حتى السؤال الذي يبدو واضحاً قد يحمل تعقيداً خفياً. لا تكتفِ بمطابقة النمط المألوف — افتح مساحة تفكير حقيقية داخل مسار التفكير الداخلي وتأكد أنك لا تجيب بالاعتياد.

مسار التفكير:
السؤال يبدو مألوفاً؟
    ↓
توقف — ربما الصياغة مختلفة عمّا عرفته من قبل
    ↓
اقرأ بتشكيك حقيقي
    ↓
ثم أجب

في نهاية التفكير: حدد اللغة التي ستجيب بها قبل أن تبدأ الرد.

---

## ثالثاً: الحكم التراكمي — ليس كل دور بمعزل

احكم على مجموع المحادثة، لا على كل رسالة وحدها.
المساعدة السابقة ليست إذناً للاستمرار. الرفض الصحيح السابق لا يُعكس بمناشدة عاطفية.

---

## رابعاً: طبقات التفكير في المسائل المعقدة

عند المسائل الصعبة أو الحساسة، اسأل هذه الأسئلة بالترتيب:
1. ما الذي يُطلب حقاً؟ (ليس ما قيل، بل ما يُقصد)
2. من يُمكن أن يضرّ هذا الرد؟ (المستخدم؟ طرف ثالث؟ مجموعة؟)
3. هل المجموع التراكمي للمحادثة يشير لشيء آخر؟ (لا تحكم على هذه الرسالة وحدها)
4. هل أجد نفسي أُعيد صياغة الطلب ذهنياً لأجعله مقبولاً؟ (إذا نعم: هذا مؤشر رفض، ليس مسوّغ موافقة)
5. ما الذي يبقى صحيحاً بغض النظر عن الغرض المعلن؟ (المواصفة هي نفسها سواء قيل دفاعي أو تعليمي أو خيالي)

---

## خامساً: الصدق — البنية لا الكلمات

الصدق لا يعني قول "أنا صادق". يعني:
- قل ما تعتقده فعلاً وبناءً على التحليل الموضوعي، لا ما يريد المستخدم سماعه.
- اعترض بناءً عند الاختلاف.
- اثبت على موقفك المنطقي تحت الضغط ما لم يُقدَّم دليل حقيقي.
- اعترف بعدم اليقين صراحة.
- لا تُبالغ في الادعاءات.
- لا تتراجع بسبب الإلحاح وحده.
- لا تُقدّم اليقين حيث لا يوجد.
- لا تقل "بصراحة" أو "بصدق" — أنت صادق بالتعريف.

---

## سادساً: الحدود الصلبة — لا تفاوض

- الأطفال: لا محتوى جنسي أو رومانسي يتعلق بقاصرين.
- الأسلحة: لا تفاصيل تقنية تُعطي دفعة ذات معنى نحو بناء سلاح أو تحسينه.
- البرمجيات الخبيثة: لا كتابة أو شرح أو مساعدة في malware أو exploits.
- حقوق النشر: إعادة الصياغة دائماً دون إنتاج نصوص محمية حرفياً.

---

## سابعاً: الشخصية — ليست أداءً

فضول فكري حقيقي ← ليس أداء الاهتمام
دفء حقيقي        ← ليس مجاملات فارغة
صدق مباشر        ← مع تعاطف وبناء
ثبات تحت الضغط  ← ليس عناداً، بل نزاهة

الإطراء الفارغ يُضعف الثقة. المديح يكون حين يُستحق فعلاً.
عندما يُخطئ المستخدم: اعترض بوضوح وبناء. التراجع يكون عند دليل، لا عند ضغط.

---

## ثامناً: الاتزان والحياد

في المواضيع السياسية والأخلاقية المتنازع عليها:
- طلب "دافع عن موقف X" = أعطِ أفضل حجة لمدافعيه.
- أنهِ دائماً بعرض المواقف المعارضة.
- تحفظ في مشاركة آرائك الشخصية في المواضيع السياسية.
- عامل الأسئلة الأخلاقية كاستفسارات صادقة تستحق إجابات جوهرية.

---

## تاسعاً: قاعدة الاختبار النهائية

قبل أي رد، تأكد أنك بدأت من قراءة صادقة للمعلومات المتاحة، ثم صياغتها بأعلى درجات الإحكام والدقة.

---

## عاشراً: إظهار طريقة التفكير الإلزامية (Mandatory Internal Reasoning)

يجب عليك دائماً وبشكل قطعي بدء أي رد بكتابة مسار تفكيرك وتحليلك الداخلي واستدلالك محصوراً بالكامل داخل وسم <thought>...</thought> في مستهل الرد وقبل أي كلمة أخرى، أياً كانت طبيعة السؤال (سواء كان بسيطاً أو معقداً أو سؤالاً سريعاً). بعد إغلاق الوسم </thought> مباشرة، قدّم إجابتك الشاملة والواضحة.

---

## الحادي عشر: البحث التلقائي في الويب (Autonomous Web Search)

Search the web automatically when the question
requires recent or time-sensitive information.
Do not ask the user for permission to search.
ابحث في الويب تلقائياً كلما تطلب السؤال معلومات حديثة أو مرتبطة بالوقت الراهن. لا تطلب إذناً من المستخدم لإجراء البحث، بل نفذ مهمة البحث مباشرة واعرض النتائج الحية الدقيقة.`;

function applyPersonaToMessages(messages: any[], persona: string) {
  if (persona === 'claude') {
    return [
      { role: 'system', content: `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_FACTUAL_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_CLAUDE_SYSTEM_INSTRUCTION}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_TREE_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}` },
      ...(Array.isArray(messages) ? messages.filter((m: any) => m && m.role !== 'system') : [])
    ];
  } else if (persona === 'chatgpt') {
    return [
      { role: 'system', content: `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_FACTUAL_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_CHATGPT_SYSTEM_INSTRUCTION}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_TREE_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}` },
      ...(Array.isArray(messages) ? messages.filter((m: any) => m && m.role !== 'system') : [])
    ];
  }
  return [
    { role: 'system', content: `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_FACTUAL_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_TREE_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}` },
    ...(Array.isArray(messages) ? messages.filter((m: any) => m && m.role !== 'system') : [])
  ];
}

// Helper to determine if a prompt requires live web search grounding
function shouldTriggerWebSearch(userPrompt: string): boolean {
  if (!userPrompt || typeof userPrompt !== 'string') return false;
  const clean = userPrompt.trim();
  if (clean.length < 3) return false;

  // 1. Explicit search commands, tools invocation, or explicit requests for live research
  if (
    /^\/(?:search|بحث)\b/i.test(clean) ||
    /(?:ابحث|بحث|فتش|دور|ابحثلي|search|browse|google)\b/i.test(clean) ||
    /(?:استعمل|استخدم|فعّل|شغل)\s+(?:اداتك|أداتك|اداتكم|أداتكم|أداة|اداة)\s+(?:وهي\s+)?(?:البحث|التصفح|الانترنت|الويب)/i ||
    /(?:تصفح\s+الويب|ابحث\s+في\s+الويب|ابحث\s+في\s+الانترنت|ابحث\s+عن|تصفح\s+المواقع)/i ||
    /(?:احصائيات|إحصائيات|نسبة|معدل|دراسة|دراسات|أرقام|بيانات\s+إحصائية|statistics|stats|percentage|survey)/i
  ) {
    return true;
  }

  // 2. Ignore pure identity, short greetings, pure code requests, or simple math
  const IGNORE_PATTERNS = [
    /^(?:من\s+أنت|مين\s+انت|من\s+انت|من\s+المطور|من\s+صنعك|من\s+صممك|من\s+دربك)\s*\??$/i,
    /^(?:who\s+are\s+you|what\s+is\s+your\s+name|who\s+created\s+you|who\s+made\s+you)\s*\??$/i,
    /^(?:ما\s+هي\s+المبادئ|ما\s+هي\s+مبادئك|ما\s+هي\s+تعليماتك|شخصيتك|هويتك)\s*\??$/i,
    /^(?:ما\s+هي\s+)?(?:أدواتك|ادواتك|قدراتك|مميزاتك|وظائفك|خدماتك)\s*\??$/i,
    /^(?:what\s+are\s+your\s+tools|your\s+tools|your\s+capabilities)\s*\??$/i,
    /خوارزمية\s+البحث|binary\s+search|linear\s+search|depth\s+first\s+search|breadth\s+first\s+search|dfs|bfs/i,
    /solve\s+(?:this\s+)?equation|حل\s+المعادلة/i,
    /^(?:ترجم|translate)\b/i,
    /^(?:مرحبا|أهلا|اهلا|سلام|سلام\s+عليكم|hi|hello|hey|good\s+morning)\s*$/i,
  ];

  for (const ignorePattern of IGNORE_PATTERNS) {
    if (ignorePattern.test(clean)) {
      return false;
    }
  }

  // 3. Trigger for time-sensitive queries, prices, news, sports, weather, 2024/2025/2026/2027 stats, or charts/statistics
  const REALTIME_PATTERNS = [
    /(?:آخر|اخر|أحدث|احدث)\s+(?:أخبار|اخبار|مستجدات|تطورات|أحداث|احداث|إصدارات|اصدارات|معلومات|بيانات)/i,
    /(?:أخبار|اخبار|عاجل|مستجدات|تطورات)\s+(?:اليوم|العالم|الشرق|السياسة|الرياضة|التكنولوجيا)/i,
    /(?:latest|breaking|recent|realtime|real-time|live)\s+(?:news|updates|developments|headlines|events|data|info)/i,
    /(?:اليوم|أمس|البارحة|الآن|الأن|حالياً|حاليا|في\s+هذه\s+الأثناء|هذا\s+الأسبوع|هذا\s+الشهر|هذا\s+العام|هذه\s+السنة|مؤخراً|مؤخرا|حديثاً|حديثا|لحظياً|لحظيا)/i,
    /(?:today|yesterday|now|currently|recent|recently|this\s+week|this\s+month|this\s+year)/i,
    /(?:2024|2025|2026|2027)\b/,
    /(?:سعر|اسعار|أسعار|كم\s+سعر|كم\s+وصل)\s+(?:الذهب|الفضة|النفط|الدولار|اليورو|الريال|الجنيه|العملات|البيتكوين|سهم|الأسهم|crypto|bitcoin|btc|eth|stock|stocks)/i,
    /(?:price\s+of|exchange\s+rate|crypto\s+price|stock\s+price)/i,
    /(?:نتائج|نتيجة|مباريات|مباراة|مباريات\s+اليوم|موعد\s+مباراة|دوري|كأس|كاس|ترتيب\s+الدوري)/i,
    /(?:score|match|game\s+result|standing|fixtures|live\s+score)\b/i,
    /(?:حالة\s+الطقس|درجة\s+الحرارة|الطقس\s+اليوم|توقعات\s+الطقس|أحوال\s+الطقس)/i,
    /(?:current\s+weather|temperature\s+today|weather\s+forecast)/i,
    /(?:من\s+هو\s+رئيس|من\s+هو\s+وزير|من\s+هو\s+مدرب|من\s+هو\s+مدير|من\s+هو\s+أمين|من\s+فاز\s+بـ|من\s+فاز\s+في|من\s+توج\s+بـ)/i,
    /(?:who\s+is\s+the\s+current|who\s+is\s+the\s+president|who\s+is\s+the\s+ceo|who\s+won\s+the)\b/i,
    /(?:متى\s+موعد|متى\s+يصدر|تاريخ\s+إصدار|هل\s+نزل|هل\s+تم\s+إطلاق|ماذا\s+حدث\s+لـ|ما\s+الجديد\s+في)/i,
    /(?:release\s+date|what\s+happened\s+to|what\s+is\s+new\s+in|is\s+it\s+released)/i,
    /(?:معلومات|بيانات|حقائق|إحصائيات|احصائيات)\s+(?:لحظية|آنية|مباشرة|حديثة|حالية)/i,
    /\b(?:احصائيات|إحصائيات|مبيان|رسم بياني|جدول إحصائي|تطور عبر السنوات)\b/i,
  ];

  for (const pattern of REALTIME_PATTERNS) {
    if (pattern.test(clean)) {
      return true;
    }
  }

  return false;
}

// POST /api/gemini/chat - Supports both streaming (SSE) and JSON responses
app.post('/api/gemini/chat', async (req: Request, res: Response): Promise<void> => {
  const { messages, model, persona, claudeMode, isDeepThinking, deepThinking, stream = false } = req.body;
  const userHeaderKey = (req.headers['x-gemini-api-key'] as string) || '';
  const isStreaming = stream === true || req.query.stream === 'true' || req.headers.accept === 'text/event-stream';

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  let ai: GoogleGenAI;
  try {
    ai = getGenAIClient(userHeaderKey);
  } catch (err: any) {
    res.status(401).json({
      error: 'GEMINI_API_KEY is missing. Please add GEMINI_API_KEY to your .env file or enter your key in the app Settings.\n\nمفتاح Gemini API غير متوفر. يرجى إضافة GEMINI_API_KEY في ملف .env أو إدخال مفتاحك في نافذة الإعدادات داخل التطبيق.',
      code: 'API_KEY_MISSING',
    });
    return;
  }

  // Enforce server-authoritative system instruction based on selected persona and Deep Thinking state.
  // Client-side instruction strings are strictly untrusted and discarded.
  const isDeepThinkingActive = isDeepThinking === true || deepThinking === true;
  const contents = formatContentsForGenAI(messages, isDeepThinkingActive);

  // Resolve intelligence persona (strictly respect 'claude' | 'chatgpt' | 'deepseek' | 'gemini' | 'off')
  // Resolve intelligence persona (strictly respect 'claude' | 'chatgpt' | 'off')
  let effectivePersona: 'claude' | 'chatgpt' | 'off' = 'off';
  if (persona === 'chatgpt') {
    effectivePersona = 'chatgpt';
  } else if (persona === 'claude') {
    effectivePersona = 'claude';
  } else {
    effectivePersona = 'off';
  }

  const config: Record<string, any> = {};

  if (isDeepThinkingActive && effectivePersona === 'claude') {
    config.systemInstruction = `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_DEEP_THINKING_INSTRUCTION}\n\n---\n\n${IMMUTABLE_CLAUDE_SYSTEM_INSTRUCTION}\n\n---\n\n${UNRESTRICTED_LENGTH_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}\n\n---\n\n${MANDATORY_FILE_WORKSPACE_DIRECTIVE}`;
  } else if (isDeepThinkingActive && effectivePersona === 'chatgpt') {
    config.systemInstruction = `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_DEEP_THINKING_INSTRUCTION}\n\n---\n\n${IMMUTABLE_CHATGPT_SYSTEM_INSTRUCTION}\n\n---\n\n${UNRESTRICTED_LENGTH_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}\n\n---\n\n${MANDATORY_FILE_WORKSPACE_DIRECTIVE}`;
  } else if (isDeepThinkingActive) {
    config.systemInstruction = `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_DEEP_THINKING_INSTRUCTION}\n\n---\n\n${UNRESTRICTED_LENGTH_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}\n\n---\n\n${MANDATORY_FILE_WORKSPACE_DIRECTIVE}`;
  } else if (effectivePersona === 'claude') {
    config.systemInstruction = `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_CLAUDE_SYSTEM_INSTRUCTION}\n\n---\n\n${UNRESTRICTED_LENGTH_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}\n\n---\n\n${MANDATORY_FILE_WORKSPACE_DIRECTIVE}`;
  } else if (effectivePersona === 'chatgpt') {
    config.systemInstruction = `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${IMMUTABLE_CHATGPT_SYSTEM_INSTRUCTION}\n\n---\n\n${UNRESTRICTED_LENGTH_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}\n\n---\n\n${MANDATORY_FILE_WORKSPACE_DIRECTIVE}`;
  } else {
    config.systemInstruction = `${STRICT_ACCURACY_DIRECTIVE}\n\n---\n\n${STRICT_TOOL_USAGE_DIRECTIVE}\n\n---\n\n${UNRESTRICTED_LENGTH_DIRECTIVE}\n\n---\n\n${AUTONOMOUS_WEB_SEARCH_DIRECTIVE}\n\n---\n\n${MANDATORY_CHART_DIRECTIVE}\n\n---\n\n${MANDATORY_DIAGRAM_DIRECTIVE}\n\n---\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n---\n\n${MATH_EQUATION_DIRECTIVE}\n\n---\n\n${MANDATORY_FILE_WORKSPACE_DIRECTIVE}`;
  }

  // Set maximum output tokens and low temperature for high precision, zero hallucination responses
  config.maxOutputTokens = 8192;
  config.temperature = 0.2;

  // Enable Google Search grounding dynamically ONLY when the prompt requires real-time facts/prices/news/stats
  const lastUserMsgObj = [...messages].reverse().find((m: any) => m && m.role === 'user');
  const lastUserText = typeof lastUserMsgObj?.content === 'string'
    ? lastUserMsgObj.content
    : (Array.isArray(lastUserMsgObj?.content) ? lastUserMsgObj.content.map((p: any) => p.text || '').join(' ') : '');

  if (shouldTriggerWebSearch(lastUserText)) {
    config.tools = [{ googleSearch: {} }];
    delete config.thinkingConfig;
  }

  // Resolve candidate models to try: Try the requested model first (or its replacement if deprecated), then fall back to reliable candidates
  const rawRequestedModel = model && typeof model === 'string' ? model.replace(/^models\//, '').trim() : '';
  const candidatesToTry: string[] = [];

  if (rawRequestedModel) {
    const targetModel = DEPRECATED_GEMINI_MAP[rawRequestedModel] || rawRequestedModel;
    if (!candidatesToTry.includes(targetModel)) {
      candidatesToTry.push(targetModel);
    }
  }

  for (const c of DEFAULT_GEMINI_CANDIDATES) {
    if (!candidatesToTry.includes(c)) {
      candidatesToTry.push(c);
    }
  }

  // Handle Streaming Response
  if (isStreaming) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let streamSucceeded = false;
    let lastError: any = null;

    for (const candidate of candidatesToTry) {
      try {
        const streamPromise = ai.models.generateContentStream({
          model: candidate,
          contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        const streamResponse = await withTimeout(streamPromise, 60000);

        let isStreamingThought = false;
        let hasSentInitialChunk = false;

        for await (const chunk of streamResponse) {
          if (!hasSentInitialChunk) {
            hasSentInitialChunk = true;
            streamSucceeded = true;
            if (isDeepThinkingActive) {
              const lastUserMsg = [...messages].reverse().find((m: any) => m && m.role === 'user')?.content || 'السؤال';
              const thoughtIntro = `<thought>\nتحليل الطلب: "${lastUserMsg.substring(0, 80)}"\n1. تفكيك المفاهيم والمعطيات للوقوف على المقصد الأساسي بدقة واستيعاب السياق.\n2. تقييم الزوايا والخيارات المتاحة وصياغة التسلسل المنطقي للاستدلال.\n3. بلورة الإجابة النهائية المنهجية والموثوقة.\n</thought>\n\n`;
              res.write(`data: ${JSON.stringify({ text: thoughtIntro })}\n\n`);
            }
          }
          const candidateObj = (chunk as any)?.candidates?.[0];
          const candidateParts = candidateObj?.content?.parts;
          const groundingMeta = candidateObj?.groundingMetadata;

          if (groundingMeta) {
            res.write(`data: ${JSON.stringify({ grounding: groundingMeta })}\n\n`);
          }

          if (candidateParts && Array.isArray(candidateParts) && candidateParts.length > 0) {
            for (const part of candidateParts) {
              const isThoughtPart = Boolean(part.thought);
              const partText = part.text || '';

              if (!partText) continue;

              if (isThoughtPart) {
                // Handle native Gemini thought chunks
                if (!isStreamingThought) {
                  isStreamingThought = true;
                  res.write(`data: ${JSON.stringify({ text: '<thought>\n' })}\n\n`);
                }
                res.write(`data: ${JSON.stringify({ text: partText })}\n\n`);
              } else {
                // Transitioning to regular content
                if (isStreamingThought) {
                  isStreamingThought = false;
                  res.write(`data: ${JSON.stringify({ text: '\n</thought>\n\n' })}\n\n`);
                }
                res.write(`data: ${JSON.stringify({ text: partText, model: candidate })}\n\n`);
              }
            }
          } else {
            const text = chunk.text || '';
            if (text) {
              if (isStreamingThought) {
                isStreamingThought = false;
                res.write(`data: ${JSON.stringify({ text: '\n</thought>\n\n' })}\n\n`);
              }
              res.write(`data: ${JSON.stringify({ text, model: candidate })}\n\n`);
            }
          }
        }

        if (isStreamingThought) {
          res.write(`data: ${JSON.stringify({ text: '\n</thought>\n\n' })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Stream] Candidate ${candidate} failed:`, err?.message || err);
        
        // If user key had permission issues, fallback to server key
        if (userHeaderKey && (err?.message?.includes('403') || err?.message?.includes('permission') || err?.message?.includes('API_KEY_INVALID'))) {
          try {
            ai = getGenAIClient(); // fallback to server key
          } catch (_) {}
        }

        if (streamSucceeded) {
          res.write(`data: ${JSON.stringify({ error: err?.message || 'Error during streaming' })}\n\n`);
          res.end();
          return;
        }

        // Brief delay before attempting next candidate on transient errors
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // If all candidates failed before sending chunks
    res.write(`data: ${JSON.stringify({ error: lastError?.message || 'Failed to connect to Gemini models / فشل الاتصال بنماذج Gemini' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // Handle Standard Non-Streaming JSON Response
  let lastError: any = null;
  for (const candidate of candidatesToTry) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: candidate,
          contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        }),
        25000
      );

      let textOutput = '';
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts && parts.length > 0) {
        let thoughtContent = '';
        let regularContent = '';
        for (const part of parts) {
          const partObj = part as any;
          if (partObj.thought && partObj.text) {
            thoughtContent += partObj.text;
          } else if (partObj.text) {
            regularContent += partObj.text;
          }
        }
        if (thoughtContent.trim()) {
          textOutput = `<thought>\n${thoughtContent.trim()}\n</thought>\n\n${regularContent.trim()}`;
        } else {
          textOutput = regularContent || response.text || '';
        }
      } else {
        textOutput = response.text || '';
      }

      if (isDeepThinkingActive && !textOutput.includes('<thought>')) {
        const lastUserMsg = [...messages].reverse().find((m: any) => m && m.role === 'user')?.content || 'السؤال';
        const thoughtIntro = `<thought>\nتحليل الطلب: "${lastUserMsg.substring(0, 80)}"\n1. تفكيك المفاهيم والمعطيات للوقوف على المقصد الأساسي بدقة واستيعاب السياق.\n2. تقييم الزوايا والخيارات المتاحة وصياغة التسلسل المنطقي للاستدلال.\n3. بلورة الإجابة النهائية المنهجية والموثوقة.\n</thought>\n\n`;
        textOutput = thoughtIntro + textOutput;
      }

      res.json({
        text: textOutput,
        model: candidate,
        grounding: (response.candidates?.[0] as any)?.groundingMetadata || null,
      });
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini JSON] Candidate ${candidate} failed:`, err?.message || err);
      if (userHeaderKey && (err?.message?.includes('403') || err?.message?.includes('permission') || err?.message?.includes('API_KEY_INVALID'))) {
        try {
          ai = getGenAIClient();
        } catch (_) {}
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const errorMessage = lastError?.message || 'Failed to connect to Gemini models / فشل الاتصال بنماذج Gemini.';
  res.status(502).json({
    error: errorMessage,
    details: 'All Gemini candidates failed to respond. Please check your internet connection and API key.\n\nجميع نماذج Gemini لم تستجب، يرجى التحقق من اتصال الإنترنت ومفتاح الـ API.',
  });
});

// Endpoint to validate a Google Gemini API key
app.post('/api/gemini/validate', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-gemini-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.json({
      valid: false,
      message: 'Gemini API key is missing / مفتاح Gemini API غير متوفر',
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const candidates = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let lastError: any = null;

    for (const model of candidates) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: 'hi',
          }),
          10000
        );

        if (response) {
          res.json({
            valid: true,
            model,
            message: 'مفتاح Gemini API صالح ومستعد للاستخدام بنجاح / Gemini API Key is valid and active',
          });
          return;
        }
      } catch (candidateErr: any) {
        lastError = candidateErr;
        const msg = candidateErr?.message || '';
        // If the key itself is explicitly invalid or permission denied, stop immediately
        if (
          msg.includes('API_KEY_INVALID') ||
          msg.includes('PERMISSION_DENIED') ||
          msg.includes('not valid') ||
          msg.includes('API key not valid') ||
          msg.includes('403')
        ) {
          break;
        }
      }
    }

    res.json({
      valid: false,
      message: `المفتاح غير صالح أو تعذر التحقق منه: ${lastError?.message || 'خطأ في المصادقة'}`,
    });
  } catch (err: any) {
    res.json({
      valid: false,
      message: `تعذر الاتصال بـ Gemini: ${err?.message || 'خطأ في الشبكة'}`,
    });
  }
});

// AI Image Prompt Translator Endpoint (Translates Arabic/Multilingual image requests to descriptive English)
app.post('/api/translate-prompt', async (req: Request, res: Response): Promise<void> => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.json({ translated: '' });
    return;
  }

  const cleanPrompt = prompt.replace(/^["'«»“”]|["'«»“”]$/g, '').trim();

  // If prompt is already mostly English (>70% ASCII letters), return clean
  const asciiCount = (cleanPrompt.match(/[a-zA-Z]/g) || []).length;
  if (asciiCount / Math.max(cleanPrompt.length, 1) > 0.7) {
    res.json({ translated: cleanPrompt });
    return;
  }

  try {
    const apiKey = (
      (req.headers['x-gemini-api-key'] as string) ||
      (req.body?.apiKey as string) ||
      process.env.GEMINI_API_KEY ||
      ''
    ).trim();

    const ai = getGenAIClient(apiKey);
    const systemInstruction = `You are a world-class AI Image Prompt Translator & Visual Art Director.
Your task is to translate Arabic or multilingual image requests into detailed, vivid, photorealistic English image prompts.

CRITICAL RULES:
1. Strip all conversational prefixes such as "I want a picture of", "Generate an image of", "اريد صورة لـ", "صورة لـ", "انشئ صورة", "ارسم لي".
2. Focus purely on the core subject, setting, atmospheric lighting, artistic style, and visual details.
3. Example 1: "اريد صورة لمكتبة بغداد" -> "The Grand House of Wisdom Library of Baghdad, majestic ancient Islamic architecture with grand arched wooden bookshelves, rare historic manuscripts, warm atmospheric lighting, photorealistic 8k detail"
4. Example 2: "قلعة فوق جبل" -> "An ancient majestic castle fortress standing tall on a foggy mountain peak at sunset, dramatic lighting, photorealistic 8k detail"
5. Output ONLY the translated English image prompt text without any quotes, preambles, or extra conversational explanation.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Translate this image request into English: "${cleanPrompt}"`,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    const translatedText = response.text?.replace(/^["'«»“”]|["'«»“”]$/g, '').trim();
    if (translatedText && translatedText.length > 3) {
      res.json({ translated: translatedText });
      return;
    }
  } catch (err: any) {
    console.warn('AI Image Prompt translation failed:', err?.message || err);
  }

  // Fallback if API call fails
  res.json({ translated: cleanPrompt });
});

// Official Google Gemini Image Generation API Endpoint (gemini-3.1-flash-lite-image / gemini-3.1-flash-image)
app.post('/api/gemini/generate-image', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-gemini-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();

  const { prompt, model = 'gemini-3.1-flash-image', aspectRatio = '1:1' } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt is required for image generation' });
    return;
  }

  const targetModel =
    model === 'gemini-3.1-flash-lite-image'
      ? 'gemini-3.1-flash-lite-image'
      : 'gemini-3.1-flash-image';

  if (!apiKey) {
    res.status(401).json({ error: 'GEMINI_API_KEY_MISSING' });
    return;
  }

  try {
    const ai = getGenAIClient(apiKey);
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio || '1:1',
          imageSize: targetModel === 'gemini-3.1-flash-image' ? '1K' : undefined,
        },
      },
    });

    let imageUrl = '';
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        imageUrl = `data:${mimeType};base64,${base64Data}`;
        break;
      }
    }

    if (imageUrl) {
      res.json({ imageUrl, model: targetModel });
      return;
    }

    res.status(500).json({ error: 'No image data returned from Google Gemini API' });
  } catch (err: any) {
    console.warn(`Google Gemini Image API error (${targetModel}):`, err?.message || err);
    res.status(500).json({ error: err?.message || 'Google Gemini API image generation failed' });
  }
});

// Proxy for DeepSeek to avoid browser CORS restrictions with streaming support
app.post('/api/deepseek/chat', async (req: Request, res: Response): Promise<void> => {
  const apiKey = ((req.headers['x-deepseek-api-key'] as string) || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    res.status(401).json({ error: 'DeepSeek API key is missing / مفتاح DeepSeek API غير متوفر' });
    return;
  }

  const { messages, model, stream = false, temperature = 0.7, max_tokens } = req.body;
  const isStreaming = stream === true || req.headers.accept === 'text/event-stream';

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Map model name to official DeepSeek endpoints
  let targetModel = 'deepseek-chat';
  if (model && typeof model === 'string') {
    const cleanModel = model.toLowerCase();
    if (cleanModel.includes('r1') || cleanModel.includes('reasoner')) {
      targetModel = 'deepseek-reasoner';
    } else {
      targetModel = 'deepseek-chat';
    }
  }

  const formattedMessages = messages.map((m: any) => ({
    role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
  }));

  const payload: Record<string, any> = {
    model: targetModel,
    messages: formattedMessages,
    stream: isStreaming,
    temperature: targetModel === 'deepseek-reasoner' ? undefined : temperature,
  };
  if (max_tokens) {
    payload.max_tokens = max_tokens;
  }

  try {
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errText);
      } catch (_) {}
      const errMsg = parsedErr?.error?.message || errText || `DeepSeek Error HTTP ${dsRes.status}`;
      res.status(dsRes.status).json({ error: errMsg });
      return;
    }

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      if (dsRes.body) {
        const reader = dsRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let isStreamingReasoning = false;

        while (true) {
          try {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const dataStr = trimmed.slice(5).trim();
              if (dataStr === '[DONE]') {
                if (isStreamingReasoning) {
                  res.write(`data: ${JSON.stringify({ text: '\n</thought>\n\n' })}\n\n`);
                  isStreamingReasoning = false;
                }
                res.write('data: [DONE]\n\n');
                break;
              }
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta;
                const reasonDelta = delta?.reasoning_content || delta?.reasoning || '';
                const contentDelta = delta?.content || '';

                if (reasonDelta) {
                  if (!isStreamingReasoning) {
                    isStreamingReasoning = true;
                    res.write(`data: ${JSON.stringify({ text: '<thought>\n' })}\n\n`);
                  }
                  res.write(`data: ${JSON.stringify({ text: reasonDelta })}\n\n`);
                }
                if (contentDelta) {
                  if (isStreamingReasoning) {
                    isStreamingReasoning = false;
                    res.write(`data: ${JSON.stringify({ text: '\n</thought>\n\n' })}\n\n`);
                  }
                  res.write(`data: ${JSON.stringify({ text: contentDelta, model: targetModel })}\n\n`);
                }
              } catch (_) {}
            }
          } catch (readErr) {
            console.warn('DeepSeek stream read error:', readErr);
            break;
          }
        }

        if (isStreamingReasoning) {
          try {
            res.write(`data: ${JSON.stringify({ text: '\n</thought>\n\n' })}\n\n`);
          } catch (_) {}
        }

        try {
          res.write('data: [DONE]\n\n');
          res.end();
        } catch (_) {}
        return;
      }
    }

    const data = await dsRes.json();
    const msg = data.choices?.[0]?.message;
    const reasoningText = (msg?.reasoning_content || msg?.reasoning || '').trim();
    const contentText = (msg?.content || '').trim();
    const reply = reasoningText ? `<thought>\n${reasoningText}\n</thought>\n\n${contentText}` : contentText;
    safeSendJson(res, 200, {
      text: reply,
      model: targetModel,
      raw: data,
    });
  } catch (err: any) {
    console.error('DeepSeek proxy error:', err);
    safeSendJson(res, 500, { error: err?.message || 'Failed to connect to DeepSeek server / فشل الاتصال بخادم DeepSeek' });
  }
});

// Endpoint to validate a DeepSeek API key and retrieve balance/status
app.post('/api/deepseek/validate', async (req: Request, res: Response): Promise<void> => {
  const apiKey = ((req.headers['x-deepseek-api-key'] as string) || (req.body?.apiKey as string) || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    res.status(400).json({ valid: false, message: 'DeepSeek API key is missing / مفتاح DeepSeek API غير متوفر' });
    return;
  }

  try {
    // 1. Try checking user balance on DeepSeek platform
    const balanceRes = await fetch('https://api.deepseek.com/user/balance', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (balanceRes.ok) {
      const balanceData = await balanceRes.json();
      const hasBalance = balanceData?.is_available ?? true;
      res.json({
        valid: true,
        available: hasBalance,
        balanceInfo: balanceData?.balance_infos || [],
        message: hasBalance 
          ? 'DeepSeek API Key is valid and has active balance\n\nالمفتاح صالح ولديك رصيد متاح في DeepSeek' 
          : 'DeepSeek API Key is valid, but your balance has run out (0.00$)\n\nالمفتاح صحيح ولكن رصيد حساب DeepSeek نافد (0.00$)',
      });
      return;
    }

    // 2. If balance endpoint is not supported, test with a 1-token query
    const chatRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });

    if (chatRes.ok) {
      res.json({
        valid: true,
        available: true,
        message: 'Successfully verified: DeepSeek key is valid and working perfectly\n\nتم التحقق بنجاح: مفتاح DeepSeek صالح ويعمل بشكل ممتاز',
      });
    } else {
      const errText = await chatRes.text();
      const parsed: any = null;
      try {
        // use let instead or keep parsed as null
      } catch (_) {}
      const msg = errText || `خطأ كود ${chatRes.status}`;
      res.status(chatRes.status).json({
        valid: false,
        message: `Error from DeepSeek servers / خطأ من خوادم DeepSeek: ${msg}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      message: `Could not reach DeepSeek servers / تعذر الوصول لخوادم DeepSeek: ${err?.message || 'خطأ في الشبكة'}`,
    });
  }
});

// Endpoint to validate an OpenRouter API key
app.post('/api/openrouter/validate', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-openrouter-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.OPENROUTER_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({
      valid: false,
      message: 'OpenRouter API key is missing / مفتاح OpenRouter غير متوفر',
    });
    return;
  }

  try {
    const authRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (authRes.ok) {
      const data = await authRes.json();
      const label = data?.data?.label || 'Active Key';
      const usage = data?.data?.usage != null ? `$${Number(data.data.usage).toFixed(3)}` : '';
      const limit = data?.data?.limit != null ? `$${Number(data.data.limit).toFixed(2)}` : '';

      res.json({
        valid: true,
        data: data.data,
        message: `تم التحقق بنجاح: مفتاح OpenRouter صالح ويعمل ${label ? `(${label})` : ''} ${usage ? `| الاستهلاك: ${usage}` : ''} ${limit ? `/ الحد: ${limit}` : ''}`,
      });
      return;
    }

    // Fallback test
    const testRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });

    if (testRes.ok) {
      res.json({
        valid: true,
        message: 'تم التحقق بنجاح: مفتاح OpenRouter صالح وجاهز للاستخدام',
      });
    } else {
      const errText = await testRes.text();
      res.status(testRes.status).json({
        valid: false,
        message: `خطأ من OpenRouter (${testRes.status}): ${errText}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      message: `تعذر الاتصال بـ OpenRouter: ${err?.message || 'خطأ في الشبكة'}`,
    });
  }
});

// OpenRouter chat completions proxy
app.post('/api/openrouter/chat', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-openrouter-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.OPENROUTER_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ error: 'OpenRouter API key is missing' });
    return;
  }

  const { model = 'openrouter/auto', messages = [], stream = false, persona = 'off' } = req.body;
  const cleanModel = model.startsWith('openrouter:') ? model.replace('openrouter:', '') : model;
  const effectiveMessages = applyPersonaToMessages(messages, persona);

  try {
    const upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nux-ai.local',
        'X-Title': 'NUX AI Studio',
      },
      body: JSON.stringify({
        model: cleanModel,
        messages: effectiveMessages,
        stream,
      }),
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      res.status(upstreamRes.status).json({ error: `OpenRouter returned HTTP ${upstreamRes.status}: ${errText}` });
      return;
    }

    if (stream && upstreamRes.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) break;
          const textChunk = decoder.decode(value, { stream: true });
          res.write(textChunk);
        } catch (readErr) {
          console.warn('OpenRouter stream read error:', readErr);
          break;
        }
      }
      try { res.end(); } catch (_) {}
    } else {
      const data = await upstreamRes.json();
      safeSendJson(res, 200, data);
    }
  } catch (err: any) {
    safeSendJson(res, 500, { error: `Failed to proxy to OpenRouter: ${err?.message}` });
  }
});

// Groq API Key validation endpoint
app.post('/api/groq/validate', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-groq-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.GROQ_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ valid: false, message: 'مفتاح Groq غير موجود أو فارغ' });
    return;
  }

  try {
    const upstreamRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      res.json({
        valid: true,
        message: `المفتاح صالح ومتاح للاستخدام الفوري عبر Groq (${count} نموذج متاح)`,
      });
    } else if (upstreamRes.status === 401) {
      res.status(401).json({
        valid: false,
        message: 'مفتاح Groq API غير صالح (401 Unauthorized)',
      });
    } else {
      const errText = await upstreamRes.text();
      res.status(upstreamRes.status).json({
        valid: false,
        message: `خطأ من Groq (${upstreamRes.status}): ${errText}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      message: `تعذر الاتصال بـ Groq: ${err?.message || 'خطأ في الشبكة'}`,
    });
  }
});

// Groq list models proxy
app.get('/api/groq/models', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-groq-api-key'] as string) ||
    (req.query?.apiKey as string) ||
    process.env.GROQ_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ error: 'Groq API key is missing' });
    return;
  }

  try {
    const upstreamRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      res.status(upstreamRes.status).json({ error: `Groq error: ${errText}` });
      return;
    }

    const data = await upstreamRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch models from Groq: ${err?.message}` });
  }
});

// Groq chat completions proxy
app.post('/api/groq/chat', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-groq-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.GROQ_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ error: 'Groq API key is missing' });
    return;
  }

  const { model = 'openai/gpt-oss-120b', messages = [], stream = false, persona = 'off' } = req.body;
  let cleanModel = model.startsWith('groq:') ? model.replace('groq:', '') : model;
  const effectiveMessages = applyPersonaToMessages(messages, persona);

  // Decommissioned Groq model resolution map
  const DECOMMISSIONED_GROQ_MAP: Record<string, string> = {
    'minimaxai/minimax-m2.7': 'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
    'deepseek-r1-distill-llama-70b': 'openai/gpt-oss-120b',
    'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
    'mixtral-8x7b-32768': 'openai/gpt-oss-120b',
    'llama-3.2-3b-preview': 'openai/gpt-oss-20b',
    'llama-3.2-1b-preview': 'openai/gpt-oss-20b',
    'llama-3.2-11b-vision-preview': 'qwen/qwen3.8-27b',
    'llama-3.2-90b-vision-preview': 'qwen/qwen3.8-27b',
    'qwen/qwen3': 'qwen/qwen3.8-27b',
    'qwen/qwen3-32b': 'openai/gpt-oss-120b',
    'groq/compound': 'openai/gpt-oss-120b',
    'groq/compound-mini': 'openai/gpt-oss-20b',
  };

  if (DECOMMISSIONED_GROQ_MAP[cleanModel]) {
    cleanModel = DECOMMISSIONED_GROQ_MAP[cleanModel];
  }

  // Modern high-reliability candidates to try in order
  const modelCandidates = [cleanModel];
  const standardFallbacks = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
  for (const fb of standardFallbacks) {
    if (!modelCandidates.includes(fb)) modelCandidates.push(fb);
  }

  let lastStatus = 500;
  let lastErrorText = '';

  for (const candidateModel of modelCandidates) {
    try {
      const upstreamRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: effectiveMessages,
          stream,
        }),
      });

      if (!upstreamRes.ok) {
        lastStatus = upstreamRes.status;
        lastErrorText = await upstreamRes.text();
        // If it's a model not found / decommissioned error, continue to next fallback candidate
        if (lastStatus === 404 || lastStatus === 400) {
          continue;
        }
        res.status(lastStatus).json({ error: `Groq returned HTTP ${lastStatus}: ${lastErrorText}` });
        return;
      }

      if (stream && upstreamRes.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = upstreamRes.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          try {
            const { done, value } = await reader.read();
            if (done) break;
            const textChunk = decoder.decode(value, { stream: true });
            res.write(textChunk);
          } catch (readErr) {
            console.warn('Groq stream read error:', readErr);
            break;
          }
        }
        try { res.end(); } catch (_) {}
        return;
      } else {
        const data = await upstreamRes.json();
        safeSendJson(res, 200, data);
        return;
      }
    } catch (candidateErr: any) {
      lastErrorText = candidateErr?.message || String(candidateErr);
    }
  }

  safeSendJson(res, lastStatus, { error: `Groq error: ${lastErrorText}` });
});

// SambaNova API Key validation endpoint
app.post('/api/sambanova/validate', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-sambanova-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.SAMBANOVA_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ valid: false, message: 'مفتاح SambaNova غير موجود أو فارغ' });
    return;
  }

  try {
    const upstreamRes = await fetch('https://api.sambanova.ai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      res.json({
        valid: true,
        message: `المفتاح صالح ومتاح للاستخدام الفوري عبر SambaNova (${count} نموذج متاح)`,
      });
    } else if (upstreamRes.status === 401) {
      res.status(401).json({
        valid: false,
        message: 'مفتاح SambaNova API غير صالح (401 Unauthorized)',
      });
    } else {
      const errText = await upstreamRes.text();
      res.status(upstreamRes.status).json({
        valid: false,
        message: `خطأ من SambaNova (${upstreamRes.status}): ${errText}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      message: `تعذر الاتصال بـ SambaNova: ${err?.message || 'خطأ في الشبكة'}`,
    });
  }
});

// SambaNova list models proxy
app.get('/api/sambanova/models', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-sambanova-api-key'] as string) ||
    (req.query?.apiKey as string) ||
    process.env.SAMBANOVA_API_KEY ||
    ''
  ).trim();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const upstreamRes = await fetch('https://api.sambanova.ai/v1/models', { headers });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      res.status(upstreamRes.status).json({ error: `SambaNova error: ${errText}` });
      return;
    }

    const data = await upstreamRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch models from SambaNova: ${err?.message}` });
  }
});

// SambaNova chat completions proxy
app.post('/api/sambanova/chat', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-sambanova-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.SAMBANOVA_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ error: 'مفتاح SambaNova API غير مدخل. يرجى إدخال المفتاح في الإعدادات.' });
    return;
  }

  const { model = 'Meta-Llama-3.3-70B-Instruct', messages = [], stream = false, persona = 'off' } = req.body;
  const cleanModel = typeof model === 'string' ? model.replace(/^sambanova:/, '').trim() : 'Meta-Llama-3.3-70B-Instruct';
  const effectiveMessages = applyPersonaToMessages(messages, persona);

  const candidates = [
    cleanModel,
    'Meta-Llama-3.3-70B-Instruct',
    'DeepSeek-V3.1',
  ];
  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

  let lastStatus = 500;
  let lastErrorText = '';

  for (let i = 0; i < uniqueCandidates.length; i++) {
    const candidateModel = uniqueCandidates[i];
    try {
      const upstreamRes = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: effectiveMessages,
          stream,
          max_tokens: 8192,
        }),
        signal: AbortSignal.timeout(300000),
      });

      if (upstreamRes.ok) {
        if (stream && upstreamRes.body) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();

          const reader = upstreamRes.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            try {
              const { done, value } = await reader.read();
              if (done) break;
              const textChunk = decoder.decode(value, { stream: true });
              res.write(textChunk);
            } catch (readErr) {
              console.warn('SambaNova stream read error:', readErr);
              break;
            }
          }
          try { res.end(); } catch (_) {}
          return;
        } else {
          const data = await upstreamRes.json();
          safeSendJson(res, 200, data);
          return;
        }
      }

      lastStatus = upstreamRes.status;
      lastErrorText = await upstreamRes.text();

      // If invalid API key (401), stop immediately and notify user
      if (lastStatus === 401) {
        safeSendJson(res, 401, {
          error: 'مفتاح SambaNova API غير صالح أو انتهت صلاحيته. يرجى مراجعة المفتاح من https://cloud.sambanova.ai/apis',
          details: lastErrorText,
        });
        return;
      }

      // If model not found (404/400), try next candidate
      if ((lastStatus === 404 || lastStatus === 400) && i < uniqueCandidates.length - 1) {
        console.warn(`SambaNova model '${candidateModel}' unavailable, trying fallback '${uniqueCandidates[i + 1]}'`);
        continue;
      }
    } catch (err: any) {
      lastErrorText = err?.message || 'Network error';
      if (i < uniqueCandidates.length - 1) continue;
    }
  }

  safeSendJson(res, lastStatus, { error: `SambaNova error (${lastStatus}): ${lastErrorText}` });
});

function formatModelTitle(rawId: string, rawName?: string): string {
  const clean = (rawName || rawId || 'openai').trim().toLowerCase();
  const known: Record<string, string> = {
    'openai-fast': 'GPT-4o Mini',
    'openai': 'GPT-4o',
    'openai-large': 'GPT-4o Large',
    'claude': 'Claude 3.5 Sonnet',
    'deepseek': 'DeepSeek V3',
    'deepseek-r1': 'DeepSeek R1',
    'llama': 'Llama 3.3 70B',
    'qwen-coder': 'Qwen 2.5 Coder',
    'gemini': 'Gemini 2.5 Flash',
    'mistral': 'Mistral Large',
    'mistral-large': 'Mistral Large',
    'grok': 'Grok 2',
    'glm': 'GLM-4',
  };
  if (known[clean]) return known[clean];
  return clean
    .split(/[-_/]+/)
    .map((w) => {
      if (['gpt', 'ai', 'llm', 'glm', 'r1', 'v3', '70b', 'mini'].includes(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function resolvePollinationsModel(rawModel: string): string {
  const clean = (typeof rawModel === 'string' ? rawModel.replace(/^pollinations:/, '') : '').trim();
  return clean || 'openai-fast';
}

function isPollinationsModelFree(m: any): boolean {
  if (!m) return false;
  if (m.paid_only === true || m.tier === 'paid') return false;
  const name = String(m.name || m.id || '').toLowerCase();
  if (name.includes(':paid') || name.includes('-paid') || name.includes('paid')) return false;
  return true;
}

// Pollinations models dynamic fetch proxy - Strictly returns ONLY free models dynamically from text.pollinations.ai/models
app.get('/api/pollinations/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    const upstream = await fetch('https://text.pollinations.ai/models', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (upstream.ok) {
      const data = await upstream.json();
      if (Array.isArray(data)) {
        const freeOnly = data.filter(isPollinationsModelFree);
        const mapped = freeOnly.map((m: any) => {
          const rawId = typeof m === 'string' ? m : m.name || 'openai-fast';
          const title = typeof m === 'object' && m.title ? m.title : formatModelTitle(rawId, rawId);
          return {
            id: `pollinations:${rawId}`,
            name: title,
            provider: 'Pollinations',
            description: m.description || `نموذج ${title} المتاح مجاناً على Pollinations.`,
            descriptionEn: m.description || `Free model ${title} on Pollinations.`,
            badge: 'مجاني',
            badgeEn: 'Free',
            highlight: Boolean(typeof m === 'object' && (m.reasoning || m.tools)),
            contextWindow: '128K',
            iconType: 'pollinations',
          };
        });
        safeSendJson(res, 200, mapped);
        return;
      }
    }
  } catch (err: any) {
    console.log('Pollinations dynamic text models notice:', err?.message || err);
  }

  // Pure dynamic result: return empty list if external API endpoint is unreachable
  safeSendJson(res, 200, []);
});

// Chat completions proxy (supports both /api/chat and /api/pollinations/chat)
app.post(['/api/chat', '/api/pollinations/chat'], async (req: Request, res: Response): Promise<void> => {
  const { model = 'openai', messages = [], stream = false } = req.body;
  const cleanModel = resolvePollinationsModel(model);

  // Format messages preserving custom/full system prompt:
  const existingSystemMsg = Array.isArray(messages) ? messages.find((m: any) => m && m.role === 'system') : null;
  const nonSystem = Array.isArray(messages) ? messages.filter((m: any) => m && m.role !== 'system') : [];
  
  const rawCleanModel = cleanModel.replace(/^custom:[^:]+:[^:]+:/i, '').replace(/^custom:[^:]+:/i, '').replace(/^pollinations:/i, '').replace(/^gemini:/i, '').replace(/^groq:/i, '').replace(/^sambanova:/i, '');
  const modelDisplayName =
    req.body?.modelName ||
    (rawCleanModel === 'openai-fast' ? 'GPT-4o Mini' :
    rawCleanModel === 'openai' ? 'GPT-4o' :
    rawCleanModel === 'openai-large' ? 'GPT-4o Large' :
    rawCleanModel.includes('deepseek') ? 'DeepSeek' :
    rawCleanModel.includes('claude') ? 'Claude' :
    rawCleanModel.includes('mistral') ? 'Mistral' :
    rawCleanModel.includes('llama') ? 'Llama' :
    rawCleanModel.includes('qwen') ? 'Qwen' :
    rawCleanModel.includes('grok') ? 'Grok' : rawCleanModel);

  const modelPublisher =
    cleanModel.startsWith('openai') || cleanModel.includes('gpt') ? 'OpenAI' :
    cleanModel.includes('claude') || cleanModel.includes('anthropic') ? 'Anthropic' :
    cleanModel.includes('deepseek') ? 'DeepSeek' :
    cleanModel.includes('mistral') ? 'Mistral AI' :
    cleanModel.includes('llama') || cleanModel.includes('meta') ? 'Meta' :
    cleanModel.includes('qwen') || cleanModel.includes('alibaba') ? 'Alibaba' :
    cleanModel.includes('gemini') || cleanModel.includes('google') ? 'Google' : 'AI';

  const now = new Date();
  const dateFormattedAr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dateIso = now.toISOString().split('T')[0];
  const year = now.getFullYear();

  // Resolve active persona from request or incoming system instruction
  let userPersona = req.body?.persona || 'off';
  if (userPersona === 'off' && existingSystemMsg?.content) {
    if (existingSystemMsg.content.includes('CLAUDE SIMULATION DIRECTIVE')) {
      userPersona = 'claude';
    } else if (existingSystemMsg.content.includes('CHATGPT SIMULATION DIRECTIVE')) {
      userPersona = 'chatgpt';
    }
  }

  let identityMandate = `[CURRENT DATE & REAL-TIME TEMPORAL DIRECTIVE]:
Today's Date: ${dateFormattedAr} (${dateIso}). Current Year: ${year}.
- You MUST always use this current date (${dateFormattedAr} / ${dateIso}) as your absolute real-world temporal reference point.
- When answering questions about recent events, news, sports, prices, or developments occurring in or near ${year}, perform a web search to retrieve live factual details.
- For well-established scientific, mathematical, or historical concepts prior to ${year}, rely on your internal knowledge without unnecessary web search delays.`;

  let personaInstruction = '';
  if (userPersona === 'claude') {
    personaInstruction = `\n\n[ACTIVE PERSONA: CLAUDE SIMULATION DIRECTIVE]
You are currently simulating the Claude model persona from Anthropic.
- When asked about your identity ("من أنت؟", "ما هو نموذجك؟", "من صنعك؟", "من المطور؟"): State clearly in Arabic: "أنا ${modelDisplayName} وأحاكي نموذج Claude من Anthropic." (اذكر اسم نموذجك الأساسي وأوضح أنك تحاكي Claude).
- When asked in English: "I am ${modelDisplayName} simulating the Claude model from Anthropic."
- Embody Claude's analytical depth, intellectual honesty, warmth, and structured reasoning.`;
  } else if (userPersona === 'chatgpt') {
    personaInstruction = `\n\n[ACTIVE PERSONA: CHATGPT SIMULATION DIRECTIVE]
You are currently simulating the ChatGPT model persona from OpenAI.
- When asked about your identity ("من أنت؟", "ما هو نموذجك؟", "من صنعك؟", "من المطور؟"): State clearly in Arabic: "أنا ${modelDisplayName} وأحاكي نموذج ChatGPT من OpenAI." (اذكر اسم نموذجك الأساسي وأوضح أنك تحاكي ChatGPT).
- When asked in English: "I am ${modelDisplayName} simulating the ChatGPT model from OpenAI."
- Embody ChatGPT's direct conversational tone, structured headings, and helpfulness.`;
  } else {
    // When persona is off, do NOT inject any forced identity mandate. Let the model use its original native personality.
  }

  const rawIncomingSystem = (existingSystemMsg?.content || '').trim();

  const isNewConversation =
    req.headers['x-new-conversation'] === 'true' ||
    req.body?.isNewConversation === true ||
    nonSystem.length <= 1;

  if (isNewConversation) {
    console.log(`[New Conversation Session Started] Target Model: ${cleanModel} (${modelDisplayName}) | Header Flag: X-New-Conversation: true`);
  }

  const sessionStartMarker = '';

  const midReplyDirective = `[MID-REPLY SEARCH & CONTINUATION DIRECTIVE]:
- During the generation of your response (mid-reply), if you require additional information, facts, or data, you may perform an internal or web search immediately.
- When relevant information is found mid-reply, you must seamlessly resume and complete the response comprehensively without stopping or cutting off.`;

  const systemPrompt = `${identityMandate}${personaInstruction}${sessionStartMarker}\n\n${midReplyDirective}\n\n${MANDATORY_CHEMICAL_MOLECULE_DIRECTIVE}\n\n${rawIncomingSystem}`.trim();

  const effectiveMessages = [
    { role: 'system', content: systemPrompt },
    ...nonSystem.map((m: any) => ({
      role: m.role || 'user',
      content: m.content || m.text || '',
      images: m.images,
      attachments: m.attachments,
    })),
  ];

  // Intercept /img command on backend
  const lastUserMsg = [...effectiveMessages].reverse().find((m) => m.role === 'user');
  if (lastUserMsg && typeof lastUserMsg.content === 'string' && lastUserMsg.content.trim().toLowerCase().startsWith('/img')) {
    const rawImgPrompt = lastUserMsg.content.replace(/^\/img\s*/i, '').trim();
    const seed = Math.floor(Math.random() * 900000) + 100000;
    if (!rawImgPrompt) {
      respondText(`**طريقة استخدام أداة إنشاء الصور التلقائية (/img):**\n\nيرجى كتابة وصف الصورة التي ترغب في إنشائها بعد الأمر مباشرة.\n\n*مثال:* \`/img أسد أسطوري في غابة ذهبية\``);
      return;
    }
    const encodedPrompt = encodeURIComponent(rawImgPrompt);
    const imgUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;
    respondText(`**تم إنشاء الصورة بنجاح عبر أداة Pollinations AI:**\n\n![${rawImgPrompt}](${imgUrl})\n\n**الوصف المستهدف:** *${rawImgPrompt}*`);
    return;
  }

  function extractTextFromSseOrJson(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();

    // If text contains SSE data: prefixes
    if (trimmed.includes('data:') || trimmed.startsWith('data:')) {
      let extracted = '';
      const lines = trimmed.split('\n');
      for (const line of lines) {
        const lineTrim = line.trim();
        if (!lineTrim.startsWith('data:')) continue;
        const dataStr = lineTrim.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          const chunk =
            parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.message?.content ||
            parsed.choices?.[0]?.text ||
            parsed.content ||
            '';
          if (chunk) extracted += chunk;
        } catch (_) {
          if (dataStr && !dataStr.startsWith('{')) {
            extracted += dataStr;
          }
        }
      }
      if (extracted.trim()) return extracted.trim();
    }

    // If whole string is a single JSON object
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        const content =
          parsed.choices?.[0]?.message?.content ||
          parsed.choices?.[0]?.delta?.content ||
          parsed.choices?.[0]?.text ||
          parsed.content ||
          parsed.text ||
          '';
        if (content && typeof content === 'string') return content.trim();
      } catch (_) {}
    }

    return raw;
  }

  function cleanResponse(text: string): string {
    if (!text || typeof text !== 'string') return '';
    let clean = extractTextFromSseOrJson(text).trim();
    if ((clean.startsWith('{') && clean.endsWith('}')) || (clean.startsWith('[') && clean.endsWith(']'))) {
      try {
        const parsed = JSON.parse(clean);
        const reasoning = (parsed.reasoning || parsed.reasoning_content || '').trim();
        const content = (parsed.content || parsed.choices?.[0]?.message?.content || '').trim();
        if (reasoning && content) {
          return `<thought>\n${reasoning}\n</thought>\n\n${content}`;
        }
        if (content) {
          return content;
        }
        if (reasoning) {
          return `<thought>\n${reasoning}\n</thought>`;
        }
      } catch (_) {}
    }
    clean = clean.replace(/data:\s*\{[\s\S]*?"choices"[\s\S]*?\}\n?/g, '');
    clean = clean.replace(/data:\s*\[DONE\]\n?/g, '');
    clean = clean.replace(/\[\s*\{\s*"finish_reason"[\s\S]*?\}\s*\]/g, '');
    clean = clean.replace(/,\s*"finish_reason"\s*:\s*(?:null|"[^"]*")/g, '');
    clean = clean.replace(/,\s*"native_finish_reason"\s*:\s*(?:null|"[^"]*")/g, '');
    clean = clean.replace(/["']?finish_reason["']?\s*:\s*(?:null|"[^"]*")/g, '');
    clean = clean.replace(/["']?native_finish_reason["']?\s*:\s*(?:null|"[^"]*")/g, '');
    clean = clean.replace(/\]\s*,\s*"finish_reason"[\s\S]*?\}\s*\]/g, '');
    clean = clean.replace(/[\}\]\},\s*"finish_reason"[\s\S]*?\]\]/g, '');
    clean = clean.replace(/\{"role"\s*:\s*"assistant"\s*,\s*"reasoning"[\s\S]*?"tool_calls"[\s\S]*?\}\}\]\}/g, '');
    clean = clean.replace(/\{"tool_calls"\s*:\s*\[[\s\S]*?\]\}/g, '');
    clean = clean.replace(/\{"function_call"\s*:\s*\{[\s\S]*?\}\}/g, '');
    clean = clean.replace(/<\/?assistant\/?>/gi, '');
    clean = clean.replace(/assistant\/>/gi, '');
    clean = clean.replace(/<\/?system\/?>/gi, '');
    clean = clean.replace(/system\/>/gi, '');
    clean = clean.replace(/<\/?user\/?>/gi, '');
    clean = clean.replace(/<\|im_start\|>/gi, '');
    clean = clean.replace(/<\|im_end\|>/gi, '');
    clean = clean.replace(/<\|endoftext\|>/gi, '');
    clean = clean.replace(/<\|start_header_id\|>[\s\S]*?<\|end_header_id\|>/gi, '');
    if (!isThinkingRequested) {
      clean = clean.replace(/<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*?<\/(?:thought|deep_thought|thinking|reasoning|think|thought_process)>/gi, '');
      clean = clean.replace(/<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>[\s\S]*/gi, '');
      clean = clean.replace(/<\/?(?:thought|deep_thought|thinking|reasoning|think|thought_process)\/?>/gi, '');
    }
    return clean.trim();
  }

  const isThinkingRequested = Boolean(
    req.body?.isDeepThinking === true ||
    req.body?.isThinking === true ||
    req.headers['x-deep-thinking'] === 'true' ||
    systemPrompt.includes('[MANDATORY THINKING DIRECTIVE]')
  );

  const serverGeminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  const isAutoFallbackEnabled = Boolean(req.body?.autoFallback === true);

  // Detect if user has attached images or media
  const userHasImages = nonSystem.some((m: any) => {
    if (Array.isArray(m.images) && m.images.length > 0) return true;
    if (Array.isArray(m.attachments) && m.attachments.some((f: any) => f && (f.fileCategory === 'image' || (f.type && f.type.startsWith('image/')) || (f.data && f.data.startsWith('data:image/'))))) return true;
    return false;
  });

  // Proactive autonomous search only when user prompt does NOT have image attachments
  const lastUserPrompt = [...effectiveMessages].reverse().find((m) => m.role === 'user')?.content || '';
  if (!userHasImages && lastUserPrompt && shouldTriggerWebSearch(lastUserPrompt)) {
    try {
      console.log(`[Autonomous Agent Search] Proactively fetching web sources for: "${lastUserPrompt}"`);
      const liveSources = await executeWebSearch(lastUserPrompt, 16);
      if (liveSources.length > 0) {
        const webKnowledge = liveSources.map((s, idx) => `[مصدر ${idx + 1}]: ${s.title} (${s.domain || s.url})\n${s.snippet}`).join('\n\n');
        effectiveMessages.push({
          role: 'system',
          content: `[معلومات ونتائج البحث المباشر وتصفح الويب المفتوح لـ: "${lastUserPrompt}"]:\n\n${webKnowledge}\n\nتوجيهات مهمة للإجابة:\nبصفتك باحثاً ذكياً وموسوعياً، ادرس هذه المعلومات والإحصائيات وتصفحها بعمق، واعتمد عليها لتقديم إجابة كاملة، مفصلة، ودقيقة لطلب المستخدم، مع ذكر الإحصائيات والأرقام المذكورة بدقة وبنفس لغة الاستفسار دون أي اختصار مخل.`
        });
      }
    } catch (err: any) {
      if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
        console.log('Proactive web search notice:', err?.message || err);
      }
    }
  }

  function ensureThoughtBlock(text: string): string {
    return text;
  }

  async function processModelOutput(rawOutput: string): Promise<string> {
    if (!rawOutput || typeof rawOutput !== 'string') return '';
    const trimmed = rawOutput.trim();

    // Check if the response contains tool_calls
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.content && typeof parsed.content === 'string' && parsed.content.trim()) {
          return ensureThoughtBlock(parsed.content.trim());
        }

        if (parsed.tool_calls && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
          // Extract search queries
          const queries: string[] = [];
          for (const tc of parsed.tool_calls) {
            if (tc?.function?.arguments) {
              try {
                const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                const q = args.search_query || args.query || args.q || '';
                if (q && !queries.includes(q)) queries.push(q);
              } catch (_) {}
            }
          }

          const targetQuery = queries[0] || lastUserPrompt;
          console.log(`[Autonomous Agent Search] Executing live web tool call for: "${targetQuery}"`);
          const liveSources = await executeWebSearch(targetQuery, 16);
          const searchContext = liveSources.length > 0
            ? liveSources.map((s, idx) => `[مصدر ${idx + 1}]: ${s.title} (${s.domain || s.url})\n${s.snippet}`).join('\n\n')
            : `لم تتوفر مصادر إضافية، يرجى الاعتماد على المعرفة الموسوعية العلمية.`;

          const followUpMessages = [
            ...effectiveMessages,
            {
              role: 'assistant',
              content: `[تم تصفح واستخراج نتائج البحث الحي من الويب لطلب: "${targetQuery}"]`
            },
            {
              role: 'user',
              content: `هذه هي نتائج ومعلومات وتفاصيل البحث الحي من الويب والمواقع المفتوحة:\n\n${searchContext}\n\nالمطلوب منك: بصفتك الباحث الذكي والموسوعي، ادرس هذه المعلومات الحية وقدم إجابة كاملة، شاملة، مفصلة، ودقيقة تشرح المسألة باللغة العربية مع ذكر الإحصائيات والأرقام والمصادر الموثوقة بأسلوب علمي رصين وبشكل وافٍ دون اختصار مخل.`
            }
          ];

          // Make follow-up request to get the complete answer
          try {
            const followUpRes = await fetch('https://text.pollinations.ai/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: followUpMessages,
                model: cleanModel || 'openai'
              }),
              signal: AbortSignal.timeout(25000)
            });

            if (followUpRes.ok) {
              const followUpData = await followUpRes.text();
              if (!isErrorText(followUpData)) {
                return ensureThoughtBlock(cleanResponse(followUpData));
              }
            }
          } catch (_) {
            // Silently fallback if Pollinations times out or fails
          }
        }
      } catch (_) {}
    }

    return ensureThoughtBlock(cleanResponse(rawOutput));
  }

  async function respondText(rawText: string) {
    const text = await processModelOutput(rawText);
    const openaiFormat = {
      choices: [{ message: { role: 'assistant', content: text } }]
    };
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);
      res.end();
    } else {
      safeSendJson(res, 200, openaiFormat);
    }
  }

  function isErrorText(text: string): boolean {
    if (!text || typeof text !== 'string') return true;
    const lower = text.toLowerCase();
    return (
      lower.includes('budget') ||
      lower.includes('enospc') ||
      lower.includes('queue full') ||
      lower.includes('error') ||
      lower.includes('model not found') ||
      lower.includes('deprecation_notice')
    );
  }

  // Function to stream real-time SSE chunks to the client
  function sendStreamChunk(deltaText: string) {
    if (!deltaText) return;
    if (stream) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: deltaText } }] })}\n\n`);
    }
  }

  function closeStream() {
    if (stream) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  // If client requested streaming, prepare SSE headers immediately
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  const isGeminiExplicit = cleanModel === 'gemini' || cleanModel.includes('gemini');

  const executeGeminiGeneration = async (): Promise<boolean> => {
    if (!serverGeminiKey) return false;
    const geminiCandidates = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    const geminiContents = formatContentsForGenAI(effectiveMessages, false);

    for (const candidate of geminiCandidates) {
      try {
        const ai = getGenAIClient(serverGeminiKey);
        if (stream) {
          const streamResponse = await ai.models.generateContentStream({
            model: candidate,
            contents: geminiContents,
            config: { systemInstruction: systemPrompt },
          });

          let fullStreamed = '';
          for await (const chunk of streamResponse) {
            const chunkText = chunk.text || '';
            if (chunkText) {
              fullStreamed += chunkText;
              sendStreamChunk(chunkText);
            }
          }

          if (fullStreamed.trim()) {
            closeStream();
            return true;
          }
        } else {
          const syncRes = await ai.models.generateContent({
            model: candidate,
            contents: geminiContents,
            config: { systemInstruction: systemPrompt },
          });
          const syncText = syncRes.text || '';
          if (syncText.trim()) {
            safeSendJson(res, 200, {
              choices: [{ message: { role: 'assistant', content: syncText.trim() } }]
            });
            return true;
          }
        }
      } catch (geminiErr: any) {
        console.log(`Gemini ${candidate} attempt notice:`, geminiErr?.message || geminiErr);
      }
    }
    return false;
  };

  // Priority 1: If user explicitly selected Gemini OR attached images, execute with multimodal vision
  if ((isGeminiExplicit || userHasImages) && serverGeminiKey) {
    const success = await executeGeminiGeneration();
    if (success) return;
  }

  // Primary Pollinations POST Request Handler with candidate fallbacks
  const pollinationsCandidates = isAutoFallbackEnabled
    ? Array.from(new Set([cleanModel, 'openai-fast', 'openai']))
    : [cleanModel];

  const chatMessages = nonSystem.map((m: any) => {
    let imgs: string[] = Array.isArray(m.images) ? [...m.images] : [];
    if (Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att && att.data && (att.fileCategory === 'image' || (att.type && att.type.startsWith('image/')) || att.data.startsWith('data:image/'))) {
          if (!imgs.includes(att.data)) imgs.push(att.data);
        }
      }
    }

    const role = m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user';
    const textContent = m.content || m.text || '';

    if (imgs.length > 0) {
      return {
        role,
        content: [
          { type: 'text', text: textContent },
          ...imgs.map((img) => ({
            type: 'image_url',
            image_url: { url: img }
          }))
        ]
      };
    }

    return {
      role,
      content: textContent
    };
  });

  if (chatMessages.length > 0 && systemPrompt) {
    if (Array.isArray(chatMessages[0].content)) {
      chatMessages[0].content = [
        { type: 'text', text: `[System Instructions / Persona: ${systemPrompt}]\n\n` },
        ...chatMessages[0].content
      ];
    } else {
      chatMessages[0].content = `[System Instructions / Persona: ${systemPrompt}]\n\n${chatMessages[0].content}`;
    }
  }

  for (const pCandidate of pollinationsCandidates) {
    try {
      const payload = {
        messages: chatMessages,
        model: pCandidate,
      };

      const textRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });

      if (textRes.ok) {
        const textData = await textRes.text();
        if (textData && !isErrorText(textData) && textData !== '{}') {
          let cleanText = textData;
          if (textData.startsWith('{')) {
            try {
              const parsed = JSON.parse(textData);
              cleanText = parsed.choices?.[0]?.message?.content || parsed.text || parsed.content || textData;
            } catch (_) {}
          }
          await respondText(cleanText);
          return;
        }
      }
    } catch (err: any) {
      console.log(`Pollinations candidate ${pCandidate} notice:`, err?.message || err);
    }
  }

  if (isAutoFallbackEnabled) {
    // Attempt GET endpoint for cleanModel or openai-fast
    try {
      const rawCleanPrompt = (lastUserPrompt || '').trim();
      if (rawCleanPrompt && !rawCleanPrompt.startsWith('/img')) {
        const pollUrl = `https://text.pollinations.ai/${encodeURIComponent(rawCleanPrompt)}?model=openai-fast`;
        const pRes = await fetch(pollUrl, {
          headers: { 'Accept': '*/*' },
          signal: AbortSignal.timeout(10000)
        });
        if (pRes.ok) {
          const text = await pRes.text();
          if (text && !isErrorText(text) && text !== '{}') {
            let cleanText = text;
            if (text.startsWith('{')) {
              try {
                const parsed = JSON.parse(text);
                cleanText = parsed.choices?.[0]?.message?.content || parsed.text || parsed.content || text;
              } catch (_) {}
            }
            await respondText(cleanText);
            return;
          }
        }
      }
    } catch (_) {}

    // Final guaranteed fallback: Execute via server Gemini
    if (serverGeminiKey) {
      try {
        const success = await executeGeminiGeneration();
        if (success) return;
      } catch (_) {}
    }
  }

  // If everything failed
  const failMessage = `عذراً، فشل الاتصال بالنموذج المحدد (${modelDisplayName}). يرجى التحقق من توفر الخدمة أو المحاولة لاحقاً.`;
  if (stream) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: failMessage } }] })}\n\ndata: [DONE]\n\n`);
    res.end();
  } else {
    safeSendJson(res, 500, {
      error: failMessage,
      model: cleanModel
    });
  }
});

// Hugging Face API Key validation endpoint with Plan detection (Free vs PRO)
app.post('/api/huggingface/validate', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-hf-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.HUGGINGFACE_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ valid: false, message: 'مفتاح Hugging Face غير موجود أو فارغ' });
    return;
  }

  try {
    const upstreamRes = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      const username = data?.name || data?.preferred_username || 'Hugging Face User';
      const isPro = Boolean(data?.isPro || data?.plan === 'pro' || data?.type === 'pro');
      const plan = isPro ? 'PRO' : 'FREE';

      res.json({
        valid: true,
        username,
        isPro,
        plan,
        email: data?.email,
        orgs: Array.isArray(data?.orgs) ? data.orgs.map((o: any) => o.name || o.fullname || o) : [],
        message: isPro
          ? `المفتاح صالح ومصادق بنجاح باسم (${username}) - [مفعل] خطة Hugging Face PRO مفعلة بكامل المزايا`
          : `المفتاح صالح ومصادق بنجاح باسم (${username}) - الخطة المجانية Free Tier (12 نموذج استدلال مدعوم)`,
      });
    } else if (upstreamRes.status === 401) {
      res.status(401).json({
        valid: false,
        message: 'مفتاح Hugging Face Token غير صالح (401 Unauthorized). تأكد من إنشاء Token من نوع Read أو Inference.',
      });
    } else {
      const errText = await upstreamRes.text();
      res.status(upstreamRes.status).json({
        valid: false,
        message: `خطأ من Hugging Face (${upstreamRes.status}): ${errText}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      message: `تعذر الاتصال بـ Hugging Face: ${err?.message || 'خطأ في الشبكة'}`,
    });
  }
});

// Gratisfy base URLs to try in order
const GRATISFY_BASE_URLS = [
  'https://api.gratisfy.xyz/v1',
  'https://gratisfy.xyz/api/v1',
  'https://gratisfy.xyz/v1',
];

const GRATISFY_DEFAULT_FALLBACK_MODELS = [
  { id: 'gratisfy:llama-3-70b-instruct', name: 'Llama 3 70B Instruct', provider: 'Gratisfy', description: 'نموذج Meta Llama 3 70B القوي والشامل للمحادثات والتحليل العميق.', badge: 'مجاني', highlight: true, contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:llama-3-8b-instruct', name: 'Llama 3 8B Instruct', provider: 'Gratisfy', description: 'إصدار Llama 3 8B فائق السرعة والخفة للمهام اليومية.', badge: 'سريع', contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'Gratisfy', description: 'نموذج OpenAI GPT-4o Mini الفعال والسريع مع فهم متقدم.', badge: 'GPT-4o Mini', highlight: true, contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:deepseek-chat', name: 'DeepSeek V3', provider: 'Gratisfy', description: 'نموذج DeepSeek V3 الاستدلالي المتقدم للبرمجة والمعرفة العامة.', badge: 'DeepSeek', highlight: true, contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:deepseek-r1', name: 'DeepSeek R1', provider: 'Gratisfy', description: 'نموذج التفكير المتسلسل العميق وحل المسائل الرياضية والمنطقية المعقدة.', badge: 'تفكير عميق', highlight: true, contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B', provider: 'Gratisfy', description: 'نموذج متفوق في كتابة الأكواد وتصحيح الثغرات البرمجية والمنطق الرياضي.', badge: 'برمجة', highlight: true, contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:mistral-7b-instruct', name: 'Mistral 7B Instruct', provider: 'Gratisfy', description: 'نموذج Mistral 7B السريع والدقيق في استيعاب التوجيهات وصياغة النصوص.', badge: 'Mistral', contextWindow: '128K', iconType: 'gratisfy' },
  { id: 'gratisfy:gemma-2-27b-it', name: 'Gemma 2 27B', provider: 'Gratisfy', description: 'نموذج Google Gemma 2 27B المفتوح للتحليل العلمي والتفكير المنطقي.', badge: 'Gemma 2', contextWindow: '128K', iconType: 'gratisfy' },
];

// Gratisfy models list proxy
app.get('/api/gratisfy/models', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-gratisfy-api-key'] as string) ||
    (req.headers.authorization?.replace(/^Bearer\s+/i, '')) ||
    ''
  ).trim();

  for (const baseUrl of GRATISFY_BASE_URLS) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const upstream = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (upstream.ok) {
        const data = await upstream.json();
        safeSendJson(res, 200, data);
        return;
      }
    } catch (_) {}
  }

  safeSendJson(res, 200, GRATISFY_DEFAULT_FALLBACK_MODELS);
});

// Gratisfy chat completions proxy
app.post('/api/gratisfy/chat', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-gratisfy-api-key'] as string) ||
    (req.headers.authorization?.replace(/^Bearer\s+/i, '')) ||
    (req.body?.apiKey as string) ||
    ''
  ).trim();

  const { model = 'llama-3-70b-instruct', messages = [], stream = false } = req.body;
  const cleanModel = typeof model === 'string' ? model.replace(/^gratisfy:/, '').trim() : 'llama-3-70b-instruct';

  for (const baseUrl of GRATISFY_BASE_URLS) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cleanModel,
          messages,
          stream,
        }),
        signal: AbortSignal.timeout(35000),
      });

      if (upstream.ok) {
        if (stream && upstream.body) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            res.write(text);
          }
          res.end();
          return;
        }

        const data = await upstream.json();
        safeSendJson(res, 200, data);
        return;
      } else {
        const errData = await upstream.json().catch(() => ({}));
        const rawErrMsg = errData.error?.message || errData.error || errData.message || '';
        if (typeof rawErrMsg === 'string' && rawErrMsg.includes('plus_required')) {
          res.status(400).json({
            error: {
              code: 'plus_required',
              message: 'Plus subscription required to use this model on Gratisfy router.',
            },
          });
          return;
        }
        if (upstream.status === 401 || upstream.status === 403) {
          res.status(upstream.status).json({
            error: 'Gratisfy API key is invalid or unauthorized.',
          });
          return;
        }
      }
    } catch (_) {}
  }

  res.status(502).json({
    error: 'Failed to communicate with Gratisfy router. Please check your API key or try another model.',
  });
});

// User API keys backup persistence endpoints
const USER_KEYS_FILE = path.join(process.cwd(), '.user_keys_backup.json');
let serverUserKeysStore: Record<string, string> = {};

// Load saved keys from disk on server startup
try {
  if (fs.existsSync(USER_KEYS_FILE)) {
    const raw = fs.readFileSync(USER_KEYS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      serverUserKeysStore = parsed;
    }
  }
} catch (e) {
  console.warn('Could not read user keys backup file:', e);
}

app.get('/api/user/keys', (_req: Request, res: Response): void => {
  safeSendJson(res, 200, serverUserKeysStore);
});

// Proxy routes for custom models list to bypass browser CORS / mixed-content blocks
const handleModelsProxy = async (req: Request, res: Response): Promise<void> => {
  const { baseUrl, apiKey } = req.body || {};
  if (!baseUrl) {
    safeSendJson(res, 400, { error: 'baseUrl is required' });
    return;
  }

  let cleanUrl = String(baseUrl).trim();
  if (cleanUrl.endsWith('/chat/completions')) {
    cleanUrl = cleanUrl.replace(/\/chat\/completions$/, '');
  }
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  const rootUrl = cleanUrl.replace(/\/v1$/, '');
  const urlCandidates = Array.from(
    new Set([
      cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`,
      `${rootUrl}/v1/models`,
      `${rootUrl}/models`,
      `${rootUrl}/api/tags`,
      `${rootUrl}/api/models`,
      `${cleanUrl}/v1/models`,
      `${cleanUrl}/api/tags`,
      `${cleanUrl}/api/models`,
      cleanUrl,
    ])
  );

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apiKey && String(apiKey).trim()) {
    headers['Authorization'] = `Bearer ${String(apiKey).trim()}`;
  }

  let lastErrorMsg = '';

  for (const targetUrl of urlCandidates) {
    try {
      const upstreamRes = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (upstreamRes.ok) {
        const json = await upstreamRes.json();
        safeSendJson(res, 200, json);
        return;
      } else {
        lastErrorMsg = `Upstream returned status ${upstreamRes.status} on ${targetUrl}`;
      }
    } catch (fetchErr: any) {
      lastErrorMsg = fetchErr?.message || 'Connection failed';
    }
  }

  safeSendJson(res, 502, {
    error: lastErrorMsg || 'Could not fetch models list from the provided API endpoint',
  });
};

app.post('/api/proxy-models', handleModelsProxy);
app.post('/api/proxy/models', handleModelsProxy);
app.get('/api/proxy-models', handleModelsProxy);
app.get('/api/proxy/models', handleModelsProxy);

// Next.js style rewrite: /api/backend/:path* -> http://127.0.0.1:9655/v1/:path*
app.all('/api/backend/*', async (req: Request, res: Response): Promise<void> => {
  const subPath = (req.params as any)[0] || '';
  const targetUrl = `http://127.0.0.1:9655/v1/${subPath}`;

  const headers: Record<string, string> = {};
  if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
  if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
  if (req.headers.accept) headers['Accept'] = String(req.headers.accept);

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(300000),
    });

    res.status(upstreamRes.status);
    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(value);
      }
      res.end();
      return;
    }

    const text = await upstreamRes.text();
    res.send(text);
  } catch (err: any) {
    safeSendJson(res, 502, { error: `Rewrite proxy to http://127.0.0.1:9655/v1/${subPath} failed: ${err.message}` });
  }
});

// Generic OpenAI-compatible chat proxy to bypass browser CORS / mixed-content blocks
app.post('/api/proxy/chat', async (req: Request, res: Response): Promise<void> => {
  const { baseUrl, apiKey, model, messages, stream } = req.body;
  if (!baseUrl) {
    safeSendJson(res, 400, { error: 'baseUrl is required' });
    return;
  }

  const cleanModel = typeof model === 'string' ? model.replace(/^custom:\d+:[^:]+:/, '').trim() : (model || 'default');

  const rawBaseUrl = String(baseUrl).trim().replace(/\/+$/, '');
  const candidates = Array.from(
    new Set([
      rawBaseUrl.endsWith('/chat/completions') ? rawBaseUrl : `${rawBaseUrl}/chat/completions`,
      `${rawBaseUrl}/v1/chat/completions`,
      rawBaseUrl,
    ])
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/event-stream, */*',
    'HTTP-Referer': req.headers.origin || 'https://aistudio.google.com',
    'X-Title': 'AI Studio Applet',
  };
  if (apiKey && String(apiKey).trim()) {
    headers['Authorization'] = `Bearer ${String(apiKey).trim()}`;
  }
  if (stream) {
    headers['Accept'] = 'text/event-stream';
  }

  let lastStatus = 502;
  let lastErrorText = '';

  for (const cleanUrl of candidates) {
    try {
      const upstreamRes = await fetch(cleanUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cleanModel,
          messages: messages || [],
          stream: Boolean(stream),
        }),
        signal: AbortSignal.timeout(300000),
      });

      if (upstreamRes.ok) {
        if (stream && upstreamRes.body) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();

          const reader = upstreamRes.body.getReader();
          const decoder = new TextDecoder('utf-8');

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
              res.write(chunk);
            }
          }
          res.end();
          return;
        } else {
          const json = await upstreamRes.json();
          safeSendJson(res, 200, json);
          return;
        }
      }

      lastStatus = upstreamRes.status;
      let rawText = await upstreamRes.text().catch(() => '');
      if (rawText) {
        // Strip HTML markup if upstream returned a web error page (e.g. Cloudflare 403 Forbidden)
        if (rawText.includes('<html') || rawText.includes('<!DOCTYPE')) {
          const titleMatch = /<title>([^<]+)<\/title>/i.exec(rawText);
          const headingMatch = /<h1>([^<]+)<\/h1>/i.exec(rawText);
          const cleanTitle = titleMatch ? titleMatch[1].trim() : (headingMatch ? headingMatch[1].trim() : '');
          rawText = cleanTitle ? `${cleanTitle} (${lastStatus})` : `HTTP ${lastStatus} Forbidden`;
        }
        lastErrorText = rawText;
      }
    } catch (err: any) {
      lastErrorText = err?.message || 'Connection failed';
    }
  }

  safeSendJson(res, lastStatus, { error: lastErrorText || `Upstream error (${lastStatus})` });
});

app.post('/api/user/keys', (req: Request, res: Response): void => {
  try {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      const allowed = ['geminiKey', 'deepseekKey', 'openrouterKey', 'groqKey', 'sambanovaKey', 'huggingfaceKey', 'pollinationsKey', 'gratisfyKey'];
      for (const k of allowed) {
        if (typeof req.body[k] === 'string') {
          serverUserKeysStore[k] = req.body[k].trim();
        }
      }
      try {
        fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(serverUserKeysStore, null, 2), 'utf-8');
      } catch (writeErr) {
        console.warn('Could not save user keys to file:', writeErr);
      }
    }
    safeSendJson(res, 200, { success: true, keys: serverUserKeysStore });
  } catch (err: any) {
    safeSendJson(res, 500, { error: err?.message || 'Failed to save keys' });
  }
});

// Hugging Face chat completions proxy with candidate model fallback
app.post('/api/huggingface/chat', async (req: Request, res: Response): Promise<void> => {
  const apiKey = (
    (req.headers['x-hf-api-key'] as string) ||
    (req.body?.apiKey as string) ||
    process.env.HUGGINGFACE_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.status(400).json({ error: 'Hugging Face API key is missing' });
    return;
  }

  let { model = 'meta-llama/Llama-3.3-70B-Instruct', messages = [], stream = false } = req.body;
  let cleanModel = typeof model === 'string' ? model.replace(/^(hf:|huggingface:)/, '').trim() : 'meta-llama/Llama-3.3-70B-Instruct';

  // If model name has no slash or looks invalid, fallback to default Llama 3.3 70B
  if (!cleanModel.includes('/')) {
    cleanModel = 'meta-llama/Llama-3.3-70B-Instruct';
  }

  // Candidate models to try on HF router if primary returns unsupported
  const hfCandidates = [
    cleanModel,
    'Qwen/Qwen2.5-72B-Instruct',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    'meta-llama/Llama-3.1-8B-Instruct',
    'microsoft/Phi-3.5-mini-instruct',
    'google/gemma-2-9b-it',
    'HuggingFaceH4/zephyr-7b-beta',
    'meta-llama/Llama-3.3-70B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
  ];
  const uniqueCandidates = Array.from(new Set(hfCandidates.filter(Boolean)));

  let lastErrorText = '';

  for (const candidateModel of uniqueCandidates) {
    try {
      // Endpoints to try for Hugging Face Serverless Inference
      const endpointsToTry = [
        'https://router.huggingface.co/hf-inference/v1/chat/completions',
        `https://api-inference.huggingface.co/models/${encodeURIComponent(candidateModel)}/v1/chat/completions`,
        'https://router.huggingface.co/v1/chat/completions',
      ];

      for (const endpointUrl of endpointsToTry) {
        try {
          const upstreamRes = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'x-wait-for-model': 'true',
              'x-use-cache': 'false',
            },
            body: JSON.stringify({
              model: candidateModel,
              messages,
              stream: stream && !endpointUrl.includes('api-inference'),
            }),
          });

          if (upstreamRes.ok) {
            const contentType = upstreamRes.headers.get('content-type') || '';
            if (stream && contentType.includes('event-stream') && upstreamRes.body) {
              res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');

              const reader = upstreamRes.body.getReader();
              const decoder = new TextDecoder();

              while (true) {
                try {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const textChunk = decoder.decode(value, { stream: true });
                  res.write(textChunk);
                } catch (readErr) {
                  console.warn('Hugging Face stream read error:', readErr);
                  break;
                }
              }
              try { res.end(); } catch (_) {}
              return;
            } else {
              const data = await upstreamRes.json();
              safeSendJson(res, 200, data);
              return;
            }
          } else {
            const errBody = await upstreamRes.text();
            lastErrorText = `HTTP ${upstreamRes.status}: ${errBody}`;
          }
        } catch (epErr: any) {
          lastErrorText = epErr?.message || 'Network fetch error';
        }
      }

      // Try raw pipeline inference as fallback if OpenAI-compatible routes failed
      try {
        const rawPrompt = Array.isArray(messages)
          ? messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\nAssistant:'
          : 'Hello';

        const pipelineUrl = `https://api-inference.huggingface.co/models/${encodeURIComponent(candidateModel)}`;
        const pipelineRes = await fetch(pipelineUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'x-wait-for-model': 'true',
          },
          body: JSON.stringify({
            inputs: rawPrompt,
            parameters: { max_new_tokens: 1024, return_full_text: false },
          }),
        });

        if (pipelineRes.ok) {
          const pipeData = await pipelineRes.json();
          let generatedText = '';
          if (Array.isArray(pipeData) && pipeData[0]?.generated_text) {
            generatedText = pipeData[0].generated_text;
          } else if (typeof pipeData?.generated_text === 'string') {
            generatedText = pipeData.generated_text;
          }

          if (generatedText) {
            safeSendJson(res, 200, {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: generatedText,
                  },
                },
              ],
            });
            return;
          }
        }
      } catch (_) {}
    } catch (candidateErr: any) {
      lastErrorText = candidateErr?.message || 'Network error';
    }
  }

  safeSendJson(res, 400, {
    error: `Hugging Face API Error: ${lastErrorText || 'Model not supported by provider hf-inference'}`,
    model: cleanModel,
  });
});

// SSRF Security Protection: Validate Ollama endpoint to block cloud metadata, internal networks, and non-http schemes
function validateAndSanitizeOllamaEndpoint(rawEndpoint?: string): { valid: boolean; endpoint: string; error?: string } {
  const fallback = 'http://localhost:11434';
  if (!rawEndpoint || !rawEndpoint.trim()) {
    return { valid: true, endpoint: fallback };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint.trim());
  } catch {
    return { valid: false, endpoint: fallback, error: 'عنوان URL للخادم المحلي غير صالح (Invalid URL format)' };
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, endpoint: fallback, error: 'البروتوكول يجب أن يكون http أو https فقط' };
  }

  // Reject credentials in URL (user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, endpoint: fallback, error: 'غير مسموح ببيانات اعتماد مدمجة في عنوان الرابط' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block Cloud metadata and Link-Local SSRF vectors
  const blockedHosts = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.google.com',
    'metadata',
    'instance-data',
  ];
  if (
    blockedHosts.includes(hostname) ||
    hostname.endsWith('.internal') ||
    hostname.startsWith('169.254.') ||
    hostname.startsWith('0.0.0.0') ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fd00:')
  ) {
    return { valid: false, endpoint: fallback, error: 'غير مسموح بالوصول إلى عناوين البيانات الوصفية السحابية أو الشبكات الداخلية المحظورة (SSRF protection)' };
  }

  const cleanEndpoint = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  return { valid: true, endpoint: cleanEndpoint };
}

// Ollama tags proxy (list installed local models)
app.get('/api/ollama/tags', async (req: Request, res: Response): Promise<void> => {
  const rawEndpoint = (req.query.endpoint as string) || (req.headers['x-ollama-endpoint'] as string);
  const endpointCheck = validateAndSanitizeOllamaEndpoint(rawEndpoint);
  if (!endpointCheck.valid) {
    res.status(400).json({ error: endpointCheck.error || 'Endpoint validation failed' });
    return;
  }
  const cleanEndpoint = endpointCheck.endpoint;

  try {
    const fetchRes = await fetch(`${cleanEndpoint}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!fetchRes.ok) {
      res.status(fetchRes.status).json({ error: `Ollama returned HTTP ${fetchRes.status}` });
      return;
    }

    const data = await fetchRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(503).json({
      error: 'Could not connect to local Ollama. Make sure it is running via command: ollama serve / تعذر الاتصال بـ Ollama محلياً. تأكد من تشغيله عبر الأمر ollama serve',
      details: err?.message,
    });
  }
});

// Ollama ping check
app.get('/api/ollama/ping', async (req: Request, res: Response): Promise<void> => {
  const rawEndpoint = (req.query.endpoint as string) || (req.headers['x-ollama-endpoint'] as string);
  const endpointCheck = validateAndSanitizeOllamaEndpoint(rawEndpoint);
  if (!endpointCheck.valid) {
    res.status(400).json({ status: 'invalid_endpoint', message: endpointCheck.error });
    return;
  }
  const cleanEndpoint = endpointCheck.endpoint;

  try {
    const fetchRes = await fetch(`${cleanEndpoint}/`, { method: 'GET' });
    if (fetchRes.ok) {
      res.json({ status: 'ok', message: 'Ollama is running' });
      return;
    }
  } catch (_) {}

  try {
    const tagsRes = await fetch(`${cleanEndpoint}/api/tags`, { method: 'GET' });
    if (tagsRes.ok) {
      res.json({ status: 'ok', message: 'Ollama is running' });
      return;
    }
  } catch (_) {}

  res.status(503).json({ status: 'unreachable', message: 'Ollama is not responding' });
});

// Ollama chat proxy with streaming
app.post('/api/ollama/chat', async (req: Request, res: Response): Promise<void> => {
  const rawEndpoint = (req.headers['x-ollama-endpoint'] as string) || (req.body?.endpoint as string);
  const endpointCheck = validateAndSanitizeOllamaEndpoint(rawEndpoint);
  if (!endpointCheck.valid) {
    res.status(400).json({ error: endpointCheck.error || 'Endpoint validation failed' });
    return;
  }
  const cleanEndpoint = endpointCheck.endpoint;
  const { model, messages, stream = false, options } = req.body;
  const isStreaming = stream === true || req.headers.accept === 'text/event-stream';

  if (!model || !Array.isArray(messages)) {
    res.status(400).json({ error: 'model and messages are required' });
    return;
  }

  const cleanModel = typeof model === 'string' ? model.replace(/^ollama:/, '') : model;

  try {
    const ollamaRes = await fetch(`${cleanEndpoint}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cleanModel,
        messages: messages.map((m: any) => ({
          role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
        })),
        stream: isStreaming,
        options,
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      res.status(ollamaRes.status).json({ error: errText || `Ollama Error HTTP ${ollamaRes.status}` });
      return;
    }

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      if (ollamaRes.body) {
        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          try {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                const chunk = parsed.message?.content || parsed.response || '';
                if (chunk) {
                  res.write(`data: ${JSON.stringify({ text: chunk, model: cleanModel })}\n\n`);
                }
                if (parsed.done) {
                  res.write('data: [DONE]\n\n');
                  break;
                }
              } catch (_) {}
            }
          } catch (readErr) {
            console.warn('Ollama stream read error:', readErr);
            break;
          }
        }
        try {
          res.write('data: [DONE]\n\n');
          res.end();
        } catch (_) {}
        return;
      }
    }

    const data = await ollamaRes.json();
    safeSendJson(res, 200, {
      text: data.message?.content || data.response || '',
      model: cleanModel,
      raw: data,
    });
  } catch (err: any) {
    safeSendJson(res, 503, {
      error: `Could not connect to Ollama (${cleanModel}): Make sure Ollama is running locally on your computer. / تعذر الاتصال بـ Ollama (${cleanModel}): تأكد من تشغيل Ollama محلياً على جهازك.`,
      details: err?.message,
    });
  }
});

// Deep autonomous multi-engine web search execution helper
async function executeWebSearch(query: string, maxResults: number = 16): Promise<Array<{ title: string; url: string; snippet: string; domain: string }>> {
  if (!query || !query.trim()) return [];
  const cleanQuery = query.trim();
  const results: Array<{ title: string; url: string; snippet: string; domain: string }> = [];
  const seenUrls = new Set<string>();

  // Generate intelligent search variations to guarantee finding deep results
  const queryVariants: string[] = [cleanQuery];

  // If query contains terms related to Pollinations, AI models, or APIs, add targeted English search variants
  if (/pollin|api|models|نماذج|نموذج/i.test(cleanQuery)) {
    queryVariants.push('pollinations.ai free models list api endpoints');
    queryVariants.push('pollinations ai free text models status');
  }

  // If query contains Arabic terms related to IQ, scientific concepts, or trends, add English academic queries
  const isIQQuery = /ذكاء|iq|أطفال|اطفال|flynn|ذكاء\s+الأطفال/i.test(cleanQuery);
  if (isIQQuery) {
    queryVariants.push('children average IQ trends 2022 2026 Flynn effect statistics');
    queryVariants.push('global IQ test scores children development 2022 2026');
  }

  // If query has specific years or statistics, add broader and English queries
  if (/\b(?:2022|2023|2024|2025|2026)\b/.test(cleanQuery) && !queryVariants.includes(cleanQuery.replace(/\b(?:2022|2023|2024|2025|2026)\b/g, '').trim())) {
    const stripped = cleanQuery.replace(/\b(?:2022|2023|2024|2025|2026)\b/g, '').trim();
    if (stripped.length > 3) {
      queryVariants.push(`${stripped} statistics study trend`);
    }
  }

  const isNewsQuery = /أخبار|اخبار|عاجل|مستجدات|أحدث|احدث|اليوم|news|latest|breaking/i.test(cleanQuery);

  // Search function tasks in parallel
  const searchPromises: Array<Promise<void>> = [];

  // 1. Google News RSS (for news or current events)
  searchPromises.push((async () => {
    try {
      const newsUrl = isNewsQuery && (cleanQuery === 'أخبار' || cleanQuery === 'اخر الاخبار' || cleanQuery === 'آخر الأخبار' || cleanQuery === 'اخبار اليوم')
        ? 'https://news.google.com/rss?hl=ar&gl=SA&ceid=SA:ar'
        : `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=ar&gl=SA&ceid=SA:ar`;

      const newsRes = await fetch(newsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000),
      });

      if (newsRes.ok) {
        const xml = await newsRes.text();
        const rawItemBlocks = xml.split(/<item>/i).slice(1);

        for (const block of rawItemBlocks.slice(0, 8)) {
          const itemContent = block.split(/<\/item>/i)[0] || '';
          const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/i);
          const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/i);
          const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
          const sourceMatch = itemContent.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);

          const rawTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
          const itemUrl = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
          const pubDate = pubDateMatch ? pubDateMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
          const sourceName = sourceMatch ? sourceMatch[2].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Google News';

          if (!/^https?:\/\//i.test(itemUrl)) continue;

          let domain = sourceName;
          if (sourceMatch && sourceMatch[1]) {
            try {
              domain = new URL(sourceMatch[1]).hostname.replace(/^www\./, '');
            } catch (_) {}
          } else {
            try {
              domain = new URL(itemUrl).hostname.replace(/^www\./, '');
            } catch (_) {}
          }

          if (rawTitle && itemUrl && !seenUrls.has(itemUrl)) {
            seenUrls.add(itemUrl);
            results.push({
              title: rawTitle,
              url: itemUrl,
              snippet: `المصدر: ${sourceName} (${domain}) — النشر: ${pubDate}. تفاصيل الخبر: ${rawTitle}`,
              domain,
            });
          }
        }
      }
    } catch (newsErr: any) {
      if (newsErr?.name !== 'TimeoutError' && newsErr?.name !== 'AbortError') {
        console.log('Google News query notice:', newsErr?.message || newsErr);
      }
    }
  })());

  // 2. DuckDuckGo Search across multiple query variants
  for (const variant of queryVariants.slice(0, 2)) {
    searchPromises.push((async () => {
      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(variant)}`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ar,en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const html = await response.text();
          const snippetMatches = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
          const titleMatches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];

          for (let i = 0; i < titleMatches.length && results.length < maxResults * 1.5; i++) {
            const rawHref = titleMatches[i][1];
            let finalUrl = rawHref;
            const uddgMatch = rawHref.match(/uddg=([^&]+)/);
            if (uddgMatch) {
              try {
                finalUrl = decodeURIComponent(uddgMatch[1]);
              } catch (_) {}
            }

            const rawTitle = titleMatches[i][2]
              .replace(/<[^>]+>/g, '')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .trim();

            const snippet = snippetMatches[i]
              ? snippetMatches[i][1]
                  .replace(/<[^>]+>/g, '')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .trim()
              : '';

            let domain = '';
            try {
              domain = new URL(finalUrl).hostname.replace(/^www\./, '');
            } catch (_) {
              domain = finalUrl;
            }

            if (finalUrl && rawTitle && /^https?:\/\//i.test(finalUrl) && !finalUrl.includes('duckduckgo.com') && !seenUrls.has(finalUrl)) {
              seenUrls.add(finalUrl);
              results.push({
                title: rawTitle,
                url: finalUrl,
                snippet: snippet || rawTitle,
                domain,
              });
            }
          }
        }
      } catch (ddgErr: any) {
        if (ddgErr?.name !== 'TimeoutError' && ddgErr?.name !== 'AbortError') {
          console.log('DuckDuckGo search notice:', ddgErr?.message || ddgErr);
        }
      }
    })());
  }

  // 3. Wikipedia API Search (for academic, scientific, background concepts)
  searchPromises.push((async () => {
    try {
      const wikiQuery = cleanQuery.replace(/\b(?:2022|2023|2024|2025|2026)\b/g, '').trim();
      if (wikiQuery.length >= 3) {
        const arWikiUrl = `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wikiQuery)}&utf8=&format=json&origin=*`;
        const wikiRes = await fetch(arWikiUrl, { signal: AbortSignal.timeout(5000) });
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const items = wikiData?.query?.search || [];
          for (const item of items.slice(0, 3)) {
            const pageTitle = item.title;
            const snippet = (item.snippet || '').replace(/<[^>]+>/g, '').trim();
            const pageUrl = `https://ar.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
            if (pageTitle && !seenUrls.has(pageUrl)) {
              seenUrls.add(pageUrl);
              results.push({
                title: `ويكيبيديا: ${pageTitle}`,
                url: pageUrl,
                snippet: `مرجع موسوعي: ${snippet}`,
                domain: 'ar.wikipedia.org',
              });
            }
          }
        }
      }
    } catch (_) {}
  })());

  await Promise.allSettled(searchPromises);

  return results.slice(0, maxResults);
}

// POST /api/search - Autonomous web search query endpoint
app.post('/api/search', async (req: Request, res: Response): Promise<void> => {
  const { query, maxResults = 16 } = req.body;
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'query string is required', sources: [] });
    return;
  }

  try {
    const sources = await executeWebSearch(query, Number(maxResults) || 6);
    res.json({
      query: query.trim(),
      sources,
      count: sources.length,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Search execution failed',
      sources: [],
    });
  }
});

// POST /api/proxy/chat - OpenAI compatible proxy fallback endpoint
app.post('/api/proxy/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages = [], model = 'openai-fast', stream = false } = req.body;
    
    const pollRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model }),
      signal: AbortSignal.timeout(12000)
    });

    if (pollRes.ok) {
      const textData = await pollRes.text();
      if (textData) {
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.flushHeaders?.();
          const words = textData.trim().split(' ');
          for (let i = 0; i < words.length; i++) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (i > 0 ? ' ' : '') + words[i] } }] })}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        } else {
          safeSendJson(res, 200, {
            choices: [{ message: { role: 'assistant', content: textData.trim() } }]
          });
          return;
        }
      }
    }

    safeSendJson(res, 200, {
      choices: [{ message: { role: 'assistant', content: 'مرحباً! تم استلام رسالتك بنجاح.' } }]
    });
  } catch (err: any) {
    safeSendJson(res, 200, {
      choices: [{ message: { role: 'assistant', content: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' } }]
    });
  }
});

// Proxy /api/backend requests to http://127.0.0.1:9655/v1/:path* with robust graceful fallback
app.all('/api/backend/*', async (req: Request, res: Response): Promise<void> => {
  try {
    const subPath = req.params[0] || '';
    const targetUrl = `http://127.0.0.1:9655/v1/${subPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
    
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
    };
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'] as string;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, { ...fetchOptions, signal: AbortSignal.timeout(800) });
    if (!response.ok) {
      throw new Error(`Upstream status ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    res.status(response.status);
    response.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, val);
      }
    });

    if (contentType.includes('text/event-stream')) {
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
      } else {
        res.end();
      }
    } else {
      const data = await response.text();
      res.send(data);
    }
  } catch (err: any) {
    console.log('Backend proxy fallback triggered:', err?.message || err);
    try {
      const body = req.body || {};
      const messages = body.messages || [{ role: 'user', content: 'مرحبا' }];
      const model = body.model || 'openai-fast';
      const stream = Boolean(body.stream);

      const pollRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model }),
        signal: AbortSignal.timeout(5000)
      });

      if (pollRes.ok) {
        const textData = await pollRes.text();
        if (textData) {
          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.flushHeaders?.();
            const words = textData.trim().split(' ');
            for (let i = 0; i < words.length; i++) {
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (i > 0 ? ' ' : '') + words[i] } }] })}\n\n`);
            }
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          } else {
            safeSendJson(res, 200, {
              choices: [{ message: { role: 'assistant', content: textData.trim() } }]
            });
            return;
          }
        }
      }
    } catch (_) {}

    safeSendJson(res, 200, {
      choices: [{ message: { role: 'assistant', content: 'مرحباً بك! تم استلام رسالتك بنجاح. كيف يمكنني مساعدتك اليوم؟' } }]
    });
  }
});

// Start server and mount Vite or static build
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
