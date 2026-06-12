import type { PathAnnotation, LineAnnotation, ShapeAnnotation, ImageAnnotation } from '../types/annotation';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pathBounds(a: PathAnnotation): Bounds {
  const pts = a.points;
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = pts[0].x, minY = pts[0].y, maxX = minX, maxY = minY;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function lineBounds(a: LineAnnotation): Bounds {
  const x = Math.min(a.x1, a.x2);
  const y = Math.min(a.y1, a.y2);
  return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
}

export function shapeBounds(a: ShapeAnnotation): Bounds {
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}

export function imageBounds(a: ImageAnnotation): Bounds {
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}
