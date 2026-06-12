// Drives the store as the new selection / move / resize / endpoint flows
// would. Verifies undo behavior for each operation and that the bounds
// helpers compute correctly.

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { useEditorStore, newAnnotationId, selectPageAnnotations } =
  await import('../src/state/editorStore.ts');
const { pathBounds, lineBounds, shapeBounds } = await import('../src/lib/bounds.ts');

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

// --- bounds helpers ---

eq('pathBounds: 0 pts',  pathBounds({ kind: 'path', points: [] }), { x: 0, y: 0, w: 0, h: 0 });
eq('pathBounds: square loop',
   pathBounds({ kind: 'path', points: [{x:10,y:20},{x:30,y:20},{x:30,y:50},{x:10,y:50}] }),
   { x: 10, y: 20, w: 20, h: 30 });

eq('lineBounds: NE→SW',
   lineBounds({ x1: 50, y1: 10, x2: 10, y2: 80 }),
   { x: 10, y: 10, w: 40, h: 70 });

eq('shapeBounds: passthrough',
   shapeBounds({ x: 5, y: 10, w: 100, h: 200 }),
   { x: 5, y: 10, w: 100, h: 200 });

// --- Move a path (whole-stroke translate) ---
const idP = newAnnotationId();
api().addAnnotation({
  id: idP, page: 1, kind: 'path', variant: 'pen',
  points: [{x:10,y:10},{x:20,y:20},{x:30,y:10}],
  color: '#000', width: 2, opacity: 1,
});
const snapP = get(idP).points.map((p) => ({ ...p }));
api().commit();
api().patchAnnotation(idP, { points: snapP.map((p) => ({ x: p.x + 50, y: p.y + 30 })) });
eq('path moved', get(idP).points[1], { x: 70, y: 50 });
api().undo();
eq('path move undone', get(idP).points[1], { x: 20, y: 20 });
api().redo();

// --- Move a line (translate both endpoints) ---
const idL = newAnnotationId();
api().addAnnotation({
  id: idL, page: 1, kind: 'line',
  x1: 0, y1: 0, x2: 100, y2: 100,
  color: '#000', width: 2, arrow: false,
});
const snapL = { x1: 0, y1: 0, x2: 100, y2: 100 };
api().commit();
api().patchAnnotation(idL, {
  x1: snapL.x1 + 10, y1: snapL.y1 + 20,
  x2: snapL.x2 + 10, y2: snapL.y2 + 20,
});
eq('line moved both endpoints',
   { x1: get(idL).x1, y1: get(idL).y1, x2: get(idL).x2, y2: get(idL).y2 },
   { x1: 10, y1: 20, x2: 110, y2: 120 });
api().undo();
eq('line move undone',
   { x1: get(idL).x1, y1: get(idL).y1, x2: get(idL).x2, y2: get(idL).y2 },
   { x1: 0, y1: 0, x2: 100, y2: 100 });
api().redo();

// --- Drag a line's end endpoint independently ---
api().commit();
api().patchAnnotation(idL, { x2: 200, y2: 50 });
eq('line end endpoint moved',
   { x1: get(idL).x1, y1: get(idL).y1, x2: get(idL).x2, y2: get(idL).y2 },
   { x1: 10, y1: 20, x2: 200, y2: 50 });
api().undo();
eq('endpoint move undone',
   { x2: get(idL).x2, y2: get(idL).y2 },
   { x2: 110, y2: 120 });
api().redo();

// --- Move a shape (translate x/y) ---
const idR = newAnnotationId();
api().addAnnotation({
  id: idR, page: 1, kind: 'shape', shape: 'rect',
  x: 100, y: 100, w: 60, h: 40,
  stroke: '#000', fill: null, width: 2,
});
api().commit();
api().patchAnnotation(idR, { x: 150, y: 130 });
eq('shape moved', { x: get(idR).x, y: get(idR).y }, { x: 150, y: 130 });
api().undo();
eq('shape move undone', { x: get(idR).x, y: get(idR).y }, { x: 100, y: 100 });
api().redo();

// --- Resize shape NW corner: x/y/w/h all update ---
api().commit();
const x0 = get(idR).x, y0 = get(idR).y, w0 = get(idR).w, h0 = get(idR).h;
const dx = -10, dy = -20;
api().patchAnnotation(idR, { x: x0 + dx, y: y0 + dy, w: w0 - dx, h: h0 - dy });
eq('NW resize', { x: get(idR).x, y: get(idR).y, w: get(idR).w, h: get(idR).h },
   { x: 140, y: 110, w: 70, h: 60 });
api().undo();
eq('NW resize undone', { x: get(idR).x, y: get(idR).y, w: get(idR).w, h: get(idR).h },
   { x: 150, y: 130, w: 60, h: 40 });

// --- Selection: select then deselect ---
api().select(idR);
eq('select id', api().selectedId, idR);
api().select(null);
eq('deselect', api().selectedId, null);

if (failed === 0) {
  console.log('\nAll selection-flow assertions passed.');
} else {
  console.log(`\n${failed} failure(s).`);
  process.exit(1);
}
