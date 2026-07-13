// src/templates/season/utils/weekLock.ts
//
// The SINGLE client-side source of the whole-week lock, matching the server's
// enforce_pick_lock (slice 1): a week is read-only once now >= MIN(kickoff_at)
// across the week's games. Card lock, submit-footer lock, and Picks-screen
// section grouping all read this — so the three lock computations that used to
// drift (the bug this slice fixes) can't drift again.
//
// Mirrors get_week_lock_time = MIN(kickoff_at). Never a per-game lock_at, never
// a hardcoded time-of-day: Thanksgiving-Eve (Wed) then locks Wednesday, and the
// Super Bowl's extra-week gap is irrelevant — it reads whatever MIN actually is.

import type {DbSeasonGame} from '@shared/types/database';

/** MIN(kickoff_at) (epoch ms) across games with a non-null kickoff, or null when
 *  there are no games / no kickoffs yet. */
export function weekLockAtFromGames(games: DbSeasonGame[]): number | null {
  let min: number | null = null;
  for (const g of games) {
    if (!g.kickoff_at) continue;
    const t = new Date(g.kickoff_at).getTime();
    if (min === null || t < min) min = t;
  }
  return min;
}

/** True once the week's first kickoff has passed. The empty/loading case reads
 *  as NOT locked by construction (weekLockAt === null → false), which is the
 *  required guard: MIN over an empty or still-loading set must never lock. */
export function isWeekLocked(games: DbSeasonGame[]): boolean {
  const lockAt = weekLockAtFromGames(games);
  return lockAt !== null && Date.now() >= lockAt;
}
