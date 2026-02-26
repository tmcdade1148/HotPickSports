import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface PulseSectionProps {
  poolId: string;
  competition: string;
}

/**
 * PulseSection — Human-readable pool intelligence.
 * One or two sentences about what is happening in the pool right now.
 *
 * Future: reads from pool_pulse table (written by compute_pool_intelligence
 * Edge Function). Displays up to 2 insight strings per pool.
 */
export function PulseSection({poolId, competition}: PulseSectionProps) {
  const {colors, spacing, borderRadius} = useTheme();

  // Placeholder — will read from pool_pulse table when wired up
  const pulseItems: string[] = [];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginBottom: spacing.lg,
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
        },
        insightText: {
          fontSize: 15,
          color: colors.text,
          lineHeight: 22,
        },
        emptyText: {
          fontSize: 14,
          color: colors.textSecondary,
          fontStyle: 'italic',
        },
      }),
    [colors, spacing, borderRadius],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Pulse</Text>
      <View style={styles.card}>
        {pulseItems.length > 0 ? (
          pulseItems.map((item, i) => (
            <Text key={i} style={styles.insightText}>
              {item}
            </Text>
          ))
        ) : (
          <Text style={styles.emptyText}>
            Pool intelligence will appear here after scoring runs.
          </Text>
        )}
      </View>
    </View>
  );
}
