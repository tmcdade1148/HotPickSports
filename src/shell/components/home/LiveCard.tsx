import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, spacing, typography} from '@shared/theme';
import type {DbSeasonPick} from '@shared/types/database';
import type {GameScore} from '@sports/nfl/stores/nflStore';

interface LiveCardProps {
  currentWeek: number;
  userHotPick: DbSeasonPick | null;
  liveScores: Record<string, GameScore>;
}

/**
 * Shown when weekState === 'live'.
 * Displays user's HotPick game with live score + point impact.
 */
export function LiveCard({currentWeek, userHotPick, liveScores}: LiveCardProps) {
  const hotPickScore = userHotPick
    ? liveScores[userHotPick.game_id]
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>WEEK {currentWeek} — LIVE</Text>
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Games in progress</Text>
      </View>

      {userHotPick && hotPickScore ? (
        <View style={styles.hotPickSection}>
          <Text style={styles.hotPickLabel}>Your HotPick</Text>
          <Text style={styles.matchup}>
            {userHotPick.picked_team}
          </Text>
          <Text style={styles.score}>
            {hotPickScore.homeScore} - {hotPickScore.awayScore}
          </Text>
          {hotPickScore.gameClock && (
            <Text style={styles.clock}>
              Q{hotPickScore.currentPeriod} {hotPickScore.gameClock}
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.body}>Follow your picks live</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  liveText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
  },
  hotPickSection: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
  },
  hotPickLabel: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  matchup: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  score: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  clock: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
