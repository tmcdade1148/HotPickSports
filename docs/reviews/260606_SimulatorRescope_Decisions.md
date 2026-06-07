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

## How the sandbox is advanced today (investigated 2026-06-07)

- **No `pg_cron` job invokes `season-simulator`** — all 14 scheduled jobs are the
  production pipeline; none call the simulator.
- **No app/client code invokes it** — the only repo reference is its own source.
- Conclusion: **manual/ad-hoc human invocation only.** No automated/service-role
  advance process exists.

### Super-admin gate implication
Because invocation is manual, the JWT super-admin gate **can stay** — there is no
cron/service-role caller it would lock out. **One operational wrinkle:** the gate
resolves identity from the caller's JWT, so a manual call must carry a **signed-in
super-admin access token**, *not* the service-role key. If current manual ops curl
the function with the service-role key, that path will now return `UNAUTHENTICATED`.

Options if the user-JWT requirement is inconvenient:
- **A (default):** keep as-is; invoke with a super-admin access token.
- **B (fallback):** accept a `SIMULATOR_ADMIN_SECRET` header as an alternative to
  the JWT (the allowlist already prevents prod harm). Add only if A proves annoying.

> Decision pending Tom's confirmation of the preferred manual-invocation method.

## Verification still required (Tom-owned, per spec §7)
Preview deploy, then prove: `nfl_2026` → `REFUSED` + writes nothing · no target →
`MISSING_TARGET` · `nfl_2025_sim` `run_week` advances · `setup`/`cleanup` without
confirm → `CONFIRM_REQUIRED` · `setup`/`cleanup` *with* confirm but real testers
present → `SANDBOX_HAS_REAL_TESTERS` · non-super-admin → rejected · `nfl_2026`
`current_week`/`week_state` unchanged across all of the above.

---
*260606 · Simulator Re-Scope decisions · HotPick Sports — Confidential*
