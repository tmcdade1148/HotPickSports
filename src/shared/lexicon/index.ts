// User-facing lexicon — single source of truth for every noun and label
// the user sees in the app. Internal code identifiers (pool_id,
// organizer_id, smacktalk_*, leaderboard_*, etc.) intentionally do NOT
// change. Only the strings rendered to the user.
//
// Spec: 260520_HotPick_LexiconImplementation_Spec.docx
//
// Usage:
//   import {LEXICON, affiliatedWith, gafferOf,
//           leaguesContest, leagueContestTagline,
//           independentContestLabel} from '@shared/lexicon';
//   <Text>YOUR {LEXICON.contest.plural.toUpperCase()}</Text>   // "YOUR CONTESTS"
//   <Text>{affiliatedWith([partner.name])}</Text>              // "Affiliated with Mes Que NFL"
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

  /** "admin" pool_members role in a regular Contest → "Assistant Gaffer".
   *  The Gaffer's delegated helper (the "No. 2"). Short form "AG". Same
   *  internal role as a League-tier Director — see roleLabel(). */
  assistantGaffer: {
    short: 'AG',
    long:  'Assistant Gaffer',
  },

  /** "organizer" of a League's own Club Pool → "the Chairman". One per
   *  League (a pool has exactly one organizer). */
  chairman: {
    short: 'Chairman',
    long:  'the Chairman',
  },

  /** "admin" of a League's own Club Pool → "Director". Multiple allowed;
   *  same League Tools access as the Chairman today. */
  director: {
    short:  'Director',
    plural: 'Directors',
  },

  /** "Partner" in the codebase / business-internal language → "the League"
   *  in user-facing copy. `partner` stays the single canonical INTERNAL name;
   *  the legacy `club_*` columns (`partners.club_pool_id`,
   *  `pools.owning_club_id`) are the SAME concept under an older prefix and
   *  remain frozen internal identifiers — never shown to the user.
   *  PartnerAdminScreen (super-admin internal tool) keeps "Partner" labels
   *  per spec. */
  league: {
    short:  'League',
    long:   'the League',
    plural: 'Leagues',
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

  /** Management-surface names. "Tools" = what a user operates to run their
   *  own Contest/League; contrast with "Admin" = HotPick behind-the-scenes
   *  (PartnerAdminScreen, AdminHome). The Gaffer/Chairman and their
   *  delegates (Assistant Gaffer/Director) use these. */
  gafferTools: 'Gaffer Tools',
  leagueTools: 'League Tools',

  /** Unchanged from the original lexicon (spec lock). */
  roster: 'Roster',
  perks:  'Perks',
  picks:  'Picks',
} as const;

// ---------------------------------------------------------------------------
// Helpers — preferred over inline string literals so the lexicon stays
// consistent across surfaces. If you find yourself writing "Affiliated with ..."
// or "the Gaffer of ..." by hand, use these instead.
// ---------------------------------------------------------------------------

/**
 * Role-in-context sentence form.
 *   gafferOf("Stella's Gang") → "the Gaffer of Stella's Gang"
 */
export function gafferOf(contestName: string): string {
  return `${LEXICON.gaffer.long} of ${contestName}`;
}

/**
 * Badge label for a `pool_members.role`, resolved per tier. The same three
 * internal roles (member / admin / organizer — these NEVER change) render
 * with Contest-tier or League-tier vocabulary:
 *   organizer → Gaffer            (Chairman in a League's Club Pool)
 *   admin     → Assistant Gaffer  (Director in a League's Club Pool)
 *   member    → Player
 * Pass isLeagueTier=true when the pool is the League's own Club Pool
 * (partners.club_pool_id === pool.id).
 */
export function roleLabel(role: string, isLeagueTier = false): string {
  switch (role) {
    case 'organizer':
      return isLeagueTier ? LEXICON.chairman.short : LEXICON.gaffer.short;
    case 'admin':
      return isLeagueTier ? LEXICON.director.short : LEXICON.assistantGaffer.long;
    default:
      return LEXICON.player.singular;
  }
}

/**
 * The League's own Contest. Replaces the older "Club Pool" term used in
 * code/comments/docs (the column stays partners.club_pool_id — a frozen
 * legacy identifier for the partner/League concept).
 * When a League name is provided, returns "[League Name]'s Contest" (e.g.,
 * "Mes Que NFL's Contest"). Otherwise returns "the League's Contest".
 */
export function leaguesContest(leagueName?: string | null): string {
  if (leagueName && leagueName.length > 0) return `${leagueName}'s ${LEXICON.contest.singular}`;
  return `${LEXICON.league.long}'s ${LEXICON.contest.singular}`;
}

/**
 * Tagline for an Official League Contest. A League can run more than one
 * (e.g. ESPN Northeast, ESPN West), so the article is "An", not "The".
 *   leagueContestTagline('ESPN') → "An Official ESPN Contest"
 * Rendered inside the branded header band — small caps, body text.
 */
export function leagueContestTagline(leagueName: string): string {
  return `An Official ${leagueName} ${LEXICON.contest.singular}`;
}

/**
 * Default Gaffer-authored welcome opener pre-filled into the Chirp composer the
 * first time a Contest's Gaffer opens Chirps with no welcome yet. The Gaffer
 * sends it as-is or edits it. The word "Gaffer" is intentionally NOT in the copy
 * — attribution is the Gaffer badge on the message.
 *   welcomeOpenerDefault("Stella's Gang")
 *     → "Welcome to Stella's Gang! I look forward to hearing from you here."
 */
export function welcomeOpenerDefault(contestName: string): string {
  return `Welcome to ${contestName}! I look forward to hearing from you here.`;
}

/**
 * Scoring explainer — makes the HotPick exception explicit. A regular wrong pick
 * is 0 (never a penalty); only the HotPick can lose points.
 */
export const scoringNeverNegative =
  'Regular picks never cost you points — only your HotPick can swing negative.';

/**
 * Organizer money-posture acknowledgment (v2.0). Counsel-approved verbatim
 * wording — June 23 Money Posture spec §6. Do NOT paraphrase. Shown in the
 * unskippable native Alert before a Contest is created; acceptance logs to
 * organizer_acknowledgments at ORGANIZER_ACK_VERSION (CreatePoolScreen).
 */
export const organizerMoneyAcknowledgment =
  'HotPick has no payment features and does not process, collect, hold, or record money. By creating a Contest, you agree that you will not use HotPick — including any Contest, message, profile field, note, or other feature — to collect, request, advertise, track, or administer money, entry fees, buy-ins, prizes, or payouts. Any money arrangement between you and your participants takes place entirely outside HotPick, is solely your responsibility, and is not facilitated, endorsed, or monitored by HotPick.';

/**
 * Affiliation line for a Contest affiliated with one or more Leagues. Scales
 * from 1 affiliation up — the visual footer truncates to a logo cluster
 * for 4+, this helper keeps the text variant readable:
 *   1   → "Affiliated with Hammer's Tavern"
 *   2   → "Affiliated with Hammer's & The Crown"
 *   3   → "Affiliated with Hammer's, The Crown & Joe's"
 *   4+  → "Affiliated with Hammer's, The Crown & 2 more"
 * For empty input, returns an empty string — callers should check
 * length before rendering.
 *
 * Note: an earlier draft used "Endorsed by" / `endorsedBy(name)`. The
 * Gaffer self-submits via PartnerDirectoryScreen, so "Affiliated with" is
 * the accurate vocabulary — the League isn't actively vouching.
 */
export function affiliatedWith(leagueNames: readonly string[]): string {
  const names = leagueNames.filter(n => n && n.length > 0);
  if (names.length === 0) return '';
  if (names.length === 1) return `Affiliated with ${names[0]}`;
  if (names.length === 2) return `Affiliated with ${names[0]} & ${names[1]}`;
  if (names.length === 3) {
    return `Affiliated with ${names[0]}, ${names[1]} & ${names[2]}`;
  }
  const remaining = names.length - 2;
  return `Affiliated with ${names[0]}, ${names[1]} & ${remaining} more`;
}

/**
 * Footer label for a Contest with no Club affiliations. The presence of
 * the Gaffer's first name + last initial turns "Independent" from an
 * absence-signal into a positive identifier.
 *   independentContestLabel('Tom M.') → "Independent · run by Tom M."
 *   independentContestLabel()         → "Independent Contest"
 */
export function independentContestLabel(gafferDisplayName?: string | null): string {
  if (gafferDisplayName && gafferDisplayName.length > 0) {
    return `Independent · run by ${gafferDisplayName}`;
  }
  return `Independent ${LEXICON.contest.singular}`;
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
