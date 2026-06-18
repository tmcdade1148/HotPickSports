# Scaling / Launch Readiness — handling ~600 concurrent users

**Status:** Living checklist. Created 2026-06-18 after a resource-exhaustion blip during tester sessions (6 concurrent users). The project was on **Nano (0.5 GB RAM, shared CPU)** — the smallest tier — at the time, which made it easy to tip over. The app handled the testers fine; the blip was caused by **dashboard / AI-Assistant / MCP introspection + PostgREST schema reloads (from migrations)**, not user traffic. Real users don't run introspection, so the app's per-user footprint is small. This doc is about provisioning for 100× that.

**Update 2026-06-18:** upgraded **Nano → Micro** (1 GB RAM, dedicated 2-core ARM; covered by the included $10 credit, no extra charge). That's the current baseline — fine for testing, still **not** sized for 600 concurrent (see §1).

---

## TL;DR

The make-or-break levers for 600 concurrent are **compute size, Realtime capacity, and a load test** — not the app code. The DB hygiene below (already applied) helps at the margins.

---

## 1. Compute (the big lever) — REQUIRED before launch

- Test ran on **Nano (0.5 GB, shared CPU)** — swapping at idle, IOwait 100% under introspection load. Now on **Micro (1 GB, dedicated 2-core ARM, ~60 max connections)** — better, but still small.
- For ~600 concurrent, **start at Large (8 GB, 2-core)**, then **load-test and adjust** — do not guess the tier. If the load test shows CPU saturation (not just memory/IO), step to **XL (16 GB, 4-core)**.
- Tier costs (≈730 hrs/mo, minus the ~$10 credit): Small ~$15, Medium ~$60, **Large ~$110**, XL ~$210.
- Each tier up raises RAM (cache, no swap), disk IOPS (kills the IOwait), `max_connections`, and PostgREST worker count. Resize is **Settings → Compute and Disk** → pick tier → confirm; it triggers a **brief restart (~1–2 min downtime)**, so do it in a low-traffic window. Bump shortly **before** go-live, not during the quiet pre-launch weeks, to avoid paying the higher rate early.
- **Disk is fine** — 0.57 GB of 8 GB used (8%). Do **not** scale disk.
- **Connections are fine** — peak 26/60. Users hit PostgREST/GoTrue (which pool internally); they do **not** each hold a Postgres connection. Only fix needed: ensure no server-side code opens raw `pg` connections per request — if any does, route via **Supavisor transaction mode (port 6543)**.

## 2. Realtime capacity — the most likely bottleneck at 600

- 600 live websocket subscriptions + message fan-out. Realtime was healthy at 6 users; it does not scale linearly for free.
- Check the plan's **concurrent-connection** and **messages/sec** limits; 600 likely needs a quota bump (Pro add-on / Team).
- Audit the app's **subscription fan-out**: how many channels each user opens, especially on **pool switches** (global state change re-subscribes Home + Board + SmackTalk). Minimise redundant channels; unsubscribe on switch.

## 3. Load test — the only way to size confidently

- Simulate ~600 concurrent against **REST + Auth + Realtime** (k6 / Artillery) on the upgraded instance.
- Watch: CPU, **IOwait**, memory/swap, connections, Realtime concurrency, p95 latency, error rate.
- Find the real ceiling; right-size compute from the result.

## 4. Database hygiene (from the 2026-06-18 performance advisor)

### Applied — migration `20260618143000_scaling_hygiene_fk_indexes_and_rls_initplan`
- **Covering indexes** for unindexed FKs on hot tables: `notification_read_state(pool_id)`, `organizer_notifications(organizer_id)`, `pool_members(invited_by)`, `smack_messages(reply_to / flagged_by / moderated_by)` (partial `WHERE … IS NOT NULL` on the sparse columns).
- **Memoized `auth.uid()`** in two RLS policies (`comp_codes_admin_all`, `week_readiness_super_admin_select`) → evaluated once per query, not per row.

### Still open (lower priority — do deliberately, not rushed)
- **Multiple permissive RLS policies** on `user_hardware`, `user_cosmetics`, `organizer_notifications`, `pool_events`, `member_engagement`, `competition_access` — consolidate so fewer policies evaluate per query (CPU on home/profile loads).
- **Remaining unindexed FKs** (low-traffic / admin tables: `partner_*`, `pending_role_grants`, `comp_codes`, `competition_config`, etc.) — index if they show up under load testing; not worth pre-emptively.
- **72 unused indexes** — candidates to drop to cut write amplification on `season_picks` / `smack_messages` inserts. Review each (some back rare queries) before dropping.

> Note: the genuinely hot read paths (`season_user_totals`, leaderboards, `pool_members` by pool/user/week) are **already indexed** — they did not flag. The app's read model is in good shape.

## 5. Operational notes

- **Don't judge capacity from a session where the dashboard/AI-Assistant/MCP are open** — their introspection queries (extension/table/type listings, `pg_timezone_names`) dwarf app traffic on a small instance. Close them when gauging real load.
- **Migrations trigger a PostgREST schema-cache reload** (expensive introspection). Avoid running migrations during peak traffic.
- Keep the `scoring_locked` emergency brake handy on launch day (REFERENCE.md / CLAUDE.md).
