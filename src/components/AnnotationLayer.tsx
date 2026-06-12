import { useRef, useState, type PointerEvent } from 'react';
import {
  useEditorStore,
  selectPageAnnotations,
  newAnnotationId,
} from '../state/editorStore';
import type {
  TextAnnotation,
  PathAnnotation,
  LineAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
} from '../types/annotation';
import { TextBox } from './TextBox';
import { SvgAnnotation } from './SvgAnnotation';
import {
  PathSelectionOverlay,
  LineSelectionOverlay,
  ShapeSelectionOverlay,
  ImageSelectionOverlay,
  type Corner,
} from './SelectionOverlay';
import { smoothPath, arrowHeadPath, normalizeRect } from '../lib/svg-path';

interface Props {
  pageNumber: number;
  width: number;   // CSS pixels at current scale
  height: number;
  scale: number;
}

// Default size for a freshly-dropped text box, expressed in scale-1.0 CSS px.
const DEFAULT_TEXT_W = 160;
const DEFAULT_TEXT_H = 28;
// Minimum shape area (scale-1.0 px²) below which we discard the drawing.
const MIN_SHAPE_AREA = 4;
// Pointer must travel this many CSS pixels before a click becomes a drag.
const DRAG_THRESHOLD = 4;
// Minimum shape size while resizing.
const MIN_SHAPE_DIM = 4;
// Arrow head size as a multiple of stroke width.
const ARROW_HEAD_RATIO = 4;

type DrawingState =
  | {
      kind: 'path';
      variant: 'pen' | 'highlighter';
      points: { x: number; y: number }[];
      color: string;
      width: number;
      opacity: number;
    }
  | {
      kind: 'line';
      x1: number; y1: number; x2: number; y2: number;
      color: string;
      width: number;
      arrow: boolean;
    }
  | {
      kind: 'shape';
      shape: 'rect' | 'ellipse';
      x: number; y: number; w: number; h: number;
      stroke: string;
      fill: string | null;
      width: number;
    };

export function AnnotationLayer({ pageNumber, width, height, scale }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const annotations = useEditorStore(selectPageAnnotations(pageNumber));
  const selectedId = useEditorStore((s) => s.selectedId);
  const tool = useEditorStore((s) => s.tool);
  const style = useEditorStore((s) => s.style);
  const add = useEditorStore((s) => s.addAnnotation);
  const select = useEditorStore((s) => s.select);
  const patch = useEditorStore((s) => s.patchAnnotation);
  const commit = useEditorStore((s) => s.commit);

  const [drawing, setDrawing] = useState<DrawingState | null>(null);

  function pointerToCanonical(clientX: number, clientY: number) {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }

  // ---------- Layer-level pointerdown: deselect / new annotation ----------

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Temporary diagnostic — remove once the Text-tool issue is understood.
    const targetEl = e.target as HTMLElement;
    console.log(
      `[pdfeditor] tool=${tool} sameTarget=${e.target === e.currentTarget} ` +
      `tag=${targetEl?.tagName} class="${targetEl?.className}"`,
    );
    // Bubbled from an annotation child — let the child handle it.
    if (e.target !== e.currentTarget) return;
    const { x, y } = pointerToCanonical(e.clientX, e.clientY);

    if (tool === 'text') {
      const newId = newAnnotationId();
      const newW = DEFAULT_TEXT_W;
      const newH = Math.max(DEFAULT_TEXT_H, style.fontSize + 8);
      console.log(
        `[pdfeditor] adding text id=${newId} at x=${x} y=${y} w=${newW} h=${newH} scale=${scale}`,
      );
      add({
        id: newId,
        page: pageNumber,
        kind: 'text',
        x, y,
        w: newW,
        h: newH,
        text: '',
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        color: style.color,
      });
      setTimeout(() => {
        const after = useEditorStore.getState();
        const list = after.annotations[pageNumber] ?? [];
        const found = list.find((a) => a.id === newId);
        console.log(
          `[pdfeditor] after add: store has ${list.length} on page ${pageNumber}, ` +
          `found=${!!found}, selectedId=${after.selectedId}, pendingFocusId=${after.pendingFocusId}`,
        );
      }, 0);
      return;
    }
    if (tool === 'select') {
      select(null);
      return;
    }
    if (tool === 'edit-existing') {
      // Blank-area clicks in this mode do nothing; hotspots in
      // ExistingItemsLayer (rendered above this) own the interaction.
      return;
    }
    if (tool === 'image') {
      const pending = useEditorStore.getState().pendingImage;
      if (!pending) return;
      // Cap default placement size so giant source images don't fill the page.
      const MAX_DEFAULT_W = 240;
      let w = pending.w, h = pending.h;
      if (w > MAX_DEFAULT_W) {
        const ratio = MAX_DEFAULT_W / w;
        w = MAX_DEFAULT_W;
        h = h * ratio;
      }
      add({
        id: newAnnotationId(),
        page: pageNumber,
        kind: 'image',
        x: x - w / 2,
        y: y - h / 2,
        w,
        h,
        src: pending.src,
      });
      useEditorStore.getState().setPendingImage(null);
      useEditorStore.getState().setTool('select');
      return;
    }
    if (tool === 'pen' || tool === 'highlighter') startPath(x, y, tool);
    else if (tool === 'line' || tool === 'arrow') startLine(x, y, tool === 'arrow');
    else if (tool === 'rect' || tool === 'ellipse') startShape(x, y, tool);
  }

  // ---------- Drawing creation (pen / highlighter / line / arrow / shape) ----------

  function startPath(x0: number, y0: number, variant: 'pen' | 'highlighter') {
    const opacity = variant === 'highlighter' ? style.highlighterOpacity : 1;
    setDrawing({
      kind: 'path', variant,
      points: [{ x: x0, y: y0 }],
      color: style.color, width: style.strokeWidth, opacity,
    });
    const onMove = (ev: globalThis.PointerEvent) => {
      const { x, y } = pointerToCanonical(ev.clientX, ev.clientY);
      setDrawing((d) => (d?.kind === 'path' ? { ...d, points: [...d.points, { x, y }] } : d));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrawing((d) => {
        if (d?.kind !== 'path') return null;
        if (d.points.length < 2) return null;
        add({
          id: newAnnotationId(), page: pageNumber, kind: 'path',
          variant: d.variant, points: d.points,
          color: d.color, width: d.width, opacity: d.opacity,
        });
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startLine(x0: number, y0: number, arrow: boolean) {
    setDrawing({
      kind: 'line',
      x1: x0, y1: y0, x2: x0, y2: y0,
      color: style.color, width: style.strokeWidth, arrow,
    });
    const onMove = (ev: globalThis.PointerEvent) => {
      const { x, y } = pointerToCanonical(ev.clientX, ev.clientY);
      setDrawing((d) => (d?.kind === 'line' ? { ...d, x2: x, y2: y } : d));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrawing((d) => {
        if (d?.kind !== 'line') return null;
        if (d.x1 === d.x2 && d.y1 === d.y2) return null;
        add({
          id: newAnnotationId(), page: pageNumber, kind: 'line',
          x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
          color: d.color, width: d.width, arrow: d.arrow,
        });
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startShape(x0: number, y0: number, shape: 'rect' | 'ellipse') {
    setDrawing({
      kind: 'shape', shape,
      x: x0, y: y0, w: 0, h: 0,
      stroke: style.color, fill: style.fill, width: style.strokeWidth,
    });
    const onMove = (ev: globalThis.PointerEvent) => {
      const { x, y } = pointerToCanonical(ev.clientX, ev.clientY);
      setDrawing((d) => (d?.kind === 'shape' ? { ...d, w: x - d.x, h: y - d.y } : d));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrawing((d) => {
        if (d?.kind !== 'shape') return null;
        const r = normalizeRect(d.x, d.y, d.w, d.h);
        if (r.w * r.h < MIN_SHAPE_AREA) return null;
        add({
          id: newAnnotationId(), page: pageNumber, kind: 'shape',
          shape: d.shape,
          x: r.x, y: r.y, w: r.w, h: r.h,
          stroke: d.stroke, fill: d.fill, width: d.width,
        });
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------- Select / move / resize / endpoint-drag (drawn annotations) ----------

  function onAnnotationDown(a: PathAnnotation | LineAnnotation | ShapeAnnotation | ImageAnnotation) {
    return (e: PointerEvent<SVGElement>) => {
      e.stopPropagation();
      select(a.id);

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      // Snapshot the geometry at pointer-down so each delta is computed from
      // the original — drift-free even with rapid pointer-move callbacks.
      const snap = snapshotGeometry(a);
      let dragging = false;

      const onMove = (ev: globalThis.PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          dragging = true;
          commit();
        }
        if (dragging) {
          const ddx = dx / scale;
          const ddy = dy / scale;
          applyTranslate(a.id, a.kind, snap, ddx, ddy);
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  function applyTranslate(
    id: string,
    kind: 'path' | 'line' | 'shape' | 'image',
    snap: GeometrySnapshot,
    ddx: number,
    ddy: number,
  ) {
    if (kind === 'path') {
      patch(id, { points: snap.points!.map((p) => ({ x: p.x + ddx, y: p.y + ddy })) });
    } else if (kind === 'line') {
      patch(id, {
        x1: snap.x1! + ddx, y1: snap.y1! + ddy,
        x2: snap.x2! + ddx, y2: snap.y2! + ddy,
      });
    } else {
      patch(id, { x: snap.x! + ddx, y: snap.y! + ddy });
    }
  }

  function onBboxCornerDown(a: ShapeAnnotation | ImageAnnotation, corner: Corner) {
    return (e: PointerEvent<SVGElement>) => {
      e.stopPropagation();
      select(a.id);
      commit();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const { x: x0, y: y0, w: w0, h: h0 } = a;
      const onMove = (ev: globalThis.PointerEvent) => {
        const dx = (ev.clientX - startClientX) / scale;
        const dy = (ev.clientY - startClientY) / scale;
        let nx = x0, ny = y0, nw = w0, nh = h0;
        if (corner === 'nw') { nx = x0 + dx; ny = y0 + dy; nw = w0 - dx; nh = h0 - dy; }
        if (corner === 'ne') {                ny = y0 + dy; nw = w0 + dx; nh = h0 - dy; }
        if (corner === 'sw') { nx = x0 + dx;                nw = w0 - dx; nh = h0 + dy; }
        if (corner === 'se') {                              nw = w0 + dx; nh = h0 + dy; }
        if (nw < MIN_SHAPE_DIM) {
          if (corner === 'nw' || corner === 'sw') nx = x0 + w0 - MIN_SHAPE_DIM;
          nw = MIN_SHAPE_DIM;
        }
        if (nh < MIN_SHAPE_DIM) {
          if (corner === 'nw' || corner === 'ne') ny = y0 + h0 - MIN_SHAPE_DIM;
          nh = MIN_SHAPE_DIM;
        }
        patch(a.id, { x: nx, y: ny, w: nw, h: nh });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  function onLineEndpointDown(a: LineAnnotation, which: 'start' | 'end') {
    return (e: PointerEvent<SVGElement>) => {
      e.stopPropagation();
      select(a.id);
      commit();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const x0 = which === 'start' ? a.x1 : a.x2;
      const y0 = which === 'start' ? a.y1 : a.y2;
      const onMove = (ev: globalThis.PointerEvent) => {
        const dx = (ev.clientX - startClientX) / scale;
        const dy = (ev.clientY - startClientY) / scale;
        const nx = x0 + dx, ny = y0 + dy;
        if (which === 'start') patch(a.id, { x1: nx, y1: ny });
        else patch(a.id, { x2: nx, y2: ny });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  // ---------- Partition annotations by kind ----------

  const textAnnotations: TextAnnotation[] = [];
  const svgAnnotations: (PathAnnotation | LineAnnotation | ShapeAnnotation | ImageAnnotation)[] = [];
  for (const a of annotations) {
    if (a.kind === 'text') textAnnotations.push(a);
    else svgAnnotations.push(a);
  }
  const selectedSvg = svgAnnotations.find((a) => a.id === selectedId) ?? null;
  const interactive = tool === 'select';

  return (
    <div
      ref={layerRef}
      className={`annotation-layer annotation-layer--tool-${tool}`}
      style={{ width, height }}
      onPointerDown={onPointerDown}
    >
      <svg
        className="annotation-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {svgAnnotations.map((a) => (
          <SvgAnnotation
            key={a.id}
            a={a}
            scale={scale}
            interactive={interactive}
            onPointerDown={onAnnotationDown(a)}
          />
        ))}
        {drawing && renderPreview(drawing, scale)}
        {/* Selection overlay last so handles render on top of every annotation. */}
        {selectedSvg && (
          selectedSvg.kind === 'path' ? (
            <PathSelectionOverlay a={selectedSvg} scale={scale} />
          ) : selectedSvg.kind === 'line' ? (
            <LineSelectionOverlay
              a={selectedSvg}
              scale={scale}
              onEndpointDown={(which) => onLineEndpointDown(selectedSvg, which)}
            />
          ) : selectedSvg.kind === 'image' ? (
            <ImageSelectionOverlay
              a={selectedSvg}
              scale={scale}
              onCornerDown={(corner) => onBboxCornerDown(selectedSvg, corner)}
            />
          ) : (
            <ShapeSelectionOverlay
              a={selectedSvg}
              scale={scale}
              onCornerDown={(corner) => onBboxCornerDown(selectedSvg, corner)}
            />
          )
        )}
      </svg>
      {textAnnotations.map((a) => (
        <TextBox key={a.id} annotation={a} scale={scale} />
      ))}
    </div>
  );
}

// ---------- Snapshot type & helper ----------

interface GeometrySnapshot {
  // Only fields relevant to the annotation kind are populated.
  points?: { x: number; y: number }[];
  x?: number; y?: number;
  x1?: number; y1?: number;
  x2?: number; y2?: number;
}
function snapshotGeometry(
  a: PathAnnotation | LineAnnotation | ShapeAnnotation | ImageAnnotation,
): GeometrySnapshot {
  if (a.kind === 'path') return { points: a.points.map((p) => ({ ...p })) };
  if (a.kind === 'line') return { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
  return { x: a.x, y: a.y };
}

// ---------- Drawing-preview render (local state, not committed) ----------

function renderPreview(d: DrawingState, scale: number) {
  if (d.kind === 'path') {
    const points = d.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    return (
      <path
        d={smoothPath(points)}
        stroke={d.color}
        strokeWidth={d.width * scale}
        strokeOpacity={d.opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={d.variant === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
      />
    );
  }
  if (d.kind === 'line') {
    const x1 = d.x1 * scale, y1 = d.y1 * scale;
    const x2 = d.x2 * scale, y2 = d.y2 * scale;
    const sw = d.width * scale;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={sw} strokeLinecap="round" />
        {d.arrow && (
          <path
            d={arrowHeadPath(x1, y1, x2, y2, sw * ARROW_HEAD_RATIO)}
            stroke={d.color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </g>
    );
  }
  const r = normalizeRect(d.x, d.y, d.w, d.h);
  const x = r.x * scale, y = r.y * scale, w = r.w * scale, h = r.h * scale;
  const sw = d.width * scale;
  const fill = d.fill ?? 'none';
  if (d.shape === 'rect') {
    return <rect x={x} y={y} width={w} height={h} stroke={d.stroke} strokeWidth={sw} fill={fill} />;
  }
  return (
    <ellipse
      cx={x + w / 2}
      cy={y + h / 2}
      rx={w / 2}
      ry={h / 2}
      stroke={d.stroke}
      strokeWidth={sw}
      fill={fill}
    />
  );
}
