import { useEditorStore, selectCanUndo, selectCanRedo } from '../state/editorStore';

interface Props {
  fileName: string | null;
  pageCount: number;
  scale: number;
  saving: boolean;
  canFitWidth: boolean;
  onScaleChange: (s: number) => void;
  onFitWidth: () => void;
  onSave: () => void;
  onReset: () => void;
}

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function Toolbar({
  fileName,
  pageCount,
  scale,
  saving,
  canFitWidth,
  onScaleChange,
  onFitWidth,
  onSave,
  onReset,
}: Props) {
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  function step(direction: 1 | -1) {
    const idx = ZOOM_STEPS.findIndex((s) => Math.abs(s - scale) < 0.001);
    const next = idx === -1
      ? (direction === 1 ? ZOOM_STEPS.find((s) => s > scale) : [...ZOOM_STEPS].reverse().find((s) => s < scale))
      : ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + direction))];
    if (next != null) onScaleChange(next);
  }

  // The select control may be at a value that isn't in ZOOM_STEPS (post-fit
  // or post-ctrl-wheel). Show "Custom" in that case so the dropdown isn't
  // visually empty.
  const showsCustom = !ZOOM_STEPS.some((s) => Math.abs(s - scale) < 0.001);

  return (
    <header className="toolbar">
      <div className="toolbar__left">
        <strong>PDF Editor</strong>
        {fileName && (
          <span className="toolbar__file">
            {fileName} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </span>
        )}
      </div>
      <div className="toolbar__right">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <span className="toolbar__sep" aria-hidden />
        <button onClick={() => step(-1)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <span className="toolbar__zoom">{Math.round(scale * 100)}%</span>
        <button onClick={() => step(1)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <select
          value={showsCustom ? 'custom' : String(scale)}
          onChange={(e) => {
            if (e.target.value === 'custom') return;
            onScaleChange(Number(e.target.value));
          }}
          title="Zoom"
        >
          {showsCustom && <option value="custom">{Math.round(scale * 100)}%</option>}
          {ZOOM_STEPS.map((s) => (
            <option key={s} value={s}>{Math.round(s * 100)}%</option>
          ))}
        </select>
        <button onClick={onFitWidth} disabled={!canFitWidth} title="Fit width (F)">Fit width</button>
        <span className="toolbar__sep" aria-hidden />
        <button
          className="toolbar__save"
          onClick={onSave}
          disabled={saving}
          title="Save edited PDF"
        >
          {saving ? 'Saving…' : 'Save PDF'}
        </button>
        <button onClick={onReset} title="Close current PDF">Close</button>
      </div>
    </header>
  );
}
