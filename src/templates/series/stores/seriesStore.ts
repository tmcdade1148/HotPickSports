import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {SeriesConfig} from '@shared/types/templates';
import type {
  DbSeriesMatchup,
  DbSeriesPick,
  DbSeriesScore,
} from '@shared/types/database';
import {calculateRoundPoints, calculateSeriesTotalScore} from '../services/seriesScoring';

interface SeriesState {
  config: SeriesConfig | null;
  poolId: string;
  currentRound: number; // index into config.rounds
  matchups: DbSeriesMatchup[];
  allRoundMatchups: Record<string, DbSeriesMatchup[]>;
  roundPicks: DbSeriesPick[];
  leaderboard: DbSeriesScore[];
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
    matchupId: string;
    pickedTeamCode: string;
    predictedGames: number;
    isHotPick: boolean;
  }) => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
  calculateMyScore: (userId: string) => Promise<void>;

  // Selectors
  getPickForMatchup: (matchupId: string) => DbSeriesPick | undefined;
  getUserScore: (userId: string) => DbSeriesScore | undefined;
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
      .eq('event_id', config.eventId)
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

    const matchupIds = matchups.map(m => m.id);
    if (matchupIds.length === 0) {
      set({roundPicks: []});
      return;
    }

    const {data} = await supabase
      .from('series_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', config.eventId)
      .in('matchup_id', matchupIds);

    set({roundPicks: (data as DbSeriesPick[]) ?? []});
  },

  savePick: async ({userId, matchupId, pickedTeamCode, predictedGames, isHotPick}) => {
    const {config, roundPicks} = get();
    if (!config) {
      return;
    }

    const prevRoundPicks = roundPicks;

    // Optimistic: replace existing pick for this matchup or add new
    const optimisticPick: DbSeriesPick = {
      id: matchupId,
      user_id: userId,
      event_id: config.eventId,
      matchup_id: matchupId,
      picked_team_code: pickedTeamCode,
      predicted_games: predictedGames,
      is_hot_pick: isHotPick,
      created_at: new Date().toISOString(),
    };

    const updated = prevRoundPicks.some(p => p.matchup_id === matchupId)
      ? prevRoundPicks.map(p =>
          p.matchup_id === matchupId ? optimisticPick : p,
        )
      : [...prevRoundPicks, optimisticPick];

    set({roundPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('series_picks').upsert(
      {
        user_id: userId,
        event_id: config.eventId,
        matchup_id: matchupId,
        picked_team_code: pickedTeamCode,
        predicted_games: predictedGames,
        is_hot_pick: isHotPick,
      },
      {onConflict: 'user_id,event_id,matchup_id'},
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
    // Leaderboard is built by joining series_scores with pool_members
    // so any pool created mid-playoffs immediately shows all members' scores.
    const {data} = await supabase
      .from('series_scores')
      .select('*, pool_members!inner(user_id)')
      .eq('event_id', config.eventId)
      .eq('pool_members.pool_id', poolId)
      .order('total_points', {ascending: false});

    const scores = (data as (DbSeriesScore & {pool_members: unknown})[]) ?? [];
    // Strip the join artifact before storing
    const cleanScores: DbSeriesScore[] = scores.map(
      ({pool_members: _pm, ...rest}) => rest,
    );

    // Fetch display names for all users on the leaderboard
    const userIds = cleanScores.map(s => s.user_id);
    let names: Record<string, string> = {};
    if (userIds.length > 0) {
      const {data: users} = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds);

      if (users) {
        for (const u of users) {
          if (u.display_name) {
            names[u.id] = u.display_name;
          }
        }
      }
    }

    set({
      leaderboard: cleanScores,
      userNames: names,
      isLoading: false,
    });
  },

  calculateMyScore: async (userId: string) => {
    const {config} = get();
    if (!config) {
      return;
    }

    // Fetch ALL picks for this user/event (pool-independent)
    const {data: allPicks} = await supabase
      .from('series_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', config.eventId);

    const picks = (allPicks as DbSeriesPick[]) ?? [];

    // Fetch ALL matchups for this event
    const {data: allMatchups} = await supabase
      .from('series_matchups')
      .select('*')
      .eq('event_id', config.eventId);

    const matchups = (allMatchups as DbSeriesMatchup[]) ?? [];

    // Group matchups by round
    const matchupsByRound: Record<string, DbSeriesMatchup[]> = {};
    for (const m of matchups) {
      if (!matchupsByRound[m.round]) {
        matchupsByRound[m.round] = [];
      }
      matchupsByRound[m.round].push(m);
    }

    // Calculate points per round
    const roundBreakdown: Record<string, number> = {};
    for (const roundConfig of config.rounds) {
      const roundMatchups = matchupsByRound[roundConfig.key] ?? [];
      const matchupIds = roundMatchups.map(m => m.id);
      const roundPicks = picks.filter(p =>
        matchupIds.includes(p.matchup_id),
      );

      if (roundPicks.length > 0) {
        roundBreakdown[roundConfig.key] = calculateRoundPoints(
          roundPicks,
          roundMatchups,
          roundConfig,
          config,
        );
      }
    }

    const totalPoints = calculateSeriesTotalScore(roundBreakdown);

    // Determine rank
    const {leaderboard} = get();
    const rank =
      leaderboard.filter(s => s.total_points > totalPoints).length + 1;

    await supabase.from('series_scores').upsert(
      {
        user_id: userId,
        event_id: config.eventId,
        total_points: totalPoints,
        round_breakdown: roundBreakdown,
        rank,
        last_calculated: new Date().toISOString(),
      },
      {onConflict: 'user_id,event_id'},
    );

    // Re-fetch leaderboard to get updated data
    await get().fetchLeaderboard();
  },

  getPickForMatchup: (matchupId: string) => {
    const {roundPicks} = get();
    return roundPicks.find(p => p.matchup_id === matchupId);
  },

  getUserScore: (userId: string) => {
    const {leaderboard} = get();
    return leaderboard.find(s => s.user_id === userId);
  },
}));
