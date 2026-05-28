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

/**
 * Human-friendly relative time: "Just now", "5m ago", "2h ago",
 * "3d ago". Falls back to a short Mmm D date once the input is more
 * than a week old. Used by MessageCenter and the admin moderation
 * queue so timestamp copy stays consistent across surfaces.
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.round((now - then) / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.round(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Older than a week — show date
  return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

/** Full ordinal — "4th", "21st", "12th". */
export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}
