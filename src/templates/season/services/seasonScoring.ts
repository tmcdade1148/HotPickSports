import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonMatch, DbSeasonPick} from '@shared/types/database';

/**
 * Determine the actual outcome of a completed match.
 * Returns 'home', 'away', 'draw', or null if not yet completed.
 */
export function determineOutcome(match: DbSeasonMatch): string | null {
  if (
    match.status !== 'completed' ||
    match.home_score === null ||
    match.away_score === null
  ) {
    return null;
  }
  if (match.home_score > match.away_score) {
    return 'home';
  }
  if (match.away_score > match.home_score) {
    return 'away';
  }
  return 'draw';
}

/**
 * Calculate points for a single week.
 *
 * Scoring:
 * - Correct pick: 1 base point
 * - Correct HotPick: match.rank points (from the rank field on DbSeasonMatch)
 * - Incorrect pick (hot or not): 0 points
 *
 * Config is passed through for future extensibility (never hardcode sport rules).
 */
export function calculateWeekPoints(
  picks: DbSeasonPick[],
  matches: DbSeasonMatch[],
  _config: SeasonConfig,
): number {
  let points = 0;

  for (const pick of picks) {
    const match = matches.find(m => m.id === pick.match_id);
    if (!match) {
      continue;
    }

    const outcome = determineOutcome(match);
    if (outcome === null) {
      continue;
    }

    if (pick.picked_outcome === outcome) {
      points += pick.is_hot_pick ? match.rank : 1;
    }
  }

  return points;
}

/**
 * Sum all weekly points into a season total.
 */
export function calculateSeasonTotal(
  weeklyBreakdown: Record<string, number>,
): number {
  return Object.values(weeklyBreakdown).reduce((sum, pts) => sum + pts, 0);
}
