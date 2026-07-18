// Two-row pool-context header for Leaderboard + SmackTalk tabs.
//
//   HOT PICK SPORTS                  [ NFL26 · W08 ]
//   TMCDADE                              MES QUE POOL ⌄
//
// Row 1 mirrors HomeHeader (wordmark + period pill). The Settings gear moved
// to the bottom nav as a real tab (slice 2).
// Row 2: the shared PlayerName on the LEFT (same treatment as Home / Picks) and
// the Contest name on the RIGHT (secondary, truncated).

import React, {useState} from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View, TouchableOpacity} from 'react-native';
import {ChevronDown} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType, bodyType, spacing, borderRadius} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';
import {COMPACT_PERIOD_LENGTH} from './home/shortPeriod';
import {usePeriodLabel} from './home/usePeriodLabel';
import {PlayerName} from './PlayerName';
import {ContestSwitchModal} from './ContestSwitchModal';

// Ceiling on OS accessibility font enlargement for the fixed-layout header row
// (matches HomeHeader / PicksHeader). Tune on device.
const HEADER_MAX_FONT_SCALE = 1.2;

export function PoolHeader() {
  const {colors} = useTheme();
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const activePool = visiblePools.find(p => p.id === activePoolId);
  const hasVisiblePools = visiblePools.length > 0;
  const [switchVisible, setSwitchVisible] = useState(false);
  const period = usePeriodLabel();
  const contestName = (
    activePool?.name ?? `Join a ${LEXICON.contest.singular}`
  ).toUpperCase();

  return (
    // Shares Home's chrome transparency via `colors.chrome` so the two can
    // never drift. NOTE: this header is still in NORMAL FLOW — nothing scrolls
    // behind it, so the alpha is invisible here today. Converting it to a
    // floating overlay (absolute + re-padding the screen by its measured
    // height, the way HomeScreen does) is DEFERRED to slices 3-7 when we're
    // already working in these screens. Deferred, not forgotten.
    <View style={{backgroundColor: colors.chrome}}>
      {/* Row 1 — HotPick wordmark + period pill (HomeHeader shape) */}
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
        </View>
      </View>

      {/* Row 2 — player name (left) + contest switcher (right).
          The chevron IS the scope boundary: this header renders only on
          Ladder/Chirp, and tapping it switches the contest both tabs follow
          (shared ContestSwitchModal → setActivePoolId). Home/Picks/Settings
          are contest-agnostic and never get this header. */}
      <View style={styles.nameRow}>
        <PlayerName style={styles.nameLeft} />
        {hasVisiblePools ? (
          <TouchableOpacity
            style={styles.contestSwitch}
            onPress={() => setSwitchVisible(true)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Switch Contest">
            <Text
              style={[displayType.display, styles.contestName, {color: colors.textSecondary}]}
              numberOfLines={1}>
              {contestName}
            </Text>
            <ChevronDown size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <Text
            style={[displayType.display, styles.contestName, {color: colors.textSecondary}]}
            numberOfLines={1}>
            {contestName}
          </Text>
        )}
      </View>

      <ContestSwitchModal
        visible={switchVisible}
        onClose={() => setSwitchVisible(false)}
      />
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
  // Single governor for how wide the Contest name + chevron may get. The Text
  // inside must NOT carry its own maxWidth — a percentage there resolves
  // against THIS box, not the row, so the two caps compounded (~48% of ~52%
  // ≈ a quarter of the row) and truncated the name far too early.
  contestSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '58%',
    gap: 2,
    justifyContent: 'flex-end',
  },
  nameRow: {
    flexDirection: 'row',
    // BASELINE, not center. The Contest side is a text+chevron row while the
    // Player side is naked text, so centering aligned the two BOXES and left
    // the text bottoms off by the chevron's half-height. Baseline aligns the
    // glyphs: the row takes its baseline from the Contest name Text (the first
    // baseline-bearing child inside contestSwitch), so both names sit on one
    // line. contestSwitch stays centered internally so the chevron still reads
    // as paired with the text rather than dropping to the text's baseline.
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.sm,
    gap: 12,
  },
  nameLeft: {
    flex: 1,
    maxWidth: '50%',
    minWidth: 0,
  },
  // Contest name is secondary to the player identity now — right-aligned,
  // smaller, truncated, capped so a long name can't crowd the player name.
  contestName: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 18,
    lineHeight: 22,
  },
});
