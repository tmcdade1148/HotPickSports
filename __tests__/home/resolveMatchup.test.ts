// __tests__/home/resolveMatchup.test.ts
// Recap matchup line — pure-function tests for the away-first resolver behind
// the shared RecapCard's HotPick line. No store, no rendering.
//
// The ordering rule is the whole point and it is easy to get backwards, so it is
// locked here rather than left to a device pass to catch: the slate is AWAY @
// HOME (NFL scoreboard order), never "my team first". The home-team case — where
// the HotPick must land SECOND and still read bold — is the one a device pass
// can't produce on demand, since it depends on which side the user happened to
// pick that week.
//
// Also locks the fallbacks, which exist so the line can never regress to a blank
// or "vs undefined": week not cached, team not in the slate, no team at all.

import {resolveMatchup} from '@shell/components/home/weekRecap';

// One week's slate, shaped as seasonStore.allWeekGames already caches it. Only
// the two team columns matter to the resolver.
const SLATE = [
  {away_team: 'BUF', home_team: 'MIA'},
  {away_team: 'KC', home_team: 'DEN'},
];

describe('resolveMatchup — away-first ordering', () => {
  test('HotPick on the AWAY team → it is first, and flagged as away', () => {
    expect(resolveMatchup(SLATE, 'BUF')).toEqual({
      away: 'BUFFALO BILLS',
      home: 'MIAMI DOLPHINS',
      hotPickIsHome: false,
    });
  });

  test('HotPick on the HOME team → order is UNCHANGED, it is still second', () => {
    // The bold follows hotPickIsHome, so the card bolds the second name here —
    // the pick never gets promoted to the front.
    expect(resolveMatchup(SLATE, 'MIA')).toEqual({
      away: 'BUFFALO BILLS',
      home: 'MIAMI DOLPHINS',
      hotPickIsHome: true,
    });
  });

  test('the away/home pair comes from the GAME, not the argument order', () => {
    expect(resolveMatchup(SLATE, 'DEN')).toEqual({
      away: 'KANSAS CITY CHIEFS',
      home: 'DENVER BRONCOS',
      hotPickIsHome: true,
    });
  });

  test('team code casing does not decide the match', () => {
    expect(resolveMatchup(SLATE, 'buf')?.hotPickIsHome).toBe(false);
    expect(resolveMatchup(SLATE, 'mia')?.hotPickIsHome).toBe(true);
  });
});

describe('resolveMatchup — fallbacks (the card shows the team alone)', () => {
  test('week not loaded → null, never a half-built matchup', () => {
    // The prior-week eyebrow hits this on a cold launch: Home caches only the
    // CURRENT week, so allWeekGames[currentWeek − 1] is undefined.
    expect(resolveMatchup(undefined, 'BUF')).toBeNull();
  });

  test('empty slate → null', () => {
    expect(resolveMatchup([], 'BUF')).toBeNull();
  });

  test("team not in that week's slate → null", () => {
    // A bye week, or a team/week mismatch — must not resolve to "vs undefined".
    expect(resolveMatchup(SLATE, 'PHI')).toBeNull();
  });

  test('no HotPick team → null', () => {
    expect(resolveMatchup(SLATE, null)).toBeNull();
  });

  test('an unknown abbreviation still resolves, surfacing the raw code', () => {
    // fullTeamName returns the code for teams it doesn't know (expansion, or a
    // seed using a different abbreviation) — the matchup must still render.
    expect(resolveMatchup([{away_team: 'BUF', home_team: 'XXX'}], 'XXX')).toEqual({
      away: 'BUFFALO BILLS',
      home: 'XXX',
      hotPickIsHome: true,
    });
  });
});
