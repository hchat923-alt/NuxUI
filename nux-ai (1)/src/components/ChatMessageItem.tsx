import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  X,
  Eye,
  FileCode,
  FileText,
  File as FileIcon,
  Music,
  Download,
  Atom,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ChatMessage, FileAttachment } from '../types';
import { getModelById } from '../data/models';
import { FormattedMessage } from './FormattedMessage';
import { extractThoughtProcess } from './ThoughtProcessAccordion';
import { WebSearchIndicator } from './WebSearchIndicator';
import { formatFileSize } from '../utils/fileUtils';
import { formatTimeAgo } from '../utils/timeUtils';
import { formatContentForClipboard } from '../utils/mathUtils';

interface ChatMessageItemProps {
  message: ChatMessage;
  language?: 'ar' | 'en';
  onRegenerate?: () => void;
  onOpenArtifact?: (code: string, language: string) => void;
  onOpenModelSelector?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  message,
  language = 'ar',
  onRegenerate,
  onOpenArtifact,
  onOpenModelSelector,
  onEditMessage,
  onSwitchVersion,
}) => {
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const isAI = message.sender === 'ai' || message.role === 'assistant';
  const modelInfo = getModelById(message.modelId || '');
  const displayModelName = message.modelUsed || modelInfo.name;

  const handleCopy = async () => {
    try {
      const isRtl = language === 'ar';
      const cleanRaw = isAI
        ? (extractThoughtProcess(message.content).cleanContent || message.content)
        : message.content;
      const textToCopy = formatContentForClipboard(cleanRaw, isRtl);
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleSaveEdit = () => {
    if (!editText.trim()) return;
    setIsEditing(false);
    if (onEditMessage) {
      onEditMessage(message.id, editText.trim());
    }
  };

  const renderFileCard = (file: FileAttachment) => {
    let icon = <FileIcon className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />;
    if (file.fileCategory === 'code') {
      icon = <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    } else if (file.fileCategory === 'pdf') {
      icon = <FileText className="w-4 h-4 text-red-500" />;
    } else if (file.fileCategory === 'audio') {
      icon = <Music className="w-4 h-4 text-purple-500" />;
    }

    return (
      <div
        key={file.id}
        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs max-w-sm hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-zinc-200/60 dark:bg-zinc-700/50 text-zinc-900 dark:text-zinc-100 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate" title={file.name}>
            {file.name}
          </div>
          <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {formatFileSize(file.size)}
          </div>
        </div>
        {file.data && (
          <a
            href={file.data}
            download={file.name}
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title={language === 'ar' ? 'تحميل الملف' : 'Download file'}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  };

  if (!isAI) {
    const imageAttachments = (message.attachments || []).filter(
      (a) => a.fileCategory === 'image'
    );
    const nonImageAttachments = (message.attachments || []).filter(
      (a) => a.fileCategory !== 'image'
    );
    const legacyImages = message.images || [];

    return (
      <div className="py-1.5 px-4 sm:px-6 w-full max-w-4xl mx-auto flex justify-start">
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 460,
            damping: 24,
            mass: 0.55,
          }}
          className="w-fit max-w-[85%] sm:max-w-[78%] space-y-2 flex flex-col items-start"
        >
          {nonImageAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-start w-full">
              {nonImageAttachments.map((file) => renderFileCard(file))}
            </div>
          )}

          {(imageAttachments.length > 0 || legacyImages.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-start w-full">
              {imageAttachments.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setPreviewImage(file.data)}
                  className="relative group/img cursor-pointer rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-black/5 dark:bg-white/5 shadow-2xs transition-transform hover:scale-[1.02]"
                >
                  <img
                    src={file.data}
                    alt={file.name}
                    referrerPolicy="no-referrer"
                    className="max-h-56 max-w-full sm:max-w-xs object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Eye className="w-5 h-5" />
                  </div>
                </div>
              ))}

              {legacyImages.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setPreviewImage(img)}
                  className="relative group/img cursor-pointer rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-black/5 dark:bg-white/5 shadow-2xs transition-transform hover:scale-[1.02]"
                >
                  <img
                    src={img}
                    alt={`Attached ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="max-h-56 max-w-full sm:max-w-xs object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Eye className="w-5 h-5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {message.content && (
            <div
              dir="auto"
              className="py-3 px-5 sm:px-6 rounded-2xl rounded-se-[6px] bg-white dark:bg-zinc-800/90 border border-zinc-200/90 dark:border-zinc-700/70 text-zinc-900 dark:text-zinc-100 text-[15px] leading-relaxed shadow-xs group relative text-start inline-block w-fit max-w-full"
            >
              {isEditing ? (
                <div className="space-y-1.5 min-w-[220px]">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full bg-transparent border-none outline-none ring-0 p-0 m-0 text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-100 resize-none focus:ring-0 focus:outline-none font-inherit"
                    rows={Math.max(1, editText.split('\n').length)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-2.5 py-0.5 rounded text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      {language === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-0.5 rounded text-[11px] font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 transition-opacity cursor-pointer"
                    >
                      {language === 'ar' ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words">
                    {message.content}
                  </div>

                  {/* Metadata footer: version switcher only */}
                  {message.versions && message.versions.length > 1 && (
                    <div className="flex items-center justify-end gap-3 mt-1.5 pt-1 text-[11px] text-zinc-400 select-none">
                      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200/60 dark:border-zinc-700/60">
                        <button
                          onClick={() => onSwitchVersion && onSwitchVersion(message.id, (message.activeVersionIndex || 0) - 1)}
                          disabled={(message.activeVersionIndex || 0) === 0}
                          className="p-0.5 rounded hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <span>{(message.activeVersionIndex || 0) + 1} / {message.versions.length}</span>
                        <button
                          onClick={() => onSwitchVersion && onSwitchVersion(message.id, (message.activeVersionIndex || 0) + 1)}
                          disabled={(message.activeVersionIndex || 0) >= message.versions.length - 1}
                          className="p-0.5 rounded hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit and Copy action icons on hover */}
                  <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1 end-1.5 gap-1.5 items-center bg-white/90 dark:bg-zinc-800/90 px-1 rounded">
                    <button
                      onClick={() => {
                        setEditText(message.content);
                        setIsEditing(true);
                      }}
                      className="text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-0.5 rounded transition-colors cursor-pointer"
                      title={language === 'ar' ? "تعديل الرسالة" : "Edit message"}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={handleCopy}
                      className="text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-0.5 rounded transition-colors cursor-pointer"
                      title={language === 'ar' ? "نسخ" : "Copy"}
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>

        {previewImage && (
          <div
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl max-h-[90vh] bg-zinc-900 rounded-2xl p-2 border border-white/10 shadow-2xl overflow-hidden flex flex-col items-center"
            >
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 end-3 p-1.5 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/90 transition-colors z-10 cursor-pointer"
                title={language === 'ar' ? "إغلاق" : "Close"}
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={previewImage}
                alt="Preview full"
                referrerPolicy="no-referrer"
                className="max-h-[82vh] max-w-full object-contain rounded-xl"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Assistant Response
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="py-3 sm:py-4 px-4 sm:px-6 w-full max-w-4xl mx-auto group min-w-0 overflow-hidden"
    >
      <div className="flex items-start gap-3 w-full min-w-0">
        <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center font-mono text-[9.5px] font-semibold shrink-0 mt-1 select-none">
          {(() => {
            const name = (displayModelName || modelInfo.name || '').toLowerCase();
            const prov = (modelInfo.provider || '').toLowerCase();
            if (name.includes('deepseek') || prov.includes('deepseek')) return 'DS';
            if (name.includes('gpt') || name.includes('openai') || prov.includes('openai')) return 'OA';
            if (name.includes('claude') || prov.includes('anthropic')) return 'CL';
            if (name.includes('qwen') || prov.includes('alibaba')) return 'QW';
            if (name.includes('llama') || prov.includes('meta')) return 'LL';
            if (name.includes('mistral')) return 'MS';
            if (name.includes('grok')) return 'GK';
            if (name.includes('gemini') || prov.includes('google')) return 'GM';
            if (prov.includes('custom')) return 'CS';
            if (prov.includes('ollama')) return 'OL';
            if (prov.includes('openrouter')) return 'OR';
            return 'AI';
          })()}
        </div>

        <div className="flex-1 min-w-0 max-w-full overflow-hidden">
          {/* Model header (No timestamp or version switcher here anymore) */}
          <div className="flex items-center justify-between gap-2 mb-2 select-none text-xs text-zinc-500 dark:text-zinc-400 flex-wrap w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                {displayModelName}
              </span>
              {modelInfo.provider === 'Ollama' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200/60 dark:border-zinc-700/60">
                  {language === 'ar' ? 'محلي (Ollama)' : 'Local (Ollama)'}
                </span>
              )}
              {modelInfo.provider === 'OpenRouter' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200/60 dark:border-zinc-700/60">
                  OpenRouter
                </span>
              )}
              {modelInfo.id?.startsWith('custom:') && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200/60 dark:border-zinc-700/60">
                  {language === 'ar' ? 'خادم مخصص' : 'Custom Server'}
                </span>
              )}
              {message.isDeepThinking && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-medium border border-indigo-200/80 dark:border-indigo-800/80">
                  <Atom className="w-2.5 h-2.5" />
                  <span>{language === 'ar' ? 'تفكير عميق' : 'Deep Thinking'}</span>
                </span>
              )}
            </div>
          </div>

          {message.searchMetadata && (
            <WebSearchIndicator
              searchMetadata={message.searchMetadata}
              language={language}
            />
          )}

          {(message.error || message.isError) ? (() => {
            const rawErrorStr = (message.rawError || message.content || message.text || '').toString();
            const is403Error = rawErrorStr.includes('403') || rawErrorStr.includes('Forbidden');
            const is402Error = rawErrorStr.includes('402') || rawErrorStr.includes('Payment Required') || rawErrorStr.includes('balance_units');
            const is401Error = rawErrorStr.includes('401') || rawErrorStr.includes('invalid_api_key') || rawErrorStr.includes('Unauthorized');
            const is404Error = rawErrorStr.includes('404') || rawErrorStr.includes('Not Found') || rawErrorStr.includes('not found');
            const is429Error = rawErrorStr.includes('429') || rawErrorStr.includes('Rate Limit') || rawErrorStr.includes('Too Many Requests');

            let displayErrorTitle = language === 'ar' ? 'مزود النموذج يواجه مشكلة مؤقتة (HTTP 5xx)' : 'The model provider experienced a temporary issue (HTTP 5xx)';
            if (is403Error) {
              displayErrorTitle = language === 'ar' ? 'الوصول محظور من مزود النموذج (HTTP 403 Forbidden)' : 'Access Forbidden by Model Provider (HTTP 403)';
            } else if (is402Error) {
              displayErrorTitle = language === 'ar' ? 'النموذج يتطلب اشتراكاً أو حساباً مدفوعاً (HTTP 402)' : 'Model requires subscription or payment (HTTP 402)';
            } else if (is401Error) {
              displayErrorTitle = language === 'ar' ? 'خطأ المصادقة أو مفتاح غير صالح (HTTP 401)' : 'Authentication or invalid key error (HTTP 401)';
            } else if (is404Error) {
              displayErrorTitle = language === 'ar' ? 'النموذج غير متوفر لدى المزود (HTTP 404 Not Found)' : 'Model not found on provider (HTTP 404)';
            } else if (is429Error) {
              displayErrorTitle = language === 'ar' ? 'تجاوز حد الاستخدام المؤقت (HTTP 429)' : 'Rate limit exceeded (HTTP 429)';
            }

            const displayErrorText = (message.content || message.text || '').trim() || (
              language === 'ar' ? 'تعذر إتمام الطلب بنجاح. يمكنك إعادة المحاولة أو تجربة نموذج آخر.' : 'Could not complete request. You can retry or try another model.'
            );

            // Clean raw error text to strip ugly HTML tags if returned by web proxy/Cloudflare
            const cleanRawDetails = (message.rawError || message.content || 'API Error')
              .toString()
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            return (
              <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="p-4 rounded-xl bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200 text-xs flex flex-col gap-3 min-w-0 max-w-full overflow-hidden shadow-xs">
                <div className="flex items-start gap-3 min-w-0">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                    <p className="font-semibold text-sm mb-1">
                      {displayErrorTitle}
                    </p>
                    <p className="text-xs leading-relaxed opacity-90 break-words">
                      {displayErrorText}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 justify-end">
                  {onOpenModelSelector && (
                    <button
                      onClick={onOpenModelSelector}
                      className="px-3 py-1.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                    >
                      {language === 'ar' ? 'تجربة نموذج آخر' : 'Try another model'}
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      onClick={onRegenerate}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                    </button>
                  )}
                </div>

                <div className="border-t border-red-200/60 dark:border-red-900/40 pt-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-[11px] font-medium text-red-700 dark:text-red-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{language === 'ar' ? (showDetails ? 'إخفاء التفاصيل' : 'عرض التفاصيل') : (showDetails ? 'Hide details' : 'Show details')}</span>
                  </button>
                  {showDetails && (
                    <div className="mt-2 p-2.5 rounded-lg bg-black/5 dark:bg-black/40 text-[11px] font-mono text-zinc-800 dark:text-zinc-300 overflow-x-auto max-h-36 break-all whitespace-pre-wrap">
                      {cleanRawDetails}
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="text-start min-w-0 max-w-full overflow-hidden">
              <FormattedMessage
                content={message.content}
                isStreaming={message.isStreaming}
                onOpenArtifact={onOpenArtifact}
                language={language}
              />
            </div>
          )}

          {!message.isStreaming && !(message.error || message.isError) && message.content && (
            <div className="flex items-center justify-between gap-3 mt-2 opacity-60 group-hover:opacity-100 transition-opacity flex-wrap text-xs text-zinc-500 w-full">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                  title={language === 'ar' ? "نسخ الإجابة" : "Copy response"}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    title={language === 'ar' ? "إعادة التوليد" : "Regenerate"}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Timestamp and version switcher at the bottom beside action icons */}
              <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                <span>{formatTimeAgo(message.timestamp, language)}</span>
                {message.versions && message.versions.length > 1 && (
                  <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200/60 dark:border-zinc-700/60">
                    <button
                      onClick={() => onSwitchVersion && onSwitchVersion(message.id, (message.activeVersionIndex || 0) - 1)}
                      disabled={(message.activeVersionIndex || 0) === 0}
                      className="p-0.5 rounded hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span>{(message.activeVersionIndex || 0) + 1} / {message.versions.length}</span>
                    <button
                      onClick={() => onSwitchVersion && onSwitchVersion(message.id, (message.activeVersionIndex || 0) + 1)}
                      disabled={(message.activeVersionIndex || 0) >= message.versions.length - 1}
                      className="p-0.5 rounded hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isStreaming === next.message.isStreaming &&
    prev.message.activeVersionIndex === next.message.activeVersionIndex &&
    prev.message.versions?.length === next.message.versions?.length &&
    prev.language === next.language &&
    Boolean(prev.onRegenerate) === Boolean(next.onRegenerate) &&
    prev.message.searchMetadata?.isSearching === next.message.searchMetadata?.isSearching &&
    prev.message.searchMetadata?.sources?.length === next.message.searchMetadata?.sources?.length
  );
});
