import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { getStoredLanguage } from '../utils/i18n';

interface DiagramNode {
  id?: string;
  title?: string;
  label?: string;
  name?: string;
  text?: string;
  subtitle?: string;
  subTitle?: string;
  desc?: string;
  caption?: string;
  description?: string;
  summary?: string;
  details?: string[];
  badge?: string;
}

interface DiagramConfig {
  title?: string;
  description?: string;
  nodes: DiagramNode[];
}

export const InteractiveDiagram: React.FC<{ rawJson: string }> = ({ rawJson }) => {
  const isEn = getStoredLanguage() === 'en';
  let config: DiagramConfig | null = null;
  try {
    let clean = rawJson.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
    }
    config = JSON.parse(clean);
  } catch (e) {
    try {
      const match = /\{[\s\S]*\}/.exec(rawJson);
      if (match) {
        config = JSON.parse(match[0]);
      }
    } catch {
      config = null;
    }
  }

  const nodes = config && Array.isArray(config.nodes) ? config.nodes : [];

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (nodes.length > 0) {
      nodes.forEach((n, idx) => {
        const idKey = n.id || `node-${idx}`;
        if (idx === 0) initial[idKey] = true;
      });
    }
    return initial;
  });

  if (!config || !config.nodes || !Array.isArray(config.nodes)) {
    return (
      <div className="my-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap">
        {rawJson}
      </div>
    );
  }

  const toggleNode = (idKey: string) => {
    setExpandedIds(prev => ({ ...prev, [idKey]: !prev[idKey] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    config?.nodes.forEach((n, idx) => {
      next[n.id || `node-${idx}`] = true;
    });
    setExpandedIds(next);
  };

  const collapseAll = () => {
    setExpandedIds({});
  };

  const allExpanded = config.nodes.length > 0 && config.nodes.every((n, idx) => expandedIds[n.id || `node-${idx}`]);

  return (
    <div className="group relative my-4 w-full max-w-2xl mx-auto rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 shadow-sm p-4 sm:p-5 font-sans select-none overflow-x-auto" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Title and Action Header */}
      <div className="px-2 py-1 mb-3 flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-zinc-400 shrink-0" />
          <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 truncate" dir="auto">
            {config.title || (isEn ? 'Process Steps' : 'خطوات ومراحل العملية')}
          </span>
        </div>

        {/* Plain action icons (no rounded boxes or pills) */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 transition-colors cursor-pointer text-[11px] flex items-center gap-1"
            title={allExpanded ? (isEn ? 'Collapse all' : 'طي الكل') : (isEn ? 'Expand all' : 'توسيع الكل')}
          >
            {allExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Connected Vertical Timeline Pipeline */}
      <div className="relative ps-7 sm:ps-9 pe-2 space-y-3 pt-1">
        {/* Continuous Timeline Connecting Vertical Line */}
        <div className="absolute top-3 bottom-4 start-[11px] sm:start-[13px] w-[2px] bg-gradient-to-b from-zinc-300 via-zinc-200 to-zinc-300 dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-700" />

        {config.nodes.map((node, index) => {
          const nodeId = node.id || `node-${index}`;
          const isExpanded = !!expandedIds[nodeId];
          const nodeTitle = node.title || node.label || node.name || node.text || (isEn ? `Step ${index + 1}` : `الخطوة ${index + 1}`);
          const nodeSubtitle = node.subtitle || node.subTitle || node.desc || node.caption;
          const nodeDescription = node.description || node.summary || (node.text && node.text !== nodeTitle ? node.text : undefined);
          const isLast = index === config.nodes.length - 1;

          return (
            <div key={nodeId} className="relative group/step">
              {/* Timeline Marker Node (aligned on connecting line) */}
              <div
                onClick={() => toggleNode(nodeId)}
                className={`absolute -start-[23px] sm:-start-[27px] top-3.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold font-mono transition-all cursor-pointer z-10 ${
                  isExpanded
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 ring-4 ring-zinc-100 dark:ring-zinc-900 shadow-xs scale-105'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 ring-4 ring-white dark:ring-zinc-950 hover:scale-105'
                }`}
              >
                {index + 1}
              </div>

              {/* Step Card Content */}
              <div
                onClick={() => toggleNode(nodeId)}
                className={`w-full text-start cursor-pointer rounded-xl border transition-all duration-150 overflow-hidden ${
                  isExpanded
                    ? 'bg-zinc-50/90 dark:bg-zinc-900/80 border-zinc-300 dark:border-zinc-700 shadow-xs'
                    : 'bg-zinc-100/60 dark:bg-zinc-900/40 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/90 dark:hover:bg-zinc-900/60'
                }`}
              >
                {/* Step Header */}
                <div className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug whitespace-normal break-words" dir="auto">
                      {nodeTitle}
                    </h4>
                    {nodeSubtitle && nodeSubtitle.trim() ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 whitespace-normal break-words leading-relaxed" dir="auto">
                        {nodeSubtitle.trim()}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {node.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
                        {node.badge}
                      </span>
                    )}
                    <div className="text-zinc-400 dark:text-zinc-500">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                </div>

                {/* Step Expanded Content */}
                {isExpanded && ((nodeDescription && nodeDescription.trim()) || (node.details && node.details.length > 0)) ? (
                  <div className="px-3.5 pb-3 pt-1 border-t border-zinc-200/70 dark:border-zinc-800/70 text-start" dir="auto">
                    {nodeDescription && nodeDescription.trim() ? (
                      <p className="text-[11.5px] text-zinc-700 dark:text-zinc-300 mb-2 leading-relaxed whitespace-normal break-words">
                        {nodeDescription.trim()}
                      </p>
                    ) : null}
                    {node.details && node.details.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {node.details.map((detail, dIdx) => (
                          <div key={dIdx} className="flex items-start gap-2 text-[12px] text-zinc-600 dark:text-zinc-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-zinc-800 dark:text-zinc-200 shrink-0 mt-0.5" />
                            <span className="leading-relaxed whitespace-normal break-words">{detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

