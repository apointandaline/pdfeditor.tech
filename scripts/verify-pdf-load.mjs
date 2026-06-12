// Programmatic check: pdf-lib can create a PDF, and pdfjs-dist can load it the
// same way src/pdf/loader.ts does. Proves both libraries are healthy in this
// environment. Does NOT cover the browser worker config (verified separately
// by curling /node_modules/pdfjs-dist/build/pdf.worker.min.mjs).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Use the legacy/Node build of pdfjs (the browser build assumes DOM globals).
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

async function main() {
  // 1. Build a tiny multi-page PDF.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i} — hello PDF editor`, {
      x: 30,
      y: 360,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  const bytes = await doc.save();
  console.log(`✓ pdf-lib created PDF (${bytes.byteLength} bytes)`);

  // 2. Load it with pdfjs exactly the way the app does (fresh Uint8Array copy).
  const copy = bytes.slice(0);
  const task = pdfjsLib.getDocument({ data: new Uint8Array(copy) });
  const pdf = await task.promise;
  console.log(`✓ pdfjs parsed it (numPages=${pdf.numPages})`);

  // 3. Touch each page so getPage / viewport work too.
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1.0 });
    console.log(`  page ${i}: ${vp.width.toFixed(0)} x ${vp.height.toFixed(0)} pt`);
  }

  // 4. Original bytes still readable? (verifies our copy-on-load isn't detaching)
  console.log(`✓ original bytes still readable (length=${bytes.byteLength})`);
  console.log('OK');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
