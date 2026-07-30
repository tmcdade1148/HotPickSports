# HotPick Sports Lexicon — Master Reference

*Canonical terminology reference for HotPick Sports.*
*Locked: May 20, 2026. Updated: June 2026 (Club → League; added the Chairman). Replaces all prior pool / poolie / partner / leaderboard language.*

---

## What This Document Is

The single source of truth for HotPick Sports user-facing language. Every term in this document was the result of a deliberate design exercise in May 2026. Any future copy, UI, marketing material, push notification, email, App Store description, or external communication should pull from this document. Do not improvise. Do not reopen.

Companion to: `hotpick-brand-voice` skill, `hotpick-legal-guardrails` skill, `hotpick-gtm-reality-v2.md`.

---

## The Locked Lexicon

| Slot | Term | Notes |
|------|------|-------|
| The competitive unit | **the Contest** | Where Players come together to compete all season. Singular: a Contest. Plural: Contests. |
| The individual user | **Player** | A Player makes Picks each week. |
| The Contest runner | **the Gaffer** | Who creates and runs a Contest. Article ("the") used in copy; UI labels can drop article where space is tight. |
| The host entity (user-facing) | **the League** | Sports bars, restaurants, media companies, brands, leagues, corporate groups, communities — any organization that builds a presence on HotPick. Replaces "the Club" (June 2026 update). |
| The host entity (internal/business) | **Partner** | The organization itself: the bar or the brand. Stays as the internal term. Each Partner runs a League. Used in business development conversations, contracts, admin tools. |
| The person who runs the League for the Partner | **the Chairman** | The human running the HotPick initiative on the Partner's behalf. Operates the Partner's League: sets Perks, oversees the Roster, broadcasts to Players across all affiliated Contests. Distinct from the Gaffer, who runs a single Contest. Article ("the") used in copy. |
| The physical venue | **the Club** | The bar, restaurant, or physical space where the League operates. Informal contextual term; not a formal user-facing product label. "The Gaffer works out of the Club." |
| The League's list of affiliated Contests | **Roster** | Stays. The underlying structural list. |
| The user-facing affiliation phrase | **"Endorsed by [League]"** | Replaces "On [League]'s Roster" in user-facing UI. Visual treatment should signal seal of approval. |
| The League's own flagship Contest | **the All-Stars** | Only available to non-bar Leagues (see Structural Rules below). Hosts a Contest curated by the League where the best Players compete to be League Champion. |
| The season-end title from an All-Stars Contest | **League Champion** | Awarded to the winner of the All-Stars Contest at the end of the season. |
| The standings | **the Ladder** | All Contest leaderboards become the Ladder. |
| Benefits the League offers Contests | **Perks** | Free Tapas Tuesdays, member events, discounts, etc. Stays as the term. |
| In-Contest chatter | **Chirps** | Short, snappy. Send a Chirp. 3 new Chirps. Replaces SmackTalk. |
| Game predictions | **Picks** | Stays. The user makes Picks every week. HotPick remains the brand. |

---

## The System Read

A League hosts a Roster of Contests. The Chairman runs the League for the Partner, setting Perks and broadcasting to Players across the Roster. Each Contest has a Gaffer who runs it and Players who make Picks every week. Contests climb the Ladder. The Perks are what the League offers the Contests on its Roster, in exchange for the affiliation. The Chirps are where the week happens out loud.

For Leagues that also host their own flagship Contest, the All-Stars sits alongside the Roster. The winner of the All-Stars at season's end is the League Champion.

Two roles, two scopes. The Chairman runs a League (the brand-level entity and its whole Roster). The Gaffer runs a Contest (a single group inside that Roster). Don't use them interchangeably.

---

## Structural Rules

### Who hosts an All-Stars Contest

| Organization type | Endorsement Roster | All-Stars Contest |
|-----------|--------------------|-----|
| Bars / restaurants | Yes | No (compliance) |
| Media companies | Yes | Yes |
| Brands | Yes | Yes |
| Corporate organizations | Yes | Yes |
| Leagues / sports orgs | Yes | Yes |
| Community groups | Yes | Yes |

Bars and restaurants operate as Endorsement-only Leagues. They put their seal on Contests, offer Perks to attract foot traffic, and gain visibility — but they do not host their own competing Contest. This is a product constraint driven by liquor license and gambling-adjacent regulatory exposure. It also makes the bar League value proposition cleaner: low-risk, high-value endorsement play.

Non-bar League types may host both an Endorsement Roster and an All-Stars Contest. The All-Stars is the League's curated flagship, where Players from across the Roster come together to compete for the League Champion title.

### When "the" is used before a term

Some terms take the definite article in copy: the Gaffer, the Chairman, the League, the Ladder, the All-Stars. This adds weight to the role and consistency across the system. UI labels may drop the article where space is tight (a "Gaffer" chip next to a name is fine), but full copy should retain it ("the Gaffer of Hammer's Contest").

When in doubt, include the article.

---

## Reference UI Strings

### Section headers
- YOUR CONTESTS
- THE LADDER
- CHIRPS

### Card title and metadata
```
STELLA'S GANG
Season: 1st (of 12)
Week: 1st
─────────────────────
[✔] Endorsed by Mes Que NFL
[beer icon] Perks: Free Tapas Tuesdays
```

### CTAs
- Create a Contest
- Join a Contest
- Send a Chirp
- View the Ladder
- Join the All-Stars *(non-bar Leagues only)*

### Affiliation lines
- "Endorsed by Mes Que NFL"
- "Endorsed by Big Tree Inn"
- "Endorsed by ESPN" *(future, hypothetical)*

### Role descriptions
- "Tom is the Gaffer of Hammer's Contest."
- "Stella runs Stella's Gang as the Gaffer."
- "Stella's Gang is endorsed by Mes Que."
- "Jim is the Chairman of the Mes Que NFL League."

### Perks line
- "Perks: Free Tapas Tuesdays"
- "Perks: Members-only kickoff events"

### Push notifications
- "New Chirp in Hammer's Contest"
- "You moved up on the Ladder"
- "Hammer's Contest locks in 1 hour"
- "Stella's Gang just took 1st in the Mes Que NFL Ladder"
- "Big Tree Inn's All-Stars: 3 weeks left to climb"

### Core demo sentence
*Use this when explaining HotPick in conversation:*
> "You login and create or join a Contest of friends or coworkers that runs all season by picking winners in every NFL game."

### Marketing pull (for All-Stars-capable Leagues)
> "Stella's Gang are the Mes Que NFL All-Stars, competing for the title of Mes Que League Champion."

---

## What This Lexicon Avoided

For future reference, here is what we deliberately moved away from and why. This protects against drift back to older language.

| Old / Rejected | Why it was rejected |
|----------------|---------------------|
| Pool | Gambling-frame echo (office pool, betting pool). Removed entirely from user-facing surfaces. |
| Side / Outfit / Pack / Crew / Squad / Campaign | All carry team-cooperation echoes. Players in a HotPick Contest compete against each other, not as a team. |
| Heat / Run / Marathon / Race / Tour | Event-momentary or duration-event coded. A Contest is a long-form competitive structure, not a single event. |
| Smacktalk | American-bro register. Doesn't match the warm-and-dry Ted-Lasso-to-Gervais voice. |
| Spread (for Perks) | Sports-betting term. "Point spread." Removed for legal exposure. |
| Comps (for Perks) | Implies free, when Perks may include discounts, priority, member access, not just freebies. |
| Welcome (for Perks) | Hospitality-passive. Doesn't communicate active value-of-joining. |
| Patches (for Perks) | Forced a visual-collectible metaphor that didn't fit the actual use case. |
| Invitational / Classic (for the All-Stars) | Country-club prestige register, mismatched with the Buffalo bar / Bills Mafia context. |
| Contenders (for the All-Stars) | Lacks aspirational pull. "Contenders" sounds like the also-rans pursuing the title, not those who've arrived. |
| First Team (for the All-Stars) | Team-cooperation echo. Originally locked, then reopened when the structural rule "pools aren't teams" surfaced. |
| Main Event (for the All-Stars) | Single-event echo. Boxing's Main Event is one night, not a season-long Contest. |
| Club (as host entity) | Replaced by League in June 2026 update. "Club" now refers informally to the physical venue where a League operates. |

---

## Legal-Guardrails Implications

This lexicon was designed in consultation with the legal-guardrails rules. Specific calls:

- **"Pool" eliminated** from user-facing surfaces to remove gambling-frame surface area
- **"Spread" rejected** for the same reason (point spread is a betting term)
- **"Stakes," "wager," "bet," "odds"** continue to be banned in all HotPick copy (per existing legal-guardrails)
- **"Endorsed by" is a marketing relationship, not a financial one** — bar/restaurant Endorsements are hospitality affiliations, not commercial or revenue-share relationships in copy unless explicitly contracted
- **The Bar / Restaurant structural rule** (no All-Stars Contest hosted by a bar) is documented here as a product constraint specifically to reduce liquor license and gambling-adjacent regulatory risk

When any new HotPick copy is written, run it through `hotpick-legal-guardrails`. The new lexicon does not exempt copy from that review.

---

## Brand Voice Implications

The new lexicon was designed within the established HotPick brand voice. Specific notes:

- **No em dashes anywhere** in user-facing copy (per voice rules)
- **Warmth ceiling: Ted Lasso.** Wit floor: Ricky Gervais. The new terms (the Gaffer, the Chairman, Chirps, the Ladder, the League) sit between those two reference points
- **No inspirational-poster register.** The terms are sports-grounded, not aspirational-cliché
- **No startup vocabulary.** No "leverage," "ecosystem," "synergy"

When any new HotPick copy is written, run it through `hotpick-brand-voice`. The new lexicon provides the words; the voice skill ensures they're used correctly.

---

## Implementation Status

**Dev spec issued:** `260520_HotPick_LexiconImplementation_Spec.docx`

**June 2026 update:** Club → League throughout all user-facing copy and documentation, plus the addition of the Chairman role (the person who runs a League for a Partner). A new dev spec or addendum may be required to reflect these changes in UI strings and any hardcoded references to "Club."

**What is in flight:**
- App UI string replacement
- Push notification copy update
- Onboarding flow update
- Empty states and error messages
- Help text and tooltips

**What is deferred:**
- All-Stars feature implementation (separate spec required)
- Partner-type categorization schema (preparatory for All-Stars, deferred)
- App Store and Google Play description updates (separate workflow)
- Marketing site copy and external collateral (marketing team)

---

## Open Questions

These items may surface during implementation or after launch. Park them here rather than improvise.

- Should the public website (when built at tommcdade.com or hotpicksports.com) use the same lexicon end-to-end, or does the marketing site keep a different register for SEO and conversion purposes?
- Internal admin tools currently use "Organizer" and "Pool." Convert to the new lexicon or keep the old terminology for staff workflows? *(Recommendation: keep internal admin language unchanged for now to avoid retraining cost; revisit at year-end.)*
- Analytics events currently named with old terminology (e.g., `pool_created`). Stay as-is to preserve historical continuity, or rename? *(Recommendation: stay as-is.)*
- For non-English markets in the future, what does the lexicon look like? Translation rather than transliteration where appropriate (Gaffer → Mister in Italian, etc.).
- Does the Club → League and Chairman update require a corresponding update to the dev spec (`260520_HotPick_LexiconImplementation_Spec.docx`)? Review before next developer handoff.
- "Chairman" is gendered. Confirm this is intentional before it ships to UI, or decide on a neutral alternative now.

---

*This document supersedes any prior lexicon-related content in:*
- *Older versions of hotpick_master_brief.md*
- *Project instructions referencing pool / poolie / partner / leaderboard / smacktalk*
- *Any developer documentation predating May 20, 2026*

*When in doubt about a HotPick term, this document is the answer. When it doesn't answer, escalate before improvising.*
