# HotPick Sports — Claude Code Guardrails

Read this file before writing any code. Full architecture context is in `REFERENCE.md`.

---

## What This App Is

HotPick Sports is a sports prediction platform. Users make picks once and compete across multiple pools simultaneously. **Scores belong to the user, not to any pool.** Pools are social lenses on shared user-level data. This pool-independent architecture is the deepest structural moat — never design against it.

**Active competition:** `nfl_2026`. Do not default to worldCup2026 or any other event.

---

## 23 Hard Rules

These are non-negotiable. If a task requires violating one, stop and ask.

1. **Never create new tables per sport or event** — add rows with `event_id` to existing template tables
2. **Never attach `pool_id` to scores or picks** — pool-independent architecture is non-negotiable
3. **Never compute scores client-side** — Edge Functions only
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
17. **`admin_audit_log` entry is required before any destructive admin action** — log first, act second, never skip
18. **Use `organizer_id` not `created_by` in all new code** — `created_by` is legacy, pending migration
19. **Home Screen shows maximum 2 event cards** — priority-ordered by urgency; rest appear in sport switcher only
20. **Pool selection is global app state** — switching pools updates Home Screen, Board tab, and SmackTalk simultaneously; never scoped to one component
21. **Next week's picks never open until current week reaches `complete`** — states are sequential: `picks_open → locked → live → settling → complete → picks_open`
22. **Season phases are sequential and admin-initiated** — `PRE_SEASON → REGULAR → REGULAR_COMPLETE → PLAYOFFS → SUPERBOWL_INTRO → SUPERBOWL → SEASON_COMPLETE`. Weekly cycle only runs inside REGULAR, PLAYOFFS, and SUPERBOWL.
23. **Partner brand config is copied to pool at creation** — rendering never depends on a live join to `partners`. Pools are self-contained.

---

## Critical Red Flags

If you find yourself writing any of the following, stop and revise.

### Scoring & Picks
- Client-side score calculation of any kind → Edge Functions only
- `frozen_rank` recalculated after pick deadline → must be immutable; use `COALESCE`
- `?? false` or default fallback on `is_hotpick_correct` → write `null` until game is FINAL
- `season_year` hardcoded anywhere → always read from `competition_config` via `seasonStore.seasonYear`
- `scoring_locked` missing from new competition seed data → always include it
- Award computation in a React component → `compute-hardware` Edge Function only

### Data Architecture
- New table per sport or event → use template tables with `event_id`
- `pool_id` column on `*_user_totals` tables → never; scores are user-scoped
- Any query or feature that assumes one pool per user → users belong to many pools; `pool_id` is always a WHERE filter, never a data-model boundary
- Leaderboard query without `pool_start_date` filter → always filter from pool start, not season start
- Playoff leaderboard mixing regular season scores → scope to `week_number >= playoff_start_week`
- `DELETE FROM user_hardware` → use `is_visible = false`; hardware rows are permanent
- `INSERT INTO user_hardware` without `ON CONFLICT DO NOTHING` → duplicates are permanent

### SmackTalk & Messaging
- `DELETE FROM smack_messages` without prior INSERT to archive → data is never deleted, only archived
- Client querying `smack_messages_archive` directly → service role Edge Function only
- Moderator note written to `smack_messages` → must use `organizer_notifications`
- Reaction validation only on client → Postgres trigger is authoritative
- Unread count computed by loading all messages client-side → use aggregated query by `pool_id`

### Auth & Security
- `supabase.auth.admin` or service role key in client code → server only
- `apply_migration` vs `execute_sql`: schema changes and RLS-protected DML require `apply_migration`; `execute_sql` runs under anon role and RLS silently blocks writes

### Config & State
- Competition state hardcoded in a component or Edge Function → always read from `competition_config`
- New `competition_config` key without a `description` field → always include description
- Key names invented on the fly → use the defined key names for the template type
- `competition_config` key inserted with `execute_sql` → use `apply_migration`

### UI & Theming
- Hex color value in a StyleSheet (except `SplashScreen.tsx` container background) → use `useTheme()`
- Hardcoded logo path or app name string → use `useBrand()`
- Card priority logic computed inside a React component → computed in globalStore only
- Week state transition triggered from the client → admin-initiated via Edge Function
- ESPN API called directly from the client → server-side polling only; clients use Realtime
- `useEffect` polling from a component → Realtime subscription in the store

### Admin & Pools
- `DELETE FROM pools` outside the scheduled cron job → archive only for organizers
- Pool creation or join enforcement logic in a React component → always server-side
- Pool intelligence computed in a component → read from `pool_pulse`
- Admin UI importing from a sport module → admin lives in `/shell` only
- `pool_events` written with freeform `event_type` strings → use defined enum values
- Notification sent without rate limit check → always call `check_notification_rate_limit()` first

### Scope Creep (do not build before NFL Season 2 launch)
Power-ups, career hardware awards, AI archetypes, tier system, pool discovery, Super Bowl enhanced scoring UI, playoff reset UI, global leaderboard, NHL/Tournament templates, white label billing, admin analytics dashboard.
> "That feature is explicitly deferred until after NFL Season 2 launch. Let's stay on scope."

---

## What To Say (Copy-Paste Responses)

**Scoring violation:**
> "Scoring computation runs in Edge Functions only. The client displays scores; it never computes them. Please revise."

**Pool-independent violation:**
> "Scores and picks must never have a `pool_id`. Pools are a view on user-level data, not owners of it. Please revise."

**competition_config violation:**
> "Competition state is always read from `competition_config`, never hardcoded. Use the defined key names for this template type and always include a description. Please revise."

**SmackTalk data destruction:**
> "SmackTalk data is never deleted — it is archived. The archive is permanent and exists for AI/analytics. Please revise."

**Hardware deletion:**
> "Award computation runs in the compute-hardware Edge Function only. Never delete from `user_hardware` — use `is_visible = false`. Hardware slugs are permanent. Please revise."

**Pool deletion:**
> "Organizers archive pools — they never delete. Hard deletion is admin-only, requires audit log entry first, and runs via cron after 24-hour grace period. Use `organizer_id` not `created_by`. Please revise."

**RLS bypass:**
> "Service role is for Edge Functions only, never the client. All client queries go through RLS with the anon key. Please revise."

**Tier limit hardcoding:**
> "Tier limits are read from `competition_config` global keys, never hardcoded. Enforcement always runs server-side in an Edge Function. Valid plan values: free, organizer_small, organizer_medium, organizer_large, addon_sport, addon_pool. Please revise."

**Sport store isolation:**
> "Sport stores are isolated. Global store holds only cross-sport shared state. Sport-specific data stays in the sport store. Please revise."

---

## Apply Migration vs Execute SQL

| Use `apply_migration` | Use `execute_sql` |
|---|---|
| All schema changes (CREATE, ALTER, DROP) | Read-only queries |
| DML on RLS-protected tables | Dev/debug data inspection |
| Cron job setup | Non-RLS utility queries |
| Any write that must bypass RLS | |

When in doubt, use `apply_migration`.

---

*Full architecture, schema details, UI patterns, store interfaces, Edge Function registry, and build roadmap are in `REFERENCE.md`.*
