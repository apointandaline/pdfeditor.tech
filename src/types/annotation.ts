// All annotation geometry is stored in CSS pixels at scale 1.0 (i.e. the
// page's natural pdfjs viewport size). The viewer multiplies by the current
// zoom for display, and step 7 (save) maps these into PDF points with origin
// translated from top-left to bottom-left. Keeping the canonical form at
// scale 1.0 means we never have to rewrite geometry when the user zooms.

export interface BaseAnnotation {
  id: string;
  page: number;
}

export type FontFamily = 'Helvetica' | 'Times';

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  color: string;
  // Format flags detected from the source PDF (when this annotation was
  // created via the Edit Existing tool) — also editable manually later.
  bold?: boolean;
  italic?: boolean;
  // Set ONLY when this annotation was created by clicking an existing-text
  // hotspot. Lets TextBox detect "user clicked but didn't actually edit" and
  // revert the click (remove whiteout + replacement) so the original PDF
  // text shows through unchanged.
  origin?: {
    text: string;             // the exact original text we pre-filled
    linkedWhiteoutId: string; // the companion whiteout shape's id
  };
}

export type DrawingVariant = 'pen' | 'highlighter';

export interface PathAnnotation extends BaseAnnotation {
  kind: 'path';
  variant: DrawingVariant;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  opacity: number;
}

export interface LineAnnotation extends BaseAnnotation {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  arrow: boolean;
}

export type ShapeKind = 'rect' | 'ellipse';

export interface ShapeAnnotation extends BaseAnnotation {
  kind: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  fill: string | null;
  width: number;
}

export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  // PNG/JPEG data URL. Same image content shared across multiple annotations
  // is deduped at save time via the data URL string.
  src: string;
}

export type Annotation =
  | TextAnnotation
  | PathAnnotation
  | LineAnnotation
  | ShapeAnnotation
  | ImageAnnotation;

export type Tool =
  | 'select'
  | 'text'
  | 'edit-existing'  // hover existing PDF text or image → click to whiteout + replace
  | 'image'          // upload + place a new image
  | 'pen'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse';

export interface ToolStyle {
  color: string;              // hex, applies to stroke/text
  strokeWidth: number;        // px
  fontSize: number;           // pt
  fontFamily: FontFamily;
  highlighterOpacity: number; // 0..1
  fill: string | null;        // shape fill, null = outline only
}

export const DEFAULT_STYLE: ToolStyle = {
  color: '#1a1a1a',
  strokeWidth: 2,
  fontSize: 14,
  fontFamily: 'Helvetica',
  highlighterOpacity: 0.35,
  fill: null,
};
