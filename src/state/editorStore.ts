import { create } from 'zustand';
import type { Annotation, Tool, ToolStyle } from '../types/annotation';
import { DEFAULT_STYLE } from '../types/annotation';

interface Snapshot {
  annotations: Record<number, Annotation[]>;
  selectedId: string | null;
}

export interface EditorState extends Snapshot {
  tool: Tool;
  style: ToolStyle;
  past: Snapshot[];
  future: Snapshot[];

  // Transient signal for "this annotation was just created, focus it on
  // mount". Distinct from selectedId so a regular click-to-select doesn't
  // also trigger an edit-mode entry. Cleared by the TextBox once consumed.
  pendingFocusId: string | null;

  // Image staged for the Insert Image or Signature tool. Set when the user
  // picks a file (or generates a cursive signature); consumed on the next
  // page click that places it. `kind` distinguishes the two so the StylePanel
  // can show the right hint and the click handler can route per-tool.
  pendingImage: {
    src: string;
    w: number;
    h: number;
    name?: string;
    kind?: 'image' | 'signature';
  } | null;

  // Tool / style
  setTool: (t: Tool) => void;
  setStyle: (patch: Partial<ToolStyle>) => void;
  select: (id: string | null) => void;
  clearPendingFocus: () => void;
  setPendingImage: (p: EditorState['pendingImage']) => void;

  // Mutations that push a history entry
  addAnnotation: (a: Annotation) => void;
  addAnnotations: (list: Annotation[]) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;

  // Mutation WITHOUT a history entry — for in-progress edits (drag, typing)
  // Pair with commit() at edit boundary (mouseup, blur, Enter).
  patchAnnotation: (id: string, patch: Partial<Annotation>) => void;
  commit: () => void;

  undo: () => void;
  redo: () => void;

  // Reset annotations (e.g. when opening a different PDF). Clears history.
  resetAnnotations: () => void;
}

const HISTORY_LIMIT = 100;
const EMPTY: Snapshot = { annotations: {}, selectedId: null };

function snapshot(s: Snapshot): Snapshot {
  // structuredClone keeps nested arrays/objects (points lists, etc.) independent.
  return {
    annotations: structuredClone(s.annotations),
    selectedId: s.selectedId,
  };
}

function pushPast(past: Snapshot[], s: Snapshot): Snapshot[] {
  const next = [...past, snapshot(s)];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

// Reuses page-array references for unchanged pages. This is what lets a single
// AnnotationLayer subscribe to its own page's list and NOT re-render when an
// annotation on a different page is dragged/typed.
function mapAnnotations(
  annotations: Record<number, Annotation[]>,
  fn: (a: Annotation) => Annotation | null,
): Record<number, Annotation[]> {
  let anyChanged = false;
  const out: Record<number, Annotation[]> = {};
  for (const [k, list] of Object.entries(annotations)) {
    let pageChanged = false;
    const next: Annotation[] = [];
    for (const a of list) {
      const r = fn(a);
      if (r !== a) pageChanged = true;
      if (r) next.push(r);
    }
    if (pageChanged) {
      out[Number(k)] = next;
      anyChanged = true;
    } else {
      out[Number(k)] = list;
    }
  }
  return anyChanged ? out : annotations;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...EMPTY,
  tool: 'select',
  style: DEFAULT_STYLE,
  past: [],
  future: [],
  pendingFocusId: null,
  pendingImage: null,

  setTool: (tool) => set({
    tool,
    selectedId: tool === 'select' ? get().selectedId : null,
  }),
  setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
  select: (selectedId) => set({ selectedId }),
  clearPendingFocus: () => set({ pendingFocusId: null }),
  setPendingImage: (pendingImage) => set({ pendingImage }),

  addAnnotation: (a) =>
    set((s) => {
      const list = s.annotations[a.page] ?? [];
      return {
        annotations: { ...s.annotations, [a.page]: [...list, a] },
        selectedId: a.id,
        pendingFocusId: a.kind === 'text' ? a.id : null,
        past: pushPast(s.past, s),
        future: [],
      };
    }),

  addAnnotations: (list) =>
    set((s) => {
      if (list.length === 0) return {};
      const annotations: Record<number, Annotation[]> = { ...s.annotations };
      for (const a of list) {
        annotations[a.page] = [...(annotations[a.page] ?? []), a];
      }
      const lastTextId = [...list].reverse().find((a) => a.kind === 'text')?.id ?? null;
      return {
        annotations,
        selectedId: list[list.length - 1].id,
        pendingFocusId: lastTextId,
        past: pushPast(s.past, s),
        future: [],
      };
    }),

  removeAnnotation: (id) =>
    set((s) => ({
      annotations: mapAnnotations(s.annotations, (a) => (a.id === id ? null : a)),
      selectedId: s.selectedId === id ? null : s.selectedId,
      past: pushPast(s.past, s),
      future: [],
    })),

  updateAnnotation: (id, patch) =>
    set((s) => ({
      annotations: mapAnnotations(s.annotations, (a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
      past: pushPast(s.past, s),
      future: [],
    })),

  patchAnnotation: (id, patch) =>
    set((s) => ({
      annotations: mapAnnotations(s.annotations, (a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
    })),

  commit: () =>
    set((s) => ({
      past: pushPast(s.past, s),
      future: [],
    })),

  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const prev = s.past[s.past.length - 1];
    set({
      annotations: prev.annotations,
      selectedId: prev.selectedId,
      past: s.past.slice(0, -1),
      future: [snapshot(s), ...s.future].slice(0, HISTORY_LIMIT),
    });
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    set({
      annotations: next.annotations,
      selectedId: next.selectedId,
      past: pushPast(s.past, s),
      future: s.future.slice(1),
    });
  },

  resetAnnotations: () =>
    set({
      annotations: {},
      selectedId: null,
      pendingFocusId: null,
      pendingImage: null,
      past: [],
      future: [],
    }),
}));

// Selectors (use with useEditorStore to get fine-grained subscriptions)
export const selectCanUndo = (s: EditorState) => s.past.length > 0;
export const selectCanRedo = (s: EditorState) => s.future.length > 0;

// Stable empty list — without it, every empty page returns a fresh [] which
// would trip zustand's identity check and cause spurious re-renders.
const EMPTY_PAGE: Annotation[] = [];
export const selectPageAnnotations = (page: number) => (s: EditorState) =>
  s.annotations[page] ?? EMPTY_PAGE;

// Convenience helper for tools that need to create an id.
// crypto.randomUUID() is only defined in secure contexts (https / localhost).
// The site is reachable over plain http, where calling it throws and every
// tool click silently fails. Fall back to a getRandomValues-based UUID v4,
// which works in any context.
export function newAnnotationId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
