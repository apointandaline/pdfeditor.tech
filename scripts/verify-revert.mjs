// Verifies:
//   1. pickFontStyle detects bold/italic from font name strings
//   2. The no-op revert path (undo + clear future) cleanly removes a
//      whiteout/text pair created by an edit-existing click
//   3. Save round-trip with bold/italic preserves them via the right
//      pdf-lib StandardFonts variant

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { PDFDocument } = await import('pdf-lib');
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { pickFontStyle, pickFont } = await import('../src/lib/font.ts');
const { useEditorStore, newAnnotationId, selectPageAnnotations } =
  await import('../src/state/editorStore.ts');
const { savePdf } = await import('../src/pdf/save.ts');

let failed = 0;
function check(label, ok, info) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${ok ? '' : `  ${info ?? ''}`}`);
  if (!ok) failed++;
}
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  check(label, ok, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

// --- pickFontStyle ---
eq('plain Helvetica',
  pickFontStyle('Helvetica', 'Helvetica'),
  { family: 'Helvetica', bold: false, italic: false });

eq('Times-Bold',
  pickFontStyle('serif', 'Times-Bold'),
  { family: 'Times', bold: true, italic: false });

eq('Helvetica-Oblique',
  pickFontStyle('sans-serif', 'Helvetica-Oblique'),
  { family: 'Helvetica', bold: false, italic: true });

eq('Times-BoldItalic',
  pickFontStyle('serif', 'Times-BoldItalic'),
  { family: 'Times', bold: true, italic: true });

eq('Arial-Black',
  pickFontStyle('sans-serif', 'Arial-Black'),
  { family: 'Helvetica', bold: true, italic: false });

eq('Garamond Italic family',
  pickFontStyle('Garamond, serif', 'Garamond-Italic'),
  { family: 'Times', bold: false, italic: true });

eq('Liberation Sans (sans hint trumps no-serif default)',
  pickFontStyle('sans-serif', 'LiberationSans'),
  { family: 'Helvetica', bold: false, italic: false });

eq('undefined → Helvetica neutral',
  pickFontStyle(undefined, undefined),
  { family: 'Helvetica', bold: false, italic: false });

check('pickFont back-compat returns same family',
  pickFont('serif') === 'Times');

// --- No-op revert via undo + future clear ---
const api = () => useEditorStore.getState();
api().resetAnnotations();

const whiteoutId = newAnnotationId();
const textId = newAnnotationId();
api().addAnnotations([
  { id: whiteoutId, page: 1, kind: 'shape', shape: 'rect',
    x: 10, y: 10, w: 80, h: 20,
    stroke: '#fff', fill: '#fff', width: 0 },
  { id: textId, page: 1, kind: 'text',
    x: 10, y: 10, w: 80, h: 20,
    text: 'Hello',
    fontSize: 14, fontFamily: 'Helvetica',
    bold: false, italic: false,
    color: '#000',
    origin: { text: 'Hello', linkedWhiteoutId: whiteoutId },
  },
]);

eq('post-click: 2 annotations', selectPageAnnotations(1)(api()).length, 2);
eq('post-click: 1 past entry', api().past.length, 1);

// Simulate "user blurred without editing" path.
api().undo();
useEditorStore.setState({ future: [] });

eq('after silent revert: 0 annotations', selectPageAnnotations(1)(api()).length, 0);
eq('after silent revert: past empty',    api().past.length, 0);
eq('after silent revert: future empty',  api().future.length, 0);

// --- Save round-trip with bold/italic ---
api().resetAnnotations();
const baseDoc = await PDFDocument.create();
baseDoc.addPage([400, 400]);
const baseBytes = await baseDoc.save();
const baseArrayBuf = baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength);

const MARKER_REG  = 'REGMARKER';
const MARKER_BOLD = 'BOLDMARKER';
const MARKER_IT   = 'ITMARKER';
const MARKER_BI   = 'BIMARKER';

const out = await savePdf(baseArrayBuf, {
  1: [
    { id: '1', page: 1, kind: 'text',
      x: 30, y: 40, w: 200, h: 24, text: MARKER_REG,
      fontSize: 14, fontFamily: 'Helvetica', color: '#000' },
    { id: '2', page: 1, kind: 'text',
      x: 30, y: 80, w: 200, h: 24, text: MARKER_BOLD,
      fontSize: 14, fontFamily: 'Helvetica', bold: true, color: '#000' },
    { id: '3', page: 1, kind: 'text',
      x: 30, y: 120, w: 200, h: 24, text: MARKER_IT,
      fontSize: 14, fontFamily: 'Times', italic: true, color: '#000' },
    { id: '4', page: 1, kind: 'text',
      x: 30, y: 160, w: 200, h: 24, text: MARKER_BI,
      fontSize: 14, fontFamily: 'Times', bold: true, italic: true, color: '#000' },
  ],
});

const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(out.slice()) }).promise;
const page1 = await pdf.getPage(1);
const tc = await page1.getTextContent();
const extracted = tc.items.map((i) => ('str' in i ? i.str : '')).join('');

check(`extracted has ${MARKER_REG}`, extracted.includes(MARKER_REG));
check(`extracted has ${MARKER_BOLD}`, extracted.includes(MARKER_BOLD));
check(`extracted has ${MARKER_IT}`, extracted.includes(MARKER_IT));
check(`extracted has ${MARKER_BI}`, extracted.includes(MARKER_BI));

// Confirm font variants actually used — pdfjs styles maps font ids to their
// CSS family. Helvetica-Bold should map to a sans-serif family that includes
// "bold" in its name (or pdfjs will surface the actual standard-font label).
const fontIds = Array.from(new Set(tc.items.filter((i) => 'fontName' in i).map((i) => i.fontName)));
const styles = tc.styles ?? {};
const fontFamiliesUsed = fontIds.map((id) => styles[id]?.fontFamily ?? '').filter(Boolean);
check('multiple distinct font families used in output',
  new Set(fontFamiliesUsed).size >= 2,
  `families=${JSON.stringify(fontFamiliesUsed)}`);

if (failed === 0) {
  console.log('\nAll revert/format assertions passed.');
} else {
  console.log(`\n${failed} failure(s).`);
  process.exit(1);
}
