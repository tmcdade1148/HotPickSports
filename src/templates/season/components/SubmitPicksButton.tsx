import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {CheckCircle} from 'lucide-react-native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface SubmitPicksButtonProps {
  pickCount: number;
  totalGames: number;
  hotPickCount: number;
  hotPicksRequired: number;
  isWeekComplete: boolean;
  onSubmit: () => void;
  accentColor: string;
}

type SubmitState = 'no_picks' | 'in_progress' | 'submitted';

function getSubmitState(props: SubmitPicksButtonProps): SubmitState {
  if (props.isWeekComplete) return 'submitted';
  if (props.pickCount === 0) return 'no_picks';
  return 'in_progress';
}

/**
 * SubmitPicksButton — Fixed bottom button for picks validation.
 *
 * 3 states:
 * - no_picks: no picks made yet (grey, "Start picking your winners")
 * - in_progress: picks being made or changed (yellow, "Submit your picks" / "Update your picks")
 * - submitted: picks confirmed (green, "Submitted")
 *
 * Does NOT make any Supabase call — picks are already auto-saved.
 */
export function SubmitPicksButton(props: SubmitPicksButtonProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const state = getSubmitState(props);
  const {onSubmit} = props;

  const config: Record<
    SubmitState,
    {label: string; bgColor: string; enabled: boolean}
  > = {
    no_picks: {
      label: 'Start picking your winners',
      bgColor: colors.border,
      enabled: false,
    },
    in_progress: {
      label: 'Submit your picks',
      bgColor: colors.warning,
      enabled: true,
    },
    submitted: {
      label: 'Submitted',
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

const createStyles = (colors: any) => StyleSheet.create({
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
    paddingBottom: spacing.xs,
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
