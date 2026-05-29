// src/shell/components/home/HomeHeader.tsx
// Slim top row for the Home Screen.
//
//   HOT PICK SPORTS                  [ NFL26 · W08 ]  ⚙
//
// Left  — text-rendered wordmark (no image asset):
//         "HOT" + "PICK" + " SPORTS"
//         "HOT" + "SPORTS" in primary flame; "PICK" in textPrimary
// Mid   — period pill (NFL26 · W08 / PRESEASON / WC / SB / etc.)
//         primary-bordered italic pill, season-year-aware (e.g. NFL26).
// Right — Settings gear, opens app settings (replaces the bottom nav
//         entry now that Home is full-bleed).

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Settings} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {shortPeriod, COMPACT_PERIOD_LENGTH} from './shortPeriod';

export function HomeHeader() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const seasonYear       = useSeasonStore(s => s.seasonYear);

  const period = shortPeriod(currentPhase, currentWeek, playoffStartWeek, seasonYear);

  return (
    <View style={styles.row}>
      <View style={styles.wordmarkRow}>
        <Text style={[displayType.display, styles.wordmark, {color: colors.primary}]}>HOT</Text>
        <Text style={[displayType.display, styles.wordmark, {color: colors.textPrimary}]}>PICK</Text>
        <Text style={[displayType.display, styles.wordmarkSmall, {color: colors.primary}]}> SPORTS</Text>
      </View>
      <View style={styles.rightCluster}>
        <View style={[styles.pill, {borderColor: colors.primary}]}>
          {/* Static font-size step based on label length — iOS
              adjustsFontSizeToFit was ignoring our cap with italic +
              letterSpacing in play, leaving the long off-cycle labels
              ('NFL26 · OFFSEASON' / 'NFL26 · SEASON DONE') at full
              size and crowding the wordmark. ≤12 chars (W08, WC, DIV,
              SB) keeps the full 16.5px; everything longer steps down
              to 13px. */}
          <Text
            numberOfLines={1}
            style={[
              bodyType.bold,
              period.length > COMPACT_PERIOD_LENGTH ? styles.pillTextCompact : styles.pillText,
              {color: colors.primary},
            ]}>
            {period}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('SettingsTab')}
          hitSlop={10}
          style={({pressed}) => [
            styles.gearBtn,
            {opacity: pressed ? 0.6 : 1},
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open settings">
          <Settings size={22} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
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
  // Compact font for long off-cycle labels (OFFSEASON, PRESEASON,
  // SEASON DONE, WK 18 DONE) so they fit without crowding the
  // HOTPICK SPORTS wordmark or the gear icon.
  pillTextCompact: {
    fontSize: 13,
    letterSpacing: 1.1,
    fontStyle: 'italic',
  },
  gearBtn: {
    padding: 4,
  },
});
