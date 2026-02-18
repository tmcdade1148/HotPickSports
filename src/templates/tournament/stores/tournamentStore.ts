import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {TournamentConfig} from '@shared/types/templates';
import type {
  DbTournamentMatch,
  DbTournamentPick,
  DbTournamentScore,
} from '@shared/types/database';
import {calculateTotalScore} from '../services/tournamentScoring';

interface TournamentState {
  config: TournamentConfig | null;
  poolId: string;
  matches: DbTournamentMatch[];
  groupPicks: DbTournamentPick[];
  matchPicks: DbTournamentPick[];
  leaderboard: DbTournamentScore[];
  /** Map of user_id → display_name for leaderboard/chat display */
  userNames: Record<string, string>;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  initialize: (config: TournamentConfig, poolId: string) => void;
  fetchMatches: () => Promise<void>;
  fetchUserPicks: (userId: string) => Promise<void>;

  // Write actions — poolId comes from store state
  saveGroupPick: (params: {
    userId: string;
    groupName: string;
    teamCode: string;
    selected: boolean;
  }) => Promise<void>;

  saveMatchPick: (params: {
    userId: string;
    matchId: string;
    teamCode: string;
    isHotPick: boolean;
  }) => Promise<void>;

  // Leaderboard + scoring — poolId comes from store state
  fetchLeaderboard: () => Promise<void>;
  calculateMyScore: (userId: string) => Promise<void>;

  // Selectors
  getGroupPickCodes: (groupName: string) => string[];
  getMatchPick: (matchId: string) => DbTournamentPick | undefined;
  getUserScore: (userId: string) => DbTournamentScore | undefined;
}

export const useTournamentStore = create<TournamentState>((set, get) => ({
  config: null,
  poolId: '',
  matches: [],
  groupPicks: [],
  matchPicks: [],
  leaderboard: [],
  userNames: {},
  isLoading: false,
  isSaving: false,
  saveError: null,

  initialize: (config, poolId) =>
    set({config, poolId, groupPicks: [], matchPicks: [], leaderboard: [], userNames: {}}),

  fetchMatches: async () => {
    const {config} = get();
    if (!config) {
      return;
    }

    set({isLoading: true});
    const {data} = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('event_id', config.eventId)
      .order('kickoff_time', {ascending: true});

    set({matches: (data as DbTournamentMatch[]) ?? [], isLoading: false});
  },

  fetchUserPicks: async userId => {
    const {config} = get();
    if (!config) {
      return;
    }

    const [{data: groupData}, {data: matchData}] = await Promise.all([
      supabase
        .from('tournament_picks')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', config.eventId)
        .eq('pick_type', 'group_advancement'),
      supabase
        .from('tournament_picks')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', config.eventId)
        .eq('pick_type', 'match_winner'),
    ]);

    set({
      groupPicks: (groupData as DbTournamentPick[]) ?? [],
      matchPicks: (matchData as DbTournamentPick[]) ?? [],
    });
  },

  // Group picks use match_id convention: "group_{groupName}_{teamCode}"
  // since the schema has no group_name column on tournament_picks.
  saveGroupPick: async ({userId, groupName, teamCode, selected}) => {
    const {config, poolId} = get();
    if (!config) {
      return;
    }

    const matchId = `group_${groupName}_${teamCode}`;
    const prevGroupPicks = get().groupPicks;

    if (selected) {
      // Optimistic add
      const optimisticPick: DbTournamentPick = {
        id: matchId,
        user_id: userId,
        event_id: config.eventId,
        pool_id: poolId,
        match_id: matchId,
        pick_type: 'group_advancement',
        picked_team_code: teamCode,
        is_hot_pick: false,
        created_at: new Date().toISOString(),
      };
      set({
        groupPicks: [...prevGroupPicks, optimisticPick],
        isSaving: true,
        saveError: null,
      });

      const {error} = await supabase.from('tournament_picks').upsert(
        {
          user_id: userId,
          event_id: config.eventId,
          pool_id: poolId,
          match_id: matchId,
          pick_type: 'group_advancement',
          picked_team_code: teamCode,
          is_hot_pick: false,
        },
        {onConflict: 'user_id,event_id,pool_id,match_id'},
      );

      if (error) {
        set({groupPicks: prevGroupPicks, saveError: error.message});
      }
    } else {
      // Optimistic remove
      set({
        groupPicks: prevGroupPicks.filter(p => p.match_id !== matchId),
        isSaving: true,
        saveError: null,
      });

      const {error} = await supabase
        .from('tournament_picks')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', config.eventId)
        .eq('pool_id', poolId)
        .eq('match_id', matchId);

      if (error) {
        set({groupPicks: prevGroupPicks, saveError: error.message});
      }
    }

    set({isSaving: false});
  },

  saveMatchPick: async ({userId, matchId, teamCode, isHotPick}) => {
    const {config, poolId} = get();
    if (!config) {
      return;
    }

    const prevMatchPicks = get().matchPicks;
    const optimisticPick: DbTournamentPick = {
      id: matchId,
      user_id: userId,
      event_id: config.eventId,
      pool_id: poolId,
      match_id: matchId,
      pick_type: 'match_winner',
      picked_team_code: teamCode,
      is_hot_pick: isHotPick,
      created_at: new Date().toISOString(),
    };

    // Optimistic: replace existing pick for this match or add new
    const updated = prevMatchPicks.some(p => p.match_id === matchId)
      ? prevMatchPicks.map(p => (p.match_id === matchId ? optimisticPick : p))
      : [...prevMatchPicks, optimisticPick];

    set({matchPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('tournament_picks').upsert(
      {
        user_id: userId,
        event_id: config.eventId,
        pool_id: poolId,
        match_id: matchId,
        pick_type: 'match_winner',
        picked_team_code: teamCode,
        is_hot_pick: isHotPick,
      },
      {onConflict: 'user_id,event_id,pool_id,match_id'},
    );

    if (error) {
      set({matchPicks: prevMatchPicks, saveError: error.message});
    }

    set({isSaving: false});
  },

  fetchLeaderboard: async () => {
    const {config, poolId} = get();
    if (!config) {
      return;
    }

    set({isLoading: true});
    const {data} = await supabase
      .from('tournament_scores')
      .select('*')
      .eq('event_id', config.eventId)
      .eq('pool_id', poolId)
      .order('total_points', {ascending: false});

    const scores = (data as DbTournamentScore[]) ?? [];

    // Fetch display names for all users on the leaderboard
    const userIds = scores.map(s => s.user_id);
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
      leaderboard: scores,
      userNames: names,
      isLoading: false,
    });
  },

  calculateMyScore: async (userId: string) => {
    const {config, poolId, matches, groupPicks, matchPicks} = get();
    if (!config) {
      return;
    }

    const allPicks = [...groupPicks, ...matchPicks];
    const result = calculateTotalScore(allPicks, matches, config);

    // Determine rank among existing leaderboard entries
    const {leaderboard} = get();
    const rank =
      leaderboard.filter(s => s.total_points > result.total).length + 1;

    await supabase.from('tournament_scores').upsert(
      {
        user_id: userId,
        event_id: config.eventId,
        pool_id: poolId,
        group_points: result.groupPoints,
        knockout_points: result.knockoutPoints,
        total_points: result.total,
        rank,
        last_calculated: new Date().toISOString(),
      },
      {onConflict: 'user_id,event_id,pool_id'},
    );

    // Re-fetch leaderboard to get updated data
    await get().fetchLeaderboard();
  },

  getGroupPickCodes: (groupName: string) => {
    const {groupPicks} = get();
    const prefix = `group_${groupName}_`;
    return groupPicks
      .filter(p => p.match_id.startsWith(prefix))
      .map(p => p.picked_team_code);
  },

  getMatchPick: (matchId: string) => {
    const {matchPicks} = get();
    return matchPicks.find(p => p.match_id === matchId);
  },

  getUserScore: (userId: string) => {
    const {leaderboard} = get();
    return leaderboard.find(s => s.user_id === userId);
  },
}));
