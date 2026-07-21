// Home "last-week HotPick recap + week mini-strip" actions for the global
// store (Home Redesign §6.6). All read pre-computed values (Hard Rule #3 — the
// client never computes scores); no get() needed. Extracted verbatim.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import {isWeekInProgress} from '@shared/utils/weekState';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];

type HomeRecapSlice = Pick<
  GlobalState,
  | 'lastWeekHotPick'
  | 'recentWeeks'
  | 'hotPickHitRate'
  | 'seasonTotal'
  | 'loadLastWeekHotPick'
  | 'loadRecentWeeks'
  | 'loadSeasonTotal'
>;

/**
 * Phases whose rows are the PLAYOFF set. REGULAR_COMPLETE is deliberately NOT
 * here — see readSeasonScope. Mirrored in HistoryModule.
 */
const PLAYOFF_PHASES = ['PLAYOFFS', 'SUPERBOWL_INTRO', 'SUPERBOWL', 'SEASON_COMPLETE'];

/**
 * The phase/week scope both season reads share.
 *
 * Extracted so `loadSeasonTotal` and `loadRecentWeeks` can't disagree about
 * WHICH season they're describing. Map §2: "One season total on the screen. If
 * History shows a season number too, they're the same number or one is a lie."
 * Regular season and playoffs are separate leaderboards; if HISTORY's bars were
 * unscoped while IDENTITY's total was phase-scoped, the two would diverge the
 * moment the playoffs started.
 */
async function readSeasonScope(competition: string): Promise<{
  isPlayoffs: boolean;
  weekInProgress: boolean;
  currentWeek: number;
}> {
  const {data: cfgRows} = await supabase
    .from('competition_config')
    .select('key, value')
    .eq('competition', competition)
    .in('key', ['current_phase', 'week_state', 'current_week']);
  const cfg = Object.fromEntries(
    (cfgRows ?? []).map((r: any) => [r.key, r.value]),
  );
  const currentPhase =
    typeof cfg.current_phase === 'string' ? cfg.current_phase : 'REGULAR';
  const weekState = typeof cfg.week_state === 'string' ? cfg.week_state : null;
  return {
    // Only the TRUE playoff phases read the playoff row set. This was
    // `currentPhase !== 'REGULAR'`, which swept REGULAR_COMPLETE in with the
    // playoffs — but REGULAR_COMPLETE is the bridge AFTER the regular season
    // and BEFORE the playoffs: no playoff rows exist yet, so both HISTORY and
    // the season total came back empty there. The regular season stays the
    // scope until the playoffs actually start. Matches the Operator Console's
    // own leaderboard scoping, which never counted REGULAR_COMPLETE either.
    isPlayoffs: PLAYOFF_PHASES.includes(currentPhase),
    // Single shared predicate — see @shared/utils/weekState. This now includes
    // `settling`, which it previously did not: during settling the season
    // total EXCLUDES the settling week, matching HISTORY's bars exactly.
    // Approved behaviour change (slice 6b), and the fix for the 6a divergence.
    weekInProgress: isWeekInProgress(weekState),
    currentWeek: typeof cfg.current_week === 'number' ? cfg.current_week : 1,
  };
}

export const createHomeRecapSlice = (set: Set): HomeRecapSlice => ({
  lastWeekHotPick: null,
  recentWeeks: [],
  hotPickHitRate: null,
  seasonTotal: null,

  loadSeasonTotal: async (userId, competition) => {
    // User-scoped season total — mirrors seasonStore.fetchLeaderboard's
    // per-user aggregation (sum of week_points for the active phase, current
    // in-progress week excluded) but WITHOUT the pool member / pool_start_date
    // filter, so it's the user's true season total independent of any pool.
    // Phase + week state come from competition_config (never hardcoded).
    const {isPlayoffs, weekInProgress, currentWeek} =
      await readSeasonScope(competition);

    // Regular season and playoffs are separate leaderboards — scope the total
    // to whichever phase is active, matching the pool leaderboard's behavior.
    let query = supabase
      .from('season_user_totals')
      .select('week, week_points')
      .eq('user_id', userId)
      .eq('competition', competition);
    query = isPlayoffs ? query.neq('phase', 'REGULAR') : query.eq('phase', 'REGULAR');

    const {data} = await query;
    const rows = (data ?? []) as Array<{week: number; week_points: number | null}>;
    // Season total only reflects fully settled weeks — exclude the current
    // week while its games are still in progress (same rule as the leaderboard).
    const total = rows.reduce((sum, r) => {
      if (weekInProgress && r.week === currentWeek) return sum;
      return sum + (r.week_points ?? 0);
    }, 0);
    set({seasonTotal: total});
  },
  loadLastWeekHotPick: async (userId, competition, currentWeek) => {
    if (currentWeek <= 1) {
      set({lastWeekHotPick: null});
      return;
    }
    const targetWeek = currentWeek - 1;

    // Read the user's HotPick row for the prior week. is_correct + points
    // are server-computed by the scoring Edge Function; we only display.
    const {data: pick} = await supabase
      .from('season_picks')
      .select('picked_team, is_correct, points')
      .eq('user_id', userId)
      .eq('competition', competition)
      .eq('week', targetWeek)
      .eq('is_hotpick', true)
      .maybeSingle();

    if (!pick || pick.is_correct == null) {
      set({lastWeekHotPick: null});
      return;
    }

    set({
      lastWeekHotPick: {
        team:      pick.picked_team,
        isCorrect: pick.is_correct,
        points:    pick.points ?? 0,
      },
    });
  },

  loadRecentWeeks: async (userId, competition) => {
    // EVERY scored week for the active phase — the HISTORY chart plots the
    // whole season, and the map's thesis ("~48% of bars go blue") only reads
    // across one. The old `.limit(4)` existed for the 3-pill WeeklyTrend strip;
    // that strip slices what it needs from this array itself.
    //
    // Phase scope is READ FROM THE SAME HELPER as loadSeasonTotal so HISTORY's
    // bars and IDENTITY's SEASON PTS always describe the same season (map §2).
    // User + competition scoped, never pool_id — scores are user-scoped and
    // pools are a lens on them (Hard Rule #2).
    const {isPlayoffs} = await readSeasonScope(competition);

    let query = supabase
      .from('season_user_totals')
      .select(
        'week, week_points, correct_picks, total_picks, is_hotpick_correct, hotpick_rank',
      )
      .eq('user_id', userId)
      .eq('competition', competition);
    query = isPlayoffs ? query.neq('phase', 'REGULAR') : query.eq('phase', 'REGULAR');

    const {data} = await query.order('week', {ascending: false});

    const rows = (data ?? []) as Array<{
      week: number;
      week_points: number | null;
      correct_picks: number | null;
      total_picks: number | null;
      is_hotpick_correct: boolean | null;
      hotpick_rank: number | null;
    }>;
    // Per-week earned is `week_points`. `playoff_points` is NOT a separate
    // bucket — the scoring fn sets it equal to week_points for weeks ≥ 19 so
    // the playoff-scoped leaderboard can sum it. Adding both double-counts
    // playoff weeks (a +12 week rendered as +24).
    const ascending = [...rows].reverse().map(r => ({
      week:             r.week,
      total:            r.week_points ?? 0,
      correctPicks:     r.correct_picks ?? 0,
      totalPicks:       r.total_picks ?? 0,
      isHotPickCorrect: r.is_hotpick_correct,
      hotPickRank:      r.hotpick_rank,
    }));

    // HotPick record, derived from the SAME rows rather than its own query.
    // `loadHotPickHitRate` used to fetch this separately — two reads of one
    // fact, free to disagree. Weeks with is_hotpick_correct = null had no
    // HotPick attempt and count toward neither numerator nor denominator.
    let hits = 0;
    let resolved = 0;
    for (const r of ascending) {
      if (r.isHotPickCorrect == null) continue;
      resolved += 1;
      if (r.isHotPickCorrect) hits += 1;
    }

    set({
      recentWeeks: ascending,
      hotPickHitRate: resolved > 0 ? {hits, total: resolved} : null,
    });
  },
});
