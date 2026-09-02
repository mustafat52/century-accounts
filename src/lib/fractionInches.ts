// Glass sizes are spoken and measured in whole-number + eighths fractions
// (e.g. 21⅝ × 76¾). We store decimal inches in the DB (numeric(8,3)) but the
// input UI must accept fraction notation, per spec section 2.

const EIGHTHS_GLYPHS: Record<number, string> = {
  0: '',
  1: '⅛',
  2: '¼',
  3: '⅜',
  4: '½',
  5: '⅝',
  6: '¾',
  7: '⅞',
};

const GLYPH_TO_EIGHTHS: Record<string, number> = {
  '1/8': 1,
  '⅛': 1,
  '1/4': 2,
  '¼': 2,
  '3/8': 3,
  '⅜': 3,
  '1/2': 4,
  '½': 4,
  '5/8': 5,
  '⅝': 5,
  '3/4': 6,
  '¾': 6,
  '7/8': 7,
  '⅞': 7,
};

/**
 * Parses a fraction-inch string like `21 5/8`, `21⅝`, `21-5/8`, or a plain
 * `21.625` / `21` into decimal inches. Returns null if unparseable.
 */
export function parseFractionInches(raw: string): number | null {
  const input = raw.trim();
  if (!input) return null;

  // Plain decimal (e.g. "21.625" or "21")
  if (/^\d+(\.\d+)?$/.test(input)) {
    return Math.round(parseFloat(input) * 1000) / 1000;
  }

  // Whole number followed by a fraction glyph or "n/8" style fraction,
  // with an optional space or hyphen between them: "21 5/8", "21-⅝", "21⅝"
  const match = input.match(
    /^(\d+)?\s*[-\s]?\s*(1\/8|⅛|1\/4|¼|3\/8|⅜|1\/2|½|5\/8|⅝|3\/4|¾|7\/8|⅞)$/
  );
  if (match) {
    const whole = match[1] ? parseInt(match[1], 10) : 0;
    const eighths = GLYPH_TO_EIGHTHS[match[2]] ?? 0;
    return Math.round((whole + eighths / 8) * 1000) / 1000;
  }

  return null;
}

/** Formats decimal inches back into the shop's fraction notation, e.g. 21.625 -> "21⅝". */
export function formatFractionInches(decimal: number): string {
  const whole = Math.floor(decimal);
  const remainder = decimal - whole;
  // Round to nearest eighth
  let eighths = Math.round(remainder * 8);
  let displayWhole = whole;
  if (eighths === 8) {
    eighths = 0;
    displayWhole += 1;
  }
  const glyph = EIGHTHS_GLYPHS[eighths];
  if (!glyph) return `${displayWhole}"`;
  return displayWhole === 0 ? `${glyph}"` : `${displayWhole}${glyph}"`;
}

/** Formats a length x width pair using fraction notation, e.g. `21⅝ × 76¾`. */
export function formatSize(lengthIn: number, widthIn: number): string {
  return `${formatFractionInches(lengthIn)} × ${formatFractionInches(widthIn)}`;
}
