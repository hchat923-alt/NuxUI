import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  FolderCode,
  FileCode,
  Download,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  Search,
  Upload,
  Archive,
  Eye,
  FileText,
  Folder,
} from 'lucide-react';
import { WorkspaceFile } from '../types';
import { highlightCode } from '../utils/prismHelper';
import { exportWorkspaceAsZip, getFileLanguage } from '../services/workspaceService';
import { processFile } from '../utils/fileUtils';

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  files: WorkspaceFile[];
  language?: 'ar' | 'en';
  theme?: 'light' | 'dark';
  onUpdateFile: (fileId: string, newContent: string) => void;
  onDeleteFile: (fileId: string) => void;
  onAddFiles: (newFiles: WorkspaceFile[]) => void;
}


export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({
  isOpen,
  onClose,
  files = [],
  language = 'ar',
  theme = 'dark',
  onUpdateFile,
  onDeleteFile,
  onAddFiles,
}) => {
  const isEn = language === 'en';
  const isLight = theme === 'light';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [editContent, setEditContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drawerSize, setDrawerSize] = useState<'compact' | 'normal' | 'wide' | 'fullscreen'>('normal');
  const drawerSizeClasses = {
    compact: 'max-w-3xl h-[72vh]',
    normal: 'max-w-5xl h-[88vh]',
    wide: 'max-w-7xl h-[92vh]',
    fullscreen: 'max-w-full w-full h-full rounded-none',
  }[drawerSize];
  const preRef = useRef<HTMLPreElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Auto-save status feedback
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // New file modal state
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(
      (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  const activeFile = useMemo(() => {
    return files.find((f) => f.id === selectedFileId) || null;
  }, [files, selectedFileId]);

  // If no file selected yet but files exist, select the first one
  useEffect(() => {
    if (isOpen && files.length > 0 && (!selectedFileId || !files.some((f) => f.id === selectedFileId))) {
      setSelectedFileId(files[0].id);
      setEditContent(files[0].content);
    }
  }, [isOpen, files, selectedFileId]);

  const handleSelectFile = (file: WorkspaceFile) => {
    if (activeFile && editContent !== activeFile.content) {
      onUpdateFile(activeFile.id, editContent);
    }
    setSelectedFileId(file.id);
    setEditContent(file.content);
    setIsEditing(true);
  };

  // Handle content change with auto-save
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditContent(val);
    setSaveStatus('saving');

    if (activeFile) {
      onUpdateFile(activeFile.id, val);
    }

    setTimeout(() => {
      setSaveStatus('saved');
    }, 400);
  };

  // Auto-closing pairs and indentation handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = editContent;

    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
    };

    if (pairs[e.key] && start === end) {
      e.preventDefault();
      const openChar = e.key;
      const closeChar = pairs[openChar];
      const newText = val.slice(0, start) + openChar + closeChar + val.slice(end);
      setEditContent(newText);
      if (activeFile) {
        onUpdateFile(activeFile.id, newText);
      }
      setTimeout(() => {
        textarea.setSelectionRange(start + 1, start + 1);
      }, 0);
      return;
    }

    // Skip over closing char if already next
    const closingChars = [')', ']', '}', '"', "'"];
    if (closingChars.includes(e.key) && start === end && val[start] === e.key) {
      e.preventDefault();
      textarea.setSelectionRange(start + 1, start + 1);
      return;
    }

    // Handle Backspace deleting both opening and closing pair if empty between them
    if (e.key === 'Backspace' && start === end && start > 0) {
      const prev = val[start - 1];
      const next = val[start];
      const matchingPairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
      if (matchingPairs[prev] === next) {
        e.preventDefault();
        const newText = val.slice(0, start - 1) + val.slice(start + 1);
        setEditContent(newText);
        if (activeFile) {
          onUpdateFile(activeFile.id, newText);
        }
        setTimeout(() => {
          textarea.setSelectionRange(start - 1, start - 1);
        }, 0);
        return;
      }
    }
  };

  const handleCopy = (file: WorkspaceFile) => {
    navigator.clipboard.writeText(file.content);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadSingle = (file: WorkspaceFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    await exportWorkspaceAsZip(files, 'workspace-files.zip');
  };

  const handleCreateNewFile = (e: React.FormEvent) => {
    e.preventDefault();
    const path = newFilePath.trim();
    if (!path) return;

    const fileName = path.split('/').pop() || path;
    const newFile: WorkspaceFile = {
      id: `wfile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: fileName,
      path,
      content: newFileContent,
      language: getFileLanguage(fileName),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAction: 'create',
      source: 'user',
      size: new Blob([newFileContent]).size,
    };

    onAddFiles([newFile]);
    setNewFilePath('');
    setNewFileContent('');
    setShowNewFileModal(false);
    setSelectedFileId(newFile.id);
    setEditContent(newFile.content);
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesList = Array.from(e.target.files);
    const imported: WorkspaceFile[] = [];

    for (const file of filesList) {
      const res = await processFile(file);
      if (res.attachments && res.attachments.length > 0) {
        for (const att of res.attachments) {
          const content = att.textContent || (att.fileCategory === 'code' ? att.data : '');
          if (content) {
            imported.push({
              id: `wfile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: att.name,
              path: att.name,
              content,
              language: getFileLanguage(att.name),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastAction: 'create',
              source: 'user',
              size: att.size,
            });
          }
        }
      } else if (res.attachment) {
        const att = res.attachment;
        const content = att.textContent || (att.fileCategory === 'code' ? att.data : '');
        if (content) {
          imported.push({
            id: `wfile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: att.name,
            path: att.name,
            content,
            language: getFileLanguage(att.name),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastAction: 'create',
            source: 'user',
            size: att.size,
          });
        }
      }
    }

    if (imported.length > 0) {
      onAddFiles(imported);
      if (!selectedFileId && imported[0]) {
        setSelectedFileId(imported[0].id);
        setEditContent(imported[0].content);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-2 sm:p-4">
      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFiles}
        multiple
        accept="*/*,.zip,.tar,.gz,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.html,.css"
        className="hidden"
      />

      <div
        dir={isEn ? 'ltr' : 'rtl'}
        className={`relative flex flex-col w-full ${drawerSizeClasses} rounded-2xl shadow-2xl overflow-hidden border transition-all duration-200 ${
          isLight
            ? 'bg-white text-zinc-900 border-zinc-200'
            : 'bg-[#18181b] text-zinc-100 border-zinc-800'
        }`}
      >
        {/* Drawer Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${
          isLight ? 'bg-zinc-100/80 border-zinc-200' : 'bg-zinc-900/80 border-zinc-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border ${
              isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-800 border-zinc-700 text-zinc-100'
            }`}>
              <FolderCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span>{isEn ? 'Project Workspace Files & Python IDE' : 'مساحة العمل وملفات البرمجة والتلوين'}</span>
                <span className={`px-2 py-0.5 text-xs font-mono rounded-full ${
                  isLight ? 'bg-zinc-200 text-zinc-800' : 'bg-zinc-800 text-zinc-200'
                }`}>
                  {files.length}
                </span>
              </h3>
              <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {isEn
                  ? 'Auto-save, Folder paths, Word Completer & Theme-aware syntax highlighting'
                  : 'الحفظ التلقائي، المجلدات، المكمل التلقائي للكلمات (Word Completer) والتلوين البرمجي حسب التيم'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer bg-transparent border-none ${
                isLight
                  ? 'hover:bg-zinc-100 text-zinc-800'
                  : 'hover:bg-zinc-800 text-zinc-200'
              }`}
              title={isEn ? 'Import files or ZIP' : 'استيراد ملفات أو أرشيف ZIP'}
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEn ? 'Import' : 'استيراد'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewFileModal(true)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer bg-transparent border-none ${
                isLight
                  ? 'hover:bg-zinc-100 text-zinc-800'
                  : 'hover:bg-zinc-800 text-zinc-200'
              }`}
              title={isEn ? 'New File or Folder' : 'ملف أو مجلد جديد'}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEn ? 'New File / Folder' : 'ملف جديد / مجلد'}</span>
            </button>

            {files.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadZip}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs bg-transparent border-none ${
                  isLight
                    ? 'hover:bg-zinc-200 text-zinc-900'
                    : 'hover:bg-zinc-800 text-white'
                }`}
                title={isEn ? 'Download All as ZIP' : 'تحميل جميع الملفات كـ ZIP'}
              >
                <Archive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isEn ? 'Download ZIP' : 'تحميل ZIP'}</span>
              </button>
            )}

            {/* Drawer Size Selector */}
            <div className={`hidden sm:flex items-center rounded-lg p-0.5 border ${
              isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-700' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
            }`}>
              <button
                type="button"
                onClick={() => setDrawerSize('compact')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-transparent border-none ${
                  drawerSize === 'compact' ? (isLight ? 'bg-white text-black shadow-xs' : 'bg-zinc-700 text-white shadow-xs') : 'opacity-70 hover:opacity-100'
                }`}
                title={isEn ? 'Compact View' : 'تصغير'}
              >
                {isEn ? 'Compact' : 'صغير'}
              </button>
              <button
                type="button"
                onClick={() => setDrawerSize('normal')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-transparent border-none ${
                  drawerSize === 'normal' ? (isLight ? 'bg-white text-black shadow-xs' : 'bg-zinc-700 text-white shadow-xs') : 'opacity-70 hover:opacity-100'
                }`}
                title={isEn ? 'Normal View' : 'عادي'}
              >
                {isEn ? 'Normal' : 'عادي'}
              </button>
              <button
                type="button"
                onClick={() => setDrawerSize('wide')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-transparent border-none ${
                  drawerSize === 'wide' ? (isLight ? 'bg-white text-black shadow-xs' : 'bg-zinc-700 text-white shadow-xs') : 'opacity-70 hover:opacity-100'
                }`}
                title={isEn ? 'Wide View' : 'توسيع'}
              >
                {isEn ? 'Wide' : 'واسع'}
              </button>
              <button
                type="button"
                onClick={() => setDrawerSize('fullscreen')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-transparent border-none ${
                  drawerSize === 'fullscreen' ? (isLight ? 'bg-white text-black shadow-xs' : 'bg-zinc-700 text-white shadow-xs') : 'opacity-70 hover:opacity-100'
                }`}
                title={isEn ? 'Fullscreen View' : 'ملء الشاشة'}
              >
                {isEn ? 'Full' : 'كامل'}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer bg-transparent border-none ${
                isLight ? 'hover:bg-zinc-200 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content area: Sidebar list + Main editor */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* File Explorer Sidebar */}
          <div className={`w-full md:w-80 border-b md:border-b-0 md:border-e flex flex-col ${
            isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-900/40 border-zinc-800'
          }`}>
            {/* Search Input */}
            <div className={`p-3 border-b ${isLight ? 'border-zinc-200' : 'border-zinc-800'}`}>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute top-2.5 inset-s-3 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isEn ? 'Search files & folders...' : 'بحث في الملفات والمجلدات...'}
                  className={`w-full text-xs ps-8 pe-3 py-1.5 rounded-lg border focus:outline-hidden focus:ring-1 ${
                    isLight
                      ? 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:ring-zinc-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-400 focus:ring-zinc-500'
                  }`}
                />
              </div>
            </div>

            {/* Files List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {filteredFiles.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  {files.length === 0
                    ? (isEn ? 'No files in workspace yet. Create a file or import.' : 'لا توجد ملفات في المشروع بعد. أنشئ ملفاً جديداً أو قم بالاستيراد.')
                    : (isEn ? 'No files match search query.' : 'لا توجد ملفات تطابق البحث.')}
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const isSelected = file.id === selectedFileId;
                  const isAiSource = file.source === 'ai';

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleSelectFile(file)}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer border ${
                        isSelected
                          ? isLight
                            ? 'bg-zinc-200/90 border-zinc-300 font-medium text-zinc-950'
                            : 'bg-zinc-800 border-zinc-700 font-medium text-white'
                          : isLight
                          ? 'hover:bg-zinc-100 border-transparent text-zinc-700'
                          : 'hover:bg-zinc-800/60 border-transparent text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode className="w-4 h-4 text-zinc-400 shrink-0" />
                        <div className="truncate">
                          <div className="truncate font-mono" title={file.path}>
                            {file.path}
                          </div>
                          <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                            <span className="uppercase">{file.language || 'text'}</span>
                            <span>•</span>
                            <span>{file.content.split('\n').length} {isEn ? 'lines' : 'سطر'}</span>
                            {isAiSource && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-500 font-semibold">AI</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadSingle(file);
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-transparent border-none"
                          title={isEn ? 'Download' : 'تحميل'}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(file.id);
                            if (selectedFileId === file.id) setSelectedFileId(null);
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-red-500 bg-transparent border-none"
                          title={isEn ? 'Delete' : 'حذف'}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Main Code Editor & Syntax Highlight Preview with Theme Support */}
          <div className={`flex-1 flex flex-col min-w-0 relative ${isLight ? 'bg-[#fcfcfc] text-zinc-900' : 'bg-[#1e1e1e] text-zinc-100'}`}>
            {activeFile ? (
              <>
                {/* File Header Bar */}
                <div className={`flex items-center justify-between px-4 py-2 border-b ${
                  isLight ? 'bg-zinc-100/90 border-zinc-200' : 'bg-zinc-900/80 border-zinc-800'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span className="font-mono text-xs font-medium truncate">
                      {activeFile.path}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                      isLight ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      {activeFile.language || 'text'}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      saveStatus === 'saving'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {saveStatus === 'saving' ? (isEn ? 'Saving...' : 'جاري الحفظ...') : (isEn ? 'Auto-Saved' : 'حفظ تلقائي')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Toggle Edit vs Syntax Highlight Preview */}
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-none ${
                          isLight
                            ? 'hover:bg-zinc-200 text-zinc-900'
                            : 'hover:bg-zinc-800 text-zinc-100'
                        }`}
                        title={isEn ? 'Preview syntax highlighting' : 'معاينة التلوين البرمجي'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Preview' : 'معاينة التلوين'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors bg-indigo-600 text-white hover:bg-indigo-700 border-none"
                        title={isEn ? 'Edit code' : 'تعديل الكود'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Edit' : 'تعديل'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopy(activeFile)}
                      className={`p-1.5 rounded-md transition-colors bg-transparent border-none ${
                        isLight ? 'hover:bg-zinc-200 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400'
                      }`}
                      title={isEn ? 'Copy' : 'نسخ'}
                    >
                      {copiedId === activeFile.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadSingle(activeFile)}
                      className={`p-1.5 rounded-md transition-colors bg-transparent border-none ${
                        isLight ? 'hover:bg-zinc-200 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400'
                      }`}
                      title={isEn ? 'Download' : 'تحميل'}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Editor or Syntax Highlighted View with Theme Awareness - VS Code style */}
                <div className={`flex-1 relative overflow-auto font-mono text-xs leading-relaxed flex ${
                  isLight ? 'bg-[#ffffff] text-[#24292f]' : 'bg-[#0d1117] text-[#c9d1d9]'
                }`} dir="ltr">
                  {/* Line Numbers Gutter */}
                  <div className={`select-none py-4 px-3 text-right border-r font-mono text-[11px] leading-relaxed shrink-0 ${
                    isLight ? 'bg-[#f6f8fa] text-[#8c959f] border-[#d8dee4]' : 'bg-[#161b22] text-[#6e7681] border-[#30363d]'
                  }`}>
                    {editContent.split('\n').map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>

                  <div className="flex-1 relative overflow-auto p-4">
                    {isEditing ? (
                      <div className="relative w-full h-full min-h-[420px] overflow-x-auto">
                        {/* Live Syntax Highlighted Background */}
                        <pre
                          ref={preRef}
                          aria-hidden="true"
                          className="absolute inset-0 m-0 p-0 font-mono text-xs leading-relaxed whitespace-pre pointer-events-none overflow-hidden min-w-full"
                          dangerouslySetInnerHTML={{
                            __html: highlightCode(editContent, activeFile.language || 'text') + '\n',
                          }}
                        />
                        <textarea
                          ref={textareaRef}
                          value={editContent}
                          onChange={handleContentChange}
                          onKeyDown={handleKeyDown}
                          onScroll={handleScroll}
                          className="absolute inset-0 w-full h-full min-h-[420px] bg-transparent text-transparent caret-indigo-500 dark:caret-indigo-400 font-mono text-xs leading-relaxed whitespace-pre resize-none focus:outline-hidden selection:bg-indigo-500/30 overflow-auto min-w-full"
                          spellCheck={false}
                          placeholder={isEn ? 'Type code here... (Auto-closing brackets & auto-save active)' : 'اكتب الكود هنا... (إكمال الأقواس التلقائي والحفظ التلقائي مفعلان)'}
                        />
                      </div>
                    ) : (
                      <pre
                        className="m-0 font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto"
                        dangerouslySetInnerHTML={{
                          __html: highlightCode(editContent, activeFile.language || 'text'),
                        }}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                <FolderCode className="w-12 h-12 stroke-[1.2] mb-3 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-300">
                  {isEn ? 'Select a file or create one to start coding' : 'اختر ملفاً أو أنشئ ملفاً جديداً للبدء بالبرمجة والتلوين'}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-sm">
                  {isEn
                    ? 'All edits are auto-saved instantly with theme-aware syntax highlighting.'
                    : 'جميع التعديلات تحفظ تلقائياً، مع دعم التلوين البرمجي حسب التيم (صباحي/ليلي) ومكمل الكلمات.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New File & Folder Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateNewFile}
            dir={isEn ? 'ltr' : 'rtl'}
            className={`w-full max-w-md rounded-xl p-5 shadow-xl space-y-4 border ${
              isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Folder className="w-4 h-4 text-indigo-500" />
                <span>{isEn ? 'Create New File or Folder Path' : 'إنشاء ملف جديد ضمن مسار أو مجلد'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer bg-transparent border-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {isEn ? 'File Path with Folder (e.g. src/index.html or python_files/main.py)' : 'مسار الملف مع المجلد (مثال: src/index.html أو python_files/main.py)'}
              </label>
              <input
                type="text"
                required
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="python_files/main.py"
                className={`w-full text-xs px-3 py-2 rounded-lg border font-mono focus:outline-hidden ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-300 text-zinc-900'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-100'
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {isEn ? 'Initial Content (Optional)' : 'المحتوى الأولي (اختياري)'}
              </label>
              <textarea
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                rows={5}
                placeholder="# Python code or HTML..."
                className={`w-full text-xs px-3 py-2 rounded-lg border font-mono focus:outline-hidden resize-none ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-300 text-zinc-900'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-100'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer bg-transparent border-none"
              >
                {isEn ? 'Cancel' : 'إلغاء'}
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-2xs border-none"
              >
                {isEn ? 'Create File' : 'إنشاء الملف'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
