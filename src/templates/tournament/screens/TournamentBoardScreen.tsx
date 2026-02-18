import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTournamentStore} from '../stores/tournamentStore';
import {TournamentProgress} from '../components/TournamentProgress';
import {colors, spacing} from '@shared/theme';

/**
 * TournamentBoardScreen — Leaderboard showing pool standings.
 * Never references a specific sport.
 */
export function TournamentBoardScreen() {
  const config = useTournamentStore(s => s.config);

  if (!config) {
    return null;
  }

  return (
    <View style={styles.container}>
      <TournamentProgress config={config} />

      <View style={styles.leaderboard}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Scores will appear here once matches are played.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  leaderboard: {
    flex: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
