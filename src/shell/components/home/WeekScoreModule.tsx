import React, {useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, Animated, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Lock} from 'lucide-react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme';


/**
 * WeekScoreModule — Rolling 3-week score strip (pure display).
 *
 * Reads all data from nflStore — no fetching, no subscriptions.
 * Shows up to 3 week score cells in a row (oldest left → newest right).
 * Each week a new cell enters on the right; the oldest exits left.
 *
 * Week 1: [ blank ] [ blank ] [ Wk 1 ]
 * Week 2: [ blank ] [ Wk 1  ] [ Wk 2 ]
 * Week 3: [ Wk 1  ] [ Wk 2  ] [ Wk 3 ]
 * Week 4: [ Wk 2  ] [ Wk 3  ] [ Wk 4 ]
 *
 * Current week cell has a primary-color border accent and a pulsing dot
 * to indicate the score is live and updating. Past week cells are dimmed.
 */

// ---------------------------------------------------------------------------
// Pulsing Dot — animated opacity loop
// ---------------------------------------------------------------------------
function PulsingDot({color}: {color: string}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        opacity,
        marginLeft: 4,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// WeekScoreModule
// ---------------------------------------------------------------------------
export function WeekScoreModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();

  // All data from nflStore — zero local fetching
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const userPickCount = useNFLStore(s => s.userPickCount);
  const currentWeekPoints = useNFLStore(s => s.currentWeekPoints);
  const weekPointsMap = useNFLStore(s => s.weekPointsMap);
  const weekRecordMap = useNFLStore(s => s.weekRecordMap);

  // Hide when no week state or no week
  // Don't gate on userPickCount — past week scores should still show
  // even when the new week has no picks yet.
  const hasPastScores = Object.keys(weekPointsMap).length > 0;
  if (!weekState || currentWeek === 0 || (!hasPastScores && userPickCount === 0)) {
    return null;
  }

  const isSettled = weekState === 'settling' || weekState === 'complete';
  const isLive = weekState === 'live' || weekState === 'locked';

  // Build 3 slots: oldest on left, newest on right
  const slots: {week: number | null}[] = [];
  for (let i = 2; i >= 0; i--) {
    const w = currentWeek - i;
    slots.push({week: w >= 1 ? w : null});
  }

  return (
    <View style={styles.widgetRow}>
      {slots.map((slot, idx) => {
        if (!slot.week) {
          // Empty placeholder
          return <View key={`empty-${idx}`} style={styles.widgetSmall} />;
        }

        const isCurrent = slot.week === currentWeek;
        const isPrevious = slot.week === currentWeek - 1;
        const isOldest = !isCurrent && !isPrevious;
        const pts = weekPointsMap[slot.week] ?? null;
        const record = weekRecordMap[slot.week];
        const display = pts == null ? '0' : pts > 0 ? `+${pts}` : `${pts}`;
        const ptsColor = pts != null && pts > 0
          ? '#1b9a06'
          : pts != null && pts < 0
            ? colors.error
            : colors.textPrimary;

        // Previous week is bright while recap is visible, dims when recap hides at kickoff.
        // Current week is dimmed until kickoff, then bright + live/settled highlight.
        const recapVisible = weekState === 'picks_open' || weekState === 'complete';
        const isActive = isLive || isSettled;
        const shouldDim = isOldest || (isPrevious && !recapVisible) || (isCurrent && !isActive);
        const showLock = !isCurrent;
        const showHighlight = isCurrent && isActive;

        return (
          <View
            key={slot.week}
            style={[
              styles.widgetSmall,
              shouldDim && styles.widgetDimmed,
              showHighlight && styles.widgetLive,
            ]}>
            <View style={styles.labelRow}>
              <Text style={[
                styles.widgetLabel,
                shouldDim && styles.labelDimmed,
              ]}>
                WEEK {slot.week}
              </Text>
              {isCurrent && weekState === 'live' && <PulsingDot color={colors.primary} />}
            </View>
            <View style={styles.widgetValueRow}>
              <Text style={[
                styles.widgetValue,
                {color: ptsColor},
                shouldDim && {opacity: 0.6},
              ]}>
                {display}
              </Text>
              <Text style={[
                styles.widgetPts,
                pts != null && pts !== 0 && {color: ptsColor},
                shouldDim && {opacity: 0.6},
              ]}>
                pts
              </Text>
              {record && record.total > 0 && (
                <Text style={[styles.recordText, shouldDim && {opacity: 0.6}, {marginLeft: 'auto'}]}>
                  {record.correct}/{record.total}
                </Text>
              )}
            </View>
            {showLock && (
              <Lock size={12} color={colors.textSecondary} style={{position: 'absolute', top: 8, right: 8}} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  widgetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  widget: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'flex-start',
  },
  widgetSmall: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'flex-start',
  },
  widgetDimmed: {
    opacity: 0.6,
  },
  widgetLive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  widgetLabel: {
    ...typography.body,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.textPrimary,
  },
  labelDimmed: {
    opacity: 1,
  },
  widgetValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  widgetValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  widgetPts: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  recordText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
