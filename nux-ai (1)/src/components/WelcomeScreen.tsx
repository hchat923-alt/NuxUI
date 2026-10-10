import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Pencil,
  GraduationCap,
  Code2,
  Coffee,
  Lightbulb,
  Ghost,
  Image as ImageIcon,
} from 'lucide-react';
import { Language } from '../utils/i18n';
import { StreamingCursor } from './StreamingCursor';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  language?: Language;
}

// Iconic Sunburst / Asterisk icon matching Claude/NUX branding
export const NuxSunburstIcon: React.FC<{ className?: string }> = ({
  className = 'w-7 h-7 text-zinc-900 dark:text-zinc-100',
}) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M16 2a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V4a2 2 0 0 1 2-2zM16 20a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0v-4a2 2 0 0 1 2-2zM2 16a2 2 0 0 1 2-2h4a2 2 0 1 1 0 4H4a2 2 0 0 1-2-2zM20 16a2 2 0 0 1 2-2h4a2 2 0 1 1 0 4h-4a2 2 0 0 1-2-2zM6.1 6.1a2 2 0 0 1 2.83 0l2.83 2.83a2 2 0 0 1-2.83 2.83L6.1 8.93a2 2 0 0 1 0-2.83zM18.84 18.84a2 2 0 0 1 2.83 0l2.83 2.83a2 2 0 0 1-2.83 2.83l-2.83-2.83a2 2 0 0 1 0-2.83zM6.1 25.9a2 2 0 0 1 0-2.83l2.83-2.83a2 2 0 0 1 2.83 2.83L8.93 25.9a2 2 0 0 1-2.83 0zM18.84 13.16a2 2 0 0 1 0-2.83l2.83-2.83a2 2 0 0 1 2.83 2.83l-2.83 2.83a2 2 0 0 1 0-2.83z" />
  </svg>
);

// Dynamic rotating and time-aware greetings in English and Arabic
export const DYNAMIC_GREETINGS = [
  {
    en: '.Good evening',
    ar: 'مساء الخير.',
    timeCheck: (h: number) => h >= 17 || h < 4,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: 'It’s a late-night jam session.',
    ar: 'جلسة إبداع مسائية متأخرة.',
    timeCheck: (h: number) => h >= 21 || h < 4,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: '.Good morning',
    ar: 'صباح الخير.',
    timeCheck: (h: number) => h >= 4 && h < 12,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: '.Good afternoon',
    ar: 'نهارك سعيد.',
    timeCheck: (h: number) => h >= 12 && h < 17,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: '.How can I help you today?',
    ar: 'كيف يمكنني مساعدتك اليوم؟',
    timeCheck: () => true,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: '.Where shall we begin?',
    ar: 'من أين تحب أن نبدأ؟',
    timeCheck: () => true,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: '.What are we building today?',
    ar: 'ما الذي تود بناءه اليوم؟',
    timeCheck: () => true,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: '.Ready when you are',
    ar: 'جاهز لأي مهمة برمجية وفكرة.',
    timeCheck: () => true,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
  {
    en: ".Let's make something great",
    ar: 'لنصنع شيئاً رائعاً معاً.',
    timeCheck: () => true,
    fontClassEn: 'font-serif',
    fontClassAr: 'font-arabic tracking-tight',
  },
];

export function getWelcomeChips(lang: Language = 'ar') {
  return [
    {
      id: 'write',
      label: lang === 'ar' ? 'كتابة' : 'Write',
      icon: Pencil,
      prompt:
        lang === 'ar'
          ? 'ساعدني في كتابة وصياغة مقال أو محتوى احترافي ومقنع حول: '
          : 'Help me draft and write professional, compelling content about: ',
    },
    {
      id: 'learn',
      label: lang === 'ar' ? 'تعلم' : 'Learn',
      icon: GraduationCap,
      prompt:
        lang === 'ar'
          ? 'اشرح لي بالتفصيل وبأسلوب تعليمي مبسط خطوة بخطوة مفهوم: '
          : 'Explain in detail step-by-step the following concept: ',
    },
    {
      id: 'code',
      label: lang === 'ar' ? 'برمجة' : 'Code',
      icon: Code2,
      prompt:
        lang === 'ar'
          ? 'اكتب لي كوداً برمجياً نظيفاً وموثقاً للمهمة التالية: '
          : 'Write clean, well-documented, bug-free code for the following task: ',
    },
    {
      id: 'life',
      label: lang === 'ar' ? 'أفكار وتنظيم' : 'Life stuff',
      icon: Coffee,
      prompt:
        lang === 'ar'
          ? 'ساعدني في تنظيم وتخطيط جدول وأفكار عملية لـ: '
          : 'Help me organize, plan, and structure practical ideas for: ',
    },
    {
      id: 'image_gen',
      label: lang === 'ar' ? 'إنشاء صورة' : 'Create image',
      icon: ImageIcon,
      prompt: '/img ',
    },
    {
      id: 'nux_choice',
      label: lang === 'ar' ? "اختيار NUX" : "NUX's choice",
      icon: Lightbulb,
      prompt:
        lang === 'ar'
          ? 'اقترح علي فكرة إبداعية أو مشروعاً تقنياً مبتكراً يمكن تنفيذه اليوم: '
          : 'Suggest an innovative, creative project or idea we can build today: ',
    },
  ];
}

export const WelcomeHeader: React.FC<{ language?: Language; isIncognito?: boolean }> = ({ language = 'ar', isIncognito = false }) => {
  const [greetingIndex, setGreetingIndex] = useState(() => {
    const hour = new Date().getHours();
    // Prefer accurate time greeting on first load, or random
    const validTimeIndex = DYNAMIC_GREETINGS.findIndex((g) => g.timeCheck(hour));
    if (validTimeIndex !== -1 && Math.random() < 0.6) {
      return validTimeIndex;
    }
    return Math.floor(Math.random() * DYNAMIC_GREETINGS.length);
  });

  // Cycle to next greeting when clicked
  const handleNextGreeting = () => {
    setGreetingIndex((prev) => (prev + 1) % DYNAMIC_GREETINGS.length);
  };

  const currentGreeting = DYNAMIC_GREETINGS[greetingIndex] || DYNAMIC_GREETINGS[0];
  let greetingText = language === 'en' ? currentGreeting.en : currentGreeting.ar;

  if (isIncognito) {
    greetingText = language === 'en' ? '.Incognito Chat' : 'محادثة خفية.';
  }

  const isSerifGreeting = currentGreeting.en === 'It’s a late-night jam session.' && !isIncognito;
  const fontClass = isIncognito
    ? 'font-greeting'
    : (language === 'en'
        ? (currentGreeting.fontClassEn || 'font-greeting')
        : (currentGreeting.fontClassAr || 'font-arabic'));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center text-center mb-6 select-none"
    >
      <div
        onClick={isIncognito ? undefined : handleNextGreeting}
        className={`inline-flex items-center justify-center gap-2.5 sm:gap-3.5 mb-1 px-3 py-1 rounded-2xl transition-all ${
          isSerifGreeting ? 'flex-row-reverse' : ''
        } ${isIncognito ? '' : 'cursor-pointer group'}`}
        title={isIncognito ? undefined : (language === 'ar' ? 'انقر لتغيير التحية' : 'Click to cycle greeting')}
      >
        <h1 className={`text-3xl sm:text-4xl text-zinc-900 dark:text-zinc-100 font-normal tracking-tight ${fontClass}`}>
          {greetingText}
        </h1>
        {isIncognito ? (
          <Ghost className="w-7 h-7 sm:w-8 sm:h-8 text-zinc-500 dark:text-zinc-400 shrink-0" />
        ) : (
          <StreamingCursor className="scale-[1.8] sm:scale-[2] origin-center shrink-0 mx-2" />
        )}
      </div>
      {isIncognito && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-sm">
          {language === 'ar' 
            ? 'محادثة مؤقتة مشفرة محلياً؛ لن تُحفظ في سجل المتصفح بعد إغلاقها.' 
            : 'Temporary session; messages and files will not be saved after you close this chat.'}
        </p>
      )}
    </motion.div>
  );
};

export const WelcomeActionChips: React.FC<{
  onSelectPrompt: (prompt: string) => void;
  language?: Language;
}> = ({ onSelectPrompt, language = 'ar' }) => {
  const chips = getWelcomeChips(language);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
      className="flex items-center justify-center gap-2 flex-wrap max-w-4xl mx-auto px-2 mt-3"
    >
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onSelectPrompt(chip.prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-medium transition-all hover:scale-[1.02] cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
          >
            <Icon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <span>{chip.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
};
