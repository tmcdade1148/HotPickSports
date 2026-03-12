import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTournamentStore} from '../stores/tournamentStore';
import {spacing} from '@shared/theme';
import {useTheme} from '@shell/theme';

/**
 * TournamentPicksHub — Routes the user to group picks or match picks.
 * Which picks are available depends on the tournament phase.
 */
export function TournamentPicksHub({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const config = useTournamentStore(s => s.config);

  if (!config) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{config.shortName} Picks</Text>
      <Text style={styles.subtitle}>
        Max {config.maxTotalPoints} points available
      </Text>

      <TouchableOpacity
        style={[styles.card, {borderLeftColor: config.color}]}
        onPress={() => navigation.navigate('GroupPicks')}>
        <Text style={styles.cardTitle}>Group Picks</Text>
        <Text style={styles.cardDescription}>
          Pick which teams advance from each group ({config.maxGroupPoints} pts
          max)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, {borderLeftColor: config.color}]}
        onPress={() => navigation.navigate('MatchPicks')}>
        <Text style={styles.cardTitle}>Match Picks</Text>
        <Text style={styles.cardDescription}>
          Pick winners for knockout round matches
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
