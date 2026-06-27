// Client-side DISPLAY estimate of the user's week points from live/final game
// outcomes. Rule #3's authoritative score is still SERVER-owned (season_user_totals
// via the scoring Edge Functions) — this is a running estimate for the UI only,
// and it converges to the settled total once every game is final (same math).
//
// Shared by the Home weekly-trend pills (WeeklyTrend) and the Picks-screen Week
// Score widget so both show the SAME running total as games finalize.

import type {DbSeasonPick, DbSeasonGame} from '@shared/types/database';
import type {GameScore} from '@sports/nfl/stores/nflStore';
import {isFinalStatus, isLiveStatus} from './gameStatus';

export interface LiveWeekEarned {
  earned: number | null;
  correctPicks: number | null;
  totalPicks: number | null;
}

/**
 * Sum the user's picks against game outcomes:
 *   • Game final + pick correct   → + (rank if hotpick, else +1)
 *   • Game final + pick incorrect → − rank if hotpick, else 0
 *   • Game live + currently winning → + (rank if hotpick, else +1)
 *   • Game live + currently losing  → − rank if hotpick, else 0
 *   • Game scheduled (not started)  → 0 (no contribution)
 *
 * `scores` is keyed by game_id (live scores from the store, or a map built from
 * the week's game rows). When there are no picks/games yet, falls back to the
 * server-settled `weekResult` so the value still renders.
 */
export function computeLiveWeekEarned(
  weekPicks: DbSeasonPick[],
  games: DbSeasonGame[],
  scores: Record<string, GameScore>,
  weekResult?: {weekPoints: number; correctPicks: number; totalPicks: number} | null,
): LiveWeekEarned {
  if (weekPicks.length === 0 || games.length === 0) {
    return {
      earned: weekResult?.weekPoints ?? null,
      correctPicks: weekResult?.correctPicks ?? null,
      totalPicks: weekResult?.totalPicks ?? null,
    };
  }
  const gameById = new Map(games.map(g => [g.game_id, g]));
  let total = 0;
  let correct = 0;
  let counted = 0; // picks with a known outcome (live winning/losing + final)
  for (const pick of weekPicks) {
    const game = gameById.get(pick.game_id);
    if (!game) continue;
    const rank = game.frozen_rank ?? game.rank ?? 1;
    const value = pick.is_hotpick ? rank : 1;
    const score = scores[pick.game_id];
    if (!score) continue;
    const pickedHome = pick.picked_team === game.home_team;
    const userScore = pickedHome ? score.homeScore : score.awayScore;
    const oppScore = pickedHome ? score.awayScore : score.homeScore;
    if (isFinalStatus(score.status)) {
      if (userScore === oppScore) {
        // Final DRAW → PUSH (Tie Handling spec): 0 swing, not counted. Mirrors the
        // server scorer, which skips a drawn game entirely. Never show −rank for a
        // draw — that was the mid-settlement flash this fixes.
        continue;
      }
      counted += 1;
      const isCorrect = userScore > oppScore;
      if (isCorrect) correct += 1;
      total += isCorrect ? value : pick.is_hotpick ? -rank : 0;
    } else if (isLiveStatus(score.status)) {
      if (userScore > oppScore) {
        correct += 1; // running win (mirrors "games won so far")
        counted += 1;
        total += value;
      } else if (userScore < oppScore) {
        counted += 1;
        if (pick.is_hotpick) total -= rank;
      }
    }
    // scheduled / pre-game contributes 0
  }
  return {
    earned: total,
    correctPicks: correct,
    totalPicks: counted || weekPicks.length,
  };
}
