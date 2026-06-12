import type { Ref } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPage } from './PdfPage';

interface Props {
  pdf: PDFDocumentProxy;
  scale: number;
  scrollerRef?: Ref<HTMLDivElement>;
}

export function PdfViewer({ pdf, scale, scrollerRef }: Props) {
  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  return (
    <div className="viewer" ref={scrollerRef}>
      {pages.map((n) => (
        <PdfPage key={n} pdf={pdf} pageNumber={n} scale={scale} />
      ))}
    </div>
  );
}
