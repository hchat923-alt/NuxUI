import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  FolderPlus,
  Folder,
  Search,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { AIModel } from '../types';
import {
  UserModelGroup,
  getUserModelGroups,
  createUserModelGroup,
  updateUserModelGroup,
  deleteUserModelGroup,
} from '../services/userModelGroups';
import { getCleanedModelName } from './ModelSelector';

interface ModelGroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: AIModel[];
  language?: 'ar' | 'en';
  activeGroupId?: string | null;
  onSelectGroup?: (groupId: string | null) => void;
}

export const ModelGroupManagerModal: React.FC<ModelGroupManagerModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  language = 'ar',
  activeGroupId,
  onSelectGroup,
}) => {
  const [groups, setGroups] = useState<UserModelGroup[]>(() => getUserModelGroups());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [editNameValue, setEditNameValue] = useState('');
  const [selectedGroupForModels, setSelectedGroupForModels] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');

  // Reload groups on mount or update
  const reloadGroups = () => {
    const list = getUserModelGroups();
    setGroups(list);
    if (selectedGroupForModels && !list.some((g) => g.id === selectedGroupForModels)) {
      setSelectedGroupForModels(list[0]?.id || null);
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const created = createUserModelGroup(newGroupName.trim());
    setNewGroupName('');
    reloadGroups();
    setSelectedGroupForModels(created.id);
  };

  const handleStartRename = (group: UserModelGroup) => {
    setEditingGroupId(group.id);
    setEditNameValue(group.name);
  };

  const handleSaveRename = (groupId: string) => {
    if (editNameValue.trim()) {
      updateUserModelGroup(groupId, { name: editNameValue.trim() });
      reloadGroups();
    }
    setEditingGroupId(null);
  };

  const handleDeleteGroup = (groupId: string) => {
    deleteUserModelGroup(groupId);
    if (activeGroupId === groupId && onSelectGroup) {
      onSelectGroup(null);
    }
    reloadGroups();
  };

  const handleToggleModelInGroup = (groupId: string, modelId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const exists = group.modelIds.includes(modelId);
    const updatedModelIds = exists
      ? group.modelIds.filter((id) => id !== modelId)
      : [...group.modelIds, modelId];
    updateUserModelGroup(groupId, { modelIds: updatedModelIds });
    reloadGroups();
  };

  const activeGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedGroupForModels) || groups[0] || null;
  }, [groups, selectedGroupForModels]);

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return availableModels;
    const q = modelSearch.toLowerCase().trim();
    return availableModels.filter((m) => {
      const name = (m.name || '').toLowerCase();
      const provider = (m.provider || '').toLowerCase();
      return name.includes(q) || provider.includes(q);
    });
  }, [availableModels, modelSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-2xl bg-[#F8F8FA] dark:bg-[#18181B] border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200">
              <Folder className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {language === 'ar' ? 'إدارة مجموعات النماذج' : 'Manage Model Groups'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {language === 'ar'
                  ? 'أنشئ مجموعاتك الخاصة لتنظيم وتصنيف النماذج حسب تفضيلك'
                  : 'Create custom groups to organize and categorize models your way'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[380px]">
          {/* Left / Sidebar Column: Groups List & Creation */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-e border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/30">
            {/* Create Group Form */}
            <form onSubmit={handleCreateGroup} className="mb-3">
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                {language === 'ar' ? 'إنشاء مجموعة جديدة' : 'Create New Group'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={language === 'ar' ? 'اسم المجموعة (مثال: البرمجة)' : 'Group name...'}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-zinc-500"
                />
                <button
                  type="submit"
                  disabled={!newGroupName.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'إضافة' : 'Add'}</span>
                </button>
              </div>
            </form>

            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 px-1 flex items-center justify-between">
              <span>{language === 'ar' ? 'مجموعاتك' : 'Your Groups'}</span>
              <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                {groups.length}
              </span>
            </div>

            {/* Groups list */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
              {groups.length === 0 ? (
                <div className="py-8 text-center px-2">
                  <Folder className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-1.5" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {language === 'ar'
                      ? 'لا توجد مجموعات بعد. أنشئ مجموعتك الأولى أعلاه!'
                      : 'No custom groups yet. Create your first one above!'}
                  </p>
                </div>
              ) : (
                groups.map((group) => {
                  const isSelected = (activeGroup?.id === group.id);
                  const isRenaming = editingGroupId === group.id;

                  return (
                    <div
                      key={group.id}
                      onClick={() => {
                        if (!isRenaming) setSelectedGroupForModels(group.id);
                      }}
                      className={`group/item p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                        isSelected
                          ? 'bg-zinc-200/90 dark:bg-zinc-800/90 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-medium'
                          : 'bg-white/70 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`} />
                        {isRenaming ? (
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(group.id);
                              if (e.key === 'Escape') setEditingGroupId(null);
                            }}
                            autoFocus
                            className="w-full px-1.5 py-0.5 text-xs rounded bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-xs truncate flex-1">{group.name}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isRenaming ? (
                          <button
                            type="button"
                            onClick={() => handleSaveRename(group.id)}
                            className="p-1 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">
                              {group.modelIds.length}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleStartRename(group)}
                              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700 cursor-pointer"
                              title={language === 'ar' ? 'تعديل الاسم' : 'Rename'}
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="p-1 rounded text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                              title={language === 'ar' ? 'حذف المجموعة' : 'Delete'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Model Selection for Active Group */}
          <div className="md:col-span-7 p-3.5 flex flex-col bg-white dark:bg-[#18181B]">
            {activeGroup ? (
              <>
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                      <span>{language === 'ar' ? 'النماذج المخصصة لـ:' : 'Models for:'}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium">
                        {activeGroup.name}
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {language === 'ar'
                        ? 'حدد النماذج التي ترغب في إدراجها ضمن هذه المجموعة'
                        : 'Check models you want to include in this group'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                    {activeGroup.modelIds.length} {language === 'ar' ? 'محدد' : 'selected'}
                  </span>
                </div>

                {/* Search Models */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={language === 'ar' ? 'بحث في النماذج...' : 'Search models...'}
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full ps-8 pe-3 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-zinc-400"
                  />
                </div>

                {/* Models List */}
                <div className="flex-1 overflow-y-auto space-y-1 max-h-[240px] custom-scrollbar pe-1">
                  {filteredModels.map((m) => {
                    const isChecked = activeGroup.modelIds.includes(m.id);
                    const cleanName = getCleanedModelName(m.name, m.id);

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleToggleModelInGroup(activeGroup.id, m.id)}
                        className={`w-full text-start p-2 rounded-lg border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isChecked
                            ? 'bg-zinc-100 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                            : 'bg-white dark:bg-zinc-900/40 border-zinc-100 dark:border-zinc-800/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-zinc-900 dark:text-zinc-100 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-medium truncate block">
                              {cleanName}
                            </span>
                            <span className="text-[10px] text-zinc-400 block truncate">
                              {m.provider || 'Pollinations'}
                            </span>
                          </div>
                        </div>

                        {isChecked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium">
                            {language === 'ar' ? 'مضاف' : 'Added'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
                <FolderPlus className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {language === 'ar'
                    ? 'اختر أو أنشئ مجموعة من القائمة الجانبية لتنظيم النماذج داخلها'
                    : 'Select or create a group to organize models inside it'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/70 flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {language === 'ar'
              ? 'يتم حفظ المجموعات تلقائياً في المتصفح'
              : 'Groups are automatically saved in browser'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium hover:bg-black dark:hover:bg-white transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'تم' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
