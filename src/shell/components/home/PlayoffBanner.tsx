// src/shell/components/home/PlayoffBanner.tsx
// Playoff treatment for the in-cycle home heroes. During PLAYOFFS / SUPERBOWL
// the regular PicksOpenHero / SettlingHero / CompleteHero render unchanged
// below this banner, which adds the playoff feel the regular season doesn't
// need:
//   • Round identity + stakes  ("WILD CARD WEEKEND" / "Win or go home.")
//   • Bracket progress          (WC → DIV → CONF → SB, current marked)
//   • Playoff visual accent     (tinted band in the HotPick primary)
//   • Fresh-slate reminder      (playoff scoreboard reset)
//
// Stays within HotPick theming (useTheme) — no hardcoded brand colors.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

// Standard NFL playoff bracket. Index 0..3 = Wild Card → Super Bowl.
const ROUNDS = [
  {key: 'WC',   short: 'WC',   title: 'WILD CARD WEEKEND',        stakes: 'Win or go home.'},
  {key: 'DIV',  short: 'DIV',  title: 'DIVISIONAL ROUND',         stakes: 'Win or go home.'},
  {key: 'CONF', short: 'CONF', title: 'CONFERENCE CHAMPIONSHIPS', stakes: 'One win from the Super Bowl.'},
  {key: 'SB',   short: 'SB',   title: 'THE SUPER BOWL',           stakes: 'Winner takes all.'},
];

const PLAYOFF_START_WEEK = 19; // standard NFL mapping (matches periodLabel default)

/** Which bracket round are we on (0..3)? */
function roundIndex(phase: string, week: number): number {
  if (phase === 'SUPERBOWL') return 3;
  const offset = week - PLAYOFF_START_WEEK;
  return Math.min(Math.max(offset, 0), 3);
}

export function PlayoffBanner() {
  const {colors} = useTheme();
  const currentPhase = useNFLStore(s => s.currentPhase);
  const currentWeek  = useNFLStore(s => s.currentWeek);

  const idx = roundIndex(currentPhase, currentWeek);
  const round = ROUNDS[idx];

  return (
    <View
      style={[
        styles.band,
        {backgroundColor: hexToRgba(colors.primary, 0.08), borderColor: colors.primary},
      ]}>
      <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
        {currentPhase === 'SUPERBOWL' ? 'SUPER BOWL' : 'NFL PLAYOFFS'}
      </Text>

      <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
        {round.title}
      </Text>
      <Text style={[bodyType.bold, styles.stakes, {color: colors.primary}]}>
        {round.stakes}
      </Text>

      {/* Bracket progress: WC → DIV → CONF → SB, current round filled,
          earlier rounds done (dim-filled), later rounds faint outlines. */}
      <View style={styles.bracketRow}>
        {ROUNDS.map((r, i) => {
          const isCurrent = i === idx;
          const isPast = i < idx;
          const dotColor = isCurrent
            ? colors.primary
            : isPast
              ? hexToRgba(colors.primary, 0.45)
              : 'transparent';
          const borderColor = isCurrent || isPast ? colors.primary : colors.border;
          const labelColor = isCurrent
            ? colors.primary
            : isPast
              ? colors.textSecondary
              : colors.textTertiary;
          return (
            <React.Fragment key={r.key}>
              {i > 0 && (
                <View
                  style={[
                    styles.connector,
                    {backgroundColor: i <= idx ? hexToRgba(colors.primary, 0.45) : colors.border},
                  ]}
                />
              )}
              <View style={styles.bracketNode}>
                <View style={[styles.dot, {backgroundColor: dotColor, borderColor}]} />
                <Text style={[bodyType.bold, styles.nodeLabel, {color: labelColor}]}>
                  {r.short}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <Text style={[bodyType.regular, styles.resetNote, {color: colors.textTertiary}]}>
        Playoff scoreboard reset — the field's even again.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg + 4,
    borderWidth: 1,
    gap: spacing.xs,
  },
  eyebrow: {fontSize: 11, letterSpacing: 2},
  title: {fontSize: 26, letterSpacing: -0.5, lineHeight: 30, marginTop: 2},
  stakes: {fontSize: 13, marginTop: 2},
  bracketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  bracketNode: {alignItems: 'center', gap: 4},
  dot: {width: 14, height: 14, borderRadius: 7, borderWidth: 2},
  nodeLabel: {fontSize: 9, letterSpacing: 0.5},
  connector: {flex: 1, height: 2, marginHorizontal: 4, marginBottom: 14, borderRadius: 1},
  resetNote: {fontSize: 11, marginTop: spacing.md, fontStyle: 'italic'},
});
