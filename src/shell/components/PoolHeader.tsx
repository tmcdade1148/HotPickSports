// Two-row pool-context header for Leaderboard + SmackTalk tabs.
//
//   HOT PICK SPORTS                  [ NFL26 · W08 ]  ⚙
//   MES QUE POOL
//
// Row 1 mirrors HomeHeader exactly (wordmark + period pill + gear).
// Row 2 is an IdentityBar-style pool name: large/bold/italic, hard-capped
// at 50% of screen width, auto-fits its font to whatever fits.

import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Settings} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {shortPeriod, COMPACT_PERIOD_LENGTH} from './home/shortPeriod';

const NAME_MAX_FONT  = 40;
const NAME_MIN_FONT  = 12;
const NAME_LINE      = 44;
const NAME_RIGHT_PAD = 6;

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
  const display = (activePool?.name ?? 'JOIN A CONTEST').toUpperCase();

  // Same auto-fit as IdentityBar: measure rendered width at NAME_MAX_FONT
  // unconstrained, then scale font to fit the actual column width (cap at
  // 50% of row via maxWidth on the left wrap).
  const [leftWidth, setLeftWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const usableWidth = Math.max(0, leftWidth - NAME_RIGHT_PAD);
  const scale = naturalWidth > 0 && usableWidth > 0 && naturalWidth > usableWidth
    ? usableWidth / naturalWidth
    : 1;
  const nameFontSize = Math.max(
    NAME_MIN_FONT,
    Math.min(NAME_MAX_FONT, Math.floor(NAME_MAX_FONT * scale)),
  );

  return (
    <View>
      {/* Row 1 — HotPick wordmark + period pill + gear (HomeHeader shape) */}
      <View style={styles.topRow}>
        <View style={styles.wordmarkRow}>
          <Text style={[displayType.display, styles.wordmark, {color: colors.primary}]}>HOT</Text>
          <Text style={[displayType.display, styles.wordmark, {color: colors.textPrimary}]}>PICK</Text>
          <Text style={[displayType.display, styles.wordmarkSmall, {color: colors.primary}]}> SPORTS</Text>
        </View>
        <View style={styles.rightCluster}>
          <View style={[styles.pill, {borderColor: colors.primary}]}>
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
            onPress={() => navigation.navigate('SettingsTab', {expandPools: true})}
            hitSlop={10}
            style={({pressed}) => [styles.gearBtn, {opacity: pressed ? 0.6 : 1}]}
            accessibilityRole="button"
            accessibilityLabel="Open settings">
            <Settings size={22} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Row 2 — pool name, capped at 50% width, auto-fit font */}
      <View style={styles.nameRow}>
        <View style={styles.nameLeft} onLayout={e => setLeftWidth(e.nativeEvent.layout.width)}>
          <Text
            style={[
              displayType.display,
              styles.name,
              {color: colors.textPrimary, fontSize: nameFontSize},
            ]}
            numberOfLines={1}>
            {display}
          </Text>
          <Text
            style={[displayType.display, styles.nameProbe, {fontSize: NAME_MAX_FONT}]}
            numberOfLines={1}
            onTextLayout={e => {
              const w = e.nativeEvent.lines?.[0]?.width;
              if (typeof w === 'number') setNaturalWidth(w);
            }}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none">
            {display}
          </Text>
        </View>
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
  // Compact font for long off-cycle labels — matches HomeHeader so
  // the pill looks the same across every tab.
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  nameLeft: {
    flex: 1,
    maxWidth: '50%',
    minWidth: 0,
  },
  name: {
    lineHeight: NAME_LINE,
    paddingRight: NAME_RIGHT_PAD,
  },
  nameProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
    width: 10000,
  },
});
