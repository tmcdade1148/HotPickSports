# Sister Contest Spin-Up — Cross-Sport & Season Rollover Spec

**Status:** Spec only — defer build until Season 2 / first second-sport launch (~ NHL Playoffs 2027).
**Owner:** Tom (product).
**Last updated:** 2026-05-29.

---

## Problem

Today a pool is tied to a single `competition` row (e.g. `nfl_2026`). When a season ends or a new sport's event launches, there's no way for a Gaffer to carry their roster forward. Either we manually rebuild the social graph each cycle, or last season's roster goes dead.

This matters more across sports than across same-sport seasons. Barry's NFL audience is a known social graph — the platform's job is to let that graph travel from sport to sport without Barry rebuilding it each time.

## Goal

Give Gaffers a single mechanic — **Spin up a sister Contest** — that creates a new pool in a new competition, pre-seeded with the current pool's roster as invitees. Works identically for:

- **Same-sport next season**: Barry's NFL 2026 → Barry's NFL 2027
- **Cross-sport new event**: Barry's NFL → Barry's NHL Playoffs

## Non-goals

- Automatic carryover. Every player explicitly recommits — no dead wood.
- Season-end pool deletion. Source pool keeps its history and stays archived but accessible.
- Cross-sport leaderboard aggregation. Each Contest stays competition-scoped.

## Flow

1. **Entry point** — PoolSettings on the source pool → "Spin up a sister Contest" CTA (Gaffer only).
2. **Pick target event** — dropdown of competitions the Gaffer has access to (filtered by `competition_access` + Gaffer's sport availability + any subscription tier limits).
3. **Review & edit**:
   - Pre-filled name from template (`Barry's NHL Playoffs`)
   - Welcome message — carries over from source, editable
   - Partner affiliation — carries over by default if applicable, deselectable
4. **Pick invitees** — checklist of current source-pool members, all checked by default, Gaffer can deselect.
5. **Confirm** — Edge Function `spin_up_sister_contest` creates the new pool with the Gaffer as organizer + writes one `organizer_notifications` row per invitee containing a deep link (`hotpick://join?code=NEWCODE`) to the new pool.
6. **Recommit** — invitees tap → PoolWelcomeScreen auto-joins them. Welcome-message trigger (PR #178) fires on join, dropping the Gaffer's welcome into SmackTalk.
7. **Anyone who doesn't tap by Week 1 / round 1 lockout** — simply not on the roster. No automatic carryover.

## Schema additions

| Table / Column | Type | Purpose |
|---|---|---|
| `pools.origin_pool_id` | uuid NULL FK → pools(id) | Lineage. Lets us render "Barry's NHL Playoffs (forked from Barry's NFL)" and report on cross-sport carryover rates. **Add now even if mechanic is later** — cheap to add early, expensive to backfill once pools exist. |
| `organizer_notifications.notification_type` | extend enum with `sister_contest_invite` | Distinct type so the inbox can render the right CTA / metadata. |
| (existing) `pools.welcome_message` | text | Already exists (PR #178). Carries over on spin-up. |
| (existing) `pools.partner_id` | uuid | Already exists. Carries over by default. |

No new tables.

## RPC / Edge Function

`spin_up_sister_contest(p_source_pool_id, p_target_competition, p_name, p_welcome_message, p_partner_id, p_invitee_user_ids)`

SECURITY DEFINER. Verifies:
- Caller is the source pool's organizer
- Target competition exists and caller has access to it
- Caller's tier supports another pool in that competition (read from `competition_config` tier limits — never hardcode)

Returns the new pool_id + an array of notification_ids.

Server-side enforcement only; no client-side authorization for any of this (Hard Rule #15).

## UI surfaces

| Surface | What it shows |
|---|---|
| PoolSettings → "Spin up a sister Contest" | Gaffer-only CTA, opens the spin-up sheet |
| Spin-up sheet | Target event picker, name, welcome edit, partner toggle, invitee checklist, Confirm |
| Player Home inbox / SmackTalk | The notification row: "Barry started Barry's NHL Playoffs — same crew, new sport. Tap to join." Deep link to PoolWelcomeScreen |
| PoolWelcomeScreen | Existing flow; recognizes the auto-join intent from the deep link and joins on confirm |

## Push notification

Send a push at notification-creation time (per `check_notification_rate_limit()` per Hard Rule). Body:

> Barry started "Barry's NHL Playoffs" — same crew, new sport. Tap to rejoin.

## Open questions

- **Lineage UI**: do we surface "forked from" anywhere user-facing, or keep it analytics-only?
- **Subscription tier interplay**: spinning up a sister Contest creates a *new* pool — does it count against the Gaffer's tier limit, or is "sister" a free renewal mechanic? Probably counts (otherwise it's a free-pool exploit), but lean toward grandfathering existing rosters to encourage carryover.
- **Multi-fork**: if Barry's NFL has two sister Contests already (NHL + NBA), can he spin up a third from any of them? Probably yes; `origin_pool_id` just records the immediate parent, not the family root.
- **Cross-sport identity cluster**: at some point Barry's audience should see his full family of Contests grouped as "Barry's Contests." Layered view on `organizer_id`, not schema change. Defer.
- **Renewal-window UX**: where in the Gaffer's app does the prompt to spin up live? Could be:
  - Push when target competition flips to `PRE_SEASON`
  - Card on Home when source competition flips to `SEASON_COMPLETE`
  - Persistent in PoolSettings (manual, no nudge)
  - All three. Probably yes.

## Timing

- **nfl_2026 launch** — not needed.
- **First multi-sport event after nfl_2026** (likely NHL Playoffs 2027, ~April 2027) — needed by this date or the cross-sport carryover behavior never gets exercised.
- **nfl_2027** — same mechanic handles same-sport renewal automatically.

## What to keep in mind in the meantime

1. **Don't add a column we'd later want to be `pools.origin_pool_id`** under a different name. Reserve the name now.
2. **`organizer_notifications` schema decisions** should keep room for the `sister_contest_invite` type without a migration.
3. **PoolSettings layout** — leave room near "Welcome Message" / pool-identity controls for the future "Spin up" CTA so it doesn't get bolted onto the bottom.
4. **Welcome message + partner_id carryover** — already in good shape; nothing to do.
