// End-to-end verification of the save pipeline:
//  1. Build a tiny multi-page PDF with pdf-lib.
//  2. Construct a synthetic annotation set covering every kind.
//  3. Call savePdf().
//  4. Reload the resulting bytes with pdf-lib (parse integrity, page count).
//  5. Reload them with pdfjs (the same path the browser uses).
//  6. Spot-check that drawn text appears in the raw bytes.

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { PDFDocument } = await import('pdf-lib');
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { savePdf, suggestedFilename } = await import('../src/pdf/save.ts');
const { hexToRgb } = await import('../src/lib/color.ts');

let failed = 0;
function check(label, ok, info) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${ok ? '' : `  ${info ?? ''}`}`);
  if (!ok) failed++;
}
function eqApprox(label, got, want, tol = 0.001) {
  check(label, Math.abs(got - want) <= tol, `got=${got} want=${want}`);
}

// --- hexToRgb sanity ---
eqApprox('hexToRgb #fff → r=1',          hexToRgb('#fff').r, 1);
eqApprox('hexToRgb #000000 → b=0',       hexToRgb('#000000').b, 0);
eqApprox('hexToRgb #ff0000 → r=1',       hexToRgb('#ff0000').r, 1);
eqApprox('hexToRgb #00ff00 → g=1',       hexToRgb('#00ff00').g, 1);
eqApprox('hexToRgb #112233 → r≈0.0667', hexToRgb('#112233').r, 0x11 / 255);
check('hexToRgb defends on garbage', JSON.stringify(hexToRgb('zzz')) === JSON.stringify({ r: 0, g: 0, b: 0 }));

// --- suggestedFilename ---
check('suggested: report.pdf',
  suggestedFilename('report.pdf') === 'report (edited).pdf');
check('suggested: report.PDF',
  suggestedFilename('report.PDF') === 'report (edited).pdf');
check('suggested: no extension',
  suggestedFilename('foo') === 'foo (edited).pdf');
check('suggested: null',
  suggestedFilename(null) === 'document (edited).pdf');

// --- Build base PDF ---
const baseDoc = await PDFDocument.create();
baseDoc.addPage([300, 400]);
baseDoc.addPage([400, 300]);
const baseBytes = await baseDoc.save();
const baseArrayBuf = baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength);

const TEXT_MARKER = 'HELLOMARKER';
const TIMES_MARKER = 'TIMESMARKER';

// --- Synthetic annotation set covering every kind across both pages ---
const annotations = {
  1: [
    { id: 't1', page: 1, kind: 'text',
      x: 40, y: 40, w: 200, h: 30,
      text: TEXT_MARKER,
      fontSize: 18, fontFamily: 'Helvetica', color: '#1a1a1a' },
    { id: 't2', page: 1, kind: 'text',
      x: 40, y: 80, w: 200, h: 30,
      text: TIMES_MARKER,
      fontSize: 18, fontFamily: 'Times', color: '#1a1a1a' },
    { id: 'p1', page: 1, kind: 'path', variant: 'pen',
      points: [{ x: 10, y: 200 }, { x: 100, y: 220 }, { x: 200, y: 180 }],
      color: '#aa0000', width: 2, opacity: 1 },
    { id: 'h1', page: 1, kind: 'path', variant: 'highlighter',
      points: [{ x: 10, y: 300 }, { x: 200, y: 300 }],
      color: '#ffea00', width: 18, opacity: 0.35 },
  ],
  2: [
    { id: 'l1', page: 2, kind: 'line',
      x1: 20, y1: 20, x2: 200, y2: 80,
      color: '#0044ff', width: 3, arrow: false },
    { id: 'a1', page: 2, kind: 'line',
      x1: 20, y1: 150, x2: 280, y2: 220,
      color: '#0044ff', width: 3, arrow: true },
    { id: 'r1', page: 2, kind: 'shape', shape: 'rect',
      x: 60, y: 100, w: 80, h: 50,
      stroke: '#000000', fill: null, width: 2 },
    { id: 'e1', page: 2, kind: 'shape', shape: 'ellipse',
      x: 180, y: 50, w: 120, h: 60,
      stroke: '#000000', fill: '#ffff00', width: 2 },
  ],
};

const out = await savePdf(baseArrayBuf, annotations);

check('savePdf returns Uint8Array', out instanceof Uint8Array);
check('output has non-trivial size', out.byteLength > baseBytes.byteLength);

// Reload with pdf-lib
const reloaded = await PDFDocument.load(out);
check('pdf-lib reloads output', reloaded.getPageCount() === 2);
const pages = reloaded.getPages();
eqApprox('page 1 width preserved',  pages[0].getWidth(),  300);
eqApprox('page 1 height preserved', pages[0].getHeight(), 400);
eqApprox('page 2 width preserved',  pages[1].getWidth(),  400);
eqApprox('page 2 height preserved', pages[1].getHeight(), 300);

// Reload with pdfjs (same path the browser uses)
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(out.slice()) }).promise;
check('pdfjs reloads output', pdf.numPages === 2);

// Use pdfjs's text extraction (more reliable than raw-bytes — pdf-lib
// compresses content streams, so the literal won't appear in bytes).
const page1 = await pdf.getPage(1);
const tc = await page1.getTextContent();
const extracted = tc.items.map((i) => ('str' in i ? i.str : '')).join('');
check(`page 1 contains Helvetica marker "${TEXT_MARKER}"`,
  extracted.includes(TEXT_MARKER), `extracted="${extracted}"`);
check(`page 1 contains Times marker "${TIMES_MARKER}"`,
  extracted.includes(TIMES_MARKER), `extracted="${extracted}"`);

// Empty-text annotation should be skipped without throwing.
const baseBytes2 = await baseDoc.save();
const base2 = baseBytes2.buffer.slice(baseBytes2.byteOffset, baseBytes2.byteOffset + baseBytes2.byteLength);
const outEmpty = await savePdf(base2, {
  1: [{ id: 'e', page: 1, kind: 'text', x: 0, y: 0, w: 100, h: 20, text: '', fontSize: 12, fontFamily: 'Helvetica', color: '#000' }],
});
check('empty text annotation skipped (no throw)', outEmpty instanceof Uint8Array);

if (failed === 0) {
  console.log('\nAll save assertions passed.');
} else {
  console.log(`\n${failed} failure(s).`);
  process.exit(1);
}
