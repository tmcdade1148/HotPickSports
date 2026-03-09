import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {CheckCircle, Flame} from 'lucide-react-native';
import {colors, spacing, borderRadius} from '@shared/theme';

interface SubmitPicksButtonProps {
  pickCount: number;
  totalGames: number;
  hotPickCount: number;
  hotPicksRequired: number;
  isWeekComplete: boolean;
  onSubmit: () => void;
  accentColor: string;
}

type SubmitState = 'incomplete' | 'needs_hotpick' | 'ready' | 'submitted';

function getSubmitState(props: SubmitPicksButtonProps): SubmitState {
  if (props.isWeekComplete) return 'submitted';
  if (props.pickCount < props.totalGames) return 'incomplete';
  if (props.hotPickCount < props.hotPicksRequired) return 'needs_hotpick';
  return 'ready';
}

/**
 * SubmitPicksButton — Fixed bottom button for picks validation.
 *
 * 4 states:
 * - incomplete: not all games picked (disabled, grey)
 * - needs_hotpick: all picked but HotPick missing (disabled, warning)
 * - ready: all picks + HotPicks done (enabled, green)
 * - submitted: user confirmed (disabled, green faded)
 *
 * Does NOT make any Supabase call — picks are already auto-saved.
 */
export function SubmitPicksButton(props: SubmitPicksButtonProps) {
  const state = getSubmitState(props);
  const {pickCount, totalGames, hotPickCount, hotPicksRequired, onSubmit} =
    props;

  const remaining = hotPicksRequired - hotPickCount;

  const config: Record<
    SubmitState,
    {label: string; bgColor: string; enabled: boolean}
  > = {
    incomplete: {
      label: `Pick all ${totalGames} games (${pickCount}/${totalGames})`,
      bgColor: colors.border,
      enabled: false,
    },
    needs_hotpick: {
      label: 'Select Your HotPick',
      bgColor: colors.warning,
      enabled: false,
    },
    ready: {
      label: 'Lock In Picks',
      bgColor: colors.success,
      enabled: true,
    },
    submitted: {
      label: 'Picks Locked In',
      bgColor: colors.success,
      enabled: false,
    },
  };

  const {label, bgColor, enabled} = config[state];

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[
          styles.button,
          {backgroundColor: bgColor},
          state === 'submitted' && styles.buttonSubmitted,
        ]}
        onPress={onSubmit}
        disabled={!enabled}
        activeOpacity={0.8}>
        {state === 'needs_hotpick' && (
          <Flame size={18} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
        )}
        {state === 'ready' && (
          <CheckCircle size={18} color="#FFFFFF" strokeWidth={2} />
        )}
        {state === 'submitted' && (
          <CheckCircle
            size={18}
            color="#FFFFFF"
            fill="#FFFFFF"
            strokeWidth={2}
          />
        )}
        <Text style={styles.buttonText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  buttonSubmitted: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
