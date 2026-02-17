/**
 * World Cup sport-scoped Zustand store.
 * Manages tournament-specific state: matches, picks, groups, bracket.
 *
 * Blueprint reference: Section 4.2 (Sport-scoped stores)
 */
import { create } from 'zustand';
import { supabase } from '../../../shared/config/supabase';
import type { TournamentMatch, TournamentPick } from '../../../shared/types/database';
import type { Group, BracketMatch } from '../types';

interface WorldCupState {
  // Data
  matches: TournamentMatch[];
  picks: TournamentPick[];
  groups: Group[];
  bracket: BracketMatch[];

  // Loading states
  isLoadingMatches: boolean;
  isLoadingPicks: boolean;

  // Actions
  fetchMatches: (eventKey: string) => Promise<void>;
  fetchPicks: (poolId: string, userId: string) => Promise<void>;
  makePick: (params: {
    poolId: string;
    userId: string;
    matchId: string;
    pick: 'home' | 'away' | 'draw';
  }) => Promise<void>;
  reset: () => void;
}

export const useWorldCupStore = create<WorldCupState>((set, get) => ({
  matches: [],
  picks: [],
  groups: [],
  bracket: [],
  isLoadingMatches: false,
  isLoadingPicks: false,

  fetchMatches: async (eventKey) => {
    set({ isLoadingMatches: true });
    try {
      const { data, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('event_key', eventKey)
        .order('kickoff_at', { ascending: true });

      if (error) throw error;

      const matches = (data ?? []) as TournamentMatch[];

      // Derive group standings from match results
      const groups = deriveGroups(matches);

      // Derive bracket from knockout matches
      const bracket = deriveBracket(matches);

      set({ matches, groups, bracket });
    } catch (err) {
      if (__DEV__) console.warn('[WorldCupStore] fetchMatches error:', err);
    } finally {
      set({ isLoadingMatches: false });
    }
  },

  fetchPicks: async (poolId, userId) => {
    set({ isLoadingPicks: true });
    try {
      const { data, error } = await supabase
        .from('tournament_picks')
        .select('*')
        .eq('pool_id', poolId)
        .eq('user_id', userId);

      if (error) throw error;
      set({ picks: (data ?? []) as TournamentPick[] });
    } catch (err) {
      if (__DEV__) console.warn('[WorldCupStore] fetchPicks error:', err);
    } finally {
      set({ isLoadingPicks: false });
    }
  },

  makePick: async ({ poolId, userId, matchId, pick }) => {
    // Optimistic update: add/update pick locally
    const existing = get().picks.find(p => p.match_id === matchId);

    if (existing) {
      // Update existing pick
      const { error } = await supabase
        .from('tournament_picks')
        .update({ pick, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw error;

      set({
        picks: get().picks.map(p =>
          p.id === existing.id ? { ...p, pick } : p,
        ),
      });
    } else {
      // Insert new pick
      const { data, error } = await supabase
        .from('tournament_picks')
        .insert({
          pool_id: poolId,
          user_id: userId,
          match_id: matchId,
          pick,
          locked_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        set({ picks: [...get().picks, data as TournamentPick] });
      }
    }
  },

  reset: () => set({
    matches: [],
    picks: [],
    groups: [],
    bracket: [],
    isLoadingMatches: false,
    isLoadingPicks: false,
  }),
}));

// ─── Derivation Helpers ─────────────────────────────────────────────────────

function deriveGroups(matches: TournamentMatch[]): Group[] {
  const groupMatches = matches.filter(m => m.stage === 'group' && m.group_label);
  const groupMap = new Map<string, TournamentMatch[]>();

  for (const match of groupMatches) {
    const label = match.group_label!;
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push(match);
  }

  const groups: Group[] = [];

  for (const [label, gMatches] of groupMap) {
    const teamSet = new Set<string>();
    for (const m of gMatches) {
      teamSet.add(m.home_team);
      teamSet.add(m.away_team);
    }

    const teams = [...teamSet].map(teamKey => {
      const standing = { teamKey, teamName: teamKey, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };

      for (const m of gMatches) {
        if (m.status !== 'completed' || m.home_score === null || m.away_score === null) continue;

        if (m.home_team === teamKey) {
          standing.played++;
          standing.goalsFor += m.home_score;
          standing.goalsAgainst += m.away_score;
          if (m.home_score > m.away_score) { standing.won++; standing.points += 3; }
          else if (m.home_score === m.away_score) { standing.drawn++; standing.points += 1; }
          else { standing.lost++; }
        } else if (m.away_team === teamKey) {
          standing.played++;
          standing.goalsFor += m.away_score;
          standing.goalsAgainst += m.home_score;
          if (m.away_score > m.home_score) { standing.won++; standing.points += 3; }
          else if (m.away_score === m.home_score) { standing.drawn++; standing.points += 1; }
          else { standing.lost++; }
        }
      }

      standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
      return standing;
    });

    // Sort by points, then goal difference, then goals for
    teams.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);

    groups.push({ label, teams });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

function deriveBracket(matches: TournamentMatch[]): BracketMatch[] {
  return matches
    .filter(m => m.stage !== 'group')
    .map(m => ({
      matchNumber: m.match_number,
      stage: m.stage as BracketMatch['stage'],
      homeTeam: m.home_team,
      awayTeam: m.away_team,
      homeScore: m.home_score,
      awayScore: m.away_score,
      winner: m.status === 'completed'
        ? (m.home_score ?? 0) > (m.away_score ?? 0) ? m.home_team
          : (m.away_score ?? 0) > (m.home_score ?? 0) ? m.away_team
          : (m.home_penalties ?? 0) > (m.away_penalties ?? 0) ? m.home_team
          : m.away_team
        : null,
      kickoffAt: m.kickoff_at,
      status: m.status,
    }))
    .sort((a, b) => a.matchNumber - b.matchNumber);
}
