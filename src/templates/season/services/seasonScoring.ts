import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonGame, DbSeasonPick} from '@shared/types/database';

/**
 * Check whether a pick is correct for a completed game.
 * Compares pick.picked_team against game.winner_team.
 * Returns null if the game is not yet completed/finalized.
 */
export function isPickCorrect(
  pick: DbSeasonPick,
  game: DbSeasonGame,
): boolean | null {
  if (game.status !== 'completed' || !game.winner_team) {
    return null;
  }
  return pick.picked_team === game.winner_team;
}

/**
 * Calculate points for a single week.
 *
 * Scoring:
 * - Correct pick: 1 base point
 * - Correct HotPick: game.rank points (from the rank field on DbSeasonGame)
 * - Incorrect pick (hot or not): 0 points
 *
 * Config is passed through for future extensibility (never hardcode sport rules).
 */
export function calculateWeekPoints(
  picks: DbSeasonPick[],
  games: DbSeasonGame[],
  _config: SeasonConfig,
): number {
  let points = 0;

  for (const pick of picks) {
    const game = games.find(g => g.game_id === pick.game_id);
    if (!game) {
      continue;
    }

    const correct = isPickCorrect(pick, game);
    if (correct === null) {
      continue;
    }

    if (correct) {
      points += pick.is_hot_pick ? (game.rank ?? 1) : 1;
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
