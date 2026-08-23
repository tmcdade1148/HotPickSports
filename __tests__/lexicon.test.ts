// Locks the user-facing lexicon to the spec's locked decisions
// (260520_HotPick_LexiconImplementation_Spec.docx §2). Any accidental drift
// from "Contest" / "Player" / "Gaffer" / "League" / "Ladder" / "Chirp" /
// "Affiliated with X" trips this test before users see it.

import {
  LEXICON,
  affiliatedWith,
  gafferOf,
  roleLabel,
  leaguesContest,
  leagueContestTagline,
  independentContestLabel,
  countLabel,
} from '../src/shared/lexicon';

describe('LEXICON constants', () => {
  it('Contest singular and plural', () => {
    expect(LEXICON.contest.singular).toBe('Contest');
    expect(LEXICON.contest.plural).toBe('Contests');
  });

  it('Player singular and plural', () => {
    expect(LEXICON.player.singular).toBe('Player');
    expect(LEXICON.player.plural).toBe('Players');
  });

  it('Gaffer short and long', () => {
    expect(LEXICON.gaffer.short).toBe('Gaffer');
    expect(LEXICON.gaffer.long).toBe('the Gaffer');
  });

  it('Assistant Gaffer short and long', () => {
    expect(LEXICON.assistantGaffer.short).toBe('AG');
    expect(LEXICON.assistantGaffer.long).toBe('Assistant Gaffer');
  });

  it('has no Chairman — the role was removed 2026-08-22', () => {
    expect((LEXICON as Record<string, unknown>).chairman).toBeUndefined();
  });

  it('Director short and plural', () => {
    expect(LEXICON.director.short).toBe('Director');
    expect(LEXICON.director.plural).toBe('Directors');
  });

  it('League short, long and plural', () => {
    expect(LEXICON.league.short).toBe('League');
    expect(LEXICON.league.long).toBe('the League');
    expect(LEXICON.league.plural).toBe('Leagues');
  });

  it('Ladder short and long', () => {
    expect(LEXICON.ladder.short).toBe('Ladder');
    expect(LEXICON.ladder.long).toBe('the Ladder');
  });

  it('Chirp singular and plural', () => {
    expect(LEXICON.chirps.singular).toBe('Chirp');
    expect(LEXICON.chirps.plural).toBe('Chirps');
  });

  it('Tool-surface names', () => {
    expect(LEXICON.gafferTools).toBe('Gaffer Tools');
    expect(LEXICON.leagueTools).toBe('League Tools');
  });

  it('Roster, Perks, Picks unchanged from prior lexicon', () => {
    expect(LEXICON.roster).toBe('Roster');
    expect(LEXICON.perks).toBe('Perks');
    expect(LEXICON.picks).toBe('Picks');
  });
});

describe('gafferOf()', () => {
  it('keeps the definite article in long copy', () => {
    expect(gafferOf("Stella's Gang")).toBe("the Gaffer of Stella's Gang");
  });
});

describe('roleLabel()', () => {
  // One case, not two. These seats used to relabel inside a League's own Club
  // Contest (organizer → "Chairman", admin → "Director"), so this had a
  // per-tier test pair. Chairman is gone, and "Director" now means a
  // partner_members seat — a different table — so reusing it for a pool admin
  // implied a fused partner-gaffer role that doesn't exist. The labels are
  // tier-independent now, and a second identical case would only look like
  // coverage. Amended 2026-08-22 (Hard Rule #24).
  it('maps to Gaffer / Assistant Gaffer / Player at every tier', () => {
    expect(roleLabel('organizer')).toBe('Gaffer');
    expect(roleLabel('admin')).toBe('Assistant Gaffer');
    expect(roleLabel('member')).toBe('Player');
  });
});

describe('leaguesContest()', () => {
  it('with a league name', () => {
    expect(leaguesContest('Mes Que NFL')).toBe("Mes Que NFL's Contest");
  });
  it('without a league name falls back to generic', () => {
    expect(leaguesContest()).toBe("the League's Contest");
    expect(leaguesContest(null)).toBe("the League's Contest");
    expect(leaguesContest('')).toBe("the League's Contest");
  });
});

describe('leagueContestTagline()', () => {
  it('puts the League name last, after "of"', () => {
    expect(leagueContestTagline('ESPN')).toBe('Official Contest of ESPN');
    expect(leagueContestTagline("Hammer's Tavern")).toBe(
      "Official Contest of Hammer's Tavern",
    );
  });

  it('reads correctly for a League name that starts with an article', () => {
    // The reason the phrasing moved off "An Official [Name] Contest": with a
    // name like The Natural that produced "An Official The Natural Contest".
    expect(leagueContestTagline('The Natural')).toBe(
      'Official Contest of The Natural',
    );
    expect(leagueContestTagline('The Natural').toUpperCase()).toBe(
      'OFFICIAL CONTEST OF THE NATURAL',
    );
  });

  it('still reads as one-of-many for a League running several Contests', () => {
    // The old "An" carried this; "of" carries it now without the tagline
    // having to claim the Contest is the League's only one.
    expect(leagueContestTagline('ESPN Northeast')).toBe(
      'Official Contest of ESPN Northeast',
    );
    expect(leagueContestTagline('ESPN West')).toBe(
      'Official Contest of ESPN West',
    );
  });
});

describe('affiliatedWith()', () => {
  it('returns empty string when no leagues', () => {
    expect(affiliatedWith([])).toBe('');
    expect(affiliatedWith(['', ''])).toBe('');
  });
  it('one affiliation', () => {
    expect(affiliatedWith(['Hammer'])).toBe('Affiliated with Hammer');
  });
  it('two affiliations join with &', () => {
    expect(affiliatedWith(['Hammer', 'The Crown'])).toBe(
      'Affiliated with Hammer & The Crown',
    );
  });
  it('three affiliations use serial comma + &', () => {
    expect(affiliatedWith(['Hammer', 'The Crown', "Joe's"])).toBe(
      "Affiliated with Hammer, The Crown & Joe's",
    );
  });
  it('four or more collapses the tail to a count', () => {
    expect(affiliatedWith(['A', 'B', 'C', 'D'])).toBe(
      'Affiliated with A, B & 2 more',
    );
    expect(affiliatedWith(['A', 'B', 'C', 'D', 'E'])).toBe(
      'Affiliated with A, B & 3 more',
    );
  });
});

describe('independentContestLabel()', () => {
  it('with a Gaffer name shows the run-by phrase', () => {
    expect(independentContestLabel('Tom M.')).toBe('Independent · run by Tom M.');
  });
  it('without a Gaffer name falls back to the generic noun', () => {
    expect(independentContestLabel()).toBe('Independent Contest');
    expect(independentContestLabel(null)).toBe('Independent Contest');
    expect(independentContestLabel('')).toBe('Independent Contest');
  });
});

describe('countLabel()', () => {
  it('singularizes at 1', () => {
    expect(countLabel('contest', 1)).toBe('1 Contest');
    expect(countLabel('player', 1)).toBe('1 Player');
    expect(countLabel('chirps', 1)).toBe('1 Chirp');
  });
  it('pluralizes at 0 and ≥2', () => {
    expect(countLabel('contest', 0)).toBe('0 Contests');
    expect(countLabel('contest', 5)).toBe('5 Contests');
    expect(countLabel('player', 12)).toBe('12 Players');
    expect(countLabel('chirps', 9)).toBe('9 Chirps');
  });
});
