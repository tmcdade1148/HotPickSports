// src/shared/utils/competition.ts
// Helpers for reasoning about competition identifiers.

/**
 * True for a sandbox / simulator competition — the NFL SIM family used for
 * App Review and beta testing: `nfl_2025_sim`, `nfl_2025_simA` (Apple
 * reviewer), `nfl_2025_simG` (Google reviewer), etc.
 *
 * Centralized so sim-only behavior (clean human-authored Chirps feed, beta
 * force-land routing, admin "not audited" labeling, simulator heartbeat) keys
 * off ONE rule. Previously these were scattered hardcoded `=== 'nfl_2025_sim'`
 * and `endsWith('_sim')` checks — the latter silently failed for `_simA` /
 * `_simG`. Matches `_sim` optionally followed by a single suffix letter.
 *
 * Note: the onboarding demo (`nfl_demo`) is intentionally NOT matched here —
 * it has its own dedicated path (`enterDemo`), not the sim/force-land flow.
 */
export function isSandboxCompetition(competition: string | null | undefined): boolean {
  return !!competition && /_sim[a-z]?$/i.test(competition);
}
