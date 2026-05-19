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
