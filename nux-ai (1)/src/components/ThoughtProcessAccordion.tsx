import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight, Brain, Atom, Sparkles, Clock } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { RotatingThinkingPhrase } from './RotatingThinkingPhrase';

interface ThoughtProcessAccordionProps {
  thoughtText: string;
  isStreaming?: boolean;
  language?: string;
  defaultExpanded?: boolean;
}

// Pre-compiled regular expressions at module scope for maximum streaming performance
const EXPLICIT_MARKER_REGEX =
  /(?:\n+|^)(?:\*\*Answer:\*\*|\*\*Response:\*\*|### Answer\b|### Response\b|### الإجابة|### الرد|\*\*الإجابة:\*\*|\*\*الرد:\*\*|Here is the response:|Here is the answer:|Here's the response:|Final Answer:|الجواب النهائي:|الإجابة النهائية:)([\s\S]*)$/i;

const EXPLICIT_ENGLISH_TRANSITION_REGEX =
  /([\s\S]*?(?:Now providing the answer to the user:?|Now answer the user:?|Let's provide the final response:?|Final response to user:?))\s*\n+([\s\S]*)$/i;

const META_LEAK_REGEX =
  /^(?:The developer instruction overrides|User asks again|The user asks|User asks|According to developer|Actually the developer|The developer message|Developer message|Developer instruction|Need to answer per developer|Must include <thought>|So we must comply|Also we must follow|We must follow|We have a user|System instruction|According to system|In compliance with|My instructions|I must follow|As an AI model instructed to)[\s\S]*?(?:after the thought block\.?|tags with reasoning and then answer\.?|must respond:\s*|say:\s*|include\s*|\.\s+|\n+)(?=[\u0600-\u06FF]|I am|I'm|Hello|Hi|أنا|مرحباً|$)/i;

const FORBIDDEN_SNIPPETS: RegExp[] = [
  /The developer instruction overrides the system instruction:[^\n.]*/gi,
  /The developer instruction overrides the system instruction[^\n.]*/gi,
  /I will provide the answer concisely after the thought block\.?/gi,
  /Need to answer per developer instruction:[^\n.]*/gi,
  /Need to answer per developer instruction[^\n.]*/gi,
  /Must include <thought> tags with reasoning and then answer\.?/gi,
  /Must include <thought> tags[^\n.]*/gi,
  /User asks again "[^"]*"[^\n.]*/gi,
  /According to developer instructions?,?[^\n.]*/gi,
  /Actually the developer message says,?[^\n.]*/gi,
  /So we must comply with that\.?/gi,
  /Also we must follow deep thinking directive[^\n.]*/gi,
];

const MARKDOWN_PREFIX_REGEX = /^(?:\*\*Answer:\*\*|\*\*Response:\*\*|### Answer|### Response|### الإجابة|\*\*الإجابة:\*\*|---\s*)/i;
const STRIP_THOUGHT_TAGS_REGEX = /<\/?(?:thought|thinking|reasoning|think|thought_process)>/gi;
const CLOSED_THOUGHT_TAG_REGEX = /<(thought|deep_thought|thinking|reasoning|think|thought_process)>([\s\S]*?)<\/\1>/gi;
const OPEN_THOUGHT_TAG_REGEX = /<(?:thought|deep_thought|thinking|reasoning|think|thought_process)>([\s\S]*)$/i;
const ALL_THOUGHT_TAGS_REGEX = /<\/?(?:thought|deep_thought|thinking|reasoning|think|thought_process)>/gi;
const HEADER_THINKING_REGEX =
  /^(?:\*\*Thinking Process:\*\*|\*\*Thought Process:\*\*|Thinking Process:|Thought Process:|### Thinking Process|### Thought Process|### مسار التفكير|مسار التفكير:)\s*([\s\S]*?)(?:\n\n(?:\*\*Answer:\*\*|\*\*Response:\*\*|### Answer|### Response|### الإجابة|\*\*الإجابة:\*\*|---\n*)|$)/i;

/**
 * Intelligently separates internal reasoning/chain-of-thought from the actual answer
 * only when the model explicitly starts its final user-facing response or forgets to close the thought tag.
 */
function separateThoughtAndResponse(rawThought: string): { thought: string; answer: string } {
  if (!rawThought || !rawThought.trim()) {
    return { thought: '', answer: '' };
  }

  const trimmed = rawThought.trim();

  // 1. Explicit answer marker tags or headings
  const markerMatch = trimmed.match(EXPLICIT_MARKER_REGEX);
  if (markerMatch && markerMatch.index !== undefined && markerMatch.index > 0) {
    const thought = trimmed.substring(0, markerMatch.index).trim();
    const answer = markerMatch[1].trim();
    if (thought && answer) {
      return { thought, answer };
    }
  }

  // 2. English chain-of-thought transition
  const transitionMatch = trimmed.match(EXPLICIT_ENGLISH_TRANSITION_REGEX);
  if (transitionMatch && transitionMatch[1] && transitionMatch[2]) {
    const thought = transitionMatch[1].trim();
    const answer = transitionMatch[2].trim();
    if (thought && answer) {
      return { thought, answer };
    }
  }

  // Default: Preserve the entire block as thought. Never wipe or discard thoughts.
  return { thought: trimmed, answer: '' };
}

/**
 * Strips leaked meta-deliberation and moves them to thoughtText so they NEVER
 * appear in the clean user-facing response.
 */
function sanitizeCleanResponse(
  content: string,
  existingThought: string
): { thoughtText: string; cleanContent: string } {
  let clean = (content || '').trim();
  let collectedThoughts = (existingThought || '').trim();

  // 1. Comprehensive regex for leaked meta-deliberations
  let leakMatch = clean.match(META_LEAK_REGEX);
  let iterations = 0;
  while (leakMatch && leakMatch[0] && iterations < 5) {
    iterations++;
    const leakedPart = leakMatch[0].trim();
    collectedThoughts = collectedThoughts
      ? `${collectedThoughts}\n\n${leakedPart}`
      : leakedPart;
    clean = clean.substring(leakMatch[0].length).trim();
    leakMatch = clean.match(META_LEAK_REGEX);
  }

  // 2. Targeted filter for instruction leakage
  for (const snippet of FORBIDDEN_SNIPPETS) {
    if (snippet.test(clean)) {
      clean = clean.replace(snippet, '').trim();
    }
  }

  // 3. Clean up lingering markdown response prefixes
  clean = clean.replace(MARKDOWN_PREFIX_REGEX, '').trim();

  // 4. Strip any lingering <thought> or </thought> tags that might have remained in the clean answer
  clean = clean.replace(STRIP_THOUGHT_TAGS_REGEX, '').trim();

  // 5. If clean is empty, inspect collectedThoughts to see if an answer was trapped inside
  if (!clean && collectedThoughts) {
    const separated = separateThoughtAndResponse(collectedThoughts);
    if (separated.answer) {
      collectedThoughts = separated.thought;
      clean = separated.answer;
    }
  }

  return { thoughtText: collectedThoughts, cleanContent: clean };
}

/**
 * Robustly extracts <thought>, <thinking>, <reasoning>, or <think> blocks from content.
 * Isolate all internal deliberations into thoughtText, ensuring cleanContent is strictly
 * the final readable response without any leaked instructions, code, or meta-commentary.
 */
export function extractThoughtProcess(rawContent: string): {
  thoughtText: string;
  cleanContent: string;
  isThinkingOngoing: boolean;
} {
  if (!rawContent) {
    return { thoughtText: '', cleanContent: '', isThinkingOngoing: false };
  }

  let text = rawContent;
  const thoughts: string[] = [];
  let isThinkingOngoing = false;

  // 1. Match and collect all fully closed thought tags
  CLOSED_THOUGHT_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLOSED_THOUGHT_TAG_REGEX.exec(text)) !== null) {
    const rawBlock = match[2].trim();
    if (rawBlock) {
      const { thought, answer } = separateThoughtAndResponse(rawBlock);
      if (thought) thoughts.push(thought);
      if (answer) {
        text = text.replace(match[0], `\n\n${answer}\n\n`);
      }
    }
  }
  text = text.replace(CLOSED_THOUGHT_TAG_REGEX, '').trim();

  // 2. Check for an unclosed (streaming) thought tag
  const openMatch = text.match(OPEN_THOUGHT_TAG_REGEX);
  if (openMatch) {
    const partialRaw = openMatch[1].trim();
    const { thought, answer } = separateThoughtAndResponse(partialRaw);
    if (answer) {
      if (thought) thoughts.push(thought);
      text = text.replace(OPEN_THOUGHT_TAG_REGEX, '').trim() + (text ? '\n\n' : '') + answer;
      isThinkingOngoing = false;
    } else {
      isThinkingOngoing = true;
      if (thought || partialRaw) {
        thoughts.push(thought || partialRaw);
      }
      text = text.replace(OPEN_THOUGHT_TAG_REGEX, '').trim();
    }
  }

  // 3. Strip any stray opening or closing tags
  text = text.replace(ALL_THOUGHT_TAGS_REGEX, '').trim();

  // 4. Check for markdown-based thinking headers
  const headerMatch = text.match(HEADER_THINKING_REGEX);
  if (headerMatch && headerMatch[1]) {
    const rawThought = headerMatch[1].trim();
    if (rawThought) {
      const { thought, answer } = separateThoughtAndResponse(rawThought);
      if (thought) thoughts.push(thought);
      if (answer) text = `${answer}\n\n${text}`.trim();
    }
    text = text.replace(HEADER_THINKING_REGEX, '').trim();
  }

  // 5. Sanitize leaked meta-reasoning from remaining text
  const combinedThought = thoughts.join('\n\n---\n\n').trim();
  const sanitized = sanitizeCleanResponse(text, combinedThought);

  return {
    thoughtText: sanitized.thoughtText,
    cleanContent: sanitized.cleanContent,
    isThinkingOngoing,
  };
}

export const ThoughtProcessAccordion: React.FC<ThoughtProcessAccordionProps> = React.memo(({
  thoughtText,
  isStreaming = false,
  language = 'ar',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded || (isStreaming && Boolean(thoughtText)));
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex], []);

  if (!thoughtText || !thoughtText.trim()) {
    return null;
  }

  const isRtl = language === 'ar';
  const ArrowIcon = isExpanded ? ChevronDown : isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="my-2.5 w-full select-none" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 overflow-hidden shadow-2xs transition-colors">
        {/* Accordion Trigger Header */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 sm:py-2.5 flex items-center justify-between gap-2.5 text-start hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer group"
          aria-expanded={isExpanded}
          title={isExpanded ? (isRtl ? 'طي طريقة التفكير' : 'Collapse thinking') : (isRtl ? 'توسيع طريقة التفكير' : 'Expand thinking')}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Simple toggle arrow */}
            <div className="w-5 h-5 rounded-md bg-black/5 dark:bg-white/5 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0">
              <ArrowIcon className="w-3.5 h-3.5 transition-transform duration-200" />
            </div>

            {/* Thinking Icon */}
            <Atom className="w-4 h-4 text-zinc-800 dark:text-zinc-200 shrink-0" />

            {/* Title */}
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {isRtl ? 'طريقة تفكير النموذج ومسار الاستدلال' : 'Model Thinking Process & Reasoning'}
            </span>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {isStreaming ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 animate-pulse text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 dark:bg-zinc-400" />
                <RotatingThinkingPhrase isRtl={isRtl} />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-[10.5px]">
                <Clock className="w-3 h-3 text-zinc-400" />
                <span>{isRtl ? 'استدلال مكتمل' : 'Reasoned'}</span>
              </span>
            )}
          </div>
        </button>

        {/* Collapsible Content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden border-t border-zinc-200 dark:border-zinc-800"
            >
              <div
                dir="auto"
                className="p-3.5 sm:p-4 text-xs sm:text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-black/30 font-sans select-text whitespace-pre-wrap break-words space-y-2"
              >
                <Markdown
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
                  components={{
                    p({ children }) {
                      return <p className="mb-1.5 last:mb-0">{children}</p>;
                    },
                    ul({ children }) {
                      return <ul className="list-disc list-inside space-y-1 my-1 ms-1">{children}</ul>;
                    },
                    ol({ children }) {
                      return <ol className="list-decimal list-inside space-y-1 my-1 ms-1">{children}</ol>;
                    },
                    li({ children }) {
                      return <li className="text-zinc-700 dark:text-zinc-300">{children}</li>;
                    },
                    code({ children }) {
                      return (
                        <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {thoughtText}
                </Markdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
