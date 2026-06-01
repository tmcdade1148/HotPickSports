// NFL season scoring math (spec: docs/DEMO_WEEK_SPEC.md §6, O-3).
//
// Pure function so demo-settle keeps the +1 win / HotPick ±rank rules out of
// the request handler. Currently co-located with demo-settle (per-function
// MCP deploys can't reach a functions/_shared dir); when the production
// scorer (nfl-calculate-scores) adopts this same implementation, promote it
// to functions/_shared so both share ONE copy.
//
// Scoring rules (CLAUDE.md §7 — locked):
//   - Standard pick: +1 if win, 0 if loss (never negative).
//   - HotPick: +rank if win, −rank if loss (rank = frozen_rank ?? rank ?? 1).
//   - double_down power-up doubles a winning HotPick (kept for parity with the
//     production scorer; the demo does not use power-ups).
//   - is_hotpick_correct is null until the HotPick game is decided — for a
//     settle pass over decided games it resolves to true/false.

export const BASE_WIN_POINTS = 1;

export interface ScoringGame {
  game_id: string;
  winner_team: string | null;
  rank?: number | null;
  frozen_rank?: number | null;
}

export interface ScoringPick {
  user_id: string;
  game_id: string;
  picked_team: string;
  is_hotpick?: boolean | null;
  power_up?: string | null;
}

export interface UserScore {
  user_id: string;
  week_points: number;
  correct_picks: number;
  total_picks: number;
  is_hotpick_correct: boolean | null;
  hotpick_rank: number | null;
  double_down_used: boolean;
  double_down_delta: number;
}

export interface PickResult {
  user_id: string;
  game_id: string;
  is_correct: boolean;
  points: number;
}

/**
 * Score a set of picks against decided games. Only games with a non-null
 * winner_team contribute. Returns per-user aggregates plus per-pick results.
 * Pure — no I/O. Mirrors the math in nfl-calculate-scores.scoreWeek().
 */
export function scorePicks(
  games: ScoringGame[],
  picks: ScoringPick[],
): {userScores: UserScore[]; pickResults: PickResult[]} {
  const gameMap = new Map(
    games.map(g => [g.game_id, {...g, effectiveRank: g.frozen_rank ?? g.rank ?? 1}]),
  );

  const aggByUser = new Map<string, UserScore>();
  const pickResults: PickResult[] = [];

  for (const p of picks) {
    const game = gameMap.get(p.game_id);
    if (!game || !game.winner_team) continue;

    const isWin = p.picked_team === game.winner_team;
    const isHotpick = !!p.is_hotpick;
    const isDoubleDown = p.power_up === 'double_down';
    const rank = game.effectiveRank;

    const agg: UserScore = aggByUser.get(p.user_id) ?? {
      user_id: p.user_id, week_points: 0, correct_picks: 0,
      total_picks: 0, is_hotpick_correct: null, hotpick_rank: null,
      double_down_used: false, double_down_delta: 0,
    };

    agg.total_picks += 1;

    let pickPoints = 0;
    if (isHotpick) {
      agg.hotpick_rank = rank;
      if (isWin) {
        pickPoints = isDoubleDown ? rank * 2 : rank;
        agg.week_points += pickPoints;
        agg.correct_picks += 1;
        agg.is_hotpick_correct = true;
        if (isDoubleDown) { agg.double_down_used = true; agg.double_down_delta = rank; }
      } else {
        pickPoints = -rank;
        agg.week_points -= rank;
        if (agg.is_hotpick_correct === null) agg.is_hotpick_correct = false;
      }
    } else if (isWin) {
      pickPoints = BASE_WIN_POINTS;
      agg.week_points += BASE_WIN_POINTS;
      agg.correct_picks += 1;
    }

    pickResults.push({user_id: p.user_id, game_id: p.game_id, is_correct: isWin, points: pickPoints});
    aggByUser.set(p.user_id, agg);
  }

  return {userScores: Array.from(aggByUser.values()), pickResults};
}
