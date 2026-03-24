import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '@shared/theme';
import type {DbSeasonPick, DbSeasonGame} from '@shared/types/database';
import type {GameScore} from '@sports/nfl/stores/nflStore';
import {getHotPickImpact} from '@sports/nfl/utils/hotPickImpact';
import type {HotPickImpact} from '@sports/nfl/utils/hotPickImpact';
import {useTheme} from '@shell/theme';

interface LiveCardProps {
  currentWeek: number;
  userHotPick: DbSeasonPick | null;
  userHotPickGame: DbSeasonGame | null;
  liveScores: Record<string, GameScore>;
}

/**
 * Shown when weekState === 'live'.
 * Displays user's HotPick game with live score + color-coded point impact.
 */
export function LiveCard({
  currentWeek,
  userHotPick,
  userHotPickGame,
  liveScores,
}: LiveCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const hotPickScore = userHotPick
    ? liveScores[userHotPick.game_id]
    : null;

  // Compute point impact when all data is available
  const impact: HotPickImpact | null =
    userHotPick && userHotPickGame
      ? getHotPickImpact(userHotPick, userHotPickGame, hotPickScore ?? undefined)
      : null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>WEEK {currentWeek} — LIVE</Text>
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Games in progress</Text>
      </View>

      {userHotPick && userHotPickGame ? (
        <View style={styles.hotPickSection}>
          {/* Header: YOUR HOTPICK + rank badge */}
          <View style={styles.hotPickHeader}>
            <Text style={styles.hotPickLabel}>YOUR HOTPICK</Text>
            {userHotPickGame.frozen_rank != null && (
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>
                  {'\uD83D\uDD25'} {userHotPickGame.frozen_rank} HotPick Pts
                </Text>
              </View>
            )}
          </View>

          {/* Full matchup line */}
          <Text style={styles.matchup}>
            {userHotPickGame.away_team} {hotPickScore?.awayScore ?? '—'} — {userHotPickGame.home_team} {hotPickScore?.homeScore ?? '—'}
          </Text>

          {/* Game clock */}
          {hotPickScore?.gameClock && (
            <Text style={styles.clock}>
              Q{hotPickScore.currentPeriod} {hotPickScore.gameClock}
            </Text>
          )}

          {/* Point impact line */}
          {impact && <ImpactLine impact={impact} />}
        </View>
      ) : (
        <Text style={styles.body}>Follow your picks live</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Impact Line — color-coded HotPick point impact
// ---------------------------------------------------------------------------

function ImpactLine({impact}: {impact: HotPickImpact}) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  switch (impact.status) {
    case 'winning':
      return (
        <Text style={[styles.impactText, {color: colors.success}]}>
          +{impact.points} if this holds {'\uD83D\uDD25'}
        </Text>
      );

    case 'losing':
      return (
        <Text style={[styles.impactText, {color: colors.error}]}>
          {'\u2212'}{impact.points} at risk {'\u26A0\uFE0F'}
        </Text>
      );

    case 'tied':
      return (
        <Text style={[styles.impactText, {color: colors.warning}]}>
          +{impact.points} or {'\u2212'}{impact.points} — game tied {'\u2696\uFE0F'}
        </Text>
      );

    case 'final':
      return (
        <Text style={[styles.impactText, {color: colors.textSecondary}]}>
          Game final — scoring shortly {'\u23F3'}
        </Text>
      );

    case 'unavailable':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  label: {
    ...typography.small,
    color: colors.highlight,
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
  hotPickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  hotPickLabel: {
    ...typography.small,
    color: colors.highlight,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rankBadge: {
    backgroundColor: colors.highlight + '15',
    borderRadius: 4,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  rankBadgeText: {
    ...typography.small,
    color: colors.highlight,
    fontWeight: '600',
  },
  matchup: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  clock: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  impactText: {
    ...typography.body,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
