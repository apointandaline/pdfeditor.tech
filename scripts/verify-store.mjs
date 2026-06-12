// Quick sanity check of the editor store's undo/redo + snapshot behavior.
// We compile the TS on the fly via tsx. Run with: node --import tsx scripts/verify-store.mjs

// Polyfill crypto.randomUUID if needed (Node 19+ has it; older builds may not).
if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const { useEditorStore, newAnnotationId } = await import('../src/state/editorStore.ts');

function show(label) {
  const s = useEditorStore.getState();
  const counts = Object.fromEntries(
    Object.entries(s.annotations).map(([k, v]) => [k, v.length]),
  );
  console.log(`${label.padEnd(28)} past=${s.past.length} future=${s.future.length} sel=${s.selectedId?.slice(0, 4) ?? '-'} counts=${JSON.stringify(counts)}`);
}

function mkText(page, text) {
  return {
    id: newAnnotationId(),
    page,
    kind: 'text',
    x: 10, y: 10, w: 100, h: 30,
    text,
    fontSize: 14,
    fontFamily: 'Helvetica',
    color: '#000',
  };
}

const s = useEditorStore.getState();

show('initial');

const a1 = mkText(1, 'first');
s.addAnnotation(a1);
show('after add a1');

const a2 = mkText(1, 'second');
s.addAnnotation(a2);
show('after add a2');

s.updateAnnotation(a1.id, { text: 'first-edited' });
show('after update a1');

s.undo();
show('after undo (text reverts)');

s.undo();
show('after undo (a2 removed)');

s.undo();
show('after undo (a1 removed)');

s.undo();
show('after undo (no-op)');

s.redo();
show('after redo');

s.redo();
show('after redo');

// patch + commit coalescing
const a3 = mkText(2, 'third');
s.addAnnotation(a3);
show('after add a3');

// Coalesced edit pattern: commit BEFORE patching so the snapshot captures
// the pre-edit state. Subsequent patches don't push history; one undo reverts
// the whole edit.
const before = useEditorStore.getState().past.length;
s.commit();                                  // snapshot pre-edit state (a3 = "third")
s.patchAnnotation(a3.id, { text: 'third-a' });
s.patchAnnotation(a3.id, { text: 'third-ab' });
s.patchAnnotation(a3.id, { text: 'third-abc' });
const after = useEditorStore.getState().past.length;
console.log(`coalesced edit pushed ${after - before} entries (expect 1)`);

s.undo();
console.log('After undo, a3.text =',
  useEditorStore.getState().annotations[2].find((x) => x.id === a3.id).text,
  '(expect "third")');

console.log('OK');
