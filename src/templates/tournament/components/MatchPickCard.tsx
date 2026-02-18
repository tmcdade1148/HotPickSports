import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {TournamentConfig} from '@shared/types/templates';
import type {DbTournamentMatch} from '@shared/types/database';
import {colors, spacing, borderRadius} from '@shared/theme';

interface MatchPickCardProps {
  match: DbTournamentMatch;
  config: TournamentConfig;
}

/**
 * MatchPickCard — One match pick with HotPick toggle.
 * Never references a specific sport.
 */
export function MatchPickCard({match, config}: MatchPickCardProps) {
  const [pickedTeam, setPickedTeam] = useState<string | null>(null);
  const [isHotPick, setIsHotPick] = useState(false);

  const roundConfig = config.knockoutRounds.find(r => r.key === match.round);
  const kickoffDate = new Date(match.kickoff_time);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.roundLabel}>
          {roundConfig?.label ?? match.round}
        </Text>
        <Text style={styles.date}>{kickoffDate.toLocaleDateString()}</Text>
      </View>

      <View style={styles.teams}>
        <TouchableOpacity
          style={[
            styles.teamButton,
            pickedTeam === match.home_team_code && styles.teamButtonSelected,
          ]}
          onPress={() => setPickedTeam(match.home_team_code)}>
          <Text
            style={[
              styles.teamText,
              pickedTeam === match.home_team_code && styles.teamTextSelected,
            ]}>
            {match.home_team_code}
          </Text>
        </TouchableOpacity>

        <Text style={styles.vs}>vs</Text>

        <TouchableOpacity
          style={[
            styles.teamButton,
            pickedTeam === match.away_team_code && styles.teamButtonSelected,
          ]}
          onPress={() => setPickedTeam(match.away_team_code)}>
          <Text
            style={[
              styles.teamText,
              pickedTeam === match.away_team_code && styles.teamTextSelected,
            ]}>
            {match.away_team_code}
          </Text>
        </TouchableOpacity>
      </View>

      {pickedTeam && (
        <TouchableOpacity
          style={[styles.hotPickToggle, isHotPick && styles.hotPickActive]}
          onPress={() => setIsHotPick(!isHotPick)}>
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
    color: colors.text,
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
