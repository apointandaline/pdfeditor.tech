import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from './worker';

export async function loadPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdfjs may transfer the buffer; always pass a fresh copy so the original
  // ArrayBuffer can be reused later by pdf-lib on save.
  const copy = bytes.slice(0);
  const task = pdfjsLib.getDocument({ data: new Uint8Array(copy) });
  return await task.promise;
}
