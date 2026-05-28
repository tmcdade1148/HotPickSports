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
import {getPeriodLabel} from './periodLabel';

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
          <Text style={[bodyType.bold, styles.pillText, {color: colors.primary}]}>
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

/** Short form: "NFL26 · W08", "NFL26 · PRESEASON", "NFL26 · WC", "NFL26 · SB" */
function shortPeriod(
  phase: string,
  week: number | null,
  playoffStart = 19,
  seasonYear?: number,
): string {
  // Two-digit suffix tied to season — e.g. "NFL26" for the 2025-26 season
  // (Sep 2025 → Feb 2026). The competition_config seasonYear is the
  // year the Super Bowl falls in, so the suffix is the last 2 digits.
  const suffix = typeof seasonYear === 'number' && seasonYear > 0
    ? String(seasonYear).slice(-2)
    : '26';
  const sport = `NFL${suffix}`;
  if (phase === 'OFF_SEASON')        return `${sport} · OFFSEASON`;
  if (phase === 'PRE_SEASON')        return `${sport} · PRESEASON`;
  if (phase === 'REGULAR_COMPLETE')  return `${sport} · WK 18 DONE`;
  if (phase === 'SUPERBOWL_INTRO')   return `${sport} · SB WEEK`;
  if (phase === 'SUPERBOWL')         return `${sport} · SB`;
  if (phase === 'SEASON_COMPLETE')   return `${sport} · SEASON DONE`;

  if (phase === 'PLAYOFFS' && typeof week === 'number') {
    const offset = week - playoffStart;
    if (offset === 0) return `${sport} · WC`;
    if (offset === 1) return `${sport} · DIV`;
    if (offset === 2) return `${sport} · CONF`;
    return `${sport} · PLAYOFFS`;
  }

  if (typeof week === 'number') return `${sport} · W${String(week).padStart(2, '0')}`;
  return `${sport} · ${getPeriodLabel(phase, week, playoffStart)}`;
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
  gearBtn: {
    padding: 4,
  },
});
