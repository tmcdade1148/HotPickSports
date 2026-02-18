/**
 * Template-First Architecture — Core Type Definitions
 *
 * Every sport event in HotPick uses one of three template types.
 * Templates are sport-agnostic; sport configs are pure data that conform to these interfaces.
 */

// ---------------------------------------------------------------------------
// Template Type
// ---------------------------------------------------------------------------

export type TemplateType = 'tournament' | 'season' | 'series';

// ---------------------------------------------------------------------------
// Base Config — What the Shell needs to render any sport
// ---------------------------------------------------------------------------

export interface TabConfig {
  key: string;
  label: string;
  icon: string;
}

export interface BaseEventConfig {
  eventId: string; // 'wc-2026', 'nfl-2026', 'nhl-playoffs-2027'
  templateType: TemplateType;
  sport: string; // 'soccer', 'football', 'hockey'
  name: string; // 'FIFA World Cup 2026'
  shortName: string; // 'World Cup'
  status: 'upcoming' | 'active' | 'completed';
  startDate: string; // ISO 8601
  endDate: string;
  picksOpenDate?: string;
  color: string; // Accent color for UI
  tabs: TabConfig[];
}

// ---------------------------------------------------------------------------
// Tournament Config — Group-to-knockout (World Cup, Euros, Copa)
// ---------------------------------------------------------------------------

export interface TeamConfig {
  code: string; // 'USA', 'BRA', 'GER'
  name: string; // 'United States'
  shortName: string; // 'USA'
  flagUrl?: string;
}

export interface GroupConfig {
  name: string; // 'A', 'B', ... 'L'
  teams: TeamConfig[];
}

export interface KnockoutRoundConfig {
  key: string; // 'round_of_32', 'round_of_16', etc.
  label: string; // 'Round of 32'
  rank: number; // Fixed rank: 3, 4, 6, 8, 10
  matchCount: number;
  isMegaPick?: boolean; // True for the final
}

export interface TournamentConfig extends BaseEventConfig {
  templateType: 'tournament';

  // Group stage
  groups: GroupConfig[];
  advancingPerGroup: number;
  groupPicksRequired: boolean;

  // Knockout stage
  knockoutRounds: KnockoutRoundConfig[];

  // Scoring
  groupCorrectAdvancementPoints: number;
  maxGroupPoints: number;
  maxTotalPoints: number;

  // Data source
  espnLeagueSlug: string;
}

// ---------------------------------------------------------------------------
// Season Config — Weekly picks (NFL, EPL, College FB)
// ---------------------------------------------------------------------------

export interface SeasonConfig extends BaseEventConfig {
  templateType: 'season';

  // Season structure
  totalWeeks: number;
  playoffStartWeek?: number;

  // Scoring
  hotPicksPerWeek: number;
  rankSource: 'odds' | 'manual';
  rankRange: [number, number];

  // Teams
  teams: TeamConfig[];

  // Outcomes
  possibleOutcomes: string[]; // ['home', 'away'] for NFL, ['home', 'away', 'draw'] for EPL

  // Data source
  espnLeagueSlug: string;
}

// ---------------------------------------------------------------------------
// Series Config — Best-of-N playoffs (NHL, NBA, MLB)
// ---------------------------------------------------------------------------

export interface SeriesRoundConfig {
  key: string; // 'first_round', 'conf_finals', 'finals'
  label: string; // 'Conference Finals'
  rank: number;
  bestOf: number; // 5 or 7
  seriesCount: number;
  isMegaPick?: boolean;
}

export interface SeriesConfig extends BaseEventConfig {
  templateType: 'series';

  // Structure
  rounds: SeriesRoundConfig[];

  // Scoring
  seriesLengthBonusPoints: number;

  // Teams
  teams: TeamConfig[];

  // Data source
  espnLeagueSlug: string;
}

// ---------------------------------------------------------------------------
// Union type for any event config
// ---------------------------------------------------------------------------

export type AnyEventConfig = TournamentConfig | SeasonConfig | SeriesConfig;
