import type {TournamentConfig} from '@shared/types/templates';

export const worldCup2026: TournamentConfig = {
  competition: 'world_cup_2026',
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
    // Placeholder teams for groups I-L — replace with actual draw when finalized
    {
      name: 'I',
      teams: [
        {code: 'I1', name: 'Group I Team 1', shortName: 'I1'},
        {code: 'I2', name: 'Group I Team 2', shortName: 'I2'},
        {code: 'I3', name: 'Group I Team 3', shortName: 'I3'},
        {code: 'I4', name: 'Group I Team 4', shortName: 'I4'},
      ],
    },
    {
      name: 'J',
      teams: [
        {code: 'J1', name: 'Group J Team 1', shortName: 'J1'},
        {code: 'J2', name: 'Group J Team 2', shortName: 'J2'},
        {code: 'J3', name: 'Group J Team 3', shortName: 'J3'},
        {code: 'J4', name: 'Group J Team 4', shortName: 'J4'},
      ],
    },
    {
      name: 'K',
      teams: [
        {code: 'K1', name: 'Group K Team 1', shortName: 'K1'},
        {code: 'K2', name: 'Group K Team 2', shortName: 'K2'},
        {code: 'K3', name: 'Group K Team 3', shortName: 'K3'},
        {code: 'K4', name: 'Group K Team 4', shortName: 'K4'},
      ],
    },
    {
      name: 'L',
      teams: [
        {code: 'L1', name: 'Group L Team 1', shortName: 'L1'},
        {code: 'L2', name: 'Group L Team 2', shortName: 'L2'},
        {code: 'L3', name: 'Group L Team 3', shortName: 'L3'},
        {code: 'L4', name: 'Group L Team 4', shortName: 'L4'},
      ],
    },
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

  // Scoring — 12 groups × 2 advancing × 2 pts = 48 group pts
  // Knockout: 16+8+4+2+1 = 31 matches at 1 pt each = 31 knockout pts
  // maxTotalPoints = 48 + 31 = 79 (regular picks, no HotPick bonus)
  groupCorrectAdvancementPoints: 2,
  maxGroupPoints: 48,
  maxTotalPoints: 79,

  // Data source
  espnLeagueSlug: 'soccer/fifa.world',
};
