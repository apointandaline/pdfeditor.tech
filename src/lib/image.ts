// Decode a data URL (e.g. "data:image/png;base64,iVBOR…") into a Uint8Array.
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (header.includes(';base64')) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // URL-encoded fallback (rare for our case)
  return new TextEncoder().encode(decodeURIComponent(payload));
}

// "png" | "jpeg" — peek at the data URL's media type. pdf-lib's embedPng /
// embedJpg need to be chosen up-front.
export function dataUrlMime(dataUrl: string): 'png' | 'jpeg' {
  const m = dataUrl.match(/^data:image\/(png|jpe?g)/i);
  if (!m) return 'png';
  return m[1].toLowerCase().startsWith('jp') ? 'jpeg' : 'png';
}

// Crop a rectangular region of a canvas to a data URL.
// (cx, cy, cw, ch) are in canvas pixel coords (already include DPR).
export function captureCanvasRegion(
  canvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): string {
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.ceil(cw));
  tmp.height = Math.max(1, Math.ceil(ch));
  const ctx = tmp.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, tmp.width, tmp.height);
  return tmp.toDataURL('image/png');
}

// Load an image to measure natural width/height. Resolves with the dimensions.
export function loadImageDims(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
