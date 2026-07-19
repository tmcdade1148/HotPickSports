// Full-width Submit Picks button rendered at the bottom of SeasonPicksScreen,
// directly above the bottom tab bar. Uses the shared useSeasonSubmitState
// hook so the 5-state machine (locked / no_picks / needs_hotpick /
// in_progress / submitted) stays centralized — no duplication with the
// (now-removed) tab-bar slot variant.
//
// It renders as a FLOATING PILL that mirrors the bottom nav and stacks directly
// above it — same inset, radius, height and lift, all read from
// @shared/theme/pill so the two can't drift. Two stacked pills, one shape.
//
// It was previously a flex footer: a sibling of the SectionList, outside the
// scroll content but not absolutely positioned. It got no clearance from the
// list's own `paddingBottom: navReserve` and sat flush at the screen bottom,
// underneath the floating nav pill, which made the button unreachable.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import {CheckCircle, Clock, Flame, Lock, Target} from 'lucide-react-native';
import {useTheme} from '@shell/theme';
import {useNavReserve} from '@shared/hooks/useNavReserve';
import {useSeasonSubmitState} from '@templates/season/hooks/useSeasonSubmitState';
import {spacing} from '@shared/theme';
import {PILL_HEIGHT, PILL_INSET, PILL_RADIUS, pillLift} from '@shared/theme/pill';

export function SubmitPicksFooter() {
  const {colors} = useTheme();
  const navReserve = useNavReserve();
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
    // Layer 0 — transparent positioning frame. NO background and NO shadow: an
    // elevated transparent View casts a rectangular shadow on Android. It only
    // pins the pill above the nav.
    <View
      style={[styles.frame, {bottom: navReserve + spacing.xs}]}
      pointerEvents="box-none">
      {/* Layer 1 — surface + lift. Carries the fill so the shadow has a real
          surface to cast from. No overflow:'hidden' here; on iOS that would
          clip the very shadow we're casting. */}
      <View
        style={[
          styles.pillLift,
          {backgroundColor: bgColor},
          submit.state === 'submitted' && styles.pillSubmitted,
          pillLift(colors.ink),
        ]}>
        {/* Layer 2 — the clipping surface. Same radius, transparent (layer 1
            paints it), overflow:'hidden' so the press ripple and contents stay
            inside the rounded shape. */}
        <TouchableOpacity
          style={styles.pill}
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Layer 0 — pins the pill above the nav. `bottom` is applied inline from
  // useNavReserve() so nav geometry changes propagate.
  frame: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  // Layer 1 — surface + lift. Geometry mirrors the nav pill exactly.
  pillLift: {
    marginHorizontal: PILL_INSET,
    borderRadius: PILL_RADIUS,
  },
  // Layer 2 — clipping surface.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },
  pillSubmitted: {
    opacity: 0.85,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
