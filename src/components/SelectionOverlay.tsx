import type { PointerEvent } from 'react';
import type {
  PathAnnotation,
  LineAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
} from '../types/annotation';
import { pathBounds, lineBounds, shapeBounds, imageBounds } from '../lib/bounds';

const ACCENT = 'var(--accent)';
const HANDLE_SIZE = 10;            // px on screen
const BBOX_PADDING = 2;            // px around content (in CSS px at current scale)

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface PathOverlayProps {
  a: PathAnnotation;
  scale: number;
}

interface LineOverlayProps {
  a: LineAnnotation;
  scale: number;
  onEndpointDown: (which: 'start' | 'end') => (e: PointerEvent<SVGElement>) => void;
}

interface ShapeOverlayProps {
  a: ShapeAnnotation;
  scale: number;
  onCornerDown: (c: Corner) => (e: PointerEvent<SVGElement>) => void;
}

export function PathSelectionOverlay({ a, scale }: PathOverlayProps) {
  const b = pathBounds(a);
  return <BoundingBox b={b} scale={scale} />;
}

export function LineSelectionOverlay({ a, scale, onEndpointDown }: LineOverlayProps) {
  const b = lineBounds(a);
  return (
    <g>
      <BoundingBox b={b} scale={scale} />
      <Handle x={a.x1 * scale} y={a.y1 * scale} cursor="move" onPointerDown={onEndpointDown('start')} />
      <Handle x={a.x2 * scale} y={a.y2 * scale} cursor="move" onPointerDown={onEndpointDown('end')} />
    </g>
  );
}

export function ShapeSelectionOverlay({ a, scale, onCornerDown }: ShapeOverlayProps) {
  const b = shapeBounds(a);
  return <BboxCornerHandles b={b} scale={scale} onCornerDown={onCornerDown} />;
}

interface ImageOverlayProps {
  a: ImageAnnotation;
  scale: number;
  onCornerDown: (c: Corner) => (e: PointerEvent<SVGElement>) => void;
}
export function ImageSelectionOverlay({ a, scale, onCornerDown }: ImageOverlayProps) {
  const b = imageBounds(a);
  return <BboxCornerHandles b={b} scale={scale} onCornerDown={onCornerDown} />;
}

interface BboxHandlesProps {
  b: { x: number; y: number; w: number; h: number };
  scale: number;
  onCornerDown: (c: Corner) => (e: PointerEvent<SVGElement>) => void;
}
function BboxCornerHandles({ b, scale, onCornerDown }: BboxHandlesProps) {
  const x1 = b.x * scale, y1 = b.y * scale;
  const x2 = (b.x + b.w) * scale, y2 = (b.y + b.h) * scale;
  return (
    <g>
      <BoundingBox b={b} scale={scale} />
      <Handle x={x1} y={y1} cursor="nwse-resize" onPointerDown={onCornerDown('nw')} />
      <Handle x={x2} y={y1} cursor="nesw-resize" onPointerDown={onCornerDown('ne')} />
      <Handle x={x1} y={y2} cursor="nesw-resize" onPointerDown={onCornerDown('sw')} />
      <Handle x={x2} y={y2} cursor="nwse-resize" onPointerDown={onCornerDown('se')} />
    </g>
  );
}

interface BBoxProps { b: { x: number; y: number; w: number; h: number }; scale: number; }
function BoundingBox({ b, scale }: BBoxProps) {
  return (
    <rect
      x={b.x * scale - BBOX_PADDING}
      y={b.y * scale - BBOX_PADDING}
      width={b.w * scale + 2 * BBOX_PADDING}
      height={b.h * scale + 2 * BBOX_PADDING}
      fill="none"
      stroke={ACCENT}
      strokeWidth={1.5}
      strokeDasharray="4 3"
      style={{ pointerEvents: 'none' }}
    />
  );
}

interface HandleProps {
  x: number;
  y: number;
  cursor: string;
  onPointerDown: (e: PointerEvent<SVGElement>) => void;
}
function Handle({ x, y, cursor, onPointerDown }: HandleProps) {
  const half = HANDLE_SIZE / 2;
  return (
    <rect
      x={x - half}
      y={y - half}
      width={HANDLE_SIZE}
      height={HANDLE_SIZE}
      fill="#fff"
      stroke={ACCENT}
      strokeWidth={1.5}
      style={{ pointerEvents: 'all', cursor }}
      onPointerDown={onPointerDown}
    />
  );
}
