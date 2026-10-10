import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Code2,
  Eye,
  Sun,
  Moon,
  Grid,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Paintbrush,
} from 'lucide-react';
import { highlightCode } from '../utils/prismHelper';

interface ArtifactModalProps {
  code: string;
  language: string;
  onClose: () => void;
}

function sanitizeSvg(rawSvg: string): string {
  if (typeof window === 'undefined') return rawSvg;
  try {
    const match = /<svg[\s\S]*?<\/svg>/i.exec(rawSvg);
    const target = match ? match[0] : rawSvg;

    const parser = new DOMParser();
    const doc = parser.parseFromString(target, 'image/svg+xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return target
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*(["'])[\s\S]*?\1/gi, '')
        .replace(/javascript:/gi, '');
    }

    // Strip dangerous elements
    const dangerousElements = doc.querySelectorAll('script, foreignObject, iframe, embed, object');
    dangerousElements.forEach((el) => el.remove());

    // Strip event handlers
    const allElements = doc.querySelectorAll('*');
    allElements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.toLowerCase().replace(/[\s\x00-\x1f]+/g, '');
        if (name.startsWith('on') || value.startsWith('javascript:') || value.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    const svgEl = doc.querySelector('svg');
    if (!svgEl) return target;

    if (!svgEl.hasAttribute('xmlns')) {
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return rawSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*(["'])[\s\S]*?\1/gi, '');
  }
}

export const ArtifactModal: React.FC<ArtifactModalProps> = ({
  code,
  language,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [bgStyle, setBgStyle] = useState<'checker' | 'light' | 'dark'>('checker');
  const [zoom, setZoom] = useState<number>(1);

  const langLower = (language || 'text').toLowerCase();
  const isSvg = langLower === 'svg' || code.includes('<svg');
  const isHtml = ['html', 'htm', 'markup'].includes(langLower) || (!isSvg && code.includes('<html'));
  const isPreviewable = isSvg || isHtml;

  const [activeTab, setActiveTab] = useState<'code' | 'preview'>(
    isPreviewable ? 'preview' : 'code'
  );

  const highlightedHtml = highlightCode(code, language);

  const sanitizedSvg = useMemo(() => {
    return isSvg ? sanitizeSvg(code) : '';
  }, [code, isSvg]);

  // For HTML documents, provide isolated sandbox
  const htmlPreviewDoc = useMemo(() => {
    if (isSvg) return '';
    if (code.includes('<!DOCTYPE') || code.includes('<html')) {
      return code;
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;box-sizing:border-box;background:#fff;color:#111;}</style></head><body>${code}</body></html>`;
  }, [code, isSvg]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const extMap: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      html: 'html',
      css: 'css',
      json: 'json',
      svg: 'svg',
      rust: 'rs',
      cpp: 'cpp',
      bash: 'sh',
      sql: 'sql',
    };
    const ext = isSvg ? 'svg' : extMap[langLower] || 'txt';
    const mime = isSvg ? 'image/svg+xml' : 'text/plain;charset=utf-8';
    const blob = new Blob([isSvg ? sanitizedSvg || code : code], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `artifact_${Date.now()}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!sanitizedSvg) return;
    try {
      const img = new Image();
      const svgBlob = new Blob([sanitizedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2;
        const width = img.naturalWidth || 1024;
        const height = img.naturalHeight || 1024;
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.scale(scale, scale);
          if (bgStyle === 'dark') {
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, width, height);
          } else if (bgStyle === 'light') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(img, 0, 0, width, height);
          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `drawing_${Date.now()}.png`;
          link.click();
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch {
      handleDownload();
    }
  };

  const zoomIn = () => setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 3.5));
  const zoomOut = () => setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.25));
  const resetZoom = () => setZoom(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 font-sans">
      <div className="relative w-full max-w-5xl h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#1B1B1F] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-900 dark:text-zinc-100">
              {isSvg ? <Paintbrush className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                {isSvg ? 'الرسمة والتصميم (SVG)' : 'معاينة الأكواد (Artifact)'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono uppercase font-semibold">
                {isSvg ? 'SVG' : language || 'code'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isPreviewable && (
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة حية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                    activeTab === 'code'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>الكود المصدر</span>
                </button>
              </div>
            )}

            {/* Background Style Switcher for Visual Canvas */}
            {activeTab === 'preview' && isSvg && (
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setBgStyle('checker')}
                  className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                    bgStyle === 'checker' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs' : 'text-zinc-500'
                  }`}
                  title="خلفية مربعات شفافة"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setBgStyle('light')}
                  className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                    bgStyle === 'light' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs' : 'text-zinc-500'
                  }`}
                  title="خلفية بيضاء فاتحة"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setBgStyle('dark')}
                  className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                    bgStyle === 'dark' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs' : 'text-zinc-500'
                  }`}
                  title="خلفية داكنة"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Zoom Controls for SVG */}
            {activeTab === 'preview' && isSvg && (
              <div className="hidden sm:flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={zoomIn}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 cursor-pointer"
                  title="تكبير"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="px-1.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 cursor-pointer"
                  title="إعادة ضبط الحجم"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={zoomOut}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 cursor-pointer"
                  title="تصغير"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* PNG Download for SVG */}
            {isSvg && (
              <button
                type="button"
                onClick={handleDownloadPng}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors text-zinc-800 dark:text-zinc-200 cursor-pointer"
                title="تنزيل كصورة PNG عالية الجودة"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">PNG</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors text-zinc-800 dark:text-zinc-200 cursor-pointer"
              title="تنزيل الملف"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isSvg ? 'SVG' : 'تنزيل'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors text-zinc-800 dark:text-zinc-200 cursor-pointer"
              title="نسخ الكود"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body Area */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'code' ? (
            <div className="h-full overflow-auto p-4 bg-[#0D1117] font-mono text-[13px] leading-relaxed text-[#C9D1D9]" dir="ltr">
              <pre className="!bg-transparent !p-0 !m-0">
                <code
                  className={`language-${langLower}`}
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              </pre>
            </div>
          ) : isSvg ? (
            /* Direct SVG Visual Art Canvas */
            <div
              className={`h-full w-full p-8 overflow-auto flex items-center justify-center select-none transition-colors ${
                bgStyle === 'dark'
                  ? 'bg-zinc-950'
                  : bgStyle === 'light'
                  ? 'bg-white'
                  : 'bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] bg-white dark:bg-zinc-950'
              }`}
            >
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="flex items-center justify-center max-w-full max-h-full [&>svg]:max-w-[90vw] [&>svg]:max-h-[70vh] [&>svg]:w-auto [&>svg]:h-auto [&>svg]:block [&>svg]:mx-auto [&>svg]:drop-shadow-md"
                dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
              />
            </div>
          ) : (
            /* HTML Sandbox Preview */
            <div className="h-full w-full bg-white p-2 overflow-auto">
              <iframe
                title="HTML Preview"
                sandbox="allow-scripts allow-forms"
                srcDoc={htmlPreviewDoc}
                className="w-full h-full border-0 rounded bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
