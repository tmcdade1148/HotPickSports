// src/shell/components/home/shortPeriod.ts
// Sport+period pill label used in every header (HomeHeader,
// PicksHeader, PoolHeader). Was previously duplicated in three files
// and drifted — HomeHeader had OFF_SEASON + compact-font sizing,
// the other two didn't, so the pill looked different on Games /
// Ladder / Chirps. Extracted here so all three import the same
// helper.
//
// Companion COMPACT_PERIOD_LENGTH is the threshold used to decide
// whether the pill text should drop to its compact font — iOS
// adjustsFontSizeToFit + italic + letterSpacing don't play nicely,
// so we step the font down deterministically when the label is long.

import {getPeriodLabel} from './periodLabel';

/** Labels longer than this render in the compact pill text style. */
export const COMPACT_PERIOD_LENGTH = 12;

/**
 * Map (phase, currentWeek) to the sport+period label shown in the
 * header pill. `seasonYear` controls the NFL prefix suffix
 * (NFL26 / NFL27 / etc.) and defaults to '26'.
 */
export function shortPeriod(
  phase: string,
  week: number | null,
  playoffStart = 19,
  seasonYear?: number,
): string {
  const suffix =
    typeof seasonYear === 'number' && seasonYear > 0
      ? String(seasonYear).slice(-2)
      : '26';
  const sport = `NFL${suffix}`;
  // Badge strings match the map's Badge column (HOME_ROWS[row].badge). All three
  // corrected labels are ≤12 chars, so they render at the full pill font.
  if (phase === 'OFF_SEASON')        return `${sport} · OFFSEASON`;
  if (phase === 'PRE_SEASON')        return `${sport} · PRESEASON`;
  if (phase === 'REGULAR_COMPLETE')  return `${sport} · REG DONE`;
  if (phase === 'SUPERBOWL_INTRO')   return `${sport} · SB`;
  if (phase === 'SUPERBOWL')         return `${sport} · SB`;
  if (phase === 'SEASON_COMPLETE')   return `${sport} · DONE`;

  if (phase === 'PLAYOFFS' && typeof week === 'number') {
    const offset = week - playoffStart;
    if (offset === 0) return `${sport} · WC`;
    if (offset === 1) return `${sport} · DIV`;
    if (offset === 2) return `${sport} · CONF`;
    return `${sport} · PLAYOFFS`;
  }

  if (typeof week === 'number') {
    return `${sport} · W${String(week).padStart(2, '0')}`;
  }
  return `${sport} · ${getPeriodLabel(phase, week, playoffStart)}`;
}
