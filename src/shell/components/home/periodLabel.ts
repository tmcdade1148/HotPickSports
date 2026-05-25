// src/shell/components/home/periodLabel.ts
// Maps competition_config (current_phase, current_week) to the short label
// shown in the IdentityBar's week chip and the State Hero's eyebrow.
//
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.2 (week label format)
//
// Keep this file template-agnostic-friendly: the Season template uses
// (phase, week_number); Series and Tournament templates will add their
// own variants in later phases.

export type SeasonPhase =
  | 'PRE_SEASON'
  | 'REGULAR'
  | 'REGULAR_COMPLETE'
  | 'PLAYOFFS'
  | 'SUPERBOWL_INTRO'
  | 'SUPERBOWL'
  | 'SEASON_COMPLETE';

/**
 * Format the short period label for the IdentityBar (and State Hero eyebrow).
 *
 * Examples:
 *   getPeriodLabel('REGULAR', 8)              → 'WEEK 8'
 *   getPeriodLabel('PRE_SEASON', null)        → 'PRESEASON'
 *   getPeriodLabel('REGULAR_COMPLETE', null)  → 'REG SEASON DONE'
 *   getPeriodLabel('PLAYOFFS', 19)            → 'WILD CARD'
 *   getPeriodLabel('PLAYOFFS', 20)            → 'DIVISIONAL'
 *   getPeriodLabel('PLAYOFFS', 21)            → 'CONF CHAMPIONSHIP'
 *   getPeriodLabel('SUPERBOWL_INTRO', null)   → 'SUPER BOWL'
 *   getPeriodLabel('SUPERBOWL', 22)           → 'SUPER BOWL'
 *   getPeriodLabel('SEASON_COMPLETE', null)   → 'SEASON DONE'
 *
 * NFL playoff weeks (REFERENCE.md §3): weeks 19/20/21/22 map to
 * Wild Card / Divisional / Conference / Super Bowl. The exact week
 * numbers come from `playoff_start_week` in competition_config; this
 * helper assumes the standard NFL mapping but is safe for any week.
 */
export function getPeriodLabel(
  phase: SeasonPhase | string,
  weekNumber: number | null,
  playoffStartWeek: number = 19,
): string {
  switch (phase) {
    case 'PRE_SEASON':
      return 'PRESEASON';
    case 'REGULAR_COMPLETE':
      return 'REG SEASON DONE';
    case 'SUPERBOWL_INTRO':
      return 'SUPER BOWL';
    case 'SEASON_COMPLETE':
      return 'SEASON DONE';

    case 'PLAYOFFS': {
      if (typeof weekNumber !== 'number') return 'PLAYOFFS';
      const offset = weekNumber - playoffStartWeek;
      if (offset === 0) return 'WILD CARD';
      if (offset === 1) return 'DIVISIONAL';
      if (offset === 2) return 'CONF CHAMPIONSHIP';
      // Fall-through: weeks past the standard 3-week playoff bracket
      return 'PLAYOFFS';
    }

    case 'SUPERBOWL':
      return 'SUPER BOWL';

    case 'REGULAR':
    default:
      return typeof weekNumber === 'number' ? `WEEK ${weekNumber}` : 'WEEK —';
  }
}
