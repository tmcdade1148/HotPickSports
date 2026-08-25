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
   *  label at every tier, Club Contest included — see roleLabel(). */
  assistantGaffer: {
    short: 'AG',
    long:  'Assistant Gaffer',
  },

  /** The League's board seat (`partner_members`, role 'director'). One or
   *  more per League; every Director has the same League Tools access, and
   *  any Director may add or remove another. There is no Chairman — the role
   *  was removed 2026-08-22 (Hard Rule #24, amended). */
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
   *  (PartnerAdminScreen, AdminHome). The Gaffer and their delegates
   *  (Assistant Gaffer), and a League's Directors, use these. */
  gafferTools: 'Gaffer Tools',
  leagueTools: 'League Tools',

  /** Unchanged from the original lexicon (spec lock). */
  roster: 'Roster',
  perks:  'Perks',
  picks:  'Picks',

  /** The onboarding demo's user-facing name — the ONE word for that state.
   *  The header period pill has read PRACTICE since the demo shipped, and the
   *  Picks-screen safety banner reads the same word. A banner and a pill that
   *  can drift to two names for one state is the bug that constant exists to
   *  prevent, so both import THIS rather than holding their own literal.
   *  Deliberately not "DEMO": two names for one state is worse than no name. */
  practice: 'PRACTICE',
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
 * Badge label for a `pool_members.role`. The three internal roles (member /
 * admin / organizer — these NEVER change) render as:
 *   organizer → Gaffer
 *   admin     → Assistant Gaffer
 *   member    → Player
 *
 * Tier-independent since 2026-08-22. A League's own Club Contest used to
 * relabel these seats (organizer → "Chairman", admin → "Director"), which is
 * why this took an isLeagueTier flag. Chairman is gone, and "Director" now
 * means a seat on the partner board (`partner_members`) — a different table
 * from `pool_members`. Reusing the word for a pool admin implied a fused
 * partner-gaffer role that does not exist, so a Club Contest's seats read
 * exactly like every other Contest's. Hard Rule #24, amended.
 */
export function roleLabel(role: string): string {
  switch (role) {
    case 'organizer':
      return LEXICON.gaffer.short;
    case 'admin':
      return LEXICON.assistantGaffer.long;
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
 * Tagline for an Official League Contest.
 *   leagueContestTagline('The Natural') → "Official Contest of The Natural"
 * Renders uppercased on the branded header band: "OFFICIAL CONTEST OF THE
 * NATURAL". No colon.
 *
 * The "of" form carries the League name last, which is what the band is
 * there to show — and it reads correctly whether or not the name already
 * starts with an article ("Official Contest of The Natural" vs the older
 * "An Official The Natural Contest"). It also stays true when a League runs
 * more than one Contest (ESPN Northeast, ESPN West): each is *an* official
 * Contest of that League without the tagline having to claim it is the only
 * one, which is what the earlier "An" was doing the work of.
 */
export function leagueContestTagline(leagueName: string): string {
  return `Official ${LEXICON.contest.singular} of ${leagueName}`;
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
 * Gaffer Approval Gate — applicant-facing. Shown in the join waiting-room
 * confirmation and as the applicant's standing Message Center entry. Keeps the
 * definite article on "the Gaffer" per §2.
 *   applicationPendingMessage("Stella's Gang")
 *     → "Your request to join Stella's Gang is in. You'll get your spot as soon
 *        as the Gaffer approves you."
 */
export function applicationPendingMessage(contestName: string): string {
  return `Your request to join ${contestName} is in. You'll get your spot as soon as ${LEXICON.gaffer.long} approves you.`;
}

/**
 * Gaffer Approval Gate — Gaffer-facing standing prompt. ONE per Contest with any
 * applicants awaiting approval, never one per applicant, so the copy is
 * deliberately count-free (see the inherent-dedup design). The entry is tappable
 * → the Members screen.
 *   gafferPendingAlertMessage("Stella's Gang")
 *     → "You have Players waiting to join Stella's Gang. Tap to review them."
 */
export function gafferPendingAlertMessage(contestName: string): string {
  return `You have ${LEXICON.player.plural} waiting to join ${contestName}. Tap to review them.`;
}

/**
 * Scoring explainer — makes the HotPick exception explicit. A regular wrong pick
 * is 0 (never a penalty); only the HotPick can lose points.
 */
export const scoringNeverNegative =
  'Regular picks never cost you points — only your HotPick can swing negative.';

/**
 * Email-confirmation hold (email/password signup). With "Confirm email" on,
 * signUp returns a user but a NULL session until the address is confirmed via
 * the emailed link — so we stop here instead of entering onboarding without a
 * JWT. Shown on the EmailEntry screen after a pending-confirmation signUp.
 */
export const confirmEmailMessage =
  'Almost in. Confirm your email with the link we sent, then sign in.';

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
 * The Open Door — house Contest prompt under the invite-code field, for a
 * download that arrives without a code.
 *
 * `code` comes from the competition_config global key `house_contest_code` and
 * is NEVER hardcoded: it rolls to 26B/26C as cohorts fill, and an empty value
 * hides the line entirely (the kill switch). Display-only copy pointing at the
 * input already on screen, deliberately not a second join path.
 *   houseContestPrompt('HOTPICK26A')
 *     → "No code yet? Use HOTPICK26A. You'll be picking against a room of
 *        Players you haven't met yet."
 */
export function houseContestPrompt(code: string): string {
  return `No code yet? Use ${code}. You'll be picking against a room of ${LEXICON.player.plural} you haven't met yet.`;
}

/**
 * Chirps-off explainer, rendered where the composer would be in a Contest with
 * `pools.chirps_enabled = false` (today: the open house Contest only).
 *
 * Written as a reason to start or join a private Contest, never as a
 * disabled-feature notice. The feed keeps rendering above it — system messages
 * (score updates, pick locks, week results) still land and still show, which is
 * the whole reason the tab stays put.
 */
export const chirpsOffHeading =
  `${LEXICON.chirps.plural} live in private ${LEXICON.contest.plural}`;

export const chirpsOffBody =
  `This one's open to anyone with the code, so it's ${LEXICON.picks} and ${LEXICON.ladder.long} here. ` +
  `${LEXICON.chirps.plural} land differently when you know exactly who just called you out.`;

export const chirpsOffStartCta = `Start a ${LEXICON.contest.singular}`;
export const chirpsOffJoinCta = 'Enter a code';

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
