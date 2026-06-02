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
> 🛑 **DO THIS FIRST — visibility safety.** `user_can_see_competition` defaults a competition with **no `competition_access` row to PUBLIC**. So if you create `simX`'s config/games *before* its access row, **every user in the world can see it** during that window. Always create the **private access row first** (Step 0). Run all SQL via the Supabase SQL editor (service role); these inserts intentionally bypass the `create_pool` RPC, which is fine for a sandbox.

### 0. Reviewer account + PRIVATE access row (do before anything else)
- [ ] Create the reviewer login in **Supabase dashboard → Auth → Users → Add user** (e.g. `appstore-reviewer@hotpicksports.com` for Apple, `playstore-reviewer@hotpicksports.com` for Google). Note its `user_id`. A `profiles` row auto-creates.
```sql
-- friendly identity for the reviewer
update profiles set poolie_name='Reviewer', first_name='App', last_name='Reviewer'
where id = '<APPLE_REVIEWER_USER_ID>';

-- PRIVATE access row FIRST so simX is never momentarily public.
-- Reviewer sees ONLY their sim; admin id included so you can verify.
insert into competition_access (competition, is_public, beta_user_ids, notes)
values ('nfl_2025_simA', false,
        array['<APPLE_REVIEWER_USER_ID>','7b4f41c8-008d-4319-98e7-8c80ec6edf69']::uuid[],
        'Apple App Review sandbox — frozen at Week 8.')
on conflict (competition) do update
  set beta_user_ids = excluded.beta_user_ids, is_public = false;
```

### 1. `competition_config` for `simX`
Clone the `nfl_2025_sim` keys, then set Week 8 regular season:
```sql
insert into competition_config (competition, key, value, description)
select 'nfl_2025_simA', key, value, description
from competition_config where competition = 'nfl_2025_sim'
on conflict (competition, key) do nothing;

update competition_config set value = '8'::jsonb           where competition='nfl_2025_simA' and key='current_week';
update competition_config set value = '"REGULAR"'::jsonb   where competition='nfl_2025_simA' and key='current_phase';
update competition_config set value = '"picks_open"'::jsonb where competition='nfl_2025_simA' and key='week_state';
update competition_config set value = 'false'::jsonb       where competition='nfl_2025_simA' and key='is_season_complete';
```

### 2. Reviewer pool + members for `simX`
`nfl_2025_sim` has **no global pool** — the whole reviewer experience is ONE pool ("The Proving Grounds"). Clone that: one pool + the 8 shared sandbox fake users + the reviewer. The fake users' picks/totals are competition-scoped, so reusing the same 8 across sims is safe.
```sql
-- (A) simX's reviewer pool — fixed UUID so the HTML tool's ?pool= is known
insert into pools (id, name, competition, organizer_id, created_by, invite_code,
                   is_global, is_hidden_from_users, is_archived, status, is_public, pool_start_date)
values ('11111111-aaaa-4111-8111-000000000001', 'The Proving Grounds', 'nfl_2025_simA',
        '7b4f41c8-008d-4319-98e7-8c80ec6edf69', '7b4f41c8-008d-4319-98e7-8c80ec6edf69',
        'PROVEA', false, false, false, 'active', true, '2025-09-05');

-- (B) 8 shared fake users + the Apple reviewer as active members
insert into pool_members (pool_id, user_id, role, status)
select '11111111-aaaa-4111-8111-000000000001', uid, 'member', 'active'
from unnest(array[
  '11111111-1111-4111-8111-000000000001',  -- The Gunslinger
  '11111111-1111-4111-8111-000000000002',  -- Salty Sarah
  '11111111-1111-4111-8111-000000000003',  -- DSmiley
  '11111111-1111-4111-8111-000000000004',  -- P-Train
  '11111111-1111-4111-8111-000000000005',  -- BigSwingJake
  '11111111-1111-4111-8111-000000000006',  -- The Oracle
  '11111111-1111-4111-8111-000000000007',  -- ChrisP
  '11111111-1111-4111-8111-000000000008',  -- LateNightMia
  '<APPLE_REVIEWER_USER_ID>'
]::uuid[]) as uid
on conflict do nothing;
```
For `simG`: pool UUID `11111111-9999-4111-8111-000000000001`, competition `nfl_2025_simG`, invite_code `PROVEG`, the Google reviewer id, and a `competition='nfl_2025_simG'` access row.

### 3. Games + scored weeks 1–7
Open the parameterized HTML tool pointed at `simX`:
```
tools/season-simulator-v4.html?competition=nfl_2025_simA&pool=11111111-aaaa-4111-8111-000000000001&reviewer=<APPLE_REVIEWER_USER_ID>
```
(Title + badges read `nfl_2025_simA` so you can't drive the wrong sim.) Then:
- [ ] **`setup`** — copies `nfl_2025` source games into `simX` (sim-prefixed game ids), resets to week 1.
- [ ] **`run_range 1 → 7`** — plays + scores weeks 1–7 for the pool's members (Ladder now reflects 7 weeks).
- [ ] Re-assert **Week 8 / picks_open** (the tool advances week; re-run the Step 1 `update`s).
- [ ] Spot-check: week 8 games `scheduled` (reviewer can pick), weeks 1–7 `final`.

### 4. Seed mock Chirps (auto-posts are suppressed for sims)
Insert human-sounding `smack_messages` into the reviewer pool (real column shape):
```sql
insert into smack_messages (pool_id, user_id, author_name, text, message_type, mentions, created_at)
values
  ('11111111-aaaa-4111-8111-000000000001','11111111-1111-4111-8111-000000000001','The Gunslinger','Locking the Chiefs. Book it. 🔒','user','{}', now() - interval '2 days'),
  ('11111111-aaaa-4111-8111-000000000001','11111111-1111-4111-8111-000000000006','The Oracle','Upset alert this week — you heard it here.','user','{}', now() - interval '28 hours'),
  ('11111111-aaaa-4111-8111-000000000001','11111111-1111-4111-8111-000000000002','Salty Sarah','My HotPick is gonna sting somebody 🔥','user','{}', now() - interval '5 hours');
```

### 5. (covered by Step 0)
Reviewer account + allowlist are done up front in Step 0 so the sandbox is never public. Just confirm the reviewer is whitelisted for **only** their sim (not the others) so force-land is deterministic.

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

- **Reviewer credentials** per store (create the accounts in Step 0; supply email+password in App Store Connect / Play Console review notes).
- **Whether reviewers should see ONLY their sim.** `nfl_2026` is public, so it appears in the switcher (the reviewer force-lands on their sim but could switch to preseason 2026). If you want a fully locked single-competition reviewer view, that's an extra gate — flag it. Note: super-admins (you) see every competition regardless.

---

## Reference — discovered data (verified 2026-06-02)

**Visibility rule** (`user_can_see_competition`): super-admins see all; a private competition needs the user in `competition_access.beta_user_ids`; **a competition with NO access row defaults to PUBLIC** (hence Step 0 first).

**Shared sandbox fake users** (reuse across all sims — picks/totals are competition-scoped):
| user_id | poolie_name |
|---|---|
| `11111111-1111-4111-8111-000000000001` | The Gunslinger |
| `…000000000002` | Salty Sarah |
| `…000000000003` | DSmiley |
| `…000000000004` | P-Train |
| `…000000000005` | BigSwingJake |
| `…000000000006` | The Oracle |
| `…000000000007` | ChrisP |
| `…000000000008` | LateNightMia |

**Existing identities:**
- `nfl_2025_sim` "The Proving Grounds" pool: `1178a95d-7689-4348-a472-1852cb8c89b8`
- Existing reviewer account (`reviewer@hotpicksports.com`): `55ed62e4-9fe3-45d6-b9a0-a1819d81387b` — currently a member of `nfl_2025_sim`'s pool. ⚠️ It is **not** in `nfl_2025_sim`'s `beta_user_ids`, so it likely can't actually see `nfl_2025_sim` today. **Either reuse it for ONE sandbox (and add it to that sandbox's `beta_user_ids`), or create fresh per-store accounts.** Don't reuse the same account for two sandboxes — force-land would be ambiguous.
- Admin/owner id (whitelisted everywhere): `7b4f41c8-008d-4319-98e7-8c80ec6edf69`
- Source game data: `nfl_2025` (285 games, full season + playoffs) — the HTML tool copies from here.

**Proposed fixed UUIDs for the new pools:** simA `11111111-aaaa-4111-8111-000000000001`, simG `11111111-9999-4111-8111-000000000001`.

---

## Status of the enabling code (branch `feature/reviewer-sim-isolation`)

- ✅ Sandbox detection helper + registry/config for `simA`/`simG`
- ✅ Force-land generalized; sandbox checks centralized (scoring/admin/heartbeat)
- ✅ HTML sim tool parameterized (`?competition=…&pool=…&reviewer=…`)
- ⏳ Not merged / not deployed — review, then merge + build + redeploy `nfl-calculate-scores` before reviewer logins go out.
