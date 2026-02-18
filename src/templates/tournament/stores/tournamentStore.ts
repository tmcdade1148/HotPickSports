import {create} from 'zustand';
import {supabase} from '@shared/config/supabase';
import type {TournamentConfig} from '@shared/types/templates';
import type {
  DbTournamentMatch,
  DbTournamentPick,
} from '@shared/types/database';

interface TournamentState {
  config: TournamentConfig | null;
  matches: DbTournamentMatch[];
  groupPicks: DbTournamentPick[];
  matchPicks: DbTournamentPick[];
  scores: Record<string, number>;
  isLoading: boolean;

  initialize: (config: TournamentConfig) => void;
  fetchMatches: () => Promise<void>;
  fetchUserPicks: (userId: string) => Promise<void>;
}

export const useTournamentStore = create<TournamentState>((set, get) => ({
  config: null,
  matches: [],
  groupPicks: [],
  matchPicks: [],
  scores: {},
  isLoading: false,

  initialize: config => set({config}),

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
}));
