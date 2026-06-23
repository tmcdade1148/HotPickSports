// src/shell/components/home/PlayoffBanner.tsx
// Compact playoff treatment for the in-cycle home heroes (+ the Super Bowl
// bridge). During the playoffs the regular heroes render unchanged below this
// band, which adds: round identity, a WC → DIV → CONF → SB bracket-progress
// indicator (current round marked), a HotPick-primary accent, an ⓘ that opens
// the playoff-rules popup, and — on Wild Card only — a scoreboard-reset note.
//
// Note: no team "win or go home" stakes line — the PLAYER plays every round
// regardless of which teams advance, so that framing doesn't apply to them.

import React, {useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {Info} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';
import {PlayoffRulesModal} from './PlayoffRulesModal';

const ROUNDS = [
  {key: 'WC',   short: 'WC',   title: 'WILD CARD WEEKEND'},
  {key: 'DIV',  short: 'DIV',  title: 'DIVISIONAL ROUND'},
  {key: 'CONF', short: 'CONF', title: 'CONFERENCE CHAMPIONSHIPS'},
  {key: 'SB',   short: 'SB',   title: 'THE SUPER BOWL'},
];

const PLAYOFF_START_WEEK = 19; // standard NFL mapping (matches periodLabel default)

/** Which bracket round (0..3)? Super Bowl + its intro bridge both = 3. */
function roundIndex(phase: string, week: number): number {
  if (phase === 'SUPERBOWL' || phase === 'SUPERBOWL_INTRO') return 3;
  const offset = week - PLAYOFF_START_WEEK;
  return Math.min(Math.max(offset, 0), 3);
}

export function PlayoffBanner() {
  const {colors} = useTheme();
  const currentPhase = useNFLStore(s => s.currentPhase);
  const currentWeek  = useNFLStore(s => s.currentWeek);
  const [rulesOpen, setRulesOpen] = useState(false);

  const idx = roundIndex(currentPhase, currentWeek);
  const round = ROUNDS[idx];
  const isWildCard = idx === 0;

  return (
    <View
      style={[
        styles.band,
        {backgroundColor: hexToRgba(colors.primary, 0.08), borderColor: colors.primary},
      ]}>
      {/* Round identity + ⓘ rules link. */}
      <View style={styles.topRow}>
        <View style={{flex: 1}}>
          <Text style={[bodyType.bold, styles.eyebrow, {color: colors.primary}]}>
            {currentPhase === 'SUPERBOWL' || currentPhase === 'SUPERBOWL_INTRO'
              ? 'SUPER BOWL'
              : 'NFL PLAYOFFS'}
          </Text>
          <Text style={[displayType.display, styles.title, {color: colors.textPrimary}]}>
            {round.title}
          </Text>
        </View>
        <Pressable
          onPress={() => setRulesOpen(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Playoff rules">
          <Info size={20} color={colors.primary} strokeWidth={2.25} />
        </Pressable>
      </View>

      {/* Bracket progress: WC → DIV → CONF → SB. */}
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
                <Text style={[bodyType.bold, styles.nodeLabel, {color: labelColor}]}>{r.short}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Fresh-slate reminder — Wild Card only (by Divisional everyone knows). */}
      {isWildCard && (
        <Text style={[bodyType.regular, styles.resetNote, {color: colors.textTertiary}]}>
          Playoff scoreboard reset — the field's even again.
        </Text>
      )}

      <PlayoffRulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg + 4,
    borderWidth: 1,
    gap: spacing.sm,
  },
  topRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  eyebrow: {fontSize: 10, letterSpacing: 1.8},
  title: {fontSize: 20, letterSpacing: -0.4, lineHeight: 23, marginTop: 1},
  bracketRow: {flexDirection: 'row', alignItems: 'center'},
  bracketNode: {alignItems: 'center', gap: 3},
  dot: {width: 12, height: 12, borderRadius: 6, borderWidth: 2},
  nodeLabel: {fontSize: 8, letterSpacing: 0.5},
  connector: {flex: 1, height: 2, marginHorizontal: 4, marginBottom: 12, borderRadius: 1},
  resetNote: {fontSize: 11, fontStyle: 'italic'},
});
