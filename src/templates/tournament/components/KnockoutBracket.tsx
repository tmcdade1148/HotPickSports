import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {TournamentConfig} from '@shared/types/templates';
import {colors, spacing} from '@shared/theme';

interface KnockoutBracketProps {
  config: TournamentConfig;
}

/**
 * KnockoutBracket — Visual bracket display.
 * Stub — will be fleshed out with bracket rendering logic.
 */
export function KnockoutBracket({config}: KnockoutBracketProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Knockout Bracket</Text>
      {config.knockoutRounds.map(round => (
        <View key={round.key} style={styles.roundRow}>
          <Text style={styles.roundLabel}>{round.label}</Text>
          <Text style={styles.roundDetail}>
            {round.matchCount} {round.matchCount === 1 ? 'match' : 'matches'} •
            Rank {round.rank}
            {round.isMegaPick ? ' • 🏆 MegaPick' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  roundRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roundLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  roundDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
