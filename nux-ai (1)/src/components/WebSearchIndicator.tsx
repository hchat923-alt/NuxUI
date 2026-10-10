import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Globe, ExternalLink } from 'lucide-react';
import { SearchMetadata } from '../types';

interface WebSearchIndicatorProps {
  searchMetadata?: SearchMetadata;
  language?: 'ar' | 'en';
}

export const WebSearchIndicator: React.FC<WebSearchIndicatorProps> = ({
  searchMetadata,
  language = 'ar',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!searchMetadata) return null;

  const { isSearching, query, sources = [] } = searchMetadata;
  const hasSources = sources.length > 0;

  // If search finished with 0 sources and not actively searching, don't clutter the UI
  if (!isSearching && !hasSources) return null;

  const headerLabel = isSearching
    ? language === 'ar'
      ? 'جاري البحث في الويب...'
      : 'Searching the web...'
    : language === 'ar'
    ? `البحث في الويب (${sources.length} مواقع)`
    : sources.length > 0
    ? `Searched ${sources.length} site${sources.length > 1 ? 's' : ''}`
    : 'Searching the web';

  return (
    <div className="mb-3 select-none" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Search Header Bar matching user reference */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer group"
      >
        {/* Accent Dot */}
        <span
          className={`w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-100 shrink-0 ${
            isSearching ? 'animate-pulse scale-110' : ''
          }`}
        />

        <span className="font-medium text-xs tracking-tight">
          {headerLabel}
        </span>

        {/* Chevron Arrow */}
        <ChevronRight
          className={`w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${
            isExpanded ? (language === 'ar' ? '-rotate-90' : 'rotate-90') : ''
          }`}
        />
      </button>

      {/* Expandable Websites & Sources View */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden mt-1.5"
          >
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs text-zinc-800 dark:text-zinc-200">
              {query && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 pb-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span>
                    {language === 'ar' ? 'كلمات البحث:' : 'Search query:'}{' '}
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">
                      "{query}"
                    </span>
                  </span>
                  {isSearching && (
                    <span className="animate-pulse text-zinc-900 dark:text-zinc-100 font-medium">
                      {language === 'ar' ? 'جاري الفحص...' : 'Scanning...'}
                    </span>
                  )}
                </div>
              )}

              {sources.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {sources.map((src, index) => {
                    const isSafe = /^https?:\/\//i.test(src.url || '');
                    return (
                      <a
                        key={index}
                        href={isSafe ? src.url : '#'}
                        target={isSafe ? "_blank" : undefined}
                        rel={isSafe ? "noopener noreferrer" : undefined}
                        onClick={isSafe ? undefined : (e) => e.preventDefault()}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all group/item text-start no-underline"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Globe Icon */}
                          <Globe className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300 shrink-0" />

                          {/* Website / Domain */}
                          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                            {src.domain || src.url}
                          </span>

                          {/* Source Title */}
                          <span className="font-medium text-xs text-zinc-900 dark:text-zinc-100 truncate group-hover/item:text-black dark:group-hover/item:text-white transition-colors">
                            {src.title}
                          </span>
                        </div>

                        {/* External Link Icon */}
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-100 transition-colors shrink-0" />
                      </a>
                    );
                  })}
                </div>
              ) : isSearching ? (
                <div className="py-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  {language === 'ar'
                    ? 'جاري استعراض محركات البحث وجلب المصادر...'
                    : 'Querying search engines and retrieving sources...'}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
