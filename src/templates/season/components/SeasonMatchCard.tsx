import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbSeasonMatch} from '@shared/types/database';
import {colors, spacing, borderRadius} from '@shared/theme';
import {useSeasonStore} from '../stores/seasonStore';
import {determineOutcome} from '../services/seasonScoring';

interface SeasonMatchCardProps {
  match: DbSeasonMatch;
  config: SeasonConfig;
  userId: string;
}

/**
 * SeasonMatchCard — Card for a single weekly match.
 * Shows home vs away, outcome buttons from config.possibleOutcomes,
 * HotPick toggle, and completed-match results.
 * Never references a specific sport.
 */
export function SeasonMatchCard({
  match,
  config,
  userId,
}: SeasonMatchCardProps) {
  const existingPick = useSeasonStore(s => s.getPickForMatch(match.id));
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const savePick = useSeasonStore(s => s.savePick);
  const isSaving = useSeasonStore(s => s.isSaving);

  const pickedOutcome = existingPick?.picked_outcome ?? null;
  const isHotPick = existingPick?.is_hot_pick ?? false;
  const isCompleted = match.status === 'completed';
  const isLive = match.status === 'live';
  const isLocked = isCompleted || isLive;
  const actualOutcome = determineOutcome(match);

  const kickoffDate = new Date(match.kickoff_time);
  const homeTeam = config.teams.find(t => t.code === match.home_team_code);
  const awayTeam = config.teams.find(t => t.code === match.away_team_code);

  // Compute points earned for completed match
  let pointsEarned: number | null = null;
  if (isCompleted && pickedOutcome && actualOutcome) {
    if (pickedOutcome === actualOutcome) {
      pointsEarned = isHotPick ? match.rank : 1;
    } else {
      pointsEarned = 0;
    }
  }

  const selectOutcome = (outcome: string) => {
    savePick({
      userId,
      matchId: match.id,
      pickedOutcome: outcome,
      isHotPick,
    });
  };

  const toggleHotPick = () => {
    if (!pickedOutcome) {
      return;
    }
    savePick({
      userId,
      matchId: match.id,
      pickedOutcome,
      isHotPick: !isHotPick,
    });
  };

  const hotPicksRemaining = config.hotPicksPerWeek - hotPickCount;
  const canToggleHotPick = isHotPick || hotPicksRemaining > 0;

  return (
    <View style={styles.card}>
      {/* Header: rank badge + kickoff time + live indicator */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.rankBadge, {backgroundColor: config.color}]}>
            <Text style={styles.rankText}>#{match.rank}</Text>
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
          {homeTeam?.shortName ?? match.home_team_code}
        </Text>
        {isCompleted && (
          <Text style={styles.score}>
            {match.home_score} - {match.away_score}
          </Text>
        )}
        {!isCompleted && <Text style={styles.vs}>vs</Text>}
        <Text style={styles.teamName} numberOfLines={1}>
          {awayTeam?.shortName ?? match.away_team_code}
        </Text>
      </View>

      {/* Outcome buttons — dynamic from config.possibleOutcomes */}
      <View style={styles.outcomes}>
        {config.possibleOutcomes.map(outcome => {
          const isSelected = pickedOutcome === outcome;
          const isCorrect = isCompleted && outcome === actualOutcome;

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
              onPress={() => selectOutcome(outcome)}
              disabled={isLocked || isSaving}>
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
      {pickedOutcome && !isLocked && (
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
            {'🔥'} HotPick ({match.rank}x pts)
          </Text>
        </TouchableOpacity>
      )}

      {/* Points earned — shown for completed matches */}
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

const styles = StyleSheet.create({
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
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  outcomeCorrect: {
    borderColor: colors.success,
    backgroundColor: 'rgba(6, 214, 160, 0.1)',
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
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
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
});
