// Two-row header for the Picks tab.
//
//   HOT PICK SPORTS                       [ NFL26 · W08 ]  ⚙
//   TMCDADE
//
// Row 1 mirrors HomeHeader / PoolHeader (wordmark + period pill + gear).
// Row 2 is the shared PlayerName (poolie name, left) — same treatment as Home.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {Settings} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {COMPACT_PERIOD_LENGTH} from './home/shortPeriod';
import {usePeriodLabel} from './home/usePeriodLabel';
import {PlayerName} from './PlayerName';

// Ceiling on OS accessibility font enlargement for the fixed-layout header row
// (matches HomeHeader / PoolHeader). Tune on device.
const HEADER_MAX_FONT_SCALE = 1.2;

export function PicksHeader() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const period = usePeriodLabel();

  return (
    <View>
      {/* Row 1 — HotPick wordmark + period pill + gear */}
      <View style={styles.topRow}>
        <View style={styles.wordmarkRow}>
          <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={[displayType.display, styles.wordmark, {color: colors.primary}]}>HOT</Text>
          <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={[displayType.display, styles.wordmark, {color: colors.textPrimary}]}>PICK</Text>
          <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={[displayType.display, styles.wordmarkSmall, {color: colors.primary}]}> SPORTS</Text>
        </View>
        <View style={styles.rightCluster}>
          <View style={[styles.pill, {borderColor: colors.primary}]}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
              style={[
                bodyType.bold,
                period.length > COMPACT_PERIOD_LENGTH ? styles.pillTextCompact : styles.pillText,
                {color: colors.primary},
              ]}>
              {period}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('SettingsTab', {expandPools: true})}
            hitSlop={10}
            style={({pressed}) => [styles.gearBtn, {opacity: pressed ? 0.6 : 1}]}
            accessibilityRole="button"
            accessibilityLabel="Open settings">
            <Settings size={22} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Row 2 — player name (shared treatment) */}
      <View style={styles.nameRow}>
        <PlayerName style={styles.nameLeft} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmark: {
    fontSize: 15,
    letterSpacing: 0.5,
  },
  wordmarkSmall: {
    fontSize: 9,
    letterSpacing: 0.5,
    marginLeft: 1,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    paddingHorizontal: (spacing.sm + 2) * 1.5,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 16.5,
    letterSpacing: 1.2,
    fontStyle: 'italic',
  },
  pillTextCompact: {
    fontSize: 13,
    letterSpacing: 1.1,
    fontStyle: 'italic',
  },
  gearBtn: {
    padding: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    // Tightened so the player name sits closer to the week pills below.
    paddingBottom: spacing.xs,
  },
  nameLeft: {
    flex: 1,
    maxWidth: '50%',
    minWidth: 0,
  },
});
