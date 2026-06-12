import { useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';

// Delete / Backspace on a selected annotation removes it. Skips when the user
// is typing into a text box (contentEditable) or any form field, so the keys
// edit text instead.
export function useSelectionShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      const id = useEditorStore.getState().selectedId;
      if (!id) return;
      e.preventDefault();
      useEditorStore.getState().removeAnnotation(id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
