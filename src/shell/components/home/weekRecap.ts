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
  if (hp === true && pts >= 20 && hitRate >= 0.75) {
    return `Big week. HotPick hit, ${hit} of ${total} games. Keep cooking.`;
  }
  if (hp === true && pts >= 10) {
    return `HotPick hit. Solid +${pts} on the week.`;
  }
  if (hp === true && pts > 0) {
    return `HotPick hit but the rest was a slog. +${pts} is +${pts}.`;
  }
  if (hp === false && pts <= -10) {
    return `Brutal. HotPick missed and the board got you for ${pts}.`;
  }
  if (hp === false && pts < 0) {
    return `Took the L on the HotPick. ${pts} on the week. Shake it off.`;
  }
  if (hp === false && pts >= 0) {
    return `HotPick missed but you salvaged +${pts}. We'll take it.`;
  }
  if (pts >= 15) return `Clean week. +${pts}.`;
  if (pts > 0)   return `Decent week. +${pts}.`;
  if (pts === 0) return `Flat week. Reset, next one's wide open.`;
  return `Rough one. ${pts} on the week. Shake it off.`;
}
