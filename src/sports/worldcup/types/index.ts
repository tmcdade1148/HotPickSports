/**
 * World Cup tournament-specific type definitions.
 */

export interface GroupStanding {
  teamKey: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface Group {
  label: string; // 'A', 'B', etc.
  teams: GroupStanding[];
}

export interface BracketMatch {
  matchNumber: number;
  stage: 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'third_place' | 'final';
  homeTeam: string | null; // null if TBD
  awayTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
  kickoffAt: string;
  status: 'scheduled' | 'live' | 'completed';
}

export interface UserProgress {
  totalPicks: number;
  correctPicks: number;
  pendingPicks: number;
  totalPoints: number;
  rank: number;
  groupPicksComplete: boolean;
  bracketPicksComplete: boolean;
}
