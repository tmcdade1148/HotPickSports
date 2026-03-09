import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Flame} from 'lucide-react-native';
import {colors, spacing} from '@shared/theme';

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
 * 1. Week title + pick count
 * 2. Progress bar (grey → yellow → green)
 * 3. HotPick flame indicators
 */
export function PicksProgressHeader({
  currentWeek,
  pickCount,
  totalGames,
  hotPickCount,
  hotPicksRequired,
  accentColor,
}: PicksProgressHeaderProps) {
  const progress = totalGames > 0 ? pickCount / totalGames : 0;
  const allPicked = pickCount >= totalGames && totalGames > 0;

  const barColor = allPicked
    ? colors.success
    : pickCount > 0
      ? colors.warning
      : colors.border;

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.weekTitle}>Week {currentWeek} Picks</Text>
        <Text
          style={[
            styles.pickCountText,
            allPicked && {color: colors.success},
          ]}>
          {pickCount}/{totalGames} picked
        </Text>
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

      {/* HotPick flame row */}
      <View style={styles.hotPickRow}>
        <View style={styles.flameIndicators}>
          {Array.from({length: hotPicksRequired}).map((_, i) => {
            const isFilled = i < hotPickCount;
            return (
              <Flame
                key={i}
                size={16}
                color={isFilled ? '#FF8C00' : colors.border}
                fill={isFilled ? '#FF8C00' : 'none'}
                strokeWidth={isFilled ? 2 : 1.2}
              />
            );
          })}
        </View>
        <Text style={styles.hotPickText}>
          {hotPickCount}/{hotPicksRequired} HotPicks
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: colors.text,
  },
  pickCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
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
  hotPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  flameIndicators: {
    flexDirection: 'row',
    gap: 4,
  },
  hotPickText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
