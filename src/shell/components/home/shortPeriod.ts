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
 * Pull the 4-digit season year out of a competition string
 * ('nfl_2026' → 2026, 'nfl_2025_sim' → 2025). Used so the header pill's year
 * is sourced from the SAME store as its phase (nflStore.competition) rather
 * than seasonStore.seasonYear, which goes stale when seasonStore isn't
 * re-initialized (e.g. a no-pool account that earlier touched the 2025 sim).
 */
export function yearFromCompetition(competition?: string | null): number | undefined {
  const m = competition?.match(/(\d{4})/);
  return m ? Number(m[1]) : undefined;
}

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
  if (phase === 'OFF_SEASON')        return `${sport} · OFFSEASON`;
  if (phase === 'PRE_SEASON')        return `${sport} · PRESEASON`;
  if (phase === 'REGULAR_COMPLETE')  return `${sport} · WK 18 DONE`;
  if (phase === 'SUPERBOWL_INTRO')   return `${sport} · SB WEEK`;
  if (phase === 'SUPERBOWL')         return `${sport} · SB`;
  if (phase === 'SEASON_COMPLETE')   return `${sport} · SEASON DONE`;

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
