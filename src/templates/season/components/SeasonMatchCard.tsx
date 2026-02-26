import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonGame} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {useSeasonStore} from '../stores/seasonStore';
import {isPickCorrect} from '../services/seasonScoring';

interface SeasonMatchCardProps {
  game: DbSeasonGame;
  config: SeasonConfig;
  userId: string;
}

/**
 * SeasonMatchCard — Card for a single weekly game.
 * Shows home vs away, team pick buttons from config.possibleOutcomes,
 * HotPick toggle, and completed-game results.
 * Never references a specific sport.
 */
export function SeasonMatchCard({
  game,
  config,
  userId,
}: SeasonMatchCardProps) {
  const {colors, spacing, borderRadius} = useTheme();
  const existingPick = useSeasonStore(s => s.getPickForGame(game.game_id));
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const savePick = useSeasonStore(s => s.savePick);
  const isSaving = useSeasonStore(s => s.isSaving);

  const pickedTeam = existingPick?.picked_team ?? null;
  const isHotPick = existingPick?.is_hot_pick ?? false;
  const isCompleted = game.status === 'completed';
  const isLive = game.status === 'live';
  const isLocked = isCompleted || isLive;

  const kickoffDate = new Date(game.kickoff_at);
  const homeTeam = config.teams.find(t => t.code === game.home_team);
  const awayTeam = config.teams.find(t => t.code === game.away_team);

  // Compute points earned for completed game
  let pointsEarned: number | null = null;
  if (isCompleted && existingPick && game.winner_team) {
    const correct = isPickCorrect(existingPick, game);
    if (correct !== null) {
      if (correct) {
        pointsEarned = isHotPick ? (game.rank ?? 1) : 1;
      } else {
        pointsEarned = 0;
      }
    }
  }

  const selectTeam = (team: string) => {
    savePick({
      userId,
      gameId: game.game_id,
      pickedTeam: team,
      isHotPick,
    });
  };

  const toggleHotPick = () => {
    if (!pickedTeam) {
      return;
    }
    savePick({
      userId,
      gameId: game.game_id,
      pickedTeam,
      isHotPick: !isHotPick,
    });
  };

  const hotPicksRemaining = config.hotPicksPerWeek - hotPickCount;
  const canToggleHotPick = isHotPick || hotPicksRemaining > 0;

  const styles = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    rankBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.sm,
    },
    rankText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textOnPrimary,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.error,
    },
    liveText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.error,
    },
    date: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    teamsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
      gap: spacing.md,
    },
    teamName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
    },
    vs: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    score: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    outcomes: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    outcomeButton: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
    },
    outcomeSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryHighlight,
    },
    outcomeCorrect: {
      borderColor: colors.success,
      backgroundColor: colors.successHighlight,
    },
    outcomeText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    outcomeTextSelected: {
      color: colors.primary,
    },
    outcomeTextCorrect: {
      color: colors.success,
    },
    hotPickToggle: {
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    hotPickActive: {
      borderColor: colors.warning,
      backgroundColor: colors.warningHighlight,
    },
    hotPickText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    hotPickTextActive: {
      color: colors.warning,
      fontWeight: '600',
    },
    hotPickDisabled: {
      opacity: 0.4,
    },
    pointsRow: {
      marginTop: spacing.sm,
      alignItems: 'flex-end',
    },
    pointsText: {
      fontSize: 14,
      fontWeight: '700',
    },
    pointsPositive: {
      color: colors.success,
    },
    pointsZero: {
      color: colors.textSecondary,
    },
  }), [colors, spacing, borderRadius]);

  return (
    <View style={styles.card}>
      {/* Header: rank badge + kickoff time + live indicator */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.rankBadge, {backgroundColor: config.color}]}>
            <Text style={styles.rankText}>#{game.rank}</Text>
          </View>
          {isLive && <View style={styles.liveDot} />}
          {isLive && <Text style={styles.liveText}>LIVE</Text>}
        </View>
        <Text style={styles.date}>
          {kickoffDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* Teams row */}
      <View style={styles.teamsRow}>
        <Text style={styles.teamName} numberOfLines={1}>
          {homeTeam?.shortName ?? game.home_team}
        </Text>
        {isCompleted && (
          <Text style={styles.score}>
            {game.home_score} - {game.away_score}
          </Text>
        )}
        {!isCompleted && <Text style={styles.vs}>vs</Text>}
        <Text style={styles.teamName} numberOfLines={1}>
          {awayTeam?.shortName ?? game.away_team}
        </Text>
      </View>

      {/* Outcome buttons — dynamic from config.possibleOutcomes */}
      <View style={styles.outcomes}>
        {config.possibleOutcomes.map(outcome => {
          // Map outcome keys to team codes for comparison with picked_team
          const teamCode =
            outcome === 'home'
              ? game.home_team
              : outcome === 'away'
                ? game.away_team
                : null;

          const isSelected = pickedTeam != null && teamCode != null && pickedTeam === teamCode;
          const isCorrect = isCompleted && game.winner_team != null && teamCode === game.winner_team;

          // Map outcome keys to display labels
          const label =
            outcome === 'home'
              ? homeTeam?.shortName ?? 'Home'
              : outcome === 'away'
                ? awayTeam?.shortName ?? 'Away'
                : 'Draw';

          return (
            <TouchableOpacity
              key={outcome}
              style={[
                styles.outcomeButton,
                isSelected && styles.outcomeSelected,
                isCorrect && styles.outcomeCorrect,
              ]}
              onPress={() => teamCode && selectTeam(teamCode)}
              disabled={isLocked || isSaving || !teamCode}>
              <Text
                style={[
                  styles.outcomeText,
                  isSelected && styles.outcomeTextSelected,
                  isCorrect && styles.outcomeTextCorrect,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* HotPick toggle — only visible after pick is made */}
      {pickedTeam && !isLocked && (
        <TouchableOpacity
          style={[styles.hotPickToggle, isHotPick && styles.hotPickActive]}
          onPress={toggleHotPick}
          disabled={(!canToggleHotPick && !isHotPick) || isSaving}>
          <Text
            style={[
              styles.hotPickText,
              isHotPick && styles.hotPickTextActive,
              !canToggleHotPick && !isHotPick && styles.hotPickDisabled,
            ]}>
            {'🔥'} HotPick ({game.rank}x pts)
          </Text>
        </TouchableOpacity>
      )}

      {/* Points earned — shown for completed games */}
      {pointsEarned !== null && (
        <View style={styles.pointsRow}>
          <Text
            style={[
              styles.pointsText,
              pointsEarned > 0 ? styles.pointsPositive : styles.pointsZero,
            ]}>
            {pointsEarned > 0 ? `+${pointsEarned} pts` : '0 pts'}
          </Text>
        </View>
      )}
    </View>
  );
}
