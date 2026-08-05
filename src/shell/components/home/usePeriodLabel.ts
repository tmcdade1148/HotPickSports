// Shared header period-pill label. Every header (HomeHeader, PicksHeader,
// PoolHeader) showed the same thing: 'PRACTICE' while the onboarding demo is
// active, otherwise the sport+period label. Year and phase both come from
// nflStore (the active competition's authoritative competition_config values),
// so they can't disagree and don't go stale like seasonStore.seasonYear.
// Extracted here so the three headers don't each repeat the logic.

import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {shortPeriod} from './shortPeriod';
import {getPeriodLabel} from './periodLabel';

export function usePeriodLabel(): string {
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const seasonYear       = useNFLStore(s => s.seasonYear);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const isDemoActive     = useGlobalStore(s => s.isDemoActive);

  if (isDemoActive) return 'PRACTICE';
  return shortPeriod(currentPhase, currentWeek, playoffStartWeek, seasonYear);
}

/**
 * Screen-reader form of the same period (SWITCHER-01 §5c).
 *
 * The visible pill label is an abbreviation built for a fixed-width header —
 * VoiceOver reads 'NFL26 · W01' as "N F L twenty-six dot W zero one", which is
 * not a usable accessibility label. getPeriodLabel is the long form the
 * IdentityBar and the hero eyebrow already use ('WEEK 1', 'PRESEASON', 'WILD
 * CARD'), so the spoken label and the on-screen chips stay the same vocabulary.
 * The sport/year prefix is dropped deliberately — the accessibility label pairs
 * this with the full event NAME ('NFL 2026 Preseason'), which already carries it.
 */
export function useSpokenPeriodLabel(): string {
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const isDemoActive     = useGlobalStore(s => s.isDemoActive);

  if (isDemoActive) return 'PRACTICE';
  // OFF_SEASON was added to shortPeriod but never to getPeriodLabel, which
  // falls through to its 'WEEK n' default for it — so the spoken label would
  // say "WEEK 1" while the pill says OFFSEASON. Handled here rather than in
  // getPeriodLabel because that helper also feeds the IdentityBar chip and the
  // hero eyebrow, and this is an accessibility fix, not a redesign of those.
  if (currentPhase === 'OFF_SEASON') return 'OFFSEASON';
  return getPeriodLabel(currentPhase, currentWeek, playoffStartWeek);
}
