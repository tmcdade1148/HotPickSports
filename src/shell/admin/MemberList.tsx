import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface MemberListProps {
  poolId: string;
  competition: string;
}

/**
 * MemberList — Full member list with engagement status indicators.
 *
 * Future: reads from member_engagement table to show:
 * - Display name, pick status (submitted/pending/not started)
 * - Last active, total points
 * - Color-coded status: green (active), amber (at_risk), grey (dormant)
 */
export function MemberList({poolId, competition}: MemberListProps) {
  const {colors, spacing, borderRadius} = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.lg,
        },
        title: {
          fontSize: 24,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.md,
        },
        placeholder: {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
          alignItems: 'center',
        },
        placeholderText: {
          fontSize: 14,
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, borderRadius],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Members</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Member list with status indicators coming soon.
        </Text>
      </View>
    </View>
  );
}
