import type {SeriesConfig, SeriesRoundConfig} from '@shared/types/templates';
import type {DbSeriesMatchup, DbSeriesPick} from '@shared/types/database';

/**
 * Determine the winner of a completed series.
 * Returns the winning team code, or null if not yet completed.
 */
export function getSeriesWinner(matchup: DbSeriesMatchup): string | null {
  if (matchup.status !== 'completed') {
    return null;
  }
  // Use the canonical winner_team column if available
  if (matchup.winner_team) {
    return matchup.winner_team;
  }
  // Fallback to win counts
  if (matchup.higher_seed_wins > matchup.lower_seed_wins) {
    return matchup.higher_seed_team;
  }
  return matchup.lower_seed_team;
}

/**
 * Total games played in a series.
 * Prefers the canonical series_length column; falls back to summing wins.
 */
export function getSeriesLength(matchup: DbSeriesMatchup): number {
  if (matchup.series_length != null) {
    return matchup.series_length;
  }
  return matchup.higher_seed_wins + matchup.lower_seed_wins;
}

/**
 * Calculate points for a single playoff round.
 *
 * Scoring:
 * - Correct winner: roundConfig.rank points (base)
 * - Correct winner + HotPick: 2x roundConfig.rank points
 * - Correct series length (picked_series_length matches actual): +config.seriesLengthBonusPoints
 * - Incorrect: 0
 *
 * Config is passed for future extensibility (never hardcode sport rules).
 */
export function calculateRoundPoints(
  picks: DbSeriesPick[],
  matchups: DbSeriesMatchup[],
  roundConfig: SeriesRoundConfig,
  config: SeriesConfig,
): number {
  let points = 0;

  for (const pick of picks) {
    const matchup = matchups.find(m => m.series_id === pick.series_id);
    if (!matchup) {
      continue;
    }

    const winner = getSeriesWinner(matchup);
    if (winner === null) {
      continue;
    }

    // Check if winner pick is correct
    if (pick.picked_winner === winner) {
      // Base points (doubled for HotPick)
      points += pick.is_hotpick ? roundConfig.rank * 2 : roundConfig.rank;

      // Series length bonus
      const actualLength = getSeriesLength(matchup);
      if (pick.picked_series_length === actualLength) {
        points += config.seriesLengthBonusPoints;
      }
    }
  }

  return points;
}

/**
 * Sum all round points into a series total.
 */
export function calculateSeriesTotalScore(
  roundBreakdown: Record<string, number>,
): number {
  return Object.values(roundBreakdown).reduce((sum, pts) => sum + pts, 0);
}
