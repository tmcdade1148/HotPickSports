/**
 * Shared week-display helpers for Home.
 *
 * These used to live inside HistoryModule.tsx. That file is now TWO components
 * (RecapModule + HistoryModule) and the eyebrow is a third consumer, so the
 * helpers moved here rather than being copied into each — one spelling of "no
 * plus signs", one spelling of "WEEK 7" / "WC".
 */

/**
 * Phases where Home's week modules do not exist at all — there is no season
 * to describe. The WEEK eyebrow, the Recap and the HISTORY chart all check it.
 */
export const HIDDEN_PHASES = ['OFF_SEASON', 'PRE_SEASON'];

/**
 * Phases whose weeks are the PLAYOFF set. The data layer already scopes
 * season_user_totals by phase, so "playoffs start fresh" needs no extra
 * filtering here — the rows simply change underneath. Mirrored in
 * homeRecapSlice's readSeasonScope.
 */
export const PLAYOFF_PHASES = [
  'PLAYOFFS',
  'SUPERBOWL_INTRO',
  'SUPERBOWL',
  'SEASON_COMPLETE',
];

/** One scored week, as `globalStore.recentWeeks` carries it. */
export type WeekRow = {
  week: number;
  total: number;
  correctPicks: number;
  totalPicks: number;
  isHotPickCorrect: boolean | null;
  hotPickRank: number | null;
};

/** Playoff rounds read as rounds, not week numbers. */
const ROUND_LABEL: Record<number, string> = {19: 'WC', 20: 'DIV', 21: 'CONF', 22: 'SB'};

/** Bar label — "W7" in the regular season, "WC"/"DIV"/"CONF"/"SB" in playoffs. */
export function weekLabel(week: number, isPlayoffs: boolean): string {
  if (isPlayoffs) return ROUND_LABEL[week] ?? `W${week}`;
  return `W${week}`;
}

/** Eyebrow label — the same idea with room to spell it out: "WEEK 7" / "WC". */
export function sectionWeekLabel(week: number, isPlayoffs: boolean): string {
  if (isPlayoffs) return ROUND_LABEL[week] ?? `WEEK ${week}`;
  return `WEEK ${week}`;
}

/** No plus signs, ever. A real negative keeps its minus (U+2212). */
export function fmtPoints(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/**
 * Convert the RAW server counts into the numbers the map says to display.
 *
 * `season_user_totals.total_picks` is the full slate (16) and `correct_picks`
 * INCLUDES the HotPick game when it hit. Verified against live nfl_2025 rows:
 * correct 13 / total 16 / rank 16 / hotpick hit → week_points 28, i.e.
 * `16 + (13 − 1)`. So the raw pair renders "13 of 16".
 *
 * The map forbids that: "The HotPick earns its rank INSTEAD of a base point.
 * A 20-point week is 14 + 6 and reads '6 of 15 Picks' — never '7 of 16,' or
 * the arithmetic on screen stops adding up."
 *
 * So the HotPick is removed from BOTH sides: from the denominator always (it
 * isn't one of the base Picks), and from the numerator only when it hit (a
 * missed HotPick was never in `correct_picks` to begin with). Short weeks fall
 * out for free — a 14-game week reads "n of 13".
 *
 * The DB is correct and untouched; this is a display derivation only.
 */
export function derivePickDisplay(raw: {
  correctPicks: number;
  totalPicks: number;
  isHotPickCorrect: boolean | null;
}): {correct: number; total: number} {
  const {correctPicks, totalPicks, isHotPickCorrect} = raw;
  // No slate yet (an unplayed week) — nothing to derive, and subtracting would
  // produce -1.
  if (totalPicks <= 0) return {correct: 0, total: 0};
  return {
    correct: Math.max(0, correctPicks - (isHotPickCorrect === true ? 1 : 0)),
    total: Math.max(0, totalPicks - 1),
  };
}
