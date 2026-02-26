import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme} from '@shell/theme';

interface ActionsSectionProps {
  poolId: string;
  competition: string;
}

/**
 * ActionsSection — Four primary action buttons for organizers.
 * Always visible. Always in the same place.
 *
 * Buttons: Message Everyone, Nudge Non-Pickers, View Members, View SmackTalk
 */
export function ActionsSection({poolId, competition}: ActionsSectionProps) {
  const {colors, spacing, borderRadius} = useTheme();

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
        grid: {
          gap: spacing.sm,
        },
        button: {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        buttonDisabled: {
          opacity: 0.5,
        },
        buttonTitle: {
          fontSize: 15,
          fontWeight: '600',
          color: colors.text,
        },
        buttonHint: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: 2,
        },
      }),
    [colors, spacing, borderRadius],
  );

  const actions = [
    {title: 'Message Everyone', hint: 'Send broadcast to all members'},
    {title: 'Nudge Non-Pickers', hint: 'Remind members who haven\'t picked'},
    {title: 'View Members', hint: 'See member list and status'},
    {title: 'View SmackTalk', hint: 'Chat with moderation tools'},
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Actions</Text>
      <View style={styles.grid}>
        {actions.map(action => (
          <TouchableOpacity
            key={action.title}
            style={[styles.button, styles.buttonDisabled]}
            disabled>
            <Text style={styles.buttonTitle}>{action.title}</Text>
            <Text style={styles.buttonHint}>{action.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
