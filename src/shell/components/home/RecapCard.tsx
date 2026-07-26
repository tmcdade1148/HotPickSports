// RecapCard — the shared recap CARD body.
//
//   HotPick 🔥 : WIN                              16
//     BUFFALO BILLS
//   1pt PICKS                        6 of 15       6
//   ┌───────────────── teal ─────────────────────────┐
//   │                                        22 PTS  │
//
// The two rows always ADD to the footer total — the whole point of the card, and
// why the three numbers share one right-aligned tabular column.
//
// Extracted from RecapModule so the collapsible WEEK-N RECAP eyebrow (RecapModule)
// and the complete-state hero (CompleteHero — this card, expanded, always visible)
// render the SAME card, never two parallel ones with the same facts.
//
// Pure: takes the already-derived RecapData (from selectRecap) + the resolved
// team. `data == null` → a neutral "—": a missed/absent week has no result, and
// must never show the stale PRIOR week (the banked [BACKEND] work will represent
// a missed week as a scored 0).
//
//   Rule 2  — no "+"; fmtPoints keeps positives bare, only real negatives carry −.
//   Rule 1  — the flame is allowed here: at week complete it's your story.
//   Hard Rule #9 — every colour is a token.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {Flame} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {PICKED_NAME_SIZE} from '@shared/components/GameChip';
import {bodyType, borderRadius, displayType, monoType, spacing} from '@shared/theme';
import {fmtPoints} from '@shared/utils/format';
import type {RecapData} from './weekRecap';

// The result label above the team name is a quarter larger so the outcome lands
// before the team does, and the flame rides with it.
const RESULT_SIZE = Math.round(PICKED_NAME_SIZE * 1.25);
const FLAME_SIZE = Math.round(RESULT_SIZE * 0.85);
// One right-aligned column for all three numbers, and one hanging slot to its
// right — the rows leave it empty; the footer puts PTS in it, keeping the ones
// column put between the rows and the bar.
const VALUE_COL = 54;
const SUFFIX_COL = 34;

export function RecapCard({
  data,
  team,
}: {
  data: RecapData | null;
  team: string | null;
}) {
  const {colors} = useTheme();

  if (data == null) {
    return (
      <View style={[styles.card, {backgroundColor: colors.surface}]}>
        <View style={styles.emptyBody}>
          <Text style={[displayType.display, styles.emptyDash, {color: colors.textTertiary}]}>
            —
          </Text>
        </View>
      </View>
    );
  }

  const hpColor = data.isHotPickCorrect ? colors.gameWon : colors.gameLost;
  // The base Picks are the remainder, so the two rows always add to the footer.
  const picksPoints = data.total - data.hpPoints;

  return (
    <View style={[styles.card, {backgroundColor: colors.surface}]}>
      <View style={styles.body}>
        {/* No HotPick designated that week → the row and the team name drop out
            entirely. A "—" here would imply a pick that didn't resolve. */}
        {data.hpResolved && (
          <View style={[styles.row, styles.hotpickRow]}>
            <View style={styles.labelCol}>
              <View style={styles.resultLine}>
                <Text style={[displayType.display, styles.result, {color: colors.textPrimary}]}>
                  HotPick
                </Text>
                <Flame size={FLAME_SIZE} color={colors.primary} strokeWidth={2.5} />
                <Text style={[displayType.display, styles.result, {color: colors.textPrimary}]}>
                  :
                </Text>
                <Text style={[displayType.display, styles.result, {color: hpColor}]}>
                  {data.isHotPickCorrect ? 'WIN' : 'LOSS'}
                </Text>
              </View>
              {team ? (
                <Text
                  style={[displayType.display, styles.team, {color: colors.primary}]}
                  numberOfLines={1}>
                  {team}
                </Text>
              ) : null}
            </View>
            <Text style={[displayType.display, styles.value, {color: hpColor}]}>
              {fmtPoints(data.hpPoints)}
            </Text>
            <View style={styles.suffix} />
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.labelCol}>
            <Text style={[displayType.display, styles.picksLabel, {color: colors.textPrimary}]}>
              1pt PICKS
            </Text>
          </View>
          <Text style={[bodyType.regular, styles.count, {color: colors.gameWon}]}>
            {`${data.picks.correct} of ${data.picks.total}`}
          </Text>
          <Text
            style={[
              displayType.display,
              styles.value,
              {color: picksPoints < 0 ? colors.gameLost : colors.gameWon},
            ]}>
            {fmtPoints(picksPoints)}
          </Text>
          <View style={styles.suffix} />
        </View>
      </View>

      {/* The week's total, on the AMBER bar (colors.secondary — constant in both
          modes). Text is colors.ink (#303030, also constant): ~5.2:1 on amber in
          either mode. NOT colors.background — that flips to near-white in light
          mode (~2.5:1 on amber, fails AA); it only worked when the bar was teal
          and flipped with it. */}
      <View style={[styles.footer, {backgroundColor: colors.secondary}]}>
        <Text style={[displayType.display, styles.total, {color: colors.ink}]}>
          {fmtPoints(data.total)}
        </Text>
        <Text style={[bodyType.bold, styles.pts, {color: colors.ink}]}>
          PTS
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden', // lets the accent bar bleed to the card's edges
  },
  body: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  emptyBody: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyDash: {
    fontSize: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Two-line HotPick label (result + team) → top-align so the value sits on the
  // "HotPick … : WIN" line it belongs to, not the middle.
  hotpickRow: {
    alignItems: 'flex-start',
  },
  labelCol: {
    flex: 1,
    minWidth: 0,
  },
  resultLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  result: {
    fontSize: RESULT_SIZE,
  },
  picksLabel: {
    fontSize: PICKED_NAME_SIZE,
  },
  team: {
    fontSize: PICKED_NAME_SIZE,
    marginTop: 1,
  },
  count: {
    fontSize: 13,
    textAlign: 'right',
    paddingRight: spacing.sm,
  },
  value: {
    ...monoType.regular,
    fontSize: 20,
    width: VALUE_COL,
    textAlign: 'right',
  },
  suffix: {
    width: SUFFIX_COL,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  total: {
    ...monoType.regular,
    fontSize: 20,
    width: VALUE_COL,
    textAlign: 'right',
  },
  pts: {
    fontSize: 11,
    letterSpacing: 1.4,
    width: SUFFIX_COL,
    textAlign: 'right',
  },
});
