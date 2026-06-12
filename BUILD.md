# PDF Editor — Build Log

A web-based PDF editor (Sejda-style): upload → add text & draw → download.
Fully client-side. No server, no upload, files never leave the machine.

---

## Build plan overview

| Step | Goal | Status |
|------|------|--------|
| 1 | Scaffold + render a PDF to canvas with zoom | **Done** |
| 2 | State model (annotations + undo/redo) | **Done** |
| 3 | Toolbar with tool selection + style pickers | **Done** |
| 4 | Text tool (drop-and-type, move, resize) | **Done** |
| 5 | Drawing tools (pen, highlighter, line/arrow, rect, ellipse) | **Done** |
| 6 | Selection / manipulation of placed annotations | **Done** |
| 7 | Save via pdf-lib → download | **Done** |
| 8 | Polish (thumbnails, drag-on-window, fonts, zoom, loading) | **Done** |
| 9 | Edit existing PDF text (whiteout + replace) | **Done** |
| 10 | Images: insert · move · resize · delete | **Done** |

V1 feature set (locked):

- Add new text boxes (drop-and-type)
- Pen, highlighter, line, arrow, rectangle, ellipse
- Undo/redo (no autosave/persistence)
- Save as PDF and download

Deliberately deferred: edit-existing-text, images/signatures, whiteout,
page reorder/rotate/delete, form fields, OCR.

---

## Stack

| Concern | Choice |
|---------|--------|
| Build / dev server | Vite 8 |
| Framework | React 19 + TypeScript |
| PDF rendering (read side) | `pdfjs-dist` 6.x (renders pages to `<canvas>`) |
| PDF authoring (write side, later) | `pdf-lib` + `@pdf-lib/fontkit` |
| State (later) | `zustand` |
| Hosting | Local dev first; `vite build` → static deploy later |

Why this split: `pdfjs-dist` is great at *displaying* a PDF page faithfully but can't
write one. `pdf-lib` is great at *building* a PDF from objects but can't render.
We use pdfjs for the live view and pdf-lib at save time to stamp the annotations
back onto the original PDF bytes.

---

## Step 1 — what shipped

### Repo layout

```
~/pdf-editor/
├── BUILD.md                      ← this file
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
└── src/
    ├── main.tsx                  ← entry (unchanged from Vite scaffold)
    ├── App.tsx                   ← top-level state + routing between dropzone and viewer
    ├── App.css                   ← all app styles (dark theme)
    ├── index.css                 ← base resets only
    ├── pdf/
    │   ├── worker.ts             ← configures pdfjs GlobalWorkerOptions.workerSrc
    │   └── loader.ts             ← ArrayBuffer → PDFDocumentProxy
    └── components/
        ├── DropZone.tsx          ← file input + drag-drop, shown until a PDF is loaded
        ├── Toolbar.tsx           ← top bar with file name, zoom controls, close
        ├── PdfViewer.tsx         ← scrollable column of pages
        └── PdfPage.tsx           ← renders one page to a canvas; reacts to scale
```

### How it works (today)

1. **DropZone** accepts a file → `App.handleFile()`.
2. `handleFile` reads the file to an `ArrayBuffer`, passes it to `loadPdf()`.
3. `loadPdf` hands a *copy* of the bytes to `pdfjsLib.getDocument(...)`.
   We copy because pdfjs may transfer ownership of the buffer it receives; we
   need to keep the originals around for `pdf-lib` to read on save in step 7.
4. The resulting `PDFDocumentProxy` is stored in `App` state. The viewer
   replaces the dropzone.
5. `PdfViewer` maps each page number to a `<PdfPage>`. Each `<PdfPage>` calls
   `getPage(n)`, builds a viewport at the current `scale`, sizes its canvas
   for both CSS pixels and devicePixelRatio (for crisp rendering on HiDPI),
   and calls `page.render({ canvas, canvasContext, viewport })`.
6. The render task is cancellable; the effect cancels it on cleanup so rapid
   zoom changes don't leak tasks.
7. **Toolbar** has zoom in / zoom out / preset select / close. Stepped zoom
   levels: 50 / 75 / 100 / 125 / 150 / 200 %.

### Key files (notes worth keeping)

- `src/pdf/worker.ts` — Vite-specific worker config. The `?url` suffix asks
  Vite to emit the worker file as an asset and hand back its served URL.
- `src/pdf/loader.ts` — keep the byte-copy step. Removing it will silently
  break the save flow in step 7.
- `src/components/PdfPage.tsx` — the DPR doubling lives here. If pages look
  blurry on a 4K display, this is the place to look. Render cancellation
  also lives here; don't forget to keep `task?.cancel()` in the cleanup.

### Decisions / non-obvious choices

- **Why we don't use `react-pdf`**: it wraps pdfjs but constrains the render
  pipeline. For step 4+ we need our own overlay layer per page (text boxes
  and SVG drawings positioned in CSS over the canvas). Doing it directly
  with pdfjs keeps that overlay simple.
- **Dark theme**: easier on the eyes for long edit sessions; the PDF page
  itself stays white so the document reads correctly.
- **No page thumbnails sidebar yet**: deferred to step 8.

---

## Running it

```bash
cd ~/pdf-editor
npm run dev        # http://localhost:5173 by default
```

In this build session the server was started on port **5180** for testing:
`npm run dev -- --host 127.0.0.1 --port 5180`.

Production build (for the static-deploy target later):

```bash
npm run build
npm run preview    # serve the built dist/ locally to sanity check
```

---

## Verification done in step 1

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `npm run dev` → Vite ready in ~280 ms, HTTP 200 on `/`
- `src/pdf/worker.ts` transforms correctly through Vite (worker URL resolved
  by Vite as expected)

### Not yet verified

- End-to-end: drop a real PDF into the dropzone and confirm pages render.
  Do this in the browser at the dev URL above. If the worker fails to start
  you'll see a console error and pages will stay blank — that's the canary
  for a worker misconfig.

---

## Step 2 — annotation state model + undo/redo

### What shipped

| File | Purpose |
|------|---------|
| `src/types/annotation.ts` | Discriminated union for all v1 annotation kinds. `Tool` enum, `ToolStyle` defaults. |
| `src/state/editorStore.ts` | Zustand store: annotations per page, selection, tool/style, snapshot-based undo/redo. |
| `src/hooks/useUndoShortcuts.ts` | Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z / Ctrl+Y = redo. Skips events from input/textarea/contentEditable. |
| `src/components/Toolbar.tsx` | Now has Undo / Redo buttons; disabled when the stack is empty. |
| `src/App.tsx` | Installs the shortcut hook; `reset()` also clears the store. |

### Annotation model

`Annotation = TextAnnotation | PathAnnotation | LineAnnotation | ShapeAnnotation`,
discriminated on `kind`. Geometry stored in **CSS pixels at scale 1.0** — see
`src/types/annotation.ts` for the rationale. Step 7 converts to PDF points on
save; the viewer multiplies by zoom for display.

Tools (`Tool`): `select | text | pen | highlighter | line | arrow | rect | ellipse`.
"Arrow" produces a `LineAnnotation` with `arrow: true`. Tool kinds and
annotation kinds intentionally don't 1:1 map — keeps the union tight.

### Store shape

```ts
{
  annotations: Record<pageNumber, Annotation[]>;
  selectedId: string | null;
  tool: Tool;
  style: ToolStyle;
  past:   Snapshot[];   // capped at 100
  future: Snapshot[];   // capped at 100
}
```

### Undo strategy: snapshot-based

For v1 expected annotation counts (tens to low hundreds per doc), a full
`structuredClone` of `{annotations, selectedId}` per history entry is cheap
and the code is trivial. If memory ever bites, swap to inverse-command
records — but don't bother until measured.

### The patch/commit split (important for step 4+)

Two flavors of mutation:

| Method | Pushes history? | When |
|--------|-----------------|------|
| `addAnnotation` / `removeAnnotation` / `updateAnnotation` | yes | Discrete user actions (drop a textbox, delete one, change color via panel) |
| `patchAnnotation` | **no** | In-progress edits (every keystroke during typing, every mouse-move during a drag) |
| `commit()` | yes | Manually snapshot. Pair with `patchAnnotation`. |

**Coalescing pattern** (typing, dragging): call `commit()` *before* the first
patch to snapshot the pre-edit state, then patch freely. One undo reverts the
whole edit. This is exercised in `scripts/verify-store.mjs`.

Calling `commit()` *after* patches snapshots the post-edit state — usually
wrong. The script's last check verifies the correct pattern.

### Selectors (for fine-grained subscriptions)

```ts
import { useEditorStore, selectCanUndo, selectCanRedo, selectPageAnnotations } from './state/editorStore';

const canUndo = useEditorStore(selectCanUndo);
const pageOne = useEditorStore(selectPageAnnotations(1));
```

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-store.mjs` (run via `node --import tsx`) — exercises
  add/remove/update + undo/redo + redo-after-undo + patch-without-history +
  commit-then-patch coalescing. All assertions pass.
- New modules serve via the dev server (HTTP 200).

---

## Step 3 — control surface (tool rail + style panel)

### What shipped

| File | Purpose |
|------|---------|
| `src/components/icons.tsx` | Inline SVG icons (one per tool). No icon library dep. |
| `src/components/ToolRail.tsx` | Left rail; 8 tool buttons, active one highlighted with accent border. |
| `src/components/StylePanel.tsx` | Contextual style controls; swaps based on active tool. |
| `src/hooks/useToolShortcuts.ts` | Single-key tool shortcuts. |
| `src/App.tsx` | New flex layout: top Toolbar / { left ToolRail \| (StylePanel + viewer) }. |
| `src/App.css` | Workspace, rail, style panel, cursor classes. |

### Layout

```
┌─────────────────────────────────────────────┐
│ Toolbar (file · undo/redo · zoom · close)   │
├──────┬──────────────────────────────────────┤
│      │ StylePanel (contextual)              │
│ Tool ├──────────────────────────────────────┤
│ Rail │                                      │
│      │ PdfViewer (cursor reflects tool)     │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

### Keyboard shortcuts

| Key | Tool |
|-----|------|
| V | Select |
| T | Text |
| P | Pen |
| H | Highlighter |
| L | Line |
| A | Arrow |
| R | Rectangle |
| O | Ellipse (mnemonic: **O**val) |

Plus the existing Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y for undo/redo. All
shortcuts skip when the event target is an input/textarea/contentEditable so
they don't fight native text input (relevant once step 4 lands the text tool).

### Style panel rules

The panel reads `store.tool` and shows only the relevant controls. Mapping:

| Tool | Fields shown |
|------|--------------|
| select | hint only |
| text | Color, Size, Font |
| pen, line, arrow | Color, Width (1–20) |
| highlighter | Color, Width (1–40 — fatter range matches the tool) |
| rect, ellipse | Stroke, Width, Fill (toggle + color) |

`ToolStyle` is a single flat object in the store. The fill toggle is just
`fill: null` for "outline only" or a hex string for "filled". This keeps the
save step (step 7) trivial — just pass the value to pdf-lib's `drawRectangle`
/ `drawEllipse` `color` prop, or omit on null.

### Cursors

`viewer-wrap` gets a `cursor-${tool}` class. The CSS maps:

- `select` → default
- `text` → `text` (I-beam)
- everything else → `crosshair`

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- All new modules serve via the dev server (HTTP 200)
- Vite optimizes `zustand` cleanly on first load

### Not yet verified (needs browser)

- Tool clicks switching the panel
- Keyboard shortcuts not firing while a future text box is being typed in (they
  won't — the hook skips contentEditable — but worth re-checking after step 4)
- Cursor changes between tools

---

## Step 4 — text tool

### What shipped

| File | Purpose |
|------|---------|
| `src/components/AnnotationLayer.tsx` | Per-page overlay; routes pointer events based on active tool. |
| `src/components/TextBox.tsx` | One text box. Drop-and-type, drag-to-move, four corner handles. |
| `src/components/PdfPage.tsx` | Now lifts cssViewport dims to state so the overlay sizes to the canvas. |
| `src/hooks/useSelectionShortcuts.ts` | Delete / Backspace removes the selected annotation. |
| `src/state/editorStore.ts` | `mapAnnotations` now reuses page-array refs; `selectPageAnnotations` returns a stable empty list. |
| `src/App.tsx` | Installs the selection shortcut hook. |
| `src/App.css` | Styles for the layer, text box, selection outline, resize handles. |

### Layer + pointer routing

`AnnotationLayer` sits absolutely positioned over the page's `<canvas>`,
matching its CSS pixel size. It owns pointer events and dispatches by tool:

| Tool active | Click on blank area | Click on existing annotation |
|-------------|---------------------|------------------------------|
| `text`      | Drops a new TextBox at click location, auto-focuses, ready to type | Annotation handles it (select + enter edit) |
| `select`    | Deselects (sets `selectedId = null`) | Annotation handles it |
| pen / highlighter / line / arrow / rect / ellipse | _wired in step 5_ | _wired in step 5_ |

The layer uses `e.target !== e.currentTarget` to tell "blank area" from
"clicked a child annotation".

### TextBox UX

| Action | Behavior |
|--------|----------|
| Drop (click while tool=text) | Annotation added, selected, focused, `commit()` snapshots the empty state |
| Type | `patchAnnotation` updates text on each `input` (no history entry per keystroke) |
| Click on textbox (not editing) | Enters edit mode (`commit()` then focus) |
| Drag body (not editing) | Moves the box. `commit()` fires once the pointer moves past 4 px |
| Drag corner handle | Resizes; respects `MIN_W=30`, `MIN_H=20` |
| Esc | Blurs the contentEditable |
| Blur with empty text | Box is removed (Sejda's behavior) |
| Delete / Backspace when selected (not editing) | Box is removed |
| Pen/Line/Rect/etc tool active | Box renders with `pointer-events: none` so the drawing tools work straight over it |

### Coordinate math

All annotation geometry is stored at **scale 1.0** (canonical CSS pixels for
the page at its natural size). At display time, multiply by current zoom:

```ts
style={{
  left:   annotation.x * scale,
  top:    annotation.y * scale,
  width:  annotation.w * scale,
  height: annotation.h * scale,
  fontSize: annotation.fontSize * scale,
}}
```

Going the other way — converting pointer events into annotation geometry —
divide by scale:

```ts
const rect = layer.getBoundingClientRect();
const x = (clientX - rect.left) / scale;
const y = (clientY - rect.top)  / scale;
```

This means zooming never has to rewrite annotation data; everything is just a
display multiplier.

### contentEditable quirks worth remembering

- Don't pass `text` as React children — React would rewrite the DOM on every
  render, clobbering the caret. Sync via `useEffect` instead, and guard with
  `document.activeElement === el` so we never touch the DOM while typing.
- `placeCaretAtEnd` is needed because focusing a freshly empty contentEditable
  does not always position the caret — we set a collapsed range explicitly.
- `suppressContentEditableWarning` is set because TS would warn even though
  we never set children.

### Store reference reuse

`mapAnnotations` now diffs at the page level. If you patch an annotation on
page 7, pages 1–6 and 8+ get back their original list reference. With
`selectPageAnnotations(p)` reading `state.annotations[p] ?? EMPTY_PAGE`,
each `AnnotationLayer` only re-renders when its own page actually changes.

Verified via `scripts/verify-text-flow.mjs` (scenario B).

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-text-flow.mjs` (run via `node --import tsx`) — full lifecycle
  via store: add → coalesced typing → undo/redo → drag → undo/redo → resize →
  undo/redo → delete → undo. 16/16 assertions pass.
- New modules serve via the dev server (HTTP 200); HMR fired cleanly.

### Not yet verified (needs browser)

- Click-vs-drag disambiguation feel (4 px threshold)
- The auto-focus on a newly dropped textbox lands correctly under React 19
  + StrictMode (the effect runs twice in dev — `initialFocusDone` ref guards
  against double-commit, but the actual focus behavior should be eyeballed)
- contentEditable doesn't clobber the caret when undo/redo fires while the
  box is focused (the `document.activeElement === el` guard prevents the
  DOM-sync effect from touching it; verify with Ctrl+Z mid-typing)
- Resize handles look reasonable at extreme zooms

---

## Step 5 — drawing tools

### What shipped

| File | Purpose |
|------|---------|
| `src/lib/svg-path.ts` | `smoothPath` (Catmull-Rom → bezier), `arrowHeadPath`, `normalizeRect` |
| `src/components/AnnotationLayer.tsx` | Now hosts an `<svg>` sub-layer + local drawing state; six start handlers for the drawing tools |
| `src/App.css` | `.annotation-svg` rule (absolute, `pointer-events: none`, `overflow: visible`) |

### Layer architecture

`AnnotationLayer` is one wrapper `<div>` with two stacked children:

```
.annotation-layer  (pointerdown handler routes by active tool)
├── <svg .annotation-svg>          ← pointer-events: none
│     ├── committed paths/lines/shapes
│     └── live preview (component-local state)
└── TextBox × N                    ← divs, pointer-events conditional on tool
```

Z-order top to bottom: text boxes > SVG drawings > page canvas. SVG has
`pointer-events: none` so a click on a drawn shape (even a filled one) goes
straight through to the layer's pointerdown handler — that's intentional so
drawing tools can start anywhere without being trapped by existing artwork.
Selection of drawn shapes is a step 6 concern.

### Per-tool flow

All drawing tools follow the same pattern:

1. Pointer-down on blank area → seed component-local `drawing` state
2. Pointer-move on `window` → update `drawing` (closure capture of original style)
3. Pointer-up on `window` → if non-degenerate, `addAnnotation`; clear preview

| Tool | Seed | Per-move update | Commit gate |
|------|------|-----------------|-------------|
| pen | `{points: [start]}`, opacity 1 | append point | `points.length ≥ 2` |
| highlighter | same, opacity `style.highlighterOpacity`, `mixBlendMode: multiply` | append point | `points.length ≥ 2` |
| line | `{x1=x2=start.x, y1=y2=start.y}` | update x2/y2 | not a zero-length segment |
| arrow | line + `arrow: true` | same | same |
| rect | `{x=start.x, y=start.y, w=h=0}` | track delta (may be negative) | `normalizeRect`'d area ≥ 4 |
| ellipse | same + `shape: 'ellipse'` | same | same |

Style values (color, width, opacity, fill) are captured at pointer-down. If
the user fiddles the style panel mid-drag the live preview keeps the original
style, which matches user expectation.

### Why local state, not the store, during a drag

Pen drawing fires `pointermove` at ~60Hz. If each move pushed into zustand:

- The annotations array would churn → every selector relying on `state.annotations[page]` would re-render
- The history stack would fill with 100s of per-frame entries
- Undo would unwind one point at a time — useless

Keeping the drawing as component-local React state isolates the storm. The
store is touched exactly once, on pointer-up, with the final geometry. One
undo entry per stroke.

### Smoothing (Catmull-Rom)

`smoothPath` converts a list of raw cursor samples into cubic beziers, so the
ink looks continuous instead of polygonal. Endpoints are duplicated so the
curve passes through the first and last points. For 0/1/2 input points it
falls back to a degenerate move/line — that handles the "just-tapped" edge.

### Stroke widths and zoom

All geometry is stored at scale 1.0; the renderer multiplies by current zoom
for display (incl. `strokeWidth × scale`). That means lines look the same
physical thickness regardless of zoom — what Sejda does. On save (step 7),
the canonical width is what pdf-lib gets, so the saved PDF stays consistent
with what you saw at 100% zoom.

### Coordinates

`pointerToCanonical(clientX, clientY)` — single conversion point used by all
six start handlers and their move handlers:

```ts
const rect = layerRef.current!.getBoundingClientRect();
return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
```

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-drawing-flow.mjs` — 19/19 pass:
  - `smoothPath` shape for 0/1/2/4 points
  - `normalizeRect` for all four quadrant combinations
  - `arrowHeadPath` returns a valid `M…L…L` path (incl. vertical-line edge case)
  - Store round-trip for pen / highlighter / line / arrow / rect / ellipse
  - Undo all 6 → empty; redo all 6 → restored, last selection preserved
- New modules serve via dev server (HTTP 200); HMR fired cleanly

### Not yet verified (needs browser)

- Pen smoothing feel — Catmull-Rom tuned for 1/6 control-point pull, which
  is a common default; try a few strokes and check for over/undershoot
- Highlighter `mix-blend-mode: multiply` actually multiplies against the
  page canvas (it should — both are siblings inside `.pdf-page-wrap` which
  has a white background)
- Filled vs outline shapes look right (the Fill toggle in the style panel)
- Live preview keeps up at 200% zoom on a big page

### Not yet implemented (step 6+)

- Clicking a drawn shape to select it (path/line/shape have no select hit
  area yet — SVG layer is `pointer-events: none`)
- Moving / resizing drawn shapes (only text boxes have this)
- Per-annotation style edits after creation

---

## Step 6 — selection & manipulation of drawn annotations

### What shipped

| File | Purpose |
|------|---------|
| `src/lib/bounds.ts` | `pathBounds`, `lineBounds`, `shapeBounds` |
| `src/components/SvgAnnotation.tsx` | Per-kind renderer: visible element + transparent hit area on top |
| `src/components/SelectionOverlay.tsx` | Dashed bbox + handles; one component per kind |
| `src/components/AnnotationLayer.tsx` | Now hosts the select/move/resize/endpoint-drag handlers; delegates visible rendering to `SvgAnnotation` |

### Hit-area pattern (the load-bearing trick)

The `<svg>` wrapper stays `pointer-events: none` so blank-area clicks fall
through to the layer (where they trigger new-annotation creation or
deselect). Each annotation overrides this with a transparent "hit" element
layered **above** its visible element:

- **Path / line / arrow** — a duplicate `<path>` / `<line>` with
  `stroke="transparent"`, `stroke-width: max(visible, 14)`. Catches clicks
  along the stroke even when the visible width is 1 px.
- **Rect / ellipse** — a duplicate at the same geometry with
  `fill="transparent"`. Catches clicks anywhere inside the bounding box —
  even for outline-only shapes (Sejda's behavior).

The hit element's `pointer-events` is `'stroke'` / `'all'` only when
`interactive = (tool === 'select')`. With any other tool active, the value
is `'none'`, so drawing tools can start anywhere — including right on top
of an existing shape — without it stealing the click.

The visible element always has `pointer-events: 'none'`.

### Selection rendering order

In the `<svg>`:

1. All committed `SvgAnnotation`s (visible + hit pairs)
2. Live drawing preview (if any)
3. `SelectionOverlay` for the selected annotation **last**

Rendering the overlay last guarantees the handles are on top of every
other annotation — so they remain clickable even if other shapes are
visually stacked on top of the selected one.

### Selection UX by kind

| Kind | Bounding box | Handles |
|------|--------------|---------|
| Path (pen / highlighter) | Yes — wraps all stroke points | None — move-only in v1 |
| Line / arrow | Yes — min/max of endpoints | Two endpoint handles, drag to reshape |
| Rect / ellipse | Yes — matches shape | Four corner handles (`nw`, `ne`, `sw`, `se`) |

Resizing arbitrary point clouds is messy (uniform scale around bbox centroid?
each-point drag?) — deliberately deferred. Paths can be moved freely; for
serious editing the user can delete and redraw.

### Movement code

Same pattern as TextBox:

1. `pointerdown` on hit area → `select(a.id)`, snapshot geometry, install
   window-level `pointermove`/`pointerup` listeners
2. Move past 4 px → `dragging = true`, `commit()` for one undo entry
3. Each `pointermove` → `patchAnnotation` against the **snapshot**, not
   the previous patch's value (so floating-point drift can't accumulate)
4. `pointerup` → nothing extra; the commit already captured the before state

`applyTranslate` dispatches per kind:

- path → translate every point
- line → translate both endpoints together
- shape → translate `x` / `y`

### Resize / endpoint drag

- Shape corner — same `commit + patch` pattern; the corner determines which
  of `{x, y, w, h}` move. Floored at `MIN_SHAPE_DIM = 4`.
- Line endpoint — even simpler: `commit`, then patch just `{x1,y1}` or
  `{x2,y2}` based on which handle was dragged.

### Snapshot-vs-snap semantics

`snapshotGeometry(a)` captures the **starting** geometry once at pointer
down. Every move computes `start + Δ` rather than `previous + Δ`. This
matters for paths in particular: with point-by-point accumulation each
point would drift on every frame. The single-snapshot approach is
drift-free regardless of pointer event rate.

### Z-order: selected annotation might still be under others

Annotations are rendered in their store order (insertion order). If a
selected path sits visually behind a later annotation, the selected one's
visible stroke may be partially occluded. The selection overlay (bbox +
handles) is always on top, so manipulation still works — only the visible
appearance is occluded. Fine for v1; "bring to front" can be a step-8 polish.

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-selection-flow.mjs` — 16/16 pass:
  - bounds helpers (path/line/shape) including zero-point and reverse-direction edge cases
  - path move + undo + redo (whole-stroke translate)
  - line move + undo (both endpoints in lockstep)
  - line endpoint-drag + undo (single endpoint)
  - shape move + undo
  - shape NW-corner resize + undo (x/y/w/h all change)
  - select / deselect
- New modules serve via dev server (HTTP 200); HMR fired cleanly

### Not yet verified (needs browser)

- Hit area generosity feels right for 1 px lines (14 px hit width)
- Handle cursors look correct over crosshair tools (cursor overrides)
- Dashed bounding box doesn't visually jitter at fractional scales

---

## Step 7 — save as PDF

### What shipped

| File | Purpose |
|------|---------|
| `src/lib/color.ts` | `hexToRgb`, `pdfColor` — bridge from hex strings to pdf-lib `Color` |
| `src/pdf/save.ts` | `savePdf`, `downloadPdfBytes`, `suggestedFilename` |
| `src/App.tsx` | Re-enables the `bytes` getter; `onSave` calls `savePdf` then triggers download |
| `src/components/Toolbar.tsx` | New accent-colored Save button (shows "Saving…" while busy) |
| `src/App.css` | Styles for `.toolbar__save` |

### Coordinate translation

Store coords are top-left, scale 1.0 — by pdfjs convention this equals
PDF points (1 pt = 1/72 in) at the page's natural size. pdf-lib uses
bottom-left, so we Y-flip per element.

| Kind | x | y | Notes |
|------|---|---|-------|
| text | `a.x` | `pageHeight - a.y - a.fontSize * 0.85` | `0.85 * fontSize ≈ ascent`; baseline lands just under the top of the textbox |
| line / arrow | both endpoints | `pageHeight - y` per endpoint | Arrow draws two extra line segments from the tip |
| rect | `a.x` | `pageHeight - a.y - a.h` | pdf-lib `drawRectangle` x/y is bottom-left of the rect |
| ellipse | `a.x + a.w/2` | `pageHeight - (a.y + a.h/2)` | pdf-lib uses center; `xScale = w/2`, `yScale = h/2` |
| path | n/a | n/a | See note below — pdf-lib's `drawSvgPath` flips Y itself |

### The `drawSvgPath` quirk (worth not forgetting)

`drawSvgPath` applies `translate(x, y) + scale(1, -1)` internally so that
SVG-natural (top-left) coords render correctly. The right way to use it:

```ts
page.drawSvgPath(smoothPath(a.points), {
  x: 0,
  y: pageHeight,           // ← this is the trick; default is page.y, NOT pageHeight
  borderColor: pdfColor(a.color),
  borderWidth: a.width,
  borderOpacity: a.opacity,
  borderLineCap: LineCapStyle.Round,
  blendMode: isHighlighter ? BlendMode.Multiply : undefined,
});
```

If you pass `y = 0` (or rely on the default) the path renders upside down.
The `smoothPath(a.points)` produces top-left coords — DO NOT Y-flip them
manually before passing to `drawSvgPath`. You'd be flipping twice.

### Highlighter rendering

pdf-lib's `Color` doesn't include alpha, but every draw method takes an
`opacity` (and `blendMode`). For highlighter we set both:

```ts
borderOpacity: a.opacity,          // 0.35 from style
blendMode: BlendMode.Multiply,     // matches the CSS mix-blend-mode in the editor
```

Output renders close to what the user saw on screen — multiply against the
page content, not just against white.

### File download

`pdf-lib`'s `doc.save()` returns `Uint8Array`. We wrap in a `Blob`
(`application/pdf`), create an object URL, click a synthetic `<a download>`,
then revoke the URL after a brief delay (some browsers finalize the
download asynchronously). Filename suggestion: `foo.pdf` → `foo (edited).pdf`.

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-save.mjs` (run via `node --import tsx`) — 22/22 pass:
  - `hexToRgb` for `#fff`, `#000000`, primary colors, mixed values, and
    garbage input (now defends against non-hex chars)
  - `suggestedFilename` for `.pdf`, `.PDF`, no-extension, null
  - Build a 2-page base PDF, stamp every annotation kind (text, pen path,
    highlighter path, line, arrow, rect, ellipse with fill), save
  - Reload output with pdf-lib → page count + page dimensions preserved
  - Reload output with pdfjs → same path the browser uses → no errors
  - Extract page 1 text via pdfjs `getTextContent` → contains the marker
    string we stamped (proves text actually drew, not just that the doc
    is valid)
  - Empty-text annotation is skipped, not crashed on
- All new modules serve via dev server (HTTP 200); Vite optimized `pdf-lib`
  and `@pdf-lib/fontkit` cleanly

### Not yet verified (needs browser)

- Save button visually drops the file on disk with the suggested name
- Round-trip: open the saved file in a real PDF reader (Acrobat, Chrome's
  built-in viewer) and check annotations appear at the right positions

### Known limits (acceptable for v1)

- **Noto Sans falls back to Helvetica.** The font picker shows both, but
  saving uses Helvetica for both. Step 8 bundles a Noto Sans TTF for
  Unicode/diacritic support.
- **Page rotation not honored.** If a PDF has its rotation metadata set
  (90/180/270°), annotations stamp against the un-rotated viewport. None
  of the libraries we use give us this for free.
- **No anti-aliasing controls.** Real PDF readers anti-alias by default;
  if you save and view at extreme zoom you'll see vector-perfect sharpness
  which is correct but stark compared to the editor preview.
- **Highlighter opacity affects the stroke only.** If you also set a fill
  via `color: a.fill`, fill opacity is `opacity` (separate from
  `borderOpacity`). We don't fill highlighter paths, so this doesn't bite.

---

## Step 8 — polish

### What shipped

| File | Purpose |
|------|---------|
| `src/components/PageThumbs.tsx` | Left-sidebar thumbnails; lazy-renders via IntersectionObserver |
| `src/hooks/useZoomShortcuts.ts` | `useZoomShortcuts` (+/-/0/F) + `useCtrlWheelZoom` |
| `src/components/PdfPage.tsx` | Shimmer overlay while render task is in flight |
| `src/components/PdfViewer.tsx` | Now accepts `scrollerRef` so App can scroll-to-page |
| `src/components/Toolbar.tsx` | Fit-width button + "Custom %" option in zoom dropdown |
| `src/App.tsx` | Window-level drag-drop swap; viewerRef; page-1 width capture for fit-width |
| `src/types/annotation.ts` · `src/pdf/save.ts` · `StylePanel.tsx` · `TextBox.tsx` | Replace NotoSans → Times |
| `src/App.css` | Styles for thumbs, loading shimmer |

### Font choice: why Times instead of Noto Sans

Originally I planned to bundle Noto Sans TTF (~600 KB) for Unicode support.
**Times Roman is a PDF standard font** — built into every PDF reader, zero
embedding cost — and gives the user a real serif alternative. The trade-off:

- ✅ No bundle bloat
- ✅ Same font picker UX (Helvetica + Times)
- ✅ Renders consistently in both the editor and the saved PDF
- ❌ No glyph coverage beyond WinAnsi (no curly quotes, accents, CJK)

Acceptable for v1. If a user *needs* Unicode the Noto Sans path is well
sketched and can land in a follow-up — code only needs to swap one
`embedFont` call and add an asset import.

### Loading state

Each `PdfPage` flips `rendering = true` on every render-task start, then
back to `false` when `task.promise` resolves. While true, a shimmer overlay
covers the (briefly blank) canvas. Triggers on initial mount **and** on
zoom changes — both moments where the canvas gets cleared.

### Zoom UX

| Action | Shortcut |
|--------|----------|
| Zoom in | `+` / `=` |
| Zoom out | `-` / `_` |
| Reset to 100% | `0` or `Ctrl/Cmd + 0` |
| Fit width | `F` |
| Free zoom at cursor | `Ctrl/Cmd + wheel` |

- Step buttons (`−` / `+`) jump to the next preset; once you're off a
  preset (post-fit or post-wheel) they fall back to a 25%/80% multiplier.
- The dropdown shows a synthetic "Custom" entry when the scale is
  off-preset so the control isn't visually empty.
- Fit width is disabled until page-1 width resolves.
- All scale changes are clamped to `[0.25, 4.0]`.

### Page thumbnails

`PageThumbs` renders one button per page. Each thumb's canvas is rendered
lazily via `IntersectionObserver` with a 200 px root margin — for a
100-page PDF, that's ~10 concurrent renders instead of 100. Click any
thumb to `scrollIntoView({ behavior: 'smooth', block: 'start' })` the
matching full page (found via the existing `data-page="N"` attribute on
each `PdfPage`).

### Window-level drag-drop

A `useEffect` in App listens for `dragover`/`drop` at the window level:

1. Confirms the dataTransfer contains a file (so accidental text/link
   drags don't fire).
2. Confirms the file is a PDF (by mime type or `.pdf` extension).
3. If there are existing annotations, asks for confirmation before
   discarding them.
4. Calls `handleFile` (now a `useCallback` so the effect doesn't reattach
   on every render).

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- All six existing verification scripts pass:
  - `verify-pdf-load.mjs`, `verify-store.mjs`, `verify-text-flow.mjs`,
    `verify-drawing-flow.mjs`, `verify-selection-flow.mjs`
  - `verify-save.mjs` — **extended** to assert Times Roman stamping
    (now 23/23 pass; both `HELLOMARKER` (Helvetica) and `TIMESMARKER`
    (Times Roman) extract from the saved PDF)
- All new modules serve via dev server (HTTP 200)

---

## Step 9 — Edit existing PDF text

The "deferred to v2" feature, shipped. Click an existing word in the PDF →
covers it with a white rectangle and drops an editable text box in the
same place, pre-filled with the original text. Edit to replace, or
Delete to leave the whiteout (effectively a delete).

### What shipped

| File | Purpose |
|------|---------|
| `src/components/ExistingTextLayer.tsx` | Per-page overlay; fetches pdfjs `getTextContent` once and renders hotspots |
| `src/state/editorStore.ts` | `addAnnotations` (atomic multi-add) + `pendingFocusId` signal |
| `src/components/TextBox.tsx` | Auto-focus on `pendingFocusId === a.id` (no longer gated on empty text) |
| `src/components/icons.tsx` · `ToolRail.tsx` · `useToolShortcuts.ts` | New "Edit Text" tool (`E` shortcut) |
| `src/components/StylePanel.tsx` | Contextual hint when Edit Text is active |
| `src/components/PdfPage.tsx` | Renders `ExistingTextLayer` only when tool === 'edit-text' |
| `src/components/AnnotationLayer.tsx` | Returns early on edit-text blank-area clicks (no annotation creation) |
| `src/App.css` | Hotspot styles + edit-text cursor |

### Architecture

**Phase 1: Detection.** When the Edit Text tool is active, each page mounts an
`ExistingTextLayer` that calls `pdf.getPage(n).getTextContent()`. Each
`TextItem` becomes a hotspot:

- `transform[4]` = baseline x, `transform[5]` = baseline y (PDF coords)
- `fontSize = Math.hypot(transform[2], transform[3])` — robust against rotation
- Convert to our top-left scale-1.0 coords: `y = pageHeight - baselineY - fontSize`

The layer has `pointer-events: none`; only the hotspot rectangles inside
capture clicks. This way, blank areas still fall through to the
AnnotationLayer beneath.

**Phase 2: Click → atomic edit.** Clicking a hotspot calls
`addAnnotations([whiteout, replacement])`:

- **whiteout**: a `ShapeAnnotation` (rect with `fill: '#ffffff'`, `width: 0`)
  sized 1.5 px larger than the hotspot in each direction to cover
  ascenders/descenders
- **replacement**: a `TextAnnotation` at the same position with the original
  text, font size, and family pre-filled

Both annotations land with a single history snapshot — one Ctrl+Z reverts
the whole edit.

**Phase 3: Auto-edit-mode.** The new pattern that makes this work cleanly:

```ts
// editorStore.ts — addAnnotation(s) sets pendingFocusId to the new text id
addAnnotations: (list) => set((s) => ({
  ...,
  selectedId: list.at(-1).id,
  pendingFocusId: lastTextAnnotationId(list),
}));

// TextBox.tsx — auto-edit-mode triggers ONLY on pendingFocusId match
useEffect(() => {
  if (initialFocusDone.current) return;
  if (pendingFocusId !== annotation.id) return;
  initialFocusDone.current = true;
  setEditing(true);
  commit();
  el.focus();
  placeCaretAtEnd(el);
  clearPendingFocus();
}, [pendingFocusId, annotation.id, commit, clearPendingFocus]);
```

The previous `annotation.text === ''` gate meant "auto-focus only on
empty-textbox creation". For Edit Text we needed to auto-focus a
*pre-filled* text box — but only when it was just created, not every time
the user clicks a textbox. The `pendingFocusId` signal makes "just created"
explicit, decoupled from selection.

After click, the layer also calls `setTool('select')` so the new textbox
is interactive immediately (the Edit Text hotspots would otherwise sit
on top of it).

### Font-match heuristic

pdfjs reports a CSS font family per text run via `tc.styles[fontName].fontFamily`.
Pick maps that to one of our two embedded fonts:

| Input contains | → Output |
|----------------|----------|
| `mono` / `courier` | Helvetica (no monospace option) |
| `sans` | Helvetica |
| `serif` (without "sans") | Times |
| `times` | Times |
| anything else / undefined | Helvetica |

It's a coarse heuristic — PDF font names are notoriously cryptic ("g_d0_f1")
and pdfjs only resolves them when the embedded font has clear metadata.
For most documents it gets the serif/sans-serif distinction right; for
edge cases the user can swap fonts via the style panel after the edit.

### Known limits (kept manageable for the feature scope)

- **One run at a time.** Hotspots are per-`TextItem`, which often means
  per-word or per-line. Editing a paragraph means editing each piece. Could
  group adjacent items into one paragraph hotspot in a follow-up.
- **No glyph-perfect font match.** See heuristic above — bold/italic/weight
  aren't extracted; replacements render in regular weight.
- **No color extraction.** Replacement text is black by default. User can
  recolor via the style panel.
- **Rotated text uses unrotated bounding box.** `Math.hypot` recovers the
  font size, but the hotspot rectangle is axis-aligned. Visual mismatch
  for rotated text.
- **Hotspots cover annotations layered above them.** If the user already
  added an annotation over an existing text run, the hotspot still shows
  on top in Edit Text mode. Was a design choice (per the consultation) —
  trade-off for not running per-render overlap checks.

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-edit-text.mjs` — 17/17 pass:
  - `addAnnotations` pushes exactly one past entry for the batch
  - `selectedId` = last in batch; `pendingFocusId` = last *text* in batch
  - One undo reverts both whiteout + text; one redo restores both
  - When text comes first and whiteout second, `pendingFocusId` still
    targets the text (covers the "what if order is unstable" case)
  - `select(id)` does NOT set `pendingFocusId` (so click-to-select on
    existing textboxes doesn't blow them into edit mode)
  - Adding a non-text annotation (shape) leaves `pendingFocusId` null
  - `pickFont` heuristic for all common inputs (undefined / sans-serif /
    serif / Times / monospace / Courier / Arial)
- Full suite (7 scripts) still passes — no regression to text-flow,
  drawing-flow, selection-flow, store, save, pdf-load

---

## Step 10 — Images

Three image flows in one feature drop:

1. **Insert** new images (file upload → click to place)
2. **Move / resize / delete** any image annotation (drag, corner handles, Delete key)
3. **Edit existing** images in the PDF (bitmap capture + whiteout + drag/resize)

### What shipped

| File | Purpose |
|------|---------|
| `src/types/annotation.ts` | `ImageAnnotation` kind; `image` and renamed `edit-existing` tools |
| `src/lib/image.ts` | `dataUrlToBytes`, `dataUrlMime`, `captureCanvasRegion`, `loadImageDims` |
| `src/lib/font.ts` | Extracted `pickFont` for Node-side test reuse |
| `src/lib/bounds.ts` | `imageBounds` |
| `src/components/SvgAnnotation.tsx` | Renders `<image>` + hit rect for ImageAnnotation |
| `src/components/SelectionOverlay.tsx` | `ImageSelectionOverlay` (reuses bbox+corner-handle helper extracted from ShapeSelectionOverlay) |
| `src/components/AnnotationLayer.tsx` | Treats `image` like `shape` for move + corner-resize; handles `image` tool placement |
| `src/components/ExistingItemsLayer.tsx` | Renamed from `ExistingTextLayer`; now also detects images via pdfjs operator list |
| `src/components/icons.tsx` | `ImageIcon` (rect with mountain glyph) |
| `src/components/ToolRail.tsx` · `useToolShortcuts.ts` | "Image" tool button + `I` shortcut |
| `src/components/StylePanel.tsx` | New `ImageToolHint`; updated edit-existing hint |
| `src/state/editorStore.ts` | `pendingImage` state + setter; `setTool('image')` triggers picker in App |
| `src/pdf/save.ts` | Pre-embeds unique images via `embedPng`/`embedJpg`; `drawImage` with Y-flipped coords |
| `src/App.tsx` | Hidden file input + `useEffect` watches tool transition → opens picker |
| `src/App.css` | Hotspot variants (blue for text, orange for images); image-tool cursor |

### Image detection (CTM walk over operator list)

`pdfjs.getOperatorList()` returns a stream of `[code, args]` pairs. We walk it
maintaining a current-transformation-matrix (CTM) stack:

```ts
let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
for each op:
  switch(op.code):
    case OPS.save:      stack.push(ctm.slice())
    case OPS.restore:   ctm = stack.pop() ?? ctm
    case OPS.transform: ctm = multiplyAffine(ctm, op.args)
    case OPS.paintImageXObject:
    case OPS.paintInlineImageXObject:
    case OPS.paintImageMaskXObject:
       if axis-aligned (b≈0, c≈0):
         w = |ctm[0]|, h = |ctm[3]|
         pdfX = ctm[4], pdfY_bottom = ctm[5]
         storedY = pageHeight - pdfY_bottom - h
```

Rotated/skewed images (non-zero `b`/`c` in the CTM) are skipped for v1 — the
axis-aligned hotspot would mis-cover them.

Tiny artifacts (<4 pt in either dimension) are skipped — many PDFs have
1-pixel decorative paint operations from raster halftones.

### Bitmap capture (the key trick)

When the user clicks an image hotspot, we don't have the original PNG/JPEG
bytes from the PDF's object stream — extracting those is a deep rabbit hole.
Instead, we crop the already-rendered page canvas:

```ts
captureCanvasRegion(canvas,
  storedX * scale * dpr,   // source x in canvas pixel space
  storedY * scale * dpr,
  storedW * scale * dpr,
  storedH * scale * dpr,
);
```

Output: a fresh canvas at the source resolution, `toDataURL('image/png')`.
Trade-off: vector images become raster, and the capture resolution is
whatever the current display scale × DPR happens to be. Reasonable for v1;
documented as a limit.

### Save dedup

Five `ImageAnnotation`s with the same `src` data URL embed **one** image in
the saved PDF (verified by output size). The pre-embed map keys on the
data URL string:

```ts
const images = new Map<string, PDFImage>();
for each annotation:
  if image and not in map:
    bytes = dataUrlToBytes(a.src)
    images.set(a.src, mime === 'jpeg' ? embedJpg(bytes) : embedPng(bytes))
```

### Atomic edit pattern (reused from edit-text)

Clicking an image hotspot fires `addAnnotations([whiteout, image])` — one
history entry covers both. Undo reverts both at once. Mirrors the text edit
flow exactly, except `pendingFocusId` stays null (image annotations don't
need focus).

### Insert flow

1. User clicks the Image tool button (or presses `I`)
2. `useEffect` in App detects the transition into `image` tool → opens hidden
   `<input type="file">`
3. User picks a file → `readAsDataUrl(file)` → `loadImageDims(src)` →
   `setPendingImage({src, w, h, name})`
4. Style panel shows "Click anywhere on the page to place · `red.png` · Clear"
5. User clicks on a page → AnnotationLayer adds an `ImageAnnotation` centered
   on the click position (capped to `MAX_DEFAULT_W = 240` to avoid drowning
   the page); clears `pendingImage`; auto-switches to `select` so the new
   image is immediately draggable

If the user cancels the file picker, tool falls back to `select` so they
aren't stuck on an inert Image mode.

### Verification done

- `npx tsc --noEmit -p tsconfig.app.json` → clean
- `scripts/verify-image.mjs` — 22/22 pass:
  - `dataUrlMime` for png/jpg/unknown
  - `dataUrlToBytes` preserves PNG signature
  - `imageBounds` passthrough
  - Single-add `ImageAnnotation` selects it, leaves `pendingFocusId` null
  - Undo/redo on a lone image
  - Atomic `addAnnotations([whiteout, image])` — both in one history entry
  - `pendingImage` set/clear
  - Save round-trip: 1-page PDF + 80×80 image annotation → reloads, page
    count preserved, output larger than base
  - **Dedup proof:** 5 image annotations with the same src embed once
    (output stays within 200 bytes of the single-image case)
- Full 8-script suite still passes — no regression to text/draw/save/etc.

### Known limits

- **Bitmap capture, not vector.** Edit-existing images become raster. A
  vector logo extracted this way is no longer infinitely scalable.
- **Capture resolution = display scale × DPR.** If you edit at 50% zoom on a
  1× DPR display, the captured image is half the original resolution.
  Workaround: zoom to 100%+ before clicking the hotspot.
- **Rotated images skipped.** The CTM walk only handles axis-aligned
  paint operations. Most photos and logos are axis-aligned.
- **Inline + mask images detected but capture quality may vary.** Image
  masks (often used for halftones) and inline images use the same CTM
  hotspot, but their visual representation on the rendered canvas is
  whatever pdfjs produces.
- **Insert size cap.** Inserted images default to ≤240 px wide so a
  6000×4000 photo doesn't drown the page; the user can drag corner
  handles up to whatever they want.

---

## v1 complete

Every step in the original plan is shipped, typechecked, and exercised by
a programmatic verification script. The full feature set:

- Drop a PDF (file picker, in-page drop zone, or drag onto an open doc)
- 8 tools: Select, Text, Pen, Highlighter, Line, Arrow, Rect, Ellipse
- Style panel adapts per tool (color, width, font/size, fill toggle)
- Drop-and-type text boxes; drag to move; corner handles to resize
- Pen / highlighter strokes (Catmull-Rom smoothed); highlighter uses
  `mix-blend-mode: multiply` in the editor and `BlendMode.Multiply` +
  `borderOpacity` in the saved PDF
- Line / arrow with endpoint handles; rect / ellipse with corner handles
- Selection bounding boxes for every annotation kind
- Undo / redo (snapshot-based, coalesced for typing and dragging)
- Per-tool keyboard shortcuts (V/T/P/H/L/A/R/O)
- Zoom: presets, +/-/0/F shortcuts, Fit-width, Ctrl+wheel
- Page thumbnails sidebar with lazy rendering
- Save as PDF: every annotation stamped onto a copy of the original via
  pdf-lib, downloaded as `<name> (edited).pdf`

### Known limits (deliberate, all documented above)

- Editing **existing** PDF text isn't supported (font extraction +
  run reconstruction). New text boxes work fully.
- Page rotation metadata isn't honored — annotations stamp against the
  un-rotated viewport.
- Saved PDF doesn't expose annotations as editable on reopen — they
  flatten to vector ink and text.
- No image insert, no whiteout, no page reorder/rotate/delete, no form
  fields, no OCR.

### How to run

```bash
cd ~/pdf-editor
npm run dev                # http://localhost:5173 by default
# verification
node --import tsx scripts/verify-save.mjs
# production build
npm run build && npm run preview
```

### File layout snapshot

```
~/pdf-editor/
├── BUILD.md
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
├── scripts/                                    ← Node-side verification
│   ├── verify-pdf-load.mjs
│   ├── verify-store.mjs
│   ├── verify-text-flow.mjs
│   ├── verify-drawing-flow.mjs
│   ├── verify-selection-flow.mjs
│   └── verify-save.mjs
└── src/
    ├── main.tsx · App.tsx · App.css · index.css
    ├── pdf/
    │   ├── worker.ts        (pdfjs worker config)
    │   ├── loader.ts        (ArrayBuffer → PDFDocumentProxy)
    │   └── save.ts          (stamp + download)
    ├── state/
    │   └── editorStore.ts   (zustand: annotations, undo/redo, tool, style)
    ├── types/
    │   └── annotation.ts    (discriminated union + Tool + ToolStyle)
    ├── lib/
    │   ├── svg-path.ts      (Catmull-Rom, arrowhead, rect normalize)
    │   ├── bounds.ts        (path / line / shape bounds)
    │   └── color.ts         (hex → pdf-lib rgb)
    ├── hooks/
    │   ├── useUndoShortcuts.ts
    │   ├── useToolShortcuts.ts
    │   ├── useSelectionShortcuts.ts
    │   └── useZoomShortcuts.ts
    └── components/
        ├── DropZone.tsx · Toolbar.tsx
        ├── ToolRail.tsx · StylePanel.tsx · icons.tsx
        ├── PdfViewer.tsx · PdfPage.tsx · PageThumbs.tsx
        ├── AnnotationLayer.tsx
        ├── TextBox.tsx
        ├── SvgAnnotation.tsx
        └── SelectionOverlay.tsx
```
