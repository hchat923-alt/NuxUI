import React, { useEffect, useState, useRef } from 'react';

interface TooltipState {
  visible: boolean;
  text: string;
  shortcut?: string;
  x: number;
  y: number;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export const GlobalTooltip: React.FC = () => {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: '',
    shortcut: undefined,
    x: 0,
    y: 0,
    position: 'bottom',
  });

  const hideTimeoutRef = useRef<any>(null);
  const showTimeoutRef = useRef<any>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const visibleRef = useRef(false);
  visibleRef.current = tooltip.visible;

  useEffect(() => {
    const handlePointerOver = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLElement>(
        '[title], [data-tooltip]'
      );

      if (!target) {
        if (visibleRef.current) {
          clearTimeout(showTimeoutRef.current);
          currentTargetRef.current = null;
          setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }
        return;
      }

      // Extract text from title or data-tooltip safely without mutating React DOM attributes
      const text = (target.getAttribute('data-tooltip') || target.getAttribute('title') || '').trim();
      if (!text) return;

      currentTargetRef.current = target;
      clearTimeout(hideTimeoutRef.current);
      clearTimeout(showTimeoutRef.current);

      // Preferred position from attribute or auto
      const preferredPos = (target.getAttribute('data-tooltip-position') || 'bottom') as
        | 'top'
        | 'bottom'
        | 'left'
        | 'right';
      const shortcut = target.getAttribute('data-tooltip-shortcut') || undefined;

      showTimeoutRef.current = setTimeout(() => {
        if (!currentTargetRef.current) return;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        let posX = rect.left + rect.width / 2;
        let posY = rect.bottom + 3; // Reduced tight margin (3px)
        let finalPos: 'top' | 'bottom' | 'left' | 'right' = preferredPos;

        if (preferredPos === 'top' || (preferredPos === 'bottom' && rect.bottom + 35 > window.innerHeight)) {
          posY = rect.top - 3;
          finalPos = 'top';
        } else if (preferredPos === 'bottom') {
          posY = rect.bottom + 3;
          finalPos = 'bottom';
        } else if (preferredPos === 'left') {
          posX = rect.left - 3;
          posY = rect.top + rect.height / 2;
          finalPos = 'left';
        } else if (preferredPos === 'right') {
          posX = rect.right + 3;
          posY = rect.top + rect.height / 2;
          finalPos = 'right';
        }

        // Clamp within viewport
        posX = Math.max(8, Math.min(posX, window.innerWidth - 8));
        posY = Math.max(8, Math.min(posY, window.innerHeight - 8));

        setTooltip({
          visible: true,
          text,
          shortcut,
          x: posX,
          y: posY,
          position: finalPos,
        });
      }, 90); // Snappy 90ms delay
    };

    const handlePointerOut = (e: PointerEvent) => {
      const related = e.relatedTarget as HTMLElement;
      if (currentTargetRef.current && related && currentTargetRef.current.contains(related)) {
        return;
      }
      clearTimeout(showTimeoutRef.current);
      currentTargetRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleScrollOrClick = () => {
      clearTimeout(showTimeoutRef.current);
      currentTargetRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('click', handleScrollOrClick, true);
    window.addEventListener('scroll', handleScrollOrClick, true);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('click', handleScrollOrClick, true);
      window.removeEventListener('scroll', handleScrollOrClick, true);
      clearTimeout(showTimeoutRef.current);
      clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  if (!tooltip.visible || !tooltip.text) return null;

  return (
    <div
      id="custom-global-tooltip"
      role="tooltip"
      className="fixed z-[99999] pointer-events-none select-none transition-all duration-100 ease-out"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform:
          tooltip.position === 'top'
            ? 'translate(-50%, -100%)'
            : tooltip.position === 'bottom'
            ? 'translate(-50%, 0)'
            : tooltip.position === 'left'
            ? 'translate(-100%, -50%)'
            : 'translate(0, -50%)',
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium leading-tight tracking-normal text-white bg-[#222224] dark:bg-[#1E1E20] border border-white/10 dark:border-white/15 rounded-md shadow-lg shadow-black/40 whitespace-pre-wrap max-w-xs text-center">
        <span>{tooltip.text}</span>
        {tooltip.shortcut && (
          <kbd className="px-1.5 py-0.5 text-[9.5px] font-mono font-medium text-neutral-300 bg-white/10 rounded border border-white/10">
            {tooltip.shortcut}
          </kbd>
        )}
      </div>
    </div>
  );
};
