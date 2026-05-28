/**
 * Convert a 6-digit hex string to an `rgba()` string with the given alpha.
 * Falls back to the input if it isn't a 6-digit hex (e.g. already rgba,
 * a named color, or an unknown format).
 */
export function hexToRgba(hex: string | null | undefined, alpha: number): string {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns either black or white (whichever yields better contrast) for use
 * as foreground text on the given background hex. Used when painting a
 * partner-supplied primary_color as a background — `colors.onPrimary` from
 * the theme assumes HotPick's orange, which won't necessarily contrast
 * against an arbitrary partner color.
 *
 * Uses Rec. 709 perceptual luminance; 0.5 threshold matches the WCAG
 * light/dark cut.
 */
export function readableTextOn(hex: string | null | undefined): '#000000' | '#FFFFFF' {
  if (!hex) return '#FFFFFF';
  const c = hex.replace('#', '');
  if (c.length !== 6) return '#FFFFFF';
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/** WCAG 2.x relative luminance (sRGB hex → [0,1]). */
function relativeLuminance(hex: string): number | null {
  const c = hex.replace('#', '');
  if (c.length !== 6) return null;
  const channel = (n: number) => {
    const v = n / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(c.substring(0, 2), 16));
  const g = channel(parseInt(c.substring(2, 4), 16));
  const b = channel(parseInt(c.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two hex colors. Range 1 (no contrast)
 * to 21 (black on white). Returns 1 if either color is malformed.
 */
export function wcagContrast(fg: string | null | undefined, bg: string | null | undefined): number {
  if (!fg || !bg) return 1;
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  if (lFg === null || lBg === null) return 1;
  const [hi, lo] = lFg > lBg ? [lFg, lBg] : [lBg, lFg];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick the Club color from a prioritized candidate list with enough
 * contrast against the current surface. Used to keep Club-color
 * accents (logo rings, Club name text) legible in both light and dark
 * mode without forcing the Club out of its brand palette.
 *
 * Pass colors in priority order — typically:
 *   [primary, highlight, secondary, background]
 *
 * Returns the first candidate clearing `minRatio` (WCAG 3:1 for UI
 * components by default — text-on-bg is fine at 3:1 when bolded ≥14pt,
 * which our affiliation row meets). If no candidate clears the bar,
 * returns the highest-contrast candidate. Returns null only if the
 * list is fully empty/malformed.
 */
export function pickReadableBrandColor(
  candidates: Array<string | null | undefined>,
  surfaceBg: string,
  minRatio = 3,
): string | null {
  const usable = candidates.filter((c): c is string => typeof c === 'string' && c.length > 0);
  if (usable.length === 0) return null;
  let best = usable[0];
  let bestRatio = wcagContrast(best, surfaceBg);
  for (const c of usable) {
    const r = wcagContrast(c, surfaceBg);
    if (r >= minRatio) return c;
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}
