// RecapModule — Home's collapsible WEEK n RECAP eyebrow, wrapping the shared
// RecapCard (the card body itself lives in RecapCard.tsx now, so the complete
// state's hero and this eyebrow render the SAME card — not two parallel ones).
//
// Split out of HistoryModule.tsx in the eyebrow design pass: Recap and HISTORY
// were one file and therefore one chevron. They collapse independently now.
//
// RecapModule shows the most recent FINISHED week (currentWeek − 1). The
// settling/complete states belong to the between-weeks heroes — SettlingHero
// (slim strip) and CompleteHero (the expanded RecapCard) — so this card returns
// null there, and the week never appears twice.

import React, {useMemo} from 'react';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {ModuleSection} from './ModuleSection';
import {RecapCard} from './RecapCard';
import {fullTeamName} from './teamColors';
import {
  HIDDEN_PHASES,
  PLAYOFF_PHASES,
  selectRecap,
  sectionWeekLabel,
  type WeekRow,
} from './weekRecap';

export function RecapModule() {
  const recentWeeks = useGlobalStore(s => s.recentWeeks) as WeekRow[];
  const lastWeekHotPick = useGlobalStore(s => s.lastWeekHotPick);
  // Current week's HotPick — supplies the picked team for the settling/complete
  // recap, where lastWeekHotPick (fetched for currentWeek−1) doesn't apply.
  const userHotPick = useNFLStore(s => s.userHotPick);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const configLoaded = useNFLStore(s => s.configLoaded);

  const phase = String(currentPhase ?? '');
  const isPlayoffs = PLAYOFF_PHASES.includes(phase);

  // RecapModule now shows the most recent FINISHED week (currentWeek − 1).
  // Settling/complete belong to the between-weeks heroes, and this card returns
  // null there (below) — so weekSettled is false whenever it actually renders.
  const weekSettled = weekState === 'settling' || weekState === 'complete';

  // Recap week + its numbers via the SHARED helper (weekRecap.ts) — the same
  // derivation the complete recap-hero uses, so the two can't disagree.
  const data = useMemo(
    () => selectRecap(recentWeeks, currentWeek, weekSettled),
    [recentWeeks, currentWeek, weekSettled],
  );

  // The HotPick's picked team, from whichever store holds that week's pick:
  //   • current week  → userHotPick (fetched for currentWeek)
  //   • previous week → lastWeekHotPick (fetched for currentWeek − 1)
  // Any other week has no team on hand, so the line is omitted rather than
  // showing the wrong week's team.
  const teamCode =
    data == null
      ? null
      : data.recap.week === currentWeek
        ? userHotPick?.picked_team ?? null
        : data.recap.week === currentWeek - 1
          ? lastWeekHotPick?.team ?? null
          : null;
  const team = teamCode ? (fullTeamName(teamCode) ?? teamCode).toUpperCase() : null;

  // Hold while a competition config is loading (e.g. the moment the onboarding
  // demo exits — nflStore still holds the demo's played week until the real
  // config re-inits). Rendering here would flash the demo's leftover result.
  if (!configLoaded) return null;
  // No season to recap in the off-season / pre-season.
  if (HIDDEN_PHASES.includes(phase)) return null;
  // Settling/complete belong to the between-weeks heroes — the recap is the hero
  // there (complete) or nothing (settling). This card must NOT duplicate the
  // WEEK-N RECAP eyebrow for that same week (spec §7.2 anti-duplication).
  if (weekState === 'settling' || weekState === 'complete') return null;
  if (data == null) return null;

  return (
    <ModuleSection
      label={`${sectionWeekLabel(data.recap.week, isPlayoffs)} RECAP`}
      value={data.total}
      collapsible>
      <RecapCard data={data} team={team} />
    </ModuleSection>
  );
}
