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

  const barColor = allPicked
    ? colors.success
    : hasPicks
      ? colors.warning
      : colors.border;

  const countColor = allPicked
    ? colors.success
    : hasPicks
      ? colors.warning
      : colors.textSecondary;

  const hasHotPick = hotPickCount >= hotPicksRequired;

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.weekTitle}>Week {currentWeek} Picks</Text>
        <View style={styles.rightRow}>
          {/* Pick count */}
          <View style={styles.countRow}>
            {hasPicks && (
              <Flame
                size={14}
                color={countColor}
                fill={allPicked ? countColor : 'none'}
                strokeWidth={allPicked ? 2 : 1.5}
              />
            )}
            <Text
              style={[
                styles.pickCountText,
                {color: countColor},
                allPicked && styles.pickCountComplete,
              ]}>
              {pickCount}/{totalGames}
            </Text>
          </View>
          {/* HotPick indicator */}
          <View style={[styles.hotPickBadge, hasHotPick && styles.hotPickBadgeActive]}>
            <Flame
              size={20}
              color={hasHotPick ? '#FFFFFF' : colors.textSecondary}
              fill={hasHotPick ? '#FFFFFF' : 'none'}
              strokeWidth={2}
            />
            <Text style={[styles.hotPickText, hasHotPick && styles.hotPickTextActive]}>
              {hotPickCount}/{hotPicksRequired}
            </Text>
          </View>
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
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickCountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pickCountComplete: {
    fontWeight: '800',
  },
  hotPickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hotPickBadgeActive: {
    backgroundColor: '#06D6A0',
  },
  hotPickText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  hotPickTextActive: {
    color: '#FFFFFF',
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
