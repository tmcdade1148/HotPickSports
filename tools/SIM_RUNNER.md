# Season Simulator — Node runner (`sim-runner.mjs`)

Protected-environment replacement for `season-simulator-v4.html`.

## Why the browser tool stopped working

The HTML simulator drove the sandbox by doing **service-role REST writes straight
from the browser**. Supabase's new API keys (`sb_secret_…`) are **hard-blocked in
browsers** — the gateway returns:

> `401 Forbidden use of secret API key in browser. Secret API keys can only be
> used in a protected environment and should never be used in a browser.`

There's no header workaround: it's keyed off the `sb_secret_` prefix + a browser
origin. So the secret key can only be used from a **protected environment** — a
server, an Edge Function, or a local script like this one. This runner does the
same operations from Node, where the secret key is allowed.

## Secrets — never put them in a file

Both secrets are read from the **environment** and are never written to disk or
committed:

| Env var | Needed for | Value |
|---|---|---|
| `SB_SECRET_KEY` | everything | the `sb_secret_…` key (Dashboard → API Keys → Secret keys) |
| `CRON_SHARED_SECRET` | scoring commands only | the `x-cron-secret` value = Vault `cron_shared_secret` |

`CRON_SHARED_SECRET` is required only for commands that run scoring
(`run-week`, `run-season`, `finalize`, `end-week`, `reset-reviewer-week`),
because scoring goes through the cron-gated `nfl-calculate-scores` Edge Function.

Export them for the shell session (not in any tracked file, not in `.env`):

```bash
export SB_SECRET_KEY='sb_secret_…'
export CRON_SHARED_SECRET='…64-hex…'
node tools/sim-runner.mjs status
```

When you're done, `unset SB_SECRET_KEY CRON_SHARED_SECRET` (or just close the shell).

## Target competition

Defaults to the `nfl_2025_sim` sandbox (source `nfl_2025`, season 2025) — the same
defaults the HTML used. Override per command with env vars:

```bash
SIM_COMPETITION=nfl_2025_simA node tools/sim-runner.mjs status   # Apple reviewer sandbox
```

`SIM_SOURCE`, `SIM_SEASON`, `SIM_POOL_ID`, `SIM_REVIEWER_ID`, `SIM_TESTER_ID` are
also overridable.

## Commands

```
status                         Show config + current-week game status
run-week [week] [--tester]     Full week: reset → open(seed) → waves → score → complete
run-season [from] [to] [-t]    Step weeks from..to (default current..22)   [needs --yes]
open-picks [week] [--tester]   Open picks + seed fake (and tester) picks
kickoff <wave> [week]          Kick off a wave (thursday|sunday1|sunday4|snf|mnf)
finalize <wave> [week]         Finalize a wave from source + partial score
end-week [week]                Force all FINAL + full score + settling
complete-week [week]           week_state → complete
next-week [week]               Advance to next week (carries phase)
jump <week> [--tester]         Teleport to a week (resets THAT week only)   [needs --yes]
seed-picks [week] [--tester]   Seed fake (and tester) picks for a week
set-phase <PHASE> [ws] [open]  Set current_phase only (ws default idle, open default false)
scoring-lock <on|off>          Flip the scoring_locked emergency brake
reset-reviewer-week [week]     Clear reviewer's week + rescore               [needs --yes]
reset-to-week8                 App Review submission state (Week 8 picks_open) [needs --yes]
reset-to-start                 Full wipe → Week 1 picks_open                 [needs --yes]
reset-to-preseason             Full wipe → PRE_SEASON / idle (no picks)      [needs --yes]
refreeze                       reset_reviewer_sim() RPC (simA/simG only)     [needs --yes]
```

`--tester` also seeds the human test account's picks (so the HotPick module shows
on its home screen). `--yes` confirms destructive (multi-week wipe / jump /
reviewer) commands.

## Typical flows

```bash
# Where am I?
node tools/sim-runner.mjs status

# Step the current week through its whole lifecycle, with my test account picking too
node tools/sim-runner.mjs run-week --tester

# Run from the current week to the end of the season
node tools/sim-runner.mjs run-season --yes --tester

# Land back on the App Review submission state before submitting
node tools/sim-runner.mjs reset-to-week8 --yes

# QC the new-download / preseason experience (also: test the Odds API in preseason)
node tools/sim-runner.mjs reset-to-preseason --yes
```

## Differences vs the HTML tool

Behavior-equivalent for all DB mutations. Omitted (browser/Realtime presentation
only, not needed for stepping): the live in-game score *ticker* and the app
*heartbeat* sync (fixed pacing instead). Scoring still runs through the real
`nfl-calculate-scores` Edge Function, so results match production exactly.
