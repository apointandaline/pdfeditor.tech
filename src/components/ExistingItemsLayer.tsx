import { useEffect, useState, type RefObject } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { OPS } from 'pdfjs-dist';
import { useEditorStore, newAnnotationId } from '../state/editorStore';
import type {
  ImageAnnotation,
  ShapeAnnotation,
  TextAnnotation,
} from '../types/annotation';
import { captureCanvasRegion } from '../lib/image';
import { pickFontStyle, type DetectedFontStyle } from '../lib/font';

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  // Used to capture a rendered image region when an image hotspot is clicked.
  pageCanvasRef: RefObject<HTMLCanvasElement | null>;
}

// Stored in scale-1.0 (top-left) coords, ready to convert to display via × scale.
interface TextHotspot {
  kind: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  style: DetectedFontStyle;
}

interface ImageHotspot {
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
}

type Hotspot = TextHotspot | ImageHotspot;

// Padding around the whiteout so descenders/ascenders are fully covered.
const WHITEOUT_PAD = 1.5;

export function ExistingItemsLayer({ pdf, pageNumber, width, height, scale, pageCanvasRef }: Props) {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const addAnnotations = useEditorStore((s) => s.addAnnotations);
  const setTool = useEditorStore((s) => s.setTool);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1.0 });
      const pageHeight = vp.height;

      const [textHs, imgHs] = await Promise.all([
        findTextHotspots(page, pageHeight),
        findImageHotspots(page, pageHeight),
      ]);
      if (cancelled) return;
      setHotspots([...textHs, ...imgHs]);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  function handleTextClick(h: TextHotspot) {
    const whiteoutId = newAnnotationId();
    const replacementId = newAnnotationId();
    const whiteout: ShapeAnnotation = {
      id: whiteoutId,
      page: pageNumber,
      kind: 'shape',
      shape: 'rect',
      x: h.x - WHITEOUT_PAD,
      y: h.y - WHITEOUT_PAD,
      w: h.w + 2 * WHITEOUT_PAD,
      h: h.h + 2 * WHITEOUT_PAD,
      stroke: '#ffffff',
      fill: '#ffffff',
      width: 0,
    };
    const replacement: TextAnnotation = {
      id: replacementId,
      page: pageNumber,
      kind: 'text',
      x: h.x,
      y: h.y,
      w: Math.max(h.w, 60),
      h: Math.max(h.h, 24),
      text: h.text,
      fontSize: Math.round(h.fontSize) || 12,
      fontFamily: h.style.family,
      bold: h.style.bold,
      italic: h.style.italic,
      color: '#000000',
      // The origin record lets TextBox detect no-op clicks and revert
      // cleanly (remove both annotations as if the click never happened).
      origin: {
        text: h.text,
        linkedWhiteoutId: whiteoutId,
      },
    };
    addAnnotations([whiteout, replacement]);
    setTool('select');
  }

  function handleImageClick(h: ImageHotspot) {
    const canvas = pageCanvasRef.current;
    if (!canvas) {
      console.warn('No page canvas available to capture image');
      return;
    }
    // Canvas pixels = display scale × devicePixelRatio (PdfPage's render path).
    const dpr = window.devicePixelRatio || 1;
    const factor = scale * dpr;
    let dataUrl: string;
    try {
      dataUrl = captureCanvasRegion(
        canvas,
        h.x * factor,
        h.y * factor,
        h.w * factor,
        h.h * factor,
      );
    } catch (e) {
      console.error('Image capture failed:', e);
      return;
    }
    const whiteout: ShapeAnnotation = {
      id: newAnnotationId(),
      page: pageNumber,
      kind: 'shape',
      shape: 'rect',
      x: h.x,
      y: h.y,
      w: h.w,
      h: h.h,
      stroke: '#ffffff',
      fill: '#ffffff',
      width: 0,
    };
    const replacement: ImageAnnotation = {
      id: newAnnotationId(),
      page: pageNumber,
      kind: 'image',
      x: h.x,
      y: h.y,
      w: h.w,
      h: h.h,
      src: dataUrl,
    };
    addAnnotations([whiteout, replacement]);
    setTool('select');
  }

  return (
    <div className="existing-items-layer" style={{ width, height }} aria-hidden>
      {hotspots.map((h, i) => (
        <div
          key={i}
          className={`existing-hotspot existing-hotspot--${h.kind}`}
          style={{
            left: h.x * scale,
            top: h.y * scale,
            width: h.w * scale,
            height: h.h * scale,
          }}
          title={
            h.kind === 'text'
              ? `Edit text: "${h.text}"`
              : `Edit image (${Math.round(h.w)}×${Math.round(h.h)})`
          }
          onClick={() => (h.kind === 'text' ? handleTextClick(h) : handleImageClick(h))}
        />
      ))}
    </div>
  );
}

// ---------- Text detection ----------

async function findTextHotspots(page: PDFPageProxy, pageHeight: number): Promise<TextHotspot[]> {
  const tc = await page.getTextContent();
  const out: TextHotspot[] = [];
  for (const raw of tc.items) {
    if (!('str' in raw)) continue;
    const it = raw as {
      str: string;
      transform: number[];
      width: number;
      height: number;
      fontName?: string;
    };
    if (it.str === '' || it.str.trim() === '') continue;
    const t = it.transform;
    const fontSize = Math.hypot(t[2], t[3]) || it.height;
    const baselineX = t[4];
    const baselineY = t[5];
    const topY = pageHeight - baselineY - fontSize;
    const familyStr = (it.fontName && tc.styles?.[it.fontName]?.fontFamily) ?? '';
    out.push({
      kind: 'text',
      x: baselineX,
      y: topY,
      w: it.width,
      h: fontSize * 1.2,
      text: it.str,
      fontSize,
      style: pickFontStyle(familyStr, it.fontName),
    });
  }
  return out;
}

// ---------- Image detection (CTM walk over operator list) ----------

async function findImageHotspots(page: PDFPageProxy, pageHeight: number): Promise<ImageHotspot[]> {
  const op = await page.getOperatorList();
  const fnArray = op.fnArray;
  const argsArray = op.argsArray;

  let ctm: number[] = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const out: ImageHotspot[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const code = fnArray[i];
    const args = argsArray[i];

    if (code === OPS.save) {
      stack.push(ctm.slice());
    } else if (code === OPS.restore) {
      const prev = stack.pop();
      if (prev) ctm = prev;
    } else if (code === OPS.transform) {
      ctm = multiplyAffine(ctm, args as number[]);
    } else if (
      code === OPS.paintImageXObject ||
      code === OPS.paintInlineImageXObject ||
      code === OPS.paintImageMaskXObject
    ) {
      // Non-rotated check: b ≈ 0 and c ≈ 0.
      if (Math.abs(ctm[1]) < 0.01 && Math.abs(ctm[2]) < 0.01) {
        const w = Math.abs(ctm[0]);
        const h = Math.abs(ctm[3]);
        if (w < 4 || h < 4) continue; // skip 1-px decorative artifacts
        const pdfX = ctm[4];
        const pdfYBottom = ctm[5];
        out.push({
          kind: 'image',
          x: pdfX,
          y: pageHeight - pdfYBottom - h,
          w,
          h,
        });
      }
    }
  }
  return out;
}

// PDF affine matrix multiplication. Matrices are stored as [a b c d e f]
// representing [[a b 0], [c d 0], [e f 1]].
function multiplyAffine(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}
