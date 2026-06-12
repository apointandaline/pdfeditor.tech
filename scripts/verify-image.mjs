// Verifies image plumbing:
//   1. ImageAnnotation flows through addAnnotation / undo / redo
//   2. addAnnotations with [whiteout, image] is atomic
//   3. Image bounds helper
//   4. dataUrlToBytes / dataUrlMime
//   5. Save round-trip: stamping ImageAnnotation through pdf-lib, then
//      verifying the saved PDF reloads + the image bytes are embedded

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { PDFDocument } = await import('pdf-lib');
const { useEditorStore, newAnnotationId, selectPageAnnotations } =
  await import('../src/state/editorStore.ts');
const { imageBounds } = await import('../src/lib/bounds.ts');
const { dataUrlToBytes, dataUrlMime } = await import('../src/lib/image.ts');
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

// Minimal valid PNG (1×1 red pixel) as a base64 data URL.
const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8' +
  '/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// --- dataUrlMime / dataUrlToBytes ---
check('dataUrlMime: png',  dataUrlMime(RED_PNG) === 'png');
check('dataUrlMime: jpg',  dataUrlMime('data:image/jpeg;base64,abc==') === 'jpeg');
check('dataUrlMime: jpg2', dataUrlMime('data:image/jpg;base64,abc==') === 'jpeg');
check('dataUrlMime: unknown defaults to png', dataUrlMime('data:image/unknown;base64,abc==') === 'png');

const bytes = dataUrlToBytes(RED_PNG);
check('dataUrlToBytes returns Uint8Array', bytes instanceof Uint8Array);
check('PNG signature preserved (8 bytes)',
  bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47);

// --- imageBounds ---
eq('imageBounds passthrough',
  imageBounds({ kind: 'image', id: 'x', page: 1, x: 10, y: 20, w: 100, h: 50, src: RED_PNG }),
  { x: 10, y: 20, w: 100, h: 50 });

// --- Store: addAnnotation single image ---
const api = () => useEditorStore.getState();
api().resetAnnotations();

const imageId = newAnnotationId();
api().addAnnotation({
  id: imageId, page: 1, kind: 'image',
  x: 30, y: 40, w: 60, h: 80,
  src: RED_PNG,
});
eq('single image stored', selectPageAnnotations(1)(api()).length, 1);
eq('single image selected', api().selectedId, imageId);
// Adding non-text annotation should NOT set pendingFocusId
eq('image add leaves pendingFocusId null', api().pendingFocusId, null);

api().undo();
eq('image undo → empty', selectPageAnnotations(1)(api()).length, 0);
api().redo();
eq('image redo → restored', selectPageAnnotations(1)(api()).length, 1);

// --- Store: atomic add [whiteout, image] (mirrors edit-existing image flow) ---
api().resetAnnotations();
const wid = newAnnotationId(), iid = newAnnotationId();
api().addAnnotations([
  { id: wid, page: 2, kind: 'shape', shape: 'rect',
    x: 0, y: 0, w: 100, h: 50, stroke: '#fff', fill: '#fff', width: 0 },
  { id: iid, page: 2, kind: 'image',
    x: 0, y: 0, w: 100, h: 50, src: RED_PNG },
]);
eq('atomic add: count', selectPageAnnotations(2)(api()).length, 2);
eq('atomic add: selected = image', api().selectedId, iid);
// Last text in batch → null; pendingFocusId should remain null
eq('atomic image-only batch: pendingFocusId null', api().pendingFocusId, null);

api().undo();
eq('atomic undo removes both', selectPageAnnotations(2)(api()).length, 0);

// --- Store: pendingImage staging ---
api().setPendingImage({ src: RED_PNG, w: 16, h: 16, name: 'red.png' });
eq('pendingImage set', api().pendingImage?.name, 'red.png');
api().setPendingImage(null);
eq('pendingImage clear', api().pendingImage, null);

// --- Save round-trip: stamp ImageAnnotation, reload, check page count ---
api().resetAnnotations();
const baseDoc = await PDFDocument.create();
baseDoc.addPage([300, 400]);
const baseBytes = await baseDoc.save();
const baseArrayBuf = baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength);

const out = await savePdf(baseArrayBuf, {
  1: [
    { id: 'a', page: 1, kind: 'image',
      x: 50, y: 50, w: 80, h: 80, src: RED_PNG },
  ],
});

check('savePdf with image → bytes', out instanceof Uint8Array);
const reloaded = await PDFDocument.load(out);
check('reload preserves page count', reloaded.getPageCount() === 1);
// Sanity: output is larger than base (the image bytes are embedded)
check('output > base bytes', out.byteLength > baseBytes.byteLength);

// --- Save dedup: 5 annotations using the same data URL embed once ---
const annotationsDedup = {
  1: Array.from({ length: 5 }, (_, i) => ({
    id: `dup-${i}`, page: 1, kind: 'image',
    x: 10 * i, y: 10 * i, w: 20, h: 20, src: RED_PNG,
  })),
};
const outDedup = await savePdf(baseArrayBuf, annotationsDedup);
// One image, five draws — the doc should be only slightly bigger than the
// single-image case, not 5× larger. Loose bound:
check('dedup: 5 placements only embed image once',
  outDedup.byteLength < out.byteLength + 200,
  `out=${out.byteLength} outDedup=${outDedup.byteLength}`);

if (failed === 0) {
  console.log('\nAll image assertions passed.');
} else {
  console.log(`\n${failed} failure(s).`);
  process.exit(1);
}
