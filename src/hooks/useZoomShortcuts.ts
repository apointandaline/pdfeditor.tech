import { useEffect } from 'react';

interface Handlers {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFitWidth: () => void;
}

// + / =  → zoom in
// - / _  → zoom out
//   0    → reset to 100%
//   F    → fit width
// Ctrl+0 always resets, even from inside a textbox.
export function useZoomShortcuts({ onZoomIn, onZoomOut, onZoomReset, onFitWidth }: Handlers) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        onZoomReset();
        return;
      }
      if (inField) return;

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          onZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          onZoomOut();
          break;
        case '0':
          e.preventDefault();
          onZoomReset();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          onFitWidth();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onZoomIn, onZoomOut, onZoomReset, onFitWidth]);
}

// Ctrl+wheel on the given element scrolls the page's CSS zoom by default —
// intercept it and call onZoom(direction) instead.
export function useCtrlWheelZoom(
  scrollerRef: React.RefObject<HTMLElement | null>,
  onZoom: (direction: 1 | -1) => void,
) {
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoom(e.deltaY > 0 ? -1 : 1);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scrollerRef, onZoom]);
}
