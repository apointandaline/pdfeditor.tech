import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { DropZone } from './components/DropZone';
import { PdfViewer } from './components/PdfViewer';
import { Toolbar } from './components/Toolbar';
import { ToolRail } from './components/ToolRail';
import { StylePanel } from './components/StylePanel';
import { PageThumbs } from './components/PageThumbs';
import { loadPdf } from './pdf/loader';
import { savePdf, downloadPdfBytes, suggestedFilename } from './pdf/save';
import { useEditorStore } from './state/editorStore';
import { useUndoShortcuts } from './hooks/useUndoShortcuts';
import { useToolShortcuts } from './hooks/useToolShortcuts';
import { useSelectionShortcuts } from './hooks/useSelectionShortcuts';
import { useZoomShortcuts, useCtrlWheelZoom } from './hooks/useZoomShortcuts';
import { loadImageDims } from './lib/image';
import './App.css';

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;
const VIEWER_PADDING = 48; // matches .viewer padding * 2

function nextZoomStep(scale: number, direction: 1 | -1): number {
  const idx = ZOOM_STEPS.findIndex((s) => Math.abs(s - scale) < 0.001);
  if (idx === -1) {
    const next = direction === 1
      ? ZOOM_STEPS.find((s) => s > scale)
      : [...ZOOM_STEPS].reverse().find((s) => s < scale);
    if (next != null) return next;
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (direction === 1 ? 1.25 : 0.8)));
  }
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + direction))];
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [scale, setScale] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Natural (scale-1.0) width of page 1 — used for fit-width.
  const [page1Width, setPage1Width] = useState<number | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Track previous tool so we only auto-open the picker on the transition
  // INTO the image tool, not on every render while it stays active.
  const prevToolRef = useRef<string>('select');

  const tool = useEditorStore((s) => s.tool);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const doc = await loadPdf(buf);
      setBytes(buf);
      setPdf(doc);
      setFileName(file.name);
      useEditorStore.getState().resetAnnotations();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load PDF');
    } finally {
      setBusy(false);
    }
  }, []);

  // Resolve page-1 width once the doc loads (used for fit-width calculation).
  useEffect(() => {
    if (!pdf) {
      setPage1Width(null);
      return;
    }
    let cancelled = false;
    pdf.getPage(1).then((p) => {
      if (cancelled) return;
      setPage1Width(p.getViewport({ scale: 1.0 }).width);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const zoomIn    = useCallback(() => setScale((s) => clampScale(nextZoomStep(s,  1))), []);
  const zoomOut   = useCallback(() => setScale((s) => clampScale(nextZoomStep(s, -1))), []);
  const zoomReset = useCallback(() => setScale(1.0), []);
  const fitWidth  = useCallback(() => {
    if (!page1Width || !viewerRef.current) return;
    const w = viewerRef.current.clientWidth - VIEWER_PADDING;
    setScale(clampScale(w / page1Width));
  }, [page1Width]);

  // Open the file picker the first time the Image tool becomes active (and
  // there's no pending image staged yet).
  useEffect(() => {
    if (tool === 'image' && prevToolRef.current !== 'image') {
      const pending = useEditorStore.getState().pendingImage;
      if (!pending) imageInputRef.current?.click();
    }
    prevToolRef.current = tool;
  }, [tool]);

  async function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) {
      // User cancelled — fall back to Select so the user isn't stuck.
      useEditorStore.getState().setTool('select');
      return;
    }
    try {
      const src = await readAsDataUrl(file);
      const { w, h } = await loadImageDims(src);
      useEditorStore.getState().setPendingImage({ src, w, h, name: file.name });
      // Stay on the image tool so the next click places it.
    } catch (err) {
      console.error('Image load failed:', err);
      alert('Could not load that image.');
      useEditorStore.getState().setTool('select');
    }
  }

  useUndoShortcuts();
  useToolShortcuts();
  useSelectionShortcuts();
  useZoomShortcuts({
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onZoomReset: zoomReset,
    onFitWidth: fitWidth,
  });
  useCtrlWheelZoom(viewerRef, useCallback((dir: 1 | -1) => {
    setScale((s) => clampScale(nextZoomStep(s, dir)));
  }, []));

  // Window-level drag & drop — swap the open PDF without going back to the
  // empty-state dropzone. Confirms first if there are unsaved annotations.
  useEffect(() => {
    function isFileDrag(e: DragEvent) {
      return e.dataTransfer?.types.includes('Files') ?? false;
    }
    function onDragOver(e: DragEvent) {
      if (isFileDrag(e)) e.preventDefault();
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file || !isPdfFile(file)) return;
      if (pdf) {
        const hasAnnotations = Object.values(useEditorStore.getState().annotations)
          .some((list) => list.length > 0);
        if (hasAnnotations && !confirm('Switching files will discard your current edits. Continue?')) {
          return;
        }
      }
      handleFile(file);
    }
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [pdf, handleFile]);

  function reset() {
    pdf?.cleanup();
    setPdf(null);
    setBytes(null);
    setFileName(null);
    setScale(1.0);
    useEditorStore.getState().resetAnnotations();
  }

  async function onSave() {
    if (!bytes) return;
    setSaving(true);
    try {
      const annotations = useEditorStore.getState().annotations;
      const out = await savePdf(bytes, annotations);
      downloadPdfBytes(out, suggestedFilename(fileName));
    } catch (e) {
      console.error(e);
      alert(`Failed to save PDF: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  }

  function jumpToPage(n: number) {
    const target = viewerRef.current?.querySelector(`[data-page="${n}"]`);
    if (target) {
      (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (!pdf) {
    return <DropZone onFile={handleFile} busy={busy} error={error} />;
  }

  return (
    <div className="app">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={onImageFileChange}
      />
      <Toolbar
        fileName={fileName}
        pageCount={pdf.numPages}
        scale={scale}
        saving={saving}
        canFitWidth={page1Width != null}
        onScaleChange={(s) => setScale(clampScale(s))}
        onFitWidth={fitWidth}
        onSave={onSave}
        onReset={reset}
      />
      <div className="workspace">
        <ToolRail />
        <PageThumbs pdf={pdf} onJumpTo={jumpToPage} />
        <main className="workspace__main">
          <StylePanel />
          <div className={`viewer-wrap cursor-${tool}`}>
            <PdfViewer pdf={pdf} scale={scale} scrollerRef={viewerRef} />
          </div>
        </main>
      </div>
    </div>
  );
}

function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
