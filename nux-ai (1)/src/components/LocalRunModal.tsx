import React, { useState } from 'react';
import {
  X,
  Laptop,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Zap,
} from 'lucide-react';

interface LocalRunModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocalRunModal: React.FC<LocalRunModalProps> = ({ isOpen, onClose }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const copyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const oneClickCmd = 'npm install && set OLLAMA_ORIGINS=* && start /b "" ollama serve && start http://localhost:3000 && npm run dev';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1B1B1F] border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 font-sans">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                تشغيل التطبيق بنقرة واحدة على حاسوبك
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                تشغيل تلقائي كامل مع Ollama بدون أي تعقيد
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-right" dir="rtl">
          {/* Method 1: Double Click File */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-xs sm:text-sm">
              <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>الطريقة الأسهل: ملف التشغيل التلقائي (Double Click)</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              قمنا بإنشاء ملف باسم <code className="font-bold text-emerald-700 dark:text-emerald-300">run-app.bat</code> داخل مجلد المشروع.
              بمجرد الضغط عليه مرتين بعد تنزيل المشروع، سيقوم بتشغيل Ollama، وتثبيت المكتبات، وفتح المتصفح تلقائياً!
            </p>
          </div>

          {/* Method 2: Single Command Copy */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <h4 className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
              أو: انسخ هذا الأمر الواحد في موجه الأوامر (CMD)
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              افتح CMD داخل مجلد المشروع والصق هذا السطر فقط:
            </p>
            <div className="relative">
              <pre
                dir="ltr"
                className="bg-zinc-950 text-zinc-100 p-3 rounded-lg text-xs font-mono overflow-x-auto border border-zinc-800 flex items-center justify-between"
              >
                <code>{oneClickCmd}</code>
                <button
                  onClick={() => copyCode(oneClickCmd, 1)}
                  className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 ml-2"
                  title="نسخ الأمر بالكامل"
                >
                  {copiedIndex === 1 ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </pre>
            </div>
          </div>

          {/* Steps summary */}
          <div className="text-xs space-y-2 text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              خطوات التنزيل الأولى:
            </p>
            <ol className="list-decimal list-inside space-y-1 pr-1">
              <li>اضغط على <strong>Settings / Export</strong> في أعلى صفحة AI Studio واختر <strong>Download ZIP</strong>.</li>
              <li>فك الضغط عن الملف في حاسوبك (Extract All).</li>
              <li>اضغط مرتين على <code>run-app.bat</code> وسيفتح التطبيق فوراً.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-zinc-50 dark:bg-zinc-900">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
