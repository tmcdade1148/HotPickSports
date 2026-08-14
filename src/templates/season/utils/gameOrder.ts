// src/templates/season/utils/gameOrder.ts
//
// The SINGLE client-side source of the order a slate reads in.
//
// Two surfaces render a week's games and they MUST agree: the Picks screen's
// started waves (SeasonPicksScreen) and another Player's slate in the
// head-to-head accordion (PlayerSlateAccordion). The accordion's old comment
// literally said its rank sort was "matching the Picks screen" — which is the
// coupling that silently breaks the first time one side changes, and turns the
// comment into a lie. Same reason weekLock.ts exists next door.
//
// CHRONOLOGICAL, not by rank. Rank is a PRIVATE ordering: it answers "which of
// my picks is worth the most", a question about one Player's own slate. It
// cannot be scanned against someone else's, which is the entire job of the
// head-to-head view. It also reads as broken — a Thursday wave sorted by rank
// (1, 8, 9, 11, 12, 14) shows 7:00, 9:00, 7:30, 8:00, 8:00, 7:00.
//
// NO HotPick pin. Both surfaces already mark the HotPick on its own row (the
// flame), so hoisting it would reorder the slate to say something the row
// already says — and in the accordion it would break the head-to-head alignment
// outright, since the two Players' HotPicks are different games.
//
// game_id breaks ties. Two games can kick at the same second (preseason Wk1 had
// two 8:00 games). Array.sort is stable in Hermes, so equal kickoffs would
// otherwise hold whatever order the last fetch happened to return — which is
// not a guarantee anyone has written down. An explicit tiebreaker makes the
// order a property of the data rather than of the fetch.

import type {DbSeasonGame} from '@shared/types/database';

/** Kickoff epoch ms, or Infinity when absent/unparseable so such a game sorts
 *  LAST deterministically. Returning NaN here would make every comparison
 *  involving it meaningless and the resulting order engine-defined. */
function kickoffMs(g: DbSeasonGame): number {
  const ms = g.kickoff_at ? new Date(g.kickoff_at).getTime() : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
}

/** Kickoff ascending, game_id ascending as the stable tiebreaker. */
export function byKickoff(a: DbSeasonGame, b: DbSeasonGame): number {
  const at = kickoffMs(a);
  const bt = kickoffMs(b);
  if (at !== bt) return at - bt;
  return a.game_id.localeCompare(b.game_id);
}

/** Non-mutating chronological sort. Callers pass arrays they do not own (store
 *  slices, memo inputs), so this always copies rather than sorting in place. */
export function sortByKickoff(games: DbSeasonGame[]): DbSeasonGame[] {
  return [...games].sort(byKickoff);
}
