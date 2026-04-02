import type {DbSeasonPick, DbSeasonGame} from '@shared/types/database';
import type {GameScore} from '@sports/nfl/stores/nflStore';

// ---------------------------------------------------------------------------
// Types — discriminated union for HotPick point impact
// ---------------------------------------------------------------------------

interface HotPickWinning {
  status: 'winning';
  points: number;
}

interface HotPickLosing {
  status: 'losing';
  points: number;
}

interface HotPickTied {
  status: 'tied';
  points: number;
}

interface HotPickFinal {
  status: 'final';
  points: number;
  isCorrect: boolean;
}

interface HotPickUnavailable {
  status: 'unavailable';
}

export type HotPickImpact =
  | HotPickWinning
  | HotPickLosing
  | HotPickTied
  | HotPickFinal
  | HotPickUnavailable;

// ---------------------------------------------------------------------------
// Pure function — zero side effects, zero Supabase calls
// ---------------------------------------------------------------------------

/**
 * Compute the live HotPick point impact for the user's designated game.
 *
 * Returns a discriminated union with the current impact status and
 * signed point value based on frozen_rank and the live score.
 *
 * @param pick    The user's HotPick season pick
 * @param game    The season game with frozen_rank and team identifiers
 * @param score   The live score for this game (undefined if not yet available)
 */
export function getHotPickImpact(
  pick: DbSeasonPick,
  game: DbSeasonGame,
  score: GameScore | undefined,
): HotPickImpact {
  // Guard: no frozen_rank or no live score → unavailable
  if (!game.frozen_rank || !score) {
    return {status: 'unavailable'};
  }

  const rank = game.frozen_rank;

  // Determine which side the user picked
  const userPickedHome = pick.picked_team === game.home_team;
  const userScore = userPickedHome ? score.homeScore : score.awayScore;
  const opponentScore = userPickedHome ? score.awayScore : score.homeScore;

  // Check for final game status — normalize to lowercase to handle 'final', 'FINAL', 'status_final', etc.
  // fetchLiveScores normalizes to lowercase, but guard here covers any future callers too.
  const normalizedStatus = (score.status ?? '').toLowerCase();
  const isFinalStatus =
    normalizedStatus === 'final' ||
    normalizedStatus === 'status_final' ||
    normalizedStatus === 'completed' ||
    normalizedStatus === 'status_final_overtime';
  if (isFinalStatus) {
    const isCorrect = userScore > opponentScore;
    return {
      status: 'final',
      points: isCorrect ? rank : -rank,
      isCorrect,
    };
  }

  // Live game — compare scores
  if (userScore > opponentScore) {
    return {status: 'winning', points: rank};
  } else if (userScore < opponentScore) {
    return {status: 'losing', points: rank};
  } else {
    return {status: 'tied', points: rank};
  }
}
