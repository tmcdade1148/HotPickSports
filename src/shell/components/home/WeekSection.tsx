// WeekSection — the WEEK eyebrow, wrapped around the ACTION module.
//
// "WEEK 7 · 22 ............................ GAMES IN PROGRESS"
//
// The value is THE week score — the same number the Picks screen shows, from
// the same shared helper (templates/season/utils/weekScore). It is never
// derived a second way here; two implementations of this number is exactly the
// drift the green-token cleanup just fixed.
//
// It replaces the orange HEAD panel that used to sit on the HISTORY card, which
// showed this same current-week number. The card is now purely the timeline.
//
// No chevron: the ACTION module is the reason the Player opened the app and
// never collapses.

import React from 'react';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {isLiveStatus} from '@sports/nfl/utils/gameStatus';
import {resolveWeekScore} from '@templates/season/utils/weekScore';
import {ModuleSection, type ModuleSectionStatus} from './ModuleSection';
import {PLAYOFF_PHASES, sectionWeekLabel} from './weekRecap';
import type {HomeRow} from './homeRows';

/**
 * Rows with no week in play — the eyebrow is absent entirely.
 *
 * This subsumes HIDDEN_PHASES: OFF_SEASON always resolves to off_far/off_near
 * and PRE_SEASON always to pre_bridge. It also covers two states a phase check
 * alone would miss — the playoff bridge, and REGULAR before week-1 picks open
 * (phase REGULAR, week_state idle), which resolves to an off-season row.
 */
const NO_WEEK_ROWS: HomeRow[] = ['off_far', 'off_near', 'pre_bridge', 'playoff_bridge'];

export interface WeekSectionProps {
  row: HomeRow;
  children: React.ReactNode;
}

export function WeekSection({row, children}: WeekSectionProps) {
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeekPoints = useNFLStore(s => s.currentWeekPoints);
  const liveScores = useNFLStore(s => s.liveScores);

  // The viewed week's picks + games. Home pins seasonStore to the live week, so
  // these normally describe it; `isLiveWeek` catches the frame after the Player
  // returns from reviewing an earlier week on the Picks screen.
  const weekPicks = useSeasonStore(s => s.weekPicks);
  const games = useSeasonStore(s => s.games);
  const viewedWeek = useSeasonStore(s => s.currentWeek);

  if (NO_WEEK_ROWS.includes(row) || currentWeek <= 0) return <>{children}</>;

  const score = resolveWeekScore({
    picks: weekPicks,
    games,
    isLiveWeek: viewedWeek === currentWeek,
    serverWeekPoints: currentWeekPoints,
  });

  const liveCount = Object.values(liveScores).filter(g => isLiveStatus(g.status)).length;
  const status = weekStatus(weekState, liveCount);

  return (
    <ModuleSection
      label={sectionWeekLabel(currentWeek, PLAYOFF_PHASES.includes(String(currentPhase)))}
      value={score}
      status={status}
      emphasis>
      {children}
    </ModuleSection>
  );
}

/**
 * What the week is doing, right-aligned.
 *
 * Games actually underway outrank the week_state label — once the ball is in
 * the air that IS the state, and it's what the Player is checking for. Settling
 * and complete carry no status: the value has become the whole story.
 */
function weekStatus(
  weekState: string | null | undefined,
  liveCount: number,
): ModuleSectionStatus | null {
  if (liveCount > 0) {
    return {text: liveCount === 1 ? 'GAME IN PROGRESS' : 'GAMES IN PROGRESS', tone: 'go'};
  }
  switch (weekState) {
    case 'picks_open': return {text: 'PICKS OPEN', tone: 'go'};
    case 'locked':
    case 'live':       return {text: 'PICKS LOCKED', tone: 'stop'};
    default:           return null;
  }
}
