# HotPick Sports — Runbook: ESPN Data Degradation

**Type:** Operational runbook (not a code change)
**Owner:** Super-admin / operator (Tom)
**Repo location:** `docs/ESPN_DEGRADATION_RUNBOOK.md`
**Last updated:** June 11, 2026

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

**Scoring is never auto-halted on a health-check signal. The operator pulls the
brake.**

`espn-health-check` runs hourly and alerts super-admins on `degraded`/`down`,
but it does **not** set `scoring_locked`. This is deliberate: a transient ESPN
blip (a slow response, a brief 5xx) is common and recovers on its own. Auto-
halting legitimate scoring on a false positive — during a live week, with users
watching — is worse than the brief, controlled pause an operator applies after a
10-second look. A human confirms it's real before stopping the engine.

The cost of this choice: detection-to-action depends on the operator seeing the
alert. That is the right trade for an 18-week season; the alternative risks
self-inflicted outages.

---

## How you'll know (detection)

- A `notification_queue` alert fires to all super-admins when
  `espn-health-check` flags `degraded` or `down`.
- The `espn_health_status` key under `competition = 'global'` in
  `competition_config` shows the current status.
- Secondary signals: scores visibly wrong/frozen in-app during a live game, or
  user reports of stuck HotPick cards.

A single alert is not proof — ESPN may already have recovered. **Verify first.**

---

## Procedure

### 1. Verify it's real (don't act on one alert)

- Check `espn_health_status` (`competition = 'global'`) — still degraded, or
  recovered?
- Hit the ESPN scoreboard for the current games directly (browser or the same
  endpoint the poller uses) and eyeball whether scores/state look correct.
- Decide: **transient blip** (recovered, or one slow response) → no action,
  keep watching. **Sustained or clearly-wrong data during a live window** →
  pull the brake (step 2).

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

- Watch `espn_health_status` return to healthy, and confirm the live ESPN data
  looks correct again.
- Do not unlock on the first green blink — give it a few minutes of stable,
  correct data.

### 5. Release the brake — set `scoring_locked = false`

```sql
UPDATE competition_config
SET value = 'false'
WHERE competition = 'nfl_2026'
  AND key = 'scoring_locked';
```

The next scheduled run resumes and computes from current (now-correct) game
states. Confirm scores update correctly in-app over the next cycle.

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
- **Doesn't:** stop schedule import, odds, ranking, the app itself, or
  Realtime. It is a scoring-compute brake only.
- **Scope:** per competition. Lock the competition that's affected
  (`nfl_2026`), not `global`.

---

## Do NOT

- **Do not wire ESPN health to auto-set `scoring_locked`.** Manual only — see
  the operating principle above.
- **Do not** leave `scoring_locked = true` after recovery — scores stop
  accruing for that competition until it's cleared.
- **Do not** edit scores by hand in the dashboard to "fix" bad data — use the
  scoring function's recompute path so the math stays server-authoritative.
- **Do not** treat a single health alert as confirmation — verify against live
  ESPN data first.

---

## Quick reference

| Thing | Where |
|---|---|
| Health monitor | `espn-health-check` Edge Function (cron hourly at :17) |
| Health status value | `competition_config` key `espn_health_status` (`competition = 'global'`) |
| The brake | `competition_config` key `scoring_locked` (per competition) |
| Live score poller | `nfl-update-scores` (every 5 min on game days) |
| Score computation | `nfl-calculate-scores` (every 30 min) |
| Where to set the brake | Supabase dashboard → SQL editor (no deploy) |
