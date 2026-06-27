import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {SeasonConfig} from '@shared/types/templates';
import type {
  DbSeasonGame,
  DbSeasonPick,
  DbSeasonUserTotal,
} from '@shared/types/database';

/** Leaderboard display name: poolie_name → first + last initial → 'Player' */
function formatLeaderboardName(p: {poolie_name: string | null; first_name: string | null; last_name: string | null}): string {
  return p.poolie_name
    || (p.first_name ? `${p.first_name}${p.last_name ? ` ${p.last_name.charAt(0)}.` : ''}` : 'Player');
}

/**
 * Aggregated leaderboard entry — computed client-side by summing
 * per-week rows from season_user_totals.
 */
export interface SeasonLeaderboardEntry {
  user_id: string;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  /** Per-week breakdown: week number -> week_points */
  weekly_breakdown: Record<number, number>;
  /** Co-ranked standing from the server (get_pool_standings) — shared on a tie
   *  (1,2,2,4). The client never computes this; undefined until loaded. */
  standing_rank?: number;
  /** True when another member shares this exact total_points → render "T-{rank}". */
  is_tied?: boolean;
}

/**
 * Week leaderboard entry — single week scores with HotPick detail.
 * Populated from season_user_totals + season_picks (HotPick row).
 */
export interface WeekLeaderboardEntry {
  user_id: string;
  week_points: number;
  correct_picks: number;
  total_picks: number;
  /** HotPick details for this week */
  hotpick_team: string | null;
  hotpick_game_label: string | null; // e.g. "KC vs BUF"
  hotpick_rank: number | null;
  is_hotpick_correct: boolean | null;
  /** When picks were last submitted — used for ordering unscored users */
  submitted_at: string | null;
}

/**
 * Regular-season podium entry — a top finisher in the pool's final regular
 * season standings (phase = REGULAR), used by the Week 18 → Wild Card bridge.
 */
export interface PodiumEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  rank: number;
}

interface SeasonState {
  config: SeasonConfig | null;
  poolId: string;
  currentWeek: number;
  seasonYear: number;
  games: DbSeasonGame[];
  allWeekGames: Record<number, DbSeasonGame[]>;
  weekPicks: DbSeasonPick[];
  leaderboard: SeasonLeaderboardEntry[];
  /** Every active member's season total keyed by user_id. Backs getUserScore
   *  so a user can always read their own total directly. */
  allUserScores: Record<string, SeasonLeaderboardEntry>;
  weekLeaderboard: WeekLeaderboardEntry[];
  /** Which week the weekLeaderboard data is actually for. Differs from
   *  currentWeek during picks_open/locked — fetchWeekLeaderboard falls back
   *  to the previously-scored week so the Week tab never shows an empty list
   *  that fills in as picks are submitted. UI should label the Week tab with
   *  this value, not currentWeek. */
  weekLeaderboardDisplayedWeek: number | null;
  /** Map of user_id -> display_name for leaderboard display */
  userNames: Record<string, string>;
  /** Map of user_id -> avatar_key for leaderboard/profile display */
  userAvatars: Record<string, string | null>;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  initialize: (config: SeasonConfig, poolId: string, forceWeek?: number) => Promise<void>;
  setCurrentWeek: (week: number) => void;
  fetchWeekGames: (week: number, force?: boolean) => Promise<void>;
  fetchUserPicks: (userId: string, week: number) => Promise<void>;
  savePick: (params: {
    userId: string;
    gameId: string;
    pickedTeam: string;
    isHotPick: boolean;
  }) => Promise<void>;
  setHotPick: (params: {
    userId: string;
    gameId: string;
  }) => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
  fetchWeekLeaderboard: (week?: number) => Promise<void>;

  /** Pool's final REGULAR-season top finishers (always phase=REGULAR, even
   *  during REGULAR_COMPLETE/PLAYOFFS) + the current user's regular total.
   *  Drives the Week 18 → Wild Card winner podium. */
  regularSeasonPodium: PodiumEntry[];
  regularSeasonUserPoints: number | null;
  loadRegularSeasonPodium: (userId: string) => Promise<void>;

  // Picks completion
  isWeekComplete: boolean;
  setWeekComplete: (val: boolean) => void;

  // Selectors
  getPickForGame: (gameId: string) => DbSeasonPick | undefined;
  getPickCount: () => number;
  getHotPickCount: () => number;
  getUserScore: (userId: string) => SeasonLeaderboardEntry | undefined;

  /** Subscribe to live score updates for the current week's games.
   *  Patches individual game rows in place. Returns an unsubscribe fn. */
  subscribeToGameScores: () => () => void;

  // ── Onboarding demo (spec: docs/DEMO_WEEK_SPEC.md) ──
  /** Reveal demo results in place: flip local games to FINAL (they already
   *  carry winner_team + scores from the seed) and stamp each pick's
   *  server-scored is_correct / points so the cards render as completed. */
  applyDemoReveal: (picks: {game_id: string; is_correct: boolean; points: number}[]) => void;
  /** Undo a demo reveal for a "Try again": drop cached games + picks and
   *  re-fetch the (scheduled, pickable) demo games from the DB. */
  resetDemoGames: () => Promise<void>;
}

export const useSeasonStore = create<SeasonState>((set, get) => ({
  config: null,
  poolId: '',
  currentWeek: 1,
  seasonYear: 2026,
  games: [],
  allWeekGames: {},
  weekPicks: [],
  leaderboard: [],
  allUserScores: {},
  weekLeaderboard: [],
  weekLeaderboardDisplayedWeek: null,
  regularSeasonPodium: [],
  regularSeasonUserPoints: null,
  userNames: {},
  userAvatars: {},
  isLoading: false,
  isSaving: false,
  saveError: null,
  isWeekComplete: false,

  initialize: async (config, poolId, forceWeek?: number) => {
    // Skip if already initialized for this competition + pool + same week
    const state = get();
    if (
      state.config?.competition === config.competition &&
      state.poolId === poolId &&
      state.currentWeek > 0 &&
      (!forceWeek || state.currentWeek >= forceWeek)
    ) {
      return;
    }
    // Read current_week and season_year from competition_config (never hardcode)
    const {data: cfgRows} = await supabase
      .from('competition_config')
      .select('key, value')
      .eq('competition', config.competition)
      .in('key', ['current_week', 'season_year']);

    const cfgMap: Record<string, unknown> = {};
    for (const row of cfgRows ?? []) {
      cfgMap[row.key] = row.value;
    }

    const currentWeek =
      typeof cfgMap.current_week === 'number' ? cfgMap.current_week : 1;
    const seasonYear =
      typeof cfgMap.season_year === 'number' ? cfgMap.season_year : 2026;

    set(state => {
      // When the user only switches pools (same competition), these caches
      // remain valid because they're user+competition+week scoped, not
      // pool-scoped (CLAUDE.md rule #2 — no pool_id on picks/games). Wiping
      // them on every pool switch causes the Picks screen to go blank because
      // the loading useEffect doesn't depend on poolId. Clear only when the
      // competition itself changes (e.g., NFL → NHL).
      const competitionChanged =
        state.config?.competition !== config.competition;
      return {
        config,
        poolId,
        currentWeek,
        seasonYear,
        games: competitionChanged ? [] : state.games,
        allWeekGames: competitionChanged ? {} : state.allWeekGames,
        weekPicks: competitionChanged ? [] : state.weekPicks,
        leaderboard: [], // pool-scoped, always clear
        allUserScores: {}, // pool-scoped, always clear
        weekLeaderboard: [], // pool-scoped, always clear
        weekLeaderboardDisplayedWeek: null,
        userNames: state.userNames, // user-level, preserve
        isWeekComplete: false,
      };
    });

    // Leaderboards are fetched by SeasonBoardScreen's useEffect on poolId.
    // Don't fetch here — it causes a race condition with the component.
  },

  setCurrentWeek: (week: number) => {
    // Check cache first
    const cached = get().allWeekGames[week];
    if (cached) {
      // Cached → swap to the clicked week's games immediately, no flicker.
      set({currentWeek: week, isWeekComplete: false, games: cached});
    } else {
      // No cache yet → flag loading so the screen shows its spinner for the
      // clicked week, rather than leaving the previously-viewed week's games
      // on screen until fetchWeekGames resolves.
      set({currentWeek: week, isWeekComplete: false, isLoading: true});
    }
  },

  setWeekComplete: (val: boolean) => set({isWeekComplete: val}),

  fetchWeekGames: async (week: number, force = false) => {
    const {config} = get();
    if (!config) {
      // No config yet → never leave the screen stuck on its spinner.
      set({isLoading: false});
      return;
    }

    // Return cached if available, unless any game is in progress (scores are live)
    const cached = get().allWeekGames[week];
    const hasLiveGame = cached?.some(g => {
      const s = (g.status ?? '').toUpperCase();
      return s === 'IN_PROGRESS' || s === 'LIVE';
    });
    if (!force && cached && !hasLiveGame) {
      set({games: cached, isLoading: false});
      return;
    }

    set({isLoading: true});
    try {
      const {data} = await supabase
        .from('season_games')
        .select('*')
        .eq('competition', config.competition)
        .eq('week', week)
        .order('frozen_rank', {ascending: true});

      const games = (data as DbSeasonGame[]) ?? [];

      // Cache by week regardless; only swap `games` to this week's data
      // if the user is still viewing it.
      const after = get();
      const weekMatches = after.currentWeek === week;
      const compMatches = after.config?.competition === config.competition;

      set(state => ({
        games: weekMatches && compMatches ? games : state.games,
        allWeekGames: {...state.allWeekGames, [week]: games},
      }));
    } catch (err) {
      // A thrown/raced network fetch must never leave the spinner stuck —
      // the screen will just show no games rather than spin forever.
      console.warn('[seasonStore] fetchWeekGames failed', err);
    } finally {
      set({isLoading: false});
    }
  },

  fetchUserPicks: async (userId: string, week: number) => {
    const {config} = get();
    if (!config) {
      return;
    }

    const {data} = await supabase
      .from('season_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('competition', config.competition)
      .eq('week', week);

    const after = get();
    if (after.currentWeek !== week || after.config?.competition !== config.competition) return;

    const picks = (data as DbSeasonPick[]) ?? [];
    const hasHotPick = picks.some(p => p.is_hotpick);
    set({
      weekPicks: picks,
      isWeekComplete: picks.length > 0 && hasHotPick,
    });
  },

  savePick: async ({userId, gameId, pickedTeam, isHotPick}) => {
    const {config, weekPicks, currentWeek} = get();
    if (!config) {
      return;
    }

    // Enforce hotPicksPerWeek limit
    if (isHotPick) {
      const currentHotPicks = weekPicks.filter(p => p.is_hotpick);
      const isAlreadyHotPick = currentHotPicks.some(
        p => p.game_id === gameId,
      );
      if (!isAlreadyHotPick && currentHotPicks.length >= config.hotPicksPerWeek) {
        return; // At limit — reject
      }
    }

    const prevWeekPicks = weekPicks;

    // Optimistic: replace existing pick for this game or add new
    const optimisticPick: DbSeasonPick = {
      id: gameId,
      user_id: userId,
      game_id: gameId,
      competition: config.competition,
      season_year: get().seasonYear,
      week: currentWeek,
      picked_team: pickedTeam,
      is_hotpick: isHotPick,
      is_correct: null,
      points: null,
      sb_q1_leader: null,
      sb_q2_leader: null,
      sb_q3_leader: null,
      sb_margin_tier: null,
      power_up: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = prevWeekPicks.some(p => p.game_id === gameId)
      ? prevWeekPicks.map(p => (p.game_id === gameId ? optimisticPick : p))
      : [...prevWeekPicks, optimisticPick];

    set({weekPicks: updated, isSaving: true, saveError: null, isWeekComplete: false});

    const {error} = await supabase.from('season_picks').upsert(
      {
        user_id: userId,
        competition: config.competition,
        season_year: get().seasonYear,
        game_id: gameId,
        week: currentWeek,
        picked_team: pickedTeam,
        is_hotpick: isHotPick,
      },
      {onConflict: 'user_id,game_id'},
    );

    if (error) {
      // "Picks are locked for this game" (enforce_pick_lock, P0001) is EXPECTED:
      // the game locked between render and tap (status went live/final, or its
      // kickoff passed). Don't shout it in the console — show a friendly message
      // and force-refetch the week so the now-locked card updates and can't be
      // tapped again (closes the stale-state gap before realtime catches up).
      if (/picks are locked/i.test(error.message ?? '')) {
        console.warn('[savePick] game locked before save:', error.message);
        set({weekPicks: prevWeekPicks, saveError: "That game just locked — your pick wasn't saved."});
        get().fetchWeekGames(currentWeek, true);
      } else {
        console.error('[savePick] ERROR:', error.message, error.details, error.hint, JSON.stringify(error));
        set({weekPicks: prevWeekPicks, saveError: error.message});
      }
    }

    set({isSaving: false});
  },

  setHotPick: async ({userId, gameId}) => {
    const {config, weekPicks, currentWeek} = get();
    if (!config) return;

    const pick = weekPicks.find(p => p.game_id === gameId);
    if (!pick) return; // Must have a pick first

    // Already the hotpick — nothing to do
    if (pick.is_hotpick) return;

    const prevWeekPicks = weekPicks;

    // Optimistic: clear old hotpick, set new one
    const updated = weekPicks.map(p => ({
      ...p,
      is_hotpick: p.game_id === gameId,
    }));
    set({weekPicks: updated, isSaving: true, saveError: null, isWeekComplete: false});

    // Find old hotpick to clear in DB
    const oldHotPick = prevWeekPicks.find(p => p.is_hotpick && p.game_id !== gameId);

    // Clear old hotpick in DB
    if (oldHotPick) {
      const {error: clearError} = await supabase.from('season_picks').upsert(
        {
          user_id: userId,
          competition: config.competition,
          season_year: get().seasonYear,
          game_id: oldHotPick.game_id,
          week: currentWeek,
          picked_team: oldHotPick.picked_team,
          is_hotpick: false,
        },
        {onConflict: 'user_id,game_id'},
      );
      if (clearError) {
        set({weekPicks: prevWeekPicks, saveError: clearError.message, isSaving: false});
        return;
      }
    }

    // Set new hotpick in DB
    const {error} = await supabase.from('season_picks').upsert(
      {
        user_id: userId,
        competition: config.competition,
        season_year: get().seasonYear,
        game_id: gameId,
        week: currentWeek,
        picked_team: pick.picked_team,
        is_hotpick: true,
      },
      {onConflict: 'user_id,game_id'},
    );

    if (error) {
      set({weekPicks: prevWeekPicks, saveError: error.message});
    }
    set({isSaving: false});
  },

  fetchLeaderboard: async () => {
    const {config, poolId} = get();
    if (!config) {
      return;
    }

    set({isLoading: true});

    // Pool-independent: scores have no pool_id.
    // Regular season and playoffs are separate leaderboards.
    // Determine current phase from competition_config.

    // Step 0: Read current_phase and week_state from competition_config
    const {data: cfgRows} = await supabase
      .from('competition_config')
      .select('key, value')
      .eq('competition', config.competition)
      .in('key', ['current_phase', 'week_state', 'current_week']);

    const cfgMap = Object.fromEntries(
      (cfgRows ?? []).map((r: any) => [r.key, r.value]),
    );

    const currentPhase =
      typeof cfgMap.current_phase === 'string' ? cfgMap.current_phase : 'REGULAR';
    const isPlayoffs = currentPhase !== 'REGULAR';

    const weekState =
      typeof cfgMap.week_state === 'string' ? cfgMap.week_state : null;
    const weekInProgress =
      weekState === 'picks_open' || weekState === 'locked' || weekState === 'live';

    // Use the store's currentWeek (set during initialize) as the authoritative value.
    // Fall back to competition_config current_week if the store hasn't initialised yet.
    const currentWeek =
      get().currentWeek ||
      (typeof cfgMap.current_week === 'number' ? cfgMap.current_week : 1);

    // Step 1: Get ACTIVE pool member user IDs + pool_start_date in parallel.
    // All active members appear on the ladder EXCEPT super-admins — they are
    // hidden members (the hidden-member rule), matching the rank chip and
    // compute_pool_standings so the Ladder and the chip agree on a tie.
    const [membersResult, poolResult] = await Promise.all([
      supabase
        .from('pool_members')
        .select('user_id, profiles!inner(is_super_admin)')
        .eq('pool_id', poolId)
        .eq('status', 'active'),
      supabase
        .from('pools')
        .select('pool_start_date')
        .eq('id', poolId)
        .single(),
    ]);

    const memberRows = ((membersResult.data ?? []) as any[]).filter(m => {
      const prof = Array.isArray(m?.profiles) ? m.profiles[0] : m?.profiles;
      return !prof?.is_super_admin;
    });
    const memberIds = memberRows.map(m => m.user_id);
    if (memberIds.length === 0) {
      set({leaderboard: [], allUserScores: {}, userNames: {}, isLoading: false});
      return;
    }

    // Determine the first week that falls on or after pool_start_date.
    // This ensures mid-season pools start everyone at 0 for this pool's leaderboard.
    let startWeek = 1;
    if (poolResult.data?.pool_start_date) {
      const {data: firstGame} = await supabase
        .from('season_games')
        .select('week')
        .eq('competition', config.competition)
        .gte('kickoff_at', poolResult.data.pool_start_date)
        .order('kickoff_at', {ascending: true})
        .limit(1)
        .maybeSingle();
      if (firstGame?.week) {
        startWeek = firstGame.week;
      }
    }

    // Step 2: Fetch per-week totals filtered to current season phase
    let query = supabase
      .from('season_user_totals')
      .select('*')
      .eq('competition', config.competition)
      .in('user_id', memberIds)
      .gte('week', startWeek);

    if (isPlayoffs) {
      query = query.neq('phase', 'REGULAR');
    } else {
      query = query.eq('phase', 'REGULAR');
    }
    // Exclude the current week while games are in progress.
    // Season total only reflects fully settled weeks.
    if (weekInProgress) {
      query = query.neq('week', currentWeek);
    }

    const {data: totals} = await query;
    const rows = (totals as DbSeasonUserTotal[]) ?? [];

    // Step 3: Aggregate per user — sum week_points for the current phase
    const byUser: Record<string, SeasonLeaderboardEntry> = {};
    for (const row of rows) {
      if (!byUser[row.user_id]) {
        byUser[row.user_id] = {
          user_id: row.user_id,
          total_points: 0,
          correct_picks: 0,
          total_picks: 0,
          weekly_breakdown: {},
        };
      }
      const entry = byUser[row.user_id];
      entry.total_points += row.week_points;
      entry.correct_picks += row.correct_picks;
      entry.total_picks += row.total_picks;
      entry.weekly_breakdown[row.week] = row.week_points;
    }

    // Per-user map of every member's total so a user can always read their own
    // score via getUserScore.
    const allUserScores = byUser;

    const leaderboard = Object.values(byUser)
      .sort((a, b) => b.total_points - a.total_points);

    // Step 4: Fetch display names + avatars for all users on the leaderboard
    const userIds = leaderboard.map(s => s.user_id);
    let names: Record<string, string> = {};
    let avatars: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const {data: profiles} = await supabase
        .from('profiles')
        .select('id, poolie_name, first_name, last_name, avatar_key')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          names[p.id] = formatLeaderboardName(p);
          avatars[p.id] = p.avatar_key ?? null;
        }
      }
    }

    // Stable DISPLAY order within a tie: higher total_points first, then A→Z by
    // name. This orders the rows only — it never sets the rank NUMBER (that comes
    // from the server's co-ranked standing_rank below).
    leaderboard.sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return (names[a.user_id] ?? '').localeCompare(
        names[b.user_id] ?? '',
        undefined,
        {sensitivity: 'base'},
      );
    });

    // Co-ranked standing + tie marker from the canonical server function (Tie
    // Handling spec — the client never computes the displayed rank). Scoped to
    // the same weeks the displayed points include (settled weeks only). If the
    // call fails or hasn't been deployed yet, entries keep undefined ranks and
    // the screen falls back to a sequential index — no crash during rollout.
    const includedWeeks = rows.map(r => r.week);
    const throughWeek = includedWeeks.length ? Math.max(...includedWeeks) : null;
    const {data: standingRows} = await supabase.rpc('get_pool_standings', {
      p_pool_ids: [poolId],
      p_through_week: throughWeek,
    });
    const rankByUser: Record<string, {standing_rank: number; is_tied: boolean}> = {};
    for (const r of (standingRows ?? []) as Array<{
      user_id: string;
      standing_rank: number;
      is_tied: boolean;
    }>) {
      rankByUser[r.user_id] = {standing_rank: r.standing_rank, is_tied: r.is_tied};
    }
    for (const entry of leaderboard) {
      const sr = rankByUser[entry.user_id];
      entry.standing_rank = sr?.standing_rank;
      entry.is_tied = sr?.is_tied ?? false;
    }

    set({
      leaderboard,
      allUserScores,
      userNames: names,
      userAvatars: avatars,
      isLoading: false,
    });
  },

  loadRegularSeasonPodium: async (userId: string) => {
    const {config, poolId} = get();
    if (!config || !poolId) {
      set({regularSeasonPodium: [], regularSeasonUserPoints: null});
      return;
    }

    // Active pool members + pool_start_date (same scoping as fetchLeaderboard).
    const [membersResult, poolResult] = await Promise.all([
      supabase
        .from('pool_members')
        .select('user_id')
        .eq('pool_id', poolId)
        .eq('status', 'active'),
      supabase.from('pools').select('pool_start_date').eq('id', poolId).single(),
    ]);
    const memberIds = (membersResult.data ?? []).map((m: any) => m.user_id);
    if (memberIds.length === 0) {
      set({regularSeasonPodium: [], regularSeasonUserPoints: null});
      return;
    }

    let startWeek = 1;
    if (poolResult.data?.pool_start_date) {
      const {data: firstGame} = await supabase
        .from('season_games')
        .select('week')
        .eq('competition', config.competition)
        .gte('kickoff_at', poolResult.data.pool_start_date)
        .order('kickoff_at', {ascending: true})
        .limit(1)
        .maybeSingle();
      if (firstGame?.week) startWeek = firstGame.week;
    }

    // Always REGULAR phase — this is the regular-season final standings, shown
    // during REGULAR_COMPLETE/PLAYOFFS when the live leaderboard is playoff-scoped.
    const {data: totals} = await supabase
      .from('season_user_totals')
      .select('user_id, week_points')
      .eq('competition', config.competition)
      .in('user_id', memberIds)
      .eq('phase', 'REGULAR')
      .gte('week', startWeek);

    const byUser: Record<string, number> = {};
    for (const row of totals ?? []) {
      byUser[row.user_id] = (byUser[row.user_id] ?? 0) + (row.week_points ?? 0);
    }
    const userIds = Object.keys(byUser);
    if (userIds.length === 0) {
      set({regularSeasonPodium: [], regularSeasonUserPoints: null});
      return;
    }

    // Display names.
    const {data: profiles} = await supabase
      .from('profiles')
      .select('id, poolie_name, first_name, last_name')
      .in('id', userIds);
    const names: Record<string, string> = {};
    for (const p of profiles ?? []) names[p.id] = formatLeaderboardName(p);

    // Sort desc by points, ties A→Z (consistent with the Ladder).
    const sorted = userIds
      .map(id => ({user_id: id, display_name: names[id] ?? 'Player', total_points: byUser[id]}))
      .sort((a, b) =>
        b.total_points !== a.total_points
          ? b.total_points - a.total_points
          : a.display_name.localeCompare(b.display_name, undefined, {sensitivity: 'base'}),
      );

    const podium: PodiumEntry[] = sorted.slice(0, 3).map((e, i) => ({...e, rank: i + 1}));
    set({
      regularSeasonPodium: podium,
      regularSeasonUserPoints: byUser[userId] ?? 0,
    });
  },

  fetchWeekLeaderboard: async (week?: number) => {
    const {config, poolId, currentWeek} = get();
    if (!config) return;

    let targetWeek = week ?? currentWeek;

    // Week-tab fallback rule: when no explicit week is requested, show the
    // previously-scored week's leaderboard until the current week has data
    // worth showing. This keeps the Week tab from displaying an empty list
    // that fills one-row-at-a-time as poolies submit picks during picks_open.
    //
    // Primary signal: competition_config.week_state — source of truth.
    //   picks_open / locked  → show currentWeek - 1 (scored)
    //   live / settling / complete → show currentWeek (scoring in progress or done)
    // Secondary safety net: if season_user_totals has rows for currentWeek,
    // trust that and show currentWeek regardless of weekState.
    if (!week && currentWeek > 1) {
      const {data: cfgRow} = await supabase
        .from('competition_config')
        .select('value')
        .eq('competition', config.competition)
        .eq('key', 'week_state')
        .maybeSingle();

      const weekState =
        typeof cfgRow?.value === 'string' ? cfgRow.value : null;
      const currentWeekIsPrePlay =
        weekState === 'picks_open' || weekState === 'locked';

      if (currentWeekIsPrePlay) {
        // Safety net: if someone already has a totals row for currentWeek
        // (e.g. week was partially scored during testing) prefer the current
        // week so we don't hide real data.
        const {data: existingTotals} = await supabase
          .from('season_user_totals')
          .select('id')
          .eq('competition', config.competition)
          .eq('week', currentWeek)
          .limit(1);

        if (!existingTotals || existingTotals.length === 0) {
          targetWeek = currentWeek - 1;
        }
      }
    }

    // Step 1: Get ACTIVE pool member user IDs (never include removed/left).
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'active');

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    if (memberIds.length === 0) {
      set({weekLeaderboard: []});
      return;
    }
    // The pick-submissions RPC returns all active members; constrain the
    // unscored-picks pass below to this pool's membership.
    const memberIdSet = new Set(memberIds);

    // Step 2: Fetch week totals for this week
    const {data: totals} = await supabase
      .from('season_user_totals')
      .select('*')
      .eq('competition', config.competition)
      .eq('week', targetWeek)
      .in('user_id', memberIds);

    const rows = (totals as DbSeasonUserTotal[]) ?? [];

    // Step 3: Get HotPick data for ALL pool members via SECURITY DEFINER RPC.
    // Direct season_picks query is blocked by RLS (SELECT WHERE user_id = auth.uid()),
    // which means a plain .from('season_picks') call only returns the current user's
    // picks — other members' HotPick rows are silently filtered out. The RPC bypasses
    // RLS and returns every active member's hotpick pick for this week.
    const {data: pickSubmissions} = await supabase
      .rpc('get_pool_pick_submissions', {
        p_pool_id: poolId,
        p_competition: config.competition,
        p_week: targetWeek,
      });

    // Step 4: Fetch game details for all HotPick games from the RPC results
    const hotPickGameIds = [
      ...new Set(
        (pickSubmissions ?? [])
          .map((p: any) => p.hotpick_game_id)
          .filter(Boolean),
      ),
    ];
    let gameMap: Record<string, DbSeasonGame> = {};
    if (hotPickGameIds.length > 0) {
      const {data: games} = await supabase
        .from('season_games')
        .select('*')
        .in('game_id', hotPickGameIds);
      if (games) {
        for (const g of games as DbSeasonGame[]) {
          gameMap[g.game_id] = g;
        }
      }
    }

    // Step 5: Build hotpick lookup for ALL members from the RPC results.
    // gameRank = frozen_rank (locked at pick deadline) ?? live rank — used as the
    // badge number for users whose week hasn't scored yet (hotpick_rank in
    // season_user_totals is only written during scoring).
    const hotPickByUser: Record<
      string,
      {team: string; gameLabel: string; gameRank: number | null}
    > = {};
    for (const sub of pickSubmissions ?? []) {
      if (!sub.hotpick_team || !sub.hotpick_game_id) continue;
      const game = gameMap[sub.hotpick_game_id];
      if (game) {
        hotPickByUser[sub.user_id] = {
          team: sub.hotpick_team,
          gameLabel: `${game.away_team} @ ${game.home_team}`,
          gameRank: game.frozen_rank ?? game.rank ?? null,
        };
      }
    }

    // Step 6: Build week leaderboard entries — scored users first.
    // hotpick_rank: prefer the value written by the scoring function
    // (season_user_totals.hotpick_rank); fall back to the game's rank for
    // weeks that haven't scored yet so the badge always shows.
    const scoredUserIds = new Set(rows.map(r => r.user_id));
    const weekEntries: WeekLeaderboardEntry[] = rows.map(row => {
      const hp = hotPickByUser[row.user_id];
      return {
        user_id: row.user_id,
        week_points: row.week_points,
        correct_picks: row.correct_picks,
        total_picks: row.total_picks,
        hotpick_team: hp?.team ?? null,
        hotpick_game_label: hp?.gameLabel ?? null,
        hotpick_rank: row.hotpick_rank ?? hp?.gameRank ?? null,
        is_hotpick_correct: row.is_hotpick_correct,
        submitted_at: null,
      };
    });

    // Add unscored users who have submitted picks (present in RPC but not yet scored)
    for (const sub of pickSubmissions ?? []) {
      if (!memberIdSet.has(sub.user_id)) continue; // constrain to pool members
      if (!scoredUserIds.has(sub.user_id)) {
        const hp = hotPickByUser[sub.user_id];
        weekEntries.push({
          user_id: sub.user_id,
          week_points: 0,
          correct_picks: 0,
          total_picks: 0,
          hotpick_team: hp?.team ?? null,
          hotpick_game_label: hp?.gameLabel ?? null,
          hotpick_rank: hp?.gameRank ?? null,
          is_hotpick_correct: null,
          submitted_at: sub.submitted_at,
        });
      }
    }

    // Sort: scored users by week_points desc, unscored by submit time desc
    weekEntries.sort((a, b) => {
      // Scored users always above unscored
      if (a.week_points !== b.week_points) return b.week_points - a.week_points;
      // Among 0-point users, most recent submit first
      if (a.submitted_at && b.submitted_at) {
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      }
      return 0;
    });

    // Step 8: Fetch display names for all users on week leaderboard
    const allWeekUserIds = weekEntries.map(e => e.user_id);
    if (allWeekUserIds.length > 0) {
      const {data: profiles} = await supabase
        .from('profiles')
        .select('id, poolie_name, first_name, last_name, avatar_key')
        .in('id', allWeekUserIds);

      if (profiles) {
        const existingNames = get().userNames;
        const existingAvatars = get().userAvatars;
        const updatedNames = {...existingNames};
        const updatedAvatars = {...existingAvatars};
        for (const p of profiles) {
          updatedNames[p.id] = formatLeaderboardName(p);
          updatedAvatars[p.id] = p.avatar_key ?? null;
        }
        // Break ties alphabetically by display name now that names are known:
        // higher week_points first, then A→Z within equal scores.
        weekEntries.sort((a, b) => {
          if (b.week_points !== a.week_points) return b.week_points - a.week_points;
          return (updatedNames[a.user_id] ?? '').localeCompare(
            updatedNames[b.user_id] ?? '',
            undefined,
            {sensitivity: 'base'},
          );
        });
        set({
          weekLeaderboard: weekEntries,
          weekLeaderboardDisplayedWeek: targetWeek,
          userNames: updatedNames,
          userAvatars: updatedAvatars,
        });
        return;
      }
    }

    set({
      weekLeaderboard: weekEntries,
      weekLeaderboardDisplayedWeek: targetWeek,
    });
  },

  getPickForGame: (gameId: string) => {
    const {weekPicks} = get();
    return weekPicks.find(p => p.game_id === gameId);
  },

  getPickCount: () => {
    const {weekPicks} = get();
    return weekPicks.length;
  },

  getHotPickCount: () => {
    const {weekPicks} = get();
    return weekPicks.filter(p => p.is_hotpick).length;
  },

  getUserScore: (userId: string) => {
    const {leaderboard, allUserScores} = get();
    // Prefer the displayed ladder; fall back to the full per-user map.
    return leaderboard.find(s => s.user_id === userId) ?? allUserScores[userId];
  },

  subscribeToGameScores: () => {
    const {config, currentWeek} = get();
    if (!config) return () => {};

    const id = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`game-scores-${config.competition}-week${currentWeek}-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'season_games',
          filter: `competition=eq.${config.competition}`,
        },
        (payload: any) => {
          const updated = payload.new as DbSeasonGame;
          if (updated.week !== currentWeek) return;
          set(state => {
            const newGames = state.games.map(g =>
              g.game_id === updated.game_id ? {...g, ...updated} : g,
            );
            return {
              games: newGames,
              allWeekGames: {...state.allWeekGames, [currentWeek]: newGames},
            };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  applyDemoReveal: picks => {
    const pmap = new Map(picks.map(p => [p.game_id, p]));
    set(state => {
      const games = state.games.map(g => ({...g, status: 'FINAL'}));
      const weekPicks = state.weekPicks.map(p => {
        const r = pmap.get(p.game_id);
        return r ? {...p, is_correct: r.is_correct, points: r.points} : p;
      });
      return {
        games,
        weekPicks,
        allWeekGames: {...state.allWeekGames, [state.currentWeek]: games},
        isWeekComplete: true,
      };
    });
  },

  resetDemoGames: async () => {
    // Self-contained clean reload of the demo week. Hardcodes the competition
    // so it works even when called on demo entry before the store has
    // re-initialized for the demo, and so it never returns a FINAL-patched
    // cache from a prior run. Restores the scheduled (pickable) games and
    // clears picks — a clean slate for a fresh demo run.
    set({allWeekGames: {}, weekPicks: [], isWeekComplete: false, currentWeek: 1});
    const {data} = await supabase
      .from('season_games')
      .select('*')
      .eq('competition', 'nfl_demo')
      .eq('week', 1)
      .order('frozen_rank', {ascending: true});
    const games = (data as DbSeasonGame[]) ?? [];
    set({games, allWeekGames: {1: games}});
  },
}));
