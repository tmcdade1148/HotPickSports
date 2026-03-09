import type {SeasonConfig} from '@shared/types/templates';

export const nflSeason: SeasonConfig = {
  competition: 'nfl_2026',
  templateType: 'season',
  sport: 'football',
  name: 'NFL 2026-27 Season',
  shortName: 'NFL',
  status: 'active',
  startDate: '2026-09-10',
  endDate: '2027-02-14',
  picksOpenDate: '2026-09-07',
  color: '#013369',

  tabs: [
    {key: 'picks', label: 'Picks', icon: 'check-circle'},
    {key: 'board', label: 'Leaderboard', icon: 'bar-chart-2'},
    {key: 'smacktalk', label: 'SmackTalk', icon: 'message-circle'},
  ],

  // Season structure
  totalWeeks: 18,
  playoffStartWeek: 19,

  // Scoring
  hotPicksPerWeek: 1,
  rankSource: 'odds',
  rankRange: [1, 10],

  // Outcomes — NFL has no draws
  possibleOutcomes: ['home', 'away'],

  // Data source
  espnLeagueSlug: 'football/nfl',

  // All 32 NFL teams — shortName is the mascot name for display
  teams: [
    // AFC East
    {code: 'BUF', name: 'Buffalo Bills', shortName: 'Bills'},
    {code: 'MIA', name: 'Miami Dolphins', shortName: 'Dolphins'},
    {code: 'NE', name: 'New England Patriots', shortName: 'Patriots'},
    {code: 'NYJ', name: 'New York Jets', shortName: 'Jets'},
    // AFC North
    {code: 'BAL', name: 'Baltimore Ravens', shortName: 'Ravens'},
    {code: 'CIN', name: 'Cincinnati Bengals', shortName: 'Bengals'},
    {code: 'CLE', name: 'Cleveland Browns', shortName: 'Browns'},
    {code: 'PIT', name: 'Pittsburgh Steelers', shortName: 'Steelers'},
    // AFC South
    {code: 'HOU', name: 'Houston Texans', shortName: 'Texans'},
    {code: 'IND', name: 'Indianapolis Colts', shortName: 'Colts'},
    {code: 'JAX', name: 'Jacksonville Jaguars', shortName: 'Jaguars'},
    {code: 'TEN', name: 'Tennessee Titans', shortName: 'Titans'},
    // AFC West
    {code: 'DEN', name: 'Denver Broncos', shortName: 'Broncos'},
    {code: 'KC', name: 'Kansas City Chiefs', shortName: 'Chiefs'},
    {code: 'LV', name: 'Las Vegas Raiders', shortName: 'Raiders'},
    {code: 'LAC', name: 'Los Angeles Chargers', shortName: 'Chargers'},
    // NFC East
    {code: 'DAL', name: 'Dallas Cowboys', shortName: 'Cowboys'},
    {code: 'NYG', name: 'New York Giants', shortName: 'Giants'},
    {code: 'PHI', name: 'Philadelphia Eagles', shortName: 'Eagles'},
    {code: 'WAS', name: 'Washington Commanders', shortName: 'Commanders'},
    // NFC North
    {code: 'CHI', name: 'Chicago Bears', shortName: 'Bears'},
    {code: 'DET', name: 'Detroit Lions', shortName: 'Lions'},
    {code: 'GB', name: 'Green Bay Packers', shortName: 'Packers'},
    {code: 'MIN', name: 'Minnesota Vikings', shortName: 'Vikings'},
    // NFC South
    {code: 'ATL', name: 'Atlanta Falcons', shortName: 'Falcons'},
    {code: 'CAR', name: 'Carolina Panthers', shortName: 'Panthers'},
    {code: 'NO', name: 'New Orleans Saints', shortName: 'Saints'},
    {code: 'TB', name: 'Tampa Bay Buccaneers', shortName: 'Buccaneers'},
    // NFC West
    {code: 'ARI', name: 'Arizona Cardinals', shortName: 'Cardinals'},
    {code: 'LAR', name: 'Los Angeles Rams', shortName: 'Rams'},
    {code: 'SF', name: 'San Francisco 49ers', shortName: '49ers'},
    {code: 'SEA', name: 'Seattle Seahawks', shortName: 'Seahawks'},
  ],
};
