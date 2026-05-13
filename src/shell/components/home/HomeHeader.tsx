// src/shell/components/home/HomeHeader.tsx
// Slim top row for the Home Screen — period pill only.
// Wordmark removed per the May 13 design call ("we can remove the
// workmark from the very top"); the period pill stays as a quiet
// week / phase indicator at the top right.
//
//                                           [ NFL · W08 ]

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {getPeriodLabel} from './periodLabel';

export function HomeHeader() {
  const {colors} = useTheme();
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);

  const period = shortPeriod(currentPhase, currentWeek, playoffStartWeek);

  return (
    <View style={styles.row}>
      <View style={[styles.pill, {borderColor: colors.primary}]}>
        <Text style={[bodyType.bold, styles.pillText, {color: colors.primary}]}>
          {period}
        </Text>
      </View>
    </View>
  );
}

/** Short form: "NFL · W08", "NFL · PRESEASON", "NFL · WC", "NFL · SB" */
function shortPeriod(phase: string, week: number | null, playoffStart = 19): string {
  if (phase === 'PRE_SEASON')        return 'NFL · PRESEASON';
  if (phase === 'REGULAR_COMPLETE')  return 'NFL · WK 18 DONE';
  if (phase === 'SUPERBOWL_INTRO')   return 'NFL · SB WEEK';
  if (phase === 'SUPERBOWL')         return 'NFL · SB';
  if (phase === 'SEASON_COMPLETE')   return 'NFL · SEASON DONE';

  if (phase === 'PLAYOFFS' && typeof week === 'number') {
    const offset = week - playoffStart;
    if (offset === 0) return 'NFL · WC';
    if (offset === 1) return 'NFL · DIV';
    if (offset === 2) return 'NFL · CONF';
    return 'NFL · PLAYOFFS';
  }

  if (typeof week === 'number') return `NFL · W${String(week).padStart(2, '0')}`;
  return `NFL · ${getPeriodLabel(phase, week, playoffStart)}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 11,
    letterSpacing: 1,
    fontStyle: 'italic',
  },
});
