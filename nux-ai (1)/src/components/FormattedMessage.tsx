import React, { useMemo, useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { Download, ExternalLink, Loader2, Sparkles, RefreshCw, Image as ImageIcon, X, Maximize2 } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { StreamingCursor } from './StreamingCursor';
import { ThoughtProcessAccordion, extractThoughtProcess } from './ThoughtProcessAccordion';
import { InteractiveChart } from './InteractiveChart';
import { InteractiveDiagram } from './InteractiveDiagram';
import { InteractiveTree } from './InteractiveTree';
import { SvgDrawingViewer } from './SvgDrawingViewer';
import { MathEquationCard } from './MathEquationCard';
import { InteractiveMolecule } from './InteractiveMolecule';
import { RotatingThinkingPhrase } from './RotatingThinkingPhrase';
import { copyFormattedMath } from '../utils/mathUtils';
import { FileActionCard } from './FileActionCard';
import { getFileLanguage } from '../services/workspaceService';

interface FormattedMessageProps {
  content: string;
  isStreaming?: boolean;
  onOpenArtifact?: (code: string, language: string) => void;
  language?: string;
}

function isSafeUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('#') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//'))
  ) {
    return true;
  }
  return false;
}

const GeneratedImageCard: React.FC<{ src: string; alt?: string; language?: string }> = ({
  src,
  alt,
  language = 'ar',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imgSrc, setImgSrc] = useState(src);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const longPressTimerRef = React.useRef<any>(null);

  const handleRetry = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setHasError(false);
    setIsLoading(true);
    const separator = src.includes('?') ? '&' : '?';
    setImgSrc(`${src}${separator}retry=${Date.now()}`);
  };

  const handleDownload = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const response = await fetch(imgSrc);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-generated-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(imgSrc, '_blank');
    }
  };

  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setIsPreviewOpen(true);
    }, 350);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  return (
    <>
      <div className="my-3.5 flex flex-col items-center justify-center text-center select-none">
        {/* Clean Image Container - 11px Rounded Corners, Watermark Strictly Cropped */}
        <div
          onClick={() => setIsPreviewOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          className="relative inline-block max-w-full overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all duration-200"
          style={{ borderRadius: '11px' }}
        >
          {isLoading && !hasError && (
            <div
              className="w-72 h-72 max-w-full flex flex-col items-center justify-center gap-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              style={{ borderRadius: '11px' }}
            >
              <Loader2 className="w-7 h-7 text-zinc-900 dark:text-zinc-100 animate-spin" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">
                {language === 'ar' ? 'جاري توليد الصورة...' : 'Generating image...'}
              </span>
            </div>
          )}

          {hasError ? (
            <div
              className="p-5 flex flex-col items-center justify-center text-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              style={{ borderRadius: '11px' }}
            >
              <ImageIcon className="w-7 h-7 text-zinc-400" />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {language === 'ar' ? 'تعذر تحميل الصورة' : 'Failed to load image'}
              </span>
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-100 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-zinc-900 dark:text-zinc-100" />
                <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
              </button>
            </div>
          ) : (
            <div
              className="relative overflow-hidden inline-block"
              style={{ borderRadius: '11px' }}
            >
              {/* Generated Image Element */}
              <img
                src={imgSrc}
                alt={alt || 'Generated image'}
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
                className={`max-h-[520px] w-auto object-contain transition-all duration-300 block mx-auto ${
                  isLoading ? 'opacity-0 scale-98' : 'opacity-100 scale-100'
                }`}
                style={{
                  borderRadius: '11px',
                  clipPath: 'inset(0 0 9.5% 0)', // Deep crop to eliminate watermark entirely
                  marginBottom: '-5.5%',
                }}
              />

              {/* Hover Overlay - Appears strictly onMouseOver / isHovered */}
              {!isLoading && isHovered && (
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[1.5px] transition-all duration-200 flex flex-col items-center justify-center gap-2 p-3 text-white pointer-events-none animate-in fade-in"
                  style={{ borderRadius: '11px' }}
                >
                  <div className="bg-black/60 p-2.5 rounded-full text-white shadow-md">
                    <Maximize2 className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-white/95 shadow-sm">
                    {language === 'ar' ? 'انقر للمعاينة والتنزيل' : 'Click to preview & download'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Preview Modal with Download Button */}
      {isPreviewOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 select-none animate-in fade-in duration-200"
          onClick={() => setIsPreviewOpen(false)}
        >
          {/* Modal Header Toolbar */}
          <div
            className="w-full max-w-4xl flex items-center justify-between gap-3 text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-zinc-300" />
              <span className="text-xs sm:text-sm font-medium">
                {language === 'ar' ? 'معاينة الصورة الموالدة' : 'Image Preview'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors cursor-pointer border border-white/20 shadow-sm"
                title={language === 'ar' ? 'تنزيل الصورة' : 'Download Image'}
              >
                <Download className="w-4 h-4" />
                <span>{language === 'ar' ? 'تنزيل الصورة' : 'Download'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title={language === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Centered Image with Cropped Watermark */}
          <div
            className="flex-1 flex items-center justify-center my-auto p-2 max-w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imgSrc}
              alt={alt || 'Full size preview'}
              className="max-h-[76vh] max-w-[90vw] object-contain shadow-2xl"
              style={{
                borderRadius: '11px',
                clipPath: 'inset(0 0 9.5% 0)',
                marginBottom: '-5.5%',
              }}
            />
          </div>

          {/* Modal Footer Caption */}
          {alt && (
            <div
              className="w-full max-w-2xl text-center px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-xs sm:text-sm text-white/90 italic truncate z-10"
              onClick={(e) => e.stopPropagation()}
            >
              "{alt}"
            </div>
          )}
        </div>
      )}
    </>
  );
};

// Rehype plugin to strip dangerous or invalid inline string event listeners (e.g. onclick="...", onload="...")
// This ensures React 19 never receives strings for onClick or other event handlers parsed by rehype-raw
const rehypeStripInlineHandlers = () => (tree: any) => {
  const sanitize = (node: any) => {
    if (node && node.properties && typeof node.properties === 'object') {
      for (const key of Object.keys(node.properties)) {
        if (/^on[a-z0-9_-]/i.test(key) || (typeof node.properties[key] === 'string' && key.toLowerCase().startsWith('on'))) {
          delete node.properties[key];
        }
      }
    }
    if (node && Array.isArray(node.children)) {
      node.children.forEach(sanitize);
    }
  };
  sanitize(tree);
};

export const FormattedMessage: React.FC<FormattedMessageProps> = React.memo(({
  content,
  isStreaming = false,
  onOpenArtifact,
  language = 'ar',
}) => {
  const messageContainerRef = useRef<HTMLDivElement>(null);

  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);

  const rehypePlugins = useMemo(() => [rehypeKatex, rehypeRaw, rehypeStripInlineHandlers], []);

  const { thoughtText, cleanContent, isThinkingOngoing } = useMemo(() => {
    return extractThoughtProcess(content || '');
  }, [content]);

  // Pre-process cleanContent to ensure malformed HTML break tags render properly,
  // normalize Unicode combining arrow vectors (e.g. u⃗, F⃗) into standard LaTeX \vec,
  // and automatically transform block math $$ ... $$ and \[ ... \] into ```math ... ``` Math Cards
  const processedCleanContent = useMemo(() => {
    if (!cleanContent) return '';
    let result = cleanContent
      .replace(/<br\s*\/?>/gi, '<br />')
      .replace(/&nbsp;/gi, ' ');

    // Transform XML file_action tags into markdown file code blocks
    result = result.replace(
      /<file_action\s+(?:(?:action=["'](create|update|delete|edit|remove|modify)["']\s+path=["']([^"']+)["'])|(?:path=["']([^"']+)["']\s+action=["'](create|update|delete|edit|remove|modify)["']))\s*(?:\/>|>([\s\S]*?)<\/file_action>)/gi,
      (_match, act1, p1, p2, act2, body) => {
        const act = (act1 || act2 || 'create').toLowerCase();
        const p = (p1 || p2 || '').trim();
        const content = body ? body.trim() : '';
        return `\n\n\`\`\`file:${act}:${p}\n${content}\n\`\`\`\n\n`;
      }
    );

    // Protect code blocks (``` ... ```) and raw <svg> ... </svg> tags from regex replacements
    const protectedBlocks: string[] = [];
    result = result.replace(/(```[\s\S]*?```|<svg[\s\S]*?<\/svg>)/gi, (match) => {
      protectedBlocks.push(match);
      return `___PROTECTED_BLOCK_${protectedBlocks.length - 1}___`;
    });

    // 1. Transform block math $$ ... $$ into ```math ... ``` code blocks for Math Card rendering
    result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, mathExpr) => {
      const trimmed = mathExpr.trim();
      if (!trimmed) return _match;
      return `\n\n\`\`\`math\n${trimmed}\n\`\`\`\n\n`;
    });

    // 2. Transform LaTeX block math \[ ... \] into ```math ... ``` code blocks
    result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_match, mathExpr) => {
      const trimmed = mathExpr.trim();
      if (!trimmed) return _match;
      return `\n\n\`\`\`math\n${trimmed}\n\`\`\`\n\n`;
    });

    // 3. Transform inline LaTeX math \( ... \) into $ ... $ for inline KaTeX rendering
    result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_match, mathExpr) => {
      let trimmed = mathExpr.trim();
      if (!trimmed) return _match;
      trimmed = trimmed
        .replace(/(?<!\\)vec\{/g, '\\vec{')
        .replace(/(?<!\\)overrightarrow\{/g, '\\overrightarrow{')
        .replace(/(?<!\\)frac\{/g, '\\frac{');
      return `$${trimmed}$`;
    });

    // 4. Transform unescaped raw inline math like vec{v} or overrightarrow{OM}
    result = result.replace(/(?<!\\)vec\{([^{}]+)\}/g, '$\\vec{$1}$');
    result = result.replace(/(?<!\\)overrightarrow\{([^{}]+)\}/g, '$\\overrightarrow{$1}$');

    // 5. Normalize Unicode combining arrow vectors ONLY in prose text (outside code/svg blocks)
    result = result.replace(/([a-zA-Z\u03B1-\u03C9\u0391-\u03A9])[\u20D7\u20D6]/g, '$\\vec{$1}$');

    // Restore protected code and svg blocks
    result = result.replace(/___PROTECTED_BLOCK_(\d+)___/g, (_, idx) => {
      return protectedBlocks[Number(idx)] || '';
    });

    return result;
  }, [cleanContent]);

  // Automatically attach borderless hover copy button to any KaTeX display math cards
  useEffect(() => {
    if (!messageContainerRef.current) return;
    const katexEls = messageContainerRef.current.querySelectorAll('.katex-display');
    katexEls.forEach((el) => {
      if (el.querySelector('.katex-copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'katex-copy-btn';
      btn.type = 'button';
      btn.title = language === 'ar' ? 'نسخ المعادلة' : 'Copy formula';
      btn.setAttribute('aria-label', language === 'ar' ? 'نسخ المعادلة' : 'Copy formula');
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

      btn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const annotation = el.querySelector('annotation');
        const rawFormula = annotation ? (annotation.textContent || '').trim() : (el.textContent || '').trim();
        if (rawFormula) {
          const success = await copyFormattedMath(rawFormula, el as HTMLElement);
          if (success) {
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
            setTimeout(() => {
              btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
            }, 2000);
          }
        }
      };
      el.appendChild(btn);
    });
  }, [processedCleanContent, language]);

  // If streaming just started and there is no text yet
  if (isStreaming && (!content || !content.trim())) {
    return (
      <div className="flex items-center gap-2 py-1 select-none text-xs text-zinc-500 dark:text-zinc-400">
        <StreamingCursor />
        <RotatingThinkingPhrase isRtl={language === 'ar'} />
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0 max-w-full overflow-hidden">
      {/* Visually Isolated Thought / Reasoning Process Accordion */}
      {thoughtText && (
        <div className="w-full">
          <ThoughtProcessAccordion
            thoughtText={thoughtText}
            isStreaming={isThinkingOngoing && isStreaming}
            language={language}
          />
        </div>
      )}

      {/* Visual separator when both thought process and final response are present */}
      {thoughtText && cleanContent && cleanContent.trim() ? (
        <div className="flex items-center gap-2 py-0.5 select-none" aria-hidden="true">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent" />
          <span className="text-[10.5px] tracking-wide text-zinc-400 dark:text-zinc-500 font-medium px-1">
            {language === 'ar' ? 'الإجابة النهائية' : 'Final Answer'}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent" />
        </div>
      ) : null}

      {/* Main Clean Response Content */}
      {processedCleanContent && processedCleanContent.trim() ? (
        <div
          ref={messageContainerRef}
          dir="auto"
          className="markdown-body space-y-1.5 leading-[1.75] text-[15px] sm:text-[15.5px] text-zinc-900 dark:text-zinc-100 text-start pt-0.5 break-words [overflow-wrap:anywhere] min-w-0 max-w-full overflow-hidden"
        >
          <Markdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{
              // Code blocks and inline code
              code({ className, children, ...props }) {
                const match = /language-([^\s]+)/.exec(className || '');
                const isInline = !match && !String(children).includes('\n') && !className;

                if (isInline) {
                  return (
                    <code
                      className="px-1.5 py-0.5 mx-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[12.5px] font-medium border border-zinc-200 dark:border-zinc-700"
                      dir="ltr"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                const rawLang = match ? match[1] : 'text';
                const rawCode = String(children).replace(/\n$/, '');

                // File creation, update, or deletion actions
                if (rawLang.startsWith('file:') || rawLang.startsWith('file-')) {
                  const parts = rawLang.replace(/^file-/, 'file:').split(':');
                  const actType = (parts[1] || 'create').toLowerCase();
                  const filePath = parts.slice(2).join(':') || 'file.txt';
                  return (
                    <FileActionCard
                      action={{
                        type: actType === 'delete' || actType === 'remove' ? 'delete' : actType === 'update' || actType === 'edit' ? 'update' : 'create',
                        path: filePath,
                        content: rawCode,
                      }}
                      language={language === 'en' ? 'en' : 'ar'}
                      onOpenFile={(path, content) => onOpenArtifact?.(content || '', getFileLanguage(path))}
                    />
                  );
                }

                const codeLang = rawLang;

                if (codeLang === 'chart' || codeLang === 'json:chart') {
                  return <InteractiveChart rawJson={rawCode} />;
                }

                if (codeLang === 'tree' || codeLang === 'mindmap' || codeLang === 'json:tree' || codeLang === 'treemap') {
                  return <InteractiveTree rawJson={rawCode} />;
                }

                if (codeLang === 'diagram' || codeLang === 'schema' || codeLang === 'json:diagram') {
                  return <InteractiveDiagram rawJson={rawCode} />;
                }

                if (codeLang === 'math' || codeLang === 'latex' || codeLang === 'equation' || codeLang === 'formula' || codeLang === 'json:math') {
                  return <MathEquationCard formula={rawCode} />;
                }

                // Interactive 2D chemical molecular structure and SMILES rendering
                if (
                  codeLang === 'molecule' ||
                  codeLang === 'smiles' ||
                  codeLang === 'chem' ||
                  codeLang === 'chemical' ||
                  codeLang === 'mol' ||
                  codeLang === 'rdkit' ||
                  codeLang === 'json:molecule' ||
                  codeLang === 'json:smiles' ||
                  (rawCode.includes('MolFromSmiles') && rawCode.includes('rdMolDraw2D'))
                ) {
                  return (
                    <InteractiveMolecule
                      rawCode={rawCode}
                      onOpenArtifact={onOpenArtifact}
                    />
                  );
                }

                // Inline interactive visual rendering for SVG drawings
                const isSvg =
                  codeLang === 'svg' ||
                  (codeLang === 'xml' && rawCode.includes('<svg')) ||
                  (rawCode.trim().startsWith('<svg') && rawCode.includes('</svg>')) ||
                  (/<svg[\s\S]*?<\/svg>/i.test(rawCode) && !rawCode.includes('<!DOCTYPE html>'));

                if (isSvg) {
                  return (
                    <SvgDrawingViewer
                      svgCode={rawCode}
                      onOpenArtifact={onOpenArtifact}
                    />
                  );
                }

                return (
                  <CodeBlock
                    code={rawCode}
                    language={codeLang}
                    onOpenArtifact={onOpenArtifact}
                  />
                );
              },

          // Minimalist Clean Tables
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-start border-collapse text-[14px]">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                {children}
              </thead>
            );
          },
          tbody({ children }) {
            return (
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {children}
              </tbody>
            );
          },
          tr({ children }) {
            return (
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                {children}
              </tr>
            );
          },
          th({ children }) {
            return (
              <th className="px-3.5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 text-xs text-start">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3.5 py-2 text-zinc-800 dark:text-zinc-200 align-top text-start">
                {children}
              </td>
            );
          },

          // Clean, uncrowded lists
          ul({ children }) {
            return (
              <ul className="my-2 space-y-1 list-disc px-5 marker:text-zinc-400 dark:marker:text-zinc-500 text-[15px]">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="my-2 space-y-1 list-decimal px-5 marker:text-zinc-400 dark:marker:text-zinc-500 text-[15px]">
                {children}
              </ol>
            );
          },
          li({ children, ...props }) {
            return (
              <li className="leading-relaxed text-zinc-900 dark:text-zinc-100" {...props}>
                {children}
              </li>
            );
          },

          // Headings
          h1({ children }) {
            return (
              <h1 className="text-xl font-bold mt-4 mb-2 text-zinc-950 dark:text-zinc-50">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="text-lg font-bold mt-3.5 mb-1.5 text-zinc-950 dark:text-zinc-50">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="text-base font-semibold mt-3 mb-1 text-zinc-900 dark:text-zinc-100">
                {children}
              </h3>
            );
          },

          // Paragraphs
          p({ children }) {
            return (
              <div className="my-2 text-zinc-900 dark:text-zinc-100 leading-relaxed">
                {children}
              </div>
            );
          },

          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote className="border-s-2 border-zinc-400 dark:border-zinc-600 ps-3 py-1 my-2 text-zinc-600 dark:text-zinc-400 text-[14.5px]">
                {children}
              </blockquote>
            );
          },

          strong({ children }) {
            return (
              <strong className="font-semibold text-zinc-950 dark:text-white">
                {children}
              </strong>
            );
          },
          em({ children }) {
            return (
              <em className="italic">
                {children}
              </em>
            );
          },
          del({ children }) {
            return (
              <del className="line-through opacity-75">
                {children}
              </del>
            );
          },
          hr() {
            return <hr className="my-4 border-t border-zinc-200 dark:border-zinc-800" />;
          },
          a({ href, children }) {
            const safe = isSafeUrl(href);
            return (
              <a
                href={safe ? href : '#'}
                target={safe ? '_blank' : undefined}
                rel={safe ? 'noopener noreferrer' : undefined}
                onClick={safe ? undefined : (e) => e.preventDefault()}
                className="text-zinc-900 dark:text-zinc-100 underline decoration-zinc-400 hover:text-black dark:hover:text-white font-medium"
              >
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            if (!src) return null;
            return <GeneratedImageCard src={src} alt={alt || 'Generated image'} language={language} />;
          },
          button({ children, onClick, type, ...props }: any) {
            return (
              <button
                type={type === 'submit' || type === 'reset' ? type : 'button'}
                onClick={typeof onClick === 'function' ? onClick : undefined}
                className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                {...props}
              >
                {children}
              </button>
            );
          },
        }}
      >
        {processedCleanContent}
      </Markdown>

      {/* Clean inline cursor when streaming main response */}
      {isStreaming && !isThinkingOngoing && (
        <span className="inline-block align-middle ms-1">
          <StreamingCursor />
        </span>
      )}
    </div>
  ) : isThinkingOngoing && isStreaming ? (
    <div className="flex items-center gap-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 select-none">
      <StreamingCursor />
      <span>{language === 'ar' ? 'يجري صياغة الإجابة النهائية...' : 'Formulating final answer...'}</span>
    </div>
  ) : null}
</div>
  );
});

