// Verifies the store changes that support edit-existing-text:
//   1. addAnnotations is atomic — one undo reverts the whole batch
//   2. pendingFocusId targets the text annotation in the batch (not the whiteout)
//   3. select(id) does NOT set pendingFocusId (so click-to-select doesn't enter
//      edit mode for existing text boxes)
//   4. The pickFont heuristic distinguishes serif from sans-serif by family hint

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { useEditorStore, newAnnotationId, selectPageAnnotations } =
  await import('../src/state/editorStore.ts');

let failed = 0;
function check(label, ok, info) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${ok ? '' : `  ${info ?? ''}`}`);
  if (!ok) failed++;
}
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  check(label, ok, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const api = () => useEditorStore.getState();
const get = (id) => {
  for (const list of Object.values(api().annotations)) {
    const f = list.find((a) => a.id === id);
    if (f) return f;
  }
  return null;
};

api().resetAnnotations();

// --- Scenario A: addAnnotations is atomic ---
const whiteoutId = newAnnotationId();
const textId = newAnnotationId();
const before = api().past.length;

api().addAnnotations([
  { id: whiteoutId, page: 1, kind: 'shape', shape: 'rect',
    x: 50, y: 100, w: 80, h: 20,
    stroke: '#fff', fill: '#fff', width: 0 },
  { id: textId, page: 1, kind: 'text',
    x: 50, y: 100, w: 80, h: 20,
    text: 'Hello',
    fontSize: 14, fontFamily: 'Helvetica', color: '#000' },
]);

eq('past pushed exactly one entry', api().past.length - before, 1);
eq('both annotations stored',       selectPageAnnotations(1)(api()).length, 2);
eq('selectedId = last added (text)', api().selectedId, textId);
eq('pendingFocusId = text id',       api().pendingFocusId, textId);

// Single undo reverts BOTH annotations.
api().undo();
eq('one undo removes both', selectPageAnnotations(1)(api()).length, 0);

// Redo restores both.
api().redo();
eq('one redo restores both', selectPageAnnotations(1)(api()).length, 2);

// --- Scenario B: pendingFocusId targets the text, not the whiteout ---
api().resetAnnotations();
const wid = newAnnotationId(), tid = newAnnotationId();
api().addAnnotations([
  // Different order: whiteout last
  { id: tid, page: 1, kind: 'text',
    x: 0, y: 0, w: 60, h: 20, text: 'x',
    fontSize: 12, fontFamily: 'Helvetica', color: '#000' },
  { id: wid, page: 1, kind: 'shape', shape: 'rect',
    x: 0, y: 0, w: 60, h: 20, stroke: '#fff', fill: '#fff', width: 0 },
]);
eq('pendingFocusId still text (last text in batch)', api().pendingFocusId, tid);

// --- Scenario C: select(id) doesn't trigger pendingFocus ---
api().clearPendingFocus();
api().select(tid);
eq('select() leaves pendingFocusId null', api().pendingFocusId, null);

// --- Scenario D: addAnnotation (single) sets pendingFocusId for text ---
const lone = newAnnotationId();
api().addAnnotation({
  id: lone, page: 1, kind: 'text',
  x: 0, y: 0, w: 60, h: 20, text: '',
  fontSize: 12, fontFamily: 'Helvetica', color: '#000',
});
eq('single text add sets pendingFocusId', api().pendingFocusId, lone);

// Non-text annotations don't set pendingFocusId
api().clearPendingFocus();
api().addAnnotation({
  id: newAnnotationId(), page: 1, kind: 'shape', shape: 'rect',
  x: 0, y: 0, w: 10, h: 10, stroke: '#000', fill: null, width: 1,
});
eq('shape add leaves pendingFocusId null', api().pendingFocusId, null);

// --- Scenario E: pickFont heuristic ---
const { pickFont } = await import('../src/lib/font.ts');

eq('pickFont: undefined → Helvetica',    pickFont(undefined),       'Helvetica');
eq('pickFont: "sans-serif" → Helvetica', pickFont('sans-serif'),    'Helvetica');
eq('pickFont: "serif" → Times',           pickFont('serif'),         'Times');
eq('pickFont: "Times New Roman" → Times', pickFont('Times New Roman'), 'Times');
eq('pickFont: "monospace" → Helvetica',   pickFont('monospace'),     'Helvetica');
eq('pickFont: "Courier" → Helvetica',     pickFont('Courier'),       'Helvetica');
eq('pickFont: "Arial" → Helvetica',       pickFont('Arial'),         'Helvetica');

if (failed === 0) {
  console.log('\nAll edit-text assertions passed.');
} else {
  console.log(`\n${failed} failure(s).`);
  process.exit(1);
}
