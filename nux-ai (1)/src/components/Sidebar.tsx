import React, { useState, useMemo } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Moon,
  Sun,
  PanelLeftClose,
  Sliders,
  SlidersHorizontal,
  FolderCode,
  Globe,
  Ghost,
} from 'lucide-react';
import { ChatSession } from '../types';
import { Language, translations } from '../utils/i18n';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: (isIncognito?: boolean) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClearAllSessions: () => void;
  onMoveSessionToFolder?: (sessionId: string, folderId: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  language?: Language;
  onSelectLanguage?: (lang: Language) => void;
  onOpenSettings?: () => void;
  onOpenCustomize?: () => void;
  onOpenWorkspace?: () => void;
  workspaceFilesCount?: number;
  onExportData?: () => void;
  onImportData?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  language = 'ar',
  onSelectLanguage,
  onOpenSettings,
  onOpenCustomize,
  onOpenWorkspace,
  workspaceFilesCount = 0,
}) => {
  const t = translations[language];
  const isRtl = language === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Filtered sessions by search query, sorted by most recent
  const filteredSessions = useMemo(() => {
    let list = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  // Handle session rename
  const startRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const saveRename = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-30 md:hidden transition-opacity"
        />
      )}

      {/* Clean, Elegant Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 ${
          isRtl ? 'right-0 border-l' : 'left-0 border-r'
        } z-40 w-64 sm:w-72 flex flex-col bg-[#E8E8ED] dark:bg-[#161619] border-zinc-200/80 dark:border-zinc-800 transition-transform duration-300 ease-in-out ${
          isOpen
            ? 'translate-x-0'
            : isRtl
            ? 'translate-x-full md:translate-x-0'
            : '-translate-x-full md:translate-x-0'
        } ${!isOpen ? 'md:hidden' : ''}`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">
            {t.chats} ({sessions.length})
          </span>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
            title={language === 'ar' ? 'إخفاء' : 'Close'}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Action Buttons: New Chat, Customize, Workspace */}
        <div className="p-2 flex flex-col gap-1 border-b border-zinc-200/60 dark:border-zinc-800/60">
          {/* New Chat Button */}
          <button
            type="button"
            onClick={() => onNewChat(false)}
            className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 font-medium text-xs transition-colors cursor-pointer text-start"
          >
            <Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
            <span>{t.newChat}</span>
          </button>

          {/* Customize Button */}
          <button
            type="button"
            onClick={onOpenCustomize || onOpenSettings}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 font-medium text-xs transition-colors cursor-pointer text-start"
          >
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
              <span>{language === 'ar' ? 'تخصيص' : 'Customize'}</span>
            </div>
          </button>

          {/* Workspace Files Button (Directly under Customize) */}
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 font-medium text-xs transition-colors cursor-pointer text-start"
          >
            <div className="flex items-center gap-2.5">
              <FolderCode className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
              <span>{language === 'ar' ? 'ملفات المشروع' : 'Workspace Files'}</span>
            </div>
            {workspaceFilesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-600/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                {workspaceFilesCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Input */}
        <div className="p-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute start-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'بحث في المحادثات...' : 'Search chats...'}
              className="w-full ps-8 pe-7 py-1.5 text-xs rounded-lg bg-black/5 dark:bg-white/5 border-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-all font-normal"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
          {filteredSessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
              {searchQuery
                ? language === 'ar'
                  ? 'لا توجد نتائج للبحث'
                  : 'No results found'
                : language === 'ar'
                ? 'لا توجد محادثات حتى الآن'
                : 'No conversations yet'}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isSelected = session.id === currentSessionId;
              const isEditing = editingId === session.id;
              const isIncognito = session.isIncognito;

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-black/10 dark:bg-white/10 text-zinc-950 dark:text-white font-medium'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isIncognito ? (
                      <Ghost
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-zinc-950 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      />
                    ) : (
                      <MessageSquare
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-zinc-950 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      />
                    )}

                    {isEditing ? (
                      <div
                        className="flex items-center gap-1 flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(session.id, e);
                            if (e.key === 'Escape') cancelRename(e);
                          }}
                          autoFocus
                          className="w-full px-1.5 py-0.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-400 dark:border-zinc-600 rounded text-zinc-900 dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={(e) => saveRename(session.id, e)}
                          className="p-0.5 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="p-0.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate flex-1">{session.title}</span>
                    )}
                  </div>

                  {/* Actions on hover */}
                  {!isEditing && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => startRename(session, e)}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                        title={language === 'ar' ? 'تعديل الاسم' : 'Rename'}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title={language === 'ar' ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Actions & Controls */}
        <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 space-y-0.5 text-xs">
          {/* Settings Trigger */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                <span>{t.settings}</span>
              </div>
            </button>
          )}

          {/* Language Switcher in Sidebar */}
          {onSelectLanguage && (
            <button
              onClick={() => onSelectLanguage(language === 'ar' ? 'en' : 'ar')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                <span>{t.language}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
                {language === 'ar' ? 'English' : 'العربية'}
              </span>
            </button>
          )}

          {/* Morning vs Night Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
              )}
              <span>{theme === 'dark' ? t.morningTheme : t.nightTheme}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
              {theme === 'dark' ? t.night : t.morning}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
});
