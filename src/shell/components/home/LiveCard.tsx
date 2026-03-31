import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '@shared/theme';
import type {DbSeasonPick, DbSeasonGame} from '@shared/types/database';
import type {GameScore} from '@sports/nfl/stores/nflStore';
import {getHotPickImpact} from '@sports/nfl/utils/hotPickImpact';
import type {HotPickImpact} from '@sports/nfl/utils/hotPickImpact';
import {useTheme} from '@shell/theme';
import {useSeasonStore} from '@templates/season/stores/seasonStore';

interface LiveCardProps {
  currentWeek: number;
  userHotPick: DbSeasonPick | null;
  userHotPickGame: DbSeasonGame | null;
  liveScores: Record<string, GameScore>;
  pathBackNarrative?: string | null;
  hotPickGameStats?: {
    hotpickTotal: number;
    hotpickTeamACount: number;
    hotpickTeamBCount: number;
    teamA: string;
    teamB: string;
  } | null;
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
  pathBackNarrative,
  hotPickGameStats,
}: LiveCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const seasonConfig = useSeasonStore(s => s.config);
  const getTeamName = (code: string) => {
    const team = seasonConfig?.teams?.find((t: any) => t.code === code);
    return team?.shortName ?? code;
  };

  const hotPickScore = userHotPick
    ? liveScores[userHotPick.game_id]
    : null;

  // HotPick game countdown + status
  const kickoffAt = userHotPickGame ? new Date(userHotPickGame.kickoff_at) : null;
  const hotPickStatus = userHotPickGame?.status?.toUpperCase() ?? '';
  const isHotPickLive = hotPickStatus === 'IN_PROGRESS' || hotPickStatus === 'LIVE';
  const isHotPickFinal = hotPickStatus === 'FINAL' || hotPickStatus === 'COMPLETED';

  const [minutesUntilKickoff, setMinutesUntilKickoff] = useState<number | null>(null);
  useEffect(() => {
    if (!kickoffAt) return;
    const update = () => {
      const diff = kickoffAt.getTime() - Date.now();
      setMinutesUntilKickoff(diff > 0 ? Math.ceil(diff / 60000) : 0);
    };
    update();
    const interval = setInterval(update, 30000); // update every 30s
    return () => clearInterval(interval);
  }, [kickoffAt?.getTime()]);

  // Compute point impact when all data is available
  const impact: HotPickImpact | null =
    userHotPick && userHotPickGame
      ? getHotPickImpact(userHotPick, userHotPickGame, hotPickScore ?? undefined)
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Games in progress</Text>
      </View>

      {userHotPick && userHotPickGame ? (
        <View style={[styles.hotPickSection, isHotPickLive && styles.hotPickSectionLive]}>
          {/* Header */}
          <Text style={styles.hotPickLabel}>Your HotPick</Text>

          {/* Matchup: rank AWAY @ HOME with picked team boxed */}
          <View style={styles.matchupRow}>
            <View style={styles.rankCircle}>
              <Text style={styles.rankNumber}>
                {userHotPickGame.frozen_rank ?? userHotPickGame.rank ?? 0}
              </Text>
            </View>
            {userHotPick.picked_team === userHotPickGame.away_team ? (
              <View style={styles.pickedBox}>
                <Text style={styles.pickedBoxText}>{getTeamName(userHotPickGame.away_team)}</Text>
              </View>
            ) : (
              <Text style={styles.matchupTeam}>{getTeamName(userHotPickGame.away_team)}</Text>
            )}
            <Text style={styles.matchupAt}>@</Text>
            {userHotPick.picked_team === userHotPickGame.home_team ? (
              <View style={styles.pickedBox}>
                <Text style={styles.pickedBoxText}>{getTeamName(userHotPickGame.home_team)}</Text>
              </View>
            ) : (
              <Text style={styles.matchupTeam}>{getTeamName(userHotPickGame.home_team)}</Text>
            )}
          </View>

          {/* Kickoff status / countdown */}
          {isHotPickLive ? (
            <Text style={styles.inProgressText}>IN PROGRESS</Text>
          ) : minutesUntilKickoff != null && minutesUntilKickoff > 0 && minutesUntilKickoff <= 60 ? (
            <Text style={styles.countdownText}>
              Kickoff in {minutesUntilKickoff} min
            </Text>
          ) : (
            <Text style={styles.kickoffTime}>
              {new Date(userHotPickGame.kickoff_at).toLocaleDateString([], {weekday: 'long'})}
              {', '}
              {new Date(userHotPickGame.kickoff_at).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}
            </Text>
          )}

          {/* Live score */}
          {hotPickScore && (
            <Text style={styles.liveScore}>
              {getTeamName(userHotPickGame.away_team)} {hotPickScore.awayScore ?? '—'} — {hotPickScore.homeScore ?? '—'} {getTeamName(userHotPickGame.home_team)}
            </Text>
          )}

          {/* Game clock */}
          {hotPickScore?.gameClock && (
            <Text style={styles.clock}>
              Q{hotPickScore.currentPeriod} {hotPickScore.gameClock}
            </Text>
          )}

          {/* Point impact line */}
          {impact && <ImpactLine impact={impact} />}

          {/* HotPick concentration — how many poolmates chose this game */}
          {hotPickGameStats && hotPickGameStats.hotpickTotal > 0 && (
            <View style={styles.concentrationRow}>
              <Text style={styles.concentrationText}>
                {hotPickGameStats.hotpickTotal} poolmate{hotPickGameStats.hotpickTotal !== 1 ? 's' : ''} have this as HotPick
              </Text>
              <Text style={styles.concentrationSplit}>
                {hotPickGameStats.teamA} {hotPickGameStats.hotpickTeamACount} / {hotPickGameStats.hotpickTeamBCount} {hotPickGameStats.teamB}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.body}>Follow your picks live</Text>
      )}

      {/* Path Back Narrative — shown only for this user */}
      {pathBackNarrative && (
        <View style={styles.narrativeRow}>
          <Text style={styles.narrativeText}>{pathBackNarrative}</Text>
        </View>
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
  hotPickSectionLive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  hotPickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  hotPickLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
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
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  rankCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  matchupTeam: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  matchupAt: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  pickedBox: {
    borderWidth: 2,
    borderColor: colors.highlight,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pickedBoxText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.highlight,
    textTransform: 'uppercase',
  },
  kickoffTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 38,
    marginBottom: spacing.sm,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#1b9a06',
    marginLeft: 38,
    marginBottom: spacing.sm,
  },
  inProgressText: {
    fontSize: 16,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.primary,
    marginLeft: 38,
    marginBottom: spacing.sm,
  },
  liveScore: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
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
  concentrationRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  concentrationText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  concentrationSplit: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  narrativeRow: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary + '10',
    borderRadius: 8,
    padding: spacing.sm,
  },
  narrativeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});
