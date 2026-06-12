import { rgb, type Color } from 'pdf-lib';

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

// Accepts "#rgb" and "#rrggbb" (or without the leading hash).
export function hexToRgb(hex: string): Rgb01 {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    // Defensive fallback to black on bad input — never throw during save.
    return { r: 0, g: 0, b: 0 };
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function pdfColor(hex: string): Color {
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
}
