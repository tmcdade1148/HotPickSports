/**
 * Brand-voice recap line for a settled week. Scales from "big week"
 * to "brutal" based on net points, HotPick outcome, and pick hit-rate.
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
