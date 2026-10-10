import React, { useState, useRef } from 'react';
import { Copy, Check, Code } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { getStoredLanguage } from '../utils/i18n';
import { copyFormattedMath } from '../utils/mathUtils';

interface MathEquationCardProps {
  formula: string;
  title?: string;
}

/**
 * Normalizes math formulas: converts Unicode combining arrows on letters (e.g. u⃗, F⃗)
 * to proper LaTeX \vec{...} so KaTeX renders vector arrows and letter sizing uniformly.
 */
export function normalizeMathFormula(formula: string): string {
  if (!formula) return '';
  let result = formula;

  // 1. Replace Unicode combining right arrow (\u20D7 or \u20D6) on letters:
  // e.g. "u⃗" or "F⃗" -> "\vec{u}" and "\vec{F}"
  result = result.replace(/([a-zA-Z\u03B1-\u03C9\u0391-\u03A9])[\u20D7\u20D6]/g, '\\vec{$1}');

  // 2. Also normalize single letter followed by arrow: e.g. u-> or F->
  result = result.replace(/([a-zA-Z])\s*->/g, '\\vec{$1}');

  // 3. Fix unbraced \vec followed by single char: \vec F -> \vec{F}
  result = result.replace(/\\vec\s+([a-zA-Z])/g, '\\vec{$1}');

  return result;
}

export const MathEquationCard: React.FC<MathEquationCardProps> = ({ formula, title }) => {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const cardContentRef = useRef<HTMLDivElement>(null);
  const isEn = getStoredLanguage() === 'en';

  const rawFormula = formula
    .trim()
    .replace(/^```(?:math|latex|equation|formula)?/i, '')
    .replace(/```$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .trim();

  // Normalize formula to fix vector arrows and character sizing
  const cleanFormula = normalizeMathFormula(rawFormula);

  const handleCopy = async () => {
    const success = await copyFormattedMath(cleanFormula, cardContentRef.current);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  let renderedMath = '';
  let renderError = false;

  try {
    renderedMath = katex.renderToString(cleanFormula, {
      displayMode: true,
      throwOnError: false,
    });
  } catch {
    renderError = true;
  }

  return (
    <div
      className="math-card-container group relative my-4 mx-auto max-w-2xl rounded-2xl bg-white dark:bg-[#1B1B1F] border border-zinc-200 dark:border-zinc-800 shadow-xs p-5 sm:p-6 min-h-[90px] flex items-center justify-center transition-all select-none"
      dir="ltr"
    >
      {/* Top Right Copy Button (Appearing on hover at far top right, without border/background) */}
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? (isEn ? 'Copied' : 'تم النسخ') : (isEn ? 'Copy formula' : 'نسخ المعادلة')}
        aria-label={copied ? (isEn ? 'Copied' : 'تم النسخ') : (isEn ? 'Copy formula' : 'نسخ المعادلة')}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-2.5 right-2.5 z-30 p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer bg-transparent border-0 shadow-none pointer-events-auto"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </button>

      {/* Optional Title Bar if explicit title provided */}
      {title && (
        <div className="absolute top-2 left-3 text-xs font-semibold text-zinc-900 dark:text-zinc-100" dir="auto">
          {title}
        </div>
      )}

      {/* Body with math typography styling */}
      <div className="w-full flex items-center justify-center overflow-x-auto text-center" dir="ltr">
        {showCode ? (
          <pre className="font-mono text-xs text-zinc-800 dark:text-zinc-200 dir-ltr text-left overflow-x-auto p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full">
            {cleanFormula}
          </pre>
        ) : renderError ? (
          <div className="font-mono text-sm text-zinc-900 dark:text-zinc-100 p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            {cleanFormula}
          </div>
        ) : (
          <div
            ref={cardContentRef}
            className="katex-card-content text-[18px] sm:text-[21px] leading-relaxed text-zinc-900 dark:text-zinc-100 overflow-x-auto py-1 w-full flex justify-center items-center select-text [&_.katex-display]:!m-0 [&_.katex-display]:!p-0 [&_.katex-display]:!border-0 [&_.katex-display]:!bg-transparent [&_.katex-display]:!shadow-none [&_.katex-display]:!min-h-0"
            dangerouslySetInnerHTML={{ __html: renderedMath }}
          />
        )}
      </div>
    </div>
  );
};
