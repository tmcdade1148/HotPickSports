/**
 * THE week score — one implementation, two callers.
 *
 * The Picks screen's "WEEK SCORE" and Home's WEEK eyebrow must read the same
 * number at every point of the weekend. They used to be two derivations waiting
 * to disagree (the same shape of drift the four green tokens had), so the whole
 * rule lives here and both screens call it with their own inputs.
 *
 * The number is always the SERVER's. `season_picks.points` is null until the
 * scoring function settles that pick, then 0 / 1 / ±rank — so summing the
 * non-null points IS the settled week score, and it grows as games finalise.
 * Deliberately NOT a client-side projection: no score comparison, no signing an
 * in-progress value (same rule the GameChip follows — settled results may sign
 * and colour, live ones may not).
 *
 * `null` means "nothing has settled yet" and must render as a grey en-dash,
 * never as a zero — a green 0 reads as a scored week that went nowhere.
 */

import {isFinalStatus, isLiveStatus} from '@sports/nfl/utils/gameStatus';

/**
 * Has this game actually STARTED? Based purely on game STATUS (live or final),
 * which is the reliable cross-environment signal — ESPN sets it at kickoff in
 * production, and the simulator sets it when a wave kicks off. Deliberately NOT
 * based on kickoff_at (the simulator runs on real 2025 schedule timestamps that
 * are already in the past) nor lock_at (a game can be locked without having
 * started).
 */
export function hasStarted(game: {status?: string | null}): boolean {
  return isLiveStatus(game.status) || isFinalStatus(game.status);
}

export interface WeekScoreInputs {
  /** The viewed week's picks (`season_picks` rows). */
  picks: ReadonlyArray<{points: number | null}>;
  /** The viewed week's games — only their status is read. */
  games: ReadonlyArray<{status?: string | null}>;
  /** True when the picks/games above describe the competition's LIVE week. */
  isLiveWeek: boolean;
  /** `season_user_totals.week_points` for the viewed week. null = no row yet. */
  serverWeekPoints: number | null;
}

/** Sum of the settled per-pick points; null when nothing has settled. */
export function settledPickPoints(
  picks: ReadonlyArray<{points: number | null}>,
): number | null {
  const scored = picks.filter(p => p.points != null);
  return scored.length ? scored.reduce((sum, p) => sum + (p.points ?? 0), 0) : null;
}

/**
 * The week score to display, or null for "nothing settled" (grey en-dash).
 *
 * Live week with at least one game underway → the settled per-pick points, so
 * the number climbs game by game. Otherwise the server's week row, which reads
 * null before kickoff and for a past week with no score yet.
 */
export function resolveWeekScore({
  picks,
  games,
  isLiveWeek,
  serverWeekPoints,
}: WeekScoreInputs): number | null {
  const anyGameStarted = games.some(hasStarted);
  return isLiveWeek && anyGameStarted
    ? settledPickPoints(picks)
    : serverWeekPoints;
}
