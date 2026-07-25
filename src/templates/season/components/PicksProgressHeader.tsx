import React from 'react';
import {Text} from '@shared/components/AppText';
import {View, StyleSheet} from 'react-native';
import {HotPickFlame} from '@shared/components/HotPickFlame';
import {PickProgressBar} from '@shared/components/PickProgressBar';
import {spacing} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface PicksProgressHeaderProps {
  currentWeek: number;
  pickCount: number;
  totalGames: number;
  hotPickCount: number;
  hotPicksRequired: number;
  accentColor: string;
}

/**
 * PicksProgressHeader — Replaces the plain "Week X Picks" header.
 *
 * Shows:
 * 1. Week title + pick count with flame when picking starts
 * 2. Progress bar — orange while filling, green when all picked (PickProgressBar)
 *
 * Count turns orange on first pick, green + bold when all picked (matching the
 * bar — no more yellow mid-state).
 * A small flame appears left of the count once picks start.
 */
export function PicksProgressHeader({
  currentWeek,
  pickCount,
  totalGames,
  hotPickCount,
  hotPicksRequired,
  accentColor,
}: PicksProgressHeaderProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const allPicked = pickCount >= totalGames && totalGames > 0;
  const hasPicks = pickCount > 0;

  // Count colour tracks the shared bar: orange while filling, green when
  // complete. Yellow is dropped from both (spec §3.2).
  const countColor = allPicked
    ? colors.gameWon
    : hasPicks
      ? colors.primary
      : colors.textSecondary;

  const hasHotPick = hotPickCount >= hotPicksRequired;

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.weekTitle}>WEEK {currentWeek} PICKS</Text>
        <View style={styles.rightRow}>
          {/* HotPick flame + pick count */}
          <HotPickFlame
            size={36}
            active={hasHotPick}
          />
          <Text
            style={[
              styles.pickCountText,
              {color: countColor},
              allPicked && styles.pickCountComplete,
            ]}>
            {pickCount}/{totalGames}
          </Text>
        </View>
      </View>

      {/* Progress bar — the shared element (also on Home's picks_open surface). */}
      <PickProgressBar picksSet={pickCount} totalGames={totalGames} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    // Tightened top so this WEEK X / flame / pick-count line sits closer to
    // the week pills above it.
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    color: colors.accentTeal,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickCountText: {
    fontSize: 28,
    fontWeight: '700',
  },
  pickCountComplete: {
    fontWeight: '800',
  },
});
