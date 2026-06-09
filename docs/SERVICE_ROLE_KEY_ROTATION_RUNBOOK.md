# Service-Role Key Rotation Runbook

**Incident:** the **legacy `service_role` JWT** for project `mzqtrpdiqhopjmxjccwy` was
committed to a **public** GitHub repo (`tmcdade1148/HotPickSports`) in
`supabase/migrations/20260527211734_fix_notification_cron_auth.sql`, present on
`main` and in history since ~2026-05-27. Treat it as **fully compromised**.

**Goal:** revoke the leaked key using Supabase's **new API key system**
(`sb_publishable_…` / `sb_secret_…`) — **NOT** JWT-secret regeneration.
Regenerating the JWT secret would invalidate the **anon key baked into the shipped
mobile build** (downtime until App Store review) and force-log-out every user.
This runbook avoids both.

> **No secrets in this doc.** All keys are placeholders: `{{NEW_SECRET_KEY}}`
> (`sb_secret_…`), `{{NEW_PUBLISHABLE_KEY}}` (`sb_publishable_…`).
> **Nothing here has been executed.** Run it in the OFF_SEASON window (we're in it
> now: `nfl_2026 = OFF_SEASON`). Per CLAUDE.md: no direct prod changes during a
> live season; take a manual backup before any migration; never commit a new key.

---

## 0. Path determination — read this first

The three questions from the task, answered as far as is knowable without the
Dashboard, plus what **you** must confirm:

| Question | Finding | Source |
|---|---|---|
| On new API keys yet, or legacy? | Project is **operating on legacy keys** today: cron uses the legacy `service_role` JWT, client uses the legacy `anon` JWT, both currently valid. Whether `sb_*` keys have been *created* yet is **unknown from here** — check **Settings → API Keys**. | code + cron inspection |
| Can legacy `service_role` be disabled **independently** of legacy `anon`? | **No (expected).** Legacy `anon` + `service_role` are a JWT pair signed by the same JWT secret; Supabase exposes a **single "disable legacy API keys"** action for the pair — there is no per-key revoke for legacy keys. **Confirm in Dashboard**, but plan for the combined toggle. | Supabase new-API-key model |
| Why this forces Path B | The leaked credential is the **legacy** `service_role` JWT. Creating `sb_secret_…` and moving servers to it does **not** invalidate the leaked legacy JWT — it stays valid until **legacy keys are disabled**. Disabling legacy keys also kills the legacy `anon` in the shipped build → client must move to `sb_publishable_…` first. | inference |

**Conclusion:** because the burned key is a *legacy* JWT, **Path B is the path that
actually neutralizes the leak.** Path A (revoke server key, leave client alone) is
documented below for completeness but **does not apply to a leaked legacy key** —
it would only apply if you had already migrated and the leaked key were an
individually-revocable `sb_secret_…`.

**Good news that makes Path B low-risk here:** the client `anon` key lives in the
**JS layer** (`src/shared/config/supabase.ts`, a hardcoded literal), so swapping it
to `sb_publishable_…` ships via **EAS Update (OTA)** — **no App Store review, no
forced logout, no app restart.**

---

## 1. Consumer inventory (everything that uses the service key)

### A. Cron jobs sending the leaked JWT inline (`Authorization: Bearer …`) — 12
All call an Edge Function via `net.http_post`. Seeded/maintained by migration
`20260527211734_fix_notification_cron_auth.sql`.

| jobid | jobname | schedule |
|---|---|---|
| 58 | nfl-import-schedule | `0 5 * * 2` |
| 59 | nfl-finalize-week | `0 6 * * 2` |
| 60 | nfl-fetch-odds | `0 10 * * 2` |
| 61 | nfl-rank-games | `15 10 * * 2` |
| 62 | nfl-open-picks | `0 11 * * 2` |
| 63 | nfl-update-scores | `*/5 * * * *` |
| 64 | nfl-calculate-scores | `*/30 * * * *` |
| 66 | smack-archive-messages | `0 4 * * *` |
| 67 | refresh-game-pick-stats | `* * * * *` |
| 68 | compute-hardware-weekly | `5,35 * * * *` |
| 70 | espn-health-check | `17 * * * *` |
| 72 | process-notification-queue | `* * * * *` |

**Not affected** (direct SQL, no token): `71 escalate-stale-flagged-messages`,
`73 refresh-reviewer-sim-countdown`.

### B. Edge Functions reading `SUPABASE_SERVICE_ROLE_KEY` (auto-injected legacy key) — 23
`admin-broadcast, compute-hardware, delete-account, demo-settle, espn-health-check,
nfl-announce-regular-winners, nfl-calculate-scores, nfl-fetch-odds,
nfl-finalize-week, nfl-import-schedule, nfl-open-picks, nfl-rank-games,
nfl-update-scores, nfl-weekly-transition, process-notification-queue,
refresh-game-pick-stats, season-simulator, send-broadcast-email,
send-partner-broadcast, smack-archive-messages, suspend-pool, suspend-user`
(plus `season-simulator`/`send-broadcast-email` also touch `SUPABASE_ANON_KEY`).

⚠️ `SUPABASE_SERVICE_ROLE_KEY` is a **platform-reserved, auto-injected** env var =
the **legacy** key. You generally **cannot override a `SUPABASE_*` name** with a
custom secret, and once legacy keys are disabled this injected value goes invalid.
→ The functions must read the new key from a **new secret name** (e.g.
`SB_SECRET_KEY`). See Stage 2.

### C. Client (anon) consumer — 1
`src/shared/config/supabase.ts` — `SUPABASE_ANON_KEY` is a hardcoded `eyJ` literal
passed to `createClient`. **JS layer → OTA-updatable.**

### D. Migration that hardcodes the key
`supabase/migrations/20260527211734_fix_notification_cron_auth.sql` — the source of
the leak; rewrite to read from Vault (Stage 4).

---

## 2. The cron gotcha (critical, easy to get wrong)

New API keys are **not JWTs** and **must not** be sent as `Authorization: Bearer`.
The Supabase gateway authenticates a non-JWT API key via the **`apikey` header**.
So every cron `net.http_post` must change from:

```
'Authorization', 'Bearer <leaked service_role JWT>'
```
to sending the secret in the **`apikey`** header instead. Corrected template (Stage 3).

---

## 3. PATH A — *(documented; NOT applicable to this incident)*

> Use only if you had already migrated to new keys **and** the leaked credential
> were an individually-revocable `sb_secret_…`. Our leaked key is a **legacy JWT**,
> so this path cannot revoke it. Recorded for completeness.

1. Create a replacement `sb_secret_…` in Settings → API Keys.
2. Swap it into all server consumers (Stages 2–3 below).
3. **Revoke the specific leaked `sb_secret_…`** (per-key revoke) — client/anon
   untouched, zero app-store/logout impact.

Because legacy keys have no per-key revoke, **skip to Path B**.

---

## 4. PATH B — the plan for this incident (OFF_SEASON, staged)

Each stage has a **verify** gate; do not proceed until it passes. Take a manual
DB backup before Stage 3 and Stage 4 (they run migrations).

### Stage 0 — Enable the new API key system
- Dashboard → **Settings → API Keys** → enable new keys. Create:
  - `{{NEW_PUBLISHABLE_KEY}}` = `sb_publishable_…` (replaces anon)
  - `{{NEW_SECRET_KEY}}` = `sb_secret_…` (replaces service_role)
- **Do NOT disable legacy keys yet.** New and legacy keys coexist now — this is
  what makes a zero-downtime cutover possible.
- **Verify:** both new keys exist; app + cron still green (nothing changed yet).

### Stage 1 — Migrate the CLIENT anon → publishable (OTA)
- In `src/shared/config/supabase.ts`, replace the hardcoded anon literal with
  `{{NEW_PUBLISHABLE_KEY}}`. (Prefer reading from an EAS env var so the next
  rotation is config, not code — but a literal is fine if that matches the current
  pattern.)
- Ship via **EAS Update (OTA)** — JS-only change, no native rebuild:
  `eas update --branch production --message "rotate anon→publishable"`.
  (Confirm `runtimeVersion` matches the installed build so the OTA is picked up.)
- **Verify:** a device on the OTA can sign in, load pools, submit a pick, open
  SmackTalk. Legacy anon still works for not-yet-updated devices (legacy keys are
  still enabled) — that's the grace window.

### Stage 2 — Point Edge Functions at the new secret
- Set the new secret under a **non-reserved name**:
  `supabase secrets set SB_SECRET_KEY={{NEW_SECRET_KEY}}` (CLI) or Dashboard →
  Edge Functions → Secrets.
- In each of the 23 functions, read `Deno.env.get('SB_SECRET_KEY')` instead of
  `SUPABASE_SERVICE_ROLE_KEY`. (One shared `_shared` client helper, if present,
  minimizes the edit surface.) Commit, then `supabase functions deploy <name>`
  for all 23 (CLAUDE.md: all Edge Functions committed to git before deploy).
- **Canary first:** deploy ONE low-risk function (e.g. `espn-health-check`),
  invoke it, confirm 200 + correct DB writes, **before** rolling the other 22.
- **Verify:** every function returns 200 and performs its DB work. Functions still
  also accept the legacy key (legacy not yet disabled) — safe overlap.

### Stage 3 — Fix the 12 cron jobs (apikey header, new secret)
- Migration (`apply_migration`, NOT `execute_sql`), placeholder swapped at apply
  time — **never commit the real key**. Corrected `net.http_post` shape:

```sql
-- one per job; example for nfl-calculate-scores (jobid 64)
SELECT cron.schedule(
  'nfl-calculate-scores', '*/30 * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-calculate-scores',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', '{{NEW_SECRET_KEY}}'      -- secret in apikey, NOT Authorization: Bearer
               ),
    body    := '{}'::jsonb
  );
  $cron$
);
-- repeat for jobids 58,59,60,61,62,63,66,67,68,70,72
```
- ⚠️ **Validate the `verify_jwt` interaction on ONE job first.** Most of these
  functions have `verify_jwt=true`; confirm the platform accepts `apikey:
  sb_secret_…` for a `verify_jwt` function by canarying `refresh-game-pick-stats`
  (runs every minute → fast feedback) and checking it returns 200. If a function
  rejects it, set that function's `verify_jwt=false` (it's already gated by the
  secret) or keep an Authorization header carrying the secret — decide per the
  canary result, don't assume.
- **Verify:** `SELECT * FROM cron.job_run_details ORDER BY end_time DESC LIMIT 20;`
  — all 12 jobs returning **HTTP 200**. Exercise a scoring path against the
  **sandbox only** (`nfl_2025_sim`) — never trigger scoring on prod data.

### Stage 4 — Stop hardcoding; move to Vault
- Rewrite `20260527211734_…` (or supersede it) so cron reads the key from
  **Supabase Vault** instead of a literal, e.g. store `sb_secret_key` in
  `vault.secrets` and reference `vault.decrypted_secrets` when (re)scheduling, OR
  set a DB setting via `ALTER DATABASE … SET` that cron reads. Either way the
  **next** rotation becomes a config update, not a public migration rewrite.
- **Verify:** re-create one job from the Vault value; confirm 200.

### Stage 5 — Revoke the leak (the actual fix)
- Confirm Stages 1–3 verifications are green and a meaningful fraction of devices
  are on the OTA. Then in Dashboard → **Settings → API Keys → disable legacy API
  keys**. This invalidates the leaked `service_role` JWT **and** the legacy anon.
- **Verify immediately after:** cron `job_run_details` still 200; a Stage-2
  function still 200; an OTA device still authenticates. Keep the rollback (below)
  one click away.
- Old (pre-OTA) app builds that still hold the legacy anon will lose access at
  this moment — that's why Stage 1 + a grace window come first. Time it for the
  low-traffic OFF_SEASON window.

---

## 5. Rollback (per stage)
- **Stages 1–4** are additive — legacy keys remain enabled, so revert the specific
  change (re-deploy the prior function, re-`cron.schedule` the prior job, OTA the
  prior anon) and you're back to a known-good state.
- **Stage 5** is the only hard cutover: if something breaks, **re-enable legacy API
  keys** in the Dashboard to instantly restore the old credentials, then diagnose.

## 6. History scrubbing — optional, NOT a substitute
Removing the key from git history (BFG / `git filter-repo` + force-push) is good
hygiene but **does not un-expose** a key that's been public for ~2 weeks — caches,
clones, and forks may retain it. **Rotation (Stages 1–5) is mandatory regardless.**
Do scrubbing *after* rotation, if at all.

## 7. Also rotate (separate from this repo leak)
- The **database password** pasted into the assistant chat earlier (Dashboard →
  Project Settings → Database → Database password → Reset). Not in the repo, but
  exposed in conversation.

---

### Open items for you to confirm in the Dashboard (I can't read these via API)
1. Whether `sb_*` keys already exist (Settings → API Keys).
2. That legacy disable is a **combined** anon+service_role toggle (drives whether
   Stage 1 is required — it almost certainly is).
3. Per-function `verify_jwt` current values, to finalize the Stage-3 header choice.
