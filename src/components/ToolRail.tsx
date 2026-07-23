import type { ReactNode } from 'react';
import { useEditorStore } from '../state/editorStore';
import type { Tool } from '../types/annotation';
import {
  SelectIcon,
  TextIcon,
  EditTextIcon,
  ImageIcon,
  SignatureIcon,
  PenIcon,
  HighlighterIcon,
  LineIcon,
  ArrowIcon,
  RectIcon,
  EllipseIcon,
  FormFieldIcon,
} from './icons';

interface ToolDef {
  tool: Tool;
  label: string;
  shortcut: string;
  icon: ReactNode;
}

const TOOLS: ToolDef[] = [
  { tool: 'select',        label: 'Select',         shortcut: 'V', icon: <SelectIcon /> },
  { tool: 'text',          label: 'Text',           shortcut: 'T', icon: <TextIcon /> },
  { tool: 'edit-existing', label: 'Edit Existing',  shortcut: 'E', icon: <EditTextIcon /> },
  { tool: 'image',         label: 'Image',          shortcut: 'I', icon: <ImageIcon /> },
  { tool: 'signature',     label: 'Signature',      shortcut: 'S', icon: <SignatureIcon /> },
  { tool: 'pen',           label: 'Pen',            shortcut: 'P', icon: <PenIcon /> },
  { tool: 'highlighter',   label: 'Highlighter',    shortcut: 'H', icon: <HighlighterIcon /> },
  { tool: 'line',          label: 'Line',           shortcut: 'L', icon: <LineIcon /> },
  { tool: 'arrow',         label: 'Arrow',          shortcut: 'A', icon: <ArrowIcon /> },
  { tool: 'rect',          label: 'Rectangle',      shortcut: 'R', icon: <RectIcon /> },
  { tool: 'ellipse',       label: 'Ellipse',        shortcut: 'O', icon: <EllipseIcon /> },
  { tool: 'form-field',    label: 'Form Field',     shortcut: 'B', icon: <FormFieldIcon /> },
];

export function ToolRail() {
  const active = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <nav className="tool-rail" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool-rail__btn ${active === t.tool ? 'tool-rail__btn--active' : ''}`}
          title={`${t.label} (${t.shortcut})`}
          aria-label={t.label}
          aria-pressed={active === t.tool}
          onClick={() => setTool(t.tool)}
        >
          {t.icon}
        </button>
      ))}
    </nav>
  );
}
