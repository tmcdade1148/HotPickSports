/**
 * "th" / "st" / "nd" / "rd" suffix for a positive integer rank.
 *
 * Handles the English-language teen exception correctly for any
 * three-digit (or larger) input — e.g. 112th, 213th, 1011th. The
 * check is `n % 100 in [11, 13]`, not `n in [11, 13]`, which is what
 * a naive implementation breaks on.
 */
export function ordinalSuffix(n: number): string {
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (mod100 % 10) {
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
  // floor (not round) on each bucket — "Just now" should cover the
  // full first minute (0-59s), "1m ago" begins at exactly 60s, etc.
  // Rounding biases the early thresholds upward and makes the bands
  // surprising for users staring at a freshly-received message.
  const diffMin = Math.floor((now - then) / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Older than a week — show date
  return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

/** Full ordinal — "4th", "21st", "12th". */
export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}

/**
 * THE sign rule for every point value in the app.
 *
 * A positive number is BARE (16, 22, 1). Only a genuine negative carries its
 * minus (−16), and it's U+2212 MINUS SIGN, not a hyphen. Zero is "0".
 *
 * Why: a leading "+" makes a settled result read as a potential swing — as if
 * the number could still move. Nothing that has already happened should look
 * like an offer. Colour carries the state (green gain / neutral / red miss);
 * the sign is only there when the number is genuinely below zero.
 *
 * This was a HISTORY-local rule and is now global (2026-07-23): the GameChip's
 * FINAL box, the Picks screen's week score, Home's eyebrows and the Recap card
 * all format through here. Do not re-implement it at a call site.
 */
export function fmtPoints(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}
