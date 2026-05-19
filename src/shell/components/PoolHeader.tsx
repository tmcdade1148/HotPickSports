// Slim pool-context header for Leaderboard + SmackTalk tabs.
//
//   MES QUE POOL                 [ NFL26 · W08 ]  ⚙
//
// Mirrors HomeHeader's spacing/feel but replaces the wordmark with the
// active pool's name (large, bold, italic). Pool switching has moved
// to Settings → My Pools — this header is read-only context, not a
// chooser.

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Settings} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {getPeriodLabel} from './home/periodLabel';

export function PoolHeader() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const currentPhase     = useNFLStore(s => s.currentPhase);
  const currentWeek      = useNFLStore(s => s.currentWeek);
  const playoffStartWeek = useSeasonStore(s => s.config?.playoffStartWeek);
  const seasonYear       = useSeasonStore(s => s.seasonYear);

  const visiblePools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const activePool   = visiblePools.find(p => p.id === activePoolId);

  const period = shortPeriod(currentPhase, currentWeek, playoffStartWeek, seasonYear);
  const title = activePool?.name ?? 'JOIN A POOL';

  return (
    <View style={styles.row}>
      <Text
        style={[displayType.display, styles.poolName, {color: colors.textPrimary}]}
        numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.rightCluster}>
        <View style={[styles.pill, {borderColor: colors.primary}]}>
          <Text style={[bodyType.bold, styles.pillText, {color: colors.primary}]}>
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
  );
}

function shortPeriod(
  phase: string,
  week: number | null,
  playoffStart = 19,
  seasonYear?: number,
): string {
  const suffix = typeof seasonYear === 'number' && seasonYear > 0
    ? String(seasonYear).slice(-2)
    : '26';
  const sport = `NFL${suffix}`;
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
    gap: 8,
  },
  poolName: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: 0.4,
    fontStyle: 'italic',
    fontWeight: '900',
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
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
