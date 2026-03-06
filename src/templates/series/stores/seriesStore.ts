import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {SeriesConfig} from '@shared/types/templates';
import type {
  DbSeriesMatchup,
  DbSeriesPick,
  DbSeriesUserTotal,
} from '@shared/types/database';

interface SeriesState {
  config: SeriesConfig | null;
  poolId: string;
  currentRound: number; // index into config.rounds
  matchups: DbSeriesMatchup[];
  allRoundMatchups: Record<string, DbSeriesMatchup[]>;
  roundPicks: DbSeriesPick[];
  leaderboard: DbSeriesUserTotal[];
  /** Map of user_id -> display_name for leaderboard display */
  userNames: Record<string, string>;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  initialize: (config: SeriesConfig, poolId: string) => void;
  setCurrentRound: (index: number) => void;
  fetchRoundMatchups: (roundKey: string) => Promise<void>;
  fetchUserPicks: (userId: string, roundKey: string) => Promise<void>;
  savePick: (params: {
    userId: string;
    seriesId: string;
    pickedWinner: string;
    pickedSeriesLength: number;
    isHotPick: boolean;
  }) => Promise<void>;
  fetchLeaderboard: () => Promise<void>;

  // Selectors
  getPickForMatchup: (seriesId: string) => DbSeriesPick | undefined;
  getUserScore: (userId: string) => DbSeriesUserTotal | undefined;
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  config: null,
  poolId: '',
  currentRound: 0,
  matchups: [],
  allRoundMatchups: {},
  roundPicks: [],
  leaderboard: [],
  userNames: {},
  isLoading: false,
  isSaving: false,
  saveError: null,

  initialize: (config, poolId) =>
    set({
      config,
      poolId,
      currentRound: 0,
      matchups: [],
      allRoundMatchups: {},
      roundPicks: [],
      leaderboard: [],
      userNames: {},
    }),

  setCurrentRound: (index: number) => {
    const {config} = get();
    if (!config || index < 0 || index >= config.rounds.length) {
      return;
    }
    set({currentRound: index});
    // Check cache
    const roundKey = config.rounds[index].key;
    const cached = get().allRoundMatchups[roundKey];
    if (cached) {
      set({matchups: cached});
    }
  },

  fetchRoundMatchups: async (roundKey: string) => {
    const {config} = get();
    if (!config) {
      return;
    }

    // Return cached if available
    const cached = get().allRoundMatchups[roundKey];
    if (cached) {
      set({matchups: cached});
      return;
    }

    set({isLoading: true});
    const {data} = await supabase
      .from('series_matchups')
      .select('*')
      .eq('competition', config.competition)
      .eq('round', roundKey);

    const matchups = (data as DbSeriesMatchup[]) ?? [];

    set(state => ({
      matchups,
      allRoundMatchups: {...state.allRoundMatchups, [roundKey]: matchups},
      isLoading: false,
    }));
  },

  fetchUserPicks: async (userId: string, roundKey: string) => {
    const {config, matchups} = get();
    if (!config) {
      return;
    }

    const seriesIds = matchups.map(m => m.series_id);
    if (seriesIds.length === 0) {
      set({roundPicks: []});
      return;
    }

    const {data} = await supabase
      .from('series_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('competition', config.competition)
      .in('series_id', seriesIds);

    set({roundPicks: (data as DbSeriesPick[]) ?? []});
  },

  savePick: async ({userId, seriesId, pickedWinner, pickedSeriesLength, isHotPick}) => {
    const {config, roundPicks, currentRound} = get();
    if (!config) {
      return;
    }

    const roundKey = config.rounds[currentRound]?.key ?? '';
    const prevRoundPicks = roundPicks;

    // Optimistic: replace existing pick for this series or add new
    const optimisticPick: DbSeriesPick = {
      id: seriesId,
      user_id: userId,
      series_id: seriesId,
      competition: config.competition,
      round: roundKey,
      picked_winner: pickedWinner,
      picked_series_length: pickedSeriesLength,
      is_hotpick: isHotPick,
      is_winner_correct: null,
      is_length_correct: null,
      points: null,
      power_up: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = prevRoundPicks.some(p => p.series_id === seriesId)
      ? prevRoundPicks.map(p =>
          p.series_id === seriesId ? optimisticPick : p,
        )
      : [...prevRoundPicks, optimisticPick];

    set({roundPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('series_picks').upsert(
      {
        user_id: userId,
        series_id: seriesId,
        competition: config.competition,
        round: roundKey,
        picked_winner: pickedWinner,
        picked_series_length: pickedSeriesLength,
        is_hotpick: isHotPick,
      },
      {onConflict: 'user_id,series_id'},
    );

    if (error) {
      set({roundPicks: prevRoundPicks, saveError: error.message});
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
    // Leaderboard is built by joining series_user_totals with pool_members
    // so any pool created mid-playoffs immediately shows all members' scores.
    //
    // series_user_totals has one row per user per round. We fetch all rows
    // and then derive the latest cumulative_points per user client-side.
    const {data} = await supabase
      .from('series_user_totals')
      .select('*, pool_members!inner(user_id)')
      .eq('competition', config.competition)
      .eq('pool_members.pool_id', poolId)
      .order('cumulative_points', {ascending: false});

    const rows = (data as (DbSeriesUserTotal & {pool_members: unknown})[]) ?? [];

    // Strip the join artifact and deduplicate to latest round per user.
    // The latest round row has the highest cumulative_points for a given user.
    const latestByUser = new Map<string, DbSeriesUserTotal>();
    for (const {pool_members: _pm, ...row} of rows) {
      const existing = latestByUser.get(row.user_id);
      if (!existing || row.cumulative_points > existing.cumulative_points) {
        latestByUser.set(row.user_id, row);
      }
    }

    const leaderboard = Array.from(latestByUser.values()).sort(
      (a, b) => b.cumulative_points - a.cumulative_points,
    );

    // Fetch display names for all users on the leaderboard
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

  getPickForMatchup: (seriesId: string) => {
    const {roundPicks} = get();
    return roundPicks.find(p => p.series_id === seriesId);
  },

  getUserScore: (userId: string) => {
    const {leaderboard} = get();
    return leaderboard.find(s => s.user_id === userId);
  },
}));
