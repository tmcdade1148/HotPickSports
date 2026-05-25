// Bar-sized submit button rendered in the right half of the bottom tab
// bar on the Picks tab. Replaces the old in-screen SubmitPicksButton.

import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CheckCircle, Clock, Flame, Lock, Target} from 'lucide-react-native';
import {useTheme} from '@shell/theme';
import {useSeasonSubmitState} from '@templates/season/hooks/useSeasonSubmitState';
import {spacing, borderRadius} from '@shared/theme';

export function SubmitPicksBarSlot() {
  const {colors} = useTheme();
  const submit = useSeasonSubmitState();

  if (!submit.visible) {
    return <View style={styles.slot} />;
  }

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

  // Leading icon per state — provides a non-color affordance so the
  // five states aren't distinguishable by hue alone (~8% of male users
  // can't reliably tell warning-yellow from primary-orange).
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
    <View style={styles.slot}>
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
          size={14}
          color={textColor}
          fill={submit.state === 'submitted' ? textColor : 'none'}
          strokeWidth={2}
        />
        <Text
          style={[styles.label, {color: textColor}]}
          numberOfLines={1}>
          {submit.label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  buttonSubmitted: {
    opacity: 0.75,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
