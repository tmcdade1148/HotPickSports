import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '@shared/theme';
import type {WeekResult} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';

interface SettlingCardProps {
  currentWeek: number;
  weekResult: WeekResult | null;
}

/**
 * Shown when weekState === 'settling'.
 * Games ended within last 24 hours — shows weekly result + rank movement.
 */
export function SettlingCard({currentWeek, weekResult}: SettlingCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>WEEK {currentWeek} — RESULTS</Text>
      <Text style={styles.headline}>Week complete</Text>

      {weekResult ? (
        <View style={styles.resultSection}>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>
              {weekResult.weekPoints > 0 ? '+' : ''}
              {weekResult.weekPoints}
            </Text>
            <Text style={styles.statLabel}>points this week</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>
              {weekResult.correctPicks}/{weekResult.totalPicks}
            </Text>
            <Text style={styles.statLabel}>picks correct</Text>
          </View>
          {weekResult.rankDelta !== 0 && (
            <Text
              style={[
                styles.rankDelta,
                weekResult.rankDelta < 0
                  ? styles.rankUp
                  : styles.rankDown,
              ]}>
              {weekResult.rankDelta < 0
                ? `Moved up ${Math.abs(weekResult.rankDelta)} spot${Math.abs(weekResult.rankDelta) !== 1 ? 's' : ''}`
                : `Dropped ${weekResult.rankDelta} spot${weekResult.rankDelta !== 1 ? 's' : ''}`}
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.body}>Scores are being finalized...</Text>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  headline: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  resultSection: {
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  statValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rankDelta: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  rankUp: {
    color: colors.success,
  },
  rankDown: {
    color: colors.error,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
