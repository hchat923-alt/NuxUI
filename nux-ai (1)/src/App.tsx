import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PanelLeft, 
  Plus, 
  ArrowDown,
  Sliders,
  Glasses,
  Ghost,
  Sun,
  Moon,
  FolderCode,
} from 'lucide-react';
import { ChatMessage, AIModel, ChatSession, FileAttachment, WorkspaceFile } from './types';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from './data/models';
import { Sidebar } from './components/Sidebar';
import { ChatMessageItem } from './components/ChatMessageItem';
import { ChatInput } from './components/ChatInput';
import { WelcomeHeader, WelcomeActionChips } from './components/WelcomeScreen';
import { ArtifactModal } from './components/ArtifactModal';
import { SettingsModal } from './components/SettingsModal';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import {
  extractFileActions,
  applyFileActionsToWorkspace,
  attachmentToWorkspaceFile,
  buildWorkspaceContextForPrompt,
} from './services/workspaceService';
import { GlobalTooltip } from './components/GlobalTooltip';
import { sendChatMessage, sendDualModelDebate } from './services/aiService';
import {
  shouldTriggerWebSearch,
  extractSearchQuery,
  performWebSearch,
  formatSearchContextForModel,
} from './services/webSearchService';
import { getDeepThinkingEnabled } from './services/deepThinkingService';
import { Language, getStoredLanguage, setStoredLanguage, translations } from './utils/i18n';

// Smart conversation title generator based on the first prompt & topic
export function generateSmartChatTitle(
  userText: string,
  attachedFiles?: FileAttachment[],
  lang: Language = 'ar'
): string {
  let cleaned = (userText || '').trim();

  // Strip prompt commands
  cleaned = cleaned.replace(/^\/(img|image|code|draw|search)\s+/i, '');

  // Strip conversational fluff in Arabic and English
  cleaned = cleaned
    .replace(/^(ممكن تشرح لي|هل يمكنك ان تشرح لي|هل يمكنك|ممكن|اريد معرفة|أريد معرفة|اريد|أريد|اشرح لي|اكتب لي|ساعدني في|كيف يمكن|كيف|ما هو|ما هي|ماذا عن|وضح لي|صمم لي|برمج لي)\s+/gi, '')
    .replace(/^(can you please explain|can you explain|could you explain|could you please|can you|please explain|please help me with|please help me|help me with|help me|explain to me|explain|how to|what is|tell me about|write a|write an|code a|create a)\s+/gi, '')
    .replace(/^[:\-–—\s]+/, '')
    .trim();

  if (cleaned.length > 0) {
    const firstLine = cleaned.split('\n')[0].trim();
    if (firstLine.length <= 42) {
      return firstLine;
    }
    const truncated = firstLine.slice(0, 40);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 20) {
      return truncated.slice(0, lastSpace).trim() + '...';
    }
    return truncated.trim() + '...';
  }

  if (attachedFiles && attachedFiles.length > 0) {
    const fileName = attachedFiles[0].name || '';
    const cleanFileName = fileName.replace(/\.[^/.]+$/, '').trim();
    if (cleanFileName) return cleanFileName.slice(0, 36);
  }

  return lang === 'ar' ? 'محادثة جديدة' : 'New Chat';
}

const SESSIONS_STORAGE_KEY = 'nux_chat_sessions_v1';
const THEME_STORAGE_KEY = 'nux_theme_v1';
const MODEL_STORAGE_KEY = 'nux_active_model_v1';
const EMPTY_MESSAGES: ChatMessage[] = [];

export default function App() {
  // Language state
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage());

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setStoredLanguage(newLang);
  };

  useEffect(() => {
    setStoredLanguage(language);
  }, [language]);

  const t = translations[language];

  // Theme state: 'light' (Morning) vs 'dark' (Night)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light'; // Default to comfortable morning light mode
  });

  // Apply theme class to HTML element and body
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      root.classList.add('dark');
      body.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Active Model state
  const [currentModel, setCurrentModel] = useState<AIModel>(() => {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    return saved ? getModelById(saved) : getModelById(DEFAULT_MODEL_ID);
  });

  const handleSelectModel = (model: AIModel) => {
    setCurrentModel(model);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, model.id);
    } catch (_) {}
  };

  // Chat sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const data = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map((s: any) => ({
          ...s,
          messages: (Array.isArray(s.messages) ? s.messages : []).map((m: any) => {
            if (m.sender === 'ai' || m.role === 'assistant') {
              const cleanedText = (m.text || m.content || '')
                .replace(/أنا نموذج ذكاء اصطناعي تم تدريبي من طرف ليبو لمحاكاة Claude من شركة Anthropic\./gi, '')
                .replace(/أنا نموذج ذكاء اصطناعي تم تدريبي من طرف ليبو لمحاكاة ChatGPT من شركة OpenAI\./gi, '')
                .replace(/I am an AI assistant trained and customized by Libo to simulate Claude from Anthropic\./gi, '')
                .replace(/I am an AI assistant trained and customized by Libo to simulate ChatGPT from OpenAI\./gi, '')
                .trim();
              return {
                ...m,
                text: cleanedText,
                content: cleanedText,
              };
            }
            return m;
          }),
          updatedAt: s.updatedAt || s.createdAt || Date.now(),
        }));
      }
      return [];
    } catch {
      return [];
    }
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    try {
      const data = localStorage.getItem(SESSIONS_STORAGE_KEY);
      const list = data ? JSON.parse(data) : [];
      return Array.isArray(list) && list[0]?.id ? list[0].id : null;
    } catch {
      return null;
    }
  });

  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [artifactData, setArtifactData] = useState<{
    code: string;
    language: string;
  } | null>(null);

  const handleOpenArtifact = useCallback((code: string, artifactLang: string) => {
    setArtifactData({ code, language: artifactLang });
  }, []);

  // Dual Model Collaborative State
  const [isDualModel, setIsDualModel] = useState(false);
  const [secondaryModel, setSecondaryModel] = useState<AIModel>(() =>
    getModelById('gemini-3.1-flash-lite')
  );

  // Workspace Files Drawer State & Actions
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);

  const handleUpdateWorkspaceFile = (fileId: string, newContent: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentSessionId) {
          const files = (s.workspaceFiles || []).map((f) =>
            f.id === fileId
              ? { ...f, content: newContent, updatedAt: Date.now(), lastAction: 'update' as const }
              : f
          );
          return { ...s, workspaceFiles: files };
        }
        return s;
      })
    );
  };

  const handleDeleteWorkspaceFile = (fileId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentSessionId) {
          const files = (s.workspaceFiles || []).filter((f) => f.id !== fileId);
          return { ...s, workspaceFiles: files };
        }
        return s;
      })
    );
  };

  const handleAddWorkspaceFiles = (newFiles: WorkspaceFile[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentSessionId) {
          let updated = [...(s.workspaceFiles || [])];
          for (const nf of newFiles) {
            const exIdx = updated.findIndex(
              (f) => f.path.toLowerCase() === nf.path.toLowerCase() || f.name.toLowerCase() === nf.name.toLowerCase()
            );
            if (exIdx >= 0) {
              updated[exIdx] = nf;
            } else {
              updated.push(nf);
            }
          }
          return { ...s, workspaceFiles: updated };
        }
        return s;
      })
    );
  };

  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userStoppedRef = useRef<boolean>(false);

  // Export/Import
  const handleExportData = () => {
    const data = {
      sessions,
      theme,
      language,
      currentModelId: currentModel.id,
      exportDate: new Date().toISOString(),
      version: '2.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nux-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && Array.isArray(parsed.sessions)) {
          setSessions(parsed.sessions);
          if (parsed.sessions.length > 0) {
            setCurrentSessionId(parsed.sessions[0].id);
          }
          if (parsed.language) {
            handleLanguageChange(parsed.language);
          }
          alert(language === 'ar' ? 'تم استيراد المحادثات بنجاح!' : 'Chats imported successfully!');
        } else {
          alert(language === 'ar' ? 'الملف غير متوافق أو لا يحتوي على بنية محادثات صحيحة.' : 'Incompatible file format.');
        }
      } catch {
        alert(language === 'ar' ? 'فشل قراءة الملف. تأكد من أنه ملف JSON سليم.' : 'Failed to read file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Save sessions to LocalStorage with debouncing to prevent synchronous main-thread disk I/O thrashing during streaming or rapid typing
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const nonIncognito = sessions.filter((s) => !s.isIncognito);
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(nonIncognito));
      } catch (e) {
        console.error('Failed to save sessions to localStorage:', e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [sessions]);

  // Current session messages
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages || EMPTY_MESSAGES;

  // Dynamically update document.title based on current active chat or 'New Chat'
  useEffect(() => {
    if (currentSession && currentSession.title && currentSession.messages.length > 0) {
      document.title = `${currentSession.title} — NUX AI`;
    } else {
      document.title = 'New Chat — NUX AI';
    }
  }, [currentSession?.title, currentSession?.messages.length]);

  // Scroll detection to toggle "Scroll Down" floating button
  const handleScroll = () => {
    if (!viewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isUp = distanceFromBottom > 50;
    setIsUserScrolledUp((prev) => (prev !== isUp ? isUp : prev));
  };

  const forceScrollToBottom = (smooth: boolean = true) => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
    setIsUserScrolledUp((prev) => (prev ? false : prev));
  };

  // Robust scroll & touch listeners for mobile and desktop viewport tracking
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onScrollCheck = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isUp = distanceFromBottom > 50;
      setIsUserScrolledUp((prev) => (prev !== isUp ? isUp : prev));
    };

    el.addEventListener('scroll', onScrollCheck, { passive: true });
    el.addEventListener('touchmove', onScrollCheck, { passive: true });
    window.addEventListener('resize', onScrollCheck, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScrollCheck);
      el.removeEventListener('touchmove', onScrollCheck);
      window.removeEventListener('resize', onScrollCheck);
    };
  }, [currentSessionId]);

  // Synchronize Google Gemini grounding metadata & sources if returned by server search tool
  useEffect(() => {
    const handleGroundingReceived = (e: any) => {
      const meta = e?.detail;
      if (!meta) return;
      const chunks = meta.groundingChunks;
      if (!Array.isArray(chunks) || chunks.length === 0) return;

      const sources = chunks
        .filter((c: any) => c?.web?.uri)
        .map((c: any) => {
          let domain = '';
          try {
            domain = new URL(c.web.uri).hostname.replace(/^www\./, '');
          } catch {
            domain = c.web.uri;
          }
          return {
            title: c.web.title || domain,
            url: c.web.uri,
            domain,
            snippet: c.web.title || '',
          };
        });

      if (sources.length === 0) return;

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== currentSessionId) return s;
          const lastMsg = s.messages[s.messages.length - 1];
          if (!lastMsg || lastMsg.sender !== 'ai') return s;

          const existingSources = lastMsg.searchMetadata?.sources || [];
          const existingUrls = new Set(existingSources.map((x: any) => x.url));
          const newSources = sources.filter((x: any) => !existingUrls.has(x.url));

          return {
            ...s,
            messages: s.messages.map((m, idx) => {
              if (idx === s.messages.length - 1) {
                return {
                  ...m,
                  searchMetadata: {
                    isSearching: false,
                    query: m.searchMetadata?.query || meta.webSearchQueries?.[0] || 'البحث في الويب',
                    sources: [...existingSources, ...newSources],
                  },
                };
              }
              return m;
            }),
          };
        })
      );
    };

    window.addEventListener('gemini-grounding-received', handleGroundingReceived);
    return () => {
      window.removeEventListener('gemini-grounding-received', handleGroundingReceived);
    };
  }, [currentSessionId]);

  // Keep auto-scrolling on streaming/new messages unless user explicitly scrolled up
  useEffect(() => {
    setShowAllMessages(false);
  }, [currentSessionId]);

  const lastMessage = messages[messages.length - 1];
  const lastMessageContentLength = lastMessage?.content?.length || 0;

  useEffect(() => {
    if (!isUserScrolledUp && messages.length > 0) {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    }
  }, [messages.length, lastMessageContentLength, isUserScrolledUp]);

  // Switch session cleanly, purging the previous session if it was incognito
  const switchSession = (targetId: string | null) => {
    if (currentSessionId && currentSessionId !== targetId) {
      const activeSession = sessions.find((s) => s.id === currentSessionId);
      if (activeSession?.isIncognito) {
        setSessions((prev) => prev.filter((s) => s.id !== currentSessionId));
      }
    }
    setCurrentSessionId(targetId);
  };

  // Create New Chat Session
  const handleNewChat = (isIncognito?: boolean | any, folderId?: string | null) => {
    if (isLoading) {
      handleStop();
    }
    const isPrivate = isIncognito === true;

    // Purge current session if it was incognito
    if (currentSessionId) {
      const activeSession = sessions.find((s) => s.id === currentSessionId);
      if (activeSession?.isIncognito) {
        setSessions((prev) => prev.filter((s) => s.id !== currentSessionId));
      }
    }

    // Check if we already have an empty chat of the same privacy type and folder
    const existingEmpty = sessions.find(
      (s) => s.messages.length === 0 && !!s.isIncognito === isPrivate && (s.folderId || null) === (folderId || null)
    );

    if (existingEmpty) {
      setCurrentSessionId(existingEmpty.id);
      setInput('');
      setAttachedFiles([]);
      setSidebarOpen(false);
      return;
    }

    const newSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newSession: ChatSession = {
      id: newSessionId,
      title: isPrivate
        ? (language === 'ar' ? 'محادثة خفية' : 'Incognito chat')
        : (language === 'ar' ? 'محادثة جديدة' : 'New chat'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      modelId: currentModel.id,
      isIncognito: isPrivate,
      folderId: folderId || null,
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSessionId);
    setInput('');
    setAttachedFiles([]);
    setSidebarOpen(false);
  };

  // Move session to folder or unassign
  const handleMoveSessionToFolder = (sessionId: string, folderId: string | null) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, folderId, updatedAt: Date.now() } : s))
    );
  };

  // Select existing session
  const handleSelectSession = (id: string) => {
    if (isLoading) {
      handleStop();
    }
    switchSession(id);
    const selected = sessions.find((s) => s.id === id);
    if (selected && selected.modelId) {
      const m = getModelById(selected.modelId);
      if (m) setCurrentModel(m);
    }
    setSidebarOpen(false);
    setTimeout(forceScrollToBottom, 100);
  };

  // Delete session
  const handleDeleteSession = (id: string) => {
    if (currentSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  // Rename session
  const handleRenameSession = (id: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle, updatedAt: Date.now() } : s))
    );
  };

  // Clear all sessions
  const handleClearAllSessions = () => {
    if (isLoading) handleStop();
    setSessions([]);
    setCurrentSessionId(null);
  };

  // Stop generation
  const handleStop = () => {
    userStoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // Send message
  const handleSend = async (customPrompt?: string, customFiles?: FileAttachment[]) => {
    userStoppedRef.current = false;
    const textToSend = customPrompt !== undefined ? customPrompt.trim() : input.trim();
    const filesToSend = customFiles !== undefined ? customFiles : attachedFiles;

    if (!textToSend && filesToSend.length === 0) return;
    if (isLoading) return;

    let activeSessionId = currentSessionId;
    let targetSession = sessions.find((s) => s.id === activeSessionId);

    // Auto-create session if none exists
    if (!activeSessionId || !targetSession) {
      const newSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const newSessionTitle = generateSmartChatTitle(textToSend, filesToSend, language);

      targetSession = {
        id: newSessionId,
        title: newSessionTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        modelId: currentModel.id,
      };

      setSessions((prev) => [targetSession!, ...prev]);
      setCurrentSessionId(newSessionId);
      activeSessionId = newSessionId;
    } else if (
      targetSession.messages.length === 0 ||
      targetSession.title === 'محادثة جديدة' ||
      targetSession.title === 'New Chat' ||
      targetSession.title === 'New chat'
    ) {
      // Update title on first message using smart summarizer
      const dynamicTitle = generateSmartChatTitle(textToSend, filesToSend, language);
      handleRenameSession(activeSessionId, dynamicTitle);
    }

    // User Message
    const userImages = filesToSend
      .filter((f) => f.fileCategory === 'image' || (f.type && f.type.startsWith('image/')) || (f.data && f.data.startsWith('data:image/')))
      .map((f) => f.data)
      .filter(Boolean);

    const userMessage: ChatMessage = {
      id: 'msg_user_' + Date.now(),
      sender: 'user',
      role: 'user',
      text: textToSend,
      content: textToSend,
      timestamp: Date.now(),
      attachments: filesToSend.length > 0 ? filesToSend : undefined,
      images: userImages.length > 0 ? userImages : undefined,
      modelUsed: currentModel.id,
    };

    // Check if autonomous web search is needed (only if not an image analysis prompt)
    const hasImageAttachments = userImages.length > 0;
    const needsWebSearch = !hasImageAttachments && shouldTriggerWebSearch(textToSend);
    const initialSearchMetadata = needsWebSearch
      ? {
          isSearching: true,
          query: extractSearchQuery(textToSend),
          sources: [],
        }
      : undefined;

    // AI Message (Placeholder)
    const aiMessageId = 'msg_ai_' + Date.now();
    const isDeepThinking = getDeepThinkingEnabled();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      sender: 'ai',
      role: 'assistant',
      text: '',
      content: '',
      timestamp: Date.now(),
      modelId: currentModel.id,
      modelUsed: isDualModel
        ? `${currentModel.name} & ${secondaryModel?.name || ''}`
        : currentModel.name,
      isStreaming: true,
      searchMetadata: initialSearchMetadata,
      isDeepThinking,
    };

    // Convert any code/document attachments into workspace files for this session
    let sessionWorkspaceFiles = targetSession.workspaceFiles || [];
    for (const f of filesToSend) {
      const wFile = attachmentToWorkspaceFile(f);
      if (wFile) {
        const exIdx = sessionWorkspaceFiles.findIndex(
          (ex) => ex.name.toLowerCase() === wFile.name.toLowerCase() || ex.path.toLowerCase() === wFile.path.toLowerCase()
        );
        if (exIdx >= 0) {
          sessionWorkspaceFiles = sessionWorkspaceFiles.map((item, idx) => (idx === exIdx ? wFile : item));
        } else {
          sessionWorkspaceFiles = [...sessionWorkspaceFiles, wFile];
        }
      }
    }

    const currentMessages = targetSession.messages || [];
    const updatedMessagesWithUser = [...currentMessages, userMessage];

    // Optimistically update state
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              workspaceFiles: sessionWorkspaceFiles,
              messages: [...updatedMessagesWithUser, aiMessage],
              updatedAt: Date.now(),
            }
          : s
      )
    );

    // Clear inputs
    setInput('');
    setAttachedFiles([]);
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let finalMessagesToSend = updatedMessagesWithUser;

      // Inject active workspace files context into the outgoing message so the model can read, modify, and process them
      const workspaceCtx = buildWorkspaceContextForPrompt(sessionWorkspaceFiles);
      if (workspaceCtx) {
        finalMessagesToSend = finalMessagesToSend.map((m, idx) => {
          if (idx === finalMessagesToSend.length - 1 && m.role === 'user') {
            return {
              ...m,
              content: (m.content || m.text || '') + workspaceCtx,
              text: (m.text || m.content || '') + workspaceCtx,
            };
          }
          return m;
        });
      }

      if (needsWebSearch) {
        try {
          const searchResult = await performWebSearch(textToSend, abortController.signal);
          
          // Update searchMetadata with retrieved websites/sources
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === aiMessageId ? { ...m, searchMetadata: searchResult } : m
                    ),
                  }
                : s
            )
          );

          // Enrich context for the model with grounded real-time search findings
          if (searchResult.sources && searchResult.sources.length > 0) {
            const searchContext = formatSearchContextForModel(searchResult);
            finalMessagesToSend = updatedMessagesWithUser.map((m, idx) => {
              if (idx === updatedMessagesWithUser.length - 1) {
                return {
                  ...m,
                  content: (m.content || m.text || '') + searchContext,
                  text: (m.text || m.content || '') + searchContext,
                };
              }
              return m;
            });
          }
        } catch (searchErr) {
          console.warn('Autonomous web search warning:', searchErr);
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === aiMessageId && m.searchMetadata
                        ? { ...m, searchMetadata: { ...m.searchMetadata, isSearching: false } }
                        : m
                    ),
                  }
                : s
            )
          );
        }
      }

      let pendingStreamText = '';
      let streamRafId: number | null = null;

      const pushStreamText = (text: string) => {
        pendingStreamText = text;
        if (streamRafId !== null) return;
        streamRafId = requestAnimationFrame(() => {
          streamRafId = null;
          const currentText = pendingStreamText;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === aiMessageId
                        ? { ...m, text: currentText, content: currentText, isStreaming: true }
                        : m
                    ),
                  }
                : s
            )
          );
        });
      };

      let finalReply = '';
      const callWithRetry = async (fn: () => Promise<string>, maxRetries = 2) => {
        let attempts = 0;
        while (true) {
          try {
            return await fn();
          } catch (err: any) {
            const msg = err?.message || '';
            const is5xx = /\b5\d\d\b/.test(msg) || msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('ENOSPC') || msg.includes('5xx');
            if (is5xx && attempts < maxRetries) {
              attempts++;
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            throw err;
          }
        }
      };

      if (isDualModel && secondaryModel) {
        finalReply = await callWithRetry(() => sendDualModelDebate({
          modelAId: currentModel.id,
          modelBId: secondaryModel.id,
          modelAName: currentModel.name,
          modelBName: secondaryModel.name,
          userQuery:
            textToSend ||
            (filesToSend.length > 0
              ? (language === 'ar' ? `تحليل ومراجعة الملف المرفق: ${filesToSend[0].name}` : `Analyze attached file: ${filesToSend[0].name}`)
              : ''),
          attachments: filesToSend,
          chatHistory: finalMessagesToSend.slice(0, -1).map((m) => ({
            role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
            content: m.content || m.text || '',
            attachments: m.attachments,
            images: m.images,
          })),
          language,
          onChunk: (streamedText) => {
            pushStreamText(streamedText);
          },
        }));
      } else {
        finalReply = await callWithRetry(() => sendChatMessage({
          modelId: currentModel.id,
          messages: finalMessagesToSend.map((m) => ({
            role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
            content: m.content || m.text || '',
            attachments: m.attachments,
            images: m.images,
          })),
          onChunk: (chunk, fullText) => {
            const streamedText = fullText || chunk;
            pushStreamText(streamedText);
          },
          signal: abortController.signal,
        }));
      }

      if (streamRafId !== null) {
        cancelAnimationFrame(streamRafId);
        streamRafId = null;
      }

      // Mark streaming complete with final validated reply
      const completedText = finalReply || pendingStreamText;
      const fileActions = extractFileActions(completedText);

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSessionId) {
            const nextWorkspaceFiles = fileActions.length > 0
              ? applyFileActionsToWorkspace(s.workspaceFiles || [], fileActions)
              : s.workspaceFiles;

            return {
              ...s,
              workspaceFiles: nextWorkspaceFiles,
              messages: s.messages.map((m) =>
                m.id === aiMessageId
                  ? {
                      ...m,
                      text: completedText || m.text,
                      content: completedText || m.content,
                      isStreaming: false,
                    }
                  : m
              ),
            };
          }
          return s;
        })
      );
    } catch (err: any) {
      if (userStoppedRef.current) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === aiMessageId
                      ? {
                          ...m,
                          text: m.text + (language === 'ar' ? ' [تم إيقاف التوليد]' : ' [Generation stopped]'),
                          content: m.content + (language === 'ar' ? ' [تم إيقاف التوليد]' : ' [Generation stopped]'),
                          isStreaming: false,
                        }
                      : m
                  ),
                }
              : s
          )
        );
      } else {
        const rawErrMessage = err?.message || '';
        let errorMsg =
          language === 'ar'
            ? 'مزود النموذج يواجه مشكلة مؤقتة (HTTP 5xx). يمكنك إعادة المحاولة أو تجربة نموذج آخر.'
            : 'The model provider experienced a temporary issue (HTTP 5xx). You can retry or try another model.';

        // Clean up raw JSON or billing errors for user
        if (rawErrMessage.includes('403') || rawErrMessage.includes('Forbidden')) {
          errorMsg = language === 'ar'
            ? 'تم رفض الطلب بواسطة مزود النموذج (HTTP 403 Forbidden). قد يتطلب هذا النموذج مفتاح API صالح، أو قد يكون نموذجاً خاصاً لتوليد الصور (مثل absolutereality) لا يدعم المحادثة النصية، أو أن المزود حظر الطلب.'
            : 'Access denied by model provider (HTTP 403 Forbidden). This model may require a valid API key, or it might be an image-only model that does not accept chat completions.';
        } else if (rawErrMessage.includes('402') || rawErrMessage.includes('payment method is required') || rawErrMessage.includes('balance_units')) {
          errorMsg = language === 'ar'
            ? 'هذا النموذج يتطلب اشتراكاً مدفوعاً أو بطاقة دفع على منصته. يرجى اختيار نموذج مجاني مثل Claude أو GPT أو Gemini للاستمرار بسلاسة.'
            : 'This model requires active billing on its provider. Please select a free model like Claude, GPT, or Gemini to continue.';
        } else if (rawErrMessage.includes('401') || rawErrMessage.includes('invalid_api_key') || rawErrMessage.includes('Unauthorized')) {
          errorMsg = language === 'ar'
            ? 'مفتاح API الخاص بهذا النموذج غير صالح أو منتهي الصلاحية. يمكنك تحديثه من الإعدادات أو اختيار نموذج آخر.'
            : 'The API key for this model is invalid or expired. You can update it in Settings or select another model.';
        } else if (rawErrMessage.includes('404') || rawErrMessage.includes('not found')) {
          errorMsg = language === 'ar'
            ? 'النموذج غير متوفر أو لم يتم العثور على الرابط لدى المزود (HTTP 404 Not Found). يرجى التأكد من اسم النموذج أو اختيار نموذج آخر.'
            : 'Model not found on provider (HTTP 404 Not Found). Please verify the model name or select another model.';
        } else if (rawErrMessage.includes('429') || rawErrMessage.includes('rate limit')) {
          errorMsg = language === 'ar'
            ? 'تم تجاوز حد الاستخدام المسموح لهذا النموذج مؤقتاً (HTTP 429 Rate Limit). يرجى الانتظار قليلاً أو التبديل لنموذج آخر.'
            : 'Rate limit exceeded for this model (HTTP 429). Please wait a moment or switch to another model.';
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === aiMessageId
                      ? {
                          ...m,
                          text: errorMsg,
                          content: errorMsg,
                          rawError: rawErrMessage,
                          isStreaming: false,
                          isError: true,
                          error: true,
                        }
                      : m
                  ),
                }
              : s
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Regenerate specific response
  const handleRegenerateMessage = async (messageId: string) => {
    if (!currentSession || isLoading) return;
    const msgs = [...currentSession.messages];
    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    let userMsgIdx = msgIndex - 1;
    while (userMsgIdx >= 0 && (msgs[userMsgIdx].sender === 'ai' || msgs[userMsgIdx].role === 'assistant')) {
      userMsgIdx--;
    }
    if (userMsgIdx < 0) return;

    const userMsg = msgs[userMsgIdx];
    const truncated = msgs.slice(0, userMsgIdx);
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSession.id ? { ...s, messages: truncated } : s))
    );

    const prevAttachments = userMsg.attachments || [];
    handleSend(userMsg.text || userMsg.content || '', prevAttachments);
  };

  const handleRegenerate = async () => {
    if (!currentSession || currentSession.messages.length < 2 || isLoading) return;
    const lastAiMsg = [...currentSession.messages].reverse().find(m => m.sender === 'ai' || m.role === 'assistant');
    if (lastAiMsg) {
      handleRegenerateMessage(lastAiMsg.id);
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!currentSessionId || isLoading) return;
    const session = sessions.find((s) => s.id === currentSessionId);
    if (!session) return;

    const msgIndex = session.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const targetMsg = session.messages[msgIndex];
    const existingVersions = targetMsg.versions || [targetMsg.content];
    if (!existingVersions.includes(newContent)) {
      existingVersions.push(newContent);
    }
    const newVersionIndex = existingVersions.length - 1;

    // Truncate messages up to the edited user message
    const truncatedMessages = session.messages.slice(0, msgIndex);
    const editedUserMessage: ChatMessage = {
      ...targetMsg,
      content: newContent,
      text: newContent,
      timestamp: Date.now(),
      versions: existingVersions,
      activeVersionIndex: newVersionIndex,
    };

    const updatedMessages = [...truncatedMessages, editedUserMessage];

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? {
              ...s,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }
          : s
      )
    );

    setTimeout(() => {
      handleSend(newContent, editedUserMessage.attachments);
    }, 50);
  };

  const handleSwitchVersion = (messageId: string, versionIndex: number) => {
    if (!currentSessionId || isLoading) return;
    const session = sessions.find((s) => s.id === currentSessionId);
    if (!session) return;

    const msgIndex = session.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const targetMsg = session.messages[msgIndex];
    const versions = targetMsg.versions || [targetMsg.content];
    if (versionIndex < 0 || versionIndex >= versions.length) return;

    const targetContent = versions[versionIndex];

    if (targetMsg.sender === 'user' || targetMsg.role === 'user') {
      const truncatedMessages = session.messages.slice(0, msgIndex);
      const updatedUserMsg: ChatMessage = {
        ...targetMsg,
        content: targetContent,
        text: targetContent,
        activeVersionIndex: versionIndex,
      };
      const updatedMessages = [...truncatedMessages, updatedUserMsg];
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: updatedMessages, updatedAt: Date.now() }
            : s
        )
      );
      setTimeout(() => {
        handleSend(targetContent, updatedUserMsg.attachments);
      }, 50);
    } else {
      const updatedMessages = session.messages.map((m, idx) => {
        if (idx === msgIndex) {
          return {
            ...m,
            content: targetContent,
            text: targetContent,
            activeVersionIndex: versionIndex,
          };
        }
        return m;
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: updatedMessages, updatedAt: Date.now() }
            : s
        )
      );
    }
  };

  const handleTryAnotherModel = () => {
    const fallbackModel = getModelById('gemini-2.5-pro');
    setCurrentModel(fallbackModel);
    if (currentSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, modelId: 'gemini-2.5-pro' } : s))
      );
    }
    handleRegenerate();
  };

  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className="flex h-screen w-full bg-[#EDEDF0] dark:bg-[#141416] text-zinc-900 dark:text-zinc-100 overflow-hidden select-text"
    >
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAllSessions={handleClearAllSessions}
        onMoveSessionToFolder={handleMoveSessionToFolder}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
        onSelectLanguage={handleLanguageChange}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenCustomize={() => setShowSettingsModal(true)}
        onOpenWorkspace={() => setIsWorkspaceOpen(true)}
        workspaceFilesCount={currentSession?.workspaceFiles?.length || 0}
        onExportData={handleExportData}
        onImportData={handleImportData}
      />

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-13 px-3 sm:px-5 flex items-center justify-between bg-[#EDEDF0]/90 dark:bg-[#141416]/90 backdrop-blur-md z-20 sticky top-0 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            {/* Sidebar toggle button (clean, borderless, backgroundless) */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors cursor-pointer bg-transparent border-none outline-none shrink-0"
              title={t.sidebar}
              aria-label={t.sidebar}
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-white select-none shrink-0">
              NUX
            </span>
          </div>

          {/* Center: Dynamic Conversation Title */}
          <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-w-0 overflow-hidden">
            <h1
              className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[200px] sm:max-w-[420px] md:max-w-[560px] text-center select-none"
              title={currentSession?.title || (language === 'ar' ? 'محادثة جديدة' : 'New Chat')}
              dir="auto"
            >
              {currentSession?.title || (language === 'ar' ? 'محادثة جديدة' : 'New Chat')}
            </h1>
          </div>

          {/* Right: Incognito & New Chat Actions (clean, normal, borderless, backgroundless) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleNewChat(true)}
              className={`p-1.5 transition-colors cursor-pointer bg-transparent border-none outline-none ${
                currentSession?.isIncognito
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
              }`}
              title={language === 'ar' ? 'محادثة مؤقتة (Incognito)' : 'Temporary / Incognito Chat'}
              aria-label="Incognito Chat"
            >
              <Ghost className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleNewChat(false)}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors cursor-pointer bg-transparent border-none outline-none"
              title={t.newChat}
              aria-label={t.newChat}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Incognito Banner */}
        {currentSession?.isIncognito && (
          <div className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-medium z-15 select-none animate-fadeIn shrink-0">
            <Ghost className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
            <span>{(t as any).incognitoEnabled}</span>
          </div>
        )}

        {/* Message Viewport or Welcome Screen */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden chat-viewport flex flex-col relative w-full max-w-full min-w-0"
          ref={viewportRef}
          onScroll={handleScroll}
        >
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-3xl mx-auto my-auto min-w-0">
              <WelcomeHeader language={language} isIncognito={currentSession?.isIncognito} />

              <div className="w-full min-w-0">
                <ChatInput
                  input={input}
                  setInput={setInput}
                  attachedFiles={attachedFiles}
                  setAttachedFiles={setAttachedFiles}
                  onSend={(customText, customFiles) => {
                    handleSend(customText, customFiles);
                    setTimeout(forceScrollToBottom, 100);
                  }}
                  isLoading={isLoading}
                  onStop={handleStop}
                  currentModel={currentModel}
                  onSelectModel={handleSelectModel}
                  isDualModel={isDualModel}
                  setIsDualModel={setIsDualModel}
                  secondaryModel={secondaryModel}
                  onSelectSecondaryModel={setSecondaryModel}
                  className="w-full px-0 pb-1 pt-0 relative"
                  autoFocus
                  language={language}
                />
              </div>

              <WelcomeActionChips
                onSelectPrompt={(text) => {
                  setInput(text);
                }}
                language={language}
              />
            </div>
          ) : (
            <div className="flex-1 py-4 sm:py-6 w-full max-w-full overflow-x-hidden min-w-0">
              {messages.length > 25 && !showAllMessages && (
                <div className="flex justify-center my-3 px-4">
                  <button
                    type="button"
                    onClick={() => setShowAllMessages(true)}
                    className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer shadow-2xs"
                  >
                    {language === 'ar' ? `عرض الرسائل السابقة (${messages.length - 25} مخفية)` : `Load earlier messages (${messages.length - 25} hidden)`}
                  </button>
                </div>
              )}

              {((messages.length > 25 && !showAllMessages) ? messages.slice(-25) : messages).map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  language={language}
                  onRegenerate={
                    (message.sender === 'ai' || message.role === 'assistant')
                      ? () => handleRegenerateMessage(message.id)
                      : undefined
                  }
                  onOpenArtifact={handleOpenArtifact}
                  onOpenModelSelector={handleTryAnotherModel}
                  onEditMessage={handleEditMessage}
                  onSwitchVersion={handleSwitchVersion}
                />
              ))}

              <div ref={messagesEndRef} className="h-6" />
            </div>
          )}
        </div>

        {/* Chat Input Floating Area (when messages exist) */}
        {messages.length > 0 && (
          <div className="w-full shrink-0 relative z-30 max-w-full">
            {/* Scroll Down Floating Button pinned right above ChatInput */}
            <AnimatePresence>
              {isUserScrolledUp && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute -top-12 sm:-top-13 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
                >
                  <button
                    onClick={() => forceScrollToBottom(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 sm:py-2 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 shadow-md text-zinc-700 dark:text-zinc-200 hover:text-black dark:hover:text-white text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md select-none touch-manipulation"
                    title={t.scrollDown}
                    aria-label={t.scrollDown}
                  >
                    <ArrowDown className="w-3.5 h-3.5 animate-bounce text-zinc-800 dark:text-zinc-200" />
                    <span>{t.scrollDown}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <ChatInput
              input={input}
              setInput={setInput}
              attachedFiles={attachedFiles}
              setAttachedFiles={setAttachedFiles}
              onSend={(customText, customFiles) => {
                handleSend(customText, customFiles);
                setTimeout(forceScrollToBottom, 100);
              }}
              isLoading={isLoading}
              onStop={handleStop}
              currentModel={currentModel}
              onSelectModel={handleSelectModel}
              isDualModel={isDualModel}
              setIsDualModel={setIsDualModel}
              secondaryModel={secondaryModel}
              onSelectSecondaryModel={setSecondaryModel}
              language={language}
            />
          </div>
        )}
      </div>

      {/* Artifact Modal */}
      {artifactData && (
        <ArtifactModal
          code={artifactData.code}
          language={artifactData.language}
          onClose={() => setArtifactData(null)}
        />
      )}

      {/* Unified Settings Modal (Appearance, Morning vs Night Theme, Language, API Keys, Local Run, Backup) */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        language={language}
        onSelectLanguage={handleLanguageChange}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSetTheme={(newTheme) => setTheme(newTheme)}
        sessions={sessions}
        onClearAllSessions={handleClearAllSessions}
        onExportData={handleExportData}
        onImportData={handleImportData}
      />

      {/* Workspace Project Files Drawer */}
      {isWorkspaceOpen && (
        <WorkspaceDrawer
          isOpen={isWorkspaceOpen}
          onClose={() => setIsWorkspaceOpen(false)}
          files={currentSession?.workspaceFiles || []}
          language={language}
          theme={theme}
          onUpdateFile={handleUpdateWorkspaceFile}
          onDeleteFile={handleDeleteWorkspaceFile}
          onAddFiles={handleAddWorkspaceFiles}
        />
      )}

      {/* Global Sleek Tooltip Manager */}
      <GlobalTooltip />
    </div>
  );
}
