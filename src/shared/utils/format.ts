/** "th" / "st" / "nd" / "rd" suffix for a positive integer rank. */
export function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1:  return 'st';
    case 2:  return 'nd';
    case 3:  return 'rd';
    default: return 'th';
  }
}

/**
 * Format an 8-character Roster Pass as `XXXX-XXXX` for display.
 * Tolerates input that's already formatted, lowercase, etc. — strips
 * non-alphanumeric and uppercases first. Returns '' for invalid input
 * so callers can render a placeholder.
 *
 * Storage is always the compact 8-char form; the dash is purely visual.
 */
export function formatRosterPass(raw: string | null | undefined): string {
  if (!raw) return '';
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length !== 8) return '';
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/**
 * Strip a Roster Pass back to its compact 8-char storage form. Used
 * when sending user input to the resolver RPC.
 */
export function normalizeRosterPass(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Full ordinal — "4th", "21st", "12th". */
export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}
