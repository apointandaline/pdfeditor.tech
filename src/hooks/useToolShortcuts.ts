import { useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';
import type { Tool } from '../types/annotation';

const KEY_TO_TOOL: Record<string, Tool> = {
  v: 'select',
  t: 'text',
  e: 'edit-existing',
  i: 'image',
  s: 'signature',
  p: 'pen',
  h: 'highlighter',
  l: 'line',
  a: 'arrow',
  r: 'rect',
  o: 'ellipse',
  b: 'form-field',
};

export function useToolShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      const tool = KEY_TO_TOOL[e.key.toLowerCase()];
      if (!tool) return;
      e.preventDefault();
      useEditorStore.getState().setTool(tool);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
