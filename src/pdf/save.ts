import {
  PDFDocument,
  type PDFImage,
  StandardFonts,
  LineCapStyle,
  BlendMode,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Annotation, FontFamily } from '../types/annotation';
import { smoothPath } from '../lib/svg-path';
import { pdfColor } from '../lib/color';
import { dataUrlMime, dataUrlToBytes } from '../lib/image';
import dancingScriptRegularUrl from '../assets/fonts/DancingScript-Regular.ttf?url';
import dancingScriptBoldUrl from '../assets/fonts/DancingScript-Bold.ttf?url';

// Lazy-loaded font bytes — fetched once per session and cached.
let dancingScriptRegularBytes: ArrayBuffer | null = null;
let dancingScriptBoldBytes: ArrayBuffer | null = null;
async function loadDancingScriptBytes(): Promise<{
  regular: ArrayBuffer;
  bold: ArrayBuffer;
}> {
  if (!dancingScriptRegularBytes) {
    dancingScriptRegularBytes = await fetch(dancingScriptRegularUrl).then((r) =>
      r.arrayBuffer(),
    );
  }
  if (!dancingScriptBoldBytes) {
    dancingScriptBoldBytes = await fetch(dancingScriptBoldUrl).then((r) =>
      r.arrayBuffer(),
    );
  }
  return { regular: dancingScriptRegularBytes!, bold: dancingScriptBoldBytes! };
}

// Stamp every annotation onto a copy of the original PDF and return the new
// bytes. Coordinates in the store are at scale 1.0 with top-left origin —
// which equals PDF points with top-left origin. pdf-lib uses bottom-left, so
// we Y-flip per element. drawSvgPath is the exception — pdf-lib applies its
// own scale(1,-1) internally, so we pass raw points and y = pageHeight.
export async function savePdf(
  originalBytes: ArrayBuffer,
  annotations: Record<number, Annotation[]>,
): Promise<Uint8Array> {
  // Pass a fresh copy of the bytes — pdf-lib should not detach, but matching
  // the pdfjs loader's defensive copy keeps the original safe across multiple
  // saves of the same document.
  const doc = await PDFDocument.load(originalBytes.slice(0));
  doc.registerFontkit(fontkit);

  // Embed only what the document actually uses — Dancing Script ships ~75KB
  // per weight and the user might not have any of it.
  const used = collectUsedFamilies(annotations);

  // Standard PDF fonts have no embed payload, so we always include the three
  // canonical families even if unused — keeps the lookup table dense.
  const [
    helv, helvB, helvI, helvBI,
    tms,  tmsB,  tmsI,  tmsBI,
    cour, courB, courI, courBI,
  ] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBold),
    doc.embedFont(StandardFonts.TimesRomanItalic),
    doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    doc.embedFont(StandardFonts.Courier),
    doc.embedFont(StandardFonts.CourierBold),
    doc.embedFont(StandardFonts.CourierOblique),
    doc.embedFont(StandardFonts.CourierBoldOblique),
  ]);
  const fonts: FontVariants = {
    Helvetica: { normal: helv, bold: helvB, italic: helvI, boldItalic: helvBI },
    Times:     { normal: tms,  bold: tmsB,  italic: tmsI,  boldItalic: tmsBI  },
    Courier:   { normal: cour, bold: courB, italic: courI, boldItalic: courBI },
  };

  if (used.has('DancingScript')) {
    const { regular, bold } = await loadDancingScriptBytes();
    const [ds, dsB] = await Promise.all([
      doc.embedFont(regular),
      doc.embedFont(bold),
    ]);
    // Dancing Script has no italic file; italic flag falls back to regular
    // (the type system also disables the toggle for this family).
    fonts.DancingScript = { normal: ds, bold: dsB, italic: ds, boldItalic: dsB };
  }

  // Pre-embed every unique image so multiple ImageAnnotations sharing the
  // same data URL only get one copy in the output PDF.
  const images = new Map<string, PDFImage>();
  for (const list of Object.values(annotations)) {
    for (const a of list) {
      if (a.kind !== 'image' || images.has(a.src)) continue;
      const bytes = dataUrlToBytes(a.src);
      const img = dataUrlMime(a.src) === 'jpeg'
        ? await doc.embedJpg(bytes)
        : await doc.embedPng(bytes);
      images.set(a.src, img);
    }
  }

  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNumber = i + 1;
    const pageHeight = page.getHeight();
    const list = annotations[pageNumber] ?? [];
    for (const a of list) {
      stampAnnotation(page, pageHeight, a, fonts, images);
    }
  }
  return await doc.save();
}

type EmbeddedFont = Awaited<ReturnType<PDFDocument['embedFont']>>;
interface FontGroup {
  normal: EmbeddedFont;
  bold: EmbeddedFont;
  italic: EmbeddedFont;
  boldItalic: EmbeddedFont;
}
type FontVariants = Partial<Record<FontFamily, FontGroup>>;

function pickFontVariant(group: FontGroup, bold: boolean, italic: boolean): EmbeddedFont {
  if (bold && italic) return group.boldItalic;
  if (bold) return group.bold;
  if (italic) return group.italic;
  return group.normal;
}

function collectUsedFamilies(
  annotations: Record<number, Annotation[]>,
): Set<FontFamily> {
  const out = new Set<FontFamily>();
  for (const list of Object.values(annotations)) {
    for (const a of list) {
      if (a.kind === 'text') out.add(a.fontFamily);
    }
  }
  return out;
}

function stampAnnotation(
  page: ReturnType<PDFDocument['getPages']>[number],
  pageHeight: number,
  a: Annotation,
  fonts: FontVariants,
  images: Map<string, PDFImage>,
): void {
  if (a.kind === 'text') {
    if (a.text === '') return;
    // pdf-lib draws text at the baseline. Place the first line so its
    // baseline sits ~ascent below the top of the textbox (~0.85 * fontSize
    // is the usual ascent for sans-serif).
    const group = fonts[a.fontFamily] ?? fonts.Helvetica!;
    const font = pickFontVariant(group, a.bold ?? false, a.italic ?? false);
    page.drawText(a.text, {
      x: a.x,
      y: pageHeight - a.y - a.fontSize * 0.85,
      size: a.fontSize,
      font,
      color: pdfColor(a.color),
      maxWidth: a.w,
      lineHeight: a.fontSize * 1.2,
    });
    return;
  }

  if (a.kind === 'path') {
    // drawSvgPath internally applies scale(1, -1), so passing y = pageHeight
    // maps the SVG's y=0 to the top of the page. Stored points (top-left,
    // scale 1.0) go in as-is.
    const d = smoothPath(a.points);
    const isHighlighter = a.variant === 'highlighter';
    page.drawSvgPath(d, {
      x: 0,
      y: pageHeight,
      borderColor: pdfColor(a.color),
      borderWidth: a.width,
      borderOpacity: a.opacity,
      borderLineCap: LineCapStyle.Round,
      blendMode: isHighlighter ? BlendMode.Multiply : undefined,
    });
    return;
  }

  if (a.kind === 'line') {
    page.drawLine({
      start: { x: a.x1, y: pageHeight - a.y1 },
      end: { x: a.x2, y: pageHeight - a.y2 },
      thickness: a.width,
      color: pdfColor(a.color),
      lineCap: LineCapStyle.Round,
    });
    if (a.arrow) {
      const { px1, py1, px2, py2 } = arrowBasePoints(a.x1, a.y1, a.x2, a.y2, a.width * 4);
      const tip = { x: a.x2, y: pageHeight - a.y2 };
      page.drawLine({
        start: { x: px1, y: pageHeight - py1 },
        end: tip,
        thickness: a.width,
        color: pdfColor(a.color),
        lineCap: LineCapStyle.Round,
      });
      page.drawLine({
        start: tip,
        end: { x: px2, y: pageHeight - py2 },
        thickness: a.width,
        color: pdfColor(a.color),
        lineCap: LineCapStyle.Round,
      });
    }
    return;
  }

  if (a.kind === 'image') {
    const img = images.get(a.src);
    if (!img) return;
    page.drawImage(img, {
      x: a.x,
      y: pageHeight - a.y - a.h,
      width: a.w,
      height: a.h,
    });
    return;
  }

  // shape: rect | ellipse
  const stroke = pdfColor(a.stroke);
  const fill = a.fill ? pdfColor(a.fill) : undefined;
  if (a.shape === 'rect') {
    page.drawRectangle({
      x: a.x,
      y: pageHeight - a.y - a.h,
      width: a.w,
      height: a.h,
      borderColor: stroke,
      borderWidth: a.width,
      color: fill,
    });
  } else {
    page.drawEllipse({
      x: a.x + a.w / 2,
      y: pageHeight - (a.y + a.h / 2),
      xScale: a.w / 2,
      yScale: a.h / 2,
      borderColor: stroke,
      borderWidth: a.width,
      color: fill,
    });
  }
}

// Two base points of the arrowhead triangle in stored (top-left) coords.
function arrowBasePoints(x1: number, y1: number, x2: number, y2: number, size: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const baseX = x2 - size * Math.cos(angle);
  const baseY = y2 - size * Math.sin(angle);
  const half = size / 2;
  return {
    px1: baseX + half * Math.sin(angle),
    py1: baseY - half * Math.cos(angle),
    px2: baseX - half * Math.sin(angle),
    py2: baseY + half * Math.cos(angle),
  };
}

// Browser-side helpers used by App.tsx.
export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Slight delay before revoking lets some browsers finalize the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function suggestedFilename(original: string | null): string {
  const base = original ?? 'document.pdf';
  const idx = base.toLowerCase().lastIndexOf('.pdf');
  if (idx === -1) return `${base} (edited).pdf`;
  return `${base.slice(0, idx)} (edited).pdf`;
}
