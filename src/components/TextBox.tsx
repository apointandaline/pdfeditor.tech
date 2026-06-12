import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useEditorStore } from '../state/editorStore';
import type { TextAnnotation } from '../types/annotation';

interface Props {
  annotation: TextAnnotation;
  scale: number;
}

const FONT_STACK: Record<TextAnnotation['fontFamily'], string> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: 'Times, "Times New Roman", serif',
};

// Distinguish a click (enter edit) from a drag (move). Pointer must travel
// this many CSS pixels before we consider it a drag.
const DRAG_THRESHOLD = 4;
const MIN_W = 30;
const MIN_H = 20;

type Corner = 'nw' | 'ne' | 'sw' | 'se';

export function TextBox({ annotation, scale }: Props) {
  const editRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  // Used to fire initial focus exactly once per component instance.
  const initialFocusDone = useRef(false);
  // True once the user types anything during the current edit session.
  // Used to decide whether a no-op blur should revert an edit-existing click.
  const didEdit = useRef(false);
  // True once we've pushed a commit() for the current edit session. Prevents
  // committing twice if the user types more than one character.
  const committedThisSession = useRef(false);

  const isSelected = useEditorStore((s) => s.selectedId === annotation.id);
  const tool = useEditorStore((s) => s.tool);
  const select = useEditorStore((s) => s.select);
  const patch = useEditorStore((s) => s.patchAnnotation);
  const remove = useEditorStore((s) => s.removeAnnotation);
  const commit = useEditorStore((s) => s.commit);
  const pendingFocusId = useEditorStore((s) => s.pendingFocusId);
  const clearPendingFocus = useEditorStore((s) => s.clearPendingFocus);

  // Auto-enter edit mode when the store flagged this annotation as the
  // pending focus target (only set by addAnnotation / addAnnotations on
  // creation — *not* by a click-to-select). This lets edit-existing-text
  // create a text box pre-filled with the original text and immediately
  // hand the cursor to the user.
  useEffect(() => {
    if (initialFocusDone.current) return;
    if (pendingFocusId !== annotation.id) return;
    const el = editRef.current;
    if (!el) return;

    initialFocusDone.current = true;
    setEditing(true);
    didEdit.current = false;
    committedThisSession.current = false;
    // Populate the DOM with the current annotation text BEFORE focusing.
    // The text-sync effect would normally do this, but it skips while the
    // element is focused — and we're about to focus. Without this, the
    // DOM stays empty even though annotation.text is set, and the blur
    // handler's text-match check never finds the original text.
    if (el.textContent !== annotation.text) {
      el.textContent = annotation.text;
    }
    // For brand-new text (no origin), snapshot the empty-text state so undo
    // collapses the typing session. For edit-existing replacements, defer the
    // commit until first edit — that way undo cleanly reverts the click when
    // the user makes no changes.
    if (!annotation.origin) {
      commit();
      committedThisSession.current = true;
    }
    el.focus();
    placeCaretAtEnd(el);
    clearPendingFocus();
  }, [pendingFocusId, annotation.id, annotation.origin, annotation.text, commit, clearPendingFocus]);

  // Keep the DOM text in sync with the store WITHOUT clobbering the caret
  // while the user is actively typing.
  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    if (el.textContent === annotation.text) return;
    if (document.activeElement === el) return;
    el.textContent = annotation.text;
  }, [annotation.text]);

  function enterEditMode() {
    if (editing) return;
    setEditing(true);
    didEdit.current = false;
    // For click-to-edit on existing textboxes we always commit so undo
    // brings back the pre-edit text. (Edit-existing-from-PDF uses the
    // first-input lazy commit path instead, via origin.)
    commit();
    committedThisSession.current = true;
    const el = editRef.current;
    if (el) {
      el.focus();
      placeCaretAtEnd(el);
    }
  }

  function onFrameDown(e: PointerEvent<HTMLDivElement>) {
    // While editing, the inner contentEditable owns the click for caret
    // positioning + text selection. We only intervene when not editing.
    if (editing) return;

    e.stopPropagation();
    e.preventDefault();
    select(annotation.id);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = annotation.x;
    const startY = annotation.y;
    let dragging = false;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        dragging = true;
        commit(); // snapshot pre-drag state
      }
      if (dragging) {
        patch(annotation.id, { x: startX + dx / scale, y: startY + dy / scale });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) {
        // It was a click, not a drag → enter edit mode.
        enterEditMode();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onHandleDown(corner: Corner) {
    return (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      select(annotation.id);
      commit();

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const { x: x0, y: y0, w: w0, h: h0 } = annotation;

      const onMove = (ev: globalThis.PointerEvent) => {
        const dx = (ev.clientX - startClientX) / scale;
        const dy = (ev.clientY - startClientY) / scale;
        let nx = x0;
        let ny = y0;
        let nw = w0;
        let nh = h0;
        if (corner === 'nw') { nx = x0 + dx; ny = y0 + dy; nw = w0 - dx; nh = h0 - dy; }
        if (corner === 'ne') {                ny = y0 + dy; nw = w0 + dx; nh = h0 - dy; }
        if (corner === 'sw') { nx = x0 + dx;                nw = w0 - dx; nh = h0 + dy; }
        if (corner === 'se') {                              nw = w0 + dx; nh = h0 + dy; }

        if (nw < MIN_W) {
          if (corner === 'nw' || corner === 'sw') nx = x0 + w0 - MIN_W;
          nw = MIN_W;
        }
        if (nh < MIN_H) {
          if (corner === 'nw' || corner === 'ne') ny = y0 + h0 - MIN_H;
          nh = MIN_H;
        }
        patch(annotation.id, { x: nx, y: ny, w: nw, h: nh });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  function onEditInput() {
    const el = editRef.current;
    if (!el) return;
    // Lazy commit on first real edit when we deferred during auto-focus
    // (edit-existing path). Snapshots the post-click, pre-edit state so
    // undo can roll back the typing session without removing the textbox.
    if (!committedThisSession.current) {
      commit();
      committedThisSession.current = true;
    }
    didEdit.current = true;
    patch(annotation.id, { text: el.textContent ?? '' });
  }

  function onEditBlur() {
    setEditing(false);
    const text = editRef.current?.textContent ?? '';

    // Silent revert: user clicked an Edit Existing hotspot, never typed
    // anything (didEdit stays false because onInput didn't fire), and the
    // text still matches the original. Roll the addAnnotations entry back
    // so whiteout + replacement vanish and the original PDF text shows
    // through unchanged. Clear future to keep the revert non-redoable.
    if (annotation.origin && !didEdit.current && text === annotation.origin.text) {
      useEditorStore.getState().undo();
      useEditorStore.setState({ future: [] });
      return;
    }

    // Standard: an empty textbox cleans itself up. For edit-existing with
    // intentional delete (user cleared all the text), this removes the text
    // annotation but leaves the whiteout — effectively a delete.
    if (text.trim() === '') {
      remove(annotation.id);
    }
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      editRef.current?.blur();
    }
  }

  // Only capture pointer when select or text tool is active. Other tools should
  // be able to draw OVER the box without it stealing clicks.
  const interactive = tool === 'select' || tool === 'text';
  const showHandles = isSelected && !editing;

  return (
    <div
      className={`text-box ${isSelected ? 'text-box--selected' : ''} ${editing ? 'text-box--editing' : ''}`}
      style={{
        left: annotation.x * scale,
        top: annotation.y * scale,
        width: annotation.w * scale,
        height: annotation.h * scale,
        pointerEvents: interactive ? 'auto' : 'none',
        color: annotation.color,
        fontSize: annotation.fontSize * scale,
        fontFamily: FONT_STACK[annotation.fontFamily],
        fontWeight: annotation.bold ? 700 : 400,
        fontStyle: annotation.italic ? 'italic' : 'normal',
      }}
      onPointerDown={onFrameDown}
    >
      <div
        ref={editRef}
        className="text-box__edit"
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={onEditInput}
        onBlur={onEditBlur}
        onKeyDown={onEditKeyDown}
        // While not editing, clicks on the inner div are handled by frame's
        // pointerdown (it bubbles since we don't stopPropagation here).
      />
      {showHandles && (
        <>
          <div className="text-box__handle text-box__handle--nw" onPointerDown={onHandleDown('nw')} />
          <div className="text-box__handle text-box__handle--ne" onPointerDown={onHandleDown('ne')} />
          <div className="text-box__handle text-box__handle--sw" onPointerDown={onHandleDown('sw')} />
          <div className="text-box__handle text-box__handle--se" onPointerDown={onHandleDown('se')} />
        </>
      )}
    </div>
  );
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
