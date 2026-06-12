import { useEditorStore } from '../state/editorStore';
import type { Tool, ToolStyle } from '../types/annotation';

const STROKE_TOOLS = new Set<Tool>(['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse']);
const FILL_TOOLS   = new Set<Tool>(['rect', 'ellipse']);
const TEXT_TOOLS   = new Set<Tool>(['text']);

export function StylePanel() {
  const tool = useEditorStore((s) => s.tool);
  const style = useEditorStore((s) => s.style);
  const setStyle = useEditorStore((s) => s.setStyle);

  if (tool === 'select') {
    return (
      <div className="style-panel">
        <span className="style-panel__hint">Select an annotation to edit it</span>
      </div>
    );
  }

  if (tool === 'edit-existing') {
    return (
      <div className="style-panel">
        <span className="style-panel__tool">Edit Existing</span>
        <span className="style-panel__hint">
          Click any existing text or image on the page to modify or delete it
        </span>
      </div>
    );
  }

  if (tool === 'image') {
    return <ImageToolHint />;
  }

  return (
    <div className="style-panel">
      <span className="style-panel__tool">{labelFor(tool)}</span>
      {STROKE_TOOLS.has(tool) && (
        <>
          <ColorField
            label={tool === 'rect' || tool === 'ellipse' ? 'Stroke' : 'Color'}
            value={style.color}
            onChange={(c) => setStyle({ color: c })}
          />
          <RangeField
            label="Width"
            min={1}
            max={tool === 'highlighter' ? 40 : 20}
            value={style.strokeWidth}
            onChange={(v) => setStyle({ strokeWidth: v })}
          />
        </>
      )}
      {FILL_TOOLS.has(tool) && (
        <FillField value={style.fill} onChange={(c) => setStyle({ fill: c })} />
      )}
      {TEXT_TOOLS.has(tool) && (
        <>
          <ColorField
            label="Color"
            value={style.color}
            onChange={(c) => setStyle({ color: c })}
          />
          <RangeField
            label="Size"
            min={8}
            max={72}
            value={style.fontSize}
            onChange={(v) => setStyle({ fontSize: v })}
          />
          <SelectField
            label="Font"
            value={style.fontFamily}
            options={[
              { value: 'Helvetica', label: 'Helvetica' },
              { value: 'Times',     label: 'Times' },
            ]}
            onChange={(v) => setStyle({ fontFamily: v as ToolStyle['fontFamily'] })}
          />
        </>
      )}
    </div>
  );
}

function labelFor(t: Tool): string {
  switch (t) {
    case 'text':        return 'Text';
    case 'edit-existing': return 'Edit Existing';
    case 'image':         return 'Image';
    case 'pen':         return 'Pen';
    case 'highlighter': return 'Highlighter';
    case 'line':        return 'Line';
    case 'arrow':       return 'Arrow';
    case 'rect':        return 'Rectangle';
    case 'ellipse':     return 'Ellipse';
    case 'select':      return 'Select';
  }
}

function ImageToolHint() {
  const pendingImage = useEditorStore((s) => s.pendingImage);
  const setPendingImage = useEditorStore((s) => s.setPendingImage);
  return (
    <div className="style-panel">
      <span className="style-panel__tool">Image</span>
      {pendingImage ? (
        <>
          <span className="style-panel__hint">
            Click anywhere on the page to place
            {pendingImage.name ? <> · <code>{pendingImage.name}</code></> : null}
          </span>
          <button onClick={() => setPendingImage(null)} title="Clear staged image">Clear</button>
        </>
      ) : (
        <span className="style-panel__hint">No image loaded — pick a file to start</span>
      )}
    </div>
  );
}

interface ColorFieldProps { label: string; value: string; onChange: (c: string) => void; }
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="style-field">
      <span className="style-field__label">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="style-field__color"
      />
    </label>
  );
}

interface RangeFieldProps { label: string; min: number; max: number; value: number; onChange: (v: number) => void; }
function RangeField({ label, min, max, value, onChange }: RangeFieldProps) {
  return (
    <label className="style-field">
      <span className="style-field__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="style-field__range"
      />
      <span className="style-field__value">{value}</span>
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}
function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="style-field">
      <span className="style-field__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

interface FillFieldProps { value: string | null; onChange: (c: string | null) => void; }
function FillField({ value, onChange }: FillFieldProps) {
  const enabled = value !== null;
  return (
    <label className="style-field">
      <span className="style-field__label">Fill</span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked ? (value ?? '#ffff00') : null)}
        className="style-field__check"
      />
      <input
        type="color"
        value={value ?? '#ffff00'}
        disabled={!enabled}
        onChange={(e) => onChange(e.target.value)}
        className="style-field__color"
      />
    </label>
  );
}
