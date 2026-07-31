// Global semaphore that limits how many PDF pages render concurrently.
// Large PDFs previously mounted every page at once, all racing to allocate
// high-res canvases and hit the pdfjs worker — enough of them failed silently
// that some pages never stopped showing the loading shimmer.
const MAX_CONCURRENT = 10;
let active = 0;
const waiters: Array<() => void> = [];

export function acquireRenderSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      active++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active--;
        const next = waiters.shift();
        if (next) next();
      });
    };
    if (active < MAX_CONCURRENT) grant();
    else waiters.push(grant);
  });
}
