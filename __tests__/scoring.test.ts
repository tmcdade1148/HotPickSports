// Tests for the pure scoring logic shared by the NFL scoring Edge Functions.
// These lock the highest-risk rules: HotPick ±rank scoring, double-down,
// frozen_rank immutability (Hard Rule #6), the zero-row backfill, week-phase
// labels, and the ESPN postseason week map (incl. the Pro Bowl gap).
import {
  BASE_WIN_POINTS,
  PLAYOFF_WEEK_MAP,
  mapPlayoffWeek,
  weekPhase,
  effectiveRank,
  scorePicks,
  type ScoreGame,
  type ScorePick,
} from '../supabase/functions/_shared/scoring';

const game = (winner_team: string | null, rank: number): ScoreGame => ({
  winner_team,
  effectiveRank: rank,
});

const pick = (over: Partial<ScorePick> & Pick<ScorePick, 'user_id' | 'game_id' | 'picked_team'>): ScorePick => ({
  is_hotpick: false,
  power_up: null,
  ...over,
});

describe('weekPhase', () => {
  it('labels the postseason rounds', () => {
    expect(weekPhase(19)).toBe('WILDCARD');
    expect(weekPhase(20)).toBe('DIVISIONAL');
    expect(weekPhase(21)).toBe('CONFERENCE');
    expect(weekPhase(22)).toBe('SUPERBOWL');
  });

  it('treats every other week as REGULAR', () => {
    expect(weekPhase(1)).toBe('REGULAR');
    expect(weekPhase(18)).toBe('REGULAR');
    expect(weekPhase(23)).toBe('REGULAR');
  });
});

describe('mapPlayoffWeek', () => {
  it('maps the scored ESPN postseason weeks to internal weeks', () => {
    expect(mapPlayoffWeek(1)).toBe(19); // Wild Card
    expect(mapPlayoffWeek(2)).toBe(20); // Divisional
    expect(mapPlayoffWeek(3)).toBe(21); // Conference
    expect(mapPlayoffWeek(5)).toBe(22); // Super Bowl
  });

  it('returns null for the Pro Bowl (ESPN week 4) and anything unmapped', () => {
    expect(mapPlayoffWeek(4)).toBeNull(); // Pro Bowl — no scoring week
    expect(mapPlayoffWeek(0)).toBeNull();
    expect(mapPlayoffWeek(6)).toBeNull();
  });

  it('the map itself has exactly the four scored rounds', () => {
    expect(PLAYOFF_WEEK_MAP).toEqual({1: 19, 2: 20, 3: 21, 5: 22});
  });
});

describe('effectiveRank — Hard Rule #6 (frozen_rank is authoritative)', () => {
  it('prefers frozen_rank over live rank once set', () => {
    expect(effectiveRank({frozen_rank: 7, rank: 3})).toBe(7);
  });

  it('falls back to live rank when frozen_rank is null/undefined', () => {
    expect(effectiveRank({frozen_rank: null, rank: 4})).toBe(4);
    expect(effectiveRank({rank: 4})).toBe(4);
  });

  it('defaults to 1 when neither is present', () => {
    expect(effectiveRank({})).toBe(1);
    expect(effectiveRank({frozen_rank: null, rank: null})).toBe(1);
  });

  it('treats frozen_rank 0 as a real (falsy-but-present) value? no — 0 is nullish-coalesced through', () => {
    // 0 is not null/undefined, so ?? keeps it.
    expect(effectiveRank({frozen_rank: 0, rank: 5})).toBe(0);
  });
});

describe('scorePicks — non-HotPick', () => {
  const games = new Map([['g1', game('KC', 5)]]);

  it('awards BASE_WIN_POINTS for a correct non-HotPick and counts it', () => {
    const {userAggs, pickResults} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC'}),
    ]);
    expect(userAggs).toHaveLength(1);
    expect(userAggs[0]).toMatchObject({
      week_points: BASE_WIN_POINTS,
      correct_picks: 1,
      total_picks: 1,
      is_hotpick_correct: null,
    });
    expect(pickResults[0]).toEqual({user_id: 'u1', game_id: 'g1', is_correct: true, points: 1});
  });

  it('awards nothing for an incorrect non-HotPick but still counts the pick', () => {
    const {userAggs, pickResults} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'BUF'}),
    ]);
    expect(userAggs[0]).toMatchObject({week_points: 0, correct_picks: 0, total_picks: 1});
    expect(pickResults[0]).toEqual({user_id: 'u1', game_id: 'g1', is_correct: false, points: 0});
  });
});

describe('scorePicks — HotPick', () => {
  const games = new Map([['g1', game('KC', 6)]]);

  it('awards +rank for a correct HotPick and sets is_hotpick_correct', () => {
    const {userAggs, pickResults} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC', is_hotpick: true}),
    ]);
    expect(userAggs[0]).toMatchObject({
      week_points: 6,
      correct_picks: 1,
      is_hotpick_correct: true,
      hotpick_rank: 6,
      double_down_used: false,
    });
    expect(pickResults[0].points).toBe(6);
  });

  it('subtracts rank for an incorrect HotPick and marks it missed', () => {
    const {userAggs, pickResults} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'BUF', is_hotpick: true}),
    ]);
    expect(userAggs[0]).toMatchObject({
      week_points: -6,
      correct_picks: 0,
      is_hotpick_correct: false,
      hotpick_rank: 6,
    });
    expect(pickResults[0].points).toBe(-6);
  });

  it('doubles the payout for a correct double-down and records the delta', () => {
    const {userAggs, pickResults} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC', is_hotpick: true, power_up: 'double_down'}),
    ]);
    expect(userAggs[0]).toMatchObject({
      week_points: 12,
      is_hotpick_correct: true,
      double_down_used: true,
      double_down_delta: 6,
    });
    expect(pickResults[0].points).toBe(12);
  });

  it('does NOT double the penalty on a missed double-down (only the upside doubles)', () => {
    const {userAggs} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'BUF', is_hotpick: true, power_up: 'double_down'}),
    ]);
    expect(userAggs[0]).toMatchObject({week_points: -6, double_down_used: false});
  });
});

describe('scorePicks — combined / edge cases', () => {
  it('sums a HotPick win and a base win across two games for one user', () => {
    const games = new Map([
      ['g1', game('KC', 8)],
      ['g2', game('SF', 4)],
    ]);
    const {userAggs} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC', is_hotpick: true}), // +8
      pick({user_id: 'u1', game_id: 'g2', picked_team: 'SF'}), // +1
    ]);
    expect(userAggs[0]).toMatchObject({week_points: 9, correct_picks: 2, total_picks: 2});
  });

  it('scores a TIE (final game, no winner) as a loss — not skipped', () => {
    // A null winner_team on a game that IS in the map (i.e. final) is a tie, which
    // counts as a loss: a non-HotPick tie is 0 pts but still a counted pick.
    const games = new Map([
      ['g1', game(null, 5)], // final, tied
      ['g2', game('SF', 3)],
    ]);
    const {userAggs, pickResults, scoredUserIds} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC'}), // tie → loss, 0 pts, counted
      pick({user_id: 'u1', game_id: 'g2', picked_team: 'SF'}), // +1
    ]);
    expect(userAggs[0]).toMatchObject({week_points: 1, total_picks: 2});
    expect(pickResults).toHaveLength(2);
    expect(pickResults.find(r => r.game_id === 'g1')).toMatchObject({is_correct: false, points: 0});
    expect(scoredUserIds.has('u1')).toBe(true);
  });

  it('scores a HotPick on a TIE as a loss of -rank', () => {
    const games = new Map([['g1', game(null, 7)]]); // final, tied
    const {userAggs, pickResults} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC', is_hotpick: true}), // tie → -7
    ]);
    expect(userAggs[0]).toMatchObject({week_points: -7, total_picks: 1, is_hotpick_correct: false});
    expect(pickResults[0]).toMatchObject({is_correct: false, points: -7});
  });

  it('backfills a zero-row for a user whose only picked game is not final yet', () => {
    const games = new Map([['g2', game('SF', 3)]]); // g1 not present (not final)
    const {userAggs, scoredUserIds} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC'}), // game not final -> skipped
      pick({user_id: 'u2', game_id: 'g2', picked_team: 'SF'}), // scores
    ]);
    const u1 = userAggs.find(u => u.user_id === 'u1');
    expect(u1).toMatchObject({week_points: 0, total_picks: 0, is_hotpick_correct: null});
    // u1 is backfilled, NOT counted among the users who actually scored.
    expect(scoredUserIds.has('u1')).toBe(false);
    expect(scoredUserIds.has('u2')).toBe(true);
    expect(userAggs).toHaveLength(2);
  });

  it('keeps is_hotpick_correct=true even if a later HotPick on the same user misses', () => {
    // (Guards the `if (is_hotpick_correct === null)` write — a true must not be
    // downgraded to false by a subsequent missed HotPick.)
    const games = new Map([
      ['g1', game('KC', 5)],
      ['g2', game('SF', 2)],
    ]);
    const {userAggs} = scorePicks(games, [
      pick({user_id: 'u1', game_id: 'g1', picked_team: 'KC', is_hotpick: true}), // hit
      pick({user_id: 'u1', game_id: 'g2', picked_team: 'DAL', is_hotpick: true}), // miss
    ]);
    expect(userAggs[0].is_hotpick_correct).toBe(true);
    expect(userAggs[0].week_points).toBe(3); // +5 - 2
  });

  it('returns empty results for no picks', () => {
    const {userAggs, pickResults, scoredUserIds} = scorePicks(new Map(), []);
    expect(userAggs).toEqual([]);
    expect(pickResults).toEqual([]);
    expect(scoredUserIds.size).toBe(0);
  });
});
