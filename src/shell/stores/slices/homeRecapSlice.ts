// Home "last-week HotPick recap + week mini-strip" actions for the global
// store (Home Redesign §6.6). All read pre-computed values (Hard Rule #3 — the
// client never computes scores); no get() needed. Extracted verbatim.
import type {StoreApi} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {GlobalState} from '../globalStore.types';

type Set = StoreApi<GlobalState>['setState'];

type HomeRecapSlice = Pick<
  GlobalState,
  | 'lastWeekHotPick'
  | 'recentWeeks'
  | 'hotPickHitRate'
  | 'seasonTotal'
  | 'loadHotPickHitRate'
  | 'loadLastWeekHotPick'
  | 'loadRecentWeeks'
  | 'loadSeasonTotal'
>;

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
    const isPlayoffs = currentPhase !== 'REGULAR';
    const weekState =
      typeof cfg.week_state === 'string' ? cfg.week_state : null;
    const weekInProgress =
      weekState === 'picks_open' || weekState === 'locked' || weekState === 'live';
    const currentWeek =
      typeof cfg.current_week === 'number' ? cfg.current_week : 1;

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
  loadHotPickHitRate: async (userId, competition) => {
    // Weeks with is_hotpick_correct = null had no HotPick attempt and
    // don't count toward numerator or denominator.
    const {data} = await supabase
      .from('season_user_totals')
      .select('is_hotpick_correct')
      .eq('user_id', userId)
      .eq('competition', competition);
    if (!data) {
      set({hotPickHitRate: null});
      return;
    }
    let hits = 0;
    let total = 0;
    for (const row of data as Array<{is_hotpick_correct: boolean | null}>) {
      if (row.is_hotpick_correct == null) continue;
      total += 1;
      if (row.is_hotpick_correct) hits += 1;
    }
    set({hotPickHitRate: total > 0 ? {hits, total} : null});
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
    // Pre-computed per-week totals. Last 4 weeks descending; display ascending.
    const {data} = await supabase
      .from('season_user_totals')
      .select('week, week_points, correct_picks, total_picks')
      .eq('user_id', userId)
      .eq('competition', competition)
      .order('week', {ascending: false})
      .limit(4);

    const rows = (data ?? []) as Array<{
      week: number;
      week_points: number | null;
      correct_picks: number | null;
      total_picks: number | null;
    }>;
    // Per-week earned is `week_points`. `playoff_points` is NOT a separate
    // bucket — the scoring fn sets it equal to week_points for weeks ≥ 19 so
    // the playoff-scoped leaderboard can sum it. Adding both double-counts
    // playoff weeks (a +12 week rendered as +24).
    const ascending = [...rows].reverse().map(r => ({
      week:         r.week,
      total:        r.week_points ?? 0,
      correctPicks: r.correct_picks ?? 0,
      totalPicks:   r.total_picks ?? 0,
    }));
    set({recentWeeks: ascending});
  },
});
