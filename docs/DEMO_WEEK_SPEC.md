# Demo Week — Interactive Onboarding Spec

**Status:** Draft for review (2026-06-01)
**Build target:** Before NFL Season 2 launch (Sept 2026)
**Author:** Claude session `claude/sweet-wright-cCUZa`

---

## 1. Purpose

The preseason window serves two unrelated needs. This spec covers the **first**; the
second is scoped here only enough to keep the two from colliding.

1. **New-user demo (this spec).** A brand-new user, during the off-cycle/preseason
   window, can play one self-contained "what a regular-season week feels like" loop:
   make picks → designate a HotPick → submit → see a scored week + a populated Ladder →
   get pushed toward creating their own Contest. Conversion surface, not a live competition.

2. **Internal preseason dogfooding (separate, §10).** The team exercises the *real*
   `nfl_2026` PRE_SEASON machinery (picks → lock → live → settle → week transition → the
   Sept 1 purge → REGULAR flip) to catch breakage in August, not Week 1. Gated to
   dev-flagged testers via the existing beta allowlist.

The earlier plan — live preseason practice picks for **all** users on `nfl_2026` — is
**abandoned**. It was the source of the Sept 1 purge risk (mass practice picks polluting
real season totals, Hard Rule #22). Splitting into a sandbox demo + a gated internal test
dissolves that: no public user ever writes a preseason pick on `nfl_2026`.

---

## 2. Decisions locked (2026-06-01 product call)

| Decision | Choice |
|---|---|
| Demo interactivity | **Interactive sandbox** — real Picks UI, user picks + HotPick, submit, scored reveal |
| Demo data source | **Fresh `nfl_demo` sandbox competition** (not a replay of `nfl_2025_sim`) |
| Ladder opponents | **Seed ~8–10 demo Players** so the Ladder lands the user mid-pack on a lively board |
| Exit CTA | **Create a Contest** (Gaffer funnel) |
| Internal preseason gate | **Dev-flag testers** (beta allowlist), not super-admin-only |
| Build order | **Demo first**, internal preseason path after |
| `nfl_demo` registration (was O-5) | **Not in the registry** — entered purely via the demo RPC + explicit store set; never a switcher event card |
| Demo outcome tone (was O-6) | **Clearly positive, but still show the swing** — seed winners so a sensible pick set lands clearly net-positive while the HotPick swing is visible |

---

## 3. Guardrail-driven constraints

These shape the design; none may be violated.

- **No new tables (Hard Rule #1).** `nfl_demo` is rows in existing template tables
  (`competition_config`, `season_games`, `season_picks`, `season_user_totals`, `pools`,
  `pool_members`, `profiles`) keyed by `competition = 'nfl_demo'`. No demo-specific table.
- **No client-side scoring (Hard Rule #3).** The scored reveal must be produced
  server-side. There is currently **no client-invokable simulator** and **zero
  `functions.invoke` scoring calls** in the app — scoring is cron/server-driven. The demo
  introduces one small **sandbox-scoped Edge Function** to settle on demand (§6).
- **No `pool_id` on picks/scores (Hard Rule #2).** Demo picks and totals are user-scoped,
  exactly like production. The demo pool is a lens, not an owner.
- **Sandbox audit exemption (Hard Rule #17).** Demo settle/reset operate only on the
  `nfl_demo` sandbox competition, so they are exempt from `admin_audit_log`.
- **Lexicon (Hard Rule, REFERENCE §22).** All user-facing copy uses `@shared/lexicon`
  ("Contest", "Player", "the Ladder", "the Gaffer", "Picks", "HotPick"). No hardcoded nouns.
- **Theming (Hard Rules #9/#25).** Demo surfaces stay HotPick-themed; `useTheme()` only.

---

## 4. Concurrency model — the central design decision

Many new users may run the demo at the same time. The naive approach — flip the shared
`nfl_demo` game rows to FINAL on submit, score, then reset to `scheduled` on the next
user's entry — has every concurrent demo user stomping the same rows. **Rejected.**

**Adopted: immutable demo game rows with a predetermined result.**

- `nfl_demo` `season_games` rows are seeded **once** and **never mutated** by the demo flow.
  They sit permanently at `status = 'scheduled'` so the `enforce_pick_lock` trigger always
  allows picks, and they carry their final outcome in dedicated result columns the trigger
  ignores (see §5).
- "Settling" a demo run is **purely per-user**: the server compares *this user's* picks
  against the seeded winners and writes *this user's* `season_user_totals` row. No shared
  state mutates → no concurrency hazard, no reset-on-entry race.
- **Reset = delete this user's own `nfl_demo` `season_picks` + `season_user_totals` rows.**
  Scoped to `auth.uid()`. Never touches game rows or other users. Sandbox-only delete,
  permitted under Hard Rule #17.

Because the shared game rows never flip to FINAL, the scored reveal is a **purpose-built
result screen** (§7), not the standard Picks-screen "all games final" rendering — which is
better UX for a guided demo anyway.

---

## 5. Seed data (`nfl_demo`)

Delivered as a single idempotent migration (`apply_migration`, not `execute_sql` — it
writes RLS-protected rows; CLAUDE.md). All inserts `ON CONFLICT DO NOTHING`.

### 5.1 `competition_config` (competition = `nfl_demo`)

```
template        = 'season'
sport           = 'nfl'
current_phase   = 'REGULAR'          -- so the Picks UI + week machinery treat it normally
current_week    = 1
week_state      = 'picks_open'        -- never advances; demo is per-user, server-settled
season_year     = 2026
is_active        = true
scoring_locked  = false               -- always seed (CLAUDE.md)
playoff_start_week = 19
data_provider   = 'demo'
is_demo         = true                -- demo marker (new config key, with description)
```

Every key inserted with a `description` (CLAUDE.md).

### 5.2 `season_games` (one curated week, ~16 games)

- `status = 'scheduled'` permanently.
- `frozen_rank` 1–16 set (so the HotPick ranking UX is real).
- Kickoffs spread across the usual waves (Thu/Sun1/Sun4/SNF/MNF) so `groupGamesByWave`
  renders familiar section headers.
- **Predetermined result** stored in result columns that `enforce_pick_lock` does NOT
  read. Reuse existing finalize columns if present (`home_score`, `away_score`,
  `winning_team`); the trigger keys off `status`, so populated scores on a `scheduled` row
  are inert to it. **Open item O-1** confirms the exact column the scoring path reads as
  "winner" vs. what the lock trigger reads — verify against `enforce_pick_lock` and
  `nfl-calculate-scores` before seeding so we don't trip the lock or mis-score.

### 5.3 Demo Players (the Ladder)

- ~8–10 seeded `profiles` rows flagged `is_demo = true` (new nullable column, or a reserved
  email domain like `@demo.hotpick.local` — **Open item O-2**). Realistic `poolie_name`s +
  system avatars.
- Pre-baked `season_picks` (so their HotPick shows on the Week Ladder) **and** pre-baked
  `season_user_totals` (week_points spread so the live user lands mid-pack, ~5th of ~10).
  These are static — never re-scored.

### 5.4 Demo pool

- One `pools` row, `competition = 'nfl_demo'`, name e.g. "The Demo Contest",
  `is_hidden_from_users = true` (so it never appears in real pool lists / RLS-hidden per
  PR #184/#308920), `organizer_id` = a system/demo account.
- The ~8–10 demo Players are `pool_members` (`status = 'active'`).
- The **live user is added on demo entry** (`enter_demo` RPC, §6) and removed/left on exit
  or reset, so the demo pool membership doesn't leak into their real "Contests" count.

---

## 6. Server surface (RPCs + one Edge Function)

All `SECURITY DEFINER`, sandbox-scoped to `competition = 'nfl_demo'`.

| Surface | Type | Responsibility |
|---|---|---|
| `enter_demo()` | RPC | Idempotent: reset caller's `nfl_demo` picks/totals, ensure caller is an active member of the demo pool, return `{pool_id, competition}`. |
| `reset_demo()` | RPC | Delete caller's `nfl_demo` `season_picks` + `season_user_totals`. (Folded into `enter_demo` on re-entry; exposed separately for a "Try again" button.) |
| `demo-settle` | Edge Function | On submit: read caller's `nfl_demo` picks, compare to seeded winners, compute points server-side (reusing the scoring logic from `nfl-calculate-scores` — extract to a shared module if not already), write the caller's `season_user_totals` row. Returns the scored summary. |

**Why an Edge Function for settle and not an RPC:** scoring logic lives in
`nfl-calculate-scores` (Edge Function). Duplicating the +1/−rank/HotPick math in PL/pgSQL
would fork the scoring rules — a correctness risk. `demo-settle` should import/share the
exact same scoring routine so the demo reflects the real engine. The function is committed
to git before deploy (Deployment Rules) and is sandbox-scoped.

> **Refactor note:** if `nfl-calculate-scores` scoring is not already a pure, importable
> function, factor it into `supabase/functions/_shared/scoring.ts` first so both the cron
> scorer and `demo-settle` call one implementation. (Open item O-3.)

---

## 7. Client flow

### 7.1 Entry point

The off-cycle home (`OffCycleActions.tsx`) is the hook. Today `PreSeasonActions`'s
"Make your picks" → `navigation.navigate('PicksTab')` is exactly the path that hits the
infinite spinner (un-initialized `seasonStore` + `PRE_SEASON` gate in
`SeasonPicksScreen.tsx:273`). We retarget it.

- **Off-season + preseason, for non-internal users:** the middle action becomes
  **"See how it works" / "Try a demo week"** (orange-outline tier, `Play` icon). It calls
  `enter_demo()`, sets the active competition/pool to the demo, and navigates into the
  demo Picks flow.
- Internal (dev-flag) testers additionally see the real preseason path (§10).

### 7.2 The loop

1. `enter_demo()` → active competition `nfl_demo`, active pool = demo pool, caller's prior
   demo run reset.
2. `seasonStore.initialize(nflDemoConfig, demoPoolId)` is called **on entry** (not relying
   on `SeasonTabNavigator`). Config loads → no spinner.
3. Standard `SeasonPicksScreen` renders the ~16 demo games. Because `current_phase=REGULAR`
   and `week_state=picks_open`, the `PRE_SEASON` gate and `picksAreOpen` logic both behave
   normally. **No `SeasonPicksScreen` changes required for the demo path.**
4. User makes picks + 1 HotPick, taps Submit (the hoisted `SubmitPicksBarSlot`).
5. Submit invokes `demo-settle` instead of the normal "just save" path — **Open item O-4**:
   either branch the submit handler on `config.competition === 'nfl_demo'`, or have a demo
   wrapper screen own the submit. Prefer a thin branch in the submit hook so we reuse the
   real button states.
6. On success → navigate to the **Demo Result screen**.

### 7.3 Demo Result screen (new component)

- Headline: scored week (e.g. "You scored +14 this week"), reusing the real score widget
  styling from `SeasonPicksScreen`.
- The Ladder: the seeded demo Players + the live user, sorted by week_points, user row
  highlighted ("You finished 5th of 10"). Reuses Ladder row components.
- Primary CTA: **Create a Contest** → `navigation.navigate('CreatePool')` (matches the
  locked exit decision; copy via lexicon).
- Secondary: "Try again" → `reset_demo()` + back to step 2.

### 7.4 Spinner bug — resolved per audience

- **Public users:** never reach the live preseason Picks screen; their CTA routes into the
  demo (`REGULAR`/`picks_open`), so the `PRE_SEASON` gate and the un-initialized store are
  never hit. Bug gone by construction.
- **Internal testers (§10):** get the proper fix — `seasonStore.initialize()` driven from
  the tab navigator entry + phase-aware game filtering. Tracked in §10, not built in Phase 1.

---

## 8. Gating & visibility

- **`nfl_demo` is NOT in the registry** (decided). It is never added to `ALL_EVENTS` /
  `GATED_COMPETITIONS`, so it can never surface as a sport-switcher event card or as one of
  the Home Screen's max-2 event cards (Hard Rule #19). It is reachable **only** through the
  demo entry flow, which sets the active competition/pool explicitly in the store via the
  `enter_demo` RPC. This keeps the leak surface minimal — there is no public list it could
  accidentally appear in.
- The demo pool is `is_hidden_from_users = true` and excluded from `visiblePools` so it
  never shows in the user's real Contest stack or count.

---

## 9. Lexicon & theming compliance

- Copy via `@shared/lexicon`: "Contest", "Player(s)", "the Ladder", "the Gaffer", "Picks",
  "HotPick". Exit CTA uses the existing "Create a Contest" string already in `OffCycleActions`.
- All color/spacing via `useTheme()` / `@shared/theme`. Demo stays HotPick-themed (#25).
- Any new locked strings added to `LEXICON` must be reflected in `__tests__/lexicon.test.ts`.

---

## 10. Internal preseason dogfooding (scoped, build after demo)

Separate workstream, summarized so Phase 1 doesn't foreclose it.

- **Competition:** the real `nfl_2026` (not a sandbox) — fidelity matters for de-risking
  the actual transition + purge.
- **Audience:** dev-flag testers via the existing beta allowlist (`competition_access`,
  `get_visible_competitions`, `admin_add_beta_tester_by_email`, `AdminBetaTestersScreen`).
  Today that screen hardcodes `nfl_2025_sim`; generalize it to a competition picker (the
  screen comment already anticipates this) so testers can be granted preseason access. The
  gate controls **who can make live preseason picks on `nfl_2026`**.
- **Spinner fix (full version):** initialize `seasonStore` from the tab navigator entry
  (not only `SeasonTabNavigator`/`EventDetailScreen`), remove/condition the `PRE_SEASON`
  gate in `SeasonPicksScreen.tsx`, and filter `season_games` by **`(competition, phase)`**
  rather than week alone — the "preseason ≈ playoffs" structural insight (distinct weeks
  0–3 + `phase='PRESEASON'`, mirroring playoffs' weeks 19–22 + WILDCARD/DIVISIONAL). This
  pattern carries forward to Series and Tournament.
- **Scores don't count (Hard Rule #22):** preseason totals must not roll into the season
  total. Verify the scoring/leaderboard phase filter already excludes `phase='PRESEASON'`
  (the `fetchLeaderboard` path filters `phase = 'REGULAR'` for non-playoffs — confirm
  preseason rows are likewise excluded).
- **Purge:** `supabase/migrations/PURGE_PRESEASON_PICKS.sql` still runs before the
  PRE_SEASON → REGULAR flip (~Sept 1). With only internal testers writing preseason picks,
  it becomes a controlled smoke test of the purge itself rather than a high-stakes cleanup.

---

## 11. Build plan (Phase 1 — demo)

1. **Seed migration** — `nfl_demo` config + games (with results) + demo Players + demo pool
   + memberships. Resolve O-1, O-2 first.
2. **Server surface** — `enter_demo` / `reset_demo` RPCs; `demo-settle` Edge Function
   (after O-3 scoring-extraction decision).
3. **Demo config object** — a `SeasonConfig` for `nfl_demo` derived from `nflSeason`, held
   privately for the demo flow and **not** added to the registry (§8).
4. **Entry wiring** — retarget `OffCycleActions` middle button to the demo for non-internal
   users; `enter_demo()` + store init on press.
5. **Submit branch** — demo submit calls `demo-settle` (O-4).
6. **Demo Result screen** — scored summary + Ladder + "Create a Contest" / "Try again".
7. **Verify** — run the full loop on simulator; confirm no spinner, correct scoring,
   populated Ladder, no demo leakage into real Contest lists, concurrency-safe (two users
   at once).

---

## 12. Open items (resolve before/early in build)

- **O-1** Exact `season_games` column the scoring path treats as the winner vs. what
  `enforce_pick_lock` reads — confirm a `scheduled` row with a populated result scores
  correctly without tripping the lock.
- **O-2** How to flag demo Players: `profiles.is_demo` column vs. reserved email domain.
- **O-3** Is `nfl-calculate-scores` scoring already an importable pure function? If not,
  extract to `_shared/scoring.ts` so `demo-settle` and the cron scorer share one impl.
- **O-4** Where the demo submit branch lives — submit hook vs. a demo wrapper screen.

_Resolved: O-5 (not in registry) and O-6 (clearly-positive outcome, swing still visible)
are now decisions — see §2._

---

## 13. Out of scope

- Real public preseason practice picks (abandoned, §1).
- Any change to `nfl_2026` season/preseason data in Phase 1.
- The internal dogfooding workstream (§10) — specced, built after the demo.
- Anything on the "do not build before NFL Season 2 launch" list (REFERENCE §20).
