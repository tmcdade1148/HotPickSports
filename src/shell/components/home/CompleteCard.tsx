import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '@shared/theme';
import type {Standing} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';

interface CompleteCardProps {
  currentWeek: number;
  totalWeeks: number;
  poolStandings: Standing[];
  userId: string | null;
}

/**
 * Shown when weekState === 'complete'.
 * Season standings framed as a race — points behind leader, weeks remaining.
 */
export function CompleteCard({
  currentWeek,
  totalWeeks,
  poolStandings,
  userId,
}: CompleteCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const weeksLeft = totalWeeks - currentWeek;
  const myStanding = userId
    ? poolStandings.find(s => s.userId === userId)
    : null;
  const leader = poolStandings[0];
  const pointsBehind =
    myStanding && leader && myStanding.userId !== leader.userId
      ? leader.totalPoints - myStanding.totalPoints
      : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>WEEK {currentWeek} — FINAL</Text>
      <Text style={styles.headline}>Week scored</Text>

      {myStanding ? (
        <View style={styles.standingsSection}>
          <Text style={styles.rank}>
            #{myStanding.rank} in your pool
          </Text>
          {pointsBehind > 0 ? (
            <Text style={styles.chase}>
              {pointsBehind} pts behind 1st. {weeksLeft} weeks left.
            </Text>
          ) : (
            <Text style={styles.leading}>
              You're in the lead! {weeksLeft} weeks left.
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.body}>
          Next week's picks open soon
        </Text>
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
  standingsSection: {
    gap: spacing.sm,
  },
  rank: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  chase: {
    ...typography.body,
    color: colors.textSecondary,
  },
  leading: {
    ...typography.body,
    color: colors.success,
    fontWeight: '600',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
