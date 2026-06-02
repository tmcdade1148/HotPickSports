# App Review Sandbox Runbook — `nfl_2025_simA` / `nfl_2025_simG`

**Created:** 2026-06-02. **Goal:** stand up two **frozen, isolated** App Review sandboxes — one for Apple, one for Google — each at **Week 8, Picks Open**, with seeded Chirps and a populated Ladder, so a reviewer can log in and make real picks. Meanwhile `nfl_2025_sim` stays the owner's free-test walkthrough, and `nfl_2026` is the public launch competition. All four are isolated (week state is per-competition).

> ⚠️ This runbook touches **live** Supabase data. Take a manual backup first. Do the steps once for `simA`, verify, then repeat for `simG`. Nothing here is automated yet — confirm each step.

---

## Competition layout (target end state)

| Competition | Who lands there | State | Driven by |
|---|---|---|---|
| `nfl_2025_sim` | Your test users (whitelist) | you walk it freely | HTML sim tool (default) |
| `nfl_2025_simA` | **Apple** reviewer account only | **frozen** Week 8, Picks Open | HTML sim tool (`?competition=nfl_2025_simA`) — then stop |
| `nfl_2025_simG` | **Google** reviewer account only | **frozen** Week 8, Picks Open | HTML sim tool (`?competition=nfl_2025_simG`) — then stop |
| `nfl_2026` | Everyone else (public) | preseason | production cron |

---

## Prerequisites — code that must SHIP in the reviewer build

The app only knows how to route to / behave for the new sandboxes once these (branch `feature/reviewer-sim-isolation`) are merged and built:

- [ ] **Registry** knows `nfl_2025_simA` / `nfl_2025_simG` (event configs + `GATED_COMPETITIONS`) — `src/sports/nfl/config.ts`, `src/sports/registry.ts`.
- [ ] **Force-land** lands a beta user on whichever sandbox they're whitelisted for (not hardcoded `nfl_2025_sim`) — `src/shell/stores/globalStore.ts` via `isSandboxCompetition`.
- [ ] **Sandbox detection** centralized (`src/shared/utils/competition.ts`) and used in scoring/admin/heartbeat — so Chirps auto-posts stay suppressed for `_simA`/`_simG`.
- [ ] **`nfl-calculate-scores` Edge Function** redeployed (chirp-suppression regex now matches `_simA`/`_simG`).

**Sequence:** merge + build the reviewer app BEFORE giving reviewers their logins, or they'll force-land on the wrong competition / see auto-Chirps.

---

## Per-sandbox setup (do for `simA`, then `simG`)

Replace `simX` with `nfl_2025_simA` (or `_simG`) throughout. Reference the existing `nfl_2025_sim` as the template — it already has the Proving Grounds pool, ~20 fake members, full game data, and a reviewer user (`REVIEWER_USER_ID` in the HTML tool).

### 1. `competition_config` for `simX`
Clone the `nfl_2025_sim` keys, then set Week 8 regular season:
```sql
-- copy every config key from nfl_2025_sim into simX (adjust competition id)
insert into competition_config (competition, key, value, description)
select 'nfl_2025_simA', key, value, description
from competition_config where competition = 'nfl_2025_sim'
on conflict (competition, key) do nothing;

-- pin to Week 8, Picks Open, Regular season
update competition_config set value = '8'::jsonb         where competition='nfl_2025_simA' and key='current_week';
update competition_config set value = '"REGULAR"'::jsonb where competition='nfl_2025_simA' and key='current_phase';
update competition_config set value = '"picks_open"'::jsonb where competition='nfl_2025_simA' and key='week_state';
update competition_config set value = 'false'::jsonb     where competition='nfl_2025_simA' and key='is_season_complete';
```

### 2. Pools + fake members for `simX`
`simX` needs (a) a **global pool** and (b) a **reviewer pool** with fake members so the Ladder populates. Mirror how `nfl_2025_sim` is structured. **TODO before running:** generate the seed SQL by cloning `nfl_2025_sim`'s pools + `pool_members` into `simX` with fresh pool UUIDs (the fake member `user_id`s can be reused — they're shared sandbox users — or cloned). Capture the new reviewer-pool UUID; you'll need it for the HTML tool's `pool` param and the Chirps seed.

### 3. Games + scored weeks 1–7
Open the parameterized HTML tool pointed at `simX`:
```
tools/season-simulator-v4.html?competition=nfl_2025_simA&pool=<simA_reviewer_pool_id>&reviewer=<simA_reviewer_user_id>
```
(The page title + badges will read `nfl_2025_simA` so you can't drive the wrong sim.) Then:
- [ ] **`setup`** — copies `nfl_2025` source games into `simX` (sim-prefixed game ids), resets to week 1.
- [ ] **`run_range 1 → 7`** — plays + scores weeks 1–7 (Ladder now reflects 7 weeks of results).
- [ ] Confirm config lands at **Week 8 / picks_open** (step 1 sets it; re-assert if the tool moved it).
- [ ] Spot-check: week 8 games are `scheduled` (so the reviewer can pick), weeks 1–7 `final`.

### 4. Seed mock Chirps (auto-posts are suppressed for sims)
Insert a handful of human-sounding `smack_messages` into `simX`'s reviewer pool so the feed looks alive:
```sql
insert into smack_messages (pool_id, user_id, ... , text, created_at)
values
  ('<simA_reviewer_pool_id>', '<fake_user_id>', ..., 'Locking the Chiefs this week, book it.', now() - interval '2 days'),
  ('<simA_reviewer_pool_id>', '<fake_user_id>', ..., 'Bold HotPick energy 🔥', now() - interval '1 day');
-- (match the smack_messages columns used by the existing 2 messages in nfl_2025_sim)
```

### 5. Reviewer account + allowlist
- [ ] Create a dedicated login per store (e.g. `appreview-apple@hotpicksports.com` / `…-google@…`), or reuse the existing reviewer user for `nfl_2025_sim` only and make new ones for the sandboxes.
- [ ] Add the reviewer to `simX`'s reviewer pool (`pool_members`).
- [ ] **Whitelist** that user for `simX` ONLY in `competition_access` (and NOT for the other sims), so force-land sends them to the right place:
```sql
-- add reviewer user id to simX's beta allowlist (mirror the nfl_2025_sim row)
-- see migration 20260528170000_competition_access_beta_allowlist.sql for shape
```

### 6. Freeze
Once verified, **stop** — do not run the HTML tool against `simX` again. The production cron only targets `nfl_2026`, so `simX` will not advance on its own. It stays at Week 8 indefinitely.

---

## Verification (per sandbox)

- [ ] Log in as the `simX` reviewer account → app **force-lands on `simX`**, **Week 8, Picks Open**.
- [ ] Ladder shows standings (7 weeks of fake-user results).
- [ ] Chirps feed shows the seeded messages, **no** robotic auto-posts.
- [ ] Reviewer can **make + submit picks**, set a HotPick, post a chirp.
- [ ] Switching/feed/ladder all stay within `simX` — advancing `nfl_2025_sim` (your sandbox) does NOT move `simX`.
- [ ] A NON-whitelisted account lands on `nfl_2026` (preseason), never sees the sims.

---

## Decisions / things only you can do

- **Reviewer credentials** per store (create accounts; supply in App Store Connect / Play Console review notes).
- **Whether reviewers should see ONLY their sim** (today `nfl_2026` is public, so it appears in the switcher). If you want a fully locked single-competition reviewer view, that's an extra gate — flag it.
- **Exact pool/fake-member seed SQL** (step 2) — I can generate it once we confirm `nfl_2025_sim`'s pool + `pool_members` structure (a couple of read queries). Ask and I'll produce copy-paste SQL.

---

## Status of the enabling code (branch `feature/reviewer-sim-isolation`)

- ✅ Sandbox detection helper + registry/config for `simA`/`simG`
- ✅ Force-land generalized; sandbox checks centralized (scoring/admin/heartbeat)
- ✅ HTML sim tool parameterized (`?competition=…&pool=…&reviewer=…`)
- ⏳ Not merged / not deployed — review, then merge + build + redeploy `nfl-calculate-scores` before reviewer logins go out.
