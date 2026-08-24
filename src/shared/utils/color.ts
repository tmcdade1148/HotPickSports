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
 * Flatten a translucent color over an opaque one into the hex a viewer
 * actually sees. Needed because contrast math takes two opaque colors, but
 * several surfaces here are a brand tint laid over the page — asking "is this
 * text readable" against the PAGE when it is rendered on the TINT is how the
 * clubhouse ended up lifting colors for a background nothing sat on.
 */
export function compositeOver(
  fg: string | null | undefined,
  bg: string,
  alpha: number,
): string {
  if (!fg) return bg;
  const f = fg.replace('#', '');
  const b = bg.replace('#', '');
  if (f.length !== 6 || b.length !== 6) return bg;
  const mix = (i: number) => {
    const fv = parseInt(f.substring(i, i + 2), 16);
    const bv = parseInt(b.substring(i, i + 2), 16);
    return Math.round(fv * alpha + bv * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/** sRGB hex → HSL. Returns null for a malformed hex. */
function hexToHsl(hex: string): {h: number; s: number; l: number} | null {
  const c = hex.replace('#', '');
  if (c.length !== 6) return null;
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return {h: 0, s: 0, l};
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return {h, s, l};
}

/** HSL → sRGB hex. */
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The Club's own color, nudged only as far as it must be to stay readable on
 * the given background.
 *
 * A partner-supplied brand color is applied raw as text and icon color across
 * the roster page. That works in light mode and fails in dark: The Natural's
 * #b73138 is a dark red, and dark red on a dark background is unreadable — the
 * information is there and nobody can see it.
 *
 * This keeps the HUE and saturation and moves only lightness, in small steps,
 * away from the background until WCAG contrast clears `minRatio` (4.5:1, the
 * AA bar for body text). A brand that is already legible comes back untouched,
 * so light mode is unaffected. If even pure white/black cannot clear the bar
 * the closest attempt is returned rather than nothing.
 *
 * Hard Rule #9 is intact: the input is the pool/partner brand_config and the
 * background comes from useTheme(). No color literal is introduced.
 */
export function readableOn(
  brandHex: string | null | undefined,
  backgroundHex: string,
  minRatio = 4.5,
): string {
  if (!brandHex) return backgroundHex;
  if (wcagContrast(brandHex, backgroundHex) >= minRatio) return brandHex;
  const hsl = hexToHsl(brandHex);
  const bgL = relativeLuminance(backgroundHex);
  if (!hsl || bgL === null) return brandHex;

  // Move away from the background: lighten on dark, darken on light.
  const towardLighter = bgL < 0.5;
  const STEP = 0.04;
  let best = brandHex;
  let bestRatio = wcagContrast(brandHex, backgroundHex);
  for (let i = 1; i <= 25; i++) {
    const l = towardLighter
      ? Math.min(1, hsl.l + i * STEP)
      : Math.max(0, hsl.l - i * STEP);
    const candidate = hslToHex(hsl.h, hsl.s, l);
    const ratio = wcagContrast(candidate, backgroundHex);
    if (ratio >= minRatio) return candidate;
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (l === 0 || l === 1) break;
  }
  return best;
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
