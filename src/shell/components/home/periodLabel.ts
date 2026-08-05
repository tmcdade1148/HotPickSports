// src/shell/components/home/periodLabel.ts
// Maps competition_config (current_phase, current_week) to a spelled-out
// period label ('WEEK 8', 'WILD CARD', 'PRESEASON').
//
// WHO ACTUALLY CALLS THIS (corrected 2026-08-05 — the previous note here was
// stale and cost a wrong spec):
//   • shortPeriod()        — its final fallback, for phases with no week number
//   • useSpokenPeriodLabel() — the screen-reader form of the header pill
// It has NO direct component callers.
//
// The two surfaces the old comment named are NOT wired to this function:
//   • the IdentityBar week chip builds its own string (`PTS THRU …`)
//   • the State Hero eyebrow resolves to WeekSection → sectionWeekLabel()
//     in weekRecap.ts
// Anyone reasoning about which surfaces a change here touches should start
// from that list, not from this file's name.
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
 * Format the spelled-out period label. See the file header for the real
 * call sites — this is not the IdentityBar chip or the hero eyebrow.
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
  /** Spelled-out week vocabulary, from the active event's `periodLabels.long`
   *  (LABELS-01). 'PRESEASON WEEK' inside nfl_2026_pre. Defaults to today's
   *  'WEEK', so a missed call site renders exactly as it does now rather than
   *  breaking — deliberate, given how many surfaces build week strings. */
  longLabel: string = 'WEEK',
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
      return typeof weekNumber === 'number'
        ? `${longLabel} ${weekNumber}`
        : `${longLabel} —`;
  }
}
