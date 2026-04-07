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

  // When game is final but live scores subscription has dropped it,
  // fall back to scores stored on the game record itself.
  const awayScoreDisplay: number | null =
    hotPickScore?.awayScore ?? (isHotPickFinal ? (userHotPickGame?.away_score ?? null) : null);
  const homeScoreDisplay: number | null =
    hotPickScore?.homeScore ?? (isHotPickFinal ? (userHotPickGame?.home_score ?? null) : null);
  const hasDisplayScores = awayScoreDisplay != null || homeScoreDisplay != null;

  // Winning team: from liveScores status or from winner_team on the game record
  const awayWinner = isHotPickFinal && userHotPickGame
    ? (userHotPickGame.winner_team
        ? userHotPickGame.winner_team === userHotPickGame.away_team
        : (awayScoreDisplay ?? 0) > (homeScoreDisplay ?? 0))
    : false;
  const homeWinner = isHotPickFinal && userHotPickGame
    ? (userHotPickGame.winner_team
        ? userHotPickGame.winner_team === userHotPickGame.home_team
        : (homeScoreDisplay ?? 0) > (awayScoreDisplay ?? 0))
    : false;

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

  // Compute point impact — prefer live score data, fall back to game record for final games
  const liveImpact: HotPickImpact | null =
    userHotPick && userHotPickGame
      ? getHotPickImpact(userHotPick, userHotPickGame, hotPickScore ?? undefined)
      : null;

  // When game is final and live scores are gone, compute outcome directly from game record
  const gameRecordImpact: HotPickImpact | null = (() => {
    if (!isHotPickFinal || !userHotPick || !userHotPickGame) return null;
    if (!userHotPickGame.frozen_rank) return null;
    const rank = userHotPickGame.frozen_rank;
    if (userHotPickGame.winner_team) {
      const isCorrect = userHotPickGame.winner_team === userHotPick.picked_team;
      return {status: 'final', points: isCorrect ? rank : -rank, isCorrect};
    }
    if (awayScoreDisplay != null && homeScoreDisplay != null) {
      const userPickedHome = userHotPick.picked_team === userHotPickGame.home_team;
      const userScore = userPickedHome ? homeScoreDisplay : awayScoreDisplay;
      const oppScore = userPickedHome ? awayScoreDisplay : homeScoreDisplay;
      const isCorrect = userScore > oppScore;
      return {status: 'final', points: isCorrect ? rank : -rank, isCorrect};
    }
    return null;
  })();

  const impact = (liveImpact?.status !== 'unavailable' ? liveImpact : null) ?? gameRecordImpact;

  return (
    <View style={styles.container}>
      {userHotPick && userHotPickGame ? (
        <View style={[styles.hotPickSection, isHotPickLive && styles.hotPickSectionLive]}>
          {/* Header */}
          <View style={styles.hotPickHeader}>
            <View style={styles.hotPickLabelRow}>
              <Text style={styles.hotPickLabel}>This Week's HotPick:</Text>
              {isHotPickLive && (
                <Text style={styles.inProgressBadge}>LIVE</Text>
              )}
              {isHotPickFinal && (
                <Text style={styles.finalLabel}>FINAL</Text>
              )}
            </View>
            {impact && <ImpactLine impact={impact} />}
          </View>

          {/* Game day/time — just above the matchup */}
          {kickoffAt && (
            <Text style={[styles.gameDateTime, isHotPickFinal && {opacity: 0.4}]}>
              {kickoffAt.toLocaleDateString('en-US', {weekday: 'long'})}, {kickoffAt.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}
            </Text>
          )}

          {/* Matchup + clock: left side has rank + teams/scores, right side has clock anchored to bottom */}
          <View style={styles.matchupWithImpact}>
            <View style={styles.matchupRow}>
              <View style={styles.rankCircle}>
                <Text style={styles.rankNumber}>
                  {userHotPickGame.frozen_rank ?? userHotPickGame.rank ?? 0}
                </Text>
              </View>
              <View style={styles.teamsStack}>
                {/* Names column */}
                <View style={styles.teamNamesCol}>
                  {userHotPick.picked_team === userHotPickGame.away_team ? (
                    <View style={styles.pickedBox}>
                      <Text style={styles.pickedBoxText}>{getTeamName(userHotPickGame.away_team)}</Text>
                      {userHotPickGame.away_record && <Text style={styles.teamRecord}>{userHotPickGame.away_record}</Text>}
                    </View>
                  ) : (
                    <View style={styles.unpickedRow}>
                      <Text style={styles.matchupTeam}>{getTeamName(userHotPickGame.away_team)}</Text>
                      {userHotPickGame.away_record && <Text style={styles.teamRecord}>{userHotPickGame.away_record}</Text>}
                    </View>
                  )}
                  {userHotPick.picked_team === userHotPickGame.home_team ? (
                    <View style={styles.pickedBox}>
                      <Text style={styles.pickedBoxText}>{getTeamName(userHotPickGame.home_team)}</Text>
                      {userHotPickGame.home_record && <Text style={styles.teamRecord}>{userHotPickGame.home_record}</Text>}
                    </View>
                  ) : (
                    <View style={styles.unpickedRow}>
                      <Text style={styles.matchupTeam}>{getTeamName(userHotPickGame.home_team)}</Text>
                      {userHotPickGame.home_record && <Text style={styles.teamRecord}>{userHotPickGame.home_record}</Text>}
                    </View>
                  )}
                </View>
                {/* Scores column — live scores or final game scores */}
                {(hotPickScore || hasDisplayScores) && (
                  <View style={styles.scoresCol}>
                    <Text style={[
                      styles.inlineScore,
                      awayWinner && styles.inlineScoreWinner,
                    ]}>
                      {awayScoreDisplay ?? '—'}
                    </Text>
                    <Text style={[
                      styles.inlineScore,
                      homeWinner && styles.inlineScoreWinner,
                    ]}>
                      {homeScoreDisplay ?? '—'}
                    </Text>
                  </View>
                )}
                {/* Game clock — right of scores during live, FINAL badge after */}
                {isHotPickLive && hotPickScore?.currentPeriod != null && hotPickScore ? (
                  <Text style={styles.inProgressClock}>
                    Q{hotPickScore.currentPeriod}{hotPickScore.gameClock ? ` ${hotPickScore.gameClock}` : ''}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Game clock fallback — bottom-right when liveScores not yet populated */}
            {isHotPickLive && !hotPickScore && userHotPickGame.current_period != null && (
              <View style={styles.impactCorner}>
                <Text style={styles.inProgressClock}>
                  Q{userHotPickGame.current_period}{userHotPickGame.game_clock ? ` ${userHotPickGame.game_clock}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Kickoff countdown — only show when close to kickoff */}
          {!isHotPickLive && !isHotPickFinal && minutesUntilKickoff != null && minutesUntilKickoff > 0 && minutesUntilKickoff <= 60 && (
            <Text style={styles.countdownText}>
              Kickoff in {minutesUntilKickoff} min
            </Text>
          )}

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
        <Text style={[styles.impactText, {color: '#1B9A06'}]}>
          +{impact.points} if this holds {'\uD83D\uDD25'}
        </Text>
      );

    case 'losing':
      return (
        <Text style={[styles.impactText, {color: colors.error}]}>
          {'\u2212'}{Math.abs(impact.points)} at risk {'\u26A0\uFE0F'}
        </Text>
      );

    case 'tied':
      return (
        <Text style={[styles.impactText, {color: colors.textPrimary}]} numberOfLines={2}>
          This is going to be{'\n'}a great game.
        </Text>
      );

    case 'final':
      return (
        <Text style={[styles.impactText, {color: impact.isCorrect ? '#1B9A06' : colors.error}]}>
          {impact.isCorrect ? `+${impact.points} \u2705` : `\u2212${Math.abs(impact.points)} \u274C`}
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
    paddingTop: 0,
    paddingBottom: 0,
  },
  label: {
    ...typography.small,
    color: colors.highlight,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  hotPickSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md / 2,
    paddingBottom: spacing.md / 2,
  },
  hotPickSectionLive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  unpickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamRecord: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 10,
  },
  gameDateTime: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hotPickHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm / 2,
  },
  hotPickLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  hotPickLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  inProgressBadge: {
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#1b9a06',
  },
  inProgressClock: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textPrimary,
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
  matchupWithImpact: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  impactCorner: {
    alignItems: 'flex-end',
  },
  teamsStack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  teamNamesCol: {
    gap: 2,
  },
  scoresCol: {
    gap: 2,
    alignItems: 'flex-end',
  },
  rankCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  matchupTeam: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    marginLeft: 10, // align with pickedBox text (8px padding + 2px border)
  },
  inlineScore: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  inlineScoreWinner: {
    color: '#1B9A06',
  },
  finalLabel: {
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    color: colors.error,
    letterSpacing: 0.5,
  },
  pickedBox: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.highlight,
    borderRadius: 4,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 5,
    paddingRight: 8,
  },
  pickedBoxText: {
    fontSize: 16,
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
  impactText: {
    ...typography.body,
    fontWeight: '700',
    marginTop: 0,
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
