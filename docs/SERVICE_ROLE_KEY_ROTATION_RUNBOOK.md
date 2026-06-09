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

## 0. Path determination — CONFIRMED (Dashboard, 2026-06-09)

| Question | Finding | Source |
|---|---|---|
| On new API keys yet, or legacy? | **Both coexist.** `sb_publishable_…` keys **already exist** (one for web, one for mobile). **No `sb_secret_…` key exists yet** — Stage 0 must create it. The project is still *operating* on legacy keys (cron uses the legacy `service_role` JWT; the **shipped app build** still uses the hardcoded legacy `anon` literal — existence of a publishable key ≠ the build using it). | **Dashboard confirmed** |
| Can legacy `service_role` be disabled **independently** of legacy `anon`? | **No — confirmed.** "Disable legacy keys" is a **single combined toggle** for the anon + service_role pair. No per-key revoke for legacy keys. | **Dashboard confirmed** |
| Why this forces Path B | The leaked credential is the **legacy** `service_role` JWT. Creating `sb_secret_…` and moving servers to it does **not** invalidate the leaked legacy JWT — it stays valid until **legacy keys are disabled** (the combined toggle), which also kills the legacy `anon` in the shipped build → client must move to `sb_publishable_…` first. | inference + confirmed toggle |

**Conclusion: Path B confirmed.** Because the burned key is a *legacy* JWT and the
disable is a combined toggle, **Path B is the only path that neutralizes the leak.**
Path A (revoke server key, leave client alone) is
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

### E. Operator / browser tools that take a service-role key pasted at runtime
These hold no committed secret (the key is pasted into the UI each session), but
they are live `service_role` consumers — **after legacy keys are disabled they will
break until the operator pastes the new `{{NEW_SECRET_KEY}}`**, and any tool that
sends the key as `Authorization: Bearer` must switch to the **`apikey`** header
(see §2).

| Tool | Location | Notes |
|---|---|---|
| `season-simulator` (browser) | `tools/season-simulator{,-v2,-v3,-v4}.html` | REST calls already send the key in the `apikey` header (good); verify the `functions/v1` calls do too. The committed `eyJ` in these files is the **anon** key (public) — not a leak. |
| `season-simulator` (Edge Function) | already counted in **B** | reads `SUPABASE_SERVICE_ROLE_KEY` → migrate to `SB_SECRET_KEY` in Stage 2. |
| **`hotpick_engine_monitor`** | **external — not in this repo** | operator monitor that takes a pasted service-role key. Source not present here; the owner must update it to (a) accept the new `sb_secret_…` and (b) send it via the `apikey` header. See the bug note below. |

> After Stage 5, circulate the new `{{NEW_SECRET_KEY}}` to whoever runs these tools
> and have them paste it in place of the old key. The old key stops working the
> moment legacy keys are disabled.

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

### Stage 0 — Create the missing secret key
- `{{NEW_PUBLISHABLE_KEY}}` = `sb_publishable_…` **already exists** (web + mobile) —
  reuse the appropriate one in Stage 1; nothing to create.
- Dashboard → **Settings → API Keys** → **create the secret key**
  `{{NEW_SECRET_KEY}}` = `sb_secret_…` (this is the one that does **not** exist yet).
- **Do NOT disable legacy keys yet** (that's the combined toggle = Stage 5). New and
  legacy coexist now — that overlap is what makes a zero-downtime cutover possible.
- **Verify:** the new secret key exists alongside the publishable keys; app + cron
  still green (nothing wired up yet).

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

## 8. `hotpick_engine_monitor` — "Missing URL or API key" (bug note)
The monitor tool's source is **not in this repo**, so this is a diagnosis, not a fix.
The strongest lead is the wording: **"Missing URL *or* API key"** is an **OR** check
that fires if **either** field is empty. With a key pasted and the error still
showing, the usual cause is the **Project URL field being blank** (operators focus on
the key and miss the URL). Check, in order:
1. The **URL field is populated** (`https://mzqtrpdiqhopjmxjccwy.supabase.co`) — most
   likely culprit.
2. The pasted key has **no leading/trailing whitespace or newline** (a trailing `\n`
   from copy/paste can fail a `.trim()`-less truthiness/length check).
3. The paste actually **fired the field's change/input event** (some single-paste
   into a password input doesn't register until you type or blur the field).
4. If it validates the key **format/prefix**: a new `sb_secret_…`/`sb_publishable_…`
   key is **not** a JWT — a tool that checks for an `eyJ…` prefix will reject the new
   key and report it as "missing/invalid." This becomes relevant once you rotate.
If you can share the tool's source (or which repo it lives in), I'll pinpoint the
exact line.

---

### Open items — status
1. ~~Whether `sb_*` keys already exist~~ → **Confirmed:** publishable keys exist
   (web + mobile); **no secret key yet** (Stage 0 creates it).
2. ~~Whether legacy disable is a combined toggle~~ → **Confirmed: combined** →
   Path B (Stage 1 OTA) is required.
3. **Still open:** per-function `verify_jwt` values, to finalize the Stage-3 header
   choice (resolve via the Stage-3 canary).
