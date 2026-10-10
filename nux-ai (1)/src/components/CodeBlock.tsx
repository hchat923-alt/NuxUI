import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Download, ChevronDown, ChevronUp, FileCode } from 'lucide-react';
import { highlightCode } from '../utils/prismHelper';
import { getStoredLanguage } from '../utils/i18n';
import { formatFileSize } from '../utils/fileUtils';

interface CodeBlockProps {
  code: string;
  language: string;
  onOpenArtifact?: (code: string, language: string) => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  onOpenArtifact,
}) => {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const lang = (language || 'text').toLowerCase();

  const lines = code.split('\n');
  const lineCount = lines.length;
  const isSuperLong = lineCount > 40;

  const appLang = getStoredLanguage();
  const isAr = appLang === 'ar';

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const getExtension = (l: string) => {
    const m: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      jsx: 'jsx',
      tsx: 'tsx',
      html: 'html',
      css: 'css',
      python: 'py',
      json: 'json',
      markdown: 'md',
      bash: 'sh',
      sql: 'sql',
    };
    return m[l.toLowerCase()] || 'txt';
  };

  const getFileName = () => {
    const ext = getExtension(lang);
    return `code_file.${ext}`;
  };

  const triggerDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isPreviewable = ['html', 'htm', 'svg', 'jsx', 'tsx', 'javascript', 'js', 'css'].includes(lang);
  const highlightedHtml = highlightCode(code, lang);

  return (
    <div className="group relative my-4 rounded-xl overflow-hidden border border-zinc-200/90 dark:border-[#30363D] bg-[#F6F8FA] dark:bg-[#0D1117] text-[#24292F] dark:text-[#C9D1D9] shadow-xs transition-colors" dir="ltr">
      {/* Sleek Minimal Header Bar matching Light / Dark theme */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1 bg-[#F6F8FA] dark:bg-[#0D1117] select-none text-xs border-b border-zinc-200/60 dark:border-transparent">
        {/* Left Side: Language Name */}
        <span className="font-mono text-[12px] font-normal text-zinc-500 dark:text-[#8B949E] lowercase tracking-normal">
          {lang}
        </span>

        {/* Right Side: Action Icons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Artifact Preview Button */}
          {isPreviewable && onOpenArtifact && (
            <button
              type="button"
              onClick={() => onOpenArtifact(code, lang)}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-[#8B949E] dark:hover:text-[#C9D1D9] hover:bg-zinc-200/80 dark:hover:bg-[#21262D] transition-colors cursor-pointer"
              title={isAr ? 'معاينة الكود' : 'Preview'}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Download Button */}
          <button
            type="button"
            onClick={triggerDownload}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-[#8B949E] dark:hover:text-[#C9D1D9] hover:bg-zinc-200/80 dark:hover:bg-[#21262D] transition-colors cursor-pointer"
            title={isAr ? 'تنزيل الكود' : 'Download'}
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={copyToClipboard}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-[#8B949E] dark:hover:text-[#C9D1D9] hover:bg-zinc-200/80 dark:hover:bg-[#21262D] transition-colors cursor-pointer flex items-center justify-center"
            title={isAr ? 'نسخ الكود' : 'Copy'}
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Collapse */}
          {isSuperLong && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-[#8B949E] dark:hover:text-[#C9D1D9] hover:bg-zinc-200/80 dark:hover:bg-[#21262D] transition-colors cursor-pointer"
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Code Editor Body */}
      {!isCollapsed && (
        <div className="px-4 pb-4 pt-2 overflow-x-auto code-block-scroll text-[13.5px] font-mono leading-[1.65] bg-[#F6F8FA] dark:bg-[#0D1117] text-[#24292F] dark:text-[#C9D1D9]">
          <pre className="!bg-transparent !p-0 !m-0 font-mono">
            <code
              className={`language-${lang} font-mono`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      )}
    </div>
  );
};
