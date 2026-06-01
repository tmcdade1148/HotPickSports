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

export function usePeriodLabel(): string {
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const seasonYear       = useNFLStore(s => s.seasonYear);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const isDemoActive     = useGlobalStore(s => s.isDemoActive);

  if (isDemoActive) return 'PRACTICE';
  return shortPeriod(currentPhase, currentWeek, playoffStartWeek, seasonYear);
}
