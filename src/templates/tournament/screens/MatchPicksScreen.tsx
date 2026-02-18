import React from 'react';
import {View, Text, FlatList, StyleSheet} from 'react-native';
import {useTournamentStore} from '../stores/tournamentStore';
import {MatchPickCard} from '../components/MatchPickCard';
import {colors, spacing} from '@shared/theme';

/**
 * MatchPicksScreen — Pick winners for knockout round matches.
 * Renders a MatchPickCard for each upcoming match.
 * Never references a specific sport.
 */
export function MatchPicksScreen() {
  const config = useTournamentStore(s => s.config);
  const matches = useTournamentStore(s => s.matches);

  if (!config) {
    return null;
  }

  const knockoutMatches = matches.filter(m => m.group_name === null);

  return (
    <View style={styles.container}>
      {knockoutMatches.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Knockout Matches</Text>
          <Text style={styles.emptyText}>
            Knockout round matches will appear here once the group stage is
            complete.
          </Text>
        </View>
      ) : (
        <FlatList
          data={knockoutMatches}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <MatchPickCard match={item} config={config} />
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
