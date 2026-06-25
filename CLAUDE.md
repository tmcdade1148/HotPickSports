# HotPick Sports — Claude Code Guardrails

Read this file before writing any code. Architecture context is in `REFERENCE.md`; deeper specs and runbooks are in `docs/`.

---

## What This App Is

HotPick Sports is a sports prediction platform. Users make picks once and compete across multiple pools simultaneously. **Scores belong to the user, not to any pool.** Pools are social lenses on shared user-level data. This pool-independent architecture is the deepest structural moat — never design against it.

**Active competition for App Review/testing:** `nfl_2025_sim`
**Active competition for live season:** `nfl_2026`
Do not default to worldCup2026 or any other event.

---

## 25 Hard Rules

These are non-negotiable. If a task requires violating one, stop and ask. When you must push back on a violation, state the relevant rule plainly and ask for a revision.

1. **Never create new tables per sport or event** — add rows with `event_id` to existing template tables
2. **Never attach `pool_id` to scores or picks** — pool-independent architecture is non-negotiable. `pool_id` is always a WHERE filter, never a column on `*_user_totals` and never a data-model boundary; never assume one pool per user.
   > Pushback: "Scores and picks must never carry a `pool_id`. Pools are a view on user-level data, not owners of it. Please revise."
3. **Never compute scores client-side** — Edge Functions only.
   Smells: `?? false`/default on `is_hotpick_correct` (write `null` until the game is FINAL); award computation in a React component (`compute-hardware` only); hardcoded `season_year` (read via `seasonStore.seasonYear`); `scoring_locked` missing from new competition seed data.
   > Pushback: "Scoring runs in Edge Functions only — the client displays scores, never computes them. Please revise."
4. **Never let the app shell import from a sport module directly** — use SportRegistry
5. **Ranks are platform-assigned** — users cannot set their own point values
6. **`frozen_rank` is immutable after pick deadline** — never overwrite it; use `COALESCE` to preserve existing values
7. **All dates stored in UTC** — convert to local time for display only
8. **RLS is always on** — never suggest client-side service role usage
9. **Never hardcode colors, logos, or brand strings** — always use `useTheme()` or `useBrand()`
10. **Pool intelligence is never computed client-side** — read from `pool_pulse`; `compute_pool_intelligence` Edge Function writes it
11. **`pool_events.event_type` is always a defined enum value** — never write freeform strings
12. **Push tokens live in `user_devices`, not `profiles`** — one row per device, `is_active = false` on logout or delivery failure
13. **SmackTalk mention autocomplete is always pool-scoped** — only query `pool_members` for the current `pool_id`, never all profiles
14. **Subscription tier limits are never hardcoded** — always read from `competition_config` global keys
15. **Pool join and creation enforcement runs server-side only** — Edge Function enforces; client only shows the prompt
16. **Organizers archive pools, never delete them** — hard delete is admin-only with audit log, grace period, and cron execution
17. **`admin_audit_log` entry is required before any destructive admin action on production data** — log first, act second, never skip. Simulator tools scoped to a sandbox competition (e.g., `nfl_2025_sim`) are exempt.
18. **Use `organizer_id` not `created_by` in all new code** — `created_by` is legacy, pending migration
19. **Home Screen shows maximum 2 event cards** — priority-ordered by urgency; rest appear in sport switcher only
20. **Pool selection is global app state** — switching pools updates Home Screen, Board tab, and SmackTalk simultaneously; never scoped to one component
21. **Next week's picks never open until current week reaches `complete`** — states are sequential: `picks_open → locked → live → settling → complete → picks_open`
22. **Season phases are sequential and admin-initiated** — `OFF_SEASON → PRE_SEASON → REGULAR → REGULAR_COMPLETE → PLAYOFFS → SUPERBOWL_INTRO → SUPERBOWL → SEASON_COMPLETE`. The weekly cycle runs only inside REGULAR, PLAYOFFS, and SUPERBOWL. PRE_SEASON picks are practice — **scores don't count toward the season total**. (Phase detail: REFERENCE.md §3.)
23. **Partner brand config is copied to the pool at creation** — rendering never live-joins to `partners`; pools are self-contained. The `partners_propagate_brand` trigger keeps the snapshot fresh server-side — never refresh it client-side. (REFERENCE.md §15.)
24. **Pool organizers join partner rosters — super-admin never pushes partners onto pools.** `pools.partner_id` is set by the organizer via `PartnerDirectoryScreen`. A partner's board is `partner_members` (one Chairman + Directors), independent of any Club Pool — so sponsor-only partners have admins too; `_caller_can_manage_partner` and `send-partner-broadcast` gate on it. (Full model: REFERENCE.md §5 + §15.)
25. **Club brand colors render only on Official Club Contest cards on the Home stack** — every other surface stays HotPick-themed. `useTheme()`/`useBrand()` always return HotPick defaults; only PoolModule's Official-Contest branded band reads `pool.brand_config`. (REFERENCE.md §15.)

---

## Critical Red Flags

The 25 rules above state the law; these are the specific code smells with no rule of their own. If you're about to write one, stop and revise.

### Data & Scoring
- Leaderboard query without a `pool_start_date` filter → filter from pool start, not season start
- Playoff leaderboard mixing regular-season scores → scope to `week_number >= playoff_start_week`
- `DELETE FROM user_hardware` → use `is_visible = false`; hardware rows are permanent
- `INSERT INTO user_hardware` without `ON CONFLICT DO NOTHING` → duplicates are permanent
- **Partner identity (name/logo/colors) read from `pool.brand_config` in a partner-centric component** → that snapshot is the *lead* partner only. Partner-centric surfaces (PartnerModule, partner tiles, detail screens) read live from `partnersById[partnerId]`; pool-centric surfaces (Contest card) read the snapshot (Rule #23)

### SmackTalk & Messaging
- `DELETE FROM smack_messages` without first archiving → data is archived, never deleted
- Client querying `smack_messages_archive` → service-role Edge Function only
- Moderator note written to `smack_messages` → use `organizer_notifications`
- Reaction validation only on the client → the Postgres trigger is authoritative
- Unread count by loading all messages client-side → use the aggregated query by `pool_id`

### Auth & Security
- `supabase.auth.admin` or a service-role key in client code → server only (Rule #8)
- **Silent RLS-filtered writes** — `update(...).eq(...)` with no `.select()` returns success with zero rows when RLS filters it. Chain `.select('id').single()` (throws `PGRST116`) or use a SECURITY DEFINER RPC
- **Direct client UPDATE of `pools.partner_id` / `brand_config` / `invite_slug`** — `pools_update` RLS checks *which* row, not *what values*. Route through a SECURITY DEFINER RPC that validates server-side
- **Storage policy gated only by `bucket_id`** → add a path-prefix or role check (e.g. `(storage.foldername(name))[1] = auth.uid()::text`)

### Config & State
- Competition state hardcoded in a component or Edge Function → read from `competition_config`
- New `competition_config` key without a `description` → always include one; use the defined key names, never invented ones

### UI & Theming
- Hex color in a StyleSheet → `useTheme()` (only exception: the native BootSplash background — REFERENCE.md §15)
- **Hardcoded user-facing nouns** ("Pool", "Poolie", "Organizer", "Partner", "Leaderboard", "SmackTalk" in a TS/TSX string literal) → import from `@shared/lexicon`; internal code identifiers (`pool_id`, `organizer_id`, …) stay (REFERENCE.md §22)
- Card-priority logic inside a React component → computed in globalStore only
- Week-state transition triggered from the client → admin-initiated via Edge Function
- ESPN API called from the client → server-side polling only; clients use Realtime
- `useEffect` polling from a component → Realtime subscription in the store

### Admin & Pools
- Admin UI importing from a sport module → admin lives in `/shell` only
- Notification sent without a rate-limit check → call `check_notification_rate_limit()` first

### Simulator & Sandbox
- **`nfl-import-schedule` run against a simulator competition** → an ESPN import matches zero sim `game_id`s and the stale-id cleanup wipes the entire sim week. The importer refuses any competition whose `data_provider` isn't `espn` (covers sim + demo); only the simulator writes sim rows.

### Scope Creep (do not build before NFL Season 2 launch)
Power-ups, career hardware awards, AI archetypes, tier system, pool discovery, Super Bowl enhanced scoring UI, playoff reset UI, global leaderboard, NHL/Tournament templates, white label billing, admin analytics dashboard.
> "That feature is explicitly deferred until after NFL Season 2 launch. Let's stay on scope."

The November 2026 Super Bowl Enhanced Scoring build (SB-only + playoffs-only sub-competitions, the playoff tie-breaker ladder) is deferred too — all leaderboard *scopes* over user-scoped picks, never new tables, never `pool_id` on scores. Spec: `docs/SUPER_BOWL_SCORING_SPEC.md`; context in REFERENCE.md §3 + §7. Full roadmap: `docs/BUILD_STATE.md`.

---

## Apply Migration vs Execute SQL

| Use `apply_migration` | Use `execute_sql` |
|---|---|
| All schema changes (CREATE, ALTER, DROP) | Read-only queries |
| DML on RLS-protected tables | Dev/debug data inspection |
| Cron job setup | Non-RLS utility queries |
| Any write that must bypass RLS | |

`execute_sql` runs under the anon role, so RLS silently blocks writes (returns success, zero rows). `competition_config` writes and any RLS-protected DML must use `apply_migration`. When in doubt, use `apply_migration`.

---

## Deployment Rules

These apply from the moment the app is live in the App Store and Google Play. Violations risk user-facing incidents during a live season.

- **Never commit directly to main during a live season** — feature branch + preview build first
- **EAS Update (OTA) is JavaScript-only** — anything that changes app behavior or native code needs a full build + store submission (use the `ship-check` skill to classify a change)
- **All Edge Functions committed to git before deployment** — never deploy what isn't in the repo
- **Take a manual Supabase backup before every schema migration** — Project Settings → Database → Backups → Manual backup
- **`scoring_locked` in `competition_config` is the emergency scoring brake** — set `true` to pause all scoring instantly, no deployment needed
- **Build profile order is always `development → preview → production`** — never skip preview; every non-trivial change verifies on a real device first
- **Bumping the marketing version bumps `runtimeVersion` in all three places** — `app.json`, `ios/.../Expo.plist` (`EXUpdatesRuntimeVersion`), `android/.../strings.xml` (`expo_runtime_version`). Drift breaks OTA silently
- **File-type EAS env vars must be scoped to all three environments** (`production, preview, development`) — narrowing one silently breaks the others' builds (the pre-install guard skips, Gradle then fails with "File google-services.json is missing"). Verify with `eas env:list --environment preview --format long`
- **Never hand-edit the `react-native` version** (owned by the Expo SDK; realign with `npx expo install --fix`) and **never run `npm audit fix --force`** — both break `node_modules`
- **After any native or dependency-version change, restart Metro with `--clear`** (`npx expo start --dev-client --clear`)

> The SDK 55 / Xcode / Metro war-stories behind the last two rules — the load-bearing `metro.config.js` `unstable_enablePackageExports = false`, the RN pin, Explicitly-Built-Modules, the `nkf` gem — live in `docs/NATIVE_BUILD_NOTES.md`. Read it before "cleaning up" any of that config.

---

## Branch Rules

- **All new feature development happens on a feature branch, never directly on main** — branch naming: `feature/description`, `fix/description`, `hotfix/description`
- **Nothing merges to main without Tom's explicit approval**
- **Active competitions live on main** — currently `nfl_2025_sim` (App Review) and `nfl_2026` (live season). New sports (EPL, World Cup, NHL) always start on a feature branch. Example: `feature/epl-2027`, `feature/world-cup-2026`
- **When Tom says "build EPL" or any new sport/feature, the first step is always:**
  ```
  git checkout main && git pull && git checkout -b feature/[name]
  ```
  Never start new sport work on main.
- **Local `main` can go stale silently** — `git pull` sometimes no-ops while `origin/main` has moved. If a merged fix appears to be "missing" locally, force the sync: `git fetch origin main && git reset --hard origin/main` (discards uncommitted tracked changes).

---

*Full architecture, schema details, store interfaces, Edge Function registry, and build roadmap are in `REFERENCE.md`. Specs and runbooks are in `docs/`.*
