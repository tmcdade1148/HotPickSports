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
  if (matchup.higher_seed_wins > matchup.lower_seed_wins) {
    return matchup.higher_seed_code;
  }
  return matchup.lower_seed_code;
}

/**
 * Total games played in a series.
 */
export function getSeriesLength(matchup: DbSeriesMatchup): number {
  return matchup.higher_seed_wins + matchup.lower_seed_wins;
}

/**
 * Calculate points for a single playoff round.
 *
 * Scoring:
 * - Correct winner: roundConfig.rank points (base)
 * - Correct winner + HotPick: 2x roundConfig.rank points
 * - Correct series length (predicted_games matches actual): +config.seriesLengthBonusPoints
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
    const matchup = matchups.find(m => m.id === pick.matchup_id);
    if (!matchup) {
      continue;
    }

    const winner = getSeriesWinner(matchup);
    if (winner === null) {
      continue;
    }

    // Check if winner pick is correct
    if (pick.picked_team_code === winner) {
      // Base points (doubled for HotPick)
      points += pick.is_hot_pick ? roundConfig.rank * 2 : roundConfig.rank;

      // Series length bonus
      const actualLength = getSeriesLength(matchup);
      if (pick.predicted_games === actualLength) {
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
