import type {TournamentConfig} from '@shared/types/templates';
import type {
  DbTournamentMatch,
  DbTournamentPick,
} from '@shared/types/database';

/**
 * Calculate tournament scores.
 * Receives config — never hardcodes sport-specific rules.
 */
export function calculateGroupPoints(
  picks: DbTournamentPick[],
  matches: DbTournamentMatch[],
  config: TournamentConfig,
): number {
  let points = 0;
  const groupAdvancementPicks = picks.filter(
    p => p.pick_type === 'group_advancement',
  );

  // For each group advancement pick, check if the team actually advanced
  // This is a simplified version — real implementation would check completed
  // group stage results
  for (const pick of groupAdvancementPicks) {
    const teamMatches = matches.filter(
      m =>
        m.status === 'completed' &&
        (m.home_team_code === pick.picked_team_code ||
          m.away_team_code === pick.picked_team_code),
    );

    if (teamMatches.length > 0) {
      // Simplified: award points if the team has completed matches
      // Real logic would compute group standings and check advancement
      points += config.groupCorrectAdvancementPoints;
    }
  }

  return points;
}

export function calculateKnockoutPoints(
  picks: DbTournamentPick[],
  matches: DbTournamentMatch[],
  config: TournamentConfig,
): number {
  let points = 0;
  const matchWinnerPicks = picks.filter(p => p.pick_type === 'match_winner');

  for (const pick of matchWinnerPicks) {
    const match = matches.find(m => m.id === pick.match_id);
    if (!match || match.status !== 'completed') {
      continue;
    }

    // Determine actual winner
    const homeWon =
      match.home_score !== null &&
      match.away_score !== null &&
      match.home_score > match.away_score;
    const winnerCode = homeWon ? match.home_team_code : match.away_team_code;

    if (pick.picked_team_code === winnerCode) {
      // Find the round config to get the rank (points multiplier)
      const roundConfig = config.knockoutRounds.find(
        r => r.key === match.round,
      );
      const rank = roundConfig?.rank ?? 1;

      // Hot picks earn the rank value, regular picks earn base points
      points += pick.is_hot_pick ? rank : 1;
    }
  }

  return points;
}

export function calculateTotalScore(
  picks: DbTournamentPick[],
  matches: DbTournamentMatch[],
  config: TournamentConfig,
): {groupPoints: number; knockoutPoints: number; total: number} {
  const groupPoints = calculateGroupPoints(picks, matches, config);
  const knockoutPoints = calculateKnockoutPoints(picks, matches, config);
  return {
    groupPoints,
    knockoutPoints,
    total: groupPoints + knockoutPoints,
  };
}
