/**
 * Single source of truth for NFL game-status string interpretation.
 *
 * `liveScores[id].status` and `season_games.status` use a few different
 * conventions across ESPN, our backend, and Supabase — these predicates
 * normalize before comparison so callers don't have to reproduce the
 * 4-variant `final` / 3-variant `live` checks at every render path.
 */

export function normalizeGameStatus(status: string | null | undefined): string {
  return (status ?? '').toLowerCase();
}

export function isFinalStatus(status: string | null | undefined): boolean {
  const s = normalizeGameStatus(status);
  return (
    s === 'final' ||
    s === 'status_final' ||
    s === 'completed' ||
    s === 'status_final_overtime'
  );
}

export function isLiveStatus(status: string | null | undefined): boolean {
  const s = normalizeGameStatus(status);
  return s === 'in_progress' || s === 'live' || s === 'in progress';
}

/** Game has either started or finished — i.e. its pick has locked. */
export function isLockedStatus(status: string | null | undefined): boolean {
  return isLiveStatus(status) || isFinalStatus(status);
}

/** Game hasn't started yet — empty/unknown counts as scheduled. */
export function isScheduledStatus(status: string | null | undefined): boolean {
  const s = normalizeGameStatus(status);
  return s === '' || s === 'scheduled' || s === 'status_scheduled';
}
