import type { PointerEvent } from 'react';
import type {
  PathAnnotation,
  LineAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
} from '../types/annotation';
import { smoothPath, arrowHeadPath } from '../lib/svg-path';

// Minimum hit-area thickness in CSS pixels at current scale. The visible
// stroke can be 1 px, but the hit area should always be wide enough to click
// reliably without aiming.
const HIT_THICKNESS = 14;
const ARROW_HEAD_RATIO = 4;

export type SvgKindAnnotation =
  | PathAnnotation
  | LineAnnotation
  | ShapeAnnotation
  | ImageAnnotation;

interface Props {
  a: SvgKindAnnotation;
  scale: number;
  // True when the select tool is active. Controls whether the hit area
  // captures pointer events.
  interactive: boolean;
  onPointerDown: (e: PointerEvent<SVGElement>) => void;
}

export function SvgAnnotation({ a, scale, interactive, onPointerDown }: Props) {
  if (a.kind === 'path') return renderPath(a, scale, interactive, onPointerDown);
  if (a.kind === 'line') return renderLine(a, scale, interactive, onPointerDown);
  if (a.kind === 'image') return renderImage(a, scale, interactive, onPointerDown);
  return renderShape(a, scale, interactive, onPointerDown);
}

function renderPath(
  a: PathAnnotation,
  scale: number,
  interactive: boolean,
  onPointerDown: (e: PointerEvent<SVGElement>) => void,
) {
  const points = a.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const d = smoothPath(points);
  const sw = a.width * scale;
  const hitWidth = Math.max(sw, HIT_THICKNESS);
  return (
    <g>
      {/* Hit area — wide transparent stroke, only clickable when interactive */}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={hitWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ pointerEvents: interactive ? 'stroke' : 'none', cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      {/* Visible stroke */}
      <path
        d={d}
        stroke={a.color}
        strokeWidth={sw}
        strokeOpacity={a.opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{
          pointerEvents: 'none',
          ...(a.variant === 'highlighter' ? { mixBlendMode: 'multiply' } : {}),
        }}
      />
    </g>
  );
}

function renderLine(
  a: LineAnnotation,
  scale: number,
  interactive: boolean,
  onPointerDown: (e: PointerEvent<SVGElement>) => void,
) {
  const x1 = a.x1 * scale, y1 = a.y1 * scale;
  const x2 = a.x2 * scale, y2 = a.y2 * scale;
  const sw = a.width * scale;
  const hitWidth = Math.max(sw, HIT_THICKNESS);
  return (
    <g>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent"
        strokeWidth={hitWidth}
        strokeLinecap="round"
        style={{ pointerEvents: interactive ? 'stroke' : 'none', cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={a.color}
        strokeWidth={sw}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      {a.arrow && (
        <path
          d={arrowHeadPath(x1, y1, x2, y2, sw * ARROW_HEAD_RATIO)}
          stroke={a.color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}

function renderImage(
  a: ImageAnnotation,
  scale: number,
  interactive: boolean,
  onPointerDown: (e: PointerEvent<SVGElement>) => void,
) {
  const x = a.x * scale, y = a.y * scale;
  const w = a.w * scale, h = a.h * scale;
  return (
    <g>
      <image
        href={a.src}
        x={x}
        y={y}
        width={w}
        height={h}
        preserveAspectRatio="none"
        style={{ pointerEvents: 'none' }}
      />
      <rect
        x={x} y={y} width={w} height={h}
        fill="transparent" stroke="transparent"
        style={{ pointerEvents: interactive ? 'all' : 'none', cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
    </g>
  );
}

function renderShape(
  a: ShapeAnnotation,
  scale: number,
  interactive: boolean,
  onPointerDown: (e: PointerEvent<SVGElement>) => void,
) {
  const x = a.x * scale, y = a.y * scale;
  const w = a.w * scale, h = a.h * scale;
  const sw = a.width * scale;
  const fill = a.fill ?? 'none';
  const visualProps = {
    stroke: a.stroke,
    strokeWidth: sw,
    fill,
    style: { pointerEvents: 'none' as const },
  };
  // Hit element is a transparent fill covering the shape's bounding box.
  // For filled shapes this is the same as the visible. For outline-only
  // shapes, the transparent fill captures clicks inside the outline too.
  const hitStyle = {
    pointerEvents: (interactive ? 'all' : 'none') as 'all' | 'none',
    cursor: 'move' as const,
  };

  if (a.shape === 'rect') {
    return (
      <g>
        <rect
          x={x} y={y} width={w} height={h}
          fill="transparent" stroke="transparent"
          style={hitStyle}
          onPointerDown={onPointerDown}
        />
        <rect x={x} y={y} width={w} height={h} {...visualProps} />
      </g>
    );
  }
  return (
    <g>
      <ellipse
        cx={x + w / 2} cy={y + h / 2}
        rx={w / 2} ry={h / 2}
        fill="transparent" stroke="transparent"
        style={hitStyle}
        onPointerDown={onPointerDown}
      />
      <ellipse
        cx={x + w / 2} cy={y + h / 2}
        rx={w / 2} ry={h / 2}
        {...visualProps}
      />
    </g>
  );
}
