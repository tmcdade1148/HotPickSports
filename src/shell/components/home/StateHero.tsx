// src/shell/components/home/StateHero.tsx
// The Home Screen's hero block. Routes to a sub-variant based on the resolved
// HomeRow (map's 11-row week-state table). The row is resolved ONCE by
// HomeScreen (resolveHomeRow) and passed in — there is no second resolver here
// any more. StateHero.resolveFromConfig (the byte-for-byte duplicate of the
// resolver) is deleted (slice 7a).
//
// Row → hero:
//   off_far / off_near      → OffSeasonHero (off_near switches the countdown to
//                             picks-open and shows the row-2 headline/sub)
//   pre_bridge              → PreSeasonGamesHero
//   picks_open/locked/live  → PicksOpenHero + HotPickModule (differentiated
//                             inside PicksOpenHero via isWeekLocked())
//   settling                → SettlingHero
//   complete                → CompleteHero
//   reg_done                → RegularCompleteHero
//   sb_intro                → SuperBowlIntroHero
//   season_done             → SeasonCompleteHero

import React from 'react';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {PicksOpenHero} from './PicksOpenHero';
import {HotPickModule} from './HotPickModule';
import {SettlingHero} from './SettlingHero';
import {CompleteHero} from './CompleteHero';
import {OffSeasonHero} from './OffSeasonHero';
import {PreSeasonGamesHero} from './PreSeasonGamesHero';
import {RegularCompleteHero} from './RegularCompleteHero';
import {SuperBowlIntroHero} from './SuperBowlIntroHero';
import {SeasonCompleteHero} from './SeasonCompleteHero';
import {PlayoffBanner} from './PlayoffBanner';
import {WeekSection} from './WeekSection';
import {HOME_ROWS, type HomeRow} from './homeRows';

export interface StateHeroProps {
  /** The resolved row from HomeScreen (globalStore-level resolveHomeRow). */
  row: HomeRow;
}

export function StateHero({row}: StateHeroProps) {
  const currentPhase = useNFLStore(s => s.currentPhase);

  // The WEEK eyebrow labels the ACTION module. It self-hides on the rows with
  // no week in play (off-season, pre-season, the bridges), so every row can be
  // wrapped from one place. Inside the playoff branch below it lands UNDER the
  // banner — round identity first, then the week.
  const hero = <WeekSection row={row}>{heroFor(row)}</WeekSection>;

  // During the playoffs / Super Bowl, the in-cycle heroes render unchanged
  // beneath a playoff banner (round identity, bracket progress, accent, rules
  // ⓘ). The Super Bowl bridge (sb_intro) also gets the banner so the playoff
  // framing carries through the 2-week gap before the game.
  const isPlayoffPhase =
    currentPhase === 'PLAYOFFS' ||
    currentPhase === 'SUPERBOWL' ||
    currentPhase === 'SUPERBOWL_INTRO';
  const showsBanner =
    row === 'picks_open' || row === 'locked' ||
    row === 'live' || row === 'settling' || row === 'complete' ||
    row === 'sb_intro';

  if (isPlayoffPhase && showsBanner) {
    return (
      <>
        <PlayoffBanner />
        {hero}
      </>
    );
  }
  return hero;
}

function heroFor(row: HomeRow): React.ReactElement {
  switch (row) {
    // ACTION (PicksOpenHero) then HOTPICK (HotPickModule) as siblings — the
    // HotPick card sits directly BENEATH the action module, never inside it.
    // HotPickModule renders null when there's no HotPick or no rank.
    case 'picks_open':  return <><PicksOpenHero /><HotPickModule /></>;
    case 'locked':      return <><PicksOpenHero /><HotPickModule /></>;
    case 'live':        return <><PicksOpenHero /><HotPickModule /></>;
    case 'settling':    return <SettlingHero />;
    case 'complete':    return <CompleteHero />;
    // off_far keeps the kickoff countdown; off_near switches it to picks-open
    // and shows the row-2 headline/sub.
    case 'off_far':     return <OffSeasonHero />;
    case 'off_near':    return <OffSeasonHero nearPicksOpen />;
    case 'pre_bridge':  return <PreSeasonGamesHero />;
    case 'reg_done':    return <RegularCompleteHero />;
    case 'sb_intro':    return <SuperBowlIntroHero />;
    case 'season_done': return <SeasonCompleteHero />;
    // Placeholder playoff bridge — reuses the SuperBowlIntroHero bridge with
    // playoff copy (eyebrow literal + headline from the table). Both PLACEHOLDER.
    case 'playoff_bridge':
      return <SuperBowlIntroHero eyebrow="PLAYOFFS" headline={HOME_ROWS.playoff_bridge.headline!} />;
    default:            return <OffSeasonHero />;
  }
}
