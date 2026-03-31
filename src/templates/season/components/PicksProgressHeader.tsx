import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Flame} from 'lucide-react-native';
import {spacing} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface PicksProgressHeaderProps {
  currentWeek: number;
  pickCount: number;
  totalGames: number;
  hotPickCount: number;
  hotPicksRequired: number;
  accentColor: string;
}

/**
 * PicksProgressHeader — Replaces the plain "Week X Picks" header.
 *
 * Shows:
 * 1. Week title + pick count with flame when picking starts
 * 2. Progress bar (grey → yellow → green)
 *
 * Count turns yellow on first pick, green + bold when all picked.
 * A small flame appears left of the count once picks start.
 */
export function PicksProgressHeader({
  currentWeek,
  pickCount,
  totalGames,
  hotPickCount,
  hotPicksRequired,
  accentColor,
}: PicksProgressHeaderProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const progress = totalGames > 0 ? pickCount / totalGames : 0;
  const allPicked = pickCount >= totalGames && totalGames > 0;
  const hasPicks = pickCount > 0;

  const ACTION_GREEN = '#1B9A06';

  const barColor = allPicked
    ? ACTION_GREEN
    : hasPicks
      ? colors.warning
      : colors.border;

  const countColor = allPicked
    ? ACTION_GREEN
    : hasPicks
      ? colors.warning
      : colors.textSecondary;

  const hasHotPick = hotPickCount >= hotPicksRequired;

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.weekTitle}>WEEK {currentWeek} PICKS</Text>
        <View style={styles.rightRow}>
          {/* HotPick flame + pick count */}
          <Flame
            size={36}
            color={hasHotPick ? '#F5620F' : colors.textSecondary}
            fill={hasHotPick ? '#F5620F' : 'none'}
            strokeWidth={hasHotPick ? 2.5 : 1.5}
          />
          <Text
            style={[
              styles.pickCountText,
              {color: countColor},
              allPicked && styles.pickCountComplete,
            ]}>
            {pickCount}/{totalGames}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(progress * 100, 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    color: colors.highlight,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickCountText: {
    fontSize: 28,
    fontWeight: '700',
  },
  pickCountComplete: {
    fontWeight: '800',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
