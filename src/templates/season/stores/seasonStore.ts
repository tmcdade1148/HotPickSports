import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {SeasonConfig} from '@shared/types/templates';
import type {
  DbSeasonMatch,
  DbSeasonPick,
  DbSeasonScore,
} from '@shared/types/database';
import {calculateWeekPoints, calculateSeasonTotal} from '../services/seasonScoring';

interface SeasonState {
  config: SeasonConfig | null;
  poolId: string;
  currentWeek: number;
  matches: DbSeasonMatch[];
  allWeekMatches: Record<number, DbSeasonMatch[]>;
  weekPicks: DbSeasonPick[];
  leaderboard: DbSeasonScore[];
  /** Map of user_id -> display_name for leaderboard display */
  userNames: Record<string, string>;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  initialize: (config: SeasonConfig, poolId: string) => void;
  setCurrentWeek: (week: number) => void;
  fetchWeekMatches: (week: number) => Promise<void>;
  fetchUserPicks: (userId: string, week: number) => Promise<void>;
  savePick: (params: {
    userId: string;
    matchId: string;
    pickedOutcome: string;
    isHotPick: boolean;
  }) => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
  calculateMyScore: (userId: string) => Promise<void>;

  // Selectors
  getPickForMatch: (matchId: string) => DbSeasonPick | undefined;
  getHotPickCount: () => number;
  getUserScore: (userId: string) => DbSeasonScore | undefined;
}

export const useSeasonStore = create<SeasonState>((set, get) => ({
  config: null,
  poolId: '',
  currentWeek: 1,
  matches: [],
  allWeekMatches: {},
  weekPicks: [],
  leaderboard: [],
  userNames: {},
  isLoading: false,
  isSaving: false,
  saveError: null,

  initialize: (config, poolId) =>
    set({
      config,
      poolId,
      currentWeek: 1,
      matches: [],
      allWeekMatches: {},
      weekPicks: [],
      leaderboard: [],
      userNames: {},
    }),

  setCurrentWeek: (week: number) => {
    set({currentWeek: week});
    // Check cache first
    const cached = get().allWeekMatches[week];
    if (cached) {
      set({matches: cached});
    }
  },

  fetchWeekMatches: async (week: number) => {
    const {config} = get();
    if (!config) {
      return;
    }

    // Return cached if available
    const cached = get().allWeekMatches[week];
    if (cached) {
      set({matches: cached});
      return;
    }

    set({isLoading: true});
    const {data} = await supabase
      .from('season_matches')
      .select('*')
      .eq('event_id', config.eventId)
      .eq('week', week)
      .order('rank', {ascending: false});

    const matches = (data as DbSeasonMatch[]) ?? [];

    set(state => ({
      matches,
      allWeekMatches: {...state.allWeekMatches, [week]: matches},
      isLoading: false,
    }));
  },

  fetchUserPicks: async (userId: string, week: number) => {
    const {config, matches} = get();
    if (!config) {
      return;
    }

    // Get match IDs for this week to filter picks
    const matchIds = matches.map(m => m.id);
    if (matchIds.length === 0) {
      set({weekPicks: []});
      return;
    }

    const {data} = await supabase
      .from('season_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', config.eventId)
      .in('match_id', matchIds);

    set({weekPicks: (data as DbSeasonPick[]) ?? []});
  },

  savePick: async ({userId, matchId, pickedOutcome, isHotPick}) => {
    const {config, weekPicks} = get();
    if (!config) {
      return;
    }

    // Enforce hotPicksPerWeek limit
    if (isHotPick) {
      const currentHotPicks = weekPicks.filter(p => p.is_hot_pick);
      const isAlreadyHotPick = currentHotPicks.some(
        p => p.match_id === matchId,
      );
      if (!isAlreadyHotPick && currentHotPicks.length >= config.hotPicksPerWeek) {
        return; // At limit — reject
      }
    }

    const prevWeekPicks = weekPicks;

    // Optimistic: replace existing pick for this match or add new
    const optimisticPick: DbSeasonPick = {
      id: matchId,
      user_id: userId,
      event_id: config.eventId,
      match_id: matchId,
      picked_outcome: pickedOutcome,
      is_hot_pick: isHotPick,
      created_at: new Date().toISOString(),
    };

    const updated = prevWeekPicks.some(p => p.match_id === matchId)
      ? prevWeekPicks.map(p => (p.match_id === matchId ? optimisticPick : p))
      : [...prevWeekPicks, optimisticPick];

    set({weekPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('season_picks').upsert(
      {
        user_id: userId,
        event_id: config.eventId,
        match_id: matchId,
        picked_outcome: pickedOutcome,
        is_hot_pick: isHotPick,
      },
      {onConflict: 'user_id,event_id,match_id'},
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
    // Leaderboard is built by joining season_scores with pool_members
    // so any pool created mid-season immediately shows all members' scores.
    const {data} = await supabase
      .from('season_scores')
      .select('*, pool_members!inner(user_id)')
      .eq('event_id', config.eventId)
      .eq('pool_members.pool_id', poolId)
      .order('total_points', {ascending: false});

    const scores = (data as (DbSeasonScore & {pool_members: unknown})[]) ?? [];
    // Strip the join artifact before storing
    const cleanScores: DbSeasonScore[] = scores.map(
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
      .from('season_picks')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', config.eventId);

    const picks = (allPicks as DbSeasonPick[]) ?? [];

    // Fetch ALL matches for this event
    const {data: allMatches} = await supabase
      .from('season_matches')
      .select('*')
      .eq('event_id', config.eventId);

    const matches = (allMatches as DbSeasonMatch[]) ?? [];

    // Group matches by week
    const matchesByWeek: Record<number, DbSeasonMatch[]> = {};
    for (const m of matches) {
      if (!matchesByWeek[m.week]) {
        matchesByWeek[m.week] = [];
      }
      matchesByWeek[m.week].push(m);
    }

    // Calculate points per week
    const weeklyBreakdown: Record<string, number> = {};
    for (const weekStr of Object.keys(matchesByWeek)) {
      const week = Number(weekStr);
      const weekMatches = matchesByWeek[week];
      const weekMatchIds = weekMatches.map(m => m.id);
      const weekPicks = picks.filter(p => weekMatchIds.includes(p.match_id));

      if (weekPicks.length > 0) {
        weeklyBreakdown[weekStr] = calculateWeekPoints(
          weekPicks,
          weekMatches,
          config,
        );
      }
    }

    const totalPoints = calculateSeasonTotal(weeklyBreakdown);

    // Determine rank
    const {leaderboard} = get();
    const rank =
      leaderboard.filter(s => s.total_points > totalPoints).length + 1;

    await supabase.from('season_scores').upsert(
      {
        user_id: userId,
        event_id: config.eventId,
        total_points: totalPoints,
        weekly_breakdown: weeklyBreakdown,
        rank,
        last_calculated: new Date().toISOString(),
      },
      {onConflict: 'user_id,event_id'},
    );

    // Re-fetch leaderboard to get updated data
    await get().fetchLeaderboard();
  },

  getPickForMatch: (matchId: string) => {
    const {weekPicks} = get();
    return weekPicks.find(p => p.match_id === matchId);
  },

  getHotPickCount: () => {
    const {weekPicks} = get();
    return weekPicks.filter(p => p.is_hot_pick).length;
  },

  getUserScore: (userId: string) => {
    const {leaderboard} = get();
    return leaderboard.find(s => s.user_id === userId);
  },
}));
