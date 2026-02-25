import type {SeasonConfig} from '@shared/types/templates';

export const nfl2026: SeasonConfig = {
  competition: 'nfl_2026',
  templateType: 'season',
  sport: 'football',
  name: 'NFL 2026-27 Season',
  shortName: 'NFL',
  status: 'upcoming',
  startDate: '2026-09-10',
  endDate: '2027-02-08',
  picksOpenDate: '2026-09-07',
  color: '#013369',

  tabs: [
    {key: 'picks', label: 'Picks', icon: 'check-circle'},
    {key: 'board', label: 'Board', icon: 'bar-chart-2'},
    {key: 'smacktalk', label: 'SmackTalk', icon: 'message-circle'},
  ],

  // Season structure
  totalWeeks: 18,
  playoffStartWeek: 19,

  // Scoring
  hotPicksPerWeek: 3,
  rankSource: 'odds',
  rankRange: [1, 10],

  // Outcomes — NFL has no draws
  possibleOutcomes: ['home', 'away'],

  // Data source
  espnLeagueSlug: 'football/nfl',

  // All 32 NFL teams
  teams: [
    // AFC East
    {code: 'BUF', name: 'Buffalo Bills', shortName: 'BUF'},
    {code: 'MIA', name: 'Miami Dolphins', shortName: 'MIA'},
    {code: 'NE', name: 'New England Patriots', shortName: 'NE'},
    {code: 'NYJ', name: 'New York Jets', shortName: 'NYJ'},
    // AFC North
    {code: 'BAL', name: 'Baltimore Ravens', shortName: 'BAL'},
    {code: 'CIN', name: 'Cincinnati Bengals', shortName: 'CIN'},
    {code: 'CLE', name: 'Cleveland Browns', shortName: 'CLE'},
    {code: 'PIT', name: 'Pittsburgh Steelers', shortName: 'PIT'},
    // AFC South
    {code: 'HOU', name: 'Houston Texans', shortName: 'HOU'},
    {code: 'IND', name: 'Indianapolis Colts', shortName: 'IND'},
    {code: 'JAX', name: 'Jacksonville Jaguars', shortName: 'JAX'},
    {code: 'TEN', name: 'Tennessee Titans', shortName: 'TEN'},
    // AFC West
    {code: 'DEN', name: 'Denver Broncos', shortName: 'DEN'},
    {code: 'KC', name: 'Kansas City Chiefs', shortName: 'KC'},
    {code: 'LV', name: 'Las Vegas Raiders', shortName: 'LV'},
    {code: 'LAC', name: 'Los Angeles Chargers', shortName: 'LAC'},
    // NFC East
    {code: 'DAL', name: 'Dallas Cowboys', shortName: 'DAL'},
    {code: 'NYG', name: 'New York Giants', shortName: 'NYG'},
    {code: 'PHI', name: 'Philadelphia Eagles', shortName: 'PHI'},
    {code: 'WAS', name: 'Washington Commanders', shortName: 'WAS'},
    // NFC North
    {code: 'CHI', name: 'Chicago Bears', shortName: 'CHI'},
    {code: 'DET', name: 'Detroit Lions', shortName: 'DET'},
    {code: 'GB', name: 'Green Bay Packers', shortName: 'GB'},
    {code: 'MIN', name: 'Minnesota Vikings', shortName: 'MIN'},
    // NFC South
    {code: 'ATL', name: 'Atlanta Falcons', shortName: 'ATL'},
    {code: 'CAR', name: 'Carolina Panthers', shortName: 'CAR'},
    {code: 'NO', name: 'New Orleans Saints', shortName: 'NO'},
    {code: 'TB', name: 'Tampa Bay Buccaneers', shortName: 'TB'},
    // NFC West
    {code: 'ARI', name: 'Arizona Cardinals', shortName: 'ARI'},
    {code: 'LAR', name: 'Los Angeles Rams', shortName: 'LAR'},
    {code: 'SF', name: 'San Francisco 49ers', shortName: 'SF'},
    {code: 'SEA', name: 'Seattle Seahawks', shortName: 'SEA'},
  ],
};
