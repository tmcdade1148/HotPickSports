// src/shell/components/home/WeekMiniStrip.tsx
// Spec §6.4.5 — horizontal scrollable strip of the last 4 weeks' totals.
//
// Visible: in-cycle states only. Hidden during PRE_SEASON / REGULAR_COMPLETE /
//          SUPERBOWL_INTRO / SEASON_COMPLETE / zero_pools.
// Empty:   if no settled weeks yet (Week 1 picks_open), show a single
//          placeholder card "W1 / — —" — no awkward blank state.
// Tap:     navigate to that week's recap in History.
//
// Data: globalStore.recentWeeks — already pre-computed by loadRecentWeeks().
// Aggregation lives in the store reducer per spec §6.4.5 Red Flag: never
// SUM week_points inside a React component.

import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, monoType, spacing, borderRadius} from '@shared/theme';

export function WeekMiniStrip() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const recentWeeks = useGlobalStore(s => s.recentWeeks);
  const currentWeek = useNFLStore(s => s.currentWeek);

  // Empty state — show a single placeholder so layout doesn't collapse.
  const displayCells = recentWeeks.length > 0
    ? recentWeeks
    : [{week: currentWeek || 1, total: 0, placeholder: true as const}];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.strip}>
      {displayCells.map((cell) => {
        const isCurrent     = cell.week === currentWeek;
        const isPlaceholder = 'placeholder' in cell && cell.placeholder === true;
        const positive      = cell.total > 0;
        const accentColor   = positive ? colors.success : cell.total < 0 ? colors.error : colors.textTertiary;

        return (
          <Pressable
            key={cell.week}
            onPress={() => !isPlaceholder && navigation.navigate('History', {week: cell.week})}
            disabled={isPlaceholder}
            style={({pressed}) => [
              styles.cell,
              {
                backgroundColor: isCurrent ? colors.surfaceElevated : colors.surface,
                borderColor:     isCurrent ? colors.primary : colors.border,
                borderWidth:     isCurrent ? 1 : StyleSheet.hairlineWidth,
                opacity:         pressed && !isPlaceholder ? 0.7 : 1,
              },
            ]}
            accessibilityRole={isPlaceholder ? undefined : 'button'}
            accessibilityLabel={
              isPlaceholder
                ? `Week ${cell.week} not yet settled`
                : `Week ${cell.week}, ${cell.total >= 0 ? '+' : ''}${cell.total} points`
            }>
            <Text style={[bodyType.bold, styles.weekLabel, {color: colors.textSecondary}]}>
              W{cell.week}
            </Text>
            <Text
              style={[
                monoType.regular,
                styles.totalLabel,
                {color: isPlaceholder ? colors.textTertiary : accentColor},
              ]}>
              {isPlaceholder ? '— —' : `${positive ? '+' : ''}${cell.total}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {marginVertical: spacing.sm},
  row: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  cell: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md + 2,
    minWidth: 64,
    alignItems: 'center',
  },
  weekLabel:  {fontSize: 10, letterSpacing: 1, marginBottom: 2},
  totalLabel: {fontSize: 16, fontWeight: '700'},
});
