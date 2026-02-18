import type {TournamentConfig} from '@shared/types/templates';

export const worldCup2026: TournamentConfig = {
  eventId: 'wc-2026',
  templateType: 'tournament',
  sport: 'soccer',
  name: 'FIFA World Cup 2026',
  shortName: 'World Cup',
  status: 'upcoming',
  startDate: '2026-06-11',
  endDate: '2026-07-19',
  picksOpenDate: '2026-05-27',
  color: '#8B1A4A',
  tabs: [
    {key: 'picks', label: 'Picks', icon: 'check-circle'},
    {key: 'groups', label: 'Groups', icon: 'grid-3x3'},
    {key: 'board', label: 'Board', icon: 'bar-chart-2'},
    {key: 'smacktalk', label: 'SmackTalk', icon: 'message-circle'},
  ],

  // Group stage
  groups: [
    {
      name: 'A',
      teams: [
        {code: 'QAT', name: 'Qatar', shortName: 'QAT'},
        {code: 'ECU', name: 'Ecuador', shortName: 'ECU'},
        {code: 'SEN', name: 'Senegal', shortName: 'SEN'},
        {code: 'NED', name: 'Netherlands', shortName: 'NED'},
      ],
    },
    {
      name: 'B',
      teams: [
        {code: 'ENG', name: 'England', shortName: 'ENG'},
        {code: 'IRN', name: 'Iran', shortName: 'IRN'},
        {code: 'USA', name: 'United States', shortName: 'USA'},
        {code: 'WAL', name: 'Wales', shortName: 'WAL'},
      ],
    },
    {
      name: 'C',
      teams: [
        {code: 'ARG', name: 'Argentina', shortName: 'ARG'},
        {code: 'KSA', name: 'Saudi Arabia', shortName: 'KSA'},
        {code: 'MEX', name: 'Mexico', shortName: 'MEX'},
        {code: 'POL', name: 'Poland', shortName: 'POL'},
      ],
    },
    {
      name: 'D',
      teams: [
        {code: 'FRA', name: 'France', shortName: 'FRA'},
        {code: 'AUS', name: 'Australia', shortName: 'AUS'},
        {code: 'DEN', name: 'Denmark', shortName: 'DEN'},
        {code: 'TUN', name: 'Tunisia', shortName: 'TUN'},
      ],
    },
    {
      name: 'E',
      teams: [
        {code: 'ESP', name: 'Spain', shortName: 'ESP'},
        {code: 'CRC', name: 'Costa Rica', shortName: 'CRC'},
        {code: 'GER', name: 'Germany', shortName: 'GER'},
        {code: 'JPN', name: 'Japan', shortName: 'JPN'},
      ],
    },
    {
      name: 'F',
      teams: [
        {code: 'BEL', name: 'Belgium', shortName: 'BEL'},
        {code: 'CAN', name: 'Canada', shortName: 'CAN'},
        {code: 'MAR', name: 'Morocco', shortName: 'MAR'},
        {code: 'CRO', name: 'Croatia', shortName: 'CRO'},
      ],
    },
    {
      name: 'G',
      teams: [
        {code: 'BRA', name: 'Brazil', shortName: 'BRA'},
        {code: 'SRB', name: 'Serbia', shortName: 'SRB'},
        {code: 'SUI', name: 'Switzerland', shortName: 'SUI'},
        {code: 'CMR', name: 'Cameroon', shortName: 'CMR'},
      ],
    },
    {
      name: 'H',
      teams: [
        {code: 'POR', name: 'Portugal', shortName: 'POR'},
        {code: 'GHA', name: 'Ghana', shortName: 'GHA'},
        {code: 'URU', name: 'Uruguay', shortName: 'URU'},
        {code: 'KOR', name: 'South Korea', shortName: 'KOR'},
      ],
    },
    // TODO: Add groups I through L when 2026 draw is finalized
    // World Cup 2026 will have 12 groups of 4 teams (48 teams total)
  ],
  advancingPerGroup: 2,
  groupPicksRequired: true,

  // Knockout stage
  knockoutRounds: [
    {key: 'round_of_32', label: 'Round of 32', rank: 3, matchCount: 16},
    {key: 'round_of_16', label: 'Round of 16', rank: 4, matchCount: 8},
    {key: 'quarter_final', label: 'Quarter-Finals', rank: 6, matchCount: 4},
    {key: 'semi_final', label: 'Semi-Finals', rank: 8, matchCount: 2},
    {key: 'final', label: 'Final', rank: 10, matchCount: 1, isMegaPick: true},
  ],

  // Scoring
  groupCorrectAdvancementPoints: 2,
  maxGroupPoints: 68,
  maxTotalPoints: 139,

  // Data source
  espnLeagueSlug: 'soccer/fifa.world',
};
