// Complete — the finished week's recap folded INTO the action slot (ACTION
// between-weeks spec §7.2). It renders the REAL recap card (the shared RecapCard,
// expanded and always visible) — NOT a thinner parallel one — with a quiet
// "Week N+1 picks open …" line below. NO big button (next week isn't open — when
// it opens the state flips to picks_open where the CTA lives) and NO flame.
//
// The WEEK eyebrow above reads "WEEK N COMPLETE" (label only, no value) and the
// WEEK-N RECAP eyebrow is suppressed for this week (RecapModule returns null in
// complete) — so the expanded RecapCard IS the recap and the week appears ONCE.
//
// Numbers come from the SHARED selectRecap() helper — the same derivation
// RecapModule uses. A missed week is ABSENT, so selectRecap falls back to the
// prior week; that must NOT read as this week's under the "WEEK N COMPLETE"
// eyebrow, so an unscored current week passes null → RecapCard shows a neutral
// "—" (never the stale prior week). Representing a missed week as a scored 0 is
// the banked [BACKEND] work.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {bodyType, spacing} from '@shared/theme';
import {RecapCard} from './RecapCard';
import {
  PLAYOFF_PHASES,
  resolveMatchup,
  sectionWeekLabel,
  selectRecap,
  teamDisplayName,
  type WeekRow,
} from './weekRecap';

export function CompleteHero() {
  const {colors} = useTheme();
  const currentWeek = useNFLStore(s => s.currentWeek);
  const userHotPick = useNFLStore(s => s.userHotPick);
  // Phase only to label the footer's week: a playoff round reads "WC TOTAL:",
  // not "WEEK 19 TOTAL:" — the same spelling RecapModule's eyebrow uses.
  const currentPhase = useNFLStore(s => s.currentPhase);
  const recentWeeks = useGlobalStore(s => s.recentWeeks) as WeekRow[];
  // This week's slate, already cached by seasonStore (HomeScreen fetches the
  // current week) — read only, no fetch. See resolveMatchup for the fallback.
  const weekGames = useSeasonStore(s => s.allWeekGames[currentWeek]);

  // The just-finished week — complete ⇒ weekSettled true. Shared derivation.
  const data = selectRecap(recentWeeks, currentWeek, true);
  // Only THIS week's own result; a missed (absent) week falls back to the prior
  // one, which must not render as this week's. Unscored → null → RecapCard "—".
  const scored = data != null && data.recap.week === currentWeek;
  const cardData = scored ? data : null;

  const teamCode = scored ? userHotPick?.picked_team ?? null : null;
  const team = teamCode ? teamDisplayName(teamCode) : null;
  const matchup = resolveMatchup(weekGames, teamCode);
  const weekLabel = cardData
    ? sectionWeekLabel(
        cardData.recap.week,
        PLAYOFF_PHASES.includes(String(currentPhase ?? '')),
      )
    : null;

  return (
    <View style={styles.wrap}>
      <RecapCard
        data={cardData}
        team={team}
        matchup={matchup}
        weekLabel={weekLabel}
      />

      {/* Next week — no button; picks aren't open yet. picksOpenAt holds the
          SEASON opener (not the next week's open) and the weekly open is
          admin-initiated with no stored time, so this degrades to a dayless
          "in the morning" rather than a wrong/past date. */}
      <Text style={[bodyType.regular, styles.nextWeek, {color: colors.textTertiary}]}>
        Week {currentWeek + 1} picks open in the morning.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  },
  nextWeek: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
    marginHorizontal: spacing.lg,
  },
});
