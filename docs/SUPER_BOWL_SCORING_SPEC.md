# Super Bowl Enhanced Scoring — November 2026 Build Brief

**Status:** Spec / starting point — build November 2026. Not started.
**Owner:** Tom (product).
**Last updated:** 2026-06-02.
**Source of truth for the baseline design:** Season 1 Xcode build `tmcdade1148/NFL2025` (`SuperBowlRowView.swift`, Dec 2025), confirmed by Tom in this session.

> This is a **starting point**, not a frozen spec. The Season 1 design is good but imperfect; Tom expects to revise on the dive-in. Everything below is either (a) confirmed fact about the current codebase, or (b) a flagged open decision.

---

## TL;DR

The Super Bowl is a **single game** scored with a **multi-part pick** that's richer than a regular-season pick. A surprising amount of the plumbing already exists in the Season 2 schema and scoring function — the real gap is that **the scoring Edge Function never reads the Super Bowl pick columns**. The biggest open product decision is how "margin" works (tier-scoring vs. an exact Price-Is-Right tiebreaker), because the live `PlayoffRulesModal` popup and the §3 tie-breaker ladder currently promise something the schema doesn't store.

---

## 1. Confirmed scoring model (Season 1 baseline)

| Pick | Correct | Wrong | Notes |
|---|---|---|---|
| **Game Winner** | **+16** | **−16** | Scored as a HotPick at rank 16. Reuses the existing `±rank` mechanic. |
| **Q1 Leader** (who leads at end of Q1) | **+1** | 0 | No penalty for wrong quarter picks. |
| **Q2 Leader** | **+2** | 0 | |
| **Q3 Leader** | **+3** | 0 | |
| **Margin Tier** (`1–6` / `7–14` / `15+`) | **+8** | **−4** | Bucket, not exact margin. |
| **Score range** | **max +30** | **min −20** | |

**Dropped / not in scope:**
- **HotPick Quarter** — the Season 1 onboarding banner advertised a "choose Q1/Q2/Q3 for extra risk" pick and a +36/−26 range. Tom **dropped this**. There is no separate HotPick-quarter swing. Canonical range is **+30 / −20**.
- **Q4 leader** — none. The game winner covers the full game; quarters stop at Q3.
- **Total-points / over-under prediction** — none in the Season 1 design. (If a total-points element is wanted, it's net-new for November.)

---

## 2. What already exists in the Season 2 codebase

This is the pleasant surprise — most of the data model and phase logic is in place.

### Scoring function (`supabase/functions/nfl-calculate-scores/index.ts`)
- **Phase derived from week number:** `19 = WILDCARD`, `20 = DIVISIONAL`, `21 = CONFERENCE`, `22 = SUPERBOWL`.
- **Playoff scoping already works:** writes `playoff_points = (week >= 19 ? week_points : 0)` to `season_user_totals`. This is the foundation for the playoffs-only competition.
- **HotPick mechanic:** correct = `+effectiveRank` (`×2` if double-down), wrong = `−effectiveRank`, where `effectiveRank = frozen_rank ?? rank ?? 1`. Non-HotPick correct = `BASE_WIN_POINTS`.
- **It does NOT read any `sb_*` column.** No quarter-leader, no margin-tier scoring exists. **This is the core thing to build.**

### `season_games` (already has the quarter data path)
- `q1_home_score`, `q1_away_score`, `q2_home_score`, `q2_away_score`, `q3_home_score`, `q3_away_score`
- `current_period`, `game_clock`, `winner_team`, `home_score`, `away_score`
- So margin = `abs(home_score − away_score)` and quarter winners are derivable. **No schema change needed for the inputs.**

### `season_picks` (the SB pick columns already exist — but note the real names)
- `sb_q1_leader`, `sb_q2_leader`, `sb_q3_leader` (TEXT — team abbr)
- **`sb_margin_tier`** (TEXT — e.g. `"1-6"` / `"7-14"` / `"15+"`)
- ⚠️ These differ from what REFERENCE.md previously claimed (`super_bowl_q1_pick`, `super_bowl_margin_prediction INT`). The **actual** columns are `sb_*`, and **margin is a tier string, not an INT**. REFERENCE.md §"Super Bowl Enhanced Scoring" has been corrected to match.

### `season_user_totals`
- `week_points`, `playoff_points` (nullable), `correct_picks`, `total_picks`, `is_hotpick_correct`, `hotpick_rank`.

### ⚠️ Migration-tracking gap
The `sb_*` columns and `playoff_points` exist in `src/shared/types/database.ts` but **are not present in any file under `supabase/migrations/`** (grep confirms zero matches). They were applied to the remote DB without a tracked migration. **Before building, write a migration that formalizes the current SB schema** so git is the source of truth (CLAUDE.md: "All Edge Functions / schema must be in git"; use `apply_migration`).

---

## 3. Gaps to build (November)

1. **Extend `nfl-calculate-scores` to score the Super Bowl (week 22 / phase SUPERBOWL):**
   - Quarter leaders: compare `sb_q1_leader` vs winner of `q1_home_score`/`q1_away_score` (and Q2, Q3). Award +1/+2/+3, no penalty.
   - Margin tier: compute actual tier from final `home_score`/`away_score`, compare to `sb_margin_tier`. Award +8/−4.
   - Game winner: keep the existing ±16 HotPick path (confirm rank assignment, see §4).
   - These add into `week_points` (and therefore `playoff_points` since week ≥ 19).
2. **Per-pick write-back:** decide whether quarter/margin sub-results are stored per-pick (currently `season_picks.points`/`is_correct` are single values per pick row) or only aggregated into `season_user_totals`. The SB is one game = one `season_picks` row with several sub-fields, so the single `points` field may need a breakdown or a JSON detail column for UI.
3. **Provider ingestion:** confirm `nfl-update-scores` / the ESPN poller actually populates `q1_*…q3_*` scores live. The columns exist; verify the feed fills them. (Regular season never needed them.)
4. **Super Bowl picks UI** (deferred until scoring is solid) — the Season 1 `SuperBowlRowView.swift` is the visual reference, but must be rebuilt to Season 2 theming rules (`useTheme()`/`useBrand()`, lexicon nouns — no hardcoded "orange", no hardcoded strings).
5. **Tie-breaker computation** — the §3 ladder (points → margin → most correct playoff picks → most correct playoff HotPicks → co-champions) has copy live in `PlayoffRulesModal` but **no compute exists**. Build it here.
6. **The two sub-competitions** (see §6).

---

## 4. Open product decisions (resolve on dive-in)

### A. Margin: tier-scoring vs. Price-Is-Right tiebreaker — **most important**
There are two conflicting notions of "margin" live right now:
- **Schema reality:** `sb_margin_tier` (string bucket) → Season 1 tier scoring (+8/−4). This is a *scoring element*.
- **Live copy:** `PlayoffRulesModal` + the §3 tie-breaker ladder say "Super Bowl margin — closest to the final margin **without going over** (Price Is Right)." That implies an **exact** integer prediction, which **the schema does not store**.

You can't do true Price-Is-Right with only a tier. Pick one:
- (i) **Tier only** — margin is just a scoring element; change the popup/ladder copy to "closest margin tier" or drop margin as a tiebreaker.
- (ii) **Add exact margin** — add a new column (e.g. `sb_margin_exact INT`) for the Price-Is-Right tiebreaker, keep the tier for scoring. Most faithful to both the live copy and Season 1.
- (iii) **Replace tier with exact** — single exact-margin pick used for both scoring and tiebreak.
> Until decided, players see the Price-Is-Right copy in the popup — so either the copy or the schema is currently writing a check the other can't cash.

### B. Ranking when the SB week has a single game
The winner pick reuses `±rank` and Season 1 hardcoded rank 16. Confirm how `nfl-rank-games` assigns rank when only one game exists in the week, so the ±16 swing is intentional and not an artifact.

### C. Per-pick storage granularity
One SB game = one `season_picks` row carrying winner + 3 quarter leaders + margin tier. Decide how the sub-scores are persisted for display (single `points` total vs. a detail breakdown the row UI can render, like Season 1's per-quarter +1/+2/+3 display).

### D. Tiebreaker variables
Each SB scoring dimension is a candidate tiebreaker rung: quarter-leader accuracy, margin-tier correctness, exact-margin (if added). Confirm the final ladder ordering once the margin decision (A) lands. Current confirmed ladder (§3): **playoff points → SB margin (Price-Is-Right) → most correct playoff picks → most correct playoff HotPicks → co-champions.**

---

## 5. Architectural guardrails (must respect — from CLAUDE.md / REFERENCE)

- **Scoring is Edge-Function only** — never client-side. Extend `nfl-calculate-scores`.
- **No `pool_id` on scores or picks.** All three competitions (full-season, playoffs-only, SB-only) are **leaderboard scopes** (week-range filters) over the same user-scoped `season_picks` / `season_user_totals`. **No new per-competition tables.**
- **No new tables per sport/event** — extend the template tables with columns/`event_id` rows.
- **`frozen_rank` immutable after lock**; use `COALESCE`.
- **All schema changes via `apply_migration`** and committed to git. Take a manual Supabase backup before the migration.
- **Theming/lexicon:** the rebuilt UI uses `useTheme()`/`useBrand()` and `@shared/lexicon` nouns — no hardcoded colors or user-facing strings (the Season 1 Swift uses literal `.orange`, "Super Bowl", etc. — do not port those).
- **`competition_config`** holds competition state — the SB scoring point values should ideally live there (read, don't hardcode), with descriptions, seeded via `apply_migration`. Decide whether +16/+1/+2/+3/+8/−4 are config keys.

---

## 6. The two sub-competitions (see REFERENCE.md §3 "Planned entry points")

Both are **leaderboard scopes**, not new competitions:

- **Playoffs-only** — user joins at any time to start fresh at **Week 19 (Wild Card)** through the SB. The `playoff_points` column (week ≥ 19) already isolates this. Needs: a join/scope flag + its own champion using the §3 ladder scoped to playoff weeks.
- **Super Bowl-only** — sign-up opens **2 weeks before the SB**; scoped to **week 22 alone**; has its **own distinct winner**, separate from full-season and playoffs-only champions. Margin (Price-Is-Right, if built per §4) is its primary tiebreaker.
- **Open design:** how does a user/pool *declare* which scope it's competing in — pool-level setting, per-user opt-in, or a separate pool created with a scope flag? This determines where the sign-up-window enforcement lives (server-side, Hard Rule #15). Decide at the start of the build. Related prior art: `docs/SISTER_CONTEST_SPINUP_SPEC.md` (spinning up companion pools) and `docs/SISTER_CONTEST...` patterns may inform the entry mechanic.

---

## 7. Suggested build sequence

1. **Backup** (manual Supabase backup) → **write a migration** formalizing the existing `sb_*` columns + `playoff_points` (close the tracking gap), plus any margin column from decision §4A.
2. **Resolve open decisions §4** (especially margin) with Tom before writing scoring logic.
3. **Seed scoring values** into `competition_config` (if going the config route) with descriptions.
4. **Extend `nfl-calculate-scores`** for phase SUPERBOWL: quarter leaders + margin tier, folding into `week_points`/`playoff_points`. Unit-test against the Season 1 examples in `SuperBowlRowView.swift` previews (e.g., final 27–17, KC winner → margin tier `7-14`).
5. **Verify provider ingestion** of `q1_*…q3_*` live scores.
6. **Build the tie-breaker computation** for the §3 ladder (also powers playoffs-only + SB-only champions).
7. **Build the sub-competition scoping** (§6) + sign-up window enforcement (server-side).
8. **Build the SB picks UI** (reference `SuperBowlRowView.swift`, rebuilt to Season 2 theming) — **last**, only after scoring is verified. Follows `development → preview → production` build profiles.

---

## 8. Season 1 reference files

In `tmcdade1148/NFL2025` (private, Swift — outside the default session scope; add the repo to a session to read directly):
- **`SuperBowlRowView.swift`** — authoritative scoring + the pick UI (quarter-leader rows, margin tier buttons, points display). The `actualMarginTier()` helper and the `+8/−4` margin / `+1/+2/+3` quarter logic are the canonical reference.
- **`SuperBowlMarginPicker.swift`** — standalone tier picker. ⚠️ Its caption ("Correct winner + margin = +32 / Wrong = −16") is an **older/abandoned** combined-scoring model — **ignore it**; `SuperBowlRowView` is canonical.
- **`SuperBowlOnboardingBanner.swift`** — user-facing explainer. ⚠️ Advertises the **dropped** HotPick-Quarter pick and the **wrong** +36/−26 range. Useful only as a UI/tone reference, not for scoring.
- The **server-side scoring engine** from Season 1 (not yet retrieved) would be the best reference for edge cases (ties in a quarter, OT, etc.). Pull it from `NFL2025` when building.

---

## 9. Known gap — regular-season contest results archive (NOT BUILT)

*Logged 2026-06 during the playoff/winner-page review. Not blocking; queued for a future build.*

**The gap:** there is no way to look back at a **completed regular-season contest's final standings / champion** once the playoffs start. The live Ladder (`LeaderboardTab`) becomes playoff-scoped at the reset, so the regular-season result is no longer viewable in-app after the bridge passes.

**What already exists (don't re-investigate):**
- Data persists: `season_user_totals` rows with `phase = 'REGULAR'` are retained after the playoff reset.
- `seasonStore.loadRegularSeasonPodium(userId)` computes the pool-scoped top 3 (respects `pool_start_date`).
- The per-pool regular-season winner is announced to Chirps (DB trigger `announce_regular_winners_on_phase`; manual backfill via the `nfl-announce-regular-winners` Edge Function).
- The only UI is the **temporary** `RegularCompleteHero` shown during the `REGULAR_COMPLETE` bridge; its "See final standings" CTA points at the live (playoff-scoped) Ladder — **not** a preserved regular-season snapshot.

**What's missing:**
- A persistent **per-contest historical standings** view (final regular-season Ladder for a given pool), reachable after the playoffs begin — e.g. from the `History` (Awards & Records) screen now surfaced in Settings, or from the contest itself.
- (Related, see §"Season champion" work) no season-end champion archive either; that's downstream of the Super Bowl scoring build above.

**Altitude note:** build this as a leaderboard *scope/snapshot* over the existing user-scoped `season_user_totals` (filter `phase = 'REGULAR'`, `pool_start_date`), consistent with Hard Rules #1–#2 — never a new per-pool results table.
