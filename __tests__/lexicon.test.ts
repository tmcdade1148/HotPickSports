// Locks the user-facing lexicon to the spec's locked decisions
// (260520_HotPick_LexiconImplementation_Spec.docx §2). Any accidental drift
// from "Contest" / "Player" / "Gaffer" / "Club" / "Ladder" / "Chirp" /
// "Endorsed by X" trips this test before users see it.

import {
  LEXICON,
  endorsedBy,
  gafferOf,
  clubsContest,
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

  it('Club short and long', () => {
    expect(LEXICON.club.short).toBe('Club');
    expect(LEXICON.club.long).toBe('the Club');
  });

  it('Ladder short and long', () => {
    expect(LEXICON.ladder.short).toBe('Ladder');
    expect(LEXICON.ladder.long).toBe('the Ladder');
  });

  it('Chirp singular and plural', () => {
    expect(LEXICON.chirps.singular).toBe('Chirp');
    expect(LEXICON.chirps.plural).toBe('Chirps');
  });

  it('Roster, Perks, Picks unchanged from prior lexicon', () => {
    expect(LEXICON.roster).toBe('Roster');
    expect(LEXICON.perks).toBe('Perks');
    expect(LEXICON.picks).toBe('Picks');
  });
});

describe('endorsedBy()', () => {
  it('builds the affiliation line', () => {
    expect(endorsedBy('Mes Que NFL')).toBe('Endorsed by Mes Que NFL');
    expect(endorsedBy('Big Tree Inn')).toBe('Endorsed by Big Tree Inn');
  });
});

describe('gafferOf()', () => {
  it('keeps the definite article in long copy', () => {
    expect(gafferOf("Stella's Gang")).toBe("the Gaffer of Stella's Gang");
  });
});

describe('clubsContest()', () => {
  it('with a club name', () => {
    expect(clubsContest('Mes Que NFL')).toBe("Mes Que NFL's Contest");
  });
  it('without a club name falls back to generic', () => {
    expect(clubsContest()).toBe("the Club's Contest");
    expect(clubsContest(null)).toBe("the Club's Contest");
    expect(clubsContest('')).toBe("the Club's Contest");
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
