import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {GroupConfig, TeamConfig} from '@shared/types/templates';
import {colors, spacing, borderRadius} from '@shared/theme';
import {useTournamentStore} from '../stores/tournamentStore';

interface GroupCardProps {
  group: GroupConfig;
  advancingCount: number;
  accentColor: string;
  userId: string;
}

/**
 * GroupCard — Renders one group's teams with advancement pick toggles.
 * Parameterized by group config — never references a specific sport.
 */
export function GroupCard({
  group,
  advancingCount,
  accentColor,
  userId,
}: GroupCardProps) {
  const selectedTeams = useTournamentStore(s =>
    s.getGroupPickCodes(group.name),
  );
  const saveGroupPick = useTournamentStore(s => s.saveGroupPick);
  const isSaving = useTournamentStore(s => s.isSaving);

  const toggleTeam = (teamCode: string) => {
    const isCurrentlySelected = selectedTeams.includes(teamCode);

    if (!isCurrentlySelected && selectedTeams.length >= advancingCount) {
      return;
    }

    saveGroupPick({
      userId,
      groupName: group.name,
      teamCode,
      selected: !isCurrentlySelected,
    });
  };

  return (
    <View style={styles.card}>
      <View style={[styles.header, {backgroundColor: accentColor}]}>
        <Text style={styles.headerText}>Group {group.name}</Text>
        <Text style={styles.headerHint}>
          Pick {advancingCount} to advance
        </Text>
      </View>
      {group.teams.map((team: TeamConfig) => {
        const isSelected = selectedTeams.includes(team.code);
        return (
          <TouchableOpacity
            key={team.code}
            style={[styles.teamRow, isSelected && styles.teamRowSelected]}
            onPress={() => toggleTeam(team.code)}
            disabled={isSaving}>
            <Text style={styles.teamCode}>{team.shortName}</Text>
            <Text style={styles.teamName}>{team.name}</Text>
            {isSelected && (
              <View style={[styles.checkmark, {backgroundColor: accentColor}]}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  teamRowSelected: {
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  teamCode: {
    width: 40,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  teamName: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
