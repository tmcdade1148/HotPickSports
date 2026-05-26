// User-facing lexicon — single source of truth for every noun and label
// the user sees in the app. Internal code identifiers (pool_id,
// organizer_id, smacktalk_*, leaderboard_*, etc.) intentionally do NOT
// change. Only the strings rendered to the user.
//
// Spec: 260520_HotPick_LexiconImplementation_Spec.docx
//
// Usage:
//   import {LEXICON, endorsedBy, gafferOf, clubsContest} from '@shared/lexicon';
//   <Text>YOUR {LEXICON.contest.plural.toUpperCase()}</Text>   // "YOUR CONTESTS"
//   <Text>{endorsedBy(partner.name)}</Text>                    // "Endorsed by Mes Que NFL"
//   <Text>You are {gafferOf(pool.name)}.</Text>                // "You are the Gaffer of Stella's Gang."
//
// Article guidance (spec §2):
//   - Full copy keeps the definite article: "the Gaffer of X", "the Ladder".
//   - Chip / pill labels can drop the article when space is tight: "Gaffer".
//   - In doubt, include the article. Use `.long` for sentence-form copy
//     and `.short` for chip-form labels.

export const LEXICON = {
  /** "Pool" in the codebase; "Contest" to the user. */
  contest: {
    singular: 'Contest',
    plural:   'Contests',
  },

  /** "Poolie" (legacy) → "Player". profiles.poolie_name stays as a DB column. */
  player: {
    singular: 'Player',
    plural:   'Players',
  },

  /** "Organizer" in the codebase (role='organizer') → "the Gaffer" in copy.
   *  Use `.long` for sentences ("the Gaffer of Hammer's Contest"),
   *  `.short` for badges/chips ("Gaffer"). */
  gaffer: {
    short: 'Gaffer',
    long:  'the Gaffer',
  },

  /** "Partner" in the codebase / business-internal language → "the Club" in
   *  user-facing copy. PartnerAdminScreen (super-admin internal tool) keeps
   *  "Partner" labels per spec. */
  club: {
    short: 'Club',
    long:  'the Club',
  },

  /** "Leaderboard" / "Standings" → "the Ladder". */
  ladder: {
    short: 'Ladder',
    long:  'the Ladder',
  },

  /** "SmackTalk" → "Chirps". Code identifiers (smack_messages,
   *  smackUnreadCounts, etc.) intentionally unchanged. */
  chirps: {
    singular: 'Chirp',
    plural:   'Chirps',
  },

  /** Unchanged from the original lexicon (spec lock). */
  roster: 'Roster',
  perks:  'Perks',
  picks:  'Picks',
} as const;

// ---------------------------------------------------------------------------
// Helpers — preferred over inline string literals so the lexicon stays
// consistent across surfaces. If you find yourself writing "Endorsed by ..."
// or "the Gaffer of ..." by hand, use these instead.
// ---------------------------------------------------------------------------

/**
 * Affiliation line on a Contest card that's on a Club's roster.
 * Replaces the old "On [X]'s Roster" phrasing.
 *   endorsedBy('Mes Que NFL') → "Endorsed by Mes Que NFL"
 */
export function endorsedBy(clubName: string): string {
  return `Endorsed by ${clubName}`;
}

/**
 * Role-in-context sentence form.
 *   gafferOf("Stella's Gang") → "the Gaffer of Stella's Gang"
 */
export function gafferOf(contestName: string): string {
  return `${LEXICON.gaffer.long} of ${contestName}`;
}

/**
 * The Club's own Contest. Replaces the older "Club Pool" term used in
 * code/comments/docs (the column stays partners.club_pool_id).
 * When a Club name is provided, returns "[Club Name]'s Contest" (e.g.,
 * "Mes Que NFL's Contest"). Otherwise returns "the Club's Contest".
 */
export function clubsContest(clubName?: string | null): string {
  if (clubName && clubName.length > 0) return `${clubName}'s ${LEXICON.contest.singular}`;
  return `${LEXICON.club.long}'s ${LEXICON.contest.singular}`;
}

/**
 * Build a "X Contests" / "1 Contest" count phrase. Use when a count is
 * dynamic and the noun must pluralize correctly.
 *   countLabel('contest', 5) → "5 Contests"
 *   countLabel('contest', 1) → "1 Contest"
 */
export function countLabel(
  noun: 'contest' | 'player' | 'chirps',
  n: number,
): string {
  const def = LEXICON[noun];
  const word = n === 1 ? def.singular : def.plural;
  return `${n} ${word}`;
}
