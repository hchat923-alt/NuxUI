import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Paintbrush,
  Code2,
  Download,
  Copy,
  Check,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  Grid,
  Sparkles,
} from 'lucide-react';
import { highlightCode } from '../utils/prismHelper';
import { getStoredLanguage } from '../utils/i18n';

interface SvgDrawingViewerProps {
  svgCode: string;
  onOpenArtifact?: (code: string, language: string) => void;
}

/**
 * Clean and sanitize raw SVG string for safe rendering
 */
function extractAndSanitizeSvg(raw: string): { cleanSvg: string; isValid: boolean } {
  if (!raw || !raw.trim()) {
    return { cleanSvg: '', isValid: false };
  }

  // Extract <svg>...</svg> block if wrapped with markdown or other text
  const match = /<svg[\s\S]*?<\/svg>/i.exec(raw);
  const targetSvg = match ? match[0] : raw;

  if (typeof window === 'undefined') {
    return { cleanSvg: targetSvg, isValid: true };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(targetSvg, 'image/svg+xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      // Basic regex fallback if strict XML parser had minor entity error
      const cleaned = targetSvg
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*(["'])[\s\S]*?\1/gi, '')
        .replace(/javascript:/gi, '');
      return { cleanSvg: cleaned, isValid: cleaned.includes('<svg') };
    }

    // Remove any potentially hazardous tags
    const badElements = doc.querySelectorAll('script, foreignObject, iframe, embed, object');
    badElements.forEach((el) => el.remove());

    // Strip inline event listeners & javascript URIs
    const all = doc.querySelectorAll('*');
    all.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value.toLowerCase().replace(/[\s\x00-\x1f]+/g, '');
        if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // Normalize and beautify mathematical notations, vector arrows, and subscripts inside SVG <text> and <tspan>
    const textNodes = doc.querySelectorAll('text, tspan');
    const SUB_MAP: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
      'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'j',
      'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
      'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
      'v': 'ᵥ', 'x': 'ₓ', 'N': 'ₙ', 'T': 'ₜ', 'A': 'ₐ',
      'B': 'b', 'C': 'c', 'D': 'd', 'E': 'ₑ', 'F': 'f'
    };

    textNodes.forEach((node) => {
      let text = node.textContent || '';
      if (!text || !text.trim()) return;

      // Remove combining unicode vector arrow characters (\u20D0-\u20FF) and unprintable glyphs that cause square box font errors in SVG text
      text = text.replace(/[\u20D0-\u20FF\uFFF0-\uFFFF]/g, '');

      // 1. Convert LaTeX vectors cleanly: $\vec{R}$, \vec{R}, $vec{R}\$, vec{R} -> R
      text = text.replace(/(?:\$|\\)?\\?vec\{([a-zA-Z\u03B1-\u03C9\u0391-\u03A9])\}(?:\$|\\)?/g, '$1');
      text = text.replace(/\\vec\s+([a-zA-Z\u03B1-\u03C9\u0391-\u03A9])/g, '$1');
      text = text.replace(/(?:\$|\\)?\\?overrightarrow\{([a-zA-Z0-9\u03B1-\u03C9\u0391-\u03A9]+)\}(?:\$|\\)?/g, '$1');

      // 2. Convert common LaTeX Greek letters
      text = text
        .replace(/\\alpha\b/g, 'α')
        .replace(/\\beta\b/g, 'β')
        .replace(/\\gamma\b/g, 'γ')
        .replace(/\\theta\b/g, 'θ')
        .replace(/\\phi\b|\\varphi\b/g, 'φ')
        .replace(/\\omega\b/g, 'ω')
        .replace(/\\lambda\b/g, 'λ')
        .replace(/\\mu\b/g, 'μ')
        .replace(/\\pi\b/g, 'π')
        .replace(/\\Delta\b/g, 'Δ')
        .replace(/\\Sigma\b/g, 'Σ')
        .replace(/\\times\b/g, '×')
        .replace(/\\pm\b/g, '±')
        .replace(/\\le\b|\\leq\b/g, '≤')
        .replace(/\\ge\b|\\geq\b/g, '≥')
        .replace(/\\neq\b/g, '≠')
        .replace(/\\approx\b/g, '≈')
        .replace(/\\degree\b|\^\\circ\b/g, '°');

      // 3. Convert simple subscripts: R_N -> Rₙ, R_T -> Rₜ, f_k -> fₖ, v_0 -> v₀
      text = text.replace(/([a-zA-Z\u03B1-\u03C9\u0391-\u03A9])_([0-9a-zA-Z+-]+|\{[0-9a-zA-Z+-]+\})/g, (_m, base, sub) => {
        const cleanSub = sub.replace(/[{}]/g, '');
        const convertedSub = cleanSub.split('').map((ch: string) => SUB_MAP[ch] || ch).join('');
        return `${base}${convertedSub}`;
      });

      // 4. Remove residual lone dollar signs around formulas in SVG
      text = text.replace(/(?:^|\s)\$([^$]+)\$(?:\s|$)/g, ' $1 ');

      // 5. Clean up stray leading/trailing backslashes
      text = text.replace(/\\([a-zA-Z]+)/g, '$1');

      if (node.textContent !== text) {
        node.textContent = text;
      }

      // 6. Ensure proper bidirectional handling for mixed Arabic + Latin in SVG text
      if (/[\u0600-\u06FF]/.test(text)) {
        if (!node.hasAttribute('direction')) {
          node.setAttribute('direction', 'rtl');
        }
        if (!node.hasAttribute('unicode-bidi')) {
          node.setAttribute('unicode-bidi', 'plaintext');
        }
      }
    });

    const svgElement = doc.querySelector('svg');
    if (!svgElement) {
      return { cleanSvg: targetSvg, isValid: false };
    }

    // Ensure responsive SVG rendering
    if (!svgElement.hasAttribute('xmlns')) {
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    return {
      cleanSvg: new XMLSerializer().serializeToString(svgElement),
      isValid: true,
    };
  } catch (err) {
    console.warn('SVG sanitization error:', err);
    return { cleanSvg: targetSvg, isValid: true };
  }
}

export const SvgDrawingViewer: React.FC<SvgDrawingViewerProps> = ({
  svgCode,
  onOpenArtifact,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [bgStyle, setBgStyle] = useState<'checker' | 'light' | 'dark'>('checker');
  const [zoom, setZoom] = useState<number>(1);
  const [copied, setCopied] = useState(false);
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isArabic = getStoredLanguage() === 'ar';

  const { cleanSvg, isValid } = useMemo(() => {
    return extractAndSanitizeSvg(svgCode);
  }, [svgCode]);

  const highlightedCode = useMemo(() => {
    return highlightCode(svgCode, 'svg');
  }, [svgCode]);

  // Extract title if available in svg
  const svgTitle = useMemo(() => {
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(svgCode);
    if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
    return isArabic ? 'رسمة وتصميم بصري (SVG)' : 'Visual Drawing (SVG)';
  }, [svgCode, isArabic]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(svgCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownloadSvg = () => {
    const blob = new Blob([cleanSvg || svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drawing_${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!cleanSvg) return;
    setIsDownloadingPng(true);

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleanSvg, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        setIsDownloadingPng(false);
        handleDownloadSvg();
        return;
      }

      let minX = 0;
      let minY = 0;
      let vbWidth = 800;
      let vbHeight = 600;

      const rawVb = svgEl.getAttribute('viewBox');
      if (rawVb) {
        const parts = rawVb.trim().split(/[\s,]+/).map(Number);
        if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
          minX = parts[0];
          minY = parts[1];
          vbWidth = parts[2];
          vbHeight = parts[3];
        }
      } else {
        const wAttr = parseFloat(svgEl.getAttribute('width') || '800');
        const hAttr = parseFloat(svgEl.getAttribute('height') || '600');
        if (wAttr > 0 && hAttr > 0) {
          vbWidth = wAttr;
          vbHeight = hAttr;
        }
      }

      // High-res export scale
      const exportScale = 2;
      const targetCanvasWidth = Math.round(vbWidth * exportScale);
      const targetCanvasHeight = Math.round(vbHeight * exportScale);

      svgEl.setAttribute('viewBox', `${minX} ${minY} ${vbWidth} ${vbHeight}`);
      svgEl.setAttribute('width', `${targetCanvasWidth}`);
      svgEl.setAttribute('height', `${targetCanvasHeight}`);
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      const serialized = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetCanvasWidth;
        canvas.height = targetCanvasHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          if (bgStyle === 'dark') {
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, targetCanvasWidth, targetCanvasHeight);
          } else if (bgStyle === 'light') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetCanvasWidth, targetCanvasHeight);
          }
          ctx.drawImage(img, 0, 0, targetCanvasWidth, targetCanvasHeight);

          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `drawing_${Date.now()}.png`;
          link.click();
        }

        URL.revokeObjectURL(url);
        setIsDownloadingPng(false);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        setIsDownloadingPng(false);
        handleDownloadSvg();
      };

      img.src = url;
    } catch {
      setIsDownloadingPng(false);
      handleDownloadSvg();
    }
  };

  const zoomIn = () => setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 3));
  const zoomOut = () => setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.5));
  const resetZoom = () => setZoom(1);

  return (
    <div className="group relative my-3 w-full rounded-2xl bg-transparent transition-all text-zinc-900 dark:text-zinc-100 select-none">
      {/* Main Drawing Canvas / Preview Card */}
      {activeTab === 'preview' ? (
        <div
          ref={containerRef}
          className="relative w-full min-h-[260px] max-h-[500px] p-4 flex items-center justify-center overflow-auto transition-colors select-none rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80"
        >
          {/* Floating Top Controls Inside Card on Hover (No enclosing boxes) */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-3.5 inset-x-4 z-20 flex items-center justify-between pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate drop-shadow-xs">
                {svgTitle}
              </span>
            </div>

            {/* Pure standalone action icons */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer p-1"
                title={isArabic ? 'عرض كود SVG' : 'View Code'}
              >
                <Code2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDownloadSvg}
                className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer p-1"
                title={isArabic ? 'تحميل كملف SVG' : 'Download SVG'}
              >
                <Download className="w-4 h-4" />
              </button>

              {onOpenArtifact && (
                <button
                  type="button"
                  onClick={() => onOpenArtifact(cleanSvg || svgCode, 'svg')}
                  className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer p-1"
                  title={isArabic ? 'عرض في مساحة العمل' : 'Open in Artifacts'}
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Standalone zoom controls on hover inside card (No enclosing box) */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-3.5 start-4 flex items-center gap-2 text-zinc-400 dark:text-zinc-400 z-10">
            <button
              type="button"
              onClick={zoomIn}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1"
              title={isArabic ? 'تكبير' : 'Zoom In'}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1"
              title={isArabic ? 'تصغير' : 'Zoom Out'}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1"
              title={isArabic ? 'إعادة الضبط' : 'Reset'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {isValid ? (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
              className="flex items-center justify-center max-w-full max-h-full svg-drawing-wrapper [&>svg]:max-w-full [&>svg]:max-h-[460px] [&>svg]:w-auto [&>svg]:h-auto [&>svg]:block [&>svg]:mx-auto"
              dangerouslySetInnerHTML={{ __html: cleanSvg }}
            />
          ) : (
            <div className="text-center p-6 text-xs text-zinc-500 dark:text-zinc-400">
              <p className="mb-2 font-semibold text-red-500">
                {isArabic ? 'تعذر تصيير الرسمة التلقائية' : 'Could not render visual preview'}
              </p>
              <button
                onClick={() => setActiveTab('code')}
                className="underline text-zinc-900 dark:text-zinc-100 cursor-pointer"
              >
                {isArabic ? 'عرض كود الرسمة' : 'View Code'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Code View */
        <div className="relative p-3 rounded-2xl bg-zinc-900 text-zinc-100 text-xs font-mono max-h-[400px] overflow-auto scrollbar-thin border border-zinc-800" dir="ltr">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-sans text-zinc-200 transition-colors cursor-pointer"
          >
            {isArabic ? 'عرض الرسمة' : 'Preview'}
          </button>
          <pre className="!bg-transparent !p-0 !m-0 pt-6">
            <code
              className="language-svg font-mono"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>
      )}
    </div>
  );
};
