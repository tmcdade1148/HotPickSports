# HotPick Sports — Architecture Audit & Drift Report

**Generated:** 2026-06-08 · **Branch:** `claude/hotpick-architecture-audit-cAlbr`
**Supabase project:** `mzqtrpdiqhopjmxjccwy` (PostgreSQL 17, read-only inspection)
**Method:** Live schema (`list_tables` verbose, `list_migrations`, `list_edge_functions`,
`list_extensions`, `get_advisors`, read-only `SELECT`s) compared against `/src`,
`supabase/migrations`, `supabase/functions`, `CLAUDE.md` and `REFERENCE.md`.

> **Nothing was modified.** No migrations, no writes, no commits. This is a report.

---

## 0. Headline: the moat is structurally intact ✅

| Check | Result |
|---|---|
| `*_picks` / `*_user_totals` tables carrying `pool_id` | **NONE** — all 6 scoring/picks tables are clean |
| Per-sport / per-event clone tables | **NONE** — everything is template tables keyed by `competition` (text) |
| `pool_members` as the only pool↔user link in the scoring path | Confirmed |
| RLS disabled on any public table | **NONE** (0 `rls_disabled_in_public` findings) |
| `scoring_locked` present for active competitions | Present for `nfl_2026` and `nfl_2025_sim` |

**54 public tables.** Scoring-table `pool_id` audit (the structural rule #2):

```
season_user_totals   ✓ no pool_id        series_user_totals      ✓ no pool_id
season_picks         ✓ no pool_id        series_picks            ✓ no pool_id
tournament_user_totals ✓ no pool_id      tournament_picks        ✓ no pool_id
tournament_group_picks ✓ no pool_id      season_games            ✓ no pool_id
```

`is_hotpick_correct` + `hotpick_rank` + `playoff_points` live on `*_user_totals`
(correct). `frozen_rank` lives on `season_games` / `series_matchups` /
`tournament_matches` (the game/matchup tables) — **not** on `*_picks`, matching the
immutability intent of Hard Rule #6.

The one table outside the social cluster that carries `pool_id` is **`user_hardware`** —
this is **by design**, not a violation: REFERENCE §16's unique constraint is
`(user_id, hardware_slug, competition, week, pool_id)`. Awards are pool-scoped; scores
are not. No action.

---

## 1. Drift Table

Severity legend — **season-threatening** (can break a live season / lose the moat),
**confidence-eroding** (docs lie about ground truth; future work builds on a false map),
**hygiene** (cosmetic / cleanup).

| # | Area | REFERENCE.md / CLAUDE.md says | Actual (code / live DB) | Severity | Suggested fix |
|---|---|---|---|---|---|
| 1 | **Migration tracking** | Implied source-of-truth `supabase/migrations` | Live DB has **224 applied migrations** back to **2025-11-03**. Repo `supabase/migrations` has **61 files**, almost all dated **≥ 2026-05-13**. The entire pre-May-2026 schema history is **untracked in the repo** — a fresh CLI/`db reset` cannot reproduce the live schema. | **season-threatening** | Dump live schema (`supabase db pull`) into a baseline migration; commit it as the new floor so the repo can rebuild the DB. |
| 2 | **Migration naming** | n/a | Repo files use non-CLI names the Supabase CLI ignores (needs 14-digit `<ts>_name`): `260513_*`, `260515_*`, `260526_*`, `260601_*`, and `PURGE_PRESEASON_PICKS.sql`. Their content **was** applied (under proper live timestamps), so they are "applied-but-misnamed." | confidence-eroding | Rename to 14-digit timestamps matching the applied `version`, or delete the duplicates once the baseline (fix #1) exists. |
| 3 | **Loose destructive SQL** | n/a | `supabase/migrations/PURGE_PRESEASON_PICKS.sql` is a `DELETE` script that is **not** a versioned migration and does **not** appear in live migration history — tracked-but-unapplied destructive SQL sitting in the migrations folder. | confidence-eroding | Move to `scripts/` (one-off runbook), out of `migrations/`. |
| 4 | **Timestamp mismatch** | n/a | Several repo files carry a timestamp ≠ the applied version, e.g. repo `20260528170000_competition_access_beta_allowlist` vs live `20260528175944`; repo `20260528220000_nfl_2026_off_season_phase` vs live `20260528221822`; repo `20260605120000_revoke_anon_execute_on_auth_rpcs` (one file) vs live **two** versions `…023229` + `…023334`. | hygiene | Reconcile filenames to live `version` during the fix #1 baseline pass. |
| 5 | **Applied-but-untracked schema migrations** | n/a | Live, schema-affecting, with **no repo file**: `welcome_message_trigger_use_display_pref` (`…235549`), `smack_message_type_add_welcome` (`…235634`), `nfl_2026_wipe_placeholder_games`, `nfl_2026_import_regular_season_schedule_v2`, `add_extensions_to_pool_fn_search_path`, `revoke_anon_execute_on_auth_rpcs_fix`, plus dozens of `sim_*` / `reviewer_sim_*` data migrations. | confidence-eroding | Pull these into the repo (or accept sim/data seeds as ephemeral and document that decision). |
| 6 | **Super Bowl columns are untracked schema** | §7: "Schema not in migrations… formalize with `apply_migration` before building" | Confirmed: `season_picks.sb_q1_leader/sb_q2_leader/sb_q3_leader/sb_margin_tier` and `season_user_totals.playoff_points` exist live but **no migration (repo or DB) creates them** — added out-of-band. | confidence-eroding | Back-fill a migration that `IF NOT EXISTS`-adds these columns so the schema is reproducible before the Nov-2026 SB build. |
| 7 | **Super Bowl column names** | §7: "earlier docs **wrongly** said `super_bowl_q1_pick` / `super_bowl_margin_prediction INT`… the **real** names are `sb_*`" | Live `season_picks` has **BOTH** families physically present: `sb_q1/q2/q3_leader` + `sb_margin_tier` (text) **AND** `super_bowl_q1_pick`, `super_bowl_q2_pick`, `super_bowl_q3_pick`, `super_bowl_margin_prediction` (integer). §7's claim that `super_bowl_*` don't exist is wrong — they're live, legacy duplicates. | confidence-eroding | Pick one family during the Nov SB build; drop the other in a migration. Update §7 to stop calling `super_bowl_*` non-existent. |
| 8 | **Edge Function registry** | §8 documents ~15 functions | **21 deployed.** Deployed but **absent from §8**: `delete-account`, `suspend-user`, `suspend-pool`, `admin-broadcast`, `demo-settle`, `nfl-announce-regular-winners`. | confidence-eroding | Add the 6 functions to the §8 registry table with their triggers/schedules. |
| 9 | **send-broadcast-email** | §8 + §13: broadcasts send email via `send-broadcast-email` | Function exists in `supabase/functions/` but is **NOT deployed** (not in live `list_edge_functions`). The documented broadcast→email path is currently dead. | confidence-eroding | Deploy it, or update §13 to reflect that email broadcasts are off / folded into `admin-broadcast`. |
| 10 | **Season phase lifecycle** | §3 lifecycle starts at **PRE_SEASON** (no OFF_SEASON) | CLAUDE.md Rule #22 includes **OFF_SEASON**, and live `nfl_2026.current_phase = "OFF_SEASON"`, `week_state = "idle"`. §3 is stale vs both the rule and ground truth. | hygiene | Add OFF_SEASON to the §3 lifecycle diagram. |
| 11 | **competition_config Season keys** | §3 Season list: `current_week, current_phase, is_active, is_season_complete, template, sport, season_year, phases, powerUps, carryOver, data_provider, scoring_locked, playoff_start_week` | Live `nfl_2026` **also** has undocumented keys: `global_pool_id`, `next_picks_open_at`, `open_picks_mode`, `picks_locked`, `preseason_start_date`, `season_opener_date`, `season_picks_open_at`, `week_state`. | hygiene | Extend the §3 key list (each new key already has live data; add the documented `description`s). |
| 12 | **competition_config Global keys** | §3 Global list: 10 keys | Live `global` **also** has: `active_competition`, `avatar_storage_bucket`, `favorite_teams_enabled`, `favorite_teams_prompt_after_weeks`, `last_admin_broadcast_at`, `require_email_verification`, `skins_enabled`, `system_avatar_path_prefix`. `founding_pools_remaining = 82` (18 consumed). | hygiene | Extend §3 Global key list. |
| 13 | **Directory structure** | §9: flat `/src/store/{globalStore,nflStore,seasonStore}.ts` and `/src/services/{supabase,espn,odds}.ts` | No `/src/store` or `/src/services`. Stores are distributed: `src/shell/stores/globalStore.ts`, `src/sports/nfl/stores/nflStore.ts`, `src/templates/season/stores/seasonStore.ts` (+ series/tournament + nhl/worldcup). SportRegistry = `src/sports/registry.ts`. A whole `src/shared/` layer (lexicon, theme, components, utils) is absent from §9. Theme exists in **both** `src/shared/theme` and `src/shell/theme`. | hygiene | Redraw the §9 tree from the real layout; note the shell vs shared theme split. |
| 14 | **Anon-executable admin RPCs** | Rule #8 "RLS always on"; §15 auth RPCs gate server-side. Migration `revoke_anon_execute_on_auth_rpcs` (2026-06-05) intended to lock this down | Security advisor: **99 SECURITY DEFINER functions executable by `anon`**, including `admin_purge_user`, `admin_advance_season_phase`, `admin_advance_week`, `admin_add_beta_tester_by_email`. The June-05 revoke was **partial**. (Safe only if each body re-checks `auth.uid()`/super_admin — not verifiable from the lint.) | confidence-eroding (→ season-threatening if any body lacks an in-function authz check) | Audit the anon-executable DEFINER set, esp. `admin_purge_user`; `REVOKE EXECUTE … FROM anon` on every admin/destructive RPC. |
| 15 | **Function search_path** | Best practice / §"silent RLS" hardening | 13 functions have **mutable `search_path`** (e.g. `notify_smack_reply`, `archive_old_smack_messages`, `generate_roster_pass`, `sync_primary_affiliation_to_pools_partner_id`). | hygiene | `ALTER FUNCTION … SET search_path = ''` (or `pg_catalog, public`). |
| 16 | **Public storage buckets** | §"Storage policies gated only by bucket_id" warning | Two buckets are publicly listable: `partner-logos`, `public-data`. | hygiene | Confirm intentional; add path-prefix policies if any private content lands there. |
| 17 | **Stale function entrypoint** | §8 lists `nfl-weekly-transition` as active | Deployed `nfl-weekly-transition` still points its entrypoint at a local `/Users/tmcdade/...` path, version 8, untouched since Mar 2026 (vs other functions on `/tmp/...` ezbr paths). Likely never redeployed from CI. | hygiene | Redeploy from the committed source so the entrypoint normalizes. |

---

## 2. Compliant-by-design (checked, raise no alarm)

- **`user_hardware.pool_id`** — pool-scoped *awards*, in the documented unique constraint. Not a score. ✅
- **RLS-on-no-policy tables** `admin_audit_log`, `pending_role_grants`, `smack_messages_archive` — deny-all to clients by design (service-role / Edge-Function only). Matches "archive is service-role only" + "audit log write-then-act." ✅
- **No per-sport/per-event tables; no `pool_id` on any picks/totals table** — Hard Rules #1 and #2 hold at the schema level. ✅
- **`scoring_locked` present** on both active competitions — emergency brake wired. ✅

---

## 3. Inventory snapshot (for reference)

- **Tables (54):** `admin_audit_log, awards_cache, competition_access, competition_config,
  event_recaps, game_pick_stats, member_engagement, notification_preferences,
  notification_queue, notification_read_state, organizer_acknowledgments,
  organizer_notifications, partner_members, partner_notification_read_state,
  partner_notifications, partners, pending_role_grants, pool_events, pool_invite_codes,
  pool_member_notes, pool_members, pool_partner_affiliations, pool_pulse, pools, profiles,
  season_games, season_picks, season_user_totals, series_games, series_matchups,
  series_picks, series_user_totals, sim_app_heartbeat, simulation_log, skin_catalog,
  smack_messages, smack_messages_archive, smack_reactions, smack_read_state, subscriptions,
  system_avatars, system_logs, tournament_group_picks, tournament_group_results,
  tournament_matches, tournament_picks, tournament_user_totals, user_blocks, user_cosmetics,
  user_devices, user_favorite_teams, user_hardware, user_skins, week_readiness`
- **Edge Functions deployed (21):** nfl-calculate-scores, nfl-update-scores, nfl-finalize-week,
  nfl-rank-games, nfl-open-picks, nfl-import-schedule, nfl-fetch-odds, nfl-weekly-transition,
  nfl-announce-regular-winners, compute-hardware, refresh-game-pick-stats,
  process-notification-queue, send-partner-broadcast, admin-broadcast, espn-health-check,
  smack-archive-messages, delete-account, suspend-user, suspend-pool, season-simulator,
  demo-settle. **In repo but not deployed:** send-broadcast-email.
- **partners columns:** id, name, slug, brand_config, is_active, created_at, created_by,
  perk_text, perk_icon, perk_updated_at, can_run_pools, partner_type, club_pool_id,
  roster_pass, public_info. (All of REFERENCE §15's fields present; contact/public data is
  inside `public_info` jsonb — no dedicated contact columns.)
- **partner board model present:** `partner_members`, `pending_role_grants`,
  `pool_partner_affiliations` all exist (Rule #24 model is live).

---

*Read-only audit. Suggested fixes are not applied — left for Tom to triage.*
