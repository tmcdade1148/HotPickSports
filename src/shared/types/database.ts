/**
 * Supabase database types — matches the schema from HotPick Blueprint and Build Scope.
 * These types are the single source of truth for all database interactions.
 */

// ─── Users & Profiles ───────────────────────────────────────────────────────

export interface User {
  id: string; // UUID, matches Supabase auth.users.id
  email: string;
  full_name: string;
  poolie_name: string; // unique display name
  avatar_url: string | null;
  display_mode: 'first_name' | 'poolie_name'; // how others see you
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Pools ──────────────────────────────────────────────────────────────────

export interface Pool {
  id: string;
  name: string;
  sport_key: string; // 'worldcup_2026', 'nfl_2025', etc.
  event_key: string; // specific event within the sport
  creator_id: string; // FK → users.id
  invite_code: string; // 6-char alphanumeric
  max_members: number;
  is_public: boolean;
  settings: PoolSettings;
  created_at: string;
  updated_at: string;
}

export interface PoolSettings {
  allow_late_joins: boolean;
  smack_talk_enabled: boolean;
  show_leaderboard: boolean;
}

export interface PoolMember {
  id: string;
  pool_id: string; // FK → pools.id
  user_id: string; // FK → users.id
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  is_active: boolean;
}

// ─── Tournament Tables (World Cup) ─────────────────────────────────────────

export interface TournamentMatch {
  id: string;
  sport_key: string;
  event_key: string;
  stage: 'group' | 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'third_place' | 'final';
  group_label: string | null; // 'A', 'B', etc. — null for knockout
  match_number: number;
  home_team: string; // ISO 3166-1 alpha-3 or team key
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  venue: string;
  kickoff_at: string; // ISO 8601
  status: 'scheduled' | 'live' | 'completed' | 'postponed';
  created_at: string;
  updated_at: string;
}

export interface TournamentPick {
  id: string;
  pool_id: string;
  user_id: string;
  match_id: string; // FK → tournament_matches.id
  pick: 'home' | 'away' | 'draw';
  locked_at: string; // timestamp when pick was locked (at kickoff)
  is_correct: boolean | null; // null until match completed
  points_earned: number | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentGroupPick {
  id: string;
  pool_id: string;
  user_id: string;
  group_label: string; // 'A', 'B', etc.
  advancing_teams: string[]; // ordered array of team keys predicted to advance
  locked_at: string;
  points_earned: number | null;
  created_at: string;
}

export interface TournamentBracketPick {
  id: string;
  pool_id: string;
  user_id: string;
  stage: string;
  match_number: number;
  predicted_winner: string; // team key
  locked_at: string;
  is_correct: boolean | null;
  points_earned: number | null;
  created_at: string;
}

// ─── Season Tables (NFL) ────────────────────────────────────────────────────

export interface SeasonGame {
  id: string;
  sport_key: string;
  event_key: string;
  week: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  spread: number | null; // positive = home favored
  over_under: number | null;
  venue: string;
  kickoff_at: string;
  status: 'scheduled' | 'live' | 'completed' | 'postponed';
  created_at: string;
  updated_at: string;
}

export interface SeasonPick {
  id: string;
  pool_id: string;
  user_id: string;
  game_id: string; // FK → season_games.id
  pick: 'home' | 'away';
  confidence_rank: number | null; // for confidence pool variant
  locked_at: string;
  is_correct: boolean | null;
  points_earned: number | null;
  created_at: string;
  updated_at: string;
}

// ─── SmackTalk ──────────────────────────────────────────────────────────────

export interface SmackTalkMessage {
  id: string;
  pool_id: string;
  user_id: string;
  message: string;
  gif_url: string | null;
  reply_to_id: string | null; // FK → smack_talk_messages.id
  created_at: string;
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id: string;
  pool_id: string;
  user_id: string;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  rank: number;
  streak: number; // current correct streak
  best_streak: number;
  updated_at: string;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  id: string;
  user_id: string | null; // null for anonymous events
  event_name: string;
  event_data: Record<string, unknown>;
  sport_key: string | null;
  created_at: string;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  type: 'pick_reminder' | 'result' | 'pool_invite' | 'smack_talk' | 'leaderboard_change';
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
