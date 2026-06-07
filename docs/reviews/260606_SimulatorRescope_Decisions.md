# Simulator Re-Scope — Locked Decisions & Follow-ups

Companion to `supabase/functions/season-simulator/index.ts` (branch
`fix/simulator-rescope`) and `260606_HotPick_SimulatorRescope_Spec`. Records
Tom's review decisions so they travel with the code. **Draft — not yet deployed;
supervised preview deploy + §7 verification is the next (Tom-owned) step.**

## Locked decisions (Tom, 2026-06-07)

1. **Never fabricate over real testers.** The testers' real picks are the
   valuable signal (the actual proof the experience works). Fabrication is now a
   positive rule: it runs **only** on a purely-synthetic sandbox. If any real
   (non-sim) picks/totals exist for the target, `runWeek` skips fabrication and
   logs it. → `hasRealTesters()` gate in `runWeek` Step 3.

2. **Cleanup/setup must never disrupt the live tester sandbox.** Both refuse with
   `SANDBOX_HAS_REAL_TESTERS` (HTTP 409) when real testers/progress are present —
   **even with `confirm_destructive: true`**. We do not wipe/reset the live tester
   sandbox during the testing period at all. If a clean sandbox is ever needed,
   that is a separate, deliberate, **backed-up** operation, not a tool call.
   → guards at the top of `setup()` and `cleanup()`.
   - *Detection:* presence of non-`sim-%` rows in `season_picks` **or**
     `season_user_totals` for the competition. (Pool-membership-only, no progress,
     is intentionally not counted — could be tightened later if desired.)

3. **Keep the inline scorer sandbox-only and labeled. Do NOT converge now.**
   `runWeek` still scores via the simulator's own scorer; it's clearly marked as a
   divergent, sandbox-only path. Convergence onto the canonical engine is the
   September shadow-run work (follow-up b).

## Deferred follow-ups (logged, not now)

- **(a) Data-layer guard.** A trigger that refuses simulator-signature writes
  (`sim-%` users, `description='Set by season-simulator'`, etc.) against any
  non-sandbox competition — layered *under* the in-code allowlist so the
  protection isn't re-implemented per tool. Sandbox list lives inside the SQL
  function (same "reviewed deploy to widen" property as the code allowlist), not a
  soft `is_sandbox` boolean.
- **(b) Simulator ↔ real-engine convergence.** Retire the simulator's divergent
  state-writes + inline scorer in favor of the real engine
  (`admin_advance_week` + the games-status trigger + canonical scorers), with the
  simulator reduced to a pick/fast-forward helper. Tied to the **September shadow
  run** (`nfl_2026_sim` running the real pipeline).

## Allowlist — three sandboxes (corrected 2026-06-07)

The simulator drives **three** sandboxes, all on the allowlist:
`nfl_2025_sim` (testers), `nfl_2025_simA` (Apple review), `nfl_2025_simG` (Google
review). A single-entry allowlist would `REFUSE` the reviewer sandboxes and could
**freeze an in-progress App Review** — so all three are included. `season_year` is
read per-competition, so each sandbox is handled correctly.

## Auth: super-admin gate DROPPED → optional shared secret (decided 2026-06-07)

**How the sandbox is advanced (confirmed by Tom):** manually, through the
`season-simulator` **HTML tool**, which authenticates with the **service-role
key** — there is **no user login / JWT**. (Corroborated: no `pg_cron` job and no
app/client code invokes the simulator.)

Therefore the JWT super-admin gate as originally drafted would have rejected the
tool and **locked Tom out of advancing the sandboxes.** Decision: **drop the
super-admin/JWT gate.** The allowlist (gate 1) is what prevents production harm —
that was always the point — and destructive-confirm (gate 3) protects the testers.

In its place, an **optional shared-secret** gate: if `SIMULATOR_ADMIN_SECRET` is
configured, the call must send a matching `x-simulator-secret` header; if it is not
set, the allowlist + destructive-confirm stand alone (non-breaking default). This
is a service-role-appropriate lock — not a user-identity check.

> **The two protections that matter — allowlist + destructive-confirm — are kept.**
> To enable the extra lock: set `SIMULATOR_ADMIN_SECRET` (all envs) and have the
> HTML tool send the `x-simulator-secret` header.

## Verification still required (Tom-owned, per spec §7)
Preview deploy, then prove:
- `nfl_2026` → `REFUSED` + writes nothing
- no target → `MISSING_TARGET`
- **all three sandboxes** (`nfl_2025_sim`, `nfl_2025_simA`, `nfl_2025_simG`)
  `run_week` advances normally (reviewer sandboxes NOT frozen)
- `setup`/`cleanup` without confirm → `CONFIRM_REQUIRED`
- `setup`/`cleanup` *with* confirm but real testers present →
  `SANDBOX_HAS_REAL_TESTERS`
- if `SIMULATOR_ADMIN_SECRET` is set: missing/wrong `x-simulator-secret` →
  `BAD_SECRET`; correct secret passes
- `nfl_2026` `current_week`/`week_state` unchanged across all of the above

(The original "non-super-admin → rejected" check is removed — the super-admin gate
was dropped; see Auth section.)

---
*260606 · Simulator Re-Scope decisions · HotPick Sports — Confidential*
