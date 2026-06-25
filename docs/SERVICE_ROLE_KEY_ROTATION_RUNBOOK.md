# Service-Role Key Rotation Runbook

**Incident:** the **legacy `service_role` JWT** for project `mzqtrpdiqhopjmxjccwy` was
committed to a **public** GitHub repo (`tmcdade1148/HotPickSports`) in
`supabase/migrations/20260527211734_fix_notification_cron_auth.sql`, present on
`main` and in history since ~2026-05-27. Treat it as **fully compromised**.

**Goal:** revoke the leaked key using Supabase's **new API key system**
(`sb_publishable_…` / `sb_secret_…`) — **NOT** JWT-secret regeneration, which would
invalidate the anon key baked into the shipped mobile build (downtime until App
Store review) and force-log-out every user. This runbook avoids both.

> **No secrets in this doc, in any migration, or in the assistant chat.** Keys are
> placeholders: `{{NEW_SECRET_KEY}}` (`sb_secret_…`), `{{NEW_PUBLISHABLE_KEY}}`
> (`sb_publishable_…`). The secret value is entered by **you** into exactly two
> stores (Vault + Edge Function Secrets) and nowhere else — see §9.
> **Nothing here has been executed.** Run it in the OFF_SEASON window (now:
> `nfl_2026 = OFF_SEASON`). Per CLAUDE.md: no direct prod changes during a live
> season; manual backup before a migration; never commit a key.

---

## 0. Path determination — CONFIRMED (Dashboard, 2026-06-09)

| Question | Finding | Source |
|---|---|---|
| On new API keys yet, or legacy? | **Both coexist.** `sb_publishable_…` keys **already exist** (web + mobile). **No `sb_secret_…` key exists yet** — must be created. Project still *operates* on legacy keys (cron uses the legacy `service_role` JWT; the **shipped app build** still uses the hardcoded legacy `anon` literal — a publishable key existing ≠ the build using it). | **Dashboard confirmed** |
| Disable legacy `service_role` independently of `anon`? | **No — confirmed.** "Disable legacy keys" is a **single combined toggle** for the anon + service_role pair. No per-key revoke for legacy keys. | **Dashboard confirmed** |
| Why Path B | The leak is the **legacy** `service_role` JWT. Moving servers to `sb_secret_…` does **not** invalidate it — it stays valid until legacy keys are disabled (the combined toggle), which also kills the legacy `anon` in the shipped build → client must move to `sb_publishable_…` first. | confirmed toggle |

**Conclusion: Path B confirmed** — the only path that neutralizes the leak. Path A
(per-key revoke, client untouched) does not apply to a legacy key.

**What makes Path B low-risk:** the client `anon` key is a hardcoded literal in
`src/shared/config/supabase.ts` (**JS layer**), so the swap to `sb_publishable_…`
ships via **EAS Update (OTA)** — no App Store review, no forced logout, no restart.
(Publishable keys are public by design, so this key is safe to live in JS.)

---

## 1. Consumer inventory

### A. Cron jobs sending the leaked JWT inline (`Authorization: Bearer …`) — 12
All call an Edge Function via `net.http_post`. Seeded by `20260527211734_…`.

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
(`season-simulator`/`send-broadcast-email` also touch `SUPABASE_ANON_KEY`).

⚠️ `SUPABASE_SERVICE_ROLE_KEY` is **platform-reserved / auto-injected** = the legacy
key; you **cannot override a `SUPABASE_*` name**, and it goes invalid once legacy
keys are disabled. → functions must read a **new secret name** (`SB_SECRET_KEY`).

### C. Client (anon) consumer — 1
`src/shared/config/supabase.ts` — hardcoded `eyJ` anon literal → **OTA-updatable**.

### D. Migration that hardcodes the key (the leak source)
`supabase/migrations/20260527211734_fix_notification_cron_auth.sql` — superseded in
Stage 4 (cron reads from Vault instead).

### E. Operator / browser tools that take a pasted service-role key at runtime
No committed secret (pasted each session), but live `service_role` consumers —
they break when legacy keys are disabled until the operator pastes
`{{NEW_SECRET_KEY}}`. Migrated in **Stage 5**.

| Tool | Location | Action in Stage 5 |
|---|---|---|
| `season-simulator-v4` (browser) | `tools/season-simulator-v4.html` | paste new secret; confirm it's sent in the `apikey` header on both REST and `functions/v1` calls. (The committed `eyJ` here is the **anon** key — public, not a leak.) |
| `season-simulator` (Edge Function) | counted in **B** | migrated in Stage 3 with the rest. |
| **`hotpick_engine_monitor`** | **external — not in this repo** | paste new secret **and update its key-format validation** to accept `sb_secret_…` (it currently appears to require an `eyJ…`/URL pair → see §8). Optional read-only tool; fix it here, not on the critical path. |

---

## 2. The cron gotcha (critical)
New API keys are **not JWTs** and must **not** be sent as `Authorization: Bearer`.
The gateway authenticates a non-JWT key via the **`apikey` header**. In Stage 4 the
cron jobs read the key from **Vault by name** and put it in `apikey` — the literal
never appears in the job command, the migration, or this chat.

---

## 3. PATH A — *(documented; NOT applicable here)*
Only valid if the leaked credential were an individually-revocable `sb_secret_…`.
Ours is a legacy JWT with no per-key revoke → use Path B.

---

## 4. PATH B — staged plan (OFF_SEASON)

Every stage has a **verify** gate. Take a manual DB backup before **Stage 4** (the
only migration). Stages 2→4 (server) and the client OTA (Stage 6) can overlap; the
**legacy disable (Stage 7) is last** and requires all prior verifies green.

### Stage 1 — Create the secret key *(you, Dashboard)*
- Settings → API Keys → **create** `{{NEW_SECRET_KEY}}` = `sb_secret_…` (the
  publishable keys already exist; nothing to create there).
- **Do NOT disable legacy keys** (that's Stage 7). New + legacy coexist = zero-downtime.
- **Verify:** secret key listed alongside the publishable keys; app + cron still green.

### Stage 2 — Place the secret in its TWO homes *(you — value never enters a file or chat)*
- **Edge Function Secrets:** `SB_SECRET_KEY = {{NEW_SECRET_KEY}}` via Dashboard →
  Edge Functions → Secrets, or `supabase secrets set SB_SECRET_KEY=…` in your terminal.
- **Vault** (for cron): store the same value as Vault secret named **`sb_secret_key`**
  — Dashboard → Project Settings → Vault → New secret, or a SQL statement **you** run:
  `select vault.create_secret('<paste>', 'sb_secret_key');`
- These are the **only** two places the value is ever typed, both by you. Claude never
  receives it; no migration/commit contains it.
- **Verify:** `select name from vault.secrets where name='sb_secret_key';` returns a
  row (value stays encrypted); the Edge secret appears in the secrets list.

### Stage 3 — Point Edge Functions at `SB_SECRET_KEY` *(Claude edits, you/Claude deploy)*
- In the 23 functions (ideally the shared `_shared` client helper), read
  `Deno.env.get('SB_SECRET_KEY')` instead of `SUPABASE_SERVICE_ROLE_KEY`. **Code only
  — no secret.** Commit (CLAUDE.md: committed before deploy), then
  `supabase functions deploy …` (or Claude via MCP — deploys code; the secret stays
  in the env store).
- **Canary:** deploy ONE (`espn-health-check`), invoke, confirm 200 + DB write before
  the other 22.
- **Verify:** all 23 return 200. Legacy key still accepted (not yet disabled) — safe overlap.

### Stage 4 — Reschedule the 12 cron jobs to read the secret from Vault *(Claude, `apply_migration`)*
- Migration contains **only a Vault reference** — never the key:
```sql
-- one per job; example: nfl-calculate-scores (jobid 64)
SELECT cron.schedule(
  'nfl-calculate-scores', '*/30 * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-calculate-scores',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets
                            WHERE name = 'sb_secret_key')   -- read at run time; literal never stored
               ),
    body    := '{}'::jsonb
  );
  $cron$
);
-- repeat for jobids 58,59,60,61,62,63,66,67,68,70,72
```
- ⚠️ **Canary the `verify_jwt` interaction first** on `refresh-game-pick-stats`
  (runs every minute). If a `verify_jwt=true` function rejects an apikey-only call,
  set that function `verify_jwt=false` (it's gated by the secret) or also pass the
  secret in an Authorization header — decide per canary, don't assume.
- Confirm the cron role can read `vault.decrypted_secrets` (it runs as the
  cron/superuser role — verify on the canary).
- **Verify:** `SELECT status, count(*) FROM cron.job_run_details
  WHERE start_time > now() - interval '15 min' GROUP BY 1;` → all 200. Exercise a
  scoring path against the **SANDBOX only** (`nfl_2025_sim`).

### Stage 5 — Migrate operator tools *(you)*
- `season-simulator-v4` HTML + `hotpick_engine_monitor`: paste `{{NEW_SECRET_KEY}}`,
  ensure the key is sent in the **`apikey`** header, and update
  `hotpick_engine_monitor`'s key-format validation to accept `sb_secret_…` (§8).
- **Verify:** each tool performs a read against the sandbox without error.

### Stage 6 — Migrate the CLIENT anon → publishable (OTA) *(Claude edits, you ship)*
- Replace the anon literal in `src/shared/config/supabase.ts` with
  `{{NEW_PUBLISHABLE_KEY}}` (publishable = non-secret, safe in JS; or read from an
  EAS env var). Ship JS-only via **EAS Update**:
  `eas update --branch production --message "rotate anon→publishable"` (confirm
  `runtimeVersion` matches installed builds).
- **Verify:** an OTA device signs in, loads pools, submits a pick, opens SmackTalk.
  Legacy anon still works for not-yet-updated devices (grace window).

### Stage 7 — Disable legacy keys = revoke the leak *(you, Dashboard) — LAST*
- Only after Stages 3, 4, 6 verifies are green and a meaningful share of devices have
  taken the OTA: Settings → API Keys → **disable legacy API keys** (combined toggle).
  This invalidates the leaked `service_role` JWT **and** the legacy anon.
- **Verify immediately:** cron `job_run_details` still 200; a Stage-3 function still
  200; an OTA device still authenticates. Keep rollback one click away.
- Pre-OTA builds holding the legacy anon lose access now — that's why Stage 6 + grace
  window precede it. Time it for the low-traffic OFF_SEASON window.

---

## 5. Rollback (per stage)
- **Stages 1–6** are additive — legacy keys stay enabled, so revert the specific
  change (redeploy prior function, re-`cron.schedule` prior job, OTA prior anon).
- **Stage 7** is the only hard cutover: if anything breaks, **re-enable legacy API
  keys** in the Dashboard to instantly restore the old credentials, then diagnose.

## 6. History scrubbing — optional, NOT a substitute
BFG / `git filter-repo` + force-push is hygiene but **does not un-expose** a key
public for ~2 weeks. **Rotation (Stages 1–7) is mandatory.** Scrub *after*, if at all.

## 7. Also rotate (separate from this leak)
- The **database password** pasted into the assistant chat earlier (Dashboard →
  Project Settings → Database → Database password → Reset).

## 8. `hotpick_engine_monitor` "Missing URL or API key" — diagnosis (source not in this repo)
Folded into Stage 5 (it's an optional read-only tool, not the priority). Likely
causes, in order: (1) the **URL field is blank** — the error is "URL **or** API key",
an OR-check; (2) the pasted key has trailing whitespace/newline; (3) the paste didn't
fire the field's input event; (4) the tool validates an **`eyJ…` JWT prefix** and
rejects the new `sb_secret_…` — fix this validation as part of Stage 5.

---

## 9. Ordered execution plan — who does what, and where the secret lives

**Secret-handling rule:** `{{NEW_SECRET_KEY}}` is typed by **you** into **only** two
places — **Edge Function Secrets** (`SB_SECRET_KEY`) and **Vault** (`sb_secret_key`).
It never appears in a repo file, a migration, an `apply_migration` call, or this chat.
`{{NEW_PUBLISHABLE_KEY}}` is public and may live in JS/EAS config.

| # | Owner | Action | Secret value touched? |
|---|---|---|---|
| 1 | **You** | (optional) confirm a fresh daily backup exists before the Stage-4 migration | no |
| 2 | **You** (Dashboard) | Create `sb_secret_…` (`{{NEW_SECRET_KEY}}`). Do **not** disable legacy. | created |
| 3 | **You** (Dashboard/CLI) | Put it in **Edge Function Secrets** as `SB_SECRET_KEY` **and** in **Vault** as `sb_secret_key` | **entered by you, here only** |
| 4 | **Claude** (repo) | Edit 23 Edge Functions → read `SB_SECRET_KEY`; commit | no (code only) |
| 5 | **You** or **Claude** | Deploy functions; canary `espn-health-check` | no |
| 6 | **Claude** (read-only SQL) | Verify all 23 functions return 200 | no |
| 7 | **Claude** (`apply_migration`) | Reschedule 12 cron jobs → `apikey` from **Vault reference** | no (vault name only) |
| 8 | **Claude** (read-only SQL) | Verify cron `job_run_details` 200; canary `verify_jwt` on `refresh-game-pick-stats`; sandbox scoring check | no |
| 9 | **Claude** (repo) | Swap client anon → `{{NEW_PUBLISHABLE_KEY}}` in `supabase.ts`; commit | no (publishable, non-secret) |
| 10 | **You** (terminal) | `eas update` OTA to ship the publishable key | no |
| 11 | **You / Claude** | Verify an OTA device authenticates | no |
| 12 | **You** | Operator tools (season-simulator, hotpick_engine_monitor): paste new secret, `apikey` header, fix monitor key-format validation | **pasted by you into the tools** |
| 13 | **You** (Dashboard) | **Disable legacy keys** (combined toggle) — the actual revoke | no |
| 14 | **Claude + You** | Post-cutover verify: cron 200, function 200, app auth | no |
| 15 | **You** | Reset the chat-exposed DB password | (separate secret) |

**Review gate:** this is the plan to approve. Nothing in steps 4–9/14 executes until
you say go, and the destructive revoke (step 13) is yours alone in the Dashboard.
