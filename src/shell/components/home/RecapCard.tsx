// RecapCard — the shared recap CARD body.
//
//   HotPick: WIN                                  16
//   BILLS vs DOLPHINS
//   1pt PICKS                        6 of 15       6
//   ┌──────────────── amber ─────────────────────────┐
//   │ WEEK 7 TOTAL:                          22 PTS  │
//
// The two rows always ADD to the footer total — the whole point of the card, and
// why the three numbers share one right-aligned tabular column.
//
// Extracted from RecapModule so the collapsible WEEK-N RECAP eyebrow (RecapModule)
// and the complete-state hero (CompleteHero — this card, expanded, always visible)
// render the SAME card, never two parallel ones with the same facts.
//
// Pure: takes the already-derived RecapData (from selectRecap), the resolved
// team and the resolved matchup — the callers read the stores, this only
// renders. `data == null` → a neutral "—": a missed/absent week has no result,
// and must never show the stale PRIOR week (the banked [BACKEND] work will
// represent a missed week as a scored 0).
//
//   Rule 2  — no "+"; fmtPoints keeps positives bare, only real negatives carry −.
//   Hard Rule #9 — every colour is a token.
//
// The matchup line replaced a lone team name, and the flame came off the result
// line with it. Which team is YOURS is marked two ways, neither of them a result
// signal: WEIGHT (bold) and the HotPick orange (colors.primary — the marker the
// chip panel and the flame already use). The opponent is neutral. RESULT colour
// (gameWon / gameLost) appears exactly twice, both on the line above: the
// WIN/LOSS word and its points. Never on a team name — a green or red team name
// doubles the result and over-saturates a compliance-sensitive surface.
//
// Matchup uses NICKNAMES ("BILLS vs DOLPHINS"): two full city+name pairs don't
// fit the line. The team-alone fallback keeps the full name — it has the room.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {PICKED_NAME_SIZE} from '@shared/components/GameChip';
import {bodyType, borderRadius, displayType, monoType, spacing} from '@shared/theme';
import {fmtPoints} from '@shared/utils/format';
import type {RecapData, RecapMatchup} from './weekRecap';

// The result label above the matchup is a quarter larger so the outcome lands
// before the teams do.
const RESULT_SIZE = Math.round(PICKED_NAME_SIZE * 1.25);
// The two row values; the footer's total is half again as large, so the week's
// bottom line reads as the headline figure of the card.
const VALUE_SIZE = 20;
const TOTAL_SIZE = Math.round(VALUE_SIZE * 1.5);
// The bar's small caps. PTS stays put; the week label opposite it is half again
// as large and carries the display weight, so the bar reads as a titled figure
// rather than two footnotes around a number.
const PTS_SIZE = 11;
const FOOTER_LABEL_SIZE = Math.round(PTS_SIZE * 1.5);
// One right-aligned column for all three numbers, and one hanging slot to its
// right — the rows leave it empty; the footer puts PTS in it, keeping the ones
// column put between the rows and the bar.
const VALUE_COL = 54;
const SUFFIX_COL = 34;

export function RecapCard({
  data,
  team,
  matchup,
  weekLabel,
}: {
  data: RecapData | null;
  /** The HotPick team alone — the fallback when the week's game isn't loaded. */
  team: string | null;
  matchup?: RecapMatchup | null;
  /**
   * "WEEK 7" / "WC" — resolved by the caller, which knows the phase, so the
   * footer names the same week the eyebrow above it does. Omitted → the footer
   * is the bare total, as before.
   */
  weekLabel?: string | null;
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
  // The HotPick team wears the HotPick MARKER (orange), not a result colour:
  // it says "this is your pick", never "this won/lost".
  const pickTeam = {color: colors.primary};
  // The base Picks are the remainder, so the two rows always add to the footer.
  const picksPoints = data.total - data.hpPoints;

  return (
    <View style={[styles.card, {backgroundColor: colors.surface}]}>
      <View style={styles.body}>
        {/* MISSED WEEK — no picks submitted, scored 0 by the finalizer. The
            HotPick and PICKS rows would both be "0 of 0", which reads as a
            played week that went badly. One honest line instead. Stated, never
            scolded: no "you missed out", no lost-value framing. The footer is
            unchanged and already renders the 0 in neutral ink — a missed week
            is not a loss, so it never takes a result colour. */}
        {data.recap.isNoShow ? (
          <Text style={[bodyType.regular, styles.noPicks, {color: colors.textSecondary}]}>
            No picks submitted this week
          </Text>
        ) : (
          <>
        {/* No HotPick designated that week → the row and the matchup drop out
            entirely. A "—" here would imply a pick that didn't resolve.
            Result line + matchup are ONE unit with no gap between them (the
            body's gap separates the block from the PICKS row below), so the
            matchup sits tight under the result where the team name used to. */}
        {data.hpResolved && (
          <View>
            <View style={[styles.row, styles.hotpickRow]}>
              <View style={styles.labelCol}>
                <View style={styles.resultLine}>
                  <Text style={[displayType.display, styles.result, {color: colors.textPrimary}]}>
                    HotPick:
                  </Text>
                  <Text style={[displayType.display, styles.result, {color: hpColor}]}>
                    {data.isHotPickCorrect ? 'WIN' : 'LOSS'}
                  </Text>
                </View>
              </View>
              <Text style={[displayType.display, styles.value, {color: hpColor}]}>
                {fmtPoints(data.hpPoints)}
              </Text>
              <View style={styles.suffix} />
            </View>
            {/* Outside labelCol on purpose: the matchup gets the card's full
                width, not the width left over beside the points column (which
                the row above reserves and this line leaves empty) — so even the
                longest pairing has room and never lands on an ellipsis. Falls
                back to the lone team name (FULL name, it has the room) when the
                week's slate isn't loaded — never "vs undefined". */}
            {matchup || team ? (
              <Text
                style={[
                  displayType.display,
                  styles.matchupLine,
                  // Base colour is the OPPONENT's (neutral); the HotPick side
                  // overrides to orange below. With no matchup the only name on
                  // the line IS the HotPick, so the whole line takes the marker.
                  matchup ? {color: colors.textPrimary} : pickTeam,
                ]}
                numberOfLines={1}>
                {matchup ? (
                  <>
                    <Text style={matchup.hotPickIsHome ? styles.opponent : pickTeam}>
                      {matchup.away}
                    </Text>
                    <Text style={[styles.vs, {color: colors.textSecondary}]}> vs </Text>
                    <Text style={matchup.hotPickIsHome ? pickTeam : styles.opponent}>
                      {matchup.home}
                    </Text>
                  </>
                ) : (
                  team
                )}
              </Text>
            ) : null}
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
          </>
        )}
      </View>

      {/* The week's total, on the AMBER bar (colors.secondary — constant in both
          modes). Text is colors.ink (#303030, also constant): ~5.2:1 on amber in
          either mode. NOT colors.background — that flips to near-white in light
          mode (~2.5:1 on amber, fails AA); it only worked when the bar was teal
          and flipped with it. */}
      <View style={[styles.footer, {backgroundColor: colors.secondary}]}>
        {/* Names the figure, so the bar isn't a bare number: "WEEK 7 TOTAL:".
            Same ink as the rest of the bar, and it takes the free space so the
            number stays pinned right, on its column. */}
        {weekLabel ? (
          <Text
            style={[displayType.display, styles.footerLabel, {color: colors.ink}]}
            numberOfLines={1}>
            {`${weekLabel} TOTAL:`}
          </Text>
        ) : null}
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
  // The missed-week line. Sized with the card's body copy, not the display
  // face — it's a statement of fact, not a headline.
  noPicks: {
    fontSize: 14,
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Two-line HotPick label (result + matchup) → top-align so the value sits on
  // the "HotPick : WIN" line it belongs to, not the middle.
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
  // Carries the size/colour/truncation for BOTH the matchup and the team-alone
  // fallback, so the two can't drift apart.
  matchupLine: {
    fontSize: PICKED_NAME_SIZE,
    marginTop: 1,
  },
  // The opponent drops to regular weight against the display default (800) the
  // parent sets — so the HotPick team reads bold wherever it correctly sits,
  // first or second. Safe to override here because displayType.display is a
  // SYSTEM font (real weights), not a fixed-weight custom family like Manrope.
  // Colour stays the parent's neutral; only the HotPick side takes the orange.
  opponent: {
    fontWeight: '400',
  },
  vs: {
    fontWeight: '400',
  },
  count: {
    fontSize: 13,
    textAlign: 'right',
    paddingRight: spacing.sm,
  },
  value: {
    ...monoType.regular,
    fontSize: VALUE_SIZE,
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
  // Takes the bar's free space (flex) so the total + PTS stay right-aligned on
  // their column whatever the label's length. No extra tracking: at this size
  // it's a label like "1pt PICKS", not a small cap, so it takes the display
  // face's own letterSpacing.
  footerLabel: {
    flex: 1,
    fontSize: FOOTER_LABEL_SIZE,
  },
  // minWidth, not width: at 1.5× a three-glyph total ("−10") fills the column,
  // so a fixed width would clip it. The right EDGE is what has to line up with
  // the rows' values, and the PTS box to its right pins that regardless of how
  // wide this grows.
  total: {
    ...monoType.regular,
    fontSize: TOTAL_SIZE,
    minWidth: VALUE_COL,
    textAlign: 'right',
  },
  pts: {
    fontSize: PTS_SIZE,
    letterSpacing: 1.4,
    width: SUFFIX_COL,
    textAlign: 'right',
  },
});
