# HotPick Sports — Architecture Reference

Full context for development. Hard guardrails and red flags are in `CLAUDE.md` — read that first.

---

## Working With Tom & How This Project Operates

*This section governs how to collaborate on the codebase. The architecture detail follows in the numbered sections below; the non-negotiable rules live in `CLAUDE.md`.*

### Who You're Working With
Tom McDade is a solo founder, relatively new to coding. He works best with:
- Step-by-step guidance and clear explanations
- Root-cause diagnosis before any code is written
- Knowing *why* a fix works, not just what to type
- Being told when something is architecturally wrong *before* it becomes a bigger problem

Be direct. Push back when a proposed approach conflicts with the architecture. Ask clarifying questions, question assumptions, and tell the truth rather than what is easy to hear.

### Document Hierarchy (source of truth)
Before writing any code, defer to these in order:
- **`CLAUDE.md`** — the hard rules and red flags. Non-negotiable. If a task requires violating one, stop and ask.
- **`REFERENCE.md`** (this file) — architecture, schema, store patterns, Edge Function registry, launch scope.
- **`LAUNCH_READINESS.md`** — the live launch register: current blockers, tiered risks, and what must be true before launch. This is the source of truth for *current* state. Anything that changes week to week (blockers, versions, what's built vs. specced) lives there — do not trust a frozen snapshot in any other doc.

The Master Brief and Addendum provide business context; factor it in when a code decision has implications for scope, launch timing, or acquisition positioning.

### How to Approach Problems
1. Understand the root cause before proposing a fix.
2. Check `CLAUDE.md` and this file for relevant constraints before writing code.
3. Propose the fix with an explanation of why it works and what it affects.
4. Flag any side effects or architectural implications.
5. Keep changes minimal and targeted — avoid refactoring unrelated code in the same pass.
6. When a task is ambiguous, ask a clarifying question rather than assuming.

### What We're Proving (by January 2027)
Every build decision should serve one of these; if it serves none, question whether it belongs in this sprint:
- **Engagement** — 10 pools created outside Tom's personal network with 70%+ week-over-week retention.
- **Willingness to pay** — 3+ pools converting to a paid tier from cold organizer acquisition.
- **Reliability** — zero scoring intervention across all 18 regular-season weeks. Reliability outranks the other two: a shortcut that risks a live-week scoring incident is never acceptable, whatever it buys elsewhere.

### Tone
Calm, systematic, honest. If something looks fragile, say so. If a shortcut now creates a problem at Week 12 of a live season, flag it before writing the first line. Stability and reliability across an 18-week live season is the metric that matters most.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Three-Template Architecture](#2-three-template-architecture)
3. [competition_config Table](#3-competition_config-table)
4. [Subscriptions & Tier Limits](#4-subscriptions--tier-limits)
5. [Pool Model](#5-pool-model)
6. [Pool Members & Lifecycle](#6-pool-members--lifecycle)
7. [Scoring & HotPick Mechanic](#7-scoring--hotpick-mechanic)
8. [Edge Function Registry](#8-edge-function-registry)
9. [Directory Structure](#9-directory-structure)
10. [Zustand Store Architecture](#10-zustand-store-architecture)
11. [Home Screen Architecture](#11-home-screen-architecture)
12. [User Identity & Profiles](#12-user-identity--profiles)
13. [Push Notifications](#13-push-notifications)
14. [SmackTalk: Read State, Reactions & Retention](#14-smacktalk-read-state-reactions--retention)
15. [White Label & Theming](#15-white-label--theming)
16. [History & Hardware System](#16-history--hardware-system)
17. [Game Day Engagement System](#17-game-day-engagement-system)
18. [Event Recaps (Drama Digest)](#18-event-recaps-drama-digest)
19. [Admin Dashboard & Pool Intelligence](#19-admin-dashboard--pool-intelligence)
20. [Build State & Launch Scope](#20-build-state--launch-scope)
21. [Template Replication Notes (Series & Tournament)](#21-template-replication-notes-series--tournament)
22. [User-Facing Lexicon](#22-user-facing-lexicon)
23. [Universal Links & Deep Linking](#23-universal-links--deep-linking)
24. [Native Build & Toolchain Notes](#24-native-build--toolchain-notes)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Client | React Native (TypeScript) — iOS + Android from one codebase |
| Backend | Supabase (project: `mzqtrpdiqhopjmxjccwy`) |
| Database | PostgreSQL 17.6.1 via Supabase |
| Auth | Supabase Auth (Apple, Google, Email) with persistent sessions |
| Realtime | Supabase Realtime (SmackTalk, live leaderboards, live scores) |
| Scoring | Supabase Edge Functions (server-side only) |
| State | Zustand — sport-scoped stores + shared global store |
| Navigation | React Navigation — nested navigators per sport |
| Data APIs | ESPN API (game data), The Odds API (spreads/moneylines for ranking) |
| Bundle ID | `com.hotpicksports` (iOS + Android) |
| Apple Team ID | W88A7N6XW5 |
| Supabase Org ID | `jjzzwaegmesnkhzxuqzy` |

**Auth providers:** Apple Sign In (native), Google Sign In (native), Email/Password
**Password recovery:** deep link via `hotpick://auth/reset`, PKCE + implicit flow supported

**Self-funded validation metrics (NFL Season 2):**
- 10+ pools created outside the founder's network
- 70%+ week-over-week retention across the season
- 3+ pools converting to paid tier ($19+)
- Zero scoring intervention required during the 18-week season

---

## 2. Three-Template Architecture

Every sport maps to one of three templates. Never create new tables per sport or event — add rows to existing template tables with an `event_id`.

### Template → Tables

**Tournament** (World Cup, Euros, Copa América)
- `tournament_matches` — all matches, group + knockout
- `tournament_picks` — user match picks (knockout stage)
- `tournament_group_picks` — pre-tournament group advancement predictions
- `tournament_group_results` — actual group outcomes for scoring
- `tournament_user_totals` — aggregated tournament scoring per user

**Season** (NFL, EPL, college football)
- `season_games` — weekly schedule
- `season_picks` — user picks per game
- `season_user_totals` — aggregated scoring per week per user

**Series** (NHL, NBA, MLB playoffs)
- `series_matchups` — series definitions
- `series_games` — individual games within a series
- `series_picks` — user picks at the series level
- `series_user_totals` — aggregated round scoring per user

### Shared Tables (never template-specific)
- `profiles` — user identity
- `pools` — pool definitions (one pool = one event, no rollover)
- `pool_members` — membership with full history (never DELETE rows)
- `partners` — white label partner definitions
- `smack_messages` — per-pool chat
- `smack_reactions` — emoji reactions (6 allowed, max 8 distinct per message)
- `smack_read_state` — last_read_at per user per pool
- `competition_config` — per-competition state management
- `events` — master events registry
- `organizer_acknowledgments` — legal log of no-money-collection acknowledgment
- `event_recaps` — Drama Digest headline storage (template-agnostic)
- `user_hardware` — permanent award records (never delete rows)
- `game_pick_stats` — cached pick percentages (60s refresh, game day only)
- `user_devices` — push tokens (one row per device)
- `notification_queue` — queued push notifications
- `admin_audit_log` — required before any destructive admin action
- `organizer_notifications` — broadcasts, nudges, moderator notes
- `pool_pulse` — current intelligence digest per pool
- `pool_events` — event log for all meaningful pool actions

### Competition String Convention

All events identified by a lowercase competition string:
- `nfl_2025`, `nfl_2026`
- `world_cup_2026`
- `nhl_playoffs_2027`
- `nba_playoffs_2027`

This string is the primary key for scoping all queries. Never use a numeric `event_id` alone.

---

## 3. competition_config Table

Key-value config store for all competition state. One row per `(competition, key)` pair. Evolves by adding rows, never by changing structure.

**Always include `description`** when inserting a new key.

**`scoring_locked`** is an emergency boolean on every competition. Setting `true` pauses scoring Edge Function computation without a deployment. Always include it in new competition seed data.

### Valid Keys by Template

**Season (nfl_2026):**
```
current_week, current_phase, is_active, is_season_complete,
template, sport, season_year, phases, powerUps, carryOver,
data_provider, scoring_locked, playoff_start_week,
global_pool_id, open_picks_mode, week_state, picks_locked,
preseason_start_date, season_opener_date, season_picks_open_at,
next_picks_open_at
```

- `global_pool_id` is present on competitions that have a global pool; omitted on invite-only competitions.
- `espn_season_type` is a preseason-only key ('1' => ESPN seasontype=1); absent elsewhere, defaulting to regular. Added with the preseason isolation build.

**Tournament (world_cup_2026):**
```
current_stage, group_picks_open, group_picks_locked,
knockout_picks_open, is_active, is_complete, template, sport,
data_provider, scoring_locked
```

**Series (nhl_playoffs_2027):**
```
current_round, series_picks_open, is_active, is_complete,
template, sport, data_provider, scoring_locked
```

**Global (competition = 'global'):**
```
free_tier_max_pools (1 — creation limit, not join limit), free_tier_max_members (10),
paid_small_max_members (25), paid_medium_max_members (50),
paid_large_max_members (null = unlimited),
founding_pools_remaining (starts at 100),
current_tos_version, briefing_gate_active, maintenance_mode,
espn_health_status
```

### Reading Config in Edge Functions

```typescript
const { data: config } = await supabase
  .from('competition_config')
  .select('key, value')
  .eq('competition', competition);

const cfg = Object.fromEntries(config.map(r => [r.key, r.value]));
if (cfg.scoring_locked) return;
```

### Season Phase Lifecycle

```
PRE_SEASON → REGULAR → REGULAR_COMPLETE → PLAYOFFS → SUPERBOWL_INTRO → SUPERBOWL → SEASON_COMPLETE
```

Weekly cycle (`picks_open → locked → live → settling → complete`) only runs inside REGULAR, PLAYOFFS, and SUPERBOWL. All other phases set `week_state = 'idle'` and show static cards.

**Playoffs phase reset is automatic and mandatory** when transitioning REGULAR → REGULAR_COMPLETE → PLAYOFFS:
- Regular season champion recorded, awards distributed
- Pool leaderboard week reference resets — playoff scores accumulate fresh
- Regular season standings preserved in read-only historical view
- `playoff_start_week` set in competition_config at transition time
- Players do not re-opt-in

**Playoff champion tie-breaker ladder** (applied in order, top to bottom, until the tie is broken):
1. **Playoff points** — highest accumulated playoff total wins outright
2. **Super Bowl margin** — Price Is Right style: closest to the final winning margin *without going over* (`season_picks.super_bowl_margin_prediction`)
3. **Most correct playoff picks** — raw count of correct picks across the playoffs, ignoring HotPick weighting
4. **Most correct playoff HotPicks** — count of correct HotPick games across the playoffs
5. **Co-champions** — if still level after all four, the title is shared

This ladder is the *whole-playoff (full-season) champion* tie-breaker. **Today**
there is no separate Super Bowl-only winner — the Super Bowl is simply the final
week of the unified playoff competition, and the margin prediction is a rung in
this single ladder. The tie-break computation ships with Super Bowl Enhanced
Scoring (§ below, November 2026); until then the `super_bowl_margin_prediction`
column is captured but unused. The `PlayoffRulesModal` popup states this ladder
to players today.

**Planned entry points & sub-competitions (build November 2026 — not yet built):**
Because scores are user-scoped and pools are lenses on user-level data
(pool-independent architecture), late-joining sub-competitions are a leaderboard
*scoping* problem, not a new data model. Tom's intent:

- **Playoffs-only competition** — at *any* point, a new user can sign up and join
  a pool intending to start fresh at **Week 19 (Wild Card weekend)** and run
  through the Super Bowl. Their playoff total accumulates from `playoff_start_week`
  forward, identical to how the mandatory playoff reset already scopes scores.
  Needs its own champion + tie-breaker (reuse the ladder above, scoped to
  playoff weeks).
- **Super Bowl-only competition** — in the **2 weeks before the Super Bowl**, new
  users can sign up to participate in a **Super Bowl-only** contest, scoped to the
  Super Bowl week alone.
- **Super Bowl-only winner** — a distinct winner/champion for the Super Bowl-only
  competition, separate from the full-season and playoffs-only champions. Its
  tie-breaker leans on `super_bowl_margin_prediction` (Price Is Right) first.

All three coexist as different *scopes* over the same user picks; no `pool_id` on
scores, no per-competition tables — the differentiator is the week range each
leaderboard sums over.

---

## 4. Subscriptions & Tier Limits

One row per pool per paying organizer in `subscriptions` table. Free users have no row — free status is inferred from absence.

### Valid Plan Values (check constraint)
```
'organizer_small'   → $19/event, up to 25 members
'organizer_medium'  → $39/event, up to 50 members
'organizer_large'   → $69+/event, unlimited members
'addon_sport'       → $15, additional event for existing organizer
'addon_pool'        → $15, additional pool same event
```

Free organizers: can create up to 1 pool per competition, max 10 members (no subscriptions row needed). Users can **join** unlimited pools regardless of tier — tier limits only constrain pool creation.

**Founding 100 pools:** Free forever regardless of size. Determined at creation time by `founding_pools_remaining` config key. `is_founding_pool = true` on pool row — permanent, never revoked.

### Pool Creation Logic (server-side only)
1. Check `founding_pools_remaining` — if > 0, allow free, set `is_founding_pool = true`, decrement
2. Otherwise: check user's subscription plan, count active pools, apply limits
3. Client shows upgrade prompt based on server error — never decides on its own

---

## 5. Pool Model

- **Users belong to multiple pools for the same competition** — their picks and scores are identical across all of them. Each pool is a different social lens on the same user-level data. Never design features that assume one pool per user.
- One pool = one event (no rollover between seasons)
- Join via invite code only — no pool discovery at launch
- Organizers can "run it back" to create a new pool for a new event
- **`pool_start_date`** (DATE, NOT NULL): leaderboard scores from this date forward — not from season start, not from player join date. Mid-season pools start fresh for all members at `pool_start_date`.
- **`visiblePools`** in globalStore handles global pool filtering — components never filter pools themselves

### Global Pool Visibility Rules
- Users auto-enrolled at signup (`invite_code_used = NULL`) → hidden from all UI
- User joins via invite code (`invite_code_used IS NOT NULL`) → visible like any other pool
- Visibility is per-user — two users in the same global pool may have different visibility

### Partner-Aligned Pools (Roster Model)

**Users join pools. Organizers join rosters.** A partner has a roster — the set of pools aligned with them. Two ways a pool ends up on a roster:

1. **Club Pool** — the partner's own pool. Created via `create_partner_pool(partner_id)` RPC (super-admin only). `partners.club_pool_id` points at this pool. Exactly one Club Pool per partner. It's just a Contest the partner's board also runs — it is **no longer** what confers Partner Admin rights (see below).
2. **Roster member** — any other pool that aligns with the partner via PartnerDirectoryScreen. Surfaces the partner's brand + perk to its members but has no admin rights over the partner.

`pools.partner_id` is the alignment edge (set for *both* shapes). `partners.club_pool_id` distinguishes the Club Pool from roster members.

**Partner Admin = `partner_members`, not the Club Pool.** A partner's board is a **Chairman** (one) + **Directors** (`partner_members(partner_id, user_id, role)`), independent of whether the partner runs a Club Pool — so **sponsor-only partners have admins too**. HotPick staff seed the Chairman by email (`admin_set_league_chairman`); the Chairman adds Directors (`grant_partner_director_by_email`). Perk/public-info/roster-pass edits (`_caller_can_manage_partner`) and `send-partner-broadcast` gate on `partner_members`. Email invites to people without an account yet park in `pending_role_grants` (partner-scoped) and attach on signup. (Migration `20260604150000` backfilled existing Club Pool organizers→Chairman, admins→Directors.)

- `invite_slug` doubles as invite code (e.g., "MESQUE")
- `join_pool_by_invite` RPC checks BOTH `invite_code` AND `UPPER(invite_slug)`
- Slugs: alphanumeric + hyphens, max 12 chars, stored lowercase, matched case-insensitive
- `brand_config JSONB` on pool — NULL = HotPick defaults, populated = partner brand snapshot (Hard Rule #23 — never live-join to partners for rendering)
- `can_run_pools` on the partner gates Club Pool *creation* only; sponsor-only partners can still be added to any organizer's roster
- Pool-level "perk text/icon" and partner broadcasts are managed from `PoolSettings` of the Club Pool — not from PartnerAdminScreen

### Organizer Acknowledgment (Legal Requirement)
Every pool creation shows a native Alert requiring acknowledgment that collecting money from participants is prohibited. Logs to `organizer_acknowledgments`: `{user_id, timestamp, version: "1.0"}`. Cannot be skipped without legal approval.

---

## 6. Pool Members & Lifecycle

`pool_members` tracks membership with full history. **Never DELETE a row** — soft delete via `status`.

### Status & Role Values
- `role`: `'member' | 'admin' | 'organizer'`
- `status`: `'active' | 'pending' | 'removed' | 'left'`

Always filter with `.eq('status', 'active')` in leaderboard and member list queries.

### Pool Deletion (Admin Only)
1. Organizer can archive only (`is_archived = true`) — no delete button in organizer UI
2. Hard delete: admin-only, requires `admin_audit_log` entry first, 24-hour grace period, then cron execution
3. `DELETE FROM pools` must never appear outside the scheduled cron job

---

## 7. Scoring & HotPick Mechanic

### NFL Season Scoring (Locked)
- 15 regular picks: +1 win / 0 loss (never negative)
- 1 HotPick: user designates one game; `frozen_rank` (1–16) = +rank if win, −rank if loss
- Perfect week: 31 pts | Worst week: −16 | All negative variance comes from the HotPick only

### World Cup Scoring (Locked)
- Group Stage: 32 pre-tournament predictions, max 68 pts
- Knockout Stage: R32=3, R16=4, QF=6, SF=8, Final=10
- HotPick: correct = +rank, wrong = −rank | Standard pick: correct = +1, wrong = 0
- Maximum total: 139 pts

### Super Bowl Enhanced Scoring (Build November 2026)
**Full build brief: `docs/SUPER_BOWL_SCORING_SPEC.md`** — read it before starting; it covers what already exists, the gaps, the open decisions, and a build sequence.

Do not build UI yet. Nullable columns already exist on `season_picks` (verified in `database.ts`; **note these are the real names** — earlier docs wrongly said `super_bowl_q1_pick` / `super_bowl_margin_prediction INT`):
- `sb_q1_leader`, `sb_q2_leader`, `sb_q3_leader` (TEXT — quarter-leader picks, team abbr)
- `sb_margin_tier` (TEXT — bucket `"1-6"` / `"7-14"` / `"15+"`; a **tier**, not an exact INT)

⚠️ **Margin concept fork (decide in November):** the schema stores a *tier* (`sb_margin_tier`), matching the Season 1 +8/−4 scoring element. But the §3 tie-breaker ladder and the `PlayoffRulesModal` popup describe margin as **Price-Is-Right (closest exact margin without going over)** — which needs an exact INT column that does not yet exist. Reconcile per `docs/SUPER_BOWL_SCORING_SPEC.md` §4A.

⚠️ **Schema not in migrations:** these `sb_*` columns (and `season_user_totals.playoff_points`) live in the types but **no tracked migration creates them**. Formalize with `apply_migration` before building.

**Canonical scoring model (recovered from the Season 1 Xcode build `tmcdade1148/NFL2025`, Dec 2025 — `SuperBowlRowView.swift` is authoritative).** The Super Bowl is a single game with a **multi-part pick**:

| Pick | Correct | Wrong |
|---|---|---|
| **Game Winner** (scored as a HotPick at rank 16) | **+16** | **−16** |
| **Q1 Leader** (who leads at end of Q1) | **+1** | 0 (no penalty) |
| **Q2 Leader** | **+2** | 0 |
| **Q3 Leader** | **+3** | 0 |
| **Margin Tier** — final winning margin bucket: `1–6` / `7–14` / `15+` | **+8** | **−4** |
| **Score range** | **max +30** | **min −20** |

Notes / decisions still open for the November build:
- **No Q4 leader, no total-points pick.** The game winner covers the full game; quarters stop at Q3. Season 1 had no over/under or total-points element.
- **Stale Season 1 copy to ignore:** the old `SuperBowlOnboardingBanner` advertised a "HotPick Quarter" pick and a **+36 / −26** range. Tom confirmed these are **not** in the real scoring — there is no separate HotPick-quarter swing. Canonical range is **+30 / −20**.
- **Margin concept fork — DECIDE before building.** Season 1 scored margin as a **3-tier bucket** (`1–6` / `7–14` / `15+`, +8/−4) — a *scoring element*, not a tiebreaker. The deferred `super_bowl_margin_prediction` INT column was added for a **Price-Is-Right tiebreaker** (closest exact margin without going over), which is how the §3 tie-breaker ladder and `PlayoffRulesModal` describe it. These are two different mechanics. Resolve in November: keep the tier as a scoring element, use an exact INT for the tiebreaker, or both. Until decided, the §3 ladder copy (Price-Is-Right) is what players see.
- The Season 1 winner pick reused the **HotPick ±rank** mechanic at rank 16. In Season 2 confirm how ranking applies when the SB week has a single game.
- **New data requirement:** scoring needs **per-quarter scores** (Q1/Q2/Q3 home & away) from the provider. Regular-season scoring never needed this — Season 2's ESPN polling + `season_games` must capture quarter scores.
- Each scoring dimension (quarter-leader accuracy, margin-tier correctness) is a candidate **tiebreaker variable** for the §3 ladder and the Super Bowl-only competition.

**Also in scope for this November 2026 build (see §3 "Planned entry points & sub-competitions"):**
- **Super Bowl-only competition + its own winner** — new users can sign up in the 2 weeks before the Super Bowl and compete on the Super Bowl week alone; distinct champion from the full-season and playoffs-only champions
- **Playoffs-only competition** — users can join at any point to start fresh at Week 19 (Wild Card) and run through the Super Bowl
- Both are leaderboard *scopes* (week-range filters) over the same user-scoped picks — no new tables, no `pool_id` on scores

### Pick Lock Triggers (Server-Side Authoritative)
- **`enforce_pick_lock`** — BEFORE INSERT OR UPDATE on `season_picks`: checks game status in `season_games`; raises exception if status != 'scheduled'
- **`enforce_single_hotpick`** — AFTER INSERT OR UPDATE: demotes any other `is_hotpick = true` row for same user/competition/week

### `frozen_rank` Rules
- Set at pick deadline by `nfl-rank-games` Edge Function
- Never recalculated from live data after lock
- Use `COALESCE` to preserve existing values when upserting

### `is_hotpick_correct` Rules
- Lives on `season_user_totals` (and `series_user_totals`) — **not** on `season_picks`
- It is a per-user-per-week flag, not a per-pick field
- Written by the scoring Edge Function once the HotPick game reaches FINAL
- Must be `null` while the HotPick game is still in progress — never `false` before FINAL
- `?? false` or any default fallback before FINAL is a scoring bug — see CLAUDE.md red flags
- To verify during a live week: query `season_user_totals` where `week = currentWeek`. Rows should show `null` or not exist yet while games are unfinished. Any `false` before FINAL is a failure.

### Leaderboard Queries — Required Pattern
```sql
-- CORRECT: always filter by pool_start_date
SELECT t.user_id, SUM(t.points) as pool_points
FROM season_user_totals t
JOIN pool_members pm ON pm.user_id = t.user_id AND pm.status = 'active'
JOIN pools pl ON pl.id = pm.pool_id
WHERE pm.pool_id = $pool_id
  AND t.competition = $competition
  AND t.week_number >= (
    SELECT EXTRACT(WEEK FROM pool_start_date) FROM pools WHERE id = $pool_id
  )
ORDER BY pool_points DESC;
```

**Dual leaderboard views** — both required on every pool leaderboard screen:
- Week-side: prior week scores only (who won the week)
- Season-side: cumulative from pool_start_date to present

Both views always available via toggle. Both use `pool_start_date` filter.

**Multi-pool implication:** The same user's scores appear on every pool leaderboard they belong to. A user who joins 5 pools sees 5 different leaderboard contexts, but their points never change — only the peer group and `pool_start_date` filter differ. `pool_id` is always a WHERE-clause filter, never a foreign key on scoring tables.

---

## 8. Edge Function Registry

| Function | Trigger | Schedule |
|---|---|---|
| `nfl-calculate-scores` | Cron + manual | Every 30 min |
| `nfl-update-scores` | Cron | Every 5 min |
| `nfl-import-schedule` | Cron | Tuesdays 5am UTC |
| `nfl-fetch-odds` | Cron | Tuesdays 10am UTC |
| `nfl-rank-games` | Cron | Tuesdays 10:15am UTC |
| `nfl-open-picks` | Cron | Tuesdays 11am UTC |
| `nfl-finalize-week` | Cron | Tuesdays 6am UTC |
| `nfl-weekly-transition` | Manual (admin) | On demand |
| `refresh-game-pick-stats` | Cron | Every 60s |
| `compute-hardware` | Cron | Minutes :05 and :35 |
| `process-notification-queue` | Cron | Every 60s |
| `smack-archive-messages` | Cron | Daily 3am UTC |
| `espn-health-check` | Cron | Hourly at :17 |
| `sim-operator` | Manual (super-admin, Operator Console Phase 2) | On demand |
| `bypass-tester-signup` | Pre-auth (verify_jwt=false), tester signups | On demand |
| `send-broadcast-email` | Client-triggered (non-blocking) | On broadcast send |
| `send-partner-broadcast` | Client-triggered (super-admin OR Club Pool organizer) | On broadcast send |
| `compute-hardware` | weekly_settle / season_settle / manual_override | — |

**`season-simulator` was retired** (Operator Console Phase 2, June 2026) — it was hardcoded to `nfl_2026` (production!) and had zero runtime callers (no cron, no app, no other function). `sim-operator` supersedes it as the single sanctioned, allowlist-gated simulator write path. `tools/sim-runner.mjs` (headless/CI) is unaffected — it only calls `nfl-calculate-scores`.

**Cron jobs require hardcoded service role JWT** — `current_setting('app.service_role_key', true)` does not resolve in cron context.

**ESPN Health Monitor:** `espn-health-check` validates HTTP status, response time, JSON shape every hour. Writes to `competition_config` key `espn_health_status` (competition = 'global'). Alerts all `is_super_admin` users via `notification_queue` on degraded/down.

---

## 9. Directory Structure

```
/src
  /sports
    /worldcup/        ← Tournament template, World Cup instance
    /nfl/             ← Season template, NFL instance
    /nhl/             ← Series template (scaffolded)
  /templates
    /tournament/      ← Reusable tournament engine
    /season/          ← Reusable season engine
    /series/          ← Reusable series engine
  /shell              ← App shell: auth, pools, SmackTalk, sport switcher
    /screens/         ← Admin screens live here, never in sport modules
    /theme/           ← ThemeProvider, hotpickDefaults.ts, types, hooks
    /components/
      home/           ← Home screen modules
  /store
    globalStore.ts    ← Auth, user profile, pool membership, notifications
    nflStore.ts       ← NFL store (sport-scoped)
    seasonStore.ts    ← Season template store
  /services
    /supabase.ts      ← Supabase client init
    /espn.ts          ← ESPN API integration
    /odds.ts          ← The Odds API integration
```

The app shell never imports directly from a sport module. It queries `SportRegistry` for available events. A bug in the NHL store must never corrupt NFL state.

---

## 10. Zustand Store Architecture

### Global Store Responsibilities
- Auth & profile (user, userProfile, isAuthLoading)
- Pools (userPools, visiblePools, pool CRUD, membership)
- Active selection (activePoolId, activeSport, defaultPoolId)
- SmackTalk unread counts (poolId → count map)
- Admin/broadcasts (fetchBroadcastsToday, fetchRecentBroadcasts, fetchFlaggedCounts)
- History/Hardware (userHardware, loadUserHardware, playerArchetype, computePlayerArchetype)
- Events (availableEvents, activeEventCards — max 2)

### Sport Store Responsibilities (NFL as example)
- `competition`, `currentWeek`, `weekState`, `picksDeadline`
- `userHotPick`, `userHotPickGame`, `liveScores`, `weekResult`, `poolStandings`
- `gamePickStats`, `pathBackNarrative`, `hotPickGameStatus`

### Rules
- Sport stores are fully isolated — never import from each other
- Global store is the only cross-sport dependency
- Live scores update via Realtime subscription wired into the sport store's `liveScores` map — components subscribe to the store slice, not directly to Realtime
- `visiblePools` (not raw `userPools`) is what components consume for pool lists

### Feature Flags
```typescript
const isNHLEnabled = __DEV__ || userIsDeveloper;
const isTournamentEnabled = __DEV__ || userIsDeveloper;
```
Developer Settings screen unlocks non-active sports. Never remove this gate. `is_super_admin` gates production admin tools — never use `__DEV__` for production features.

---

## 11. Home Screen Architecture

The Home Screen is a **Smart Home Screen**, not a dashboard. Context-aware. Renders a priority-ordered list of event cards, capped at 2.

### Card Priority Order
1. Picks deadline within 48 hours (soonest deadline wins)
2. Games currently live
3. Scores settling (within last 24 hours)
4. Most recently interacted with

Card priority computed in globalStore — never in the component.

### Pool Stack Order
Below the event hero, the home screen renders `visiblePools` as a stack. Sort:
1. Default pool (`globalStore.defaultPoolId`, set via the ★ in Settings → My Pools) pinned to index 0
2. Remaining pools sorted alphabetically by `pools.name`, locale-aware, case-insensitive

Sort happens at render time in HomeScreen — store data stays unsorted.

### Week State Machine
```
picks_open → locked → live → settling → complete → picks_open (next week)
```
Above is the in-cycle progression during REGULAR, PLAYOFFS, and SUPERBOWL. Outside the weekly cycle (PRE_SEASON, REGULAR_COMPLETE, SUPERBOWL_INTRO, SEASON_COMPLETE), `week_state = 'idle'`.

> Home modules, state→content mapping, and all copy: CLAUDE HQ /
> SOURCE OF TRUTH / HOME_MODULE_MAP.md — canonical. §11 covers
> architecture only.

### Join Pool Module
- Shown when user has no visible private pool
- Suppressed during `SEASON_COMPLETE`
- Self-hides on successful join or creation
- No dismiss button — the module IS the CTA

### Bottom Tab Order
Home · Picks · Ladder · Chirp · Settings

Leaders and SmackTalk share a single underline via custom `GroupedTabBar` in `MainTabNavigator.tsx`.

**Tab-bar context awareness** (`GroupedTabBar`):
- **On HomeTab and PicksTab:** Leaders + SmackTalk grouped box hides (both are pick-flow surfaces — no jump to social mid-flow).
- **On PicksTab:** the freed right half of the bar renders `<SubmitPicksBarSlot />` — the Submit Picks button hoisted from the screen. Single source of truth driven by the `useSeasonSubmitState()` hook reading from seasonStore + nflStore. Five states (locked / no_picks / needs_hotpick / in_progress / submitted), each with its own bg color + enabled state.

### Per-Tab Headers
Three slim, HomeHeader-styled headers (HotPick wordmark + period pill + gear, ~one row each):
- `HomeHeader` — top of Home tab. Wordmark + period pill + gear.
- `PoolHeader` — top of Leaderboard and SmackTalk tabs. Adds a second row: pool name (large bold italic, capped at 50% width, auto-fit font via sizing-probe + scale).
- `PicksHeader` — top of Picks tab. Second row: poolie name (capped at ⅓ width, same auto-fit) on the left, "Pick once. Play everywhere." tagline on the right.

The dropdown-style `PoolSwitcherBar` is no longer used on Leaderboard / SmackTalk / Picks; it remains on `EventDetailScreen` only. Pool switching now happens via Settings → My Pools (★ to pin default to top of Home; rest sort alphabetically).

---

## 12. User Identity & Profiles

- `full_name` — real name, private
- `poolie_name` — display persona, public — shown everywhere in app
- First name + last initial shown alongside poolie_name in member lists (e.g., "McDude_tpm — Tom M.")
- Both `first_name` and `poolie_name` are required fields

**Career stats on profiles** (default 0, updated by Edge Function — never client-side):
- `total_career_points`, `career_picks_correct`, `career_picks_total`
- `career_hotpick_correct`, `career_hotpick_total`

**Avatar rules:** Always set `avatar_type` ('system' | 'uploaded' | 'oauth' | 'generated'). Re-upload OAuth avatars to HotPick storage — never store third-party URLs (they expire).

**Pending schema cleanup (do not re-introduce):**
- Drop `profiles_set_updated_at` trigger (keep `set_profiles_updated_at`)
- Drop `idx_profiles_default_pool_id` (keep partial index only)
- Rename `default_pool_id` → `last_active_pool_id`

**TOS acceptance:** `rpc_accept_tos()` called once for new users post-auth. `TosVersionGateScreen` blocks returning users when `current_tos_version` is bumped.

---

## 13. Push Notifications

Tokens live in `user_devices` table — never on `profiles`. One row per device. `is_active = false` on logout or delivery failure.

**8 toggleable notification types per user** (columns on `notification_preferences`, enforced server-side by `process-notification-queue`'s `PREF_COLUMN_MAP` before delivery):
- `picks_deadline`, `score_posted`, `leaderboard_change`, `smacktalk_mention`
- `smacktalk_reply`, `organizer_broadcast`, `streak_milestone`, `new_member_joined`

(The `notification_preferences` row also carries `user_id` + `updated_at`, which are not toggles.)

**Delivery flow:** `notification_queue` table → `process-notification-queue` Edge Function (cron every 60s) → Expo push service. A queued row is skipped if the user has set the matching `notification_preferences` column to `false`.

**Broadcasts** (both Gaffer/pool and Chairman/League) deliver two ways:
- **In-app Message Center:** a row in `organizer_notifications` (Gaffer broadcasts) or `partner_notifications` (League broadcasts).
- **Mobile push:** a `notification_queue` row with `notification_type = 'organizer_broadcast'` — the only broadcast type the processor's `PREF_COLUMN_MAP` honors, so the user's `organizer_broadcast` toggle gates both. `broadcast_to_pool` enqueues the Gaffer fan-out; `send-partner-broadcast` enqueues the League fan-out.

**Broadcast email is currently DISABLED.** The `send-broadcast-email` Edge Function is still deployed (it remains in the §8 registry) but inert — the client gate `BROADCAST_EMAIL_ENABLED = false` (`poolAdminSlice.ts`) means it is never invoked. It is intended for post-launch re-enable once member emails are verified.

**Rate limits (enforced by `check_notification_rate_limit()`):**
- Max 3 broadcasts/day per pool
- Max 1 nudge/hour per pool

---

## 14. SmackTalk: Read State, Reactions & Retention

### Unread Count Pattern
```sql
-- CORRECT: aggregate all pools in one query
SELECT pool_id, COUNT(*) as unread_count
FROM smack_messages m
JOIN smack_read_state s ON s.pool_id = m.pool_id AND s.user_id = $user_id
WHERE m.pool_id = ANY($pool_ids)
  AND m.created_at > s.last_read_at
GROUP BY m.pool_id;

-- WRONG: one query per pool (N+1 problem — scales with pool count)
SELECT COUNT(*) FROM smack_messages
WHERE pool_id = $1 AND created_at > (SELECT last_read_at FROM smack_read_state WHERE ...);
```

### Message Retention Policy
- Users see last 14 days of messages in any pool feed
- Messages older than 14 days moved nightly to `smack_messages_archive` (cron: `smack-archive-old`, 3am UTC)
- Archive is permanent and immutable — never delete from it
- Client never queries `smack_messages_archive` — service role Edge Function only
- No message migration between pools, even for "run it back" pools

### Reactions
6 allowed: `['👍', '👎', '❤️', '😂', '😮', '😢']`. Max 8 distinct types per message.
Validated by Postgres trigger `check_reaction_validity` (not a check constraint — trigger allows future expansion without schema migration).
To add a new type: update trigger `allowed_reactions` array AND `config/smackTalk.ts` allowed array.

### Mention Autocomplete
Always pool-scoped — only query `pool_members` for the current `pool_id`. Mention notifications go through `notification_queue` via Postgres trigger.

### Moderator Notes
Written to `organizer_notifications` with `notification_type = 'moderator_note'`. Never appear in SmackTalk. Recipient sees them in Message Center only.

---

## 15. White Label & Theming

Partners get branded pool experiences inside the standard app. Users download HotPick. "Powered by HotPick" is non-negotiable on all branded screens (`powered_by_hotpick` typed as literal `true` — cannot be false).

### HotPick Brand Color Tokens (Source of Truth: `hotpickDefaults.ts`)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#F5620F` | CTAs, active buttons, highlights |
| `secondary` | `#45615E` | Inactive accents, secondary states |
| `highlight` | `#F5C842` | NFL header, WEEK X, pool name, rank badges, chevrons |
| `background` | `#FCFCFC` | App bg (light) |
| `surface` | `#F4F4F4` | Cards, rows, SmackTalk bubbles (light) |
| `glow` | `#51A1A6` | Glow around active elements |

**Dark mode:** `background: #0D1117`, `surface: #161C26`, `text_primary: #8A97AA`, `text_secondary: #A0A0A0`, `border: #2C3A52`

Never copy hex strings into component files — import from `hotpickDefaults.ts`.

### Splash Screen Exception
The launch/splash background is `#181818` (rgb 24,24,24). It is hardcoded in four native places that must stay in sync — change all or none:
`app.json` (`expo.splash` + `android.splash`), `android/.../colors.xml` (`bootsplash_background`), the iOS `BootSplashBackground-bc2d1d.colorset` (asset catalog — the value loaded at runtime), and the inline `<namedColor>` in `ios/.../BootSplash.storyboard`. (There is no longer a `SplashScreen.tsx`; the splash is the native BootSplash launch screen via `react-native-bootsplash`.)

### BrandConfig Interface
```typescript
interface BrandConfig {
  partner_name: string;
  pool_label: string;
  primary_color: string;
  secondary_color: string;
  highlight_color: string;    // light color for text on dark backgrounds
  background_color: string;
  surface_color: string;
  text_primary: string;
  text_secondary: string;
  logo: {                     // nested shape used by PartnerAdminScreen writes
    full: string;             // primary logo URL
    mark: string;
    wordmark: string;
    mono_light: string;
    mono_dark: string;
  };
  logo_url?: string;          // flat-shape legacy field; still read on some rows
  banner?: { full: string };  // wired but not yet rendered
  app_name: string;           // always "HotPick"
  invite_slug: string;
  is_branded: boolean;
  powered_by_hotpick: true;   // literal type — cannot be false
}
```

Lives in `src/shell/theme/types.ts`. One definition, never duplicated.

**Logo shape drift:** Some partner rows in production have `logo_url` (flat) instead of `logo.full` (nested). Renderers MUST tolerate both — check nested first, fall back to flat. Don't normalize at write time; let consumers handle the union until a proper migration cleans it up.

### Partner Schema (current)
Columns on `partners` worth knowing:
- `partner_type` (text, app-side enum: hospitality / operator / media / brand / other)
- `can_run_pools` (bool) — gates Club Pool creation only, not roster alignment
- `perk_text` (text, ≤120 chars), `perk_icon` (text — lucide name or emoji), `perk_updated_at`
- `club_pool_id` (uuid → pools.id, ON DELETE SET NULL) — the partner's own pool
- `is_active` (bool)
- `brand_config` (jsonb) — snapshot per `BrandConfig`
- `roster_pass` (text, NOT NULL, UNIQUE) — 8-char alphanumeric pass (alphabet excludes I/O/0/1) a Club admin shares with a Gaffer to authorize affiliating their Contest with this Club's roster. Distinct from `pools.invite_code` (which is user-to-pool join). Auto-generated by the `partners_set_roster_pass` BEFORE INSERT trigger; client `Partner` creation paths can omit it. Display format is `XXXX-XXXX` (storage is the compact 8-char form; the dash is purely visual — see `formatRosterPass` / `normalizeRosterPass` in `@shared/utils/format`).

### Partner-Owned Auth (RPCs + Edge Function)
- `create_partner_pool(p_partner_id, p_competition)` — SECURITY DEFINER, super-admin only, sets `partners.club_pool_id` atomically. Rejects if partner has `can_run_pools = false` or already has a Club Pool.
- `update_partner_perk(p_partner_id, p_perk_text, p_perk_icon)` — SECURITY DEFINER, super-admin OR organizer/admin of the partner's Club Pool.
- `send-partner-broadcast` Edge Function — same auth shape as `update_partner_perk`. Sponsor-only partners (no `club_pool_id`) → super-admin only.
- `resolve_roster_pass(p_pass)` — SECURITY DEFINER, authenticated. Normalizes input (strips non-alphanumeric, uppercases), looks up the active partner by `roster_pass`, returns `{partner_id, partner_name, slug, brand_config}` on hit, `{error: 'INVALID_PASS' | 'INVALID_LENGTH' | 'EMPTY_PASS'}` on miss. Client follows up with `add_pool_affiliation` to commit the affiliation. Used by PartnerDirectoryScreen's "Have a Roster Pass?" input.

### Brand-Config Propagation Trigger
`partners_propagate_brand` (AFTER UPDATE on `partners`, SECURITY DEFINER) cascades any `brand_config` change to:
- `pools.brand_config` for every pool where `partner_id = NEW.id OR owning_club_id = NEW.id`
- `pool_partner_affiliations.brand_config_snapshot` for every row where `partner_id = NEW.id`

Keeps pool snapshots fresh on partner rename / logo swap / color edits while preserving Hard Rule #23 at the read path — pool rendering never live-joins to `partners`, it always reads its own snapshot. The snapshot is just kept honest server-side.

### Partner Logo Library
- Bucket: `partner-logos` (existing). Per-partner folder = `<partner.slug>/`. Files named freely; PartnerAdminScreen's library grid lists everything in that folder, lets the user pick / add (Photos picker or URL paste) / delete.
- DELETE policy added: any authenticated user can delete (gated UI-side to super-admin-reachable screens). RLS still blocks anon.
- The shared `_library/` prefix from an earlier design was scrapped — left empty.

### White Label Build Status

| Phase | Status | Notes |
|---|---|---|
| 1 | ✅ Done | DB schema: `partners` table + columns above, `pools.partner_id`, `pools.invite_slug` |
| 2 | ✅ Done | ThemeProvider + useBrand() wiring |
| 3 | ⏳ Deferred | Branch.io SDK — requires real device, high risk |
| 4 | ⏳ Deferred | Deep link handler (basic handler exists, needs Branch.io + partner slug lookup) |
| 5 | ⏳ Deferred | Branded pool join flow (3 screens) |
| 6 | ✅ Done | PoweredByHotPick component |
| 7 | ✅ Done | Partner Admin Screen (super_admin only) — creates partners, sets type, creates Club Pool |
| 8 | ✅ Done | QR code generation in Partner Admin |
| 9 | ✅ Done | Partner color editing (4 colors + `deriveFullBrandColors()` auto-compute) |
| 10 | ✅ Done | Partner logo library (per-slug folder, Photos + URL ingestion, in-app delete) |
| 11 | ✅ Done | Roster model: organizers add their pool to a partner's roster via PartnerDirectoryScreen |
| 12 | ✅ Done | Club Pool concept (`partners.club_pool_id`) — Club Pool organizer = de facto Partner Admin |
| 13 | ✅ Done | Inline perk editor + partner-broadcast composer in PoolSettings (Club Pool only) |

Partner dark mode: light/dark theming is derived per-mode from the partner's brand_config slots. **Per the 2026-05-26 product call: Club brand colors render only on Official Club Contest cards on the Home stack.** Every other surface — header, bottom tabs, Settings, admin, partner tiles in YOUR CLUBS, Affiliated Contest cards, Independent Contest cards, PoolSettings — stays HotPick-themed. `useTheme()` / `useBrand()` always return HotPick defaults; only `PoolModule`'s Official-Contest branded band reads `pool.brand_config` directly. Partner identity on partner-centric surfaces (PartnerModule, partner detail screens) uses the Club's name + logo, not Club colors. See Hard Rule #25 in CLAUDE.md.

---

## 16. History & Hardware System

### user_hardware Table
Permanent per-user award records. One row per award earned per instance. **Never delete rows** — `is_visible = false` to hide. Unique constraint: `(user_id, hardware_slug, competition, week, pool_id)` with `NULLS NOT DISTINCT`. All writes use `ON CONFLICT DO NOTHING`.

### Hardware Catalog (Launch Awards)

**Weekly** (awarded after each week settles, per pool):
- `sharpshooter_week` — highest regular pick win rate (min 10 picks)
- `gunslinger_week` — won Rank 12+ HotPick
- `contrarian_week` — against majority on 8+ games, top 3, hotpick correct
- `perfect_week` — 15/15 + hotpick correct (platform scope)

**Season-end** (after `is_season_complete = true`):
- `pool_champion`, `podium_2nd`, `podium_3rd` — final pool standings
- `biggest_comeback` — largest rank swing (min 6 weeks)
- `iron_poolie` — 18/18 weeks submitted
- `season_sharpshooter` — best regular pick rate (min 15 weeks, platform)
- `hotpick_artist` — best HotPick win rate (min 15, platform)
- `season_tactician` — Rank 1-6 HotPick 12+ weeks, positive total (platform)

**Career (Phase 2 — do not build at launch):** `veteran`, `back_to_back`, `iron_man`

### compute-hardware Edge Function
Triggered by: `weekly_settle`, `season_settle`, `manual_override`. Cron: minutes :05 and :35.

### Player Archetypes
Template-based labels computed client-side from `userHardware` + career stats:
- The Closer, The Sharpshooter, The Gunslinger, The Grinder
- First match wins (priority waterfall)
- If no threshold met, show nothing — never show a placeholder
- AI-generated archetypes are Phase 2 (no schema changes needed)

### History Tab
- Hidden from navigation until user has at least one settled week (`historyVisibility` column on profiles)
- Tab appearing mid-season is a moment of delight
- Three sections: Player Archetype, Hardware Shelf, Season History

---

## 17. Game Day Engagement System

### game_pick_stats Caching Table
Pick percentages cached with 60s cron refresh. Never query `season_picks` directly from game cards — always use `game_pick_stats`. Pick splits only shown after kickoff (never before). Stats are pool-scoped (social lens) — each pool sees how *its* members picked, not the platform total.

### Pool Pick Stats
Split percentages shown at kickoff. Realtime subscription in `nflStore` pushes updates. Subscription left open only when `weekState = 'live'`.

### Path Back Narrative
Mathematically specific comeback messaging. Computed server-side via `computePathBackNarrative`. Does not influence scoring decisions.

### nflStore Additions for Game Day
```typescript
gamePickStats: Record<string, GamePickStats>;  // gameId → stats
pathBackNarrative: string | null;
hotPickGameStatus: 'pending' | 'live' | 'complete' | null;
loadGamePickStats: (poolId: string) => Promise<void>;
subscribeToGamePickStats: (poolId: string) => () => void;
computePathBackNarrative: (userId: string) => void;
```

---

## 18. Event Recaps (Drama Digest)

Template-agnostic `event_recaps` table. One row per pool per scoring period. Generated by Edge Functions using deterministic templates — no AI at launch.

### period_key Convention
| Template | Examples | period_number |
|---|---|---|
| Season | `week_1` .. `week_18`, `wild_card`, `divisional`, `conf_championship`, `super_bowl` | Week number or playoff ordinal |
| Series | `first_round`, `second_round`, `conf_finals`, `finals` | 1-4 |
| Tournament | `group_stage`, `round_of_32`, `round_of_16`, `quarterfinals`, `semifinals`, `final` | 1-6 |

**Architecture rule:** Generation and delivery are completely separate. `generate-*-recap` writes to `event_recaps` and stops. Delivery channels read independently.

**Headline types by template:**
- Season: `heartbreaker`, `biggest_swing`, `bold_call`, `tough_week`, `comeback`, `race_report`, `perfect_week`
- Series: `bold_call`, `tough_round`, `biggest_swing`, `race_report`, `perfect_round`, `blown_lead`, `length_bonus_call`
- Tournament: `bold_call`, `tough_stage`, `biggest_swing`, `race_report`, `group_guru`, `heartbreaker`, `perfect_stage`

---

## 19. Admin Dashboard & Pool Intelligence

### Admin Screens (Built)
```
/src/shell/screens/
  PoolMembersScreen.tsx       ← FlatList of active members, promote/demote/remove
  PoolSettingsScreen.tsx      ← Edit name, share invite, archive, broadcast, moderation;
                                Partner section (Club Pool only: perk editor + partner
                                broadcast composer; roster members: "Change roster")
  FlaggedMessagesScreen.tsx   ← Moderation queue: approve/remove, send notes
  MessageCenterScreen.tsx     ← User inbox: Gaffer + League broadcasts + moderator notes
                                (10-day window, MESSAGE_CENTER_WINDOW_MS in
                                src/shared/config/notifications.ts). Reads organizer_notifications
                                AND partner_notifications (League); read state tracked via
                                notification_read_state + partner_notification_read_state.
  PartnerAdminScreen.tsx      ← Super admin only. Create partners, edit type/colors/logo
                                library, create Club Pool. Pool ↔ partner alignment
                                moved off this screen (see PartnerDirectoryScreen).
  PartnerDirectoryScreen.tsx  ← Organizer-side. Reachable from PoolSettings → "Join a
                                partner's roster". Picks any active partner and snapshots
                                its brand_config onto the calling pool.
  PrivacyPolicyScreen.tsx     ← Native ScrollView (no WebView). Linked from login + Settings
  AboutScreen.tsx, InstructionsScreen.tsx, WelcomeScreen.tsx
```

### pool_events Valid event_type Values
```
MEMBER_JOINED, MEMBER_LEFT, MEMBER_REMOVED
PICK_SUBMITTED, PICKS_COMPLETE, HOTPICK_DESIGNATED
SCORE_UPDATED, STREAK_ACHIEVED, MILESTONE_REACHED
LEADERBOARD_CHANGE
SMACKTALK_SENT, SMACKTALK_FLAGGED, SMACKTALK_REMOVED
ORGANIZER_BROADCAST, ORGANIZER_NUDGE
POOL_CREATED, POOL_ARCHIVED
ROUND_OPENED, ROUND_CLOSED, ROUND_SCORED
```

### organizer_notifications Types
`'broadcast' | 'nudge' | 'system' | 'moderator_note'`

### What Ships vs Deferred
**Ships:** Pool CRUD, member list, pool settings, broadcast composer, message center, flagged message moderation, SmackTalk reactions, dual leaderboard, database tables, `compute_pool_intelligence` skeleton.
**Deferred:** Nudge flow, Pulse digest UI, analytics, AI copy, multi-pool management.

---

## 20. Build State & Launch Scope

### Current State (March 2026)
- DB completely restructured supporting all three templates
- NFL Season 2 working on Android simulator, iOS simulator, physical device
- Successfully deployed to physical iPhone via Xcode (TestFlight upload tested)
- Edge Functions rebuilt for simplicity and efficiency
- Scoring rebuild complete — addresses all Season 1 failures
- E2E test suite: 48 tests (40 pass, 6 fixed, 2 skipped)
- Marketing version: 2.0, Bundle: `com.hotpicksports`
- Game Day Engagement System: live pick splits, HotPick concentration, Path Back narrative
- History & Hardware System: 11 award types, History tab, Hardware Admin
- Push notifications: expo-notifications SDK, `process-notification-queue` cron
- Account deletion: two-step confirmation, `anonymize_deleted_user()` RPC
- User blocking: platform-wide via `user_blocks` table, long-press Block in SmackTalk

### Launch Sequence
- **NFL Season 2 — September 2026** (primary validation event)
- **NHL Playoffs — April 2027** (first multi-sport proof; spec session October 2026)
- **World Cup / Tournament — TBD**

### Do Not Build Before NFL Season 2 Launch
Power-ups, career hardware, AI archetypes, tier system, pool discovery, pick-linked SmackTalk, exact score predictions, Super Bowl enhanced scoring UI (November 2026), playoff reset UI (November 2026), global leaderboard (post 500 users), AI SmackTalk observations, NHL/Tournament templates, white label billing (Stripe), acquisition source tagging, automated partner Instagram posts, admin analytics charts.

### Accessibility — Font Scaling (decision, June 2026)
OS "Larger Text" / Dynamic Type is **disabled app-wide**: `allowFontScaling = false` is defaulted on every `Text`/`TextInput` at startup (`src/shared/setup/fontScaleCap.ts`, installed from `index.js`). HotPick is a fixed-canvas design (big italic display type, auto-fit player names, big-number callouts, fixed-height cards, multi-size lines), so honoring the OS slider overflows/clips those layouts no matter how the multiplier is capped — and capping fights `adjustsFontSizeToFit` + the auto-fit measure-probes (a per-element-cap experiment was tried and reverted, PRs #319 → #321). The app therefore renders at its **designed sizes at every OS setting**. Per-element `allowFontScaling` still wins if a specific Text ever needs to opt back in.

**Deferred to post-launch:** a dedicated **in-app Text-size control** (Settings → Text size), decoupled from the OS slider — built *together with* making the 2–3 highest-traffic screens (Home hero, identity row, pick flow) reflow gracefully. Scaling text *up* re-breaks the fixed layouts the same way the OS slider did, so a real "Large" option needs fluid screens first. A token ±10% slider was explicitly rejected (minimal accessibility benefit, re-break + high-blast-radius mechanism risk during launch).

---

## 21. Template Replication Notes (Series & Tournament)

When building Series (NHL Playoffs) and Tournament (World Cup):

### Store Pattern
- Each template gets its own Zustand store (`seriesStore.ts`, `tournamentStore.ts`)
- Must include: `initialize()`, `fetchLeaderboard()`, `fetchRoundLeaderboard()` (or equivalent)
- `initialize()` sets poolId, clears leaderboard data, preserves `userNames`
- Pool member queries always include `.eq('status', 'active')`

### Leaderboard Pattern
- `get_pool_pick_submissions` RPC needs equivalents per template
- Pre-scoring leaderboard: show users who submitted picks with 0 points
- Poolie names fetched from `profiles`, cached in store `userNames` map

### UI Pattern
- Pool switcher uses `visiblePools` from globalStore (never raw `userPools`)
- "Join or Create a Pool" when no visible pools
- Context-aware salutations adapt to template ("predictions" for tournament, "series picks" for series)
- Dashboard is far left tab in bottom navigation
- HotPick required before submit — applies to all templates

### Pick Locking
- `enforce_pick_lock` trigger pattern needed per template table
- `enforce_single_hotpick` trigger pattern needed per template table
- Server-side triggers are authoritative

---

## 22. User-Facing Lexicon

Internal code identifiers (`pool_id`, `organizer_id`, `smack_messages`, `smackUnreadCounts`, `partner_id`, etc.) stay as they are. The strings the **user** reads live in `src/shared/lexicon/index.ts`.

Spec: `260520_HotPick_LexiconImplementation_Spec.docx` (May 2026).

### Mapping
| Code identifier (stays) | User-facing label |
|---|---|
| pool / pools | **Contest** / **Contests** |
| poolie | **Player** |
| organizer | **the Gaffer** (long) / **Gaffer** (short) |
| partner | **the League** (long) / **League** (short) / **Leagues** (plural) |
| leaderboard / standings | **the Ladder** (long) / **Ladder** (short) |
| smacktalk | **Chirp** / **Chirps** |
| roster | Roster (unchanged) |
| perks | Perks (unchanged) |
| picks | Picks (unchanged) |

> **Legacy naming note:** `partner` is the single canonical *internal* name for this concept. The older `club_*` identifiers — `partners.club_pool_id`, `pools.owning_club_id`, the "Club Pool" concept, the `ClubAdmin` route and `managedClub` store slice — are the **same concept under a frozen legacy prefix**. They are internal-only and never shown to the user. User-facing copy renamed "Club" → "League" (June 2026); a `club_*` → `partner_*` schema cleanup is an off-season backlog item, not a live-season change.

### Affiliation copy
A Contest's affiliations render on its card as **"Affiliated with [League]"** (or `affiliatedWith([names])` for multi-League: "Affiliated with X & Y", "Affiliated with X, Y & 2 more"). Single-League affiliation gets a `BadgeCheck` icon tinted with the League's primary color; multi-League gets an overlapping logo cluster instead. Replaces the older "On [X]'s Roster" and the "Endorsed by [X]" interim phrasings. Backing schema: `pool_partner_affiliations` (many-to-many), with `pools.owning_club_id` (legacy-prefixed) distinguishing the League's own Official Contest from a roster member (see `260526_pool_affiliations_and_owning_club.sql`).

### Carve-outs (intentional — do not "fix")
- **`PartnerAdminScreen`** — super-admin internal tool; keeps "Partner" labels per spec §2.
- **`PrivacyPolicyScreen.tsx` + `TermsOfServiceScreen.tsx`** — legal copy, requires lawyer review before any change.
- **Database identifiers** (`pool_id`, `pool_events`, `organizer_id`, `smack_messages`, `partners.club_pool_id`, `iron_poolie` hardware slug, `leaderboard_change` notification_type, etc.) — internal code, never changes.
- **Route names** (`PoolSettings`, `LeaderboardTab`, `SmackTalkTab`, `PartnerRoster`) — internal navigation contract.
- **`createPool` / `joinPool` / `archivePool` store actions** — internal API surface.

### Article guidance
Full sentence copy uses the definite article: "the Gaffer of Hammer's Contest", "view the Ladder". Chip/pill labels can drop it: "Gaffer", "Ladder". When in doubt, include the article. Use `LEXICON.gaffer.long` (`"the Gaffer"`) for sentences, `LEXICON.gaffer.short` (`"Gaffer"`) for compact labels.

### Test enforcement
`__tests__/lexicon.test.ts` locks every value in `LEXICON` plus the helper outputs. Any accidental drift from the locked vocab trips a test before users see it.

---

## 23. Universal Links & Deep Linking

Contest invites use **https universal links** (iOS) / **App Links** (Android) so a
shared link linkifies in Messages/WhatsApp and opens the app directly when
installed — falling back to a web landing page (with store buttons) when it isn't.
The legacy custom scheme (`hotpick://`) still works for in-app/auth flows but is
**not** used for sharing (it doesn't linkify and only works if the app is already
installed).

### Canonical link format
```
https://hotpick.app/join/CODE      ← share this (universal link, path-style)
hotpick://join?code=CODE           ← legacy custom scheme (auth/reset, internal)
```
`RootNavigator.tsx` parses both: the path-style regex `/join/([A-Za-z0-9]+)` sets
`pendingInviteCode` in `globalStore`. Share surfaces (`RecruiterBand`, Pool
Settings) emit the https form only.

### The domain (hotpick.app)
Hosted on **Netlify** (site `hotpick-app`), DNS at **DirectNIC** — single apex
`A` record → `75.2.60.5`, plus `www` CNAME → `hotpick-app.netlify.app`. Let's
Encrypt TLS auto-provisioned. The site is **not** the app repo's deploy target for
code — it only serves three things from `web/hotpick.app/` (published via the
repo-root `netlify.toml`):

| Path | Purpose |
|------|---------|
| `/.well-known/apple-app-site-association` | iOS verification (served `application/json`, no extension, no redirect) |
| `/.well-known/assetlinks.json` | Android verification (served `application/json`) |
| `/join/*` → `join/index.html` | fallback landing page (rewrite, not redirect) |

`netlify.toml` enforces the JSON content-types and the `/join/*` rewrite — both
are required or the OS silently refuses to verify.

### Identifiers (already wired in)
- iOS appID (AASA): `W88A7N6XW5.com.hotpicksports` (Team ID + bundle ID)
- Android package (assetlinks): `com.hotpicksports`
- Android assetlinks SHA-256: the **Play app signing key** cert fingerprint
  (Play Console → App integrity → App signing). Accepts multiple entries if the
  signing key rotates or you also want the upload key.
- App Store ID (landing page): `6761190235`

### Native config
- **iOS:** `com.apple.developer.associated-domains` → `applinks:hotpick.app` in
  `ios/HotPickSports/HotPickSports.entitlements`. The entitlements file is
  referenced by both build configs (`CODE_SIGN_ENTITLEMENTS`) and signing is
  **Automatic**, so an EAS build *or* an Xcode archive auto-enables the Associated
  Domains capability on the App ID and regenerates the profile — no manual portal
  step (manual signing would require enabling it on the App ID by hand first).
- **Android:** `autoVerify="true"` https intent-filter for host `hotpick.app` in
  `AndroidManifest.xml`. Verifies against the hosted `assetlinks.json` on install.

### Go-live / rebuild steps (a native change → full build, never OTA)
1. `git pull` (entitlement + manifest changes live on `main`).
2. iOS + Android builds — `eas build -p ios --profile preview` /
   `-p android --profile preview` (or Xcode archive for iOS). Accept any
   credential/profile update prompt.
3. Install on a **real device** (universal links don't work in simulators).
4. Test: tap `https://hotpick.app/join/TEST123` from **Notes/Messages** (not the
   browser URL bar) → app opens to the join flow.
5. Promote to `production` and submit through the normal release flow.

### Verification helpers
- iOS archive entitlement check: `codesign -d --entitlements :- HotPickSports.app`
  → expect `applinks:hotpick.app`.
- Apple ingestion: `https://app-site-association.cdn-apple.com/a/v1/hotpick.app`.
- Android: `adb shell pm get-app-links com.hotpicksports` → expect
  `hotpick.app: verified`.
- iOS caches the AASA at install — if a link won't open the app, delete + reinstall.

Full deploy/host details live in `web/hotpick.app/README.md`.

---

## 24. Native Build & Toolchain Notes

Hard-won lessons from the SDK 55 upgrade. These are environment/tooling facts,
not architecture — but each one cost real time, so they're written down.

### Dependency versions
- **`react-native` is pinned by the Expo SDK — never bump it on its own.**
  Expo SDK 55 ⇒ **react-native 0.83.6**. A stray bump to 0.84.0 (in the prebuild
  commit) left Expo's native modules undefined at runtime →
  `Cannot read property 'EventEmitter' of undefined` on launch. Always realign
  with `npx expo install --fix`; never hand-edit the RN version in
  `package.json`. The drift table for SDK 55 lives in `expo/bundledNativeModules.json`.
- **Never run `npm audit fix --force`.** It rewrote ~250 packages and broke
  `node_modules` twice. Recover with
  `git checkout package.json package-lock.json && rm -rf node_modules && npm ci`.
- RN 0.83.6's bundled global `URL`/`URLSearchParams` types are narrower than
  0.84's (no `hostname`/`pathname`/`URLSearchParams.get`). `react-native-url-polyfill`
  supplies them at runtime; the TS gap is patched in
  `src/shared/types/url-polyfill.d.ts`.

### iOS build (Xcode 26 + CocoaPods)
- **Disable "Explicitly Built Modules" for BOTH compilers in the Podfile.**
  Xcode 26 turns it on by default; its dependency scanner expects every pod's
  module map up front, but CocoaPods generates them later → thousands of
  `module map file ... not found` (e.g. `RCTSwiftUI.modulemap`). The Podfile
  `post_install` sets **both** `CLANG_ENABLE_EXPLICIT_MODULES = 'NO'` *and*
  `SWIFT_ENABLE_EXPLICIT_MODULES = 'NO'` on every pod target — setting only the
  CLANG flag leaves Swift pods (RCTSwiftUI, Sentry) broken. Keeping it in the
  Podfile means it survives `pod install`. Verify with
  `xcodebuild -showBuildSettings | grep -i explicit`.
- **Ruby 3.4 needs `gem 'nkf'`** in the `Gemfile`, or `pod install` dies with
  `cannot load such file -- kconv` (xcodeproj `< 1.26` still `require`s `kconv`,
  which Ruby 3.4 dropped from stdlib).
- **iOS release path is Xcode Archive** (EAS submit has been unreliable for this
  project), so local Xcode must stay buildable — don't rely on EAS alone.

### Metro
- **`config.resolver.unstable_enablePackageExports = false` in `metro.config.js`
  is load-bearing — do NOT remove it.** It disables Metro's package-"exports"
  resolution. With it ON (the SDK 55 default), Metro resolves an ESM build of a
  bootstrap polyfill (`@react-native/js-polyfills/console.js`) that calls
  `require` before the module runtime exists → the launch-blocking redbox
  `[runtime not ready]: Property 'require' doesn't exist`. The stack is
  bootstrap-level with **no app frames**, which is why it reads like a native/cache
  problem and sent us chasing babel, Pods, and Metro cache for a long time — none
  of those were it. This one line was the fix (expo/expo #36635 / #36551).
  **Caveat / known cost:** turning exports resolution off can occasionally
  mis-resolve a package that ships *only* an `exports` map (no legacy `main`), so
  if a dependency misbehaves around module loading later, this line is the first
  suspect — but replace it with a tested alternative; never delete it as "cleanup."
- **After any native or dependency-version change, start Metro with
  `--clear`** (`npx expo start --dev-client --clear`). Metro caches a snapshot of
  `node_modules`; a "module/file not found" error spanning *unrelated* packages
  (`foreignNames.js`, `checkDuplicateRouteNames.js`) is a stale cache, not the
  packages. `npx expo run:ios/android` does **not** reset the cache.

### Git
- **Local `main` can go stale silently** — `git pull` sometimes no-ops while
  `origin/main` has moved (cost us a "the fix never reached my Mac" detour). When
  in doubt: `git fetch origin main && git reset --hard origin/main`.
