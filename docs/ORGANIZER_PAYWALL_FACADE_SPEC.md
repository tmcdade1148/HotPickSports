# HotPick Sports — Organizer Tier Cap & Founding Comp (The Facade Paywall)

**Spec version:** v1.1 (corrected against live DB) · supersedes `260616_HotPick_OrganizerPaywallFacade_Spec.docx` v1.0
**Date:** June 16, 2026
**Competition:** `nfl_2026` (active) — logic is template-agnostic (organizer / Contest level)
**Supabase project:** `mzqtrpdiqhopjmxjccwy`
**Author:** Tom McDade · corrections from code+DB review
**Status:** Build-ready. No implementation committed yet — this doc is the buildable artifact.

> **Read first:** `CLAUDE.md` (Hard Rules) and `REFERENCE.md` §3 (`competition_config`), §4 (Subscriptions & Tier Limits), §5 (Pool Model). This spec deliberately *supersedes* REFERENCE.md §4's founding-100 model (see §2).

---

## 0. Changes from v1.0 (why this revision exists)

v1.0 was reviewed against the live `create_pool` / `join_pool_by_invite` RPCs (latest in
`supabase/migrations/20260615180000_superadmin_hidden_member.sql`) and the live database. Three
premises in v1.0 were wrong against reality and are corrected here:

1. **There is no "broken 50-player default" to remove.** The live `pools.member_limit` column
   default is **`10`**, and the RPC already sets `10` (`COALESCE(free_tier_max_members, 10)`) for free
   non-founding pools. The real gap is different — see #2. (Three legacy pools carry a stored
   `member_limit = 50` from an earlier era; they are grandfathered, not the default.)
2. **The actual blocker is the founding short-circuit.** `founding_pools_remaining` is **live at 82**.
   While it is `> 0`, every new non-super-admin pool is created with `member_limit = NULL`
   (**unlimited**) and `is_founding_pool = true`. With an unlimited cap, the wall can *never* fire.
   Retiring this branch (Step 0 in §5a) is the non-negotiable prerequisite, not an optional cleanup.
3. **No subscription tier is consulted, and none exist.** The `subscriptions` table exists but holds
   **0 rows**, and neither RPC reads it. v1.0 §5a's "the organizer's paid subscription tier cap if one
   exists" is dropped — effective cap is the pool's stored `member_limit`.

Also locked in this revision (product decisions, June 16): **grandfather existing founding/over-cap
pools as-is** (never re-cap live pools), and **show the wall on every over-cap action** (server stays
stateless — no per-pool "wall seen" flag).

---

## 1. Purpose and Scope

Make the organizer player cap real and enforced server-side, then put a deliberately money-free
"wall" in front of it. When an organizer would exceed the cap (an 11th Player) or create a
second Contest, the server **permits** the growth (this season) and tells the client to show a wall
displaying the real paid-tier prices. No money is collected in the app this season. The goal is to
condition the expectation that paid is coming ("prime the pump") while maximizing adoption.

**In scope:** real server-side cap, config-driven prices on the wall, a universal founding pass for
the `nfl_2026` competition, single-use cohort comp codes (tracking only).

**Explicitly out of scope:** Stripe / external checkout / IAP / webhooks / reconciliation; Apple
external-payment compliance; tier-specific comp codes; Canada paid eligibility; recurring
subscriptions; pay-the-difference upgrade math; partner billing; standalone playoff / Super Bowl
pricing. All deferred past the September launch.

---

## 2. Locked Decisions

Final. If implementing one appears to require violating a CLAUDE.md Hard Rule, stop and raise it.

| Decision | Answer | Why locked |
|---|---|---|
| Facade paywall, no in-app collection this season | Real cap + visible tier prices + free pass. Stripe deferred. | Removes Apple-compliance + reconciliation risk from the Sept critical path. |
| Free-tier cap is config-driven | Cap from `free_tier_max_members` (10), enforced server-side via the pool's stored `member_limit`. | Hard Rules #14, #15. |
| Founding = free this season only | Scoped to `nfl_2026` (regular season → Super Bowl); ends when the competition completes. | Free-forever would mean top organizers never feel the wall. |
| Comp tied to the whole competition | Scoped to the competition, never a phase. Survives the Week 18 → playoffs reset. | The playoff reset is a leaderboard reset, not a billing reset. |
| Universal pass | Every organizer who hits the wall this season passes through free. | Maximizes adoption; the facade is comp infra, not a real gate, for S2. |
| Unique comp code per organizer | Single-use, entered once at onboarding as a welcome ritual + tracking hook. **Does NOT gate the cap.** | Personal-recruitment touch + clean cohort tracking. |
| Two paywall triggers | (a) a Contest grows past its cap, or (b) a second-or-later Contest is created. | Locked June 2026. |
| **Grandfather existing founding / over-cap pools as-is** | The 11 founding pools (`member_limit = NULL`), the 3 legacy `50`-capped pools, the unlimited pools (one at 53 members), and the `100000` pool are **never re-capped**. Only new growth on capped pools triggers the wall. | Avoids destructive action (Hard Rule #16); doesn't break the test sandbox the day the cap goes live. |
| **Show the wall on every over-cap action** | No per-pool "wall seen" state; the server is stateless and returns the flag each time. | Repetition reinforces priming; keeps the design stateless (no new column/cron). |
| Existing founding mechanism is superseded | Do NOT extend `is_founding_pool` / `founding_pools_remaining`. Retire the create-time branch; **keep the columns/keys** (no DROP). | REFERENCE.md §4 describes a conflicting first-100-free-forever model. |

---

## 3. Architecture Principles

**Reuses:** `competition_config` for all feature state (Hard Rule #14); the existing server-side
`create_pool` / `join_pool_by_invite` enforcement path (modify, don't add a new function);
`organizer_id` (Hard Rule #18); `@shared/lexicon` for every user-facing noun (Contest, Player,
Gaffer, the Ladder — never "pool"/"member" in a string literal).

**New:** config keys (`founding_season_active` + three price keys); one small table `comp_codes`
(cohort tracking only); one SECURITY DEFINER RPC `redeem_comp_code` (single-use redemption at
onboarding).

**Core mechanic:** While `founding_season_active = true`, the server detects the cap being exceeded
(so the client can show the wall) but **permits** the growth and returns a `show_wall` flag — no row
is written; the flag *is* the comp. When the flag is `false` (or the competition completes), the same
action returns `upgrade_required`. Expiry is structural: a new event = a new Contest with no comp, so
no expiry cron is required.

**Hard Rules that apply:** #9 (no hardcoded nouns/colors), #14 (tier limits from config), #15
(creation & join enforcement server-side only), #16 (archive/grandfather, never delete), #18
(`organizer_id`); plus config discipline (every new key carries a `description`; config DML uses
`apply_migration`, never `execute_sql`).

---

## 4. Schema Changes

All config writes and the new table use `apply_migration` (RLS-protected DML; `execute_sql` runs as
anon and is silently blocked). **Take a manual Supabase backup before migrating.**

### 4a. `competition_config` keys

**Verified present (do not re-insert):** `free_tier_max_members = 10`, `free_tier_max_pools = 1`,
`paid_small_max_members = 25`, `paid_medium_max_members = 50`, `paid_large_max_members = null`,
`founding_pools_remaining = 82`.

**Verified ABSENT — add all four** (`value` is `jsonb`; whole-USD prices as strings to match the
existing numeric-as-jsonb pattern):

```sql
INSERT INTO competition_config (competition, key, value, description) VALUES
  ('global','paid_small_price','19',
     'Display price (USD) for the 11-25 player tier. Shown on the wall; not charged this season.'),
  ('global','paid_medium_price','39',
     'Display price (USD) for the 26-50 player tier. Shown on the wall; not charged this season.'),
  ('global','paid_large_price','69',
     'Display price (USD) for the 51+ player tier. Shown on the wall; not charged this season.'),
  ('global','founding_season_active','true',
     'When true, organizers who exceed their cap are passed through free for the competition (the facade founding comp). The wall is still shown for priming. Flip to false to enforce paid tiers.')
ON CONFLICT (competition, key) DO NOTHING;
```

> Trigger A reads `free_tier_max_members`; Trigger B reads `free_tier_max_pools`. Both already exist.

### 4b. `comp_codes` table (cohort tracking only — verified absent)

```sql
CREATE TABLE comp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  label        text,            -- who it was issued to, e.g. 'Founding Gaffer - Dave'
  competition  text NOT NULL DEFAULT 'nfl_2026',
  redeemed_by  uuid REFERENCES profiles(id),
  redeemed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comp_codes ENABLE ROW LEVEL SECURITY;

-- super-admins manage codes; no direct client writes.
-- is_super_admin is a boolean column on profiles (verified) — this pattern is correct.
CREATE POLICY comp_codes_admin_all ON comp_codes
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin));
-- redemption is done through the SECURITY DEFINER RPC below, not a direct UPDATE.
```

`gen_random_uuid()` / `gen_random_bytes()` are the project convention (used by the live RPCs).
`comp_codes` is cross-cutting tracking, not a per-sport/event table — Hard Rule #1 is not implicated.

---

## 5. Server-Side Logic

### 5a. Cap enforcement (modify the EXISTING create / join RPCs — do not create a new function)

**Target:** the latest `create_pool` and `join_pool_by_invite` in
`supabase/migrations/20260615180000_superadmin_hidden_member.sql`. `CREATE OR REPLACE` from the
**current live body** so the super-admin branch (hidden member, forced public + unlimited) and the
public-contest path are preserved — do not rewrite from scratch.

**Enforcement model (stored column, not live config read).** The cap is the pool's stored
`pools.member_limit` (default `10`, sourced from `free_tier_max_members` at creation). Enforcement
compares the live active-member count against that stored value. Config drives the cap *at creation*
and supplies the wall's *display* values; there is no live-config re-read at enforcement. This is what
makes grandfathering automatic — existing pools keep their stored cap untouched.

**Effective cap = `pools.member_limit`.** No subscription lookup (table is empty this season; that
branch is out of scope).

**Step 0 — retire the founding short-circuit (prerequisite).** In `create_pool`, remove the
`founding_pools_remaining` branch so a non-super-admin free pool is created with
`member_limit = COALESCE(free_tier_max_members, 10)` instead of `NULL`, and stop decrementing the
counter. **Leave the `is_founding_pool` column and `founding_pools_remaining` key in place** (no
DROP — Hard Rule #16). The super-admin branch is unchanged. *Without Step 0 the facade never fires —
new pools stay unlimited while the counter is at 82.*

**Trigger A — a Contest grows past its cap** (`join_pool_by_invite`; currently returns `pool_full`):
1. Within cap → insert member, no flag.
2. Would exceed `member_limit` → read `founding_season_active`:
   - `true` → **insert the member** and return `{ ok: true, show_wall: 'member_cap' }`.
   - `false` → return `{ error: 'upgrade_required', cap: <member_limit> }` (replaces `pool_full`).

**Trigger B — a second-or-later Contest** (`create_pool`; the existing `free_tier_max_pools` block):
1. Within `free_tier_max_pools` → create normally.
2. Would exceed → read `founding_season_active`:
   - `true` → **create the Contest** and return `{ ok: true, show_wall: 'pool_cap' }`.
   - `false` → keep the existing `{ error: 'pool_limit_reached', upgrade_required: true }`.

**Grandfathering (automatic).** Existing pools keep their stored `member_limit`: the 11 founding
(`NULL`/unlimited) pools, the 3 legacy `50`-capped pools, the unlimited pool at 53 members, and the
`100000` pool are never re-capped, regardless of the flag. New growth on *capped* pools is the only
thing that triggers the wall.

**Wall fires on every over-cap action.** The server writes no state, so it returns `show_wall` on each
add/create past cap. No per-pool "wall seen" flag.

**Caller surface.** Both RPCs return a machine code (`show_wall: 'member_cap' | 'pool_cap'`); the
client fetches prices from config and renders lexicon copy (§6). The client never sees raw config for
the allow/block decision and never decides allow/block itself (Hard Rule #15).

### 5b. `redeem_comp_code` RPC (onboarding only)

```
redeem_comp_code(p_code text)  -- SECURITY DEFINER, authenticated, search_path = public
  1. normalize p_code (trim, uppercase).
  2. UPDATE comp_codes
       SET redeemed_by = auth.uid(), redeemed_at = now()
       WHERE code = <normalized> AND redeemed_by IS NULL
       RETURNING label INTO v_label;     -- single atomic guard; no separate SELECT
  3. IF FOUND  -> return { ok: true, label: v_label }   (client shows welcome state)
     ELSE      -> distinguish:
                    not-exists  -> { error: 'INVALID_CODE' }
                    exists+taken-> { error: 'ALREADY_REDEEMED' }
```

**Race-safe:** the conditional `UPDATE … RETURNING` is the authority — two concurrent calls cannot both
succeed (the second matches zero rows). Do **not** branch on a prior `SELECT` (that races). Step 3's
"distinguish" is a single follow-up `SELECT` only when the UPDATE returns no row.

**Critical:** redemption records cohort membership and triggers the welcome moment. It does **not**
change any cap or write a subscription. The universal `founding_season_active` flag is what lets people
through.

---

## 6. Client Behavior

The client displays; it never computes the cap, the prices, or the allow/block decision. All three
come from the server / config.

- **6a. Trigger A wall (10th → adding the 11th Player).** Milestone framing, not an alarm. Render the
  four tiers with prices **from config** (`free_tier_max_members`, `paid_small/medium/large_price`),
  then pass through. Cohort-only top line if the user redeemed a code: "Founding Gaffer — you're set."
  Draft copy (pending brand-voice pass) — **every figure interpolates from config, no literals:**
  > Look at you go. That's [free_tier_max_members] Players in [Contest]. Contests this size move to a
  > paid tier — Free · up to [free_max] / $[small] · up to 25 / $[medium] · up to 50 / $[large] · 51+.
  > But you got in early — your founding season is on us, every tier, all the way through the Super
  > Bowl. [ Keep going → ]
- **6b. Trigger B wall (second Contest).** "Extra Contests are a paid tier — $[small] and up. But not
  this season… [ Start the Contest → ]" — `$[small]` from `paid_small_price`.
- **6c. Persistent reminder.** In Contest settings, while `founding_season_active = true`: a quiet
  line "Founding Season · Free · Standard pricing returns next season."
- **6d. Onboarding code entry.** Optional "Have a founding code?" field → `redeem_comp_code`. Absence
  is fine — every organizer still gets the universal pass at the wall.
- **6e. State.** Tier / cap / price display state lives in `globalStore`, populated from the server
  response + config — never computed locally. No new sport-store state.

**Lexicon:** machine codes (`show_wall`, `upgrade_required`, `pool_limit_reached`) are internal and
stay as-is. Only user-visible copy uses `@shared/lexicon` (Contest, Player, the Gaffer, the Ladder).

---

## 7. Red Flags (stop and revise)

- Gating the cap on comp-code redemption — the universal flag grants the pass; the code only marks
  cohort membership.
- Hardcoding the cap or prices — all from config (Hard Rules #9, #14). No `$19` / `10` literals in
  client or function code.
- Scoping the comp to a phase — it is competition-scoped; the playoff reset is a leaderboard reset.
- Extending / dropping `is_founding_pool` / `founding_pools_remaining` — retire the create-time
  *branch* but keep the columns/keys (no destructive schema change mid-season).
- Building any payment — no Stripe/IAP/checkout/webhooks/reconciliation.
- Enforcing the cap client-side — server-side only (Hard Rule #15); client renders from the response.
- Re-capping or trimming grandfathered pools — they keep their stored `member_limit`; no destructive
  action (Hard Rule #16).
- Branching `redeem_comp_code` on a prior `SELECT` — use the atomic `UPDATE … RETURNING` guard.

---

## 8. Completion Checklist (each item verifiable)

1. **Step 0 done:** a new free Contest is created with `member_limit = free_tier_max_members` (10),
   **not** `NULL`. Verify: create a free Contest as a non-super user → `member_limit = 10`,
   `is_founding_pool = false`, and `founding_pools_remaining` did **not** decrement.
2. `competition_config (global)` contains `paid_small_price`, `paid_medium_price`, `paid_large_price`,
   `founding_season_active`, each with a description.
3. With `founding_season_active = true`: adding an 11th Player is **allowed** and the response carries
   `show_wall: 'member_cap'`. (Live QA fixture: a free pool already sits at `member_limit = 10` with
   10 active members.)
4. With `founding_season_active = true`: creating a second Contest is **allowed** and returns
   `show_wall: 'pool_cap'`.
5. With `founding_season_active = false` (test toggle): both actions return `upgrade_required` /
   `pool_limit_reached`. The flag genuinely controls behavior. *(Note: flipping false also blocks
   growth on grandfathered over-cap pools — expected, existing members are never removed.)*
6. `comp_codes` exists with RLS on; `redeem_comp_code` records a single-use redemption, refuses a
   second redemption (incl. under concurrency), and does **not** change any cap.
7. The wall + settings reminder render config prices and `@shared/lexicon` strings — grep the
   component for hardcoded `$19` / `"Pool"` / `"member"` and find none.
8. Existing over-cap / founding pools still load and operate unchanged — not blocked, not modified.
9. No Stripe, IAP, checkout, or webhook code introduced.

**DB verification query:**
```sql
SELECT competition, key, value, description
FROM competition_config
WHERE competition = 'global'
  AND key IN ('free_tier_max_members','free_tier_max_pools',
              'paid_small_max_members','paid_medium_max_members','paid_large_max_members',
              'paid_small_price','paid_medium_price','paid_large_price','founding_season_active')
ORDER BY key;
```

---

## Appendix A — Live DB verification (project `mzqtrpdiqhopjmxjccwy`, June 16 2026, read-only)

| Fact | Value | Source of truth |
|---|---|---|
| `founding_pools_remaining` | `82` (live, decrementing) | `competition_config` |
| `pools.member_limit` column default | `10` (integer, nullable) | `information_schema.columns` |
| `free_tier_max_members` / `free_tier_max_pools` | `10` / `1` | `competition_config` |
| `paid_small/medium/large_max_members` | `25` / `50` / `null` | `competition_config` |
| `paid_*_price`, `founding_season_active` | **absent** (add in §4a) | `competition_config` |
| `comp_codes`, `redeem_comp_code` | **absent** (create in §4b/§5b) | `to_regclass` / `pg_proc` |
| `subscriptions` | exists, **0 rows, 0 plans** | `subscriptions` |
| `is_super_admin` | `boolean` column on `profiles` | `database.ts:39`, live RPCs |

**Live pool population (active, non-archived):** 11 founding (`member_limit = NULL`); 3 non-founding
unlimited (one at 53 members); 1 at `member_limit = 100000`; 3 legacy at `member_limit = 50`; 4 free
at `member_limit = 10` (one **at exactly 10 active members** → Trigger A QA fixture). None to be
re-capped.
