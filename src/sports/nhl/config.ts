import type {SeriesConfig} from '@shared/types/templates';

export const nhlPlayoffs2027: SeriesConfig = {
  competition: 'nhl_playoffs_2027',
  templateType: 'series',
  sport: 'hockey',
  name: 'NHL 2027 Playoffs',
  shortName: 'NHL Playoffs',
  status: 'upcoming',
  startDate: '2027-04-12',
  endDate: '2027-06-20',
  picksOpenDate: '2027-04-10',
  color: '#000000',

  sportIdentity: {
    displayName: 'HotPick Hockey',
    sportMark: '',       // hockey puck icon asset
    sportWordmark: '',   // "HotPick Hockey" text lockup
    accentColor: '#000000',
  },

  tabs: [
    {key: 'picks', label: 'Picks', icon: 'check-circle'},
    {key: 'board', label: 'Board', icon: 'bar-chart-2'},
    {key: 'smacktalk', label: 'SmackTalk', icon: 'message-circle'},
  ],

  // Playoff structure — 4 rounds, all best-of-7
  rounds: [
    {
      key: 'first_round',
      label: 'First Round',
      rank: 1,
      bestOf: 7,
      seriesCount: 8,
    },
    {
      key: 'second_round',
      label: 'Second Round',
      rank: 2,
      bestOf: 7,
      seriesCount: 4,
    },
    {
      key: 'conf_finals',
      label: 'Conf Finals',
      rank: 4,
      bestOf: 7,
      seriesCount: 2,
    },
    {
      key: 'stanley_cup_final',
      label: 'Stanley Cup Final',
      rank: 8,
      bestOf: 7,
      seriesCount: 1,
      isMegaPick: true,
    },
  ],

  // Scoring
  seriesLengthBonusPoints: 2,

  // Data source
  espnLeagueSlug: 'hockey/nhl',

  // All 16 playoff teams (representative — actual teams determined at playoff time)
  teams: [
    // Eastern Conference — Atlantic
    {code: 'BOS', name: 'Boston Bruins', shortName: 'BOS'},
    {code: 'TOR', name: 'Toronto Maple Leafs', shortName: 'TOR'},
    {code: 'FLA', name: 'Florida Panthers', shortName: 'FLA'},
    {code: 'TBL', name: 'Tampa Bay Lightning', shortName: 'TBL'},
    // Eastern Conference — Metropolitan
    {code: 'CAR', name: 'Carolina Hurricanes', shortName: 'CAR'},
    {code: 'NJD', name: 'New Jersey Devils', shortName: 'NJD'},
    {code: 'NYR', name: 'New York Rangers', shortName: 'NYR'},
    {code: 'NYI', name: 'New York Islanders', shortName: 'NYI'},
    // Western Conference — Central
    {code: 'DAL', name: 'Dallas Stars', shortName: 'DAL'},
    {code: 'COL', name: 'Colorado Avalanche', shortName: 'COL'},
    {code: 'WPG', name: 'Winnipeg Jets', shortName: 'WPG'},
    {code: 'MIN', name: 'Minnesota Wild', shortName: 'MIN'},
    // Western Conference — Pacific
    {code: 'VGK', name: 'Vegas Golden Knights', shortName: 'VGK'},
    {code: 'EDM', name: 'Edmonton Oilers', shortName: 'EDM'},
    {code: 'VAN', name: 'Vancouver Canucks', shortName: 'VAN'},
    {code: 'LAK', name: 'Los Angeles Kings', shortName: 'LAK'},
  ],
};
