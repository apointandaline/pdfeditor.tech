// Drives the editor store the way the TextBox component would, end-to-end:
// create → coalesced typing → drag → resize → delete, with undo/redo assertions.

if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { useEditorStore, newAnnotationId, selectPageAnnotations } =
  await import('../src/state/editorStore.ts');

function api() { return useEditorStore.getState(); }
function pageList(p) { return selectPageAnnotations(p)(useEditorStore.getState()); }
function box(p, id) { return pageList(p).find((a) => a.id === id); }

function assertEq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK' : 'FAIL'}  ${label}  got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`);
  if (!ok) process.exitCode = 1;
}

// === Scenario A: full text-tool lifecycle on page 1 ===
const id = newAnnotationId();

// 1) AnnotationLayer.onPointerDown drops a new TextBox
api().addAnnotation({
  id, page: 1, kind: 'text',
  x: 100, y: 200, w: 160, h: 28,
  text: '', fontSize: 14, fontFamily: 'Helvetica', color: '#000',
});
assertEq('after add: selected', api().selectedId, id);
assertEq('after add: count',    pageList(1).length, 1);

// 2) TextBox useEffect: commit() to snapshot, then user types via patch
api().commit();
api().patchAnnotation(id, { text: 'H' });
api().patchAnnotation(id, { text: 'He' });
api().patchAnnotation(id, { text: 'Hel' });
api().patchAnnotation(id, { text: 'Hello' });
assertEq('after typing: text', box(1, id).text, 'Hello');

// One undo should revert the entire typing session
api().undo();
assertEq('after undo: text', box(1, id).text, '');
api().redo();
assertEq('after redo: text', box(1, id).text, 'Hello');

// 3) Drag: commit, then patch x/y repeatedly
api().commit();
const startX = box(1, id).x, startY = box(1, id).y;
api().patchAnnotation(id, { x: startX + 5,  y: startY + 5  });
api().patchAnnotation(id, { x: startX + 25, y: startY + 18 });
api().patchAnnotation(id, { x: startX + 50, y: startY + 30 });
assertEq('after drag: pos', { x: box(1, id).x, y: box(1, id).y }, { x: 150, y: 230 });

api().undo();
assertEq('after undo drag: pos', { x: box(1, id).x, y: box(1, id).y }, { x: 100, y: 200 });

// 4) Resize SE corner: commit, then patch w/h
api().redo(); // back to dragged position
api().commit();
api().patchAnnotation(id, { w: 240, h: 60 });
assertEq('after resize: size', { w: box(1, id).w, h: box(1, id).h }, { w: 240, h: 60 });

api().undo();
assertEq('after undo resize: size', { w: box(1, id).w, h: box(1, id).h }, { w: 160, h: 28 });

// 5) Delete the box
api().redo(); // re-apply resize
api().removeAnnotation(id);
assertEq('after delete: count', pageList(1).length, 0);
assertEq('after delete: selected', api().selectedId, null);

api().undo();
assertEq('after undo delete: count', pageList(1).length, 1);
assertEq('after undo delete: selected', api().selectedId, id);

// === Scenario B: reference reuse across pages ===
api().resetAnnotations();
const idA = newAnnotationId(), idB = newAnnotationId();
api().addAnnotation({ id: idA, page: 1, kind: 'text', x: 0, y: 0, w: 100, h: 20, text: 'a', fontSize: 14, fontFamily: 'Helvetica', color: '#000' });
api().addAnnotation({ id: idB, page: 2, kind: 'text', x: 0, y: 0, w: 100, h: 20, text: 'b', fontSize: 14, fontFamily: 'Helvetica', color: '#000' });

const p1Before = selectPageAnnotations(1)(useEditorStore.getState());
const p2Before = selectPageAnnotations(2)(useEditorStore.getState());

// Touch only page 2
api().patchAnnotation(idB, { text: 'bb' });

const p1After = selectPageAnnotations(1)(useEditorStore.getState());
const p2After = selectPageAnnotations(2)(useEditorStore.getState());

assertEq('page 1 array reference reused', p1After === p1Before, true);
assertEq('page 2 array reference changed', p2After !== p2Before, true);

// Stable empty for unknown page
const empty1 = selectPageAnnotations(99)(useEditorStore.getState());
const empty2 = selectPageAnnotations(99)(useEditorStore.getState());
assertEq('empty page returns stable ref', empty1 === empty2, true);

if (process.exitCode) {
  console.log('\nFAIL');
} else {
  console.log('\nAll text-flow assertions passed.');
}
