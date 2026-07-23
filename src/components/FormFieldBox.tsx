import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useEditorStore } from '../state/editorStore';
import type { FormFieldAnnotation } from '../types/annotation';

interface Props {
  annotation: FormFieldAnnotation;
  scale: number;
}

const DRAG_THRESHOLD = 4;
const MIN_W = 40;
const MIN_H = 20;

type Corner = 'nw' | 'ne' | 'sw' | 'se';

// A rectangular fillable text field. In the editor this shows as a native
// <input> so the author can type a default value; on save it becomes an
// AcroForm text field that stays editable in the final PDF.
export function FormFieldBox({ annotation, scale }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const initialFocusDone = useRef(false);
  const committedThisSession = useRef(false);

  const isSelected = useEditorStore((s) => s.selectedId === annotation.id);
  const tool = useEditorStore((s) => s.tool);
  const select = useEditorStore((s) => s.select);
  const patch = useEditorStore((s) => s.patchAnnotation);
  const commit = useEditorStore((s) => s.commit);
  const pendingFocusId = useEditorStore((s) => s.pendingFocusId);
  const clearPendingFocus = useEditorStore((s) => s.clearPendingFocus);

  // Auto-focus on creation so the author can immediately type the default
  // value. Mirrors TextBox's initial-focus effect.
  useEffect(() => {
    if (initialFocusDone.current) return;
    if (pendingFocusId !== annotation.id) return;
    initialFocusDone.current = true;
    setEditing(true);
    committedThisSession.current = false;
    commit();
    committedThisSession.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
    clearPendingFocus();
  }, [pendingFocusId, annotation.id, commit, clearPendingFocus]);

  function enterEditMode() {
    if (editing) return;
    setEditing(true);
    commit();
    committedThisSession.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  function onFrameDown(e: PointerEvent<HTMLDivElement>) {
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
        commit();
      }
      if (dragging) {
        patch(annotation.id, { x: startX + dx / scale, y: startY + dy / scale });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) enterEditMode();
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
        let nx = x0, ny = y0, nw = w0, nh = h0;
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

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!committedThisSession.current) {
      commit();
      committedThisSession.current = true;
    }
    patch(annotation.id, { defaultValue: e.target.value });
  }

  function onInputBlur() {
    setEditing(false);
    // Unlike TextBox we intentionally do NOT delete empty fields — an empty
    // fillable field is the whole point of the tool.
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    }
  }

  const interactive = tool === 'select' || tool === 'form-field';
  const showHandles = isSelected;

  return (
    <div
      className={`form-field-box ${isSelected ? 'form-field-box--selected' : ''} ${editing ? 'form-field-box--editing' : ''}`}
      style={{
        left: annotation.x * scale,
        top: annotation.y * scale,
        width: annotation.w * scale,
        height: annotation.h * scale,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onPointerDown={onFrameDown}
    >
      <input
        ref={inputRef}
        type="text"
        className="form-field-box__input"
        value={annotation.defaultValue}
        onChange={onInputChange}
        onBlur={onInputBlur}
        onKeyDown={onInputKeyDown}
        readOnly={!editing}
        placeholder=""
        style={{
          color: annotation.color,
          fontSize: annotation.fontSize * scale,
          // While not editing, don't let the input steal cursor from the drag
          // handler on the frame. `readOnly` alone doesn't disable pointer
          // events, but pointerdown on the frame is what matters for drag.
          cursor: editing ? 'text' : 'move',
        }}
      />
      {showHandles && (
        <>
          <div className="form-field-box__handle form-field-box__handle--nw" onPointerDown={onHandleDown('nw')} />
          <div className="form-field-box__handle form-field-box__handle--ne" onPointerDown={onHandleDown('ne')} />
          <div className="form-field-box__handle form-field-box__handle--sw" onPointerDown={onHandleDown('sw')} />
          <div className="form-field-box__handle form-field-box__handle--se" onPointerDown={onHandleDown('se')} />
        </>
      )}
    </div>
  );
}
