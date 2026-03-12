import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {GroupConfig, TeamConfig} from '@shared/types/templates';
import {spacing, borderRadius} from '@shared/theme';
import {useTournamentStore} from '../stores/tournamentStore';
import {useTheme} from '@shell/theme';

interface GroupCardProps {
  group: GroupConfig;
  advancingCount: number;
  accentColor: string;
  userId: string;
}

/**
 * GroupCard — Renders one group's teams with advancement pick toggles.
 * Uses the tournament_group_picks model: each group stores first_place_team
 * and second_place_team. Tapping a team toggles it into the next open slot.
 * Parameterized by group config — never references a specific sport.
 */
export function GroupCard({
  group,
  advancingCount,
  accentColor,
  userId,
}: GroupCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const groupPick = useTournamentStore(s => s.getGroupPick(group.name));
  const selectedTeams = useTournamentStore(s =>
    s.getGroupPickCodes(group.name),
  );
  const saveGroupPick = useTournamentStore(s => s.saveGroupPick);
  const isSaving = useTournamentStore(s => s.isSaving);

  const toggleTeam = (teamCode: string) => {
    const isCurrentlySelected = selectedTeams.includes(teamCode);

    if (isCurrentlySelected) {
      // Remove team: shift second into first if needed
      const first = groupPick?.first_place_team ?? '';
      const second = groupPick?.second_place_team ?? '';

      if (teamCode === first) {
        // Remove first place — promote second to first
        saveGroupPick({
          userId,
          groupLetter: group.name,
          firstPlaceTeam: second,
          secondPlaceTeam: '',
        });
      } else {
        // Remove second place
        saveGroupPick({
          userId,
          groupLetter: group.name,
          firstPlaceTeam: first,
          secondPlaceTeam: '',
        });
      }
    } else {
      if (selectedTeams.length >= advancingCount) {
        return;
      }

      const first = groupPick?.first_place_team ?? '';
      const second = groupPick?.second_place_team ?? '';

      if (!first) {
        // First slot open
        saveGroupPick({
          userId,
          groupLetter: group.name,
          firstPlaceTeam: teamCode,
          secondPlaceTeam: second,
        });
      } else if (!second) {
        // Second slot open
        saveGroupPick({
          userId,
          groupLetter: group.name,
          firstPlaceTeam: first,
          secondPlaceTeam: teamCode,
        });
      }
    }
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
        const isFirst = groupPick?.first_place_team === team.code;
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
                <Text style={styles.checkmarkText}>
                  {isFirst ? '1' : '2'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
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
    color: colors.textPrimary,
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
