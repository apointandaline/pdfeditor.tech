import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { AnnotationLayer } from './AnnotationLayer';
import { ExistingItemsLayer } from './ExistingItemsLayer';
import { useEditorStore } from '../state/editorStore';
import { acquireRenderSlot } from '../pdf/renderQueue';

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}

export function PdfPage({ pdf, pageNumber, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // CSS-pixel size at current scale — used to size the annotation overlay.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [rendering, setRendering] = useState(true);
  const tool = useEditorStore((s) => s.tool);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    let release: (() => void) | null = null;
    setRendering(true);

    (async () => {
      release = await acquireRenderSlot();
      if (cancelled) return;

      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale });
        const cssW = Math.floor(cssViewport.width);
        const cssH = Math.floor(cssViewport.height);

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        setDims({ w: cssW, h: cssH });

        task = page.render({ canvas, canvasContext: ctx, viewport });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (err) {
        if (cancelled) return; // cancellation during rapid zoom is expected
        console.error(`Failed to render page ${pageNumber}:`, err);
        setRendering(false); // stop the shimmer even on failure
      } finally {
        release?.();
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      release?.();
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div
      className="pdf-page-wrap"
      data-page={pageNumber}
      style={dims ? { width: dims.w, height: dims.h } : undefined}
    >
      <canvas ref={canvasRef} className="pdf-page" />
      {rendering && <div className="pdf-page__loading" aria-label="Loading page" />}
      {dims && (
        <AnnotationLayer
          pageNumber={pageNumber}
          width={dims.w}
          height={dims.h}
          scale={scale}
        />
      )}
      {dims && tool === 'edit-existing' && (
        <ExistingItemsLayer
          pdf={pdf}
          pageNumber={pageNumber}
          width={dims.w}
          height={dims.h}
          scale={scale}
          pageCanvasRef={canvasRef}
        />
      )}
    </div>
  );
}
