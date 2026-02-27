import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {TournamentConfig} from '@shared/types/templates';
import type {
  DbTournamentMatch,
  DbTournamentPick,
  DbTournamentGroupPick,
  DbTournamentUserTotal,
} from '@shared/types/database';
import {calculateTotalScore} from '../services/tournamentScoring';

interface TournamentState {
  config: TournamentConfig | null;
  poolId: string;
  matches: DbTournamentMatch[];
  groupPicks: DbTournamentGroupPick[];
  matchPicks: DbTournamentPick[];
  leaderboard: DbTournamentUserTotal[];
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
    groupLetter: string;
    firstPlaceTeam: string;
    secondPlaceTeam: string;
  }) => Promise<void>;

  saveMatchPick: (params: {
    userId: string;
    matchId: string;
    teamCode: string;
    isHotPick: boolean;
  }) => Promise<void>;

  // Leaderboard + scoring — poolId scopes the leaderboard view
  fetchLeaderboard: () => Promise<void>;
  calculateMyScore: (userId: string) => Promise<void>;

  // Selectors
  getGroupPick: (groupLetter: string) => DbTournamentGroupPick | undefined;
  getGroupPickCodes: (groupLetter: string) => string[];
  getMatchPick: (matchId: string) => DbTournamentPick | undefined;
  getUserScore: (userId: string) => DbTournamentUserTotal | undefined;
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
      .eq('competition', config.competition)
      .order('kickoff_at', {ascending: true});

    set({matches: (data as DbTournamentMatch[]) ?? [], isLoading: false});
  },

  fetchUserPicks: async userId => {
    const {config} = get();
    if (!config) {
      return;
    }

    const [{data: groupData}, {data: matchData}] = await Promise.all([
      supabase
        .from('tournament_group_picks')
        .select('*')
        .eq('user_id', userId)
        .eq('competition', config.competition),
      supabase
        .from('tournament_picks')
        .select('*')
        .eq('user_id', userId)
        .eq('competition', config.competition),
    ]);

    set({
      groupPicks: (groupData as DbTournamentGroupPick[]) ?? [],
      matchPicks: (matchData as DbTournamentPick[]) ?? [],
    });
  },

  // Group picks use the dedicated tournament_group_picks table.
  // Each row represents one group: group_letter, first_place_team, second_place_team.
  saveGroupPick: async ({userId, groupLetter, firstPlaceTeam, secondPlaceTeam}) => {
    const {config} = get();
    if (!config) {
      return;
    }

    const prevGroupPicks = get().groupPicks;

    // Optimistic update: replace existing pick for this group or add new
    const optimisticPick: DbTournamentGroupPick = {
      id: `${userId}_${config.competition}_${groupLetter}`,
      user_id: userId,
      competition: config.competition,
      group_letter: groupLetter,
      first_place_team: firstPlaceTeam,
      second_place_team: secondPlaceTeam,
      is_locked: false,
      locked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = prevGroupPicks.some(p => p.group_letter === groupLetter)
      ? prevGroupPicks.map(p => (p.group_letter === groupLetter ? optimisticPick : p))
      : [...prevGroupPicks, optimisticPick];

    set({groupPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('tournament_group_picks').upsert(
      {
        user_id: userId,
        competition: config.competition,
        group_letter: groupLetter,
        first_place_team: firstPlaceTeam,
        second_place_team: secondPlaceTeam,
      },
      {onConflict: 'user_id,competition,group_letter'},
    );

    if (error) {
      set({groupPicks: prevGroupPicks, saveError: error.message});
    }

    set({isSaving: false});
  },

  saveMatchPick: async ({userId, matchId, teamCode, isHotPick}) => {
    const {config} = get();
    if (!config) {
      return;
    }

    // Look up the match to get its stage
    const match = get().matches.find(m => m.match_id === matchId);
    const stage = match?.stage ?? 'knockout';

    const prevMatchPicks = get().matchPicks;
    const optimisticPick: DbTournamentPick = {
      id: `${userId}_${matchId}`,
      user_id: userId,
      match_id: matchId,
      competition: config.competition,
      stage,
      picked_team: teamCode,
      is_hot_pick: isHotPick,
      is_correct: null,
      points: null,
      power_up: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic: replace existing pick for this match or add new
    const updated = prevMatchPicks.some(p => p.match_id === matchId)
      ? prevMatchPicks.map(p => (p.match_id === matchId ? optimisticPick : p))
      : [...prevMatchPicks, optimisticPick];

    set({matchPicks: updated, isSaving: true, saveError: null});

    const {error} = await supabase.from('tournament_picks').upsert(
      {
        user_id: userId,
        match_id: matchId,
        competition: config.competition,
        stage,
        picked_team: teamCode,
        is_hot_pick: isHotPick,
      },
      {onConflict: 'user_id,competition,match_id'},
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

    // Pool-independent: scores have no pool_id.
    // Leaderboard is built by joining tournament_user_totals with pool_members
    // so any pool created mid-tournament immediately shows all members' scores.
    const {data} = await supabase
      .from('tournament_user_totals')
      .select('*, pool_members!inner(user_id)')
      .eq('competition', config.competition)
      .eq('pool_members.pool_id', poolId)
      .order('total_points', {ascending: false});

    const scores = (data as (DbTournamentUserTotal & {pool_members: unknown})[]) ?? [];
    // Strip the join artifact before storing
    const cleanScores: DbTournamentUserTotal[] = scores.map(
      ({pool_members: _pm, ...rest}) => rest,
    );

    // Fetch display names for all users on the leaderboard
    const userIds = cleanScores.map(s => s.user_id);
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
      leaderboard: cleanScores,
      userNames: names,
      isLoading: false,
    });
  },

  calculateMyScore: async (userId: string) => {
    const {config, matches, groupPicks, matchPicks} = get();
    if (!config) {
      return;
    }

    const result = calculateTotalScore(matchPicks, matches, config);

    await supabase.from('tournament_user_totals').upsert(
      {
        user_id: userId,
        competition: config.competition,
        group_stage_points: result.groupStagePoints,
        knockout_points: result.knockoutPoints,
        advancement_bonus_points: 0,
        total_points: result.total,
        correct_picks: 0,
        total_picks: matchPicks.length,
        hot_picks_correct: 0,
        hot_picks_total: matchPicks.filter(p => p.is_hot_pick).length,
        groups_correct: 0,
        groups_total: groupPicks.length,
        scored_at: new Date().toISOString(),
      },
      {onConflict: 'user_id,competition'},
    );

    // Re-fetch leaderboard to get updated data
    await get().fetchLeaderboard();
  },

  getGroupPick: (groupLetter: string) => {
    const {groupPicks} = get();
    return groupPicks.find(p => p.group_letter === groupLetter);
  },

  getGroupPickCodes: (groupLetter: string) => {
    const {groupPicks} = get();
    const pick = groupPicks.find(p => p.group_letter === groupLetter);
    if (!pick) {
      return [];
    }
    return [pick.first_place_team, pick.second_place_team].filter(Boolean);
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
