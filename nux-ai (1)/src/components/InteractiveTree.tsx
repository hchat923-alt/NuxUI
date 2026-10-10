
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getStoredLanguage } from '../utils/i18n';

export interface TreeNode {
  label: string;
  children?: TreeNode[];
  description?: string;
}

export interface TreeConfig {
  title?: string;
  root: TreeNode;
}

interface InteractiveTreeProps {
  rawJson: string;
}

const parseNodeLabel = (rawLabel: string, rawDesc?: string) => {
  let title = (rawLabel || 'Node').trim();
  let desc = (rawDesc || '').trim();

  if (!desc && title.includes(':')) {
    const parts = title.split(':');
    title = parts[0].trim();
    desc = parts.slice(1).join(':').trim();
  } else if (!desc && title.includes(' - ')) {
    const parts = title.split(' - ');
    title = parts[0].trim();
    desc = parts.slice(1).join(' - ').trim();
  }

  return { title, desc };
};

const getNodeStyle = (depth: number) => {
  if (depth === 0) {
    return 'bg-[#18181B] text-white dark:bg-[#F4F4F5] dark:text-[#18181B] font-semibold text-xs sm:text-sm px-5 py-2 rounded-xl border border-[#27272A] dark:border-white/30 shadow-md w-[240px] sm:w-[300px]';
  }

  if (depth === 1) {
    return 'bg-white text-[#18181B] dark:bg-[#27272A] dark:text-[#F4F4F5] font-medium text-xs sm:text-[13px] px-4 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-400 shadow-sm transition-all w-[210px] sm:w-[260px]';
  }

  return 'bg-white text-zinc-800 dark:bg-[#1C1C20] dark:text-zinc-200 font-normal text-xs px-3.5 py-1.5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-sm transition-all w-[190px] sm:w-[240px]';
};

interface TopDownNodeProps {
  node: TreeNode;
  depth: number;
  isEn: boolean;
  collapsedState: Record<string, boolean>;
  onToggle: (path: string) => void;
  currentPath: string;
}

const TopDownNode: React.FC<TopDownNodeProps> = ({
  node,
  depth,
  isEn,
  collapsedState,
  onToggle,
  currentPath,
}) => {
  const hasChildren =
    Array.isArray(node.children) && node.children.length > 0;

  const isCollapsed = !!collapsedState[currentPath];
  const nodeStyle = getNodeStyle(depth);
  const { title, desc } = parseNodeLabel(
    node.label,
    node.description
  );

  return (
    <div className="relative flex w-max shrink-0 flex-col items-center font-sans py-1">
      {/* Node card */}
      <div className="relative flex flex-col items-center group">
        <div
          onClick={() => hasChildren && onToggle(currentPath)}
          role={hasChildren ? 'button' : undefined}
          tabIndex={hasChildren ? 0 : undefined}
          onKeyDown={(event) => {
            if (
              hasChildren &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault();
              onToggle(currentPath);
            }
          }}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          className={`flex flex-col items-center justify-center select-none text-center ${nodeStyle} ${
            hasChildren
              ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]'
              : ''
          }`}
          dir="auto"
        >
          <div className="flex items-center justify-center gap-1.5 w-full">
            <span className="leading-snug break-words font-medium">
              {title}
            </span>

            {hasChildren && (
              <span className="p-0.5 rounded text-current opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
                {isCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </span>
            )}
          </div>

          {desc && (
            <p
              className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed break-words text-center border-t border-zinc-100 dark:border-zinc-800/80 pt-1 w-full"
              dir="auto"
            >
              {desc}
            </p>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="flex w-max flex-col items-center">
          {/* Parent vertical connector */}
          <div className="w-px h-4 sm:h-5 bg-zinc-300 dark:bg-zinc-700 shrink-0" />

          {/* Compact child branches */}
          <div className="relative flex w-max items-start">
            {node.children!.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === node.children!.length - 1;
              const onlyOne = node.children!.length === 1;

              return (
                <div
                  key={`${currentPath}-${idx}`}
                  className="relative flex flex-none flex-col items-center px-1 sm:px-2"
                >
                  {/* Horizontal connector */}
                  {!onlyOne && (
                    <div
                      aria-hidden="true"
                      className={`absolute top-0 h-px bg-zinc-300 dark:bg-zinc-700 pointer-events-none ${
                        isFirst
                          ? isEn
                            ? 'left-1/2 right-0'
                            : 'left-0 right-1/2'
                          : isLast
                          ? isEn
                            ? 'left-0 right-1/2'
                            : 'left-1/2 right-0'
                          : 'left-0 right-0'
                      }`}
                    />
                  )}

                  {/* Child vertical connector */}
                  <div className="w-px h-4 sm:h-5 bg-zinc-300 dark:bg-zinc-700 shrink-0" />

                  <TopDownNode
                    node={child}
                    depth={depth + 1}
                    isEn={isEn}
                    collapsedState={collapsedState}
                    onToggle={onToggle}
                    currentPath={`${currentPath}-${idx}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const InteractiveTree: React.FC<InteractiveTreeProps> = ({
  rawJson,
}) => {
  const [collapsedState, setCollapsedState] = useState<
    Record<string, boolean>
  >({});
  const [isModalOpen, setIsModalOpen] = useState(false);

  const appLang = getStoredLanguage();
  const isEn = appLang === 'en';

  let config: TreeConfig | null = null;

  try {
    const parsed = JSON.parse(rawJson);

    if (
      parsed &&
      parsed.root &&
      typeof parsed.root === 'object' &&
      !Array.isArray(parsed.root)
    ) {
      config = parsed as TreeConfig;
    } else if (
      parsed &&
      !Array.isArray(parsed) &&
      (parsed.label || parsed.title)
    ) {
      config = {
        title: parsed.title || parsed.label,
        root: {
          label:
            parsed.root?.label ||
            parsed.label ||
            parsed.title ||
            'Central Topic',
          children:
            parsed.children || parsed.root?.children || [],
          description:
            parsed.description || parsed.root?.description,
        },
      };
    } else if (Array.isArray(parsed) && parsed.length > 0) {
      config = {
        title: 'Tree Diagram',
        root: {
          label: 'Central Topic',
          children: parsed,
        },
      };
    }
  } catch {
    return (
      <div className="p-2.5 my-2 text-xs text-red-500 font-sans rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
        Invalid Tree JSON structure
      </div>
    );
  }

  if (!config?.root) {
    return null;
  }

  const handleToggle = (path: string) => {
    setCollapsedState((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const titleText =
    config.title ||
    (isEn
      ? 'Mind Map & Concept Tree'
      : 'خريطة المفاهيم والتصنيف الهرمي');

  // Same root path in inline and fullscreen views.
  const renderTree = () => (
    <div className="inline-flex w-max min-w-full min-h-max justify-center items-start box-border p-4 sm:p-6">
      <TopDownNode
        node={config!.root}
        depth={0}
        isEn={isEn}
        collapsedState={collapsedState}
        onToggle={handleToggle}
        currentPath="root"
      />
    </div>
  );

  return (
    <>
      {/* Inline card */}
      <div
        className="group relative my-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 shadow-sm flex flex-col w-full min-w-0 font-sans transition-all select-none"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100 min-w-0">
            <span className="truncate text-xs">{titleText}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="shrink-0 p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer bg-transparent border-0 shadow-none"
            title={isEn ? 'Full view' : 'عرض كامل'}
            aria-label={isEn ? 'Full view' : 'عرض كامل'}
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable inline viewport */}
        <div
          className="relative block w-full min-w-0 max-h-[560px] min-h-[300px] overflow-auto overscroll-contain"
          dir="ltr"
          tabIndex={0}
          role="region"
          aria-label={isEn ? 'Interactive tree' : 'الخطاطة التفاعلية'}
        >
          {renderTree()}
        </div>
      </div>

      {/* Fullscreen modal */}
      {isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 font-sans"
            dir="ltr"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsModalOpen(false);
              }
            }}
          >
            <div className="relative w-full max-w-5xl h-[85vh] min-h-0 flex flex-col rounded-2xl bg-[#F7F7F8] dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
              <div
                className="flex items-center justify-between gap-3 shrink-0 px-5 py-3.5 bg-white dark:bg-[#1B1B1F] border-b border-zinc-200 dark:border-zinc-800"
                dir={isEn ? 'ltr' : 'rtl'}
              >
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {titleText}
                </h3>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={isEn ? 'Close' : 'إغلاق'}
                  aria-label={isEn ? 'Close' : 'إغلاق'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div
                className="relative flex-1 min-h-0 min-w-0 overflow-auto overscroll-contain bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px]"
                dir="ltr"
                tabIndex={0}
                role="region"
                aria-label={isEn ? 'Full tree view' : 'عرض الخطاطة كاملة'}
              >
                {renderTree()}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default InteractiveTree;