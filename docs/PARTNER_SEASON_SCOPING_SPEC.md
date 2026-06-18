# Partner / League Season Scoping + Renewal — Design Spec

**Status:** Planned (not built). Build on a feature branch (`feature/partner-season-scoping`) after the June 2026 tester sessions.
**Author context:** Raised 2026-06-18 — demo partners (Big Tree, Mes Que) were bleeding into the live `nfl_2026` season; there is currently no way to scope a partner to a season or renew them into a new one.

---

## Problem

`partners` rows have **no season/competition scoping** — only a global `is_active`. A partner's "activity" is implicit, derived from whatever pools are affiliated with it (each pool has a `competition`). Nothing prevents a demo/seasonal partner from being attached to a live-season pool, and there is no concept of a partner's entitlement expiring or being renewed for a new season.

A one-time data cleanup (unhooking a partner from out-of-season pools) is not durable — a pool organizer can re-affiliate via the roster pass at any time. Durable scoping needs a data model + an enforcement gate.

## Goal

A partner/League is entitled to one or more **seasons (competitions)**:
- **Limit to a season** — restrict a partner to exactly one competition (e.g. Big Tree → `nfl_2025_sim`).
- **Renew** — grant a new season (e.g. → `nfl_2026`), optionally expiring the old one.
- **Enforce** server-side so an un-entitled partner cannot be affiliated with an out-of-season pool.

---

## Data model

New table **`partner_seasons`**:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `partner_id` | uuid | FK → `partners(id)` ON DELETE CASCADE |
| `competition` | text | the season, e.g. `nfl_2025_sim`, `nfl_2026` |
| `status` | text | `active` / `expired` |
| `granted_at` | timestamptz | default `now()` |
| `granted_by` | uuid | super-admin who granted |
| `expires_at` | timestamptz null | optional auto-expiry |

- **Unique index** on `(partner_id, competition)`.
- **Limit to a season** = exactly one `active` row.
- **Renew** = insert a new `active` row for the next competition (optionally flip the prior to `expired`).
- **RLS:** read for authenticated (needed by the enforcement read path); writes only via SECURITY DEFINER RPCs below.

### Backfill (migration)
One `active` row per partner per competition they are currently affiliated with, derived from existing affiliations (`pools.partner_id` / `pools.owning_club_id` / `pool_partner_affiliations`). Today that's: Big Tree → `nfl_2025_sim`; Mes Que → `nfl_2025_sim`.

---

## Enforcement (the teeth)

Gate the affiliation path — the RPC where a pool sets `partner_id` / joins a roster (e.g. `join_partner_roster`, and any `set`-partner RPC). Reject when the partner has **no `active` `partner_seasons` row for that pool's competition**:

```
IF NOT EXISTS (
  SELECT 1 FROM partner_seasons
  WHERE partner_id = p_partner_id
    AND competition = v_pool.competition
    AND status = 'active'
) THEN RETURN jsonb_build_object('error', 'PARTNER_NOT_ACTIVE_THIS_SEASON');
```

Optional read-side: filter an expired partner's roster/perk so it doesn't render on out-of-season pools (defense in depth; the affiliation gate is primary).

---

## Admin RPCs (super-admin only, SECURITY DEFINER, `admin_audit_log` first)

- `grant_partner_season(p_partner_id, p_competition)` → inserts/reactivates an `active` row.
- `expire_partner_season(p_partner_id, p_competition)` → sets `expired`.
- (Renew = `grant_partner_season` for the new competition + optional `expire_partner_season` for the old.)

Each logs an `admin_audit_log` entry (`PARTNER_SEASON_GRANTED` / `PARTNER_SEASON_EXPIRED`) before mutating — add those values to the `admin_audit_log_action_check` allowlist.

---

## Admin UI (`PartnerAdminScreen`)

- Show the partner's seasons (active / expired) as chips.
- **"Limit to season"** picker, **"Renew → [season]"** button, **"Expire"** action — each calls the matching RPC.
- User-facing nouns from `@shared/lexicon` (League / season), no hardcoded strings.

---

## Layering / shipping

| Layer | OTA? |
|---|---|
| `partner_seasons` table + backfill + enforcement gate in RPCs | Server-side migration — **not OTA** |
| `grant`/`expire` RPCs | Server-side — **not OTA** |
| `PartnerAdminScreen` UI | JS — **OTA-eligible** (depends on the schema being live first) |

Ship order: migration + RPCs first (server), then the UI (OTA). Per branch rules, build on `feature/partner-season-scoping`; nothing merges to `main` without Tom's approval.

## Effort

Small-to-medium, low blast radius: 1 migration (table + backfill + audit-action allowlist), 2 admin RPCs + 1 enforcement gate, 1 admin-screen section.
