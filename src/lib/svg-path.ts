// SVG path helpers used by the drawing tools.

// Catmull-Rom smoothing converted to a sequence of cubic beziers. Input is a
// list of pointer points, output is an SVG path "d" attribute. Endpoints are
// duplicated so the curve passes through the first and last points.
export function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) {
    // A bare dot — synthesize a 1-px line so the stroke shows up.
    const p = points[0];
    return `M ${fmt(p.x)} ${fmt(p.y)} L ${fmt(p.x + 0.01)} ${fmt(p.y)}`;
  }
  if (n === 2) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? points[i] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < n ? points[i + 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

// Returns an SVG "d" string for an arrowhead at (x2,y2) pointing along
// (x1,y1) → (x2,y2). `size` controls both length and width of the head.
export function arrowHeadPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const baseX = x2 - size * Math.cos(angle);
  const baseY = y2 - size * Math.sin(angle);
  const half = size / 2;
  const px1 = baseX + half * Math.sin(angle);
  const py1 = baseY - half * Math.cos(angle);
  const px2 = baseX - half * Math.sin(angle);
  const py2 = baseY + half * Math.cos(angle);
  return `M ${fmt(px1)} ${fmt(py1)} L ${fmt(x2)} ${fmt(y2)} L ${fmt(px2)} ${fmt(py2)}`;
}

// During a drag-to-create the rectangle's width/height may be negative.
// Normalize so we always store positive dims.
export function normalizeRect(x: number, y: number, w: number, h: number) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

function fmt(n: number): string {
  return n.toFixed(2);
}
