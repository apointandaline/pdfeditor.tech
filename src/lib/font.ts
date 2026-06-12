import type { FontFamily } from '../types/annotation';

export interface DetectedFontStyle {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}

// Heuristic from pdfjs's reported family name and the raw font name. PDFs
// often encode style in the font name itself ("Times-Bold", "Helvetica-Oblique",
// "Arial-BoldItalic"), so we scan both strings.
//
// Returns one of the two PDF standard families plus bold/italic flags so the
// save step can pick the matching variant (HelveticaBold, TimesRomanItalic, etc).
export function pickFontStyle(
  cssFamily: string | undefined,
  fontName: string | undefined,
): DetectedFontStyle {
  const combined = `${cssFamily ?? ''} ${fontName ?? ''}`.toLowerCase();

  // Substring checks — PDF font names commonly concatenate ("Times-BoldItalic"),
  // so word-boundary regexes miss the second style. False positives are
  // unlikely against real font names.
  const bold = combined.includes('bold')
    || combined.includes('black')
    || combined.includes('heavy')
    || combined.includes('extrabold')
    || combined.includes('semibold');

  const italic = combined.includes('italic')
    || combined.includes('oblique');

  // "sans-serif" / "sansserif" / "sans serif" → sans. Explicit "serif"
  // (without preceding "sans") or known serif families → serif.
  const sansHint = /sans[\s-]?serif|sansserif|\bsans\b/.test(combined);
  const serifFamilies = /\b(serif|times|garamond|georgia|book|cambria|baskerville)\b/.test(combined);
  const isSerif = !sansHint && serifFamilies;

  return {
    family: isSerif ? 'Times' : 'Helvetica',
    bold,
    italic,
  };
}

// Back-compat shim — older callers expect just the family.
export function pickFont(family: string | undefined): FontFamily {
  return pickFontStyle(family, undefined).family;
}
