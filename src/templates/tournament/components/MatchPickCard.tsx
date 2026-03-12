import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {TournamentConfig} from '@shared/types/templates';
import type {DbTournamentMatch} from '@shared/types/database';
import {spacing, borderRadius} from '@shared/theme';
import {useTournamentStore} from '../stores/tournamentStore';
import {useTheme} from '@shell/theme';

interface MatchPickCardProps {
  match: DbTournamentMatch;
  config: TournamentConfig;
  userId: string;
}

/**
 * MatchPickCard — One match pick with HotPick toggle.
 * Never references a specific sport.
 */
export function MatchPickCard({
  match,
  config,
  userId,
}: MatchPickCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const existingPick = useTournamentStore(s => s.getMatchPick(match.match_id));
  const saveMatchPick = useTournamentStore(s => s.saveMatchPick);
  const isSaving = useTournamentStore(s => s.isSaving);

  const pickedTeam = existingPick?.picked_team ?? null;
  const isHotPick = existingPick?.is_hotpick ?? false;

  const roundConfig = config.knockoutRounds.find(r => r.key === match.stage);
  const kickoffDate = new Date(match.kickoff_at);

  const selectTeam = (teamCode: string) => {
    saveMatchPick({
      userId,
      matchId: match.match_id,
      teamCode,
      isHotPick,
    });
  };

  const toggleHotPick = () => {
    if (!pickedTeam) {
      return;
    }
    saveMatchPick({
      userId,
      matchId: match.match_id,
      teamCode: pickedTeam,
      isHotPick: !isHotPick,
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.roundLabel}>
          {roundConfig?.label ?? match.stage}
        </Text>
        <Text style={styles.date}>{kickoffDate.toLocaleDateString()}</Text>
      </View>

      <View style={styles.teams}>
        <TouchableOpacity
          style={[
            styles.teamButton,
            pickedTeam === match.home_team && styles.teamButtonSelected,
          ]}
          onPress={() => selectTeam(match.home_team)}
          disabled={isSaving}>
          <Text
            style={[
              styles.teamText,
              pickedTeam === match.home_team && styles.teamTextSelected,
            ]}>
            {match.home_team}
          </Text>
        </TouchableOpacity>

        <Text style={styles.vs}>vs</Text>

        <TouchableOpacity
          style={[
            styles.teamButton,
            pickedTeam === match.away_team && styles.teamButtonSelected,
          ]}
          onPress={() => selectTeam(match.away_team)}
          disabled={isSaving}>
          <Text
            style={[
              styles.teamText,
              pickedTeam === match.away_team && styles.teamTextSelected,
            ]}>
            {match.away_team}
          </Text>
        </TouchableOpacity>
      </View>

      {pickedTeam && (
        <TouchableOpacity
          style={[styles.hotPickToggle, isHotPick && styles.hotPickActive]}
          onPress={toggleHotPick}
          disabled={isSaving}>
          <Text
            style={[
              styles.hotPickText,
              isHotPick && styles.hotPickTextActive,
            ]}>
            🔥 HotPick ({roundConfig?.rank ?? 1}x points)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  roundLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 12,
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
  teamButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  teamText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  teamTextSelected: {
    color: colors.primary,
  },
  vs: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
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
});
