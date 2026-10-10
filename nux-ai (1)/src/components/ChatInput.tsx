import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  ArrowUp,
  Square,
  Users2,
  X,
  Check,
  Plus,
  Paperclip,
  FileText,
  FileCode,
  File as FileIcon,
  Music,
  Loader2,
  AlertCircle,
  Brain,
  Bot,
  Atom,
  Mic,
  MicOff,
  Globe,
  Image as ImageIcon,
} from 'lucide-react';
import { AIModel, FileAttachment } from '../types';
import { ModelSelector } from './ModelSelector';
import {
  getIntelligencePersona,
  setIntelligencePersona,
  IntelligencePersona,
} from '../services/claudePersona';
import {
  getDeepThinkingEnabled,
  setDeepThinkingEnabled,
} from '../services/deepThinkingService';
import { processFile, formatFileSize } from '../utils/fileUtils';

import { Language, translations } from '../utils/i18n';
import { playAppleSendSound } from '../utils/soundEffects';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  attachedFiles?: FileAttachment[];
  setAttachedFiles?: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  // Backward compatibility
  attachedImages?: string[];
  setAttachedImages?: React.Dispatch<React.SetStateAction<string[]>>;
  onSend: (customText?: string, files?: FileAttachment[]) => void;
  isLoading: boolean;
  onStop: () => void;
  currentModel: AIModel;
  onSelectModel: (model: AIModel) => void;
  isDualModel?: boolean;
  setIsDualModel?: (val: boolean) => void;
  secondaryModel?: AIModel;
  onSelectSecondaryModel?: (model: AIModel) => void;
  onOpenApiSettings?: () => void;
  className?: string;
  autoFocus?: boolean;
  language?: Language;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  attachedFiles = [],
  setAttachedFiles,
  onSend,
  isLoading,
  onStop,
  currentModel,
  onSelectModel,
  isDualModel = false,
  setIsDualModel,
  secondaryModel,
  onSelectSecondaryModel,
  onOpenApiSettings,
  className,
  autoFocus = false,
  language = 'ar',
}) => {
  const t = translations[language];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [persona, setPersona] = useState<IntelligencePersona>(() => getIntelligencePersona());
  const [deepThinking, setDeepThinking] = useState<boolean>(() => getDeepThinkingEnabled());
  const [isSendingEffect, setIsSendingEffect] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [selectedSpeechLang, setSelectedSpeechLang] = useState<string>(() => {
    try {
      return localStorage.getItem('nux_speech_lang') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const recognitionRef = useRef<any>(null);
  const baseInputRef = useRef('');
  const shouldKeepListeningRef = useRef(false);
  const accumulatedFinalRef = useRef('');
  const activeDetectedLangRef = useRef('ar-SA');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [waveBars, setWaveBars] = useState<number[]>([4, 6, 8, 14, 20, 24, 18, 22, 16, 20, 24, 18, 12, 8, 5]);

  // Clean up Web Audio API and stream
  const stopAudioVisualization = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  // Start real-time traveling waveform visualization
  const startAudioVisualization = async () => {
    stopAudioVisualization();

    let stream: MediaStream | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.6;
          source.connect(analyser);
          analyserRef.current = analyser;
        }
      }
    } catch (e) {
      console.warn('Live audio analyzer init error (falling back to dynamic simulation):', e);
    }

    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const NUM_BARS = 16;
    let localBars = new Array(NUM_BARS).fill(4);
    let tick = 0;

    const renderLoop = () => {
      tick++;
      let currentLevel = 0;

      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        // Focus on speech frequency band
        const sampleCount = Math.min(16, dataArray.length);
        for (let i = 0; i < sampleCount; i++) {
          sum += dataArray[i];
        }
        const avg = sum / sampleCount;
        currentLevel = Math.min(1, Math.max(0, (avg - 10) / 100));
      } else {
        // Organic dynamic fallback simulation if stream analyser unavailable
        currentLevel = (Math.sin(tick * 0.18) * 0.5 + 0.5) * 0.7;
      }

      // Generate newest bar height based on speech intensity + organic rhythm
      const organicVariation = Math.sin(tick * 0.25) * 4 + Math.cos(tick * 0.4) * 3;
      const baseHeight = 4 + currentLevel * 20 + organicVariation;
      const newHeight = Math.max(3, Math.min(26, Math.round(baseHeight)));

      // Shift bars to the left to create moving / walking recording effect
      localBars = [...localBars.slice(1), newHeight];

      // Update state every 2 frames (~30fps) for silky-smooth fluid animation
      if (tick % 2 === 0) {
        setWaveBars([...localBars]);
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
  };

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      stopAudioVisualization();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    };
  }, []);

  // Detect optimal language from user input, keyboard/system locales, and UI settings
  const resolveSpeechRecognitionLanguage = (targetLangMode: string = selectedSpeechLang): string => {
    if (targetLangMode === 'en-US' || targetLangMode === 'ar-SA') {
      activeDetectedLangRef.current = targetLangMode;
      return targetLangMode;
    }

    // If existing input has Latin characters (English) and no Arabic, use English
    if (input && /[a-zA-Z]/.test(input) && !/[\u0600-\u06FF]/.test(input)) {
      activeDetectedLangRef.current = 'en-US';
      return 'en-US';
    }

    // If existing input has Arabic characters, prioritize Arabic
    if (input && /[\u0600-\u06FF]/.test(input)) {
      activeDetectedLangRef.current = 'ar-SA';
      return 'ar-SA';
    }

    // Check system / browser language
    const navLanguages = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    const primaryNavLang = (navLanguages[0] || '').toLowerCase();
    if (primaryNavLang.startsWith('en')) {
      activeDetectedLangRef.current = 'en-US';
      return 'en-US';
    }
    if (primaryNavLang.startsWith('ar')) {
      activeDetectedLangRef.current = 'ar-SA';
      return 'ar-SA';
    }

    // Check App UI language
    if (language === 'en') {
      activeDetectedLangRef.current = 'en-US';
      return 'en-US';
    }

    activeDetectedLangRef.current = 'ar-SA';
    return 'ar-SA';
  };

  // Keep baseInputRef strictly in sync so deleted or sent text is never resurrected
  useEffect(() => {
    if (!input) {
      baseInputRef.current = '';
      accumulatedFinalRef.current = '';
    }
  }, [input]);

  const toggleListening = async (overrideLang?: string) => {
    if (isListening && !overrideLang) {
      shouldKeepListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      stopAudioVisualization();
      setIsListening(false);
      baseInputRef.current = '';
      return;
    }

    // If changing language while already listening, stop previous first
    if (isListening && recognitionRef.current) {
      shouldKeepListeningRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    setMicErrorMessage(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicErrorMessage(
        language === 'ar'
          ? 'المتصفح الحالي لا يدعم التعرف على الصوت مباشرة. يرجى استخدام Google Chrome أو Edge، أو فتح التطبيق في تبويب جديد.'
          : 'Speech recognition is not supported in this browser. Please try Chrome, Edge, or open the app in a new tab.'
      );
      return;
    }

    try {
      const activeLang = resolveSpeechRecognitionLanguage(overrideLang || selectedSpeechLang);
      const recognition = new SpeechRecognition();
      recognition.lang = activeLang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      shouldKeepListeningRef.current = true;
      accumulatedFinalRef.current = input ? `${input.trim()} ` : '';
      baseInputRef.current = input || '';

      recognition.onstart = () => {
        setIsListening(true);
        setMicErrorMessage(null);
        startAudioVisualization();
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && item[0]) {
            if (item.isFinal) {
              accumulatedFinalRef.current += item[0].transcript.trim() + ' ';
            } else {
              interimTranscript += item[0].transcript;
            }
          }
        }

        const currentTotal = (accumulatedFinalRef.current + interimTranscript).trim();
        if (currentTotal) {
          setInput(currentTotal);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition event status:', event?.error);
        if (event?.error === 'no-speech') {
          // Normal pause during speaking, keep listening session alive
          return;
        }
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          shouldKeepListeningRef.current = false;
          setMicErrorMessage(
            language === 'ar'
              ? 'تم رفض إذن الميكروفون. يرجى تفعيل إذن الميكروفون في المتصفح أو فتح التطبيق في تبويب مستقل.'
              : 'Microphone permission was denied. Please enable it in browser settings or open in a new tab.'
          );
          stopAudioVisualization();
          setIsListening(false);
          baseInputRef.current = '';
        } else if (event?.error === 'audio-capture') {
          shouldKeepListeningRef.current = false;
          setMicErrorMessage(
            language === 'ar'
              ? 'لم يتم العثور على ميكروفون صالح متصل بجهازك.'
              : 'No audio capture device found.'
          );
          stopAudioVisualization();
          setIsListening(false);
          baseInputRef.current = '';
        }
      };

      recognition.onend = () => {
        // Continuous session keep-alive (avoids stopping after brief pauses)
        if (shouldKeepListeningRef.current) {
          try {
            recognition.start();
          } catch (_) {
            setTimeout(() => {
              if (shouldKeepListeningRef.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (restartErr) {
                  console.warn('Speech recognition restart attempt:', restartErr);
                }
              }
            }, 80);
          }
        } else {
          stopAudioVisualization();
          setIsListening(false);
          baseInputRef.current = '';
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.warn('Speech recognition start failed:', e);
      shouldKeepListeningRef.current = false;
      setMicErrorMessage(
        language === 'ar'
          ? 'تعذر بدء الإملاء الصوتي: ' + (e?.message || 'خطأ غير متوقع')
          : 'Could not start voice dictation: ' + (e?.message || 'Unknown error')
      );
      stopAudioVisualization();
      setIsListening(false);
      baseInputRef.current = '';
    }
  };

  const handleSwitchSpeechLanguage = (targetMode: string) => {
    setSelectedSpeechLang(targetMode);
    try {
      localStorage.setItem('nux_speech_lang', targetMode);
    } catch {}
    if (isListening) {
      toggleListening(targetMode);
    }
  };

  useEffect(() => {
    const handlePersonaChange = (e: any) => {
      if (e.detail?.persona) {
        setPersona(e.detail.persona);
      } else {
        setPersona(getIntelligencePersona());
      }
    };
    window.addEventListener('persona-mode-changed', handlePersonaChange);

    const handleDeepThinkingChange = (e: any) => {
      if (typeof e.detail?.enabled === 'boolean') {
        setDeepThinking(e.detail.enabled);
      } else {
        setDeepThinking(getDeepThinkingEnabled());
      }
    };
    window.addEventListener('deep-thinking-changed', handleDeepThinkingChange);

    return () => {
      window.removeEventListener('persona-mode-changed', handlePersonaChange);
      window.removeEventListener('deep-thinking-changed', handleDeepThinkingChange);
    };
  }, []);

  const handleToggleDeepThinking = () => {
    const next = !deepThinking;
    setDeepThinking(next);
    setDeepThinkingEnabled(next);
  };

  const handleCyclePersona = () => {
    let nextPersona: IntelligencePersona;
    if (persona === 'off') {
      nextPersona = 'claude';
    } else if (persona === 'claude') {
      nextPersona = 'chatgpt';
    } else {
      nextPersona = 'off';
    }
    setPersona(nextPersona);
    setIntelligencePersona(nextPersona);
  };

  const handleInsertImageCommand = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setInput('/img ');
    } else if (!trimmed.startsWith('/img')) {
      setInput(`/img ${input}`);
    }
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 10);
  };

  // Auto focus if requested
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleProcessIncomingFiles = async (filesList: FileList | File[]) => {
    if (!setAttachedFiles) return;
    const filesArray = Array.from(filesList);
    if (filesArray.length === 0) return;

    setIsProcessingFiles(true);
    setFileError(null);

    const newAttachments: FileAttachment[] = [];
    const errors: string[] = [];

    for (const file of filesArray) {
      const res = await processFile(file);
      if (res.error) {
        errors.push(res.error);
      } else if (res.attachments && res.attachments.length > 0) {
        newAttachments.push(...res.attachments);
      } else if (res.attachment) {
        newAttachments.push(res.attachment);
      }
    }

    if (errors.length > 0) {
      setFileError(errors.join(' | '));
      // Auto clear error after 6 seconds
      setTimeout(() => {
        setFileError(null);
      }, 6000);
    }

    if (newAttachments.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newAttachments]);
    }

    setIsProcessingFiles(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleProcessIncomingFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      await handleProcessIncomingFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleProcessIncomingFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (idToRemove: string) => {
    if (!setAttachedFiles) return;
    setAttachedFiles((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const canSubmit = Boolean(input.trim() || attachedFiles.length > 0);

  const handleTriggerSend = () => {
    if (!isLoading && canSubmit) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      baseInputRef.current = '';

      setIsSendingEffect(true);
      playAppleSendSound();
      onSend(undefined, attachedFiles);
      setTimeout(() => setIsSendingEffect(false), 450);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTriggerSend();
    }
  };

  const renderFileIcon = (file: FileAttachment) => {
    switch (file.fileCategory) {
      case 'code':
        return <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-500" />;
      case 'audio':
        return <Music className="w-4 h-4 text-purple-500" />;
      default:
        return <FileIcon className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />;
    }
  };

  return (
    <div className={className || 'w-full max-w-4xl mx-auto px-3 sm:px-4 pb-3 sm:pb-4 pt-2 sticky bottom-0 z-20 bg-gradient-to-t from-[#F7F7F8] via-[#F7F7F8]/90 to-transparent dark:from-[#141416] dark:via-[#141416]/90 dark:to-transparent overflow-x-hidden'}>
      {/* Hidden file input supporting all files, docs, code, archives, images, audio, pdfs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="*/*,.zip,.tar,.gz,.pdf,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.php,.rb,.sql,.html,.css,.scss,.xml,.yaml,.yml,.sh,.env,.docx,.doc,.xlsx,.xls,.pptx"
        multiple
        className="hidden"
      />

      {/* Dual Model Mode Banner */}
      {isDualModel && secondaryModel && onSelectSecondaryModel && (
        <div
          dir={language === 'en' ? 'ltr' : 'rtl'}
          className="mb-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs max-w-full overflow-hidden"
        >
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-200 min-w-0">
            <span className="flex items-center gap-1 font-semibold text-zinc-900 dark:text-white shrink-0">
              <Users2 className="w-3.5 h-3.5" />
              {language === 'ar' ? 'حوار النموذجين التشاركي:' : 'Dual Model Consensus:'}
            </span>
            <span className="text-[11px] opacity-85 truncate">
              {language === 'ar'
                ? 'الأول يبني الحل -> والمدقق يفحص الأخطاء للوصول لأعلى دقة'
                : 'Primary drafts solution -> Verifier audits errors for maximum precision'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] shrink-0">
            <span className="opacity-70">{language === 'ar' ? 'المدقق:' : 'Verifier:'}</span>
            <ModelSelector
              currentModel={secondaryModel}
              onSelectModel={onSelectSecondaryModel}
              compact
              dropDirection="up"
              dropAlign="start"
              language={language}
            />
            {setIsDualModel && (
              <button
                type="button"
                onClick={() => setIsDualModel(false)}
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                title={language === 'ar' ? 'إلغاء وإخفاء حوار النموذجين' : 'Dismiss Dual Model'}
                aria-label={language === 'ar' ? 'إلغاء وإخفاء حوار النموذجين' : 'Dismiss Dual Model'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* File Validation Warning Notification */}
      {fileError && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 max-w-full overflow-hidden">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed break-words">{fileError}</div>
          <button
            type="button"
            onClick={() => setFileError(null)}
            className="text-amber-700 dark:text-amber-300 hover:opacity-75 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main input container with drag and drop support */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl bg-white dark:bg-[#1B1B1F] border transition-all shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative max-w-full ${
          isDraggingOver
            ? 'border-zinc-400 bg-zinc-50 dark:bg-zinc-900 ring-2 ring-zinc-400/30'
            : isDualModel
            ? 'border-zinc-400/60 dark:border-zinc-600/60 ring-1 ring-zinc-400/20'
            : 'border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-400 dark:focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-400/20 dark:focus-within:ring-zinc-500/25'
        }`}
      >
        {/* Drag and Drop Overlay Feedback */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-20 rounded-2xl bg-zinc-500/10 dark:bg-zinc-500/20 backdrop-blur-2xs flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 shadow-md border border-zinc-300 dark:border-zinc-700 text-xs font-semibold">
              <Paperclip className="w-4 h-4 animate-bounce" />
              <span>
                {language === 'ar'
                  ? 'أفلت الملفات هنا لقراءتها وتحليلها (PDF، كود، مستندات، صور، صوتيات)'
                  : 'Drop files here to analyze (PDF, Code, Docs, Images, Audio)'}
              </span>
            </div>
          </div>
        )}

        {/* Attached Files Preview Strip */}
        {attachedFiles.length > 0 && (
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 overflow-x-auto">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="relative group shrink-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-2 px-2.5 py-1.5 max-w-[200px]"
              >
                {file.fileCategory === 'image' ? (
                  <img
                    src={file.data}
                    alt={file.name}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                    {renderFileIcon(file)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate text-zinc-900 dark:text-zinc-100" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {formatFileSize(file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 hover:bg-red-500 hover:text-white text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-1"
                  title={language === 'ar' ? 'حذف الملف' : 'Remove file'}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {isProcessingFiles && (
              <div className="px-3 py-1.5 rounded-xl border border-dashed border-zinc-400 dark:border-zinc-600 flex items-center text-zinc-800 dark:text-zinc-200 text-[11px] gap-1.5 bg-zinc-100 dark:bg-zinc-800 shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-800 dark:text-zinc-200" />
                <span>{language === 'ar' ? 'معالجة الملفات...' : 'Processing files...'}</span>
              </div>
            )}
          </div>
        )}

        {/* Speech Recognition Error Banner */}
        {micErrorMessage && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
            <span className="font-medium">{micErrorMessage}</span>
            <button
              type="button"
              onClick={() => setMicErrorMessage(null)}
              className="text-amber-800 dark:text-amber-300 hover:opacity-80 p-0.5 cursor-pointer"
              title={language === 'ar' ? 'إغلاق' : 'Close'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Minimalist Live Voice Recording Bar (Matching Image 2 exactly) */}
        {isListening ? (
          <div className="w-full px-3.5 py-3 flex items-center justify-between gap-3 min-h-[52px]">
            {/* Left '+' Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-1 shrink-0 cursor-pointer"
              title={language === 'ar' ? 'إرفاق ملف' : 'Attach file'}
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Middle: Live Transcribed Text + Audio Waveform */}
            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
              <span
                dir={language === 'en' ? 'ltr' : 'auto'}
                className="italic text-[15px] text-zinc-500 dark:text-zinc-400 truncate select-none font-normal"
              >
                {input.trim() ? input : (language === 'ar' ? 'جاري الاستماع... تحدث بوضوح' : 'Listening... speak clearly')}
              </span>

              {/* Soundwave Visualizer: ···|||||||||··· (Moving real-time audio waveform) */}
              <div className="flex items-center gap-[2.5px] shrink-0 px-2 h-7" aria-hidden="true">
                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-40 shrink-0" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-60 shrink-0" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-80 shrink-0" />
                
                {waveBars.map((h, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${h}px` }}
                    className="w-[2.5px] rounded-full bg-zinc-900 dark:bg-zinc-100 transition-[height] duration-75 ease-out shrink-0"
                  />
                ))}

                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-80 shrink-0" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-60 shrink-0" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-40 shrink-0" />
              </div>
            </div>

            {/* Right: Language switch pill, Cancel [X] and Confirm Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Quick Language Toggle Pill */}
              <button
                type="button"
                onClick={() => {
                  const currentMode = selectedSpeechLang;
                  let nextMode = 'auto';
                  if (currentMode === 'auto') {
                    nextMode = activeDetectedLangRef.current === 'ar-SA' ? 'en-US' : 'ar-SA';
                  } else if (currentMode === 'ar-SA') {
                    nextMode = 'en-US';
                  } else {
                    nextMode = 'auto';
                  }
                  handleSwitchSpeechLanguage(nextMode);
                }}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-all flex items-center gap-1 cursor-pointer border border-zinc-200 dark:border-zinc-700"
                title={language === 'ar' ? 'انقر لتغيير لغة الاستماع (عربي / English / تلقائي)' : 'Click to change recognition language (AR / EN / Auto)'}
              >
                <Globe className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                <span>
                  {selectedSpeechLang === 'en-US' || (selectedSpeechLang === 'auto' && activeDetectedLangRef.current === 'en-US')
                    ? 'EN'
                    : selectedSpeechLang === 'ar-SA' || (selectedSpeechLang === 'auto' && activeDetectedLangRef.current === 'ar-SA')
                    ? 'عربي'
                    : 'Auto'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  shouldKeepListeningRef.current = false;
                  if (recognitionRef.current) {
                    try { recognitionRef.current.stop(); } catch (_) {}
                  }
                  stopAudioVisualization();
                  setIsListening(false);
                  setInput(baseInputRef.current || '');
                }}
                className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-red-500 flex items-center justify-center transition-colors cursor-pointer"
                title={language === 'ar' ? 'إلغاء' : 'Cancel'}
              >
                <X className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  shouldKeepListeningRef.current = false;
                  if (recognitionRef.current) {
                    try { recognitionRef.current.stop(); } catch (_) {}
                  }
                  stopAudioVisualization();
                  setIsListening(false);
                }}
                className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-emerald-500 flex items-center justify-center transition-colors cursor-pointer"
                title={language === 'ar' ? 'تم' : 'Done'}
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                baseInputRef.current = e.target.value;
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              dir={language === 'ar' ? 'rtl' : 'ltr'}
              placeholder={
                attachedFiles.length > 0
                  ? (language === 'ar'
                      ? 'اكتب سؤالك أو اطلب تحليل واستخراج الكود أو تلخيص هذا الملف...'
                      : 'Ask a question, analyze code, or summarize this file...')
                  : isDualModel
                  ? (language === 'ar'
                      ? 'اكتب سؤالك أو الكود ليتم تحليله وتدقيقه بواسطة النموذجين معاً...'
                      : 'Ask anything to be analyzed and verified by both models...')
                  : (language === 'ar'
                      ? 'كيف يمكنني مساعدتك اليوم؟'
                      : 'How can I help you today?')
              }
              rows={1}
              className={`w-full pt-3 px-4 pb-1 bg-transparent border-0 resize-none text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none min-h-[46px] max-h-[200px] ${
                language === 'ar' ? 'text-right' : 'text-left'
              }`}
            />

            {/* Toolbar - Forced LTR visual layout: Model & Tools on Left, Send on Right */}
            <div className="flex items-center justify-between px-2 sm:px-3 pb-2 pt-0.5 gap-2 min-w-0" dir="ltr">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                {/* Model Selector - Designed UI element on the left */}
                <div className="shrink-0 flex items-center">
                  <ModelSelector
                    currentModel={currentModel}
                    onSelectModel={onSelectModel}
                    compact
                    dropDirection="up"
                    language={language}
                    isImageMode={input.trim().toLowerCase().startsWith('/img')}
                  />
                </div>

                {/* Scrollable Quick Actions Tray with All Action Buttons Preserved */}
                <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0">
                  {/* Attach File Button (Icon Only) */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFiles}
                    className={`relative shrink-0 w-7 h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center border box-border ${
                      attachedFiles.length > 0
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100 shadow-2xs'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent'
                    }`}
                    title={
                      attachedFiles.length > 0
                        ? (language === 'ar'
                            ? `الملفات المرفقة (${attachedFiles.length}) - انقر لإضافة المزيد`
                            : `Attached files (${attachedFiles.length}) - Click to add more`)
                        : (language === 'ar'
                            ? 'إرفاق ملفات (مستندات، PDF، أكواد برمجية، صور، صوتيات)'
                            : 'Attach files (Docs, PDF, Code, Images, Audio)')
                    }
                    aria-label={language === 'ar' ? 'إرفاق ملف' : 'Attach file'}
                  >
                    {isProcessingFiles ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-900 dark:text-zinc-100" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                    {attachedFiles.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[9px] font-bold flex items-center justify-center shadow-2xs">
                        {attachedFiles.length}
                      </span>
                    )}
                  </button>

                  {/* Dual Model Toggle (Icon Only) */}
                  {setIsDualModel && (
                    <button
                      type="button"
                      onClick={() => setIsDualModel(!isDualModel)}
                      className={`relative w-7 h-7 shrink-0 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center border box-border ${
                        isDualModel
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 shadow-2xs'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-zinc-800 border-transparent'
                      }`}
                      title={
                        isDualModel
                          ? (language === 'ar'
                              ? 'حوار نموذجين (مفعّل): انقر للتعطيل'
                              : 'Dual Model (Active): Click to disable')
                          : (language === 'ar'
                              ? 'حوار نموذجين: تشغيل نموذجين معاً للتحليل والتدقيق التشاركي'
                              : 'Dual Model: Run two models collaboratively for synthesis & verification')
                      }
                      aria-label={language === 'ar' ? 'حوار نموذجين' : 'Dual Model'}
                    >
                      <Users2 className="w-4 h-4" />
                      {isDualModel && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse pointer-events-none" />
                      )}
                    </button>
                  )}

                  {/* Deep Thinking (Claude Opus 5) Toggle */}
                  <button
                    type="button"
                    onClick={handleToggleDeepThinking}
                    className={`relative w-7 h-7 shrink-0 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center border box-border ${
                      deepThinking
                        ? 'bg-zinc-200 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 shadow-2xs'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-zinc-800 border-transparent'
                    }`}
                    title={
                      deepThinking
                        ? (language === 'ar'
                            ? 'التفكير العميق (Claude Opus 5): مفعّل — استدلال فلسفي ومنطقي معمق قبل الإجابة (انقر للتعطيل)'
                            : 'Deep Thinking (Claude Opus 5): Enabled — In-depth reasoning and authentic analysis (Click to disable)')
                        : (language === 'ar'
                            ? 'التفكير العميق (Claude Opus 5): انقر للتفعيل'
                            : 'Deep Thinking (Claude Opus 5): Click to enable')
                    }
                    aria-label={language === 'ar' ? 'التفكير العميق' : 'Deep Thinking'}
                  >
                    <Atom className="w-4 h-4" />
                    {deepThinking && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse pointer-events-none" />
                    )}
                  </button>

                  {/* Advanced Model Intelligence Persona Switcher */}
                  <button
                    type="button"
                    onClick={handleCyclePersona}
                    className={`relative w-7 h-7 shrink-0 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center border box-border ${
                      persona === 'claude' || persona === 'chatgpt'
                        ? 'bg-zinc-200 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 shadow-2xs'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-zinc-800 border-transparent'
                    }`}
                    title={
                      persona === 'claude'
                        ? (language === 'ar'
                            ? 'أسلوب تحليل رصين (مفعّل) — انقر للتبديل'
                            : 'Analytical Persona Active — Click to switch')
                        : persona === 'chatgpt'
                        ? (language === 'ar'
                            ? 'أسلوب حواري مباشر (مفعّل) — انقر للتعطيل والعودة للنموذج الأصلي'
                            : 'Conversational Persona Active — Click to disable')
                        : (language === 'ar'
                            ? 'النموذج يعمل بطبيعته الأصلية المباشرة'
                            : 'Original Model Mode Active')
                    }
                    aria-label={language === 'ar' ? 'محاكاة النماذج' : 'Model Simulation'}
                  >
                    {persona === 'claude' && (
                      <>
                        <Brain className="w-4 h-4" />
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse pointer-events-none" />
                      </>
                    )}
                    {persona === 'chatgpt' && (
                      <>
                        <Bot className="w-4 h-4" />
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse pointer-events-none" />
                      </>
                    )}
                    {persona === 'off' && (
                      <Brain className="w-4 h-4 opacity-40 grayscale" />
                    )}
                  </button>

                  {/* Voice Dictation (Dictate) Button - Standard unified style */}
                  <button
                    type="button"
                    onClick={() => toggleListening()}
                    className="relative w-7 h-7 shrink-0 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center border box-border text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent"
                    title={language === 'ar' ? 'إملاء صوتي' : 'Dictate'}
                    aria-label={language === 'ar' ? 'إملاء صوتي' : 'Dictate'}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center shrink-0">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="w-7 h-7 rounded-full bg-zinc-900 hover:bg-black text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 flex items-center justify-center transition-transform hover:scale-105 cursor-pointer shadow-xs"
                    title={language === 'ar' ? 'إيقاف' : 'Stop'}
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleTriggerSend}
                    disabled={!canSubmit}
                    className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer overflow-hidden ${
                      canSubmit
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-500/30 active:scale-90 hover:scale-105 transition-transform'
                        : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                    }`}
                    title={language === 'ar' ? 'إرسال الرسالة' : 'Send message'}
                  >
                    {isSendingEffect && (
                      <span className="absolute inset-0 rounded-full border-2 border-white animate-ping opacity-75 pointer-events-none" />
                    )}
                    <div
                      className={`transition-all duration-300 ease-out transform ${
                        isSendingEffect ? '-translate-y-7 opacity-0 scale-50' : 'translate-y-0 opacity-100 scale-100'
                      }`}
                    >
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    </div>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sub-bar Disclaimer */}
      <div className="text-center px-3 pt-2 text-[11px] leading-[17px] text-zinc-500 dark:text-zinc-400 select-none font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <span className="inline-block ml-[1px] font-normal not-italic no-underline">
          {language === 'ar'
            ? 'النماذج تستطيع عمل أخطاء. يرجى التحقق مرتين من الأجوبة المهمة'
            : 'AI models can make mistakes. Please double-check important answers.'}
        </span>
      </div>
    </div>
  );
};


