// src/shell/components/home/StatBlocks.tsx
// Two-up stat cards under the in-cycle hero.
//
// Reference (May 13 2026 v2):
//   ┌────────────────┐  ┌────────────────┐
//   │ SEASON TOTAL   │  │ LAST WEEK      │
//   │ 132 pts        │  │ +22  15/15 picks│
//   └────────────────┘  └────────────────┘
//
// Left  — Season total (white display number, "pts" small unit)
// Right — Last week's points (+/- with success/error color) +
//         "X/Y picks" small caption (correct of total)

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';

export function StatBlocks() {
  const {colors} = useTheme();

  const userId       = useGlobalStore(s => s.user?.id);
  const seasonTotal  = useSeasonStore(
    s => (userId ? s.getUserScore(userId)?.total_points : undefined) ?? 0,
  );
  const weekResult   = useNFLStore(s => s.weekResult);

  const lastWeekPts  = weekResult?.weekPoints ?? null;
  const lastWeekHits = weekResult ? `${weekResult.correctPicks}/${weekResult.totalPicks}` : null;
  const positive     = lastWeekPts != null && lastWeekPts >= 0;
  const lastColor    = lastWeekPts == null
    ? colors.textPrimary
    : positive ? colors.success : colors.error;

  return (
    <View style={styles.row}>
      <View style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <Text style={[bodyType.bold, styles.label, {color: colors.textTertiary}]}>
          SEASON TOTAL
        </Text>
        <View style={styles.valueRow}>
          <Text
            style={[
              displayType.display,
              monoType.regular,
              {fontSize: 36, color: colors.textPrimary, lineHeight: 36, letterSpacing: -0.5},
            ]}>
            {seasonTotal.toLocaleString()}
          </Text>
          <Text style={[bodyType.regular, styles.unit, {color: colors.textSecondary}]}>
            pts
          </Text>
        </View>
      </View>

      <View style={[styles.card, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
        <Text style={[bodyType.bold, styles.label, {color: colors.textTertiary}]}>
          LAST WEEK
        </Text>
        <View style={styles.valueRow}>
          <Text
            style={[
              displayType.display,
              monoType.regular,
              {fontSize: 36, color: lastColor, lineHeight: 36, letterSpacing: -0.5},
            ]}>
            {lastWeekPts == null ? '—' : `${positive ? '+' : ''}${lastWeekPts}`}
          </Text>
          <Text style={[bodyType.regular, styles.subPicks, {color: colors.textSecondary}]}>
            {lastWeekHits ?? ''}
            {lastWeekHits ? '\npicks' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.6,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  unit: {
    fontSize: 14,
    paddingBottom: 4,
  },
  subPicks: {
    fontSize: 11,
    lineHeight: 14,
    paddingBottom: 2,
  },
});
