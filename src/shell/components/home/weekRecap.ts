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

/**
 * Brand-voice recap line for a settled week. Scales from "big week"
 * to "brutal" based on net points, HotPick outcome, and pick hit-rate.
 *
 * NOTE: this builder still receives RAW counts from its three existing callers
 * (PicksOpenHero, CompleteHero, SettlingHero) and therefore still prints the
 * raw "n of 16" form. Flipping those onto derivePickDisplay() is a deliberate
 * follow-up with its own three-state device check — see the slice-6a report.
 */
export function buildWeekRecap(wr: {
  weekPoints: number;
  correctPicks: number;
  totalPicks: number;
  hotPickCorrect: boolean | null;
}): string {
  const {weekPoints: pts, correctPicks: hit, totalPicks: total, hotPickCorrect: hp} = wr;
  const hitRate = total > 0 ? hit / total : 0;
  const games = `${hit} of ${total}`;

  // HotPick was designated — lead with its outcome, weave in the record, end warm.
  if (hp === true) {
    if (pts >= 20 && hitRate >= 0.75) return `Your HotPick hit and you took ${games} games — a monster +${pts} week. Keep cooking.`;
    if (pts >= 10) return `Your HotPick landed and ${games} games came in. +${pts} — strong week.`;
    if (pts > 0) return `Your HotPick came through, even if ${games} made it a grind. +${pts} still counts.`;
    return `Your HotPick hit, but ${games} games pulled you to ${pts}. Reload and go again next week.`;
  }
  if (hp === false) {
    if (pts <= -10) return `Your HotPick missed and just ${games} games came in — the board got you for ${pts}. Clean slate next week.`;
    if (pts < 0) return `Your HotPick missed, and winning only ${games} makes for a rough week (${pts}). Next week will be better.`;
    return `Your HotPick missed, but ${games} games salvaged +${pts}. We'll take it.`;
  }

  // No HotPick this week — recap on the record + points alone.
  if (pts >= 15) return `Clean week — ${games} games for +${pts}.`;
  if (pts > 0) return `Decent week — ${games} games for +${pts}.`;
  if (pts === 0) return `Flat week at ${games}. Reset — next one's wide open.`;
  return `Rough one — ${games} games, ${pts} on the week. Shake it off.`;
}
