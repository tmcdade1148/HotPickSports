import React, {useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';
import {AttentionSection} from './AttentionSection';
import {PulseSection} from './PulseSection';
import {ActionsSection} from './ActionsSection';

interface AdminDashboardProps {
  poolId: string;
  competition: string;
}

/**
 * AdminDashboard — Organizer's main admin screen.
 * Three sections: Attention (time-sensitive), Pulse (intelligence), Actions (tools).
 * Lives in shell — never imports from sport or template modules.
 */
export function AdminDashboard({poolId, competition}: AdminDashboardProps) {
  const {colors, spacing} = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        content: {
          padding: spacing.lg,
        },
        title: {
          fontSize: 28,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.lg,
        },
      }),
    [colors, spacing],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Admin Dashboard</Text>
      <AttentionSection poolId={poolId} competition={competition} />
      <PulseSection poolId={poolId} competition={competition} />
      <ActionsSection poolId={poolId} competition={competition} />
    </ScrollView>
  );
}
