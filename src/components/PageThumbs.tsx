import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

const THUMB_WIDTH = 100;

interface Props {
  pdf: PDFDocumentProxy;
  onJumpTo: (pageNumber: number) => void;
}

export function PageThumbs({ pdf, onJumpTo }: Props) {
  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  return (
    <aside className="thumbs" aria-label="Page thumbnails">
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          className="thumbs__item"
          onClick={() => onJumpTo(n)}
          title={`Jump to page ${n}`}
        >
          <Thumb pdf={pdf} pageNumber={n} />
          <span className="thumbs__label">{n}</span>
        </button>
      ))}
    </aside>
  );
}

function Thumb({ pdf, pageNumber }: { pdf: PDFDocumentProxy; pageNumber: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Don't queue a render until the thumb is actually visible — for 100-page
  // PDFs this avoids 100 concurrent render tasks at mount.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: el.closest('.thumbs'), rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const vp1 = page.getViewport({ scale: 1.0 });
      const scale = THUMB_WIDTH / vp1.width;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpr });
      const cssViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(cssViewport.width)}px`;
      canvas.style.height = `${Math.floor(cssViewport.height)}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      task = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        // cancelled — fine
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, visible]);

  return (
    <div ref={containerRef} className="thumbs__canvas-wrap">
      <canvas ref={canvasRef} className="thumbs__canvas" />
    </div>
  );
}
