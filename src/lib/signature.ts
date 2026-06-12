// Render a name in a cursive font onto a canvas, return PNG data URL + size.
// Output dims are in CSS pixels (PDF points equivalent at scale 1.0); the
// internal canvas is upscaled 2x for crispness.

const FONT_FAMILY = '"Dancing Script", cursive';
const FONT_SIZE = 56;
const FONT_WEIGHT = 600;
const PADDING = 16;
const RENDER_DPR = 2;

export async function renderSignature(
  name: string,
): Promise<{ src: string; w: number; h: number }> {
  // Make sure the webfont has loaded before measuring/drawing — otherwise
  // we'd render with the fallback (cursive) and the metrics would be wrong.
  await document.fonts.load(`${FONT_WEIGHT} ${FONT_SIZE}px "Dancing Script"`);

  const fontSpec = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('Canvas 2D context unavailable');
  measureCtx.font = fontSpec;
  const metrics = measureCtx.measureText(name);
  const ascent = metrics.actualBoundingBoxAscent || FONT_SIZE * 0.85;
  const descent = metrics.actualBoundingBoxDescent || FONT_SIZE * 0.35;

  const w = Math.ceil(metrics.width) + PADDING * 2;
  const h = Math.ceil(ascent + descent) + PADDING * 2;

  const canvas = document.createElement('canvas');
  canvas.width = w * RENDER_DPR;
  canvas.height = h * RENDER_DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(RENDER_DPR, RENDER_DPR);
  ctx.fillStyle = '#000';
  ctx.font = fontSpec;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, PADDING, PADDING + ascent);

  return { src: canvas.toDataURL('image/png'), w, h };
}
