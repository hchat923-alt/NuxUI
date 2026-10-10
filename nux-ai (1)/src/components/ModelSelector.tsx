import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Check,
  Search,
  Sparkles,
  Server,
  X,
  Loader2,
  Cpu,
  Folder,
  FolderPlus,
  SlidersHorizontal,
} from 'lucide-react';
import { AIModel } from '../types';
import { getStoredCustomModels } from '../services/apiKeys';
import { prettifyModelSlug } from '../data/models';
import {
  UserModelGroup,
  getUserModelGroups,
} from '../services/userModelGroups';

interface ModelSelectorProps {
  currentModel: AIModel;
  onSelectModel: (model: AIModel) => void;
  compact?: boolean;
  dropDirection?: 'up' | 'down';
  dropAlign?: 'auto' | 'start' | 'end' | 'center' | 'left' | 'right';
  language?: 'ar' | 'en';
  isImageMode?: boolean;
}

// Strict sanitizer to prevent any URL, Link, or server address from appearing as a description
export function sanitizeModelDescription(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (
    /(https?:\/\/|www\.|\.com|\.org|\.ai|\.io|\.net|\.xyz|\.app|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|:\d{2,5}|\/api\/|\/v1\/)/i.test(
      trimmed
    )
  ) {
    return '';
  }
  if (/^(server|خادم|خادم مخصص|custom server|url|link|http):?$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

// Clean helper to get a friendly name without URLs
function getCleanGroupName(rawName?: string, baseUrl?: string, language: 'ar' | 'en' = 'ar'): string {
  const raw = (rawName || '').trim();
  if (!raw || raw === 'Custom Server' || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('Server:')) {
    const urlToParse = baseUrl || (raw.startsWith('http') ? raw : raw.replace(/^Server:\s*/i, ''));
    try {
      const u = new URL(urlToParse);
      const host = u.hostname.replace(/^www\./, '');
      if (host.includes('trycloudflare.com')) {
        const sub = host.split('.')[0] || 'Cloudflare';
        return language === 'ar' ? `خادم Cloudflare (${sub})` : `Cloudflare (${sub})`;
      }
      if (host === 'localhost' || host === '127.0.0.1') {
        return language === 'ar' ? 'خادم محلي (Localhost)' : 'Localhost Server';
      }
      return host;
    } catch (_) {
      return language === 'ar' ? 'خادم مخصص' : 'Custom Server';
    }
  }
  return raw.replace(/^Server:\s*/i, '').trim();
}

// Provider Icon Renderer
function ProviderIcon({
  provider,
  modelId,
  className = 'w-4 h-4',
}: {
  provider?: string;
  modelId?: string;
  className?: string;
}) {
  const p = (provider || '').toLowerCase();
  const id = (modelId || '').toLowerCase();

  // OpenAI
  if (p.includes('openai') || id.includes('gpt') || id.includes('openai')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 8.783a4.476 4.476 0 0 1 2.342-1.974V12.4a.79.79 0 0 0 .391.682l5.84 3.37-2.02 1.167a.08.08 0 0 1-.068.01L3.988 14.8A4.505 4.505 0 0 1 2.34 8.783zm16.597 3.845-5.843-3.37 2.02-1.168a.08.08 0 0 1 .068-.01l4.838 2.793a4.497 4.497 0 0 1-.692 8.08V13.31a.79.79 0 0 0-.391-.682zm2.01-4.324l-.142-.085-4.78-2.759a.775.775 0 0 0-.78 0L9.402 8.83V6.498a.08.08 0 0 1 .033-.062l4.84-2.793a4.497 4.497 0 0 1 6.672 4.636zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V5.602a4.5 4.5 0 0 1 7.37-3.454l-.142.08-4.78 2.76a.795.795 0 0 0-.39.68v6.737zm1.187-2.792l2.765-1.6 2.766 1.6v3.193l-2.766 1.597-2.765-1.597z" />
      </svg>
    );
  }

  // Anthropic / Claude
  if (p.includes('anthropic') || id.includes('claude')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 2.5L24 21.5h-5.267l-1.393-4.145H9.843L8.45 21.5H3.183L9.71 2.5h7.762zm-3.088 11.233l-2.316-6.903-2.316 6.903h4.632z" />
      </svg>
    );
  }

  // Google Gemini
  if (p.includes('google') || p.includes('gemini') || id.includes('gemini')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.627 12 12 0-6.627 5.627-12 12-12-6.627 0-12-5.627-12-12z" />
      </svg>
    );
  }

  // DeepSeek
  if (p.includes('deepseek') || id.includes('deepseek')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z" />
      </svg>
    );
  }

  // Meta / Llama
  if (p.includes('meta') || id.includes('llama')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4.5c-4.418 0-8 3.358-8 7.5 0 2.22 1.042 4.22 2.705 5.582L6 21l3.77-1.257C10.457 19.912 11.214 20 12 20c4.418 0 8-3.358 8-7.5s-3.582-7.5-8-7.5z" />
      </svg>
    );
  }

  // Mistral
  if (p.includes('mistral') || id.includes('mistral')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 4h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4zM3 11h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4zM3 18h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4z" />
      </svg>
    );
  }

  // Ollama / Local
  if (p.includes('ollama') || p.includes('local')) {
    return <Cpu className={className} />;
  }

  // Custom
  if (id.startsWith('custom:') || p.includes('custom')) {
    return <Server className={className} />;
  }

  return <Sparkles className={className} />;
}

// Clean helper to format model name
export function getCleanedModelName(name: string, id?: string): string {
  let raw = name || '';
  if (id?.startsWith('custom:')) {
    return raw.trim() || 'Custom Model';
  }
  if (raw.toLowerCase().includes('openai-fast') || id?.includes('openai-fast')) {
    return 'GPT-4o Mini';
  }
  if (raw.includes('-') && !raw.includes(' ')) {
    raw = prettifyModelSlug(raw);
  }
  let cleaned = raw;
  cleaned = cleaned.replace(/\s*\(Custom Server\)/gi, '');
  cleaned = cleaned.replace(/\s*\(Reasoning\)/gi, '');
  cleaned = cleaned.replace(/\s*\(Anthropic\)/gi, '');
  cleaned = cleaned.replace(/\s*\b(medium|Medium|moduim)\b/gi, '');
  return cleaned.trim() || 'GPT-4o Mini';
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  onSelectModel,
  dropDirection = 'down',
  language = 'ar',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pollinationsModels, setPollinationsModels] = useState<AIModel[]>([]);
  const [customModels, setCustomModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);

  // User-created Model Groups state
  const [userGroups, setUserGroups] = useState<UserModelGroup[]>(() => getUserModelGroups());

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left?: number; right?: number; width?: number } | null>(null);

  // Load user groups from localStorage
  const loadUserGroups = useCallback(() => {
    const list = getUserModelGroups();
    setUserGroups(list);
  }, []);

  // Load custom models without any URLs in descriptions
  const loadCustomModels = useCallback(() => {
    const raw = getStoredCustomModels();
    const validRaw = raw.filter((cm) => {
      if (!cm.name) return false;
      return !/^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(cm.name);
    });
    const mapped: AIModel[] = validRaw.map((cm) => {
      const gName = getCleanGroupName(cm.groupName || cm.provider, cm.baseUrl, language);
      return {
        id: cm.id,
        name: cm.name,
        provider: gName,
        groupName: gName,
        description: '',
        descriptionEn: '',
        badge: 'Custom',
        badgeEn: 'Custom',
        iconType: 'openai' as const,
      };
    });
    setCustomModels(mapped);
  }, [language]);

  // Fetch dynamic models on mount
  useEffect(() => {
    async function fetchModels() {
      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const res = await fetch(`${baseUrl}/api/pollinations/models`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Clean any potential URLs from descriptions
            const cleaned = data.map((m: AIModel) => ({
              ...m,
              description: sanitizeModelDescription(m.description),
              descriptionEn: sanitizeModelDescription(m.descriptionEn),
            }));
            setPollinationsModels(cleaned);
            if (!currentModel && cleaned.length > 0) {
              onSelectModel(cleaned[0]);
            }
          }
        }
      } catch (err) {
        // Non-fatal: silent fallback
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
    loadCustomModels();
    loadUserGroups();

    const handleCustomUpdate = () => loadCustomModels();
    const handleGroupsUpdate = () => loadUserGroups();

    window.addEventListener('custom-models-updated', handleCustomUpdate);
    window.addEventListener('user-model-groups-updated', handleGroupsUpdate);
    return () => {
      window.removeEventListener('custom-models-updated', handleCustomUpdate);
      window.removeEventListener('user-model-groups-updated', handleGroupsUpdate);
    };
  }, [loadCustomModels, loadUserGroups]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownWidth = Math.min(390, window.innerWidth - 24);

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldDropUp = dropDirection === 'up' || (spaceBelow < 350 && spaceAbove > spaceBelow);

    const newCoords: { top?: number; bottom?: number; left?: number; right?: number; width: number } = {
      width: dropdownWidth,
    };

    if (shouldDropUp) {
      newCoords.bottom = Math.round(window.innerHeight - rect.top + 8);
    } else {
      newCoords.top = Math.round(rect.bottom + 8);
    }

    const isNearLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
    if (isNearLeft) {
      newCoords.left = Math.round(Math.max(10, Math.min(rect.left, window.innerWidth - dropdownWidth - 10)));
    } else {
      const rightDist = window.innerWidth - rect.right;
      newCoords.right = Math.round(Math.max(10, Math.min(rightDist, window.innerWidth - dropdownWidth - 10)));
    }

    setCoords(newCoords);
  }, [dropDirection]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    if (isOpen) {
      updatePosition();
      setTimeout(() => searchInputRef.current?.focus(), 50);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, updatePosition]);

  // Combine models (custom + dynamic API)
  const allAvailableModels = useMemo(() => {
    return [...customModels, ...pollinationsModels];
  }, [customModels, pollinationsModels]);

  // Combine user created groups and user-defined custom server groups
  const displayGroups = useMemo(() => {
    const map = new Map<string, UserModelGroup>();
    userGroups.forEach((g) => {
      map.set(g.id, g);
    });

    // Also ensure any custom server group defined by the user is present as a group tab
    customModels.forEach((cm) => {
      const gName = (cm.groupName || cm.provider || '').trim();
      if (gName && gName !== 'Custom Server' && gName !== 'خادم مخصص') {
        const found = Array.from(map.values()).find((g) => g.name.toLowerCase() === gName.toLowerCase());
        if (!found) {
          const matchingModelIds = customModels
            .filter((m) => (m.groupName || m.provider) === gName)
            .map((m) => m.id);
          const autoId = `group_srv_${gName}`;
          map.set(autoId, {
            id: autoId,
            name: gName,
            modelIds: matchingModelIds,
            createdAt: 0,
          });
        }
      }
    });

    return Array.from(map.values());
  }, [userGroups, customModels]);

  // Filter models by search query
  const filteredModels = useMemo(() => {
    let list = allAvailableModels;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => {
        const name = (m.name || '').toLowerCase();
        const provider = (m.provider || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        return name.includes(q) || provider.includes(q) || desc.includes(q);
      });
    }

    return list;
  }, [allAvailableModels, searchQuery]);

  const renderDropdown = () => {
    if (!isOpen || !coords) return null;

    const dropdownStyle: React.CSSProperties = {
      position: 'fixed',
      width: `${coords.width}px`,
      zIndex: 9999,
      maxHeight: '430px',
      ...(coords.top !== undefined ? { top: `${coords.top}px` } : { bottom: `${coords.bottom}px` }),
      ...(coords.left !== undefined ? { left: `${coords.left}px` } : { right: `${coords.right}px` }),
    };

    return createPortal(
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#F5F5F7] dark:bg-[#18181b] shadow-xl dark:shadow-2xl flex flex-col overflow-hidden font-sans ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Header with Search */}
        <div className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/60">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute start-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={language === 'ar' ? 'بحث عن نموذج...' : 'Search models...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-8 pe-8 py-1.5 text-xs rounded-lg bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors shadow-2xs font-normal"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>



        {/* Model List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-[260px] custom-scrollbar">
          {loading && pollinationsModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="w-4 h-4 text-zinc-600 dark:text-zinc-300 animate-spin" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {language === 'ar' ? 'جاري تحميل النماذج...' : 'Loading models...'}
              </p>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {language === 'ar' ? 'لم يتم العثور على أي نموذج' : 'No models found'}
              </p>
            </div>
          ) : (
            filteredModels.map((m) => {
              const isSelected = m.id === currentModel.id;
              const isCustom = m.id.startsWith('custom:');
              const cleanName = getCleanedModelName(m.name, m.id);
              const sanitizedDesc = sanitizeModelDescription(language === 'ar' ? m.description : m.descriptionEn || m.description);

              // Check if model belongs to any user groups or custom server groups
              const modelUserGroups = displayGroups.filter(
                (g) =>
                  g.modelIds.includes(m.id) ||
                  (m.groupName && m.groupName.toLowerCase() === g.name.toLowerCase())
              );

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(m);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full group text-start px-2.5 py-2 rounded-lg flex items-center justify-between gap-2.5 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-zinc-200/80 dark:bg-zinc-800/90 border-zinc-300/80 dark:border-zinc-700 shadow-2xs font-medium'
                      : 'border-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Provider Icon */}
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-600'
                          : 'bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700/60 group-hover:border-zinc-300'
                      }`}
                    >
                      <ProviderIcon provider={m.provider} modelId={m.id} className="w-3.5 h-3.5" />
                    </div>

                    {/* Model Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {cleanName}
                        </span>

                        {isCustom && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600 shrink-0">
                            {language === 'ar' ? 'مخصص' : 'Custom'}
                          </span>
                        )}

                        {/* Display User Group tags if assigned */}
                        {modelUserGroups.map((g) => (
                          <span
                            key={g.id}
                            className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 border border-zinc-300/60 dark:border-zinc-600/60 shrink-0"
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>

                      {sanitizedDesc && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-normal font-normal mt-0.5">
                          {sanitizedDesc}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Selected Checkmark */}
                  <div className="shrink-0 flex items-center ps-1">
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-900 shadow-xs">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/50 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            {language === 'ar'
              ? `${filteredModels.length} نموذج`
              : `${filteredModels.length} models`}
          </span>
        </div>
      </div>,
      document.body
    );
  };

  const cleanedName = getCleanedModelName(currentModel.name, currentModel.id);
  const isCustomModel = currentModel.id.startsWith('custom:');

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white bg-zinc-200/60 hover:bg-zinc-200 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 transition-all select-none cursor-pointer outline-none focus:outline-none shadow-2xs"
        title={language === 'ar' ? 'تغيير النموذج' : 'Change model'}
      >
        <ProviderIcon provider={currentModel.provider} modelId={currentModel.id} className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
        <span className="font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-black dark:group-hover:text-white transition-colors truncate max-w-[130px]">
          {cleanedName}
        </span>
        {isCustomModel && (
          <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-normal">
            {language === 'ar' ? 'مخصص' : 'Custom'}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {renderDropdown()}
    </>
  );
};

export default ModelSelector;
