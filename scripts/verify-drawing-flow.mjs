// Verifies (1) svg-path helpers produce valid output and (2) the store
// round-trips each drawing-annotation kind through add → undo → redo cleanly.

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { smoothPath, arrowHeadPath, normalizeRect } = await import('../src/lib/svg-path.ts');
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

// --- svg-path helpers ---

check('smoothPath: empty → ""', smoothPath([]) === '');
check('smoothPath: 1 pt → starts with M', smoothPath([{ x: 5, y: 5 }]).startsWith('M '));
check('smoothPath: 2 pts → M ... L ...', /^M .* L /.test(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])));
check(
  'smoothPath: 4 pts → contains C (bezier)',
  /\bC \b/.test(smoothPath([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 },
  ])),
);

eq('normalizeRect: positive', normalizeRect(10, 20, 30, 40), { x: 10, y: 20, w: 30, h: 40 });
eq('normalizeRect: negative w', normalizeRect(10, 20, -5, 5), { x: 5, y: 20, w: 5, h: 5 });
eq('normalizeRect: negative h', normalizeRect(10, 20, 5, -5), { x: 10, y: 15, w: 5, h: 5 });
eq('normalizeRect: both negative', normalizeRect(10, 20, -5, -5), { x: 5, y: 15, w: 5, h: 5 });

const arrow = arrowHeadPath(0, 0, 10, 0, 4);
check('arrowHead: shape M…L…L', /^M .* L .* L /.test(arrow));

const arrow2 = arrowHeadPath(0, 0, 0, 10, 4);
check('arrowHead: vertical line still produces valid path', arrow2.startsWith('M '));

// --- store round-trips ---

const api = () => useEditorStore.getState();
api().resetAnnotations();

const idPath = newAnnotationId();
api().addAnnotation({
  id: idPath, page: 1, kind: 'path',
  variant: 'pen',
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 5 }],
  color: '#000', width: 2, opacity: 1,
});
const idHl = newAnnotationId();
api().addAnnotation({
  id: idHl, page: 1, kind: 'path',
  variant: 'highlighter',
  points: [{ x: 0, y: 50 }, { x: 50, y: 50 }],
  color: '#ff0', width: 20, opacity: 0.35,
});
const idLine = newAnnotationId();
api().addAnnotation({
  id: idLine, page: 1, kind: 'line',
  x1: 0, y1: 0, x2: 50, y2: 50,
  color: '#f00', width: 2, arrow: false,
});
const idArrow = newAnnotationId();
api().addAnnotation({
  id: idArrow, page: 1, kind: 'line',
  x1: 0, y1: 60, x2: 60, y2: 60,
  color: '#00f', width: 2, arrow: true,
});
const idRect = newAnnotationId();
api().addAnnotation({
  id: idRect, page: 1, kind: 'shape', shape: 'rect',
  x: 10, y: 10, w: 100, h: 50,
  stroke: '#000', fill: null, width: 2,
});
const idEllipse = newAnnotationId();
api().addAnnotation({
  id: idEllipse, page: 1, kind: 'shape', shape: 'ellipse',
  x: 10, y: 80, w: 80, h: 40,
  stroke: '#000', fill: '#ff0', width: 2,
});

const all = selectPageAnnotations(1)(api());
eq('all 6 annotations stored', all.length, 6);

const byId = Object.fromEntries(all.map((a) => [a.id, a]));
eq('pen variant',        byId[idPath].variant, 'pen');
eq('highlighter variant',byId[idHl].variant, 'highlighter');
eq('arrow flag',         byId[idArrow].arrow, true);
eq('rect shape',         byId[idRect].shape, 'rect');
eq('ellipse shape + fill', { shape: byId[idEllipse].shape, fill: byId[idEllipse].fill }, { shape: 'ellipse', fill: '#ff0' });

// Undo all 6
for (let i = 0; i < 6; i++) api().undo();
eq('all 6 undone', selectPageAnnotations(1)(api()).length, 0);

// Redo all 6
for (let i = 0; i < 6; i++) api().redo();
eq('all 6 redone', selectPageAnnotations(1)(api()).length, 6);

// Selected after redo is the last-added
eq('selectedId after full redo', api().selectedId, idEllipse);

if (failed === 0) {
  console.log('\nAll drawing-flow assertions passed.');
} else {
  console.log(`\n${failed} failure(s).`);
  process.exit(1);
}
