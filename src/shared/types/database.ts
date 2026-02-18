/**
 * Supabase table types — template-scoped tables, distinguished by event_id.
 *
 * Tournament: tournament_matches, tournament_picks, tournament_scores
 * Season:     season_matches, season_picks, season_scores
 * Series:     series_matchups, series_picks, series_scores
 * Shared:     users, pools, pool_members, smack_talk, analytics_events
 */

// ---------------------------------------------------------------------------
// Shared tables
// ---------------------------------------------------------------------------

export interface DbUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface DbPool {
  id: string;
  name: string;
  event_id: string;
  created_by: string;
  invite_code: string;
  is_public: boolean;
  created_at: string;
}

export interface DbPoolMember {
  id: string;
  pool_id: string;
  user_id: string;
  joined_at: string;
}

export interface DbSmackTalk {
  id: string;
  pool_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

export interface DbAnalyticsEvent {
  id: string;
  user_id: string;
  event_name: string;
  properties: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Tournament tables
// ---------------------------------------------------------------------------

export interface DbTournamentMatch {
  id: string;
  event_id: string;
  round: string;
  group_name: string | null;
  home_team_code: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_time: string;
  status: 'scheduled' | 'live' | 'completed';
}

export interface DbTournamentPick {
  id: string;
  user_id: string;
  event_id: string;
  pool_id: string;
  match_id: string;
  pick_type: 'group_advancement' | 'match_winner';
  picked_team_code: string;
  is_hot_pick: boolean;
  created_at: string;
}

export interface DbTournamentScore {
  id: string;
  user_id: string;
  event_id: string;
  pool_id: string;
  group_points: number;
  knockout_points: number;
  total_points: number;
  rank: number;
  last_calculated: string;
}

// ---------------------------------------------------------------------------
// Season tables
// ---------------------------------------------------------------------------

export interface DbSeasonMatch {
  id: string;
  event_id: string;
  week: number;
  home_team_code: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_time: string;
  rank: number;
  status: 'scheduled' | 'live' | 'completed';
}

export interface DbSeasonPick {
  id: string;
  user_id: string;
  event_id: string;
  pool_id: string;
  match_id: string;
  picked_outcome: string; // 'home', 'away', 'draw'
  is_hot_pick: boolean;
  created_at: string;
}

export interface DbSeasonScore {
  id: string;
  user_id: string;
  event_id: string;
  pool_id: string;
  total_points: number;
  weekly_breakdown: Record<string, number>;
  rank: number;
  last_calculated: string;
}

// ---------------------------------------------------------------------------
// Series tables
// ---------------------------------------------------------------------------

export interface DbSeriesMatchup {
  id: string;
  event_id: string;
  round: string;
  higher_seed_code: string;
  lower_seed_code: string;
  higher_seed_wins: number;
  lower_seed_wins: number;
  status: 'upcoming' | 'active' | 'completed';
}

export interface DbSeriesPick {
  id: string;
  user_id: string;
  event_id: string;
  pool_id: string;
  matchup_id: string;
  picked_team_code: string;
  predicted_games: number; // e.g., 4, 5, 6, 7
  is_hot_pick: boolean;
  created_at: string;
}

export interface DbSeriesScore {
  id: string;
  user_id: string;
  event_id: string;
  pool_id: string;
  total_points: number;
  round_breakdown: Record<string, number>;
  rank: number;
  last_calculated: string;
}
