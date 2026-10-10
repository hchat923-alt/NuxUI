import React, { useState, useEffect, useMemo } from 'react';
import {
  Sliders,
  Sun,
  Moon,
  Globe,
  Key,
  Download,
  Upload,
  Trash2,
  Check,
  ShieldCheck,
  X,
  Server,
  Cpu,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Sparkles,
  Folder,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getStoredApiKeys, saveStoredApiKeys, UserApiKeys, CustomModel, getStoredCustomModels, saveStoredCustomModels, getAutoFallbackEnabled, setAutoFallbackEnabled } from '../services/apiKeys';
import { syncServerGroup, getUserModelGroups, updateUserModelGroup, deleteUserModelGroup, saveUserModelGroups } from '../services/userModelGroups';
import { Language, translations } from '../utils/i18n';
import { ChatSession } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSetTheme?: (theme: 'light' | 'dark') => void;
  sessions?: ChatSession[];
  onClearAllSessions?: () => void;
  onExportData?: () => void;
  onImportData?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

type TabType = 'general' | 'api' | 'backup';

// Helper to determine the group name for a custom model
function getModelGroupName(cm: CustomModel, language: Language = 'ar'): string {
  const g = (cm.groupName || '').trim();
  if (g && g !== 'Custom Server' && g !== 'خادم مخصص' && !g.startsWith('http://') && !g.startsWith('https://')) {
    return g;
  }
  const p = (cm.provider || '').trim();
  if (p && p !== 'Custom Server' && p !== 'خادم مخصص' && !p.startsWith('http://') && !p.startsWith('https://')) {
    return p;
  }
  if (cm.baseUrl) {
    try {
      const u = new URL(cm.baseUrl);
      const host = u.hostname.replace(/^www\./, '');
      if (host.includes('unorouter.com')) return 'Unorouter';
      if (host.includes('trycloudflare.com')) {
        const sub = host.split('.')[0] || 'Cloudflare';
        return `Cloudflare (${sub})`;
      }
      if (host === 'localhost' || host === '127.0.0.1') {
        return language === 'ar' ? 'خادم محلي' : 'Localhost';
      }
      return host;
    } catch (_) {}
  }
  return language === 'ar' ? 'نماذج مخصصة' : 'Custom Models';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  onSelectLanguage,
  theme,
  onToggleTheme,
  onSetTheme,
  sessions = [],
  onClearAllSessions,
  onExportData,
  onImportData,
}) => {
  const t = translations[language];
  const isRtl = language === 'ar';

  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [keys, setKeys] = useState<UserApiKeys>({ baseUrl: '', apiKey: '', modelName: '' });
  const [saved, setSaved] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // States for custom server form inputs
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [formGroupName, setFormGroupName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [customSavedList, setCustomSavedList] = useState<CustomModel[]>([]);

  // States for automatic model discovery
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autoFallback, setAutoFallback] = useState<boolean>(false);

  // States for group bar editing and management
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null);
  const [confirmDeleteAllCustom, setConfirmDeleteAllCustom] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setKeys(getStoredApiKeys());
      setAutoFallback(getAutoFallbackEnabled());
      // Clean up any previously corrupted IP/hostname entries
      const stored = getStoredCustomModels();
      const cleaned = stored.filter((m) => {
        if (!m.name) return false;
        return !/^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(m.name);
      });
      if (cleaned.length !== stored.length) {
        saveStoredCustomModels(cleaned);
      }
      setCustomSavedList(cleaned);
      setFormGroupName('');
      setFormBaseUrl('');
      setFormApiKey('');
      setFormModelName('');
      setShowCustomForm(false);
      setSaved(false);
      setConfirmClear(false);
      setFetchError(null);
      setSuccessMessage(null);
      setEditingGroupId(null);
      setEditingGroupName('');
      setConfirmDeleteGroup(null);
      setConfirmDeleteAllCustom(false);
    }
  }, [isOpen]);

  const toggleVisibility = (fieldName: string) => {
    setVisibleKeys((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const extractModelIds = (json: any): string[] => {
    let extractedIds: string[] = [];
    if (Array.isArray(json)) {
      extractedIds = json.map((m: any) => typeof m === 'string' ? m : m.id || m.name || m.model).filter(Boolean);
    } else if (json && typeof json === 'object') {
      const list = json.data || json.models || json.result || json.items || json.list || json.tags || [];
      if (Array.isArray(list)) {
        extractedIds = list.map((m: any) => typeof m === 'string' ? m : m.id || m.name || m.model).filter(Boolean);
      }
    }
    return Array.from(
      new Set(
        extractedIds
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0 && !/^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(s))
      )
    );
  };

  const handleConnectAndImportModels = async () => {
    if (!formBaseUrl || !formBaseUrl.trim()) {
      setFetchError(
        language === 'ar'
          ? 'يرجى إدخال عنوان خادم الـ API أولاً'
          : 'Please enter the API server base URL first'
      );
      return;
    }

    setFetching(true);
    setFetchError(null);
    setSuccessMessage(null);

    const baseUrl = formBaseUrl.trim().replace(/\/+$/, '');
    const apiKey = formApiKey.trim();

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let extractedIds: string[] = [];

    // 1. Direct fetch using baseUrl as entered: fetch(`${baseUrl}/models`, { headers: ... })
    try {
      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const json = await res.json();
        const ids = extractModelIds(json);
        if (ids.length > 0) {
          extractedIds = ids;
        }
      }
    } catch (_) {}

    // 2. Fallbacks for local rewrite proxy or alternative routes if direct fetch failed
    if (extractedIds.length === 0) {
      const fallbackCandidates = Array.from(
        new Set(
          [
            baseUrl.includes('127.0.0.1:9655') ? '/api/backend/models' : '',
            `${baseUrl}/v1/models`,
            `${baseUrl}/api/tags`,
            `${baseUrl}/api/models`,
          ].filter(Boolean)
        )
      );

      for (const altUrl of fallbackCandidates) {
        if (extractedIds.length > 0) break;
        try {
          const res = await fetch(altUrl, {
            method: 'GET',
            headers,
          });
          if (res.ok) {
            const json = await res.json();
            const ids = extractModelIds(json);
            if (ids.length > 0) {
              extractedIds = ids;
              break;
            }
          }
        } catch (_) {}
      }
    }

    // 3. Fallback to server-side proxy route if on cloud
    if (extractedIds.length === 0 && !baseUrl.startsWith('/')) {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const proxyRes = await fetch(`${origin}/api/proxy-models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            baseUrl,
            apiKey,
          }),
        });

        if (proxyRes.ok) {
          const json = await proxyRes.json();
          const ids = extractModelIds(json);
          if (ids.length > 0) {
            extractedIds = ids;
          }
        }
      } catch (_) {}
    }

    // If automatic discovery didn't find models, check if the user manually entered a model name:
    if (extractedIds.length === 0 && formModelName.trim()) {
      extractedIds = [formModelName.trim()];
    }

    if (extractedIds.length > 0) {
      // Filter out non-text/embedding models if there's a huge list
      const filtered = extractedIds.filter(
        (id) => !id.includes('whisper') && !id.includes('tts') && !id.includes('dall-e') && !id.includes('embedding')
      );
      const finalIds = filtered.length > 0 ? filtered : extractedIds;

      const existingSet = new Set(customSavedList.map((m) => `${m.baseUrl}:::${m.name}`));
      const newModels: CustomModel[] = [];

      const groupName = formGroupName.trim() || (language === 'ar' ? 'خادم مخصص' : 'Custom Server');

      for (const mId of finalIds) {
        const key = `${baseUrl}:::${mId}`;
        if (!existingSet.has(key)) {
          newModels.push({
            id: `custom:${Date.now()}:${Math.random().toString(36).slice(2, 7)}:${mId}`,
            name: mId,
            baseUrl,
            apiKey,
            provider: groupName,
            groupName: groupName,
          });
        }
      }

      const totalAdded = newModels.length;
      if (totalAdded > 0) {
        const updatedList = [...customSavedList, ...newModels];
        setCustomSavedList(updatedList);
        saveStoredCustomModels(updatedList);
      }

      // Automatically place all models from this server into the user-specified server group name
      const allServerModelIds = [...customSavedList, ...newModels]
        .filter((m) => m.groupName === groupName || m.provider === groupName || m.baseUrl === baseUrl)
        .map((m) => m.id);
      syncServerGroup(groupName, allServerModelIds);

      setSuccessMessage(
        language === 'ar'
          ? `تم بنجاح جلب ${finalIds.length} نموذج وإضافتها لمجموعة "${groupName}"!`
          : `Successfully loaded ${finalIds.length} models and placed them in group "${groupName}"!`
      );

      setTimeout(() => {
        setFormGroupName('');
        setFormBaseUrl('');
        setFormApiKey('');
        setFormModelName('');
        setShowCustomForm(false);
        setSuccessMessage(null);
      }, 1500);
    } else {
      setFetchError(
        language === 'ar'
          ? `تعذر الاتصال بالخادم أو جلب قائمة النماذج من (${baseUrl}). يرجى التأكد من تشغيل الخادم وصحة الرابط ومفتاح API، أو إدخال اسم النموذج يدوياً.`
          : `Could not connect or discover models from (${baseUrl}). Please ensure the server is active, the URL/API key is correct, or enter a model name manually.`
      );
    }

    setFetching(false);
  };

  // Start editing a group name
  const handleStartEditGroup = (groupName: string) => {
    setEditingGroupId(groupName);
    setEditingGroupName(groupName);
  };

  // Cancel editing group name
  const handleCancelEditGroup = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  // Save renamed group across models and user groups
  const handleSaveRenameGroup = (oldGroupName: string) => {
    const trimmed = editingGroupName.trim();
    if (!trimmed || trimmed === oldGroupName) {
      setEditingGroupId(null);
      return;
    }

    // 1. Update all models in customSavedList that belong to oldGroupName
    const updatedList = customSavedList.map((cm) => {
      const gName = getModelGroupName(cm, language);
      if (gName === oldGroupName || cm.groupName === oldGroupName || cm.provider === oldGroupName) {
        return {
          ...cm,
          groupName: trimmed,
          provider: trimmed,
        };
      }
      return cm;
    });

    setCustomSavedList(updatedList);
    saveStoredCustomModels(updatedList);

    // 2. Update userModelGroups if exists or sync
    const allGroups = getUserModelGroups();
    const matched = allGroups.find(
      (g) => g.name.toLowerCase() === oldGroupName.toLowerCase()
    );
    if (matched) {
      updateUserModelGroup(matched.id, { name: trimmed });
    } else {
      const modelIds = updatedList
        .filter((m) => m.groupName === trimmed)
        .map((m) => m.id);
      syncServerGroup(trimmed, modelIds);
    }

    setEditingGroupId(null);
    setEditingGroupName('');
  };

  // Delete an entire group and all models inside it
  const handleDeleteGroupAndModels = (groupNameToDelete: string) => {
    // 1. Identify models belonging to this group
    const modelsToDelete = customSavedList.filter((cm) => {
      const gName = getModelGroupName(cm, language);
      return (
        gName === groupNameToDelete ||
        cm.groupName === groupNameToDelete ||
        cm.provider === groupNameToDelete
      );
    });
    const deletedModelIds = new Set(modelsToDelete.map((m) => m.id));

    // 2. Filter out all models belonging to this group
    const updatedList = customSavedList.filter((cm) => !deletedModelIds.has(cm.id));
    setCustomSavedList(updatedList);
    saveStoredCustomModels(updatedList);

    // 3. Remove group from userModelGroups and clean up modelIds
    const allGroups = getUserModelGroups();
    const remainingGroups = allGroups
      .filter((g) => g.name.toLowerCase() !== groupNameToDelete.toLowerCase())
      .map((g) => ({
        ...g,
        modelIds: g.modelIds.filter((mid) => !deletedModelIds.has(mid)),
      }));
    saveUserModelGroups(remainingGroups);

    setConfirmDeleteGroup(null);
    if (editingGroupId === groupNameToDelete) {
      setEditingGroupId(null);
    }
  };

  // Delete all custom models at once
  const handleDeleteAllCustomModels = () => {
    setCustomSavedList([]);
    saveStoredCustomModels([]);

    // Remove custom model IDs from all user model groups
    const allGroups = getUserModelGroups();
    const cleanedGroups = allGroups
      .map((g) => ({
        ...g,
        modelIds: g.modelIds.filter((mid) => !mid.startsWith('custom:')),
      }))
      .filter((g) => g.modelIds.length > 0);
    saveUserModelGroups(cleanedGroups);
    setConfirmDeleteAllCustom(false);
  };

  // Delete an individual custom model
  const handleDeleteCustomModel = (id: string) => {
    const updatedList = customSavedList.filter((m) => m.id !== id);
    setCustomSavedList(updatedList);
    saveStoredCustomModels(updatedList);

    // Also remove from any userModelGroup, and if group has no models left, delete it automatically
    const allGroups = getUserModelGroups();
    const updatedGroups = allGroups
      .map((g) => {
        if (g.modelIds.includes(id)) {
          return {
            ...g,
            modelIds: g.modelIds.filter((mid) => mid !== id),
          };
        }
        return g;
      })
      .filter((g) => g.modelIds.length > 0);
    saveUserModelGroups(updatedGroups);
  };

  // Toggle collapsing of a group's models list
  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Group the models by their group name
  const groupedCustomModels = useMemo(() => {
    const map = new Map<string, CustomModel[]>();
    for (const cm of customSavedList) {
      const gName = getModelGroupName(cm, language);
      if (!map.has(gName)) {
        map.set(gName, []);
      }
      map.get(gName)!.push(cm);
    }
    return Array.from(map.entries())
      .filter(([_, models]) => models.length > 0)
      .map(([groupName, models]) => ({
        groupName,
        models,
      }));
  }, [customSavedList, language]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#1B1B1F] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t.settingsTitle}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {language === 'ar' ? 'تخصيص الاتصال، المظهر، وإدارة البيانات' : 'Customize Connection, Appearance & Data'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 px-4 gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'general'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-medium'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>{t.tabGeneral}</span>
          </button>

          <button
            onClick={() => setActiveTab('api')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'api'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-medium'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>{t.tabApiKeys}</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'backup'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-medium'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'البيانات والنسخ الاحتياطي' : 'Data & Backup'}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[55vh]">
          {/* TAB 1: GENERAL & APPEARANCE */}
          {activeTab === 'general' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              {/* Theme Settings */}
              <div className="space-y-2">
                <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                  {t.themeHeading}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSetTheme?.('light')}
                    className={`text-start p-3 rounded-lg border transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-900 dark:border-white shadow-xs'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sun className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        {t.morningTheme}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      {t.themeMorningDesc}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetTheme?.('dark')}
                    className={`text-start p-3 rounded-lg border transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-900 dark:border-white shadow-xs'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Moon className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        {t.nightTheme}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      {t.themeNightDesc}
                    </p>
                  </button>
                </div>
              </div>

              {/* Language Settings */}
              <div className="space-y-1.5 pt-1">
                <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                  {t.languageHeading}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectLanguage('ar')}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border transition-all cursor-pointer text-center ${
                      language === 'ar'
                        ? 'bg-indigo-600 text-white border-indigo-600 font-medium shadow-xs'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    العربية
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectLanguage('en')}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border transition-all cursor-pointer text-center ${
                      language === 'en'
                        ? 'bg-indigo-600 text-white border-indigo-600 font-medium shadow-xs'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>

              {/* Auto Fallback Setting Control */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="space-y-0.5 max-w-[80%]">
                    <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                      {language === 'ar' ? 'التحويل التلقائي للنموذج البديل (Auto Fallback)' : 'Auto Model Fallback on Error'}
                    </label>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {language === 'ar'
                        ? 'عند التعطيل (الافتراضي)، يجيب النموذج المحدّد فقط ولن يتم تحويل طلبك تلقائياً لأي نموذج آخر عند حدوث خطأ.'
                        : 'When disabled (default), only your selected model will respond and will not automatically switch to another model on error.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !autoFallback;
                      setAutoFallback(nextVal);
                      setAutoFallbackEnabled(nextVal);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoFallback ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        autoFallback ? (isRtl ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: API KEYS (Custom Saved Models Form & Management) */}
          {activeTab === 'api' && (
            <div className="space-y-3.5 animate-in fade-in duration-100">
              <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-zinc-700 dark:text-zinc-300 shrink-0" />
                <p className="text-[11px] leading-relaxed">
                  {language === 'ar'
                    ? 'يمكنك إضافة خوادم ونماذج مخصصة كاملة للمحادثة. سيتم دمج النماذج المضافة مباشرة في قائمة النماذج لتتمكن من التنقل بينها وبين النماذج المجانية بسلاسة تامة.'
                    : 'You can add custom server connections. Any saved custom models will be appended to the model list so you can switch between them and free models seamlessly.'}
                </p>
              </div>

              {/* List of Already Saved Custom Models Organized by Group Bars */}
              {groupedCustomModels.length > 0 && !showCustomForm && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <span>
                        {language === 'ar' ? 'مجموعات النماذج المخصصة المضافة:' : 'Added Custom Model Groups:'}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-normal">
                        ({customSavedList.length}{' '}
                        {language === 'ar'
                          ? (customSavedList.length === 1 ? 'نموذج' : 'نماذج')
                          : 'models'})
                      </span>
                    </h4>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAllCustom(!confirmDeleteAllCustom)}
                      className="text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{language === 'ar' ? 'حذف كافة النماذج' : 'Delete all'}</span>
                    </button>
                  </div>

                  {confirmDeleteAllCustom && (
                    <div className="p-2.5 rounded-lg bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-2 animate-in fade-in">
                      <span className="text-[11px] text-red-700 dark:text-red-300 font-medium">
                        {language === 'ar'
                          ? 'هل أنت متأكد من حذف كافة النماذج المخصصة ومجموعاتها؟'
                          : 'Delete all custom models and groups?'}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleDeleteAllCustomModels}
                          className="px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium text-[11px] cursor-pointer"
                        >
                          {language === 'ar' ? 'نعم، حذف الكل' : 'Yes, Delete All'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAllCustom(false)}
                          className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] cursor-pointer"
                        >
                          {language === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {groupedCustomModels.map((group) => {
                      const isCollapsed = !!collapsedGroups[group.groupName];
                      const isEditing = editingGroupId === group.groupName;
                      const isConfirmingDelete = confirmDeleteGroup === group.groupName;

                      return (
                        <div
                          key={group.groupName}
                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs transition-all"
                        >
                          {/* 1. Group Header Bar (شريط المجموعة) */}
                          <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50/90 dark:bg-zinc-800/50 border-b border-zinc-200/80 dark:border-zinc-800/80 gap-2">
                            {/* Group Title and Icon / Editing Input */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Folder className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />

                              {isEditing ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={editingGroupName}
                                    onChange={(e) => setEditingGroupName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveRenameGroup(group.groupName);
                                      if (e.key === 'Escape') handleCancelEditGroup();
                                    }}
                                    autoFocus
                                    className="w-full max-w-[260px] px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-zinc-950 border border-indigo-500 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    placeholder={language === 'ar' ? 'اسم المجموعة الجديد...' : 'New group name...'}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRenameGroup(group.groupName)}
                                    className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                                    title={language === 'ar' ? 'حفظ الاسم' : 'Save name'}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditGroup}
                                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer transition-colors"
                                    title={language === 'ar' ? 'إلغاء' : 'Cancel'}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  className="flex items-center gap-2 min-w-0 cursor-pointer select-none"
                                  onClick={() => toggleGroupCollapse(group.groupName)}
                                >
                                  <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                                    {group.groupName}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/80 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300 shrink-0">
                                    {language === 'ar'
                                      ? `${group.models.length} ${group.models.length === 1 ? 'نموذج' : 'نماذج'}`
                                      : `${group.models.length} ${group.models.length === 1 ? 'model' : 'models'}`}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Bar Actions: Edit, Delete, Collapse */}
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Edit Group Button */}
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditGroup(group.groupName)}
                                  className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                                  title={language === 'ar' ? 'تعديل اسم المجموعة والنماذج' : 'Edit group name and models'}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete Group Button */}
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDeleteGroup(isConfirmingDelete ? null : group.groupName)
                                }
                                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                  isConfirmingDelete
                                    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10'
                                }`}
                                title={
                                  language === 'ar'
                                    ? 'حذف المجموعة ونماذجها بالكامل'
                                    : 'Delete group and all its models'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Collapse / Expand Toggle */}
                              <button
                                type="button"
                                onClick={() => toggleGroupCollapse(group.groupName)}
                                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                title={
                                  isCollapsed
                                    ? (language === 'ar' ? 'عرض النماذج' : 'Expand')
                                    : (language === 'ar' ? 'طي النماذج' : 'Collapse')
                                }
                              >
                                {isCollapsed ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* 2. Group Delete Confirmation Banner */}
                          {isConfirmingDelete && (
                            <div className="px-3.5 py-2.5 bg-red-50/90 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 flex items-center justify-between gap-2.5 animate-in fade-in duration-150">
                              <span className="text-red-700 dark:text-red-300 text-[11px] font-medium leading-tight">
                                {language === 'ar'
                                  ? `هل تريد حذف مجموعة "${group.groupName}" وجميع نماذجها (${group.models.length})؟`
                                  : `Delete group "${group.groupName}" and all its ${group.models.length} models?`}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGroupAndModels(group.groupName)}
                                  className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium text-[11px] transition-colors cursor-pointer"
                                >
                                  {language === 'ar' ? 'حذف بالكامل' : 'Delete All'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteGroup(null)}
                                  className="px-2.5 py-1 rounded-md bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-[11px] transition-colors cursor-pointer"
                                >
                                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 3. Group Models List */}
                          {!isCollapsed && (
                            <div className="p-2 space-y-1.5 bg-white dark:bg-zinc-900/50">
                              {isEditing && (
                                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 px-1 py-0.5 font-medium leading-relaxed">
                                  {language === 'ar'
                                    ? 'يمكنك تعديل اسم المجموعة من الشريط أعلاه، أو حذف نماذج معينة من القائمة أدناه:'
                                    : 'You can edit the group name above, or delete specific models from the list below:'}
                                </p>
                              )}

                              {group.models.map((cm) => (
                                <div
                                  key={cm.id}
                                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80 text-xs shadow-2xs min-h-[44px] hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                                >
                                  <div className="space-y-0.5 overflow-hidden flex-1 min-w-0 pr-2">
                                    <p className="font-normal text-zinc-900 dark:text-zinc-100 text-xs truncate">
                                      {cm.name}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[280px] sm:max-w-[420px]">
                                      {cm.baseUrl}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomModel(cm.id)}
                                    className="p-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                                    title={language === 'ar' ? 'حذف هذا النموذج من المجموعة' : 'Delete this model'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add Custom Model Button with (+) Sign */}
              {!showCustomForm && (
                <button
                  type="button"
                  onClick={() => setShowCustomForm(true)}
                  className="w-full py-2.5 px-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-900 dark:hover:border-zinc-100 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>{language === 'ar' ? 'إضافة نموذج مخصص جديد' : 'Add New Custom Model'}</span>
                </button>
              )}

              {/* FORM FIELDS (Only visible when showCustomForm is true) */}
              {showCustomForm && (
                <div className="space-y-3 p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <h4 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      {language === 'ar' ? 'إضافة خادم وجلب النماذج تلقائياً' : 'Add Server & Auto-Import Models'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomForm(false);
                        setFetchError(null);
                        setSuccessMessage(null);
                      }}
                      className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-red-600 font-medium cursor-pointer"
                    >
                      {language === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {language === 'ar'
                      ? 'يكفي إدخال رابط الخادم ومفتاح الـ API، وسيقوم النظام بالاتصال بالرابط وجلب جميع النماذج المتوفرة تلقائياً وإضافتها ديناميكياً إلى قائمة النماذج.'
                      : 'Enter the server URL and API key. The system will connect and dynamically discover all available models from the endpoint into your models list.'}
                  </p>

                  {/* 1. Group / Server Name Input */}
                  <div className="space-y-1">
                    <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                      {language === 'ar' ? 'اسم المجموعة / الخادم' : 'Group / Server Name'}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'ar' ? 'مثال: خادمي المحلي، Ollama، DeepSeek Local...' : 'e.g., Local Ollama, My vLLM, DeepSeek...'}
                      value={formGroupName}
                      onChange={(e) => setFormGroupName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-zinc-900 dark:focus:border-white"
                    />
                  </div>

                  {/* 2. Base URL Input */}
                  <div className="space-y-1">
                    <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                      {language === 'ar' ? 'عنوان خادم الـ API (Base URL)' : 'API Server Base URL'}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'ar' ? '/api/backend أو https://api.openai.com/v1' : '/api/backend or https://api.openai.com/v1'}
                      value={formBaseUrl}
                      onChange={(e) => setFormBaseUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-900 dark:focus:border-white"
                    />
                  </div>

                  {/* 3. API Key Input */}
                  <div className="space-y-1">
                    <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                      {language === 'ar' ? 'مفتاح الـ API Key' : 'API Authorization Key'}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={visibleKeys['formApiKey'] ? 'text' : 'password'}
                        placeholder={language === 'ar' ? '..._sk (اختياري للخوادم المحلية)' : '..._sk (Optional for local servers)'}
                        value={formApiKey}
                        onChange={(e) => setFormApiKey(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-900 dark:focus:border-white"
                      />
                      <button
                        type="button"
                        onClick={() => toggleVisibility('formApiKey')}
                        className={`absolute ${isRtl ? 'left-2.5' : 'right-2.5'} p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer`}
                      >
                        {visibleKeys['formApiKey'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* 4. Optional Specific Model Name */}
                  <div className="space-y-1">
                    <label className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                      {language === 'ar' ? 'اسم النموذج (اختياري - في حال رغبت بتحديده يدوياً)' : 'Model Name (Optional - to specify manually)'}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'ar' ? 'مثال: llama3, mistral, deepseek-chat, qwen...' : 'e.g., llama3, mistral, deepseek-chat, qwen...'}
                      value={formModelName}
                      onChange={(e) => setFormModelName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-900 dark:focus:border-white"
                    />
                  </div>

                  {/* Success Feedback */}
                  {successMessage && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  {/* Fetch Error feedback */}
                  {fetchError && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium px-1 animate-in fade-in">
                      {fetchError}
                    </p>
                  )}

                  {/* Connect & Auto-Import Models Button */}
                  <button
                    type="button"
                    onClick={handleConnectAndImportModels}
                    disabled={fetching}
                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-xs shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1 disabled:opacity-50"
                  >
                    {fetching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{language === 'ar' ? 'جاري الاتصال وجلب النماذج...' : 'Connecting & Fetching Models...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>{language === 'ar' ? 'الاتصال وجلب النماذج تلقائياً' : 'Connect & Auto-Import Models'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATA & BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-3 animate-in fade-in duration-100">
              <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
                {language === 'ar'
                  ? 'يمكنك حفظ وتصدير كافة محادثاتك وسجل الرسائل كملف JSON مشفر، أو استيرادها لاحقاً في أي وقت.'
                  : 'Export all your chat histories and messages as JSON, or restore a previous backup at any time.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {onExportData && (
                  <button
                    onClick={onExportData}
                    className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                    <span>{t.exportBackup}</span>
                  </button>
                )}

                {onImportData && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <span>{t.importBackup}</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={onImportData}
                      accept=".json"
                      className="hidden"
                    />
                  </>
                )}
              </div>

              {/* Clear all chats */}
              {sessions.length > 0 && onClearAllSessions && (
                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  {confirmClear ? (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs">
                      <p className="text-red-700 dark:text-red-300 font-medium mb-2">
                        {t.confirmClearAll}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            onClearAllSessions();
                            setConfirmClear(false);
                          }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                          {t.confirm}
                        </button>
                        <button
                          onClick={() => setConfirmClear(false)}
                          className="px-2 py-1 text-xs text-zinc-500 hover:underline cursor-pointer"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t.clearAllChats}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
            NUX AI
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-xs shadow-indigo-500/20 transition-colors cursor-pointer"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {t.saved}
                </>
              ) : (
                t.save
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SettingsModal;
