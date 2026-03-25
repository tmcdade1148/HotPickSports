# HotPick Sports — Claude Code Context

This file gives Claude Code the architectural context needed to assist
with HotPick Sports development without re-explaining core decisions
each session. Read this before writing any code.

---

## 1. What This App Is

HotPick Sports is a sports prediction platform. Users make picks once
and compete across multiple pools simultaneously. Scores belong to the
user, not to any pool. Pools are social lenses on shared user-level data.

**This pool-independent architecture is the deepest structural moat.
Never suggest designs that tie picks or scores to a pool_id.**

---

## 1a. Product Roadmap & Active Build Priorities

**Confirmed launch sequence:**
- **NFL Season 2 — September 2026** — Season template. Primary validation
  event. Self-funded. Proves engagement, retention, and willingness to pay.
- **NHL Playoffs — April 2027** — Series template. First multi-sport proof.
  Series template spec session: October 2026.
- **World Cup / Tournament — TBD** — Tournament template. No committed date.

**Current technical state (March 2026):**
- DB completely restructured supporting all three templates
- Working NFL Season 2 on Android simulator and iOS (simulator + physical device)
- Successfully deployed to physical iPhone via Xcode (TestFlight upload tested)
- Edge Functions rebuilt for simplicity and efficiency
- Scoring rebuild complete — addresses all Season 1 failures
- Template-first architecture built in React Native
- Bundle ID: `com.hotpicksports` (iOS + Android)
- Marketing version: 2.0
- Auth providers: Apple Sign In (native), Google Sign In (native), Email/Password
- Password recovery: deep link via `hotpick://auth/reset`, PKCE + implicit flow supported
- Privacy policy rendered as native ScrollView (no WebView), linked from login + Settings
- Terms of Service rendered as native ScrollView, linked from login + Settings
- Game Day Engagement System: live pick splits, HotPick concentration, Path Back narrative
- History & Hardware System: 11 award types, History tab, Hardware Admin, Player Archetypes
- Settings page organized into grouped sections (Inbox, My Pools, About & Legal, Admin)
- Push notifications: expo-notifications SDK, process-notification-queue Edge Function (cron 60s)
- Notification preferences: 8 toggleable types per user, enforced server-side before delivery
- Account deletion: two-step confirmation, anonymize_deleted_user() RPC, satisfies Apple/Google
- TOS checkbox: explicit acceptance required before auth, writes tos_accepted_at + tos_version
- User blocking: platform-wide via user_blocks table, long-press Block in SmackTalk
- Community Guidelines screen linked from Settings

**Default event:** `nfl_2026` — this is the active competition.
Do not default to worldCup2026 or any other event.

**Self-funded validation metrics (defined before launch):**
- 10+ pools created by people outside the founder's personal network
- 70%+ week-over-week retention across the season
- 3+ pools converting to paid tier ($19+)
- Zero scoring intervention required during the 18-week season

---

| Layer | Technology |
|---|---|
| Client | React Native (TypeScript) — iOS + Android from one codebase |
| Backend | Supabase (project: `mzqtrpdiqhopjmxjccwy`) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (Apple, Google, Email) with persistent sessions |
| Realtime | Supabase Realtime (SmackTalk, live leaderboards) |
| Scoring | Supabase Edge Functions (server-side, platform-agnostic) |
| State | Zustand — sport-scoped stores + shared global store |
| Navigation | React Navigation — nested navigators per sport |
| Data APIs | ESPN API (game data), The Odds API (betting lines for ranking) |

---

## 3. Three-Template Architecture

Every sport maps to one of three templates. **Never create new tables
per sport or event. Add rows to existing template tables with an
`event_id`.**

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
- `series_matchups` — series definitions (e.g., Rangers vs Bruins)
- `series_games` — individual games within a series
- `series_picks` — user picks at the series level
- `series_user_totals` — aggregated round scoring per user

### Shared Tables (never template-specific)
- `profiles` — user identity (full name, poolie name, display toggle)
- `pools` — pool definitions (one pool = one event, no rollover)
- `pool_members` — pool membership
- `partners` — white label partner definitions (name, slug, canonical brand_config)
- `smack_messages` — per-pool chat messages
- `smack_reactions` — emoji reactions on messages (6 allowed types, max 8 distinct per message)
- `smack_read_state` — tracks last_read_at per user per pool for unread dot computation
- `competition_config` — per-competition state management
- `events` — master events registry (id, name, template_type, sport, status, config JSON)
- `organizer_acknowledgments` — legal log: organizer confirmed no-money-collection terms before pool creation

---

## 4. Competition String Convention

All events are identified by a lowercase `competition` string:
- `nfl_2025`, `nfl_2026`
- `world_cup_2026`
- `nhl_playoffs_2027`
- `nba_playoffs_2027`

This string is the primary key for scoping all queries. Use it
consistently. Never use a numeric event_id alone without the competition
string context.

---

## 4a. competition_config Table — Schema & Rules

Key-value config store for all competition state and behavioral
configuration. One row per competition+key pair. Evolves by adding
rows, never by changing structure.

### Two config categories

**`global` keys** — app-wide feature flags not tied to any competition:
- `briefing_gate_active` — controls pre-launch gate screen
- `maintenance_mode` — pauses the entire app

**Competition keys** — scoped to a specific competition string.
Two subcategories:
- Operational state: changes as the competition progresses
  (current_week, current_stage, is_active, picks_open)
- Behavioral config: written once before competition starts, rarely
  changes (phases, powerUps, carryOver, template, sport)

### Valid key names by template

**Season** (nfl_2025, nfl_2026):
```
current_week        → integer
current_phase       → PRE_SEASON | REGULAR | REGULAR_COMPLETE | PLAYOFFS | SUPERBOWL_INTRO | SUPERBOWL | SEASON_COMPLETE
is_active           → boolean
is_season_complete  → boolean
template            → "season"
sport               → "nfl"
season_year         → integer
phases              → JSON array of phase definitions
powerUps            → JSON object
carryOver           → JSON object
data_provider       → "espn"
scoring_locked      → boolean (emergency flag)
playoff_start_week  → integer (set when REGULAR→PLAYOFFS transition occurs)
```

**Global keys (competition = 'global'):**
```
free_tier_max_pools       → integer (1)
free_tier_max_members     → integer (10)
paid_small_max_members    → integer (25)
paid_medium_max_members   → integer (50)
paid_large_max_members    → null (unlimited)
founding_pools_remaining  → integer (starts at 100, decrements on creation)
briefing_gate_active      → boolean
maintenance_mode          → boolean
```

**Tournament** (world_cup_2026):
```
current_stage       → PRE_TOURNAMENT | GROUP | R32 | R16 | QF | SF | FINAL
group_picks_open    → boolean (opens May 27)
group_picks_locked  → boolean (locks June 11, never reopens)
knockout_picks_open → boolean
is_active           → boolean
is_complete         → boolean
template            → "tournament"
sport               → "soccer"
data_provider       → "espn"
scoring_locked      → boolean (emergency flag)
```

**Series** (nhl_playoffs_2027 and future):
```
current_round       → FIRST_ROUND | SECOND_ROUND | CONF_FINALS | FINALS
series_picks_open   → boolean
is_active           → boolean
is_complete         → boolean
template            → "series"
sport               → "nhl" | "nba" | "mlb"
data_provider       → "espn"
scoring_locked      → boolean (emergency flag)
```

### SmackTalk Retention Policy

**Users see the last 14 days of messages in any pool feed.**
Messages older than 14 days are moved nightly to `smack_messages_archive`
by the `archive_old_smack_messages()` function (cron: `smack-archive-old`,
runs 3:00am UTC daily).

**Archive is permanent and immutable.**
`smack_messages_archive` retains all messages indefinitely for AI training
and engagement analytics. No rows are ever deleted from this table.

**SmackTalk starts fresh for every new pool.**
A new pool has an empty feed. There is no message migration between pools,
even for "run it back" pools created from a previous season.

**The client never queries `smack_messages_archive` directly.**
Archive access is via Edge Functions with service role only.

### Red Flag: SmackTalk Data Destruction
- Any `DELETE FROM smack_messages` without a prior INSERT to archive
- Re-adding a purge cron job that deletes without archiving
- Querying `smack_messages_archive` from the client

> **What to say:** "SmackTalk data is never deleted — it is archived.
> The archive is permanent and exists for AI/analytics purposes.
> Please revise."

### Critical rules

**Always include `description`** when inserting a new key. A config
table with null descriptions is unreadable six months later.

**`template`, `sport`, and `season_year` keys are transitional.**
They belong on a future `events` master registry table. When that
table is built, migrate these keys there and remove them from
competition_config.

**`scoring_locked` is an emergency flag on every competition.**
Setting it to true pauses all scoring Edge Function computation for
that competition without a deployment. Always include it.

**Never add a key without a description:**
```sql
-- CORRECT
INSERT INTO competition_config (competition, key, value, description)
VALUES ('nhl_playoffs_2027', 'current_round', '"FIRST_ROUND"',
        'Current playoff round: FIRST_ROUND | SECOND_ROUND | CONF_FINALS | FINALS');

-- WRONG
INSERT INTO competition_config (competition, key, value)
VALUES ('nhl_playoffs_2027', 'current_round', '"FIRST_ROUND"');
```

**Reading config in Edge Functions:**
```typescript
// Always fetch the full competition config block at function start
const { data: config } = await supabase
  .from('competition_config')
  .select('key, value')
  .eq('competition', competition);

// Convert to a map for easy access
const cfg = Object.fromEntries(config.map(r => [r.key, r.value]));

// Then use throughout the function
if (cfg.scoring_locked) return;
const stage = cfg.current_stage;
```

**Never hardcode competition state in application code.** If the app
needs to know whether group picks are open, it reads
`competition_config`. It never assumes based on a hardcoded date or
constant.

### Red Flag: competition_config Violations
- New key inserted without a description field
- Competition state hardcoded in a component or Edge Function
  ("if date > June 11, show knockout picks")
- Key names invented on the fly that don't match the defined list above
- `scoring_locked` missing from a new competition's seed data

> **What to say:** "Competition state is always read from
> competition_config, never hardcoded. Use the defined key names for
> this template type and always include a description. Please revise."

---

## 4b. subscriptions Table — Schema & Rules

Tracks paid organizer subscriptions. One row per pool per paying
organizer. Free tier users have no row — free status is inferred
from the absence of an active subscription.

### Plan Values (check constraint — use exactly these strings)
```
'free'             → no row needed, inferred from absence
'organizer_small'  → $25/event, 1 pool, up to 100 members
'organizer_large'  → $75+/event, 1 pool, 100+ members
'addon_sport'      → $15, additional event for existing organizer
'addon_pool'       → $15, additional pool same event
```

### Status Values (Stripe-defined — check constraint)
```
'active' | 'canceled' | 'past_due' | 'trialing' |
'incomplete' | 'incomplete_expired' | 'unpaid'
```

### Key Columns
- `pool_id` — subscription is per pool, not per user+competition.
  One organizer can have multiple subscriptions for the same
  competition (multiple pools). The unique constraint is
  (user_id, pool_id).
- `competition` — denormalized convenience column. Redundant with
  pool_id → pools.competition but kept for fast lookups. Always
  keep in sync with the pool's competition value.
- `max_members` — the member ceiling for this specific subscription.
  Null = unlimited (organizer_large). Populated from
  competition_config at subscription creation time.
- `cancel_at_period_end` — Stripe sets this when user cancels but
  retains access until period end. UI shows "ends on [date]" not
  "canceled" when this is true and status is still active.
- `canceled_at` — when cancellation was requested. Different from
  current_period_end which is when access expires.
- `metadata jsonb` — Stripe webhook data that doesn't fit typed
  columns. Promo codes, payment method, trial info.

### Tier Limits Live in competition_config, Never in Code

**Pricing model (canonical — as of March 2026):**
- Free: pools up to 10 players, 1 pool per competition
- $19 (organizer_small): 11–25 players
- $39 (organizer_medium): 26–50 players
- $69 (organizer_large): 51+ players (unlimited)
- Founding 100 pools: free forever regardless of size (see founding_pools_remaining)

```sql
-- Always read limits from config, never hardcode
SELECT value FROM competition_config
WHERE competition = 'global' AND key = 'free_tier_max_pools';
-- Returns: 1

SELECT value FROM competition_config
WHERE competition = 'global' AND key = 'free_tier_max_members';
-- Returns: 10

SELECT value FROM competition_config
WHERE competition = 'global' AND key = 'paid_small_max_members';
-- Returns: 25

SELECT value FROM competition_config
WHERE competition = 'global' AND key = 'paid_medium_max_members';
-- Returns: 50

SELECT value FROM competition_config
WHERE competition = 'global' AND key = 'paid_large_max_members';
-- Returns: null (unlimited)

SELECT value FROM competition_config
WHERE competition = 'global' AND key = 'founding_pools_remaining';
-- Returns: integer, counts down from 100. When > 0, pool creation is free
-- regardless of size. Decrement on every pool creation until 0.
```

### Enforcement Rules (server-side only, never client-side)

**Pool creation check:**
```
1. Check founding_pools_remaining from competition_config global keys
2. If founding_pools_remaining > 0:
   → Allow pool creation free regardless of size
   → Set pool.is_founding_pool = true
   → Decrement founding_pools_remaining
   → Skip all tier checks below
3. Read free_tier_max_pools from competition_config
4. Count active pools owned by this user for this competition
5. Check user's subscription plan
6. Free plan + count >= limit → block, return upgrade prompt
7. Otherwise → allow, set pool.member_limit from config based on plan tier
```

**Pool member limit by plan:**
```
free             → member_limit = 10
organizer_small  → member_limit = 25
organizer_medium → member_limit = 50
organizer_large  → member_limit = NULL (unlimited)
is_founding_pool = true → member_limit = NULL (unlimited, all sizes free)
```

**Pool join check:**
```
1. Get pool.member_limit
2. Count active members in pool_members WHERE status = 'active'
3. member_limit IS NULL → paid unlimited, allow
4. count >= member_limit → block, return upgrade prompt
5. Otherwise → allow
```

**Client shows upgrade prompt based on server error response.
Client never decides to allow or block on its own.**

### Red Flag: Subscriptions Violations
- Hardcoded plan names as strings anywhere in code other than
  this list → use the defined plan values
- Tier limits hardcoded as constants (MAX_FREE_POOLS = 1) →
  read from competition_config
- Pool join or creation enforced client-side only →
  always enforce server-side in Edge Function
- `competition` column written independently from pool's competition
  value → always derive from the pool

> **What to say:** "Tier limits are never hardcoded — read from
> competition_config global keys. Enforcement always runs
> server-side in an Edge Function. Please revise."

---

## 5. Pool-Independent Scoring Rules

**CRITICAL — read before touching any scoring or leaderboard code:**

- User scores are stored in `*_user_totals` tables with **no `pool_id`
  column**
- Leaderboards are computed views filtered by pool membership AND pool
  start date at query time
- A pool created mid-season immediately shows all members' scores from
  the pool's start date — not from season start
- Never store a score, total, or pick result with a `pool_id` attached
- **Always filter leaderboard queries by pool_start_date** — a pool
  that starts Week 6 must only count scores from Week 6 onward

```sql
-- CORRECT: leaderboard query with pool_start_date filter
SELECT t.user_id, p.display_name,
       SUM(t.points) as pool_points
FROM season_user_totals t
JOIN pool_members pm ON pm.user_id = t.user_id AND pm.status = 'active'
JOIN profiles p ON p.id = t.user_id
JOIN pools pl ON pl.id = pm.pool_id
WHERE pm.pool_id = $pool_id
  AND t.competition = $competition
  AND t.week_number >= (
    SELECT EXTRACT(WEEK FROM pool_start_date)
    FROM pools WHERE id = $pool_id
  )
ORDER BY pool_points DESC;

-- WRONG: ignores pool start date — full season scores bleed into mid-season pools
SELECT t.*, p.display_name
FROM season_user_totals t
JOIN pool_members pm ON pm.user_id = t.user_id
JOIN profiles p ON p.id = t.user_id
WHERE pm.pool_id = $pool_id
  AND t.competition = $competition
ORDER BY t.total_points DESC;

-- ALSO WRONG: never do this
SELECT * FROM season_user_totals WHERE pool_id = $pool_id;
```

**Dual leaderboard views — both required on every pool leaderboard screen:**
- **Week-side view**: prior week scores only — who won the week
- **Season-side view**: cumulative scores from pool_start_date to present
- Both views use the same pool_start_date filter
- Both views are always available via a toggle — never show only one
- Week-side creates short-term urgency; season-side maintains long-term narrative

---

## 6. HotPick Mechanic & Scoring

The HotPick is the core escalation mechanic. The **platform assigns
ranks** based on competitiveness data. Users designate one pick per
period as their HotPick. Users cannot assign their own point values —
this would destroy the social dynamic.

### World Cup Scoring (locked)
- **Group Stage:** 32 pre-tournament group advancement predictions, max
  68 points
- **Knockout Stage:** Fixed ranks per round — R32=3, R16=4, QF=6, SF=8,
  Final=10
- **HotPick:** Correct = +rank points. Wrong = -rank points
- **Standard pick:** Correct = +1. Wrong = 0
- **Maximum total: 139 points**

### Super Bowl Enhanced Scoring (builds November 2026)

The Super Bowl activates when `current_phase = SUPERBOWL`. Additional
nullable columns on `season_picks` support enhanced scoring. These
columns exist from day one as nullables — populated only during
SUPERBOWL phase.

**Do not build Super Bowl UI until November 2026. Do add the nullable
columns now so no migration is required later.**

```sql
-- Add to season_picks table (nullable — only populated during SUPERBOWL phase)
ALTER TABLE season_picks ADD COLUMN IF NOT EXISTS
  super_bowl_q1_pick TEXT NULL;           -- team leading after Q1
ALTER TABLE season_picks ADD COLUMN IF NOT EXISTS
  super_bowl_q2_pick TEXT NULL;           -- team leading at halftime
ALTER TABLE season_picks ADD COLUMN IF NOT EXISTS
  super_bowl_q3_pick TEXT NULL;           -- team leading after Q3
ALTER TABLE season_picks ADD COLUMN IF NOT EXISTS
  super_bowl_margin_prediction INT NULL;  -- exact margin, Price Is Right tiebreaker
```

**Super Bowl scoring rules (for reference — do not implement until November 2026):**
- Super Bowl winner pick: automatic HotPick, fixed at highest rank (+N correct / -N incorrect)
- Q1 leader correct: +1 / incorrect: -1
- Halftime leader correct: +2 / incorrect: -2
- Q3 leader correct: +3 / incorrect: -3
- Margin prediction: tiebreaker only — closest without going over wins
- Maximum Super Bowl score: +22 (winner + all three quarters correct)
- Minimum: -16 (winner wrong, all quarters wrong)

---

## 7. Directory Structure

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
  /store
    /global.ts        ← Auth, user profile, pool membership, notifications
    /worldcup.ts      ← WorldCupViewModel (sport-scoped)
    /nfl.ts           ← NFL store (sport-scoped)
  /services
    /supabase.ts      ← Supabase client init
    /espn.ts          ← ESPN API integration
    /odds.ts          ← The Odds API integration
```

**The app shell never imports directly from a sport module.** It queries
the `SportRegistry` for available events and renders accordingly. A bug
in the NHL store must never corrupt NFL state.

---

## 8. ViewModel Pattern

Each sport has its own ViewModel (Zustand store) to keep AppState lean.

```typescript
// CORRECT: sport-scoped store
import { useWorldCupStore } from '@/store/worldcup';

// WRONG: sport-specific state bloating global store
import { useAppStore } from '@/store/global'; // only for auth/profile/pools
```

---

## 9. Feature Flags

New sport modules are hidden from beta testers during development via:

```typescript
const isNHLEnabled = __DEV__ || userIsDeveloper;
const isTournamentEnabled = __DEV__ || userIsDeveloper;
```

Developer Settings screen unlocks non-active sports for dev access. Never remove
this gate without explicit instruction. NFL Season 2 is the active production
event — all other sport modules require the developer gate.

### Super Admin

`is_super_admin BOOLEAN NOT NULL DEFAULT false` on `profiles` table.
Platform-owner-only flag. Currently set for Tom's two accounts only.

**Gates:**
- Partner Admin screen (visible in production for super admins, invisible to everyone else)
- Future: competition_config editor, scoring triggers, user lookup

**Partners never get admin tools.** Partner branding is managed by
HotPick (super admin) on their behalf. Partners interact with
the app as organizers of their branded pools, nothing more.

**Never gate admin tools on `__DEV__`.** Use `is_super_admin` for
anything that should work in production. `__DEV__` is only for
sport module feature flags (NHL, Tournament).

---

## 10. RLS Policy Pattern

All tables use Row Level Security. Every user can only read/write their
own data. Leaderboard reads go through the pool membership join, not
direct table access.

```sql
-- Standard RLS pattern for picks tables
CREATE POLICY "Users manage own picks"
ON tournament_picks
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

Never suggest bypassing RLS with service role keys on the client side.
Edge Functions use service role for scoring computation only.

---

## 11. Scoring Runs Server-Side

All scoring computation happens in Supabase Edge Functions. The client
displays scores; it never computes them.

- Edge Functions use service role key (server only)
- Client uses anon key with RLS
- Scoring is triggered by game status changes, not client actions

---

## 12. Pool Model Rules

- One pool = one event (no rollover between seasons)
- Users join via invite code only — no pool discovery/browse at launch
- Organizers can "run it back" to create a new pool for a new event,
  notifying past participants
- No auto-enrollment ever
- Pool creation is available to any user, not just admins

**Organizer acknowledgment (legal requirement):**
Every pool creation shows a native Alert requiring the organizer to
acknowledge that collecting money from participants is prohibited by
the Terms of Service. Tapping "I Understand. Create My Pool" logs to
`organizer_acknowledgments` table: `{user_id, timestamp, version: "1.0"}`.
This popup cannot be skipped or removed without legal approval.

**Pool start date architecture (critical):**
- Every pool has a `pool_start_date` (DATE, NOT NULL, DEFAULT current_date)
- The pool leaderboard scores from `pool_start_date` forward — not from
  season start and not from player join date
- A player joining a Week 10 pool competes from Week 10 forward, starting
  at zero within that pool — equal to everyone else in that pool
- Pool score and global score are completely independent calculations
- This architecture makes mid-season pools, playoff pools, and Super Bowl
  pools possible with zero additional schema changes
- **Never build a leaderboard query that ignores pool_start_date**

**White label pool columns:**
- `partner_id UUID REFERENCES partners(id)` — nullable, set when pool
  is created for a partner
- `invite_slug TEXT UNIQUE` — nullable, the slug used in the invite URL
  (e.g. "mesque" for hotpick.app/mesque)
- `brand_config JSONB DEFAULT NULL` — NULL = HotPick defaults, populated
  = partner branding (copied from partners table at creation time)

**Founding pool mechanic:**
- `is_founding_pool BOOLEAN NOT NULL DEFAULT false` on pools table
- First 100 pools created (any size) are free forever
- Determined at creation time by `founding_pools_remaining` config key
- Founding pool status is permanent — never revoked
- Founding pools display a permanent recognition badge in the UI

---

## 12a. pool_members Table — Schema & Rules

The pool_members table tracks membership with full history. Never DELETE
a member row — soft delete by setting status = 'removed' or 'left'.

### Key Columns
- `role` — 'member' | 'admin' | 'organizer' (enforced by CHECK constraint)
- `status` — 'active' | 'pending' | 'removed' | 'left' (enforced by CHECK)
- `invited_by uuid` — who sent them the invite, for referral tracking
- `invite_code_used text` — which invite code brought them in
- `joined_at` — when they joined
- `left_at` — set when status changes from 'active', never on active members
- `last_active_at` — last pool-specific activity (picks, SmackTalk)
- `notification_override jsonb` — pool-level notification mute. NULL means
  follow global preferences on profiles table

### Critical Query Rules
```sql
-- ALWAYS filter by status = 'active' for leaderboards and member lists
-- The partial index idx_pool_members_active makes this fast
SELECT * FROM pool_members
WHERE pool_id = $pool_id
  AND status = 'active';  -- ← never omit this

-- WRONG: returns removed/left members
SELECT * FROM pool_members WHERE pool_id = $pool_id;
```

### Removing a Member
```sql
-- CORRECT: soft delete
UPDATE pool_members
SET status = 'removed', left_at = now()
WHERE pool_id = $pool_id AND user_id = $user_id;

-- WRONG: never hard delete
DELETE FROM pool_members WHERE pool_id = $pool_id AND user_id = $user_id;
```

### Foreign Keys
- `pool_members_user_id_profiles_fkey` — `user_id` → `profiles(id)`.
  Required for PostgREST join syntax `profiles:user_id(*)` used by
  `fetchPoolMembers`. Added March 2026.
- `invited_by` → `profiles(id)` (original FK)

### Index Rules
Three indexes only — all others are redundant and should be dropped:
- Primary key on (pool_id, user_id)
- `idx_pool_members_user_id` on (user_id)
- `idx_pool_members_active` partial index WHERE status = 'active'

### Red Flag: pool_members Violations
- `DELETE FROM pool_members` anywhere in the codebase → use soft delete
- Leaderboard query missing `AND status = 'active'` → add the filter
- `is_admin` column referenced → drop it, use role column instead
- `created_at` column referenced → drop it, use joined_at instead

> **What to say:** "Members are never hard deleted. Set status =
> 'removed' and left_at = now(). All active-member queries must
> filter on status = 'active'. Please revise."

---

## 12b. pools Table — Deletion, Archive & RLS Rules

### Archive vs Delete — The Policy

**Organizers never delete pools. They archive them.**
**Only platform admins can hard delete, with guards.**

This covers 99% of real cases. A pool with active members is never
deleted — it is archived. Archive is reversible. Delete is not.

### Archive Flow (organizer-initiated)
```sql
-- Archive a pool — hides it from active views, preserves all data
UPDATE pools
SET is_archived = true, archived_at = now()
WHERE id = $pool_id AND created_by = auth.uid();
```
Archived pools remain visible to members in a historical view.
All pool_members, picks, scores, and SmackTalk data is preserved.
Organizer can un-archive if needed.

### Delete Flow (admin-initiated, two-stage)

**Stage 1: Admin initiates deletion (grace period starts)**
```sql
-- Log to audit trail FIRST, before any changes
INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
VALUES (auth.uid(), 'POOL_DELETE_INITIATED', 'pools', $pool_id,
        jsonb_build_object('pool_name', $pool_name, 'reason', $reason));

-- Then mark for deletion
UPDATE pools
SET deleted_at = now(), deleted_by = auth.uid()
WHERE id = $pool_id;
```

Pool immediately disappears from all user views (RLS excludes
deleted_at IS NOT NULL from pools_select). Members lose access
instantly. But data still exists.

**Stage 2: Cron job executes CASCADE after 24 hours**
```sql
-- Runs via Supabase cron, 24hrs after deleted_at
DELETE FROM pools
WHERE deleted_at IS NOT NULL
  AND deleted_at < now() - INTERVAL '24 hours';
-- CASCADE removes: pool_members, pool_events, smack_talk,
-- pool_pulse, organizer_notifications
```

**Reversal window:** Admin can reverse by setting deleted_at = NULL
within the 24-hour window. After that, data is gone permanently.

### Guard Rails for Admin Deletion
1. Pool must have deleted_at set before DELETE runs (RLS enforces)
2. deleted_by must match auth.uid() (RLS enforces)
3. admin_audit_log entry required before marking deleted_at
4. 24-hour grace period before CASCADE executes
5. Never delete a pool with is_archived = false directly —
   archive first, then delete

### Current RLS Policies on pools
```
pools_select → deleted_at IS NULL AND user is active member
pools_insert → created_by = auth.uid()
pools_update → created_by = auth.uid() OR active admin/organizer member
pools_delete → deleted_at IS NOT NULL AND deleted_by = auth.uid()
```

### Pending Migration: created_by → organizer_id
`created_by` and `organizer_id` are redundant — they always hold
the same value. `organizer_id` is the correct name. Migration is
deferred because RLS policies currently reference `created_by`.

**When ready to migrate:**
1. Update all RLS policies to reference organizer_id
2. Drop created_by column
3. Add NOT NULL constraint to organizer_id

Do not reference `created_by` in any new code — use `organizer_id`.
RLS policies are the only exception until migration is complete.

### admin_audit_log
Every destructive admin action logged before execution.
Never skip this — it is the only record of who did what and when.

Valid action values:
```
POOL_DELETE_INITIATED
POOL_DELETE_REVERSED
POOL_ARCHIVED_BY_ADMIN
MEMBER_REMOVED_BY_ADMIN
SUBSCRIPTION_MODIFIED
```

### Red Flag: Pool Deletion Violations
- `DELETE FROM pools` anywhere outside the cron job
- Pool deleted without an admin_audit_log entry
- `deleted_at` set without logging to admin_audit_log first
- Organizer UI with a delete button (archive only for organizers)
- New code referencing `created_by` instead of `organizer_id`

> **What to say:** "Organizers archive pools, they never delete them.
> Hard deletion is admin-only, requires audit logging first, and
> executes via cron after a 24-hour grace period. Use organizer_id
> not created_by in new code. Please revise."

---

## 13. User Identity

- Profile stores: `full_name` (private), `poolie_name` (public persona),
  `display_name_preference` toggle ('first_name' | 'poolie_name')
- Default display on leaderboards and SmackTalk: first name
- Users can switch display to poolie_name at any time
- `display_name` column alone is insufficient — both source fields required

---

## 14. What Does NOT Ship for NFL Season 2 Launch

Do not implement or suggest these unless explicitly asked:
- Power-ups (Double-Down, Lifeline, Bracket Vision)
- Pick change log UI (table exists, not wired)
- Career hardware awards: Veteran, Back-to-Back, Iron Man (Phase 2 — needs multi-season data)
- AI-generated Player Archetypes (Phase 2 — template-based system ships at launch)
- Tier system (needs cross-event data)
- Advanced pool admin: nudge flow (member list, pool settings, broadcast, moderation, message center are built)
- Pool discovery / browse
- Pick-linked auto-messages in SmackTalk
- Exact score predictions
- Super Bowl enhanced scoring UI (builds November 2026 — Super Bowl is February 2027)
- Playoff automatic reset UI (builds November 2026 — Wild Card is January 2027)
- Global leaderboard (deferred until 500 active users — Personal Performance Dashboard ships instead)
- AI SmackTalk observations
- Organiser Pro premium tier UI
- Player opt-in public profiles
- Referral program UI
- Series template (NHL Playoffs April 2027 — deep dive session October 2026)
- Tournament template (World Cup — no committed date)
- Automated Instagram posts for white label partners
- White label season-end summary screen (partner-specific CTA)
- White label partner dashboard / reporting (weekly email digest covers interim)
- Stripe billing for white label (manual billing at current partner count)
- Acquisition source tagging for partner invite links

**Scope creep on any of these risks the NFL Season 2 September 2026 launch.**

---

## 15. Admin Dashboard & Pool Intelligence Architecture

The organizer admin dashboard is built in two layers: a simple human
UI on top, and a capable event-log infrastructure underneath. The
infrastructure ships with World Cup. The advanced UI comes later.

**Do not build analytics charts, AI copy, or advanced moderation yet.
Do build the database tables — they capture data from day one.**

### New Tables Required (World Cup Build)

**`pool_events`** — the event log. Every meaningful pool action written
here. Foundation of all future intelligence and analytics.

Valid event_type values (use these exactly, never freeform strings):
```
MEMBER_JOINED, MEMBER_LEFT, MEMBER_REMOVED
PICK_SUBMITTED, PICKS_COMPLETE
HOTPICK_DESIGNATED
SCORE_UPDATED, STREAK_ACHIEVED, MILESTONE_REACHED
LEADERBOARD_CHANGE
SMACKTALK_SENT, SMACKTALK_FLAGGED, SMACKTALK_REMOVED
ORGANIZER_BROADCAST, ORGANIZER_NUDGE
POOL_CREATED, POOL_ARCHIVED
ROUND_OPENED, ROUND_CLOSED, ROUND_SCORED
```

**`member_engagement`** — computed snapshot per member per pool.
Updated by Edge Function after scoring. Powers member list status
indicators and future churn detection. Key fields: `last_active_at`,
`participation_rate`, `current_correct_streak`, `engagement_status`
('active' | 'at_risk' | 'dormant').

**`organizer_notifications`** — history of every broadcast and nudge.
Enforces rate limits: max 3 broadcasts/day, max 1 nudge/hour per pool.

**`pool_pulse`** — current Pulse digest per pool. Written by
`compute_pool_intelligence` Edge Function after each scoring run.
Stores max 2 human-readable insight strings per pool. Dashboard reads
this table — never computes intelligence client-side.

### Column Additions to `pools` Table
```sql
ADD COLUMN organizer_id UUID REFERENCES profiles(id),
ADD COLUMN brand_config JSONB DEFAULT NULL,
ADD COLUMN member_approval_required BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN max_members INTEGER DEFAULT NULL,
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
```

### Admin Screens (as built)
```
/src/shell/screens/
  PoolMembersScreen.tsx     ← FlatList of active members, promote/demote/remove
  PoolSettingsScreen.tsx    ← Edit name, share invite, archive pool, broadcast, moderation
  FlaggedMessagesScreen.tsx ← Moderation queue: approve/remove flagged messages, send notes
  MessageCenterScreen.tsx   ← User inbox: broadcasts + moderator notes (last 30 days)
  PartnerAdminScreen.tsx    ← Super admin only (is_super_admin gate). Create partners, edit colors/logo, assign pools
  PrivacyPolicyScreen.tsx   ← Native ScrollView privacy policy (no WebView/HTML). Linked from login + Settings
  AboutScreen.tsx           ← About HotPick Sports (placeholder content)
  InstructionsScreen.tsx    ← How HotPick Works: accordion sections (picks, pools, pricing, phases)
  WelcomeScreen.tsx         ← Login/signup with Privacy Policy link (navigates to PrivacyPolicyScreen)
/src/shell/components/
  BroadcastComposer.tsx     ← Modal: 160 char message, 3/day rate limit, send to pool
  home/MessageCenter.tsx    ← Home Screen module: broadcast previews + flagged message alerts
```

Admin screens live in /shell/screens/, never in sport modules.
Entry points: SettingsScreen pool rows show Users icon (→ PoolMembers)
and Settings gear (→ PoolSettings) for organizer/admin roles.

### Moderation & Message Center Architecture

**Moderator notes are private — they never appear in SmackTalk.**
When an organizer or admin sends a "Note to Poster" or "Note to Reporter"
from the FlaggedMessagesScreen, it writes to `organizer_notifications`
with `notification_type = 'moderator_note'`. The recipient sees it in
their Message Center only.

**Broadcasts also send email.** When `broadcastToPool` succeeds, the
client fires the `send-broadcast-email` Edge Function (non-blocking).
The Edge Function fetches pool member emails from `profiles` and sends
individually via Resend API.

**organizer_notifications valid types:**
`'broadcast' | 'nudge' | 'system' | 'moderator_note'`

**Message Center (Settings):** Shows all broadcasts and moderator notes
targeted at the user (last 30 days). Queries `organizer_notifications`
filtered by pool membership (broadcasts) and `recipient_user_ids`
containing the user's ID (moderator notes).

**MessageCenter (Home Screen module):** Shows last 24h broadcast previews
and flagged message counts for organizer/admin pools. Tapping broadcasts
navigates to the full Message Center screen. Tapping flagged navigates to
FlaggedMessagesScreen.

**Red flags:**
- Moderator note written to `smack_messages` → must use `organizer_notifications`
- SmackTalk showing "(Moderator)" messages → moderator notes are private
- Message Center querying `smack_messages` for mod notes → query `organizer_notifications`

### Admin Red Flags
- Intelligence computed in a React component → use pool_pulse table
- Notification sent without rate limit check → always call
  check_notification_rate_limit() before sending
- pool_events written with freeform event_type strings → use the
  defined enum values only
- Admin UI importing from a sport module → admin lives in shell only

### What Ships vs What Waits
Ships: pool CRUD, member list (with promote/demote/remove), pool settings
(edit name, share invite, archive), broadcast composer (160 char, 3/day
rate limit, email delivery), message center (broadcasts + moderator notes),
flagged message moderation (approve/remove/note), SmackTalk reactions
(long-press picker, 6 emojis, tap to see who reacted), dual leaderboard
(season + week with live Realtime updates), all 4 database tables,
compute_pool_intelligence Edge Function skeleton.
Deferred: nudge flow, Pulse digest UI, analytics, AI copy,
multi-pool management.

---

## 16. White Label & Theming Architecture

HotPick supports white label licensing via branded pool experiences
inside the standard app. Partners do not get a separate app. Users
download HotPick; when they arrive via a partner invite link
(hotpick.app/mesque), the app renders in the partner's colours and name.
**"Powered by HotPick" is non-negotiable on all branded screens.**

### The Three Rules

**Rule 1: Every color goes through the theme system.**
```typescript
// ❌ WRONG — never hardcode colors
backgroundColor: '#FF5500'

// ✅ CORRECT — always use theme hook
const { colors } = useTheme();
backgroundColor: colors.primary
```

**Rule 2: Every brand asset goes through the brand system.**
```typescript
// ❌ WRONG — never hardcode brand assets
<Image source={require('@/assets/hotpick_logo.png')} />
<Text>HotPick Sports</Text>

// ✅ CORRECT — always use brand hook
const { logoUrl, appName } = useBrand();
<Image source={{ uri: logoUrl }} />
<Text>{appName}</Text>
```

**Rule 3: Pool screens render from brandConfig, not hardcoded HotPick values.**
Pool leaderboard headers, SmackTalk headers, and pool landing pages must
read from the pool's brand_config field. For NFL Season 2 launch, every pool
uses HotPick defaults. The rendering pipeline must support custom values.

### ThemeProvider Structure

Lives at /src/shell/theme/. Wraps the entire app. Sport modules consume
via hooks — they never define their own colors.

### HotPick Brand Color Tokens (Canonical)

These are the locked brand values for the HotPick consumer product.
They are the source of truth for all theming. Update hotpickDefaults.ts
first if they ever change — then update app.json and the splash exception.

| Token          | Hex       | Usage                                              |
|----------------|-----------|----------------------------------------------------|
| `primary`      | `#F5620F` | Hot orange — CTAs, active buttons, highlights      |
| `secondary`    | `#45615E` | Muted teal — inactive accents, secondary states    |
| `highlight`    | `#F5C842` | Gold — NFL 2026 header, WEEK X, pool name, rank badges, chevrons |
| `background`   | `#FCFCFC` | App bg (light mode)                                |
| `surface`      | `#F4F4F4` | Cards, rows, pick cards, SmackTalk bubbles (light) |
| `glow`         | `#51A1A6` | Glow around active/highlighted elements            |

**Dark mode overrides** (auto-derived, partners don't manage dark mode):

| Token          | Hex       | Usage                                              |
|----------------|-----------|----------------------------------------------------|
| `background`   | `#0D1117` | App bg (dark mode)                                 |
| `surface`      | `#161C26` | Cards, rows, pick cards (dark mode)                |
| `text_primary` | `#8A97AA` | Headings, names, primary text (dark mode)          |
| `text_secondary`| `#A0A0A0`| Subtitles, hints, timestamps (dark mode)           |
| `border`       | `#2C3A52` | Dividers, section separators (dark mode)           |

Source of truth: `src/shell/theme/hotpickDefaults.ts`
Never copy these hex strings into other files — import from hotpickDefaults.

```typescript
interface BrandConfig {
  partner_name: string;        // e.g. "Mes Que"
  pool_label: string;          // e.g. "HotPick Mes Que"
  primary_color: string;       // hex e.g. #1A3A5C
  secondary_color: string;
  highlight_color: string;     // light color for text on dark backgrounds
  background_color: string;
  surface_color: string;
  text_primary: string;
  text_secondary: string;
  logo_url: string;            // CDN URL, PNG or SVG
  app_name: string;            // always "HotPick"
  invite_slug: string;         // e.g. "mesque"
  is_branded: boolean;         // true for partner pools
  powered_by_hotpick: true;    // literal type — cannot be false
}
```

One definition. Lives in `src/shell/theme/types.ts`. Never duplicated.
`powered_by_hotpick` is typed as the literal `true`, not `boolean`.
A developer cannot set it to false. Enforcement is in the type system.

### Partners Table

The `partners` table holds canonical brand config for each partner.
At pool creation, the partner's brand_config is copied into the pool's
`brand_config` column. **Rendering never depends on a live join to the
partners table — pools are self-contained.** (Hard Rule #23)

### Database

`brand_config JSONB DEFAULT NULL` exists on `pools` table.
NULL = use HotPick defaults. Populated = partner branding.
```

### White Label Red Flags
- Any hex color value appearing directly in a StyleSheet → use useTheme()
- Any hardcoded logo path or app name string in a component → use useBrand()
- Pool screen UI that doesn't read from brandConfig → refactor to use config

### Splash Screen Color Exception

One hardcoded hex value is explicitly permitted — and required — in
`SplashScreen.tsx`. This is the only component in the codebase where
a hex color may appear directly in a StyleSheet.

```typescript
// ✅ PERMITTED EXCEPTION — container background only
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111414', // Must match app.json exactly
  },
});
```

Why: useTheme() resolves after JS bridge init. The native and JS splash
must share a pixel-identical background or the handoff flashes.

The locations that must always match — change all or change none:
- `android/app/src/main/res/values/colors.xml` → `bootsplash_background`
- `ios/HotPickSports/BootSplash.storyboard` → background color
- `SplashScreen.tsx` → `styles.container.backgroundColor`

### Red Flag: Splash Color Exception Misuse
- Any hex color in SplashScreen.tsx other than container.backgroundColor
- Another component citing this exception as precedent
- The four locations above having different values

---

## 17. Profiles, Push Notifications & SmackTalk Mentions

### Profiles Table Key Rules

**Identity fields:** `full_name` (real name, private), `poolie_name`
(display persona, public), `display_name_preference` ('first_name' |
'poolie_name'). Never conflate these. `display_name` alone is
insufficient.

**Avatar:** Always set `avatar_type` ('system' | 'uploaded' | 'oauth' |
'generated'). `avatar_url` is the public URL, `avatar_key` is the
storage path. When importing OAuth avatars, re-upload to HotPick storage
- never store third-party URLs directly (they expire).

**Career stats columns exist from day one:** `total_career_points`,
`career_picks_correct`, `career_picks_total`, `career_hotpick_correct`,
`career_hotpick_total`. All default 0. Updated by Edge Function. Never
computed client-side.

**Referral code:** Generated at signup for every user. Never assigned
retroactively. `referred_by` stores the inviting user_id.

**Duplicate trigger/index to remove:**
- Drop `profiles_set_updated_at` (keep `set_profiles_updated_at` only)
- Drop `idx_profiles_default_pool_id` (keep partial index only)
- Rename `default_pool_id` to `last_active_pool_id`

---

### Push Notifications Key Rules

**Never store push tokens on `profiles`.** Use `user_devices` table.
One row per device per user. Set `is_active = false` on logout or
delivery failure. Never DELETE tokens.

**Never fire push notifications from the client.** All notifications
write to `notification_queue` first. The `process_notification_queue`
Edge Function (cron, every 60s) handles delivery via Expo Push API.

**Always check `notification_preferences` before queuing.** If the user
has a type set to false, write status = 'skipped', never send.

**Valid notification_type values (must match notification_preferences):**
```
picks_deadline | score_posted | leaderboard_change |
smacktalk_mention | smacktalk_reply | organizer_broadcast |
streak_milestone | new_member_joined
```

**Push provider: Expo Push Notifications.** Do not interact with APNs
or FCM directly.

---

### SmackTalk Mentions — The One Rule That Cannot Break

**Mention autocomplete is ALWAYS pool-scoped.**
Only members of the current pool appear as suggestions. Never query
all users. The pool_id is always known from navigation context.

```typescript
// CORRECT: scoped to current pool
const members = await supabase
  .from('pool_members')
  .select('user_id, profiles(...)')
  .eq('pool_id', poolId);

// WRONG: never do this
const members = await supabase.from('profiles').select('*');
```

**`smack_talk` table additions required:**
- `mentions uuid[]` — array of @mentioned user_ids (GIN indexed)
- `thread_parent_id uuid` — null for top-level, non-null for replies

**Mention notifications fire from Postgres trigger** (`on_smacktalk_mention`)
that writes to `notification_queue` after INSERT. Client never triggers
notifications directly.

**Store plain text + mentions array separately.** Never store styled
mention markup in the database. Render @Name highlighting client-side.

### Red Flag: Mention Scoping Violation
- Autocomplete querying `profiles` without a pool_id filter
- "Show all HotPick users as mention suggestions"
- Mention notifications triggered from the client

> **What to say:** "Mentions must be pool-scoped. Only query
> pool_members for the current pool_id. Notifications go through
> notification_queue via Postgres trigger. Please revise."

---

## 18. Start of Session Checklist

**Copy and paste this at the start of every Claude Code session:**

> "Read CLAUDE.md before we start. Confirm you understand the 21 hard rules and tell me which template (Tournament, Season, or Series) we're working in today."

Claude Code will read the file and summarize back what it understood.
If its summary misses anything important, correct it before writing
any code. Thirty seconds now prevents an hour of untangling later.

---

## 19. Red Flag Phrases — Stop and Question These

If Claude Code suggests something containing any of the phrases or
patterns below, **stop before accepting it.** These are the most common
ways the architecture gets quietly broken.

### 🚨 Pool-Independent Scoring Violations
- `pool_id` appearing in any `_picks` or `_user_totals` table column
- `WHERE pool_id = ...` in a scoring or totals query
- "store the score per pool" or "calculate pool-specific totals"
- Leaderboard query missing `pool_start_date` filter — mid-season pools
  must only count scores from the pool's start date, not full season

> **What to say:** "Scores belong to users, not pools. Pools filter a
> leaderboard view — they never store scores. All leaderboard queries
> must filter by pool_start_date. Please revise."

### 🚨 Client-Side Scoring
- Score calculation logic inside a React component or Zustand store
- `calculatePoints()` or similar functions on the client
- "update the user's total in the component after the pick is saved"

> **What to say:** "Scoring runs in a Supabase Edge Function only.
> The client displays scores, never computes them. Please revise."

### 🚨 New Tables Per Sport or Event
- `CREATE TABLE world_cup_picks` or `CREATE TABLE nfl_2026_games`
- Any new table that includes a sport name or year in the table name

> **What to say:** "We never create new tables per sport or event.
> Use the existing tournament_/season_/series_ tables with an event_id.
> Please revise."

### 🚨 App Shell Importing from Sport Modules
- `import { something } from '@/sports/worldcup/...'` inside shell code
- Sport-specific logic appearing in navigation, auth, or pool screens

> **What to say:** "The app shell never imports directly from a sport
> module. Use the SportRegistry pattern. Please revise."

### 🚨 Frozen Rank Being Overwritten
- Any UPDATE touching `frozen_rank` after the pick deadline
- "recalculate frozen_rank based on current odds"

> **What to say:** "frozen_rank is immutable after the pick deadline.
> Only rank updates after that point. Please revise."

### 🚨 White Label / Theming Violations
- Any hex color value (like `'#FF5500'`) appearing directly in a StyleSheet
- Hardcoded logo paths like `require('@/assets/hotpick_logo.png')` in components
- The string `"HotPick Sports"` or `"HotPick"` hardcoded in any component
- Pool screen UI that doesn't read from a `brandConfig` object
- Leaderboard or pool screen joining to `partners` table at render time
- `powered_by_hotpick` typed as `boolean` instead of literal `true`
- Missing "Powered by HotPick" on any branded pool screen

> **What to say:** "All colors and brand assets must go through the
> theme system via useTheme() and useBrand(). Partner brand config is
> copied to the pool at creation — never join to partners at render
> time. Please revise."

### 🚨 Admin Intelligence Computed Client-Side
- Pool intelligence or streak detection logic inside a React component
- "calculate the member's streak in the component"
- Notification sent without checking rate limits first

> **What to say:** "Pool intelligence is computed by the
> compute_pool_intelligence Edge Function and stored in pool_pulse.
> The client reads pool_pulse — it never computes intelligence.
> Please revise."

### 🚨 Pool Hard Delete Without Guards
- `DELETE FROM pools` anywhere outside the scheduled cron job
- Pool deletion without a prior admin_audit_log entry
- Organizer UI containing a delete button for pools
- New code referencing `created_by` instead of `organizer_id`

> **What to say:** "Organizers archive pools — they never delete.
> Hard deletion is admin-only, requires audit log entry first, and
> runs via cron after 24-hour grace period. Use organizer_id not
> created_by. Please revise."

### 🚨 Subscription Tier Limits Hardcoded
- `MAX_FREE_POOLS`, `MAX_FREE_MEMBERS`, or similar constants in code
- Pool creation or join enforcement logic in a React component
- Plan name strings like `'organizer_pro'` that don't match valid_plan constraint

> **What to say:** "Tier limits are read from competition_config
> global keys, never hardcoded. Enforcement runs server-side only.
> Valid plan values are: free, organizer_small, organizer_medium,
> organizer_large, addon_sport, addon_pool. Please revise."

### 🚨 SmackTalk Mention Scoping Violation
- Mention autocomplete querying `profiles` table without `pool_id` filter
- "show all users" or "search all HotPick users" in mention suggestions
- Notification for mention fired from client code, not from Postgres trigger

> **What to say:** "Mention autocomplete must be pool-scoped — only
> query pool_members for the current pool_id. Mention notifications
> go through notification_queue via Postgres trigger. Please revise."

### 🚨 Push Token on Profiles Table
- `push_token` column on `profiles` table
- "save the device token to the user's profile"

> **What to say:** "Push tokens go in the user_devices table, not on
> profiles. One user can have multiple active devices. Please revise."

### 🚨 Scope Creep Features
- Power-ups, tier badges, pick history UI, career stats, pool discovery,
  achievement notifications, confidence scoring, user-assigned point values,
  Super Bowl enhanced scoring UI (November 2026), playoff reset UI (November 2026),
  global leaderboard (post 500 users), NHL Series template (October 2026 spec session)

> **What to say:** "That feature is explicitly deferred until after
> NFL Season 2 launch. Let's stay on scope."

### 🚨 RLS Bypass on the Client
- `supabase.auth.admin` or service role key referenced in client code
- "use the service role key to fetch all users' picks"

> **What to say:** "Service role is for Edge Functions only, never
> the client. All client queries go through RLS with the anon key.
> Please revise."

---

## 20. Hard Rules

1. **Never create new tables per sport or event** — add rows with
   `event_id` to existing template tables
2. **Never attach `pool_id` to scores or picks** — pool-independent
   architecture is non-negotiable
3. **Never compute scores client-side** — Edge Functions only
4. **Never let the app shell import from a sport module directly** —
   use SportRegistry
5. **Ranks are platform-assigned** — users cannot set point values
6. **`frozen_rank` is immutable after pick deadline** — never overwrite
   it
7. **All dates stored in UTC** — convert to local time for display only
8. **RLS is always on** — never suggest client-side service role usage
9. **Never hardcode colors, logos, or brand strings** — always read
   from useTheme() or useBrand()
10. **Pool intelligence is never computed client-side** — read from
    pool_pulse table; compute_pool_intelligence Edge Function writes it
11. **pool_events event_type is always a defined enum value** — never
    write freeform strings to this column
12. **Push tokens live in user_devices, not profiles** — one row per
    device, is_active = false on logout or delivery failure
13. **SmackTalk mention autocomplete is always pool-scoped** — only
    query pool_members for the current pool_id, never all profiles
14. **Subscription tier limits are never hardcoded** — always read
    from competition_config global keys
15. **Pool join and creation enforcement runs server-side only** —
    Edge Function enforces limits, client only shows the prompt
16. **Organizers archive pools, never delete them** — hard delete
    is admin-only with audit log, grace period, and cron execution
17. **admin_audit_log entry is required before any destructive
    admin action** — log first, act second, never skip
18. **Use organizer_id not created_by in all new code** —
    created_by is legacy, pending migration
19. **Home Screen shows maximum 2 event cards** — priority-ordered
    by urgency; remaining events appear in the sport switcher only
20. **Pool selection is global app state** — switching pools via the
    pool switcher updates the Home Screen card, Board tab, and SmackTalk
    simultaneously; it is never scoped to a single component
21. **Next week's picks never open until the current week's games
    are fully concluded** — week state transitions are sequential:
    picks_open → locked → live → settling → complete → picks_open
22. **Season phases are sequential and admin-initiated** — the full
    lifecycle is: PRE_SEASON → REGULAR → REGULAR_COMPLETE → PLAYOFFS
    → SUPERBOWL_INTRO → SUPERBOWL → SEASON_COMPLETE. The weekly
    cycle only runs inside REGULAR, PLAYOFFS, and SUPERBOWL. All
    other phases show static cards with no week_state.
23. **Partner brand config is copied to pool at creation** — rendering
    never depends on a live join to the partners table. Pools are
    self-contained. If a partner updates branding mid-season, active
    pools are refreshed manually.

---

## 21. Home Screen Architecture

The Home Screen is a **Smart Home Screen**, not a dashboard. It is
context-aware and surfaces live action based on the current state of
active events. There is no static dashboard tab.

### Card Priority Logic

The Home Screen renders a priority-ordered list of event cards, capped
at **2 cards maximum**. If more than 2 events are active, the top 2
by priority are shown as cards; the rest appear in the sport switcher
with urgency indicators only.

Priority order (highest to lowest):
1. **Picks deadline within 48 hours** — soonest deadline wins
2. **Games currently live**
3. **Scores settling** — games ended within the last 24 hours
4. **Most recently interacted with**

The card list is driven by a priority-ordered array in the global
Zustand store. The Home Screen renders that array — it never computes
priority itself.

```typescript
// globalStore.ts — card priority is computed here, never in the component
activeEventCards: Event[];  // max 2, sorted by priority
availableEvents: Event[];   // all events, for sport switcher
```

### Week State Machine (Season Template)

Each NFL week moves through these states in strict sequence.
**States never skip. Next week never opens until current week reaches
`complete`.**

```
picks_open → locked → live → settling → complete → picks_open (next week)
```

| State | Trigger | What the card shows |
|---|---|---|
| `picks_open` | Admin opens picks | Countdown to kickoff + HotPick game day/time + social pressure line ("X of Y poolies locked in") |
| `locked` | Pick deadline passes | Waiting state — picks are in, games haven't started |
| `live` | First game kicks off | User's HotPick game: teams, live score, current point impact ("+6 if this holds") + pool rank with live delta |
| `settling` | Final game ends | Weekly result: net points + rank movement with named players ("You passed Sarah and Jake") + SmackTalk CTA |
| `complete` | Admin closes week | Season standings framed as a race ("47 pts behind 1st. 9 weeks left.") + mini sparkline |

### Season Phase Lifecycle (current_phase)

The NFL season moves through seven phases. **Phase transitions are
admin-initiated via Edge Function — never client-triggered.** The
weekly cycle (picks_open → locked → live → settling → complete) only
runs inside `REGULAR`, `PLAYOFFS`, and `SUPERBOWL`. All other phases
show a static card with no week_state.

```
PRE_SEASON → REGULAR → REGULAR_COMPLETE → PLAYOFFS → SUPERBOWL_INTRO → SUPERBOWL → SEASON_COMPLETE
```

| Phase | Duration | Card content | Weekly cycle? |
|---|---|---|---|
| `PRE_SEASON` | ~2-3 weeks before opener | Hype card: countdowns to picks opening + season opener, pool creation CTA, invite friends CTA, pool member momentum, quick rules explainer, profile setup prompts | No |
| `REGULAR` | Weeks 1-18 | Weekly cycle card | Yes |
| `REGULAR_COMPLETE` | ~1-2 days after Week 18 | Awards + "Playoffs are coming" explainer (single combined card) | No |
| `PLAYOFFS` | Wild Card through Conference Finals | Weekly cycle card | Yes |
| `SUPERBOWL_INTRO` | ~1-2 days after Conference Finals | Awards + Super Bowl special rules explainer (single combined card) | No |
| `SUPERBOWL` | Super Bowl week | Weekly cycle card (single week, enhanced scoring) | Yes |
| `SEASON_COMPLETE` | Permanent until next season | Final awards + full season recap | No |

**PRE_SEASON card content (builds July/August 2026):**
- Countdown to picks opening (3 days before season opener)
- Countdown to season opener kickoff
- "Create a Pool" CTA if user hasn't created one
- "Invite Friends" CTA if user is an organizer
- Pool member momentum — "Your pool has 6 members. Get to 10!"
- Quick "How HotPick Works" education (3-sentence version)
- Profile readiness prompts (poolie name, avatar)
- Auto-transitions to REGULAR when admin opens Week 1 picks

**REGULAR_COMPLETE + SUPERBOWL_INTRO are single combined cards.**
Each shows awards from the phase that just ended AND an explainer
for the phase that's coming. They are NOT two separate states —
one card, two sections.

**PLAYOFFS phase reset is automatic and mandatory.** When current_phase
transitions from REGULAR to REGULAR_COMPLETE (then to PLAYOFFS):
- Regular season champion is recorded and awards distributed
- Pool leaderboard week reference resets — playoff scores accumulate fresh
- Regular season standings are preserved in a read-only historical view
- Players do not re-opt-in — same pool, same members, zero scores

**Never carry regular season scores into playoff leaderboard calculations.**
The playoff pool_start_date is set to Wild Card weekend automatically on
phase transition.

```sql
-- Red flag: playoff leaderboard ignoring phase reset
-- WRONG: returns regular season + playoff scores mixed
SELECT SUM(points) FROM season_user_totals
WHERE competition = 'nfl_2026' AND user_id = $user_id;

-- CORRECT: scope to current phase date range
SELECT SUM(points) FROM season_user_totals
WHERE competition = 'nfl_2026'
  AND user_id = $user_id
  AND week_number >= $playoff_start_week;
```

### Live Score Updates

Live scores are delivered via **server-side polling only**:
- A Supabase Edge Function polls ESPN every 2 minutes on game days
- Results are pushed to clients via Supabase Realtime
- **Clients never poll ESPN directly**
- Off game days, the Realtime subscription is idle — no wasted battery

### Pool Switcher

The pool switcher lives **inside the card header**, not above the cards.
It is a tap-to-reveal dropdown showing the user's pools for the active
event.

- Switching pools is **global** — updates Home Screen card, Board tab,
  and SmackTalk simultaneously
- Each pool in the list shows an unread SmackTalk dot if
  `smack_messages.created_at > smack_read_state.last_read_at`
- Pool selection persists for the session via global Zustand store
- If the user has not set a default pool, the global platform pool
  is the default

### Sport Switcher

The sport switcher lives **above the cards** as persistent horizontal
chips (sport icon + event name).

- Shows all active events the user is enrolled in
- Currently visible card events are highlighted
- Unread SmackTalk dot per event (any pool within that event has unreads)
- Tap a chip to swap it into a card slot (replaces lower-priority card)
- Visual treatment: sport switcher uses horizontal chips; pool switcher
  uses a dropdown inside the card header — these must be visually
  distinct

### Red Flags: Home Screen Violations
- Card priority logic computed inside the React component
- Week state transition triggered from the client
- ESPN API called directly from the client
- Pool switcher that only updates one tab instead of all tabs
- More than 2 event cards rendered simultaneously
- Next week's picks opening before current week reaches `complete`
- Phase transition skipping a phase (e.g., REGULAR → PLAYOFFS without REGULAR_COMPLETE)
- Weekly cycle running during a static phase (PRE_SEASON, REGULAR_COMPLETE, SUPERBOWL_INTRO, SEASON_COMPLETE)

> **What to say:** "The Home Screen reads card priority from the global
> Zustand store and week state from competition_config. It never
> computes these itself. Season phases are sequential and never skip.
> Please revise."

---

## 22. Zustand Store Structure

State management uses Zustand with **sport-scoped stores** and one
**shared global store**. A bug in one sport store must never affect
another. The global store is the only bridge between sport stores and
shared UI.

### Global Store (`stores/globalStore.ts`)

Handles everything shared across all sports and tabs:

```typescript
interface GlobalStore {
  // Auth
  userId: string | null;
  userProfile: Profile | null;

  // Active event cards (Home Screen)
  activeEventCards: Event[];        // max 2, priority-ordered
  availableEvents: Event[];         // all events for sport switcher
  setActiveEventCards: (events: Event[]) => void;

  // Pool selection (global — drives all tabs simultaneously)
  activePoolId: string | null;
  activePools: Pool[];
  setActivePool: (poolId: string) => void;

  // SmackTalk unread counts (drives dots in pool + sport switchers)
  smackUnreadCounts: Record<string, number>;  // poolId → unread count
  markPoolAsRead: (poolId: string) => void;
}
```

### NFL Season Store (`stores/nflStore.ts`)

Handles all NFL-specific state. Isolated from other sport stores.

```typescript
interface NFLStore {
  competition: string;              // e.g. 'nfl_2026'
  currentWeek: number;
  weekState: 'picks_open' | 'locked' | 'live' | 'settling' | 'complete';
  picksDeadline: Date | null;
  userHotPick: Pick | null;
  userHotPickGame: DbSeasonGame | null;   // game record for HotPick (frozen_rank, teams)
  liveScores: Record<string, GameScore>;  // gameId → score
  weekResult: WeekResult | null;
  poolStandings: Standing[];
}
```

### Rules
- **Each sport module owns its store.** `/sports/nfl/stores/nflStore.ts`
- **Global store is the only cross-sport dependency.** Sport stores
  never import from each other.
- **Home Screen card subscribes to `weekState` and `activePoolId`
  only.** It re-renders on those values — nothing else.
- **Live scores update via Supabase Realtime subscription** wired
  into the NFL store's `liveScores` map. The component subscribes to
  the store slice, not to Realtime directly.

### Red Flags: Zustand Violations
- Sport store importing from another sport store
- Scoring or priority logic computed inside a component instead of
  a store action
- `useEffect` polling ESPN from a component
- Global store holding sport-specific data (game scores, picks)

> **What to say:** "Sport stores are isolated. Global store holds only
> cross-sport shared state. Sport-specific data stays in the sport
> store. Please revise."

---

## 23. SmackTalk: Read State & Reactions

### smack_read_state Table

Tracks the last time a user read a pool's SmackTalk feed. Used to
compute unread counts for the pool switcher and sport switcher dots.

```sql
CREATE TABLE public.smack_read_state (
  user_id UUID NOT NULL,
  pool_id UUID NOT NULL,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT smack_read_state_pkey PRIMARY KEY (user_id, pool_id),
  CONSTRAINT smack_read_state_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT smack_read_state_pool_id_fkey FOREIGN KEY (pool_id)
    REFERENCES pools (id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_smack_read_state_user
  ON public.smack_read_state USING btree (user_id) TABLESPACE pg_default;
```

**Unread count query:**
```sql
SELECT COUNT(*) FROM smack_messages
WHERE pool_id = $1
AND created_at > (
  SELECT last_read_at FROM smack_read_state
  WHERE user_id = $2 AND pool_id = $1
);
```

**Update on SmackTalk open:**
```sql
INSERT INTO smack_read_state (user_id, pool_id, last_read_at)
VALUES ($1, $2, NOW())
ON CONFLICT (user_id, pool_id)
DO UPDATE SET last_read_at = NOW();
```

The index is on `user_id` only — the query pattern is always
"all pool read states for this user" when loading the switcher.

### smack_reactions Guardrails

The `smack_reactions` table has **no check constraint** on the
`reaction` column. Validation is enforced at two levels:

**1. App config (client-side display and submission guard):**
```typescript
// config/smackTalk.ts
export const SMACK_REACTIONS = {
  allowed: ['👍', '👎', '❤️', '😂', '😮', '😢'],
  maxTypesPerMessage: 8,   // max distinct reaction types on one message
  maxTotalTypes: 8,        // max reaction types in the system
};
```

**2. Postgres trigger (server-side enforcement — cannot be bypassed):**
```sql
CREATE OR REPLACE FUNCTION validate_reaction()
RETURNS TRIGGER AS $$
DECLARE
  allowed_reactions text[] := ARRAY['👍','👎','❤️','😂','😮','😢'];
  reaction_type_count int;
BEGIN
  IF NOT (NEW.reaction = ANY(allowed_reactions)) THEN
    RAISE EXCEPTION 'Reaction not permitted';
  END IF;

  SELECT COUNT(DISTINCT reaction) INTO reaction_type_count
  FROM smack_reactions
  WHERE message_id = NEW.message_id;

  IF reaction_type_count >= 8 THEN
    RAISE EXCEPTION 'Maximum reaction types per message reached';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_reaction_validity
  BEFORE INSERT ON public.smack_reactions
  FOR EACH ROW EXECUTE FUNCTION validate_reaction();
```

**To add a new reaction type in future:** update the `allowed_reactions`
array in the trigger function AND the `allowed` array in
`config/smackTalk.ts`. No table migration required.

### Red Flags: SmackTalk Data Violations
- Check constraint on `smack_reactions.reaction` column (locks schema
  to hardcoded emojis — use the trigger instead)
- Reaction validation only on the client with no server-side trigger
- `smack_read_state` queried by `pool_id` without a `user_id` filter
- Unread count computed by loading all messages client-side

> **What to say:** "Reaction validation runs via Postgres trigger, not
> a check constraint. Read state is always queried by user_id.
> Please revise."

---

## 24. Event Recaps (Drama Digest)

### Purpose

Surfaces pool-wide narrative after scoring completes each period.
Transforms raw scoring data into human headlines that keep pools
engaged between picks. **Retention feature, not a scoring feature.**

### Table: `event_recaps`

Template-agnostic. One row per pool per scoring period. Works across
all three templates.

```sql
CREATE TABLE event_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  competition TEXT NOT NULL,
  period_key TEXT NOT NULL,       -- 'week_12', 'first_round', 'quarterfinals'
  period_number INTEGER NOT NULL, -- for ordering
  headlines JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,       -- null until push delivered
  UNIQUE (pool_id, competition, period_key)
);
```

### period_key Convention by Template

| Template | period_key examples | period_number |
|---|---|---|
| Season (NFL) | `week_1` .. `week_18`, `wild_card`, `divisional`, `conf_championship`, `super_bowl` | Week number or playoff ordinal |
| Series (NHL/NBA) | `first_round`, `second_round`, `conf_finals`, `finals` | Round number 1-4 |
| Tournament (World Cup) | `group_stage`, `round_of_32`, `round_of_16`, `quarterfinals`, `semifinals`, `final` | Stage ordinal 1-6 |

### Headlines JSONB Structure

```jsonc
[
  {
    "type": "race_report",        // headline type (template-specific)
    "text": "Dave leads Pool A by 4 pts with 9 weeks left.",
    "subject_user_id": null       // null for pool-wide headlines
  },
  {
    "type": "bold_call",
    "text": "Sarah went big. Rank 14 HotPick. +14 pts. Respect.",
    "subject_user_id": "uuid-of-sarah"
  }
]
```

### Headline Types by Template

**Season:** `heartbreaker`, `biggest_swing`, `bold_call`, `tough_week`,
`comeback`, `race_report`, `perfect_week`

**Series:** `bold_call`, `tough_round`, `biggest_swing`, `race_report`,
`perfect_round`, `blown_lead` (team was up 3-1), `length_bonus_call`

**Tournament:** `bold_call`, `tough_stage`, `biggest_swing`,
`race_report`, `group_guru` (group stage accuracy), `heartbreaker`
(penalty result), `perfect_stage`

### Architecture Rules

**Content generation and delivery are completely separate concerns.**
The `generate-*-recap` Edge Function writes to `event_recaps` and
stops. It does not send pushes, trigger emails, or render screens.
Delivery channels read from `event_recaps` independently.

**All headlines are deterministic.** Template strings populated with
real names and numbers. No AI, no third-party NLP, no external APIs.
AI copy variation is a future upgrade — explicitly out of scope for
Season 2.

**RLS:** Active pool members can SELECT. Only Edge Functions (service
role) can INSERT/UPDATE. No client write policies.

### Data Dependencies (all confirmed existing)

| Data | Season Source | Series Source | Tournament Source |
|---|---|---|---|
| HotPick result | `season_picks.is_hotpick` + `is_correct` | `series_picks.is_hotpick` + `is_winner_correct` | `tournament_picks.is_hotpick` + `is_correct` |
| Frozen rank | `season_games.frozen_rank` | `series_matchups.frozen_rank` | `tournament_matches.frozen_rank` |
| Quarter scores | `season_games.q1_*` through `q3_*` | N/A | N/A |
| Series win count | N/A | `series_matchups.higher_seed_wins` / `lower_seed_wins` | N/A |
| Penalty result | N/A | N/A | `tournament_matches.is_penalty_result` |
| Pool rank | Derived from `season_user_totals` + `pool_members` | Derived from `series_user_totals` + `pool_members` | Derived from `tournament_user_totals` + `pool_members` |

### Red Flags: Event Recaps Violations
- Headline logic inside a React component → Edge Function only
- AI or external service call for headline text → deterministic
  templates only for Season 2
- Delivery logic coupled to the generation function → generation
  writes to `event_recaps` and stops; delivery reads independently
- New table per template for recaps → use `event_recaps` with
  `period_key` for all templates
- `pool_id` on a scoring table (this is a delivery/content table,
  not a scoring table — `pool_id` is correct here)

> **What to say:** "Event recaps are generated by Edge Functions using
> deterministic templates and written to event_recaps. Delivery is
> decoupled — channels read independently. One table serves all
> templates via period_key. Please revise."

---

## 25. White Label Build Status

White label is a branded pool experience inside the standard HotPick
app. Partners get custom colours and names; users download HotPick
from the App Store. Brand config is pool-scoped via `brand_config`
JSONB on the pools table.

### Completed Phases

| Phase | What | Key Files |
|-------|------|-----------|
| 1 | Database verification | `partners` table, `pools.partner_id`, `pools.invite_slug` |
| 2 | ThemeProvider + useBrand() wiring | `src/shell/theme/` (types, defaults, hooks, index) |
| 6 | PoweredByHotPick component | `src/shell/components/PoweredByHotPick.tsx` — wired into all 3 board screens + SmackTalk |
| 7 | Partner Admin Screen | `src/shell/screens/PartnerAdminScreen.tsx` — create partners, assign to pools, reset |
| 8 | QR code generation | Integrated into Partner Admin via `react-native-qrcode-svg` |
| 9 | Partner color editing | Partner Admin edit mode: 4 settable colors (primary, secondary, highlight, background) with `deriveFullBrandColors()` auto-computing surface/text. `highlight_color` is for light text on dark backgrounds (e.g. pool switcher dropdown names). Brand colors scoped to partner pool rows only in Settings/PoolSettings. |
| 10 | Partner logo upload | Upload via Supabase Storage REST API + FormData (RN workaround — JS client doesn't handle blobs). Bucket: `partner-logos` (public, 5MB, PNG/JPEG/WebP/SVG). |

### Remaining Phases (require real device testing)

| Phase | What | Depends On | Notes |
|-------|------|------------|-------|
| 3 | Branch.io SDK integration | Phase 1 | Deferred deep links cannot be tested on simulator. Install Branch SDK, configure Universal Links (iOS) + App Links (Android). Highest-risk step. |
| 4 | Deep link handler | Phases 1+3 | `src/shell/deepLink.ts` — slug lookup: partners table first, pools.invite_slug fallback. Brand config applied to store before navigation. Basic handler exists in RootNavigator but needs Branch.io + partner slug lookup. |
| 5 | Branded pool join flow | Phases 2+4 | Three screens: Branded Landing, Auth Gate, Join Confirmation. All read from globalStore activeBrandConfig. |

### Hard Rule #23 (added)

Partner brand config is copied to pool at creation. Rendering never
depends on a live join to the partners table. Pools are self-contained.

### Partner Dark Mode Rules

Partners provide light-mode colors only. Dark mode is auto-derived:
- **Backgrounds/text**: use HotPick dark overrides (`#0D1117`, `#161C26`, `#8A97AA`)
- **Primary/secondary/highlight**: keep partner's own values (brand recognition)
- Partners never manage dark mode — `deriveDarkColors()` handles it automatically
- Active buttons use partner's `primary_color` in both light and dark
- NFL 2026 header, WEEK X, pool name, chevrons, and rank badges use
  partner's `highlight_color` in partner pools
- Bottom navigation selected icons use HotPick colors (not partner colors)

### Highlight Color Usage

The `highlight` color (`#F5C842` for HotPick) is used for:
- NFL 2026 event header text
- WEEK X label text
- Pool name and chevron in pool switcher (Home, Leaderboard, SmackTalk)
- Rank badges on leaderboard
- Partner pools use the partner's `highlight_color` for these same elements

### Key Architecture Decisions

- `BrandConfig` type lives in `src/shell/theme/types.ts` — one definition, never duplicated
- `HOTPICK_DEFAULTS` in `src/shell/theme/defaults.ts` — canonical HotPick brand values
- `useTheme()` returns `ThemeColors` (primary, secondary, highlight, background, surface, textPrimary, textSecondary, glow + semantic)
- `useBrand()` returns `BrandIdentity` (partnerName, poolLabel, appName, logo, isBranded)
- `powered_by_hotpick` is typed as literal `true` — cannot be set to false
- Partner Admin is `__DEV__`-gated in Settings screen
- `PoweredByHotPick` component self-gates on `isBranded` — returns null for non-branded pools
- `PoweredByHotPick` uses `hotpick-wordmark-w.png` (white wordmark) instead of text for the brand name
- Home Screen shows HotPick wordmark: `hotpick-wordmark-lt.png` (light mode), `hotpick-wordmark-dk.png` (dark mode); partner logo for branded pools
- Settings page pools section is collapsible (twirly/accordion). Partner pools sorted to top with building icon. Settings page always uses HotPick colors (never changes with active pool).
- `AboutScreen.tsx`, `InstructionsScreen.tsx`, and `TermsOfServiceScreen.tsx` live in `/src/shell/screens/` — linked from Settings
- Bottom tab bars across all templates (Season, Series, Tournament) use HotPick theme colors (not partner colors)
- Home Screen background uses `colors.background` (dynamic per active pool brand)
- SeasonEventCard header shows "NFL 2026" (derived from competition string) in `highlight` color
- Score pill and kickoff module rendered outside the card container, between header and week state content
- Kickoff module label reads "Picks go LIVE in:" (changes contextually, e.g. "Picks are LIVE")
- Settings page organized into grouped sections: Inbox, My Pools, About & Legal, Admin

---

## 26. Game Day Engagement System

Three connected systems that transform the live game experience:

### game_pick_stats Table

Pre-computed aggregate pick stats per game per pool. Refreshed by
Edge Function every 60 seconds on game days. Game cards read from
this table — never from `season_picks` directly.

**Privacy gate:** Stats are ONLY computed for games with
`status = 'live'` or FINAL. Games in `status = 'scheduled'` are
never included — picks are sealed until kickoff.

**pool_id is correct here** — this is a display cache, not a
scoring table. Different pools see different percentages.

### Pool Pick Stats (Game Card Reveal)

At kickoff, each game card reveals:
- **Pick Split**: percentage bar showing pool pick distribution
- **HotPick Concentration**: how many poolmates chose this game
  as HotPick, and which team they picked

### Path Back Narrative

Mathematically honest "you still have a shot" messaging:
- Shown on LiveCard (Home Screen) and user's own leaderboard row
- Computes position relative to person above + unsettled HotPick
- Client-side display logic only — never influences scoring
- If math says user is locked out, show nothing. Don't rub it in.

### Rival Tracker (Phase 2)

Person directly above you + what it would take to overtake them.
No additional tables needed — uses same pool standings data.

### Edge Functions

- `refresh-game-pick-stats` — cron every 60s, idle on non-game days
- Realtime subscription in `nflStore` pushes updates to clients

### nflStore Additions

```typescript
gamePickStats: Record<string, GamePickStats>;  // gameId → stats
pathBackNarrative: string | null;
hotPickGameStatus: 'pending' | 'live' | 'complete' | null;
loadGamePickStats: (poolId: string) => Promise<void>;
subscribeToGamePickStats: (poolId: string) => () => void;
computePathBackNarrative: (userId: string) => void;
```

### Red Flags: Game Day Engagement Violations
- Pick percentages shown before kickoff
- `season_picks` queried directly from game cards (use `game_pick_stats`)
- Path Back narrative influencing scoring decisions
- Realtime subscription left open when weekState is not 'live'
- Client polling ESPN directly (server-side polling only)

---

## 27. History Page & Hardware System

### user_hardware Table

Permanent per-user award record. One row per award earned per instance.
**Never delete rows** — set `is_visible = false` to hide.

Unique constraint: `(user_id, hardware_slug, competition, week, pool_id)`
with `NULLS NOT DISTINCT`. All writes use `ON CONFLICT DO NOTHING` —
idempotent and safe to re-run.

### Hardware Catalog (Launch Awards)

**Weekly** (awarded after each week settles, per pool):
- `sharpshooter_week` — highest regular pick win rate (min 10 picks)
- `gunslinger_week` — won Rank 12+ HotPick
- `contrarian_week` — against majority on 8+ games, top 3, hotpick correct
- `perfect_week` — 15/15 + hotpick correct (platform scope)

**Season-end** (awarded after `is_season_complete = true`):
- `pool_champion` / `podium_2nd` / `podium_3rd` — final pool standings
- `biggest_comeback` — largest rank swing (min 6 weeks)
- `iron_poolie` — 18/18 weeks submitted
- `season_sharpshooter` — best regular pick rate (min 15 weeks, platform)
- `hotpick_artist` — best HotPick win rate (min 15, platform)
- `season_tactician` — Rank 1-6 HotPick 12+ weeks, positive total (platform)

**Career (Phase 2 — do not build at launch):**
- `veteran`, `back_to_back`, `iron_man`

### compute-hardware Edge Function

Single function handles all award computation. Triggered by:
- `weekly_settle` — after all games in a week complete
- `season_settle` — after `is_season_complete = true`
- `manual_override` — Tom triggers from Hardware Admin screen

Cron: runs at minutes :05 and :35 (5 min after scoring settles).

### Player Archetypes

Template-based labels computed client-side from career stats:
- The Closer, The Sharpshooter, The Gunslinger, The Grinder
- AI-generated archetypes are Phase 2 (no data model changes needed)
- If no threshold met, show no archetype — never show placeholder

### History Tab

- Hidden from navigation until user has at least one settled week
- Tab appearing mid-season is itself a moment of delight
- Three sections: Player Archetype, Hardware Shelf, Season History

### Hardware Module (Home Screen)

Shows latest earned award with total count. Self-hides when empty.
Taps navigate to History tab.

### Hardware Admin Screen

Super admin only (`is_super_admin`). Manual trigger for weekly/season/full
award computation. Accessible from Settings → Admin section.

### globalStore Additions

```typescript
userHardware: UserHardwareItem[];
hasHistory: boolean;
historyVisibility: 'private' | 'pools_only' | 'public';
playerArchetype: PlayerArchetype | null;
loadUserHardware: () => Promise<void>;
updateHistoryVisibility: (v) => Promise<void>;
computePlayerArchetype: () => void;
```

### Red Flags: History & Hardware Violations
- Client-side award computation → Edge Function only
- `DELETE FROM user_hardware` → use `is_visible = false`
- `INSERT` without `ON CONFLICT DO NOTHING` → duplicates are permanent
- Renaming a `hardware_slug` → rename `hardware_name` instead
- Showing Phase 2 career hardware as locked silhouettes at launch
- Gambling language in award names or archetype descriptions

> **What to say:** "Award computation runs in the compute-hardware
> Edge Function only. Never delete from user_hardware — use
> is_visible = false. Hardware slugs are permanent. Please revise."