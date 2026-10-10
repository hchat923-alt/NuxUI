import React, { useEffect, useState } from 'react';
import { CursorStyle, getStreamingCursorStyle } from '../services/cursorPreferences';

interface StreamingCursorProps {
  style?: CursorStyle;
  className?: string;
}

export const StreamingCursor: React.FC<StreamingCursorProps> = ({
  style: propStyle,
  className = '',
}) => {
  const [storedStyle, setStoredStyle] = useState<CursorStyle>(() => getStreamingCursorStyle());

  useEffect(() => {
    if (propStyle) return;

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<CursorStyle>;
      if (customEvent.detail) {
        setStoredStyle(customEvent.detail);
      } else {
        setStoredStyle(getStreamingCursorStyle());
      }
    };

    window.addEventListener('cursor_style_changed', handler);
    return () => window.removeEventListener('cursor_style_changed', handler);
  }, [propStyle]);

  const currentStyle = propStyle || storedStyle;

  return (
    <span
      className={`inline-flex items-center justify-center align-baseline select-none pointer-events-none mx-1.5 translate-y-[1px] ${className}`}
      aria-label="مؤشر الكتابة المباشرة"
      title="يكتب الآن..."
    >
      {/* 1. Sparkle: Glowing 4-point radiant star */}
      {currentStyle === 'sparkle' && (
        <span className="relative inline-flex items-center justify-center w-3.5 h-3.5">
          {/* Ambient soft glow aura */}
          <span className="absolute inset-0 rounded-full bg-zinc-400/30 dark:bg-zinc-600/30 blur-[2.5px] animate-pulse" />
          {/* Expanding gentle ring */}
          <span className="absolute w-full h-full rounded-full bg-zinc-400/20 dark:bg-zinc-600/20 animate-ping" />
          {/* Rotating star vector */}
          <svg
            className="relative w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 drop-shadow-[0_0_6px_rgba(0,0,0,0.4)] dark:drop-shadow-[0_0_6px_rgba(255,255,255,0.4)] animate-[spin_4s_linear_infinite]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0L14.6 9.4L24 12L14.6 14.6L12 24L9.4 14.6L0 12L9.4 9.4L12 0Z" />
          </svg>
        </span>
      )}

      {/* 2. Orb: Luminous pulsating sphere */}
      {currentStyle === 'orb' && (
        <span className="relative inline-flex items-center justify-center w-3 h-3">
          <span className="absolute w-full h-full rounded-full bg-zinc-400/35 dark:bg-zinc-600/35 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-zinc-400/30 dark:bg-zinc-600/30 blur-[2px]" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-900 to-black dark:from-zinc-400 dark:via-zinc-200 dark:to-white shadow-[0_0_8px_rgba(0,0,0,0.5)] dark:shadow-[0_0_8px_rgba(255,255,255,0.5)] animate-pulse" />
        </span>
      )}

      {/* 3. Diamond: Morphing geometric jewel */}
      {currentStyle === 'diamond' && (
        <span className="relative inline-flex items-center justify-center w-3.5 h-3.5">
          <span className="absolute w-3 h-3 rotate-45 rounded-xs bg-zinc-400/25 dark:bg-zinc-600/25 animate-ping" />
          <span className="relative w-2.5 h-2.5 rotate-45 rounded-xs bg-gradient-to-tr from-zinc-700 via-zinc-900 to-black dark:from-zinc-400 dark:via-zinc-200 dark:to-white shadow-[0_0_7px_rgba(0,0,0,0.5)] dark:shadow-[0_0_7px_rgba(255,255,255,0.5)] animate-pulse" />
        </span>
      )}

      {/* 4. Beam: Sleek modern glowing cursor bar */}
      {currentStyle === 'beam' && (
        <span className="inline-block w-1.5 h-4 bg-gradient-to-b from-zinc-900 to-zinc-600 dark:from-zinc-100 dark:to-zinc-400 rounded-full shadow-[0_0_7px_rgba(0,0,0,0.4)] dark:shadow-[0_0_7px_rgba(255,255,255,0.4)] animate-pulse" />
      )}
    </span>
  );
};
