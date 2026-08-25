# HotPick Sports — Runbook: ESPN Data Degradation

**Type:** Operational runbook (not a code change)
**Owner:** Super-admin / operator (Tom)
**Repo location:** `docs/ESPN_DEGRADATION_RUNBOOK.md`
**Last updated:** August 25, 2026

---

## When to use this

ESPN is the source of live scores and game state during a season. If ESPN
returns degraded data **during a live scoring window** — wrong scores, stale
game state, a changed JSON shape, or sustained errors — scoring can compute on
bad inputs and corrupt results after picks are locked. This runbook is the
procedure for stopping that.

It applies whenever a competition is actively scoring: `week_state` is `live`,
`settling`, or about to settle, inside `REGULAR`, `PLAYOFFS`, or `SUPERBOWL`.

---

## Operating principle — manual brake, not auto-lock

**Scoring is never auto-halted on a monitoring signal. The operator pulls the
brake.**

The pipeline watchdog alerts on staleness, but it does **not** set
`scoring_locked`. This is deliberate: a transient ESPN blip (a slow response, a
brief 5xx) is common and recovers on its own. Auto-halting legitimate scoring on
a false positive — during a live week, with users watching — is worse than the
brief, controlled pause an operator applies after a 10-second look. A human
confirms it's real before stopping the engine.

The cost of this choice: detection-to-action depends on the operator seeing the
alert. That is the right trade for an 18-week season; the alternative risks
self-inflicted outages.

---

## How you'll know (detection)

### Primary: the pipeline watchdog → email

`run_pipeline_watchdog()` (cron job **97**, `3-59/5 * * * *` — every 5 minutes
at :03) checks the **outcome**, not the process: if any game in a monitored
competition's current week is past kickoff and not FINAL, and no `season_games`
row for that week has been written within the threshold, the pipeline is
declared stale.

- **Threshold:** `competition_config` global key `watchdog_stale_minutes`
  (currently `15`).
- **Scope:** active competitions with `data_provider = 'espn'` only. Sim and
  demo sandboxes are excluded by design — they sit stale between operator
  sessions and would alert constantly.
- **Delivery:** `ops-alert` Edge Function → Resend → the address in
  `competition_config` global key `ops_alert_email` (currently
  **admin@hotpicksports.com**). Deliberately **not** the app's push pipeline —
  that is part of the system being monitored.
- **Cadence:** transitions only (fresh→stale, stale→fresh), plus a 6-hour
  reminder while stale. Subject lines are `[STALE] HotPick pipeline: …` and
  `[RECOVERED] HotPick pipeline: …`.
- **Independent trail:** every transition is written to `system_logs` with
  `event_type = 'pipeline_watchdog'`, so the history survives even if email
  delivery fails.

```sql
-- Watchdog history
SELECT created_at, event_data
FROM system_logs
WHERE event_type = 'pipeline_watchdog'
ORDER BY created_at DESC LIMIT 20;

-- Current watchdog state per competition
SELECT * FROM pipeline_watchdog_state;
```

### What the watchdog does *not* catch

The watchdog measures **freshness**, not **correctness**. It asks "is anything
being written?" — never "are the values right?" Two distinct failure classes:

| Failure | Watchdog sees it? |
|---|---|
| Pipeline frozen — 403s, timeouts, empty bodies, no writes | **Yes** — this is what it's for |
| ESPN returning *wrong* scores/state, written on schedule | **No** — writes look healthy |

For wrong-but-fresh data, detection is still secondary signals: scores visibly
wrong or frozen in-app during a live game, or user reports of stuck HotPick
cards. Treat those reports as first-class — for this failure class they are the
only alarm there is.

### Retired: `espn-health-check`

`espn-health-check` (cron job **70**, `17 * * * *`) was set `active := false` on
2026-08-22 by migration `260822_pipeline_watchdog_and_ops_alert.sql`. **It will
never fire again.** It monitored the now-abandoned `site.api.espn.com` host (a
false "down" every hour after the Aug 21 host swap) and delivered alerts into
`notification_queue`, whose push delivery was unproven — the 222-identical-alerts
incident.

Consequence: the `espn_health_status` key under `competition = 'global'` in
`competition_config` is **frozen at whatever the job last wrote**. Do not read it
during an incident and do not trust it. It is a fossil, not a status.

---

## Procedure

### 1. Verify it's real (don't act on one alert)

**Check `net._http_response` first.** This is the single most useful diagnostic
and the one the incident history keeps pointing at: `pg_cron` reports "succeeded"
whenever `net.http_post` merely *queues* a request, so green cron proves nothing.
The response table is where the truth lives.

```sql
SELECT created, status_code, left(content, 300)
FROM net._http_response
ORDER BY created DESC LIMIT 20;
```

Then hit ESPN directly (browser or `curl`) and eyeball whether scores and game
state look correct. **Use the live hosts:**

| Purpose | Host / URL |
|---|---|
| Live scores — what `nfl-update-scores` polls | `https://cdn.espn.com/core/nfl/scoreboard?xhr=1` |
| Schedule import — what `nfl-import-schedule` targets | `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=&week=&dates=` |

> **Never diagnose against `site.api.espn.com`.** Akamai hard-403s it from both
> Supabase networks (the Edge runtime *and* `net.http_get` from Postgres) —
> re-verified 2026-08-25. It will look "down" from a server and fine from your
> laptop, which is exactly the false signal that wasted the Aug 21 window.
> Two more traps on the live hosts: do **not** add `&seasontype=1` to the
> `cdn.espn.com` URL (returns an empty body), and expect `site.web.api` to
> tarpit bursts with empty `202`s — space your attempts.
>
> Note: `nfl-import-schedule` on `main` today (v28) still calls the blocked
> `site.api.espn.com` host. The move to `site.web.api` is v29, on branch
> `fix/week-prep-hardening` and not yet merged or deployed. The diagnostic host
> above is correct either way — it is the one that answers.

Decide: **transient blip** (recovered, or one slow response) → no action, keep
watching. **Sustained, or clearly-wrong data during a live window** → pull the
brake (step 2).

### 2. Pull the brake — set `scoring_locked = true` on the affected competition

In the **Supabase dashboard → SQL editor** (runs with full rights; no deploy,
no app release needed), for the live competition (e.g. `nfl_2026`):

```sql
UPDATE competition_config
SET value = 'true'
WHERE competition = 'nfl_2026'
  AND key = 'scoring_locked';
```

This takes effect on the **next** scheduled scoring run — within ~5 minutes for
live game-day updates. The cron jobs still fire; they read `scoring_locked` and
**return early**, so no further scores are written while it's set. Nothing is
lost; computation is deferred.

### 3. Confirm the brake is set

```sql
SELECT competition, key, value
FROM competition_config
WHERE competition = 'nfl_2026' AND key = 'scoring_locked';
```

Expect `value = 'true'`. From this point, scoring is paused for that
competition.

### 4. Wait for ESPN to recover

> **The brake silences the watchdog.** `run_pipeline_watchdog()` treats
> `scoring_locked = true` as "not stale" — an intentional pause is not an
> incident. Two consequences, both of which will mislead you if you don't expect
> them:
>
> 1. **You will likely get a `[RECOVERED]` email within 5 minutes of locking**,
>    because the watchdog sees the competition flip out of the stale state. That
>    email means *the brake is on*, not *ESPN is fine*. Ignore it.
> 2. **While locked, watchdog silence proves nothing.** It is not watching.
>
> So recovery must be verified by hand, against ESPN directly.

- Re-run the step 1 diagnostics: `net._http_response` for clean `200`s, and the
  live ESPN URL for correct scores and game state.
- Do not unlock on the first green blink — give it a few minutes of stable,
  correct data.
- Do **not** wait on `espn_health_status`; it is frozen (see *Retired* above).

### 5. Release the brake — set `scoring_locked = false`

```sql
UPDATE competition_config
SET value = 'false'
WHERE competition = 'nfl_2026'
  AND key = 'scoring_locked';
```

The next scheduled run resumes and computes from current (now-correct) game
states. Confirm scores update correctly in-app over the next cycle. The watchdog
resumes monitoring on its next tick, so if you unlocked too early you will hear
about it within ~5 minutes.

### 6. If bad scores were written *before* you locked

Locking stops further damage; it does **not** auto-revert scores already
written from bad data. If miscomputed scores landed before the brake:

- Keep `scoring_locked = true` until remediated.
- Treat the recompute as a separate, deliberate action — re-run the scoring
  function for the affected week against corrected data and verify against
  `season_user_totals`. Do not improvise this under pressure during a live
  window; if unsure, leave it locked and get a second set of eyes.

---

## What `scoring_locked` does and doesn't do

- **Does:** instantly pause scoring **computation** for that competition, with
  no deployment. Cron jobs still run but exit early.
- **Does:** suppress pipeline-watchdog staleness alerts for that competition
  (see step 4).
- **Doesn't:** stop schedule import, odds, ranking, the app itself, or
  Realtime. It is a scoring-compute brake only.
- **Scope:** per competition. Lock the competition that's affected
  (`nfl_2026`), not `global`.

---

## Do NOT

- **Do not wire ESPN health to auto-set `scoring_locked`.** Manual only — see
  the operating principle above.
- **Do not** leave `scoring_locked = true` after recovery — scores stop
  accruing for that competition until it's cleared, and the watchdog stays blind
  the whole time.
- **Do not** edit scores by hand in the dashboard to "fix" bad data — use the
  scoring function's recompute path so the math stays server-authoritative.
- **Do not** treat a single alert as confirmation — verify against live ESPN
  data first.
- **Do not** diagnose against `site.api.espn.com` — Akamai-blocked from both
  Supabase networks; it lies.
- **Do not** read `espn_health_status` — the job that wrote it is retired and
  the value is frozen.
- **Do not** trust `pg_cron` "succeeded" as evidence the pipeline is alive —
  `net.http_post` only queues. Read `net._http_response`.

---

## Quick reference

| Thing | Where |
|---|---|
| Pipeline watchdog (detection) | `run_pipeline_watchdog()` — cron job 97, `3-59/5 * * * *` (every 5 min at :03) |
| Staleness threshold | `competition_config` global key `watchdog_stale_minutes` (currently 15) |
| Alert delivery | `ops-alert` Edge Function → Resend → global key `ops_alert_email` (currently admin@hotpicksports.com) |
| Alert audit trail | `system_logs`, `event_type = 'pipeline_watchdog'` |
| Watchdog state | `pipeline_watchdog_state` table (one row per monitored competition) |
| First diagnostic | `SELECT created, status_code, left(content,300) FROM net._http_response ORDER BY created DESC LIMIT 20;` |
| The brake | `competition_config` key `scoring_locked` (per competition) |
| Where to set the brake | Supabase dashboard → SQL editor (no deploy) |
| Live score poller | `nfl-update-scores` (`*/5 * * * *`) — host `cdn.espn.com/core/nfl/scoreboard?xhr=1` |
| Score computation | `nfl-calculate-scores` (`2-59/5 * * * *` — every 5 min at :02) |
| Schedule importer | `nfl-import-schedule` — host `site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` |
| Blocked host — never use | `site.api.espn.com` (Akamai 403 from both Supabase networks) |
| Retired monitor | `espn-health-check` — cron job 70, `active := false` since 2026-08-22. Never fires. |
| Frozen config value | `espn_health_status` (global) — last write by the retired job; do not trust |

### Pending merge — week-prep watchdog

Landing on branch `fix/week-prep-hardening` (commit `115e33f`), **not yet merged
or deployed.** Promote these rows into the table above once it merges.

| Thing | Where |
|---|---|
| Week-prep watchdog | `run_week_prep_watchdog()` — cron `week-prep-watchdog`, `0 18,22 * * 2` (Tuesdays 18:00 and 22:00 UTC) |
| What it alerts on | The week the Tuesday prep chain targets is not prep-ready (games / odds / ranks). Transition-only email via the same `ops-alert` → Resend → `ops_alert_email` path. |
| Audit trail | `system_logs`, `event_type = 'week_prep_watchdog'` |
| Dry run | `SELECT run_week_prep_watchdog(true);` — reports the verdict and whether it *would* email, without sending or logging |
