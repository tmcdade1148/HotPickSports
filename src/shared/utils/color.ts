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
