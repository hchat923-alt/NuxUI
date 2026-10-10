export type CursorStyle = 'sparkle' | 'orb' | 'diamond' | 'beam';

const CURSOR_STORAGE_KEY = 'chat_streaming_cursor_style';

export const CURSOR_OPTIONS: Array<{ id: CursorStyle; label: string; icon: string; desc: string }> = [
  {
    id: 'sparkle',
    label: 'نجمة متوهجة',
    icon: '*',
    desc: 'نجمة رباعية مشعة تدور وتنبض مع تدفق الكلمات',
  },
  {
    id: 'orb',
    label: 'كرة مضيئة',
    icon: 'o',
    desc: 'هالة ضوئية نابضة تتحرك بسلاسة عند كل حرف',
  },
  {
    id: 'diamond',
    label: 'ماسّة حركية',
    icon: '+',
    desc: 'ماسّة هندسية براقة بتموج لوني دافئ',
  },
  {
    id: 'beam',
    label: 'مؤشر انسيابي',
    icon: '|',
    desc: 'نبض كلاسيكي عصري يشبه مؤشر الكتابة السريع',
  },
];

export function getStreamingCursorStyle(): CursorStyle {
  try {
    const saved = localStorage.getItem(CURSOR_STORAGE_KEY);
    if (saved && ['sparkle', 'orb', 'diamond', 'beam'].includes(saved)) {
      return saved as CursorStyle;
    }
  } catch {
    // ignore
  }
  return 'sparkle';
}

export function setStreamingCursorStyle(style: CursorStyle): void {
  try {
    localStorage.setItem(CURSOR_STORAGE_KEY, style);
    window.dispatchEvent(new CustomEvent('cursor_style_changed', { detail: style }));
  } catch {
    // ignore
  }
}
