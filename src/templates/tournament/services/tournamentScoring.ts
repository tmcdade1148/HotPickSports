import type {TournamentConfig} from '@shared/types/templates';
import type {
  DbTournamentMatch,
  DbTournamentPick,
} from '@shared/types/database';

/**
 * Calculate tournament scores.
 * Receives config — never hardcodes sport-specific rules.
 *
 * NOTE: Group advancement scoring is handled separately via
 * tournament_group_picks / tournament_group_results and scored
 * server-side in an Edge Function. This module only scores
 * match-level (knockout) picks on the client for preview purposes.
 */

export function calculateKnockoutPoints(
  picks: DbTournamentPick[],
  matches: DbTournamentMatch[],
  config: TournamentConfig,
): number {
  let points = 0;

  for (const pick of picks) {
    const match = matches.find(m => m.match_id === pick.match_id);
    if (!match || match.status !== 'completed') {
      continue;
    }

    // Use winner_team from the DB if available, otherwise derive from scores
    let winnerTeam: string | null = match.winner_team;
    if (!winnerTeam && match.home_score !== null && match.away_score !== null) {
      winnerTeam =
        match.home_score > match.away_score ? match.home_team : match.away_team;
    }

    if (winnerTeam && pick.picked_team === winnerTeam) {
      // Find the round config to get the rank (points multiplier)
      const roundConfig = config.knockoutRounds.find(
        r => r.key === match.stage,
      );
      const rank = match.frozen_rank ?? roundConfig?.rank ?? 1;

      // Hot picks earn the rank value, regular picks earn base points
      points += pick.is_hotpick ? rank : 1;
    }
  }

  return points;
}

export function calculateTotalScore(
  picks: DbTournamentPick[],
  matches: DbTournamentMatch[],
  config: TournamentConfig,
): {groupStagePoints: number; knockoutPoints: number; total: number} {
  // Group stage points are scored server-side via Edge Functions.
  // Client only computes knockout points for preview.
  const groupStagePoints = 0;
  const knockoutPoints = calculateKnockoutPoints(picks, matches, config);
  return {
    groupStagePoints,
    knockoutPoints,
    total: groupStagePoints + knockoutPoints,
  };
}
