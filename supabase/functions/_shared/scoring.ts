// Pure scoring logic shared by the NFL scoring Edge Functions.
//
// This module is deliberately FREE of Deno APIs, network calls, and Supabase —
// it is pure computation so it can be imported by both the Deno Edge Functions
// (relative import) and the Node/Jest test suite (`__tests__/scoring.test.ts`).
// Keep it that way: no `Deno.*`, no `createClient`, no I/O.
//
// Covers the highest-risk, easiest-to-get-wrong rules:
//   • HotPick win/loss scoring (±rank, double-down ×2) and base win points
//   • Hard Rule #6 — frozen_rank is authoritative once set (effectiveRank)
//   • Postseason week numbering (weekPhase + the ESPN playoff week map)

export const BASE_WIN_POINTS = 1;

// ESPN postseason "week.number" → our internal season week.
// 1=Wild Card→19, 2=Divisional→20, 3=Conference→21, 5=Super Bowl→22.
// ESPN week 4 is the Pro Bowl — intentionally ABSENT (it has no scoring week).
export const PLAYOFF_WEEK_MAP: Record<number, number> = {1: 19, 2: 20, 3: 21, 5: 22};

/** Map an ESPN postseason week number to our internal week, or null if it has
 *  no scoring week (e.g. ESPN week 4 = Pro Bowl). */
export function mapPlayoffWeek(espnWeek: number): number | null {
  return PLAYOFF_WEEK_MAP[espnWeek] ?? null;
}

/** The competition phase label for an internal season week. Weeks 19–22 are the
 *  postseason rounds; everything else is REGULAR. */
export function weekPhase(week: number): string {
  if (week === 19) return 'WILDCARD';
  if (week === 20) return 'DIVISIONAL';
  if (week === 21) return 'CONFERENCE';
  if (week === 22) return 'SUPERBOWL';
  return 'REGULAR';
}

/** Hard Rule #6: once `frozen_rank` is set (at the pick deadline) it is
 *  authoritative and immutable — fall back to live `rank`, then to 1. */
export function effectiveRank(game: {frozen_rank?: number | null; rank?: number | null}): number {
  return game.frozen_rank ?? game.rank ?? 1;
}

export interface ScoreGame {
  winner_team: string | null;
  effectiveRank: number;
}

export interface ScorePick {
  user_id: string;
  game_id: string;
  picked_team: string;
  is_hotpick?: boolean | null;
  power_up?: string | null;
}

export interface UserAgg {
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

export interface ScoreResult {
  /** Per-user week aggregates, INCLUDING zero-rows for users who submitted
   *  picks this week but none of whose games are final yet. */
  userAggs: UserAgg[];
  /** Per-pick result rows to write back to season_picks. */
  pickResults: PickResult[];
  /** Users who actually scored (excludes the zero-row backfill). */
  scoredUserIds: Set<string>;
}

function emptyAgg(user_id: string): UserAgg {
  return {
    user_id,
    week_points: 0,
    correct_picks: 0,
    total_picks: 0,
    is_hotpick_correct: null,
    hotpick_rank: null,
    double_down_used: false,
    double_down_delta: 0,
  };
}

/**
 * Score one week's picks against its final games. Pure: given the same inputs it
 * always returns the same output. `gameMap` holds only games that are FINAL (the
 * caller filters by status), keyed by game_id, each carrying its `effectiveRank`.
 *
 * Scoring rules (must match the live scorer exactly):
 *   • Non-HotPick win → +BASE_WIN_POINTS, correct_picks +1
 *   • Non-HotPick loss → 0
 *   • HotPick win → +rank (×2 if double_down), correct_picks +1, is_hotpick_correct=true
 *   • HotPick loss → −rank, is_hotpick_correct=false (only if not already true)
 *   • A DRAW (final game with no winner_team) is a PUSH — it does not score at all.
 *     Regular pick → excluded (total_picks NOT incremented, no result row, 0 pts).
 *     HotPick → 0 swing (no +rank, no −rank; is_hotpick_correct stays null;
 *     hotpick_rank not set). A draw is NEVER a loss (Tie Handling spec / register 2.7).
 *   • Picks whose game isn't final yet (absent from gameMap) are skipped (not counted)
 */
export function scorePicks(gameMap: Map<string, ScoreGame>, picks: ScorePick[]): ScoreResult {
  const aggByUser = new Map<string, UserAgg>();
  const pickResults: PickResult[] = [];

  for (const p of picks) {
    const game = gameMap.get(p.game_id);
    // gameMap holds only FINAL games (the caller filters by status). Two cases,
    // kept deliberately DISTINCT — do not collapse them back into one guard:
    //   1. No game row → the pick's game isn't FINAL yet → not scorable; skip it
    //      (it still gets the zero-row backfill below).
    if (!game) continue;
    //   2. FINAL game with a null winner_team → a genuine DRAW → PUSH. The pick
    //      does not score: a regular pick is excluded (no total_picks increment,
    //      no result row, 0 pts) and a HotPick takes a 0 swing (is_hotpick_correct
    //      stays null, hotpick_rank not set). A draw is NEVER a loss. Folding this
    //      into the !game skip, or scoring it as −rank, is the register 2.7
    //      regression — keep the branch explicit so it can't silently return.
    if (!game.winner_team) continue;

    const isWin = p.picked_team === game.winner_team;
    const isHotpick = !!p.is_hotpick;
    const isDoubleDown = p.power_up === 'double_down';
    const rank = game.effectiveRank;

    const agg = aggByUser.get(p.user_id) ?? emptyAgg(p.user_id);
    agg.total_picks += 1;

    let pickPoints = 0;
    if (isHotpick) {
      agg.hotpick_rank = rank;
      if (isWin) {
        pickPoints = isDoubleDown ? rank * 2 : rank;
        agg.week_points += pickPoints;
        agg.correct_picks += 1;
        agg.is_hotpick_correct = true;
        if (isDoubleDown) {
          agg.double_down_used = true;
          agg.double_down_delta = rank;
        }
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

  const userAggs = Array.from(aggByUser.values());
  const scoredUserIds = new Set(userAggs.map(u => u.user_id));

  // Zero-row backfill: users who submitted picks this week but none of whose
  // games are final yet. Without this their season_user_totals row isn't
  // created until a picked game settles, leaving the home "pts earned" widget
  // showing "—" the whole time.
  const picksUserIds = new Set(picks.map(p => p.user_id));
  for (const uid of picksUserIds) {
    if (!scoredUserIds.has(uid)) userAggs.push(emptyAgg(uid));
  }

  return {userAggs, pickResults, scoredUserIds};
}
