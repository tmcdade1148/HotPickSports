// Shared header period-pill label. Every header (HomeHeader, PicksHeader,
// PoolHeader) showed the same thing: 'PRACTICE' while the onboarding demo is
// active, otherwise the sport+period label with the year sourced from the
// active competition (same store as the phase, not the stale seasonStore year).
// Extracted here so the three headers don't each repeat the logic.

import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {shortPeriod, yearFromCompetition} from './shortPeriod';

export function usePeriodLabel(): string {
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const competition      = useNFLStore(s => s.competition);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const isDemoActive     = useGlobalStore(s => s.isDemoActive);

  if (isDemoActive) return 'PRACTICE';
  return shortPeriod(currentPhase, currentWeek, playoffStartWeek, yearFromCompetition(competition));
}
