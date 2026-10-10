import React, { useState } from 'react';
import {
  FileCode,
  FilePlus,
  FileEdit,
  Trash2,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
} from 'lucide-react';
import { FileAction } from '../types';
import { highlightCode } from '../utils/prismHelper';

interface FileActionCardProps {
  action: FileAction;
  language?: 'ar' | 'en';
  onOpenFile?: (path: string, content?: string) => void;
}

export const FileActionCard: React.FC<FileActionCardProps> = ({
  action,
  language = 'ar',
  onOpenFile,
}) => {
  const isEn = language === 'en';
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isDelete = action.type === 'delete';
  const isCreate = action.type === 'create';
  const isUpdate = action.type === 'update';

  const fileName = action.path.split('/').pop() || action.path;
  const linesCount = action.content ? action.content.split('\n').length : 0;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!action.content) return;
    navigator.clipboard.writeText(action.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!action.content) return;
    const blob = new Blob([action.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getBadgeStyle = () => {
    if (isDelete) {
      return {
        bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400',
        label: isEn ? 'Deleted File' : 'حذف ملف',
        icon: <Trash2 className="w-3.5 h-3.5" />,
      };
    }
    if (isUpdate) {
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400',
        label: isEn ? 'Updated File' : 'تعديل ملف',
        icon: <FileEdit className="w-3.5 h-3.5" />,
      };
    }
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400',
      label: isEn ? 'Created File' : 'إنشاء ملف',
      icon: <FilePlus className="w-3.5 h-3.5" />,
    };
  };

  const badge = getBadgeStyle();

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className="my-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 overflow-hidden shadow-2xs transition-all"
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-zinc-100/70 dark:bg-zinc-900 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1.5 shrink-0 ${badge.bg}`}>
            {badge.icon}
            <span>{badge.label}</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <FileCode className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
            <span
              className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate"
              title={action.path}
            >
              {action.path}
            </span>
          </div>

          {!isDelete && linesCount > 0 && (
            <span className="text-[11px] text-zinc-600 dark:text-zinc-300 shrink-0 font-mono">
              ({linesCount} {isEn ? 'lines' : 'سطراً'})
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {!isDelete && action.content && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                title={isEn ? 'Copy code' : 'نسخ الكود'}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                title={isEn ? 'Download file' : 'تحميل الملف'}
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {onOpenFile && (
                <button
                  type="button"
                  onClick={() => onOpenFile(action.path, action.content)}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                  title={isEn ? 'Open in viewer' : 'فتح في العارض'}
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1"
              >
                <span>{isExpanded ? (isEn ? 'Hide Code' : 'إخفاء') : (isEn ? 'Preview Code' : 'معاينة')}</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </>
          )}

          {isDelete && (
            <span className="text-xs text-red-600 dark:text-red-400 italic">
              {isEn ? 'Removed from project' : 'تمت الإزالة من المشروع'}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Code View */}
      {!isDelete && isExpanded && action.content && (
        <div className="relative max-h-96 overflow-auto bg-[#1e1e1e] p-3 text-xs font-mono text-zinc-100" dir="ltr">
          <pre
            className="m-0 leading-relaxed overflow-x-auto"
            dangerouslySetInnerHTML={{
              __html: highlightCode(action.content, action.language || 'text'),
            }}
          />
        </div>
      )}
    </div>
  );
};
