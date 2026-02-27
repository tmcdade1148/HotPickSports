import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {SeriesConfig} from '@shared/types/templates';
import type {DbSeriesMatchup} from '@shared/types/database';
import {colors, spacing, borderRadius} from '@shared/theme';
import {useSeriesStore} from '../stores/seriesStore';
import {getSeriesWinner, getSeriesLength} from '../services/seriesScoring';

interface SeriesMatchupCardProps {
  matchup: DbSeriesMatchup;
  config: SeriesConfig;
  userId: string;
}

/**
 * SeriesMatchupCard — Card for a single playoff matchup.
 * Shows seeds, win counters, winner pick, games prediction, HotPick toggle.
 * Never references a specific sport.
 */
export function SeriesMatchupCard({
  matchup,
  config,
  userId,
}: SeriesMatchupCardProps) {
  const existingPick = useSeriesStore(s => s.getPickForMatchup(matchup.series_id));
  const savePick = useSeriesStore(s => s.savePick);
  const isSaving = useSeriesStore(s => s.isSaving);
  const currentRound = useSeriesStore(s => s.currentRound);

  const pickedTeam = existingPick?.picked_winner ?? null;
  const pickedSeriesLength = existingPick?.picked_series_length ?? 0;
  const isHotPick = existingPick?.is_hot_pick ?? false;
  const isCompleted = matchup.status === 'completed';
  const winner = getSeriesWinner(matchup);
  const actualLength = isCompleted ? getSeriesLength(matchup) : null;

  const roundConfig = config.rounds[currentRound];
  const bestOf = roundConfig?.bestOf ?? 7;
  const winsNeeded = Math.ceil(bestOf / 2);

  // Generate possible game counts (e.g., [4,5,6,7] for best-of-7)
  const gameOptions = Array.from(
    {length: bestOf - winsNeeded + 1},
    (_, i) => winsNeeded + i,
  );

  const higherTeam = config.teams.find(
    t => t.code === matchup.higher_seed_team,
  );
  const lowerTeam = config.teams.find(
    t => t.code === matchup.lower_seed_team,
  );

  // Compute points earned for completed matchup
  let pointsEarned: number | null = null;
  if (isCompleted && pickedTeam && winner && roundConfig) {
    if (pickedTeam === winner) {
      let pts = isHotPick ? roundConfig.rank * 2 : roundConfig.rank;
      if (pickedSeriesLength === actualLength) {
        pts += config.seriesLengthBonusPoints;
      }
      pointsEarned = pts;
    } else {
      pointsEarned = 0;
    }
  }

  // Series status text
  const statusText = (() => {
    if (isCompleted) {
      const winnerName =
        winner === matchup.higher_seed_team
          ? higherTeam?.shortName
          : lowerTeam?.shortName;
      return `${winnerName} wins in ${actualLength}`;
    }
    if (matchup.higher_seed_wins === 0 && matchup.lower_seed_wins === 0) {
      return 'Not started';
    }
    const leader =
      matchup.higher_seed_wins >= matchup.lower_seed_wins
        ? higherTeam?.shortName
        : lowerTeam?.shortName;
    const high = Math.max(matchup.higher_seed_wins, matchup.lower_seed_wins);
    const low = Math.min(matchup.higher_seed_wins, matchup.lower_seed_wins);
    if (high === low) {
      return `Tied ${high}-${low}`;
    }
    return `${leader} leads ${high}-${low}`;
  })();

  const selectTeam = (teamCode: string) => {
    savePick({
      userId,
      seriesId: matchup.series_id,
      pickedWinner: teamCode,
      pickedSeriesLength: pickedSeriesLength || winsNeeded, // default to sweep
      isHotPick,
    });
  };

  const selectGames = (games: number) => {
    if (!pickedTeam) {
      return;
    }
    savePick({
      userId,
      seriesId: matchup.series_id,
      pickedWinner: pickedTeam,
      pickedSeriesLength: games,
      isHotPick,
    });
  };

  const toggleHotPick = () => {
    if (!pickedTeam) {
      return;
    }
    savePick({
      userId,
      seriesId: matchup.series_id,
      pickedWinner: pickedTeam,
      pickedSeriesLength: pickedSeriesLength || winsNeeded,
      isHotPick: !isHotPick,
    });
  };

  return (
    <View style={styles.card}>
      {/* Header: series status */}
      <View style={styles.header}>
        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.bestOfText}>Best of {bestOf}</Text>
      </View>

      {/* Win counters */}
      <View style={styles.winsRow}>
        <Text style={styles.winsText}>{matchup.higher_seed_wins}</Text>
        <Text style={styles.winsDash}>-</Text>
        <Text style={styles.winsText}>{matchup.lower_seed_wins}</Text>
      </View>

      {/* Team pick buttons */}
      <View style={styles.teams}>
        <TouchableOpacity
          style={[
            styles.teamButton,
            pickedTeam === matchup.higher_seed_team && styles.teamSelected,
            isCompleted &&
              winner === matchup.higher_seed_team &&
              styles.teamCorrect,
          ]}
          onPress={() => selectTeam(matchup.higher_seed_team)}
          disabled={isCompleted || isSaving}>
          <Text
            style={[
              styles.teamText,
              pickedTeam === matchup.higher_seed_team &&
                styles.teamTextSelected,
            ]}>
            {higherTeam?.shortName ?? matchup.higher_seed_team}
          </Text>
          <Text style={styles.seedLabel}>(1)</Text>
        </TouchableOpacity>

        <Text style={styles.vs}>vs</Text>

        <TouchableOpacity
          style={[
            styles.teamButton,
            pickedTeam === matchup.lower_seed_team && styles.teamSelected,
            isCompleted &&
              winner === matchup.lower_seed_team &&
              styles.teamCorrect,
          ]}
          onPress={() => selectTeam(matchup.lower_seed_team)}
          disabled={isCompleted || isSaving}>
          <Text
            style={[
              styles.teamText,
              pickedTeam === matchup.lower_seed_team &&
                styles.teamTextSelected,
            ]}>
            {lowerTeam?.shortName ?? matchup.lower_seed_team}
          </Text>
          <Text style={styles.seedLabel}>(2)</Text>
        </TouchableOpacity>
      </View>

      {/* Games prediction — only after picking a winner */}
      {pickedTeam && !isCompleted && (
        <View style={styles.gamesSection}>
          <Text style={styles.gamesLabel}>Games to win:</Text>
          <View style={styles.gamesRow}>
            {gameOptions.map(games => (
              <TouchableOpacity
                key={games}
                style={[
                  styles.gameChip,
                  pickedSeriesLength === games && styles.gameChipSelected,
                ]}
                onPress={() => selectGames(games)}
                disabled={isSaving}>
                <Text
                  style={[
                    styles.gameChipText,
                    pickedSeriesLength === games && styles.gameChipTextSelected,
                  ]}>
                  {games}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Completed: show actual games with highlight if predicted correctly */}
      {isCompleted && pickedTeam && (
        <View style={styles.gamesSection}>
          <Text style={styles.gamesLabel}>
            Predicted: {pickedSeriesLength} games
            {pickedSeriesLength === actualLength
              ? ` (+${config.seriesLengthBonusPoints} bonus!)`
              : ` (Actual: ${actualLength})`}
          </Text>
        </View>
      )}

      {/* HotPick toggle */}
      {pickedTeam && !isCompleted && (
        <TouchableOpacity
          style={[styles.hotPickToggle, isHotPick && styles.hotPickActive]}
          onPress={toggleHotPick}
          disabled={isSaving}>
          <Text
            style={[
              styles.hotPickText,
              isHotPick && styles.hotPickTextActive,
            ]}>
            {'🔥'} HotPick ({roundConfig?.rank ?? 1}x pts)
          </Text>
        </TouchableOpacity>
      )}

      {/* Points earned */}
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
    marginBottom: spacing.xs,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  bestOfText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  winsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  winsText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  winsDash: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  teams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  teamButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  teamSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  teamCorrect: {
    borderColor: colors.success,
    backgroundColor: 'rgba(6, 214, 160, 0.1)',
  },
  teamText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  teamTextSelected: {
    color: colors.primary,
  },
  seedLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  vs: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  gamesSection: {
    marginTop: spacing.sm,
  },
  gamesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  gamesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gameChip: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  gameChipSelected: {
    borderColor: colors.secondary,
    backgroundColor: 'rgba(0, 78, 137, 0.08)',
  },
  gameChipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  gameChipTextSelected: {
    color: colors.secondary,
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
