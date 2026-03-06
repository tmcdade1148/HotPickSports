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

interface SeasonState {
  config: SeasonConfig | null;
  poolId: string;
  currentWeek: number;
  games: DbSeasonGame[];
  allWeekGames: Record<number, DbSeasonGame[]>;
  weekPicks: DbSeasonPick[];
  leaderboard: SeasonLeaderboardEntry[];
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
  fetchLeaderboard: () => Promise<void>;

  // Selectors
  getPickForGame: (gameId: string) => DbSeasonPick | undefined;
  getHotPickCount: () => number;
  getUserScore: (userId: string) => SeasonLeaderboardEntry | undefined;
}

export const useSeasonStore = create<SeasonState>((set, get) => ({
  config: null,
  poolId: '',
  currentWeek: 1,
  games: [],
  allWeekGames: {},
  weekPicks: [],
  leaderboard: [],
  userNames: {},
  isLoading: false,
  isSaving: false,
  saveError: null,

  initialize: async (config, poolId) => {
    // Read current_week from competition_config (never hardcode)
    const {data: cfgRow} = await supabase
      .from('competition_config')
      .select('value')
      .eq('competition', config.competition)
      .eq('key', 'current_week')
      .maybeSingle();

    const currentWeek =
      typeof cfgRow?.value === 'number' ? cfgRow.value : 1;

    set({
      config,
      poolId,
      currentWeek,
      games: [],
      allWeekGames: {},
      weekPicks: [],
      leaderboard: [],
      userNames: {},
    });
  },

  setCurrentWeek: (week: number) => {
    set({currentWeek: week});
    // Check cache first
    const cached = get().allWeekGames[week];
    if (cached) {
      set({games: cached});
    }
  },

  fetchWeekGames: async (week: number) => {
    const {config} = get();
    if (!config) {
      return;
    }

    // Return cached if available
    const cached = get().allWeekGames[week];
    if (cached) {
      set({games: cached});
      return;
    }

    set({isLoading: true});
    const {data} = await supabase
      .from('season_games')
      .select('*')
      .eq('competition', config.competition)
      .eq('week', week)
      .order('rank', {ascending: false});

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

    set({weekPicks: (data as DbSeasonPick[]) ?? []});
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
      season_year: new Date().getFullYear(),
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

    set({weekPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('season_picks').upsert(
      {
        user_id: userId,
        competition: config.competition,
        game_id: gameId,
        week: currentWeek,
        picked_team: pickedTeam,
        is_hotpick: isHotPick,
      },
      {onConflict: 'user_id,competition,game_id'},
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

    // Step 0: Read current_phase from competition_config
    const {data: cfgRows} = await supabase
      .from('competition_config')
      .select('value')
      .eq('competition', config.competition)
      .eq('key', 'current_phase')
      .maybeSingle();

    const currentPhase =
      typeof cfgRows?.value === 'string' ? cfgRows.value : 'REGULAR';
    const isPlayoffs = currentPhase !== 'REGULAR';

    // Step 1: Get pool member user IDs
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId);

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
        .select('id, display_name')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          if (p.display_name) {
            names[p.id] = p.display_name;
          }
        }
      }
    }

    set({
      leaderboard,
      userNames: names,
      isLoading: false,
    });
  },

  getPickForGame: (gameId: string) => {
    const {weekPicks} = get();
    return weekPicks.find(p => p.game_id === gameId);
  },

  getHotPickCount: () => {
    const {weekPicks} = get();
    return weekPicks.filter(p => p.is_hotpick).length;
  },

  getUserScore: (userId: string) => {
    const {leaderboard} = get();
    return leaderboard.find(s => s.user_id === userId);
  },
}));
