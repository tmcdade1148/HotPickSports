// Shared header period-pill label. Every header (HomeHeader, PicksHeader,
// PoolHeader) showed the same thing: 'PRACTICE' while the onboarding demo is
// active, otherwise the sport+period label. Year and phase both come from
// nflStore (the active competition's authoritative competition_config values),
// so they can't disagree and don't go stale like seasonStore.seasonYear.
// Extracted here so the three headers don't each repeat the logic.

import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {LEXICON} from '@shared/lexicon';
import {shortPeriod} from './shortPeriod';
import {getPeriodLabel} from './periodLabel';

/**
 * Week-label vocabulary for the ACTIVE event (LABELS-01). Undefined on every
 * event except nfl_2026_pre, and the helpers default to 'W' / 'WEEK', so an
 * absent value is exactly today's output.
 *
 * Read from `activeSport` rather than derived from the phase: the preseason
 * runs current_phase = REGULAR by design (Hard Rule #22), so the phase cannot
 * distinguish it — only the competition can, and the config carries it.
 */
export function usePeriodLabels(): {short?: string; long?: string} {
  const periodLabels = useGlobalStore(s => s.activeSport?.periodLabels);
  return {short: periodLabels?.short, long: periodLabels?.long};
}

export function usePeriodLabel(): string {
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const seasonYear       = useNFLStore(s => s.seasonYear);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const isDemoActive     = useGlobalStore(s => s.isDemoActive);
  const labels           = usePeriodLabels();

  if (isDemoActive) return LEXICON.practice;
  return shortPeriod(
    currentPhase,
    currentWeek,
    playoffStartWeek,
    seasonYear,
    labels.short,
    labels.long,
  );
}

/**
 * Screen-reader form of the same period (SWITCHER-01 §5c).
 *
 * The visible pill label is an abbreviation built for a fixed-width header —
 * VoiceOver reads 'NFL26 · W01' as "N F L twenty-six dot W zero one", which is
 * not a usable accessibility label. getPeriodLabel gives the spelled-out form
 * ('WEEK 1', 'PRESEASON WEEK 1', 'WILD CARD') instead.
 *
 * (An earlier version of this note claimed getPeriodLabel also feeds the
 * IdentityBar chip and the hero eyebrow. It does not — see periodLabel.ts's
 * header for the real call sites. A screen reader has unlimited room, so this
 * takes the LONG form even though both of those surfaces take the short one.)
 *
 * The sport/year prefix is dropped deliberately — the accessibility label pairs
 * this with the full event NAME ('NFL 2026 Preseason'), which already carries it.
 */
export function useSpokenPeriodLabel(): string {
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const isDemoActive     = useGlobalStore(s => s.isDemoActive);
  const labels           = usePeriodLabels();

  if (isDemoActive) return LEXICON.practice;
  // OFF_SEASON was added to shortPeriod but never to getPeriodLabel, which
  // falls through to its 'WEEK n' default for it — so the spoken label would
  // say "WEEK 1" while the pill says OFFSEASON. Handled here rather than in
  // getPeriodLabel so this stays an accessibility fix: that helper also backs
  // shortPeriod's own fallback, and changing it would move the visible pill.
  if (currentPhase === 'OFF_SEASON') return 'OFFSEASON';
  return getPeriodLabel(currentPhase, currentWeek, playoffStartWeek, labels.long);
}
