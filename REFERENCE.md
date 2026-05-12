# HotPick Sports — Architecture Reference

Full context for development. Hard guardrails and red flags are in `CLAUDE.md` — read that first.

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
data_provider, scoring_locked, playoff_start_week
```

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

### Partner Pools
- `invite_slug` doubles as invite code (e.g., "MESQUE")
- `join_pool_by_invite` RPC checks BOTH `invite_code` AND `UPPER(invite_slug)`
- Slugs: alphanumeric + hyphens, max 12 chars, stored lowercase, matched case-insensitive
- `brand_config JSONB` on pool — NULL = HotPick defaults, populated = partner branding

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
Do not build UI yet. Nullable columns already added to `season_picks`:
- `super_bowl_q1_pick`, `super_bowl_q2_pick`, `super_bowl_q3_pick` (TEXT)
- `super_bowl_margin_prediction` (INT — Price Is Right tiebreaker)

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
| `nfl-update-scores` | Cron | Every 5 min (game days) |
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
| `season-simulator` | Manual (admin) | On demand |
| `send-broadcast-email` | Client-triggered (non-blocking) | On broadcast send |
| `compute-hardware` | weekly_settle / season_settle / manual_override | — |

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

### Week State Machine
```
picks_open → locked → live → settling → complete → picks_open (next week)
```
Above is the in-cycle progression during REGULAR, PLAYOFFS, and SUPERBOWL. Outside the weekly cycle (PRE_SEASON, REGULAR_COMPLETE, SUPERBOWL_INTRO, SEASON_COMPLETE), `week_state = 'idle'`.

| State | What the card shows |
|---|---|
| `idle` | Off-cycle state. Calm salutation, 0 pts season total, join/create pool CTA, SmackTalk pointer. No countdown, no live data. Verified active during PRE_SEASON; assumed used in other non-weekly phases — confirm before relying. |
| `picks_open` | Countdown to kickoff + HotPick game + social pressure ("X of Y poolies locked in") |
| `locked` | Waiting state — picks are in, games haven't started |
| `live` | HotPick game: teams, live score, current point impact ("+6 if this holds") + pool rank delta |
| `settling` | Weekly result: net points + rank movement with named players + SmackTalk CTA |
| `complete` | Season standings framed as a race ("47 pts behind 1st. 9 weeks left.") + mini sparkline |

### Context-Aware Salutations

| State | Examples |
|---|---|
| picks_open, game day | "Picks are open." / "Your move." / "Clock's running." |
| picks_open, deadline close | "Last call." / "Closing time." / "You sure about this?" |
| picks submitted | "On record. No edits." / "Said what you said." / "Locked in." |
| games live | "It's happening." / "Too late to change anything." |
| results in | "The record doesn't lie." / "It's official." |
| off day | "Nothing today." / "Rest day." / "Back at it soon." |

### Join Pool Module
- Shown when user has no visible private pool
- Suppressed during `SEASON_COMPLETE`
- Self-hides on successful join or creation
- No dismiss button — the module IS the CTA

### Bottom Tab Order
Dashboard (far left, raised Target icon) | Games | Leaders | SmackTalk | (History) | Settings

Leaders and SmackTalk share a single underline via custom `GroupedTabBar` in `MainTabNavigator.tsx`.

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

**8 toggleable notification types per user** (enforced server-side before delivery):
- `picks_open`, `picks_reminder`, `game_started`, `score_update`
- `week_settled`, `hardware_awarded`, `smack_mention`, `broadcast_received`

**Delivery flow:** `notification_queue` table → `process-notification-queue` Edge Function (cron every 60s) → Expo push service.

**Broadcasts also send email:** `send-broadcast-email` Edge Function (non-blocking). Fetches pool member emails from `profiles`, sends individually via Resend API.

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
One hardcoded hex is permitted — `SplashScreen.tsx` container background only: `#111414`. Must match `app.json`, `colors.xml` (bootsplash_background), and `BootSplash.storyboard` exactly. Change all four or change none.

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
  logo_url: string;           // CDN URL, PNG or SVG
  app_name: string;           // always "HotPick"
  invite_slug: string;
  is_branded: boolean;
  powered_by_hotpick: true;   // literal type — cannot be false
}
```

Lives in `src/shell/theme/types.ts`. One definition, never duplicated.

### White Label Build Status

| Phase | Status | Notes |
|---|---|---|
| 1 | ✅ Done | Database: `partners` table, `pools.partner_id`, `pools.invite_slug` |
| 2 | ✅ Done | ThemeProvider + useBrand() wiring |
| 3 | ⏳ Deferred | Branch.io SDK — requires real device, high risk |
| 4 | ⏳ Deferred | Deep link handler (basic handler exists, needs Branch.io + partner slug lookup) |
| 5 | ⏳ Deferred | Branded pool join flow (3 screens) |
| 6 | ✅ Done | PoweredByHotPick component |
| 7 | ✅ Done | Partner Admin Screen (super_admin only) |
| 8 | ✅ Done | QR code generation in Partner Admin |
| 9 | ✅ Done | Partner color editing (4 colors + `deriveFullBrandColors()` auto-compute) |
| 10 | ✅ Done | Partner logo upload via Supabase Storage REST API |

Partner dark mode: backgrounds use HotPick dark overrides; primary/secondary/highlight keep partner values. Bottom tab bar always uses HotPick colors (not partner).

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
  PoolSettingsScreen.tsx      ← Edit name, share invite, archive, broadcast, moderation
  FlaggedMessagesScreen.tsx   ← Moderation queue: approve/remove, send notes
  MessageCenterScreen.tsx     ← User inbox: broadcasts + moderator notes (30 days)
  PartnerAdminScreen.tsx      ← Super admin only. Create partners, edit colors/logo, assign pools
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
