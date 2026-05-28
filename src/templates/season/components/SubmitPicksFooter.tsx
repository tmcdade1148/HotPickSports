// Full-width Submit Picks button rendered at the bottom of SeasonPicksScreen,
// directly above the bottom tab bar. Uses the shared useSeasonSubmitState
// hook so the 5-state machine (locked / no_picks / needs_hotpick /
// in_progress / submitted) stays centralized — no duplication with the
// (now-removed) tab-bar slot variant.

import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CheckCircle, Clock, Flame, Lock, Target} from 'lucide-react-native';
import {useTheme} from '@shell/theme';
import {useSeasonSubmitState} from '@templates/season/hooks/useSeasonSubmitState';
import {spacing, borderRadius} from '@shared/theme';

export function SubmitPicksFooter() {
  const {colors} = useTheme();
  const submit = useSeasonSubmitState();

  if (!submit.visible) return null;

  const bgColor = (() => {
    switch (submit.state) {
      case 'locked':        return colors.border;
      case 'no_picks':      return colors.border;
      case 'needs_hotpick': return colors.primary;
      case 'in_progress':   return colors.warning;
      case 'submitted':     return colors.success;
    }
  })();

  const textColor = (() => {
    switch (submit.state) {
      case 'locked':      return colors.textSecondary;
      case 'no_picks':    return colors.textSecondary;
      case 'in_progress': return (colors as any).ink ?? colors.onPrimary;
      default:            return colors.onPrimary;
    }
  })();

  const StateIcon = (() => {
    switch (submit.state) {
      case 'locked':        return Lock;
      case 'no_picks':      return Target;
      case 'needs_hotpick': return Flame;
      case 'in_progress':   return Clock;
      case 'submitted':     return CheckCircle;
    }
  })();

  const isDisabled = !submit.enabled && submit.state !== 'needs_hotpick';

  return (
    <View style={[styles.wrapper, {backgroundColor: colors.background, borderTopColor: colors.border}]}>
      <TouchableOpacity
        style={[
          styles.button,
          {backgroundColor: bgColor},
          submit.state === 'submitted' && styles.buttonSubmitted,
        ]}
        onPress={submit.onPress}
        disabled={isDisabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={submit.label}
        accessibilityState={{disabled: isDisabled}}>
        <StateIcon
          size={18}
          color={textColor}
          fill={submit.state === 'submitted' ? textColor : 'none'}
          strokeWidth={2}
        />
        <Text style={[styles.label, {color: textColor}]} numberOfLines={1}>
          {submit.label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  buttonSubmitted: {
    opacity: 0.85,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
