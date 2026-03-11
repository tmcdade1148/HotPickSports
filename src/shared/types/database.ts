/**
 * Supabase table types — aligned to live DB schema (project mzqtrpdiqhopjmxjccwy).
 *
 * Tournament: tournament_matches, tournament_picks, tournament_user_totals,
 *             tournament_group_picks, tournament_group_results
 * Season:     season_games, season_picks, season_user_totals
 * Series:     series_matchups, series_games, series_picks, series_user_totals
 * Shared:     profiles, pools, pool_members, smack_messages, smack_reactions,
 *             smack_read_state, competition_config, event_recaps
 */

// ---------------------------------------------------------------------------
// Shared tables
// ---------------------------------------------------------------------------

/** Table: profiles (post-migration: profiles_identity_cleanup + split_full_name + onboarding_futureproof) */
export interface DbProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  poolie_name: string | null;
  display_name_preference: 'first_name' | 'poolie_name';
  email: string | null;
  avatar_url: string | null;
  avatar_key: string | null;
  avatar_type: 'system' | 'uploaded' | 'oauth' | 'generated';
  timezone: string | null;
  tos_accepted_at: string | null;
  tos_version: string | null;
  referral_code: string | null;
  referred_by: string | null;
  default_pool_id: string | null;
  total_career_points: number;
  career_picks_correct: number;
  career_picks_total: number;
  career_hotpick_correct: number;
  career_hotpick_total: number;
  created_at: string;
  updated_at: string;
}

/** Table: pools */
export interface DbPool {
  id: string;
  name: string;
  competition: string;
  created_by: string;
  organizer_id: string | null;
  invite_code: string | null;
  is_public: boolean;
  is_global: boolean;
  is_founding_pool: boolean;
  member_limit: number | null;
  status: string;
  name_display: string | null;
  pool_start_date: string;
  partner_id: string | null;
  invite_slug: string | null;
  brand_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Table: partners */
export interface DbPartner {
  id: string;
  name: string;
  slug: string;
  brand_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

/** Table: pool_members (composite PK: pool_id, user_id) */
export interface DbPoolMember {
  pool_id: string;
  user_id: string;
  role: 'member' | 'admin' | 'organizer';
  status: 'active' | 'pending' | 'removed' | 'left';
  invited_by: string | null;
  invite_code_used: string | null;
  joined_at: string;
  left_at: string | null;
  last_active_at: string | null;
  notification_override: Record<string, unknown> | null;
}

/** Table: smack_messages */
export interface DbSmackMessage {
  id: string;
  pool_id: string;
  user_id: string;
  author_name: string;
  text: string;
  reply_to: string | null;
  avatar_key: string | null;
  created_at: string;
}

/** Table: smack_reactions */
export interface DbSmackReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
}

/** Table: smack_read_state (composite PK: user_id, pool_id) */
export interface DbSmackReadState {
  user_id: string;
  pool_id: string;
  last_read_at: string;
}

/** Table: competition_config */
export interface DbCompetitionConfig {
  id: number;
  competition: string;
  key: string;
  value: unknown;
  updated_at: string;
}

/**
 * Table: event_recaps — Drama digest per pool per scoring period.
 * Template-agnostic: works across Season (weekly), Series (per-round), Tournament (per-stage).
 * Written by Edge Functions only (service role). Clients read via RLS (active pool members).
 */
export interface DbEventRecap {
  id: string;
  pool_id: string;
  competition: string;
  /** Scoring period identifier. Season: "week_1".."week_18". Series: "first_round", etc. Tournament: "group_stage", "round_of_16", etc. */
  period_key: string;
  /** Integer for ordering. Season: week number. Series: round number (1-4). Tournament: stage ordinal. */
  period_number: number;
  /** Array of headline objects: [{type, text, subject_user_id}]. Types vary by template. */
  headlines: EventRecapHeadline[];
  generated_at: string;
  /** When push notification was sent. NULL until delivered. */
  notified_at: string | null;
}

/** Single headline within an event recap. */
export interface EventRecapHeadline {
  /** Headline type — template-specific. Season: heartbreaker, biggest_swing, bold_call, tough_week, comeback, race_report, perfect_week. */
  type: string;
  /** Human-readable headline text with real names and numbers. */
  text: string;
  /** The pool member this headline is about. Null for race_report (pool-wide). */
  subject_user_id: string | null;
}

// ---------------------------------------------------------------------------
// Tournament tables
// ---------------------------------------------------------------------------

/** Table: tournament_matches */
export interface DbTournamentMatch {
  match_id: string;
  competition: string;
  stage: string;
  group_letter: string | null;
  match_day: number | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  winner_team: string | null;
  is_draw: boolean;
  is_penalty_result: boolean;
  rank: number | null;
  frozen_rank: number | null;
  home_moneyline: number | null;
  away_moneyline: number | null;
  competitive_index: number | null;
  is_finalized: boolean;
  current_period: number | null;
  game_clock: string | null;
  created_at: string;
  updated_at: string;
}

/** Table: tournament_picks */
export interface DbTournamentPick {
  id: string;
  user_id: string;
  match_id: string;
  competition: string;
  stage: string;
  picked_team: string;
  is_hotpick: boolean;
  is_correct: boolean | null;
  points: number | null;
  power_up: string | null;
  created_at: string;
  updated_at: string;
}

/** Table: tournament_group_picks */
export interface DbTournamentGroupPick {
  id: string;
  user_id: string;
  competition: string;
  group_letter: string;
  first_place_team: string;
  second_place_team: string;
  is_locked: boolean;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Table: tournament_group_results */
export interface DbTournamentGroupResult {
  id: string;
  competition: string;
  group_letter: string;
  first_place_team: string;
  second_place_team: string;
  is_finalized: boolean;
  finalized_at: string | null;
  created_at: string;
}

/** Table: tournament_user_totals */
export interface DbTournamentUserTotal {
  id: string;
  user_id: string;
  competition: string;
  group_stage_points: number;
  knockout_points: number;
  advancement_bonus_points: number;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  hotpick_correct: number;
  hotpick_total: number;
  groups_correct: number;
  groups_total: number;
  scored_at: string;
  power_up_used: string | null;
  power_up_delta: number | null;
  double_down_used: boolean | null;
  double_down_delta: number | null;
  mulligan_used: boolean | null;
}

// ---------------------------------------------------------------------------
// Season tables
// ---------------------------------------------------------------------------

/** Table: season_games */
export interface DbSeasonGame {
  game_id: string;
  competition: string;
  season_year: number;
  week: number;
  phase: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  winner_team: string | null;
  spread: number | null;
  home_moneyline: number | null;
  away_moneyline: number | null;
  over_under: number | null;
  competitive_index: number | null;
  rank: number | null;
  frozen_rank: number | null;
  is_finalized: boolean;
  home_record: string | null;
  away_record: string | null;
  current_period: number | null;
  game_clock: string | null;
  q1_home_score: number | null;
  q1_away_score: number | null;
  q2_home_score: number | null;
  q2_away_score: number | null;
  q3_home_score: number | null;
  q3_away_score: number | null;
  created_at: string;
  updated_at: string;
}

/** Table: season_picks */
export interface DbSeasonPick {
  id: string;
  user_id: string;
  game_id: string;
  competition: string;
  season_year: number;
  week: number;
  picked_team: string;
  is_hotpick: boolean;
  is_correct: boolean | null;
  points: number | null;
  sb_q1_leader: string | null;
  sb_q2_leader: string | null;
  sb_q3_leader: string | null;
  sb_margin_tier: string | null;
  power_up: string | null;
  created_at: string;
  updated_at: string;
}

/** Table: season_user_totals (one row per user per week) */
export interface DbSeasonUserTotal {
  id: string;
  user_id: string;
  competition: string;
  season_year: number;
  week: number;
  phase: string;
  week_points: number;
  playoff_points: number | null;
  correct_picks: number;
  total_picks: number;
  is_hotpick_correct: boolean | null;
  hotpick_rank: number | null;
  is_no_show: boolean;
  scored_at: string;
  power_up_used: string | null;
  power_up_delta: number | null;
  double_down_used: boolean | null;
  double_down_delta: number | null;
  mulligan_used: boolean | null;
}

// ---------------------------------------------------------------------------
// Series tables
// ---------------------------------------------------------------------------

/** Table: series_matchups */
export interface DbSeriesMatchup {
  series_id: string;
  competition: string;
  round: string;
  series_format: number;
  higher_seed_team: string;
  lower_seed_team: string;
  higher_seed_wins: number;
  lower_seed_wins: number;
  status: string;
  winner_team: string | null;
  series_length: number | null;
  rank: number | null;
  frozen_rank: number | null;
  created_at: string;
  updated_at: string;
}

/** Table: series_games */
export interface DbSeriesGame {
  game_id: string;
  series_id: string;
  competition: string;
  game_number: number;
  home_team: string;
  away_team: string;
  start_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  winner_team: string | null;
  is_overtime: boolean;
  overtime_periods: number;
  current_period: number | null;
  game_clock: string | null;
  created_at: string;
  updated_at: string;
}

/** Table: series_picks */
export interface DbSeriesPick {
  id: string;
  user_id: string;
  series_id: string;
  competition: string;
  round: string;
  picked_winner: string;
  picked_series_length: number;
  is_hotpick: boolean;
  is_winner_correct: boolean | null;
  is_length_correct: boolean | null;
  points: number | null;
  power_up: string | null;
  created_at: string;
  updated_at: string;
}

/** Table: series_user_totals (one row per user per round) */
export interface DbSeriesUserTotal {
  id: string;
  user_id: string;
  competition: string;
  round: string;
  round_points: number;
  cumulative_points: number;
  correct_winners: number;
  correct_lengths: number;
  total_picks: number;
  is_hotpick_correct: boolean | null;
  hotpick_rank: number | null;
  scored_at: string;
  power_up_used: string | null;
  power_up_delta: number | null;
  double_down_used: boolean | null;
  double_down_delta: number | null;
  mulligan_used: boolean | null;
}
