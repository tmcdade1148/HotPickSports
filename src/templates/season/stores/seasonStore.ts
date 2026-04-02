import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {SeasonConfig} from '@shared/types/templates';
import type {
  DbSeasonGame,
  DbSeasonPick,
  DbSeasonUserTotal,
} from '@shared/types/database';

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

interface SeasonState {
  config: SeasonConfig | null;
  poolId: string;
  currentWeek: number;
  seasonYear: number;
  games: DbSeasonGame[];
  allWeekGames: Record<number, DbSeasonGame[]>;
  weekPicks: DbSeasonPick[];
  leaderboard: SeasonLeaderboardEntry[];
  weekLeaderboard: WeekLeaderboardEntry[];
  /** Map of user_id -> display_name for leaderboard display */
  userNames: Record<string, string>;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  initialize: (config: SeasonConfig, poolId: string) => Promise<void>;
  setCurrentWeek: (week: number) => void;
  fetchWeekGames: (week: number) => Promise<void>;
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
  weekLeaderboard: [],
  userNames: {},
  isLoading: false,
  isSaving: false,
  saveError: null,
  isWeekComplete: false,

  initialize: async (config, poolId) => {
    // Skip if already initialized for this competition + pool
    const state = get();
    if (state.config?.competition === config.competition && state.poolId === poolId && state.currentWeek > 0) {
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

    set(state => ({
      config,
      poolId,
      currentWeek,
      seasonYear,
      games: [],
      allWeekGames: {},
      weekPicks: [],
      leaderboard: [],
      weekLeaderboard: [], // clear to force re-render when new data arrives
      userNames: state.userNames, // preserve — names are user-level, not pool-scoped
      isWeekComplete: false,
    }));

    // Leaderboards are fetched by SeasonBoardScreen's useEffect on poolId.
    // Don't fetch here — it causes a race condition with the component.
  },

  setCurrentWeek: (week: number) => {
    set({currentWeek: week, isWeekComplete: false});
    // Check cache first
    const cached = get().allWeekGames[week];
    if (cached) {
      set({games: cached});
    }
  },

  setWeekComplete: (val: boolean) => set({isWeekComplete: val}),

  fetchWeekGames: async (week: number) => {
    const {config} = get();
    if (!config) {
      return;
    }

    // Return cached if available, unless any game is in progress (scores are live)
    const cached = get().allWeekGames[week];
    const hasLiveGame = cached?.some(g => {
      const s = (g.status ?? '').toUpperCase();
      return s === 'IN_PROGRESS' || s === 'LIVE';
    });
    if (cached && !hasLiveGame) {
      set({games: cached});
      return;
    }

    set({isLoading: true});
    const {data} = await supabase
      .from('season_games')
      .select('*')
      .eq('competition', config.competition)
      .eq('week', week)
      .order('frozen_rank', {ascending: true});

    const games = (data as DbSeasonGame[]) ?? [];

    set(state => ({
      games,
      allWeekGames: {...state.allWeekGames, [week]: games},
      isLoading: false,
    }));
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
      console.error('[savePick] ERROR:', error.message, error.details, error.hint, JSON.stringify(error));
      set({weekPicks: prevWeekPicks, saveError: error.message});
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

    // Step 1: Get ACTIVE pool member user IDs (never include removed/left)
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'active');

    const memberIds = (members ?? []).map(m => m.user_id);
    if (memberIds.length === 0) {
      set({leaderboard: [], userNames: {}, isLoading: false});
      return;
    }

    // Step 2: Fetch per-week totals filtered to current season phase
    let query = supabase
      .from('season_user_totals')
      .select('*')
      .eq('competition', config.competition)
      .in('user_id', memberIds);

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

    // Sort descending by total_points
    const leaderboard = Object.values(byUser).sort(
      (a, b) => b.total_points - a.total_points,
    );

    // Step 4: Fetch display names for all users on the leaderboard
    const userIds = leaderboard.map(s => s.user_id);
    let names: Record<string, string> = {};
    if (userIds.length > 0) {
      const {data: profiles} = await supabase
        .from('profiles')
        .select('id, poolie_name, first_name, last_name')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          names[p.id] = p.poolie_name
            || (p.first_name ? `${p.first_name}${p.last_name ? ` ${p.last_name.charAt(0)}.` : ''}` : 'Player');
        }
      }
    }

    set({
      leaderboard,
      userNames: names,
      isLoading: false,
    });
  },

  fetchWeekLeaderboard: async (week?: number) => {
    const {config, poolId, currentWeek} = get();
    if (!config) return;

    let targetWeek = week ?? currentWeek;

    // If no explicit week requested, check if current week has any live/final games
    // If not, show previous week's leaderboard until games kick off
    if (!week && currentWeek > 1) {
      const {data: liveGames} = await supabase
        .from('season_games')
        .select('game_id')
        .eq('competition', config.competition)
        .eq('week', currentWeek)
        .in('status', ['in_progress', 'final', 'live'])
        .limit(1);

      if (!liveGames || liveGames.length === 0) {
        // Also check if anyone has scores for current week
        const {data: weekScores} = await supabase
          .from('season_user_totals')
          .select('id')
          .eq('competition', config.competition)
          .eq('week', currentWeek)
          .limit(1);

        if (!weekScores || weekScores.length === 0) {
          targetWeek = currentWeek - 1;
        }
      }
    }

    // Step 1: Get ACTIVE pool member user IDs (never include removed/left)
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'active');

    const memberIds = (members ?? []).map(m => m.user_id);
    if (memberIds.length === 0) {
      set({weekLeaderboard: []});
      return;
    }

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
        .select('id, poolie_name, first_name, last_name')
        .in('id', allWeekUserIds);

      if (profiles) {
        const existingNames = get().userNames;
        const updatedNames = {...existingNames};
        for (const p of profiles) {
          updatedNames[p.id] = p.poolie_name
            || (p.first_name ? `${p.first_name}${p.last_name ? ` ${p.last_name.charAt(0)}.` : ''}` : 'Player');
        }
        set({weekLeaderboard: weekEntries, userNames: updatedNames});
        return;
      }
    }

    set({weekLeaderboard: weekEntries});
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
    const {leaderboard} = get();
    return leaderboard.find(s => s.user_id === userId);
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
}));
