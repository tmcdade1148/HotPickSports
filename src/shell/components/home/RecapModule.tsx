// RecapModule — Home's WEEK n RECAP card.
//
// Split out of HistoryModule.tsx in the eyebrow design pass: Recap and HISTORY
// were one file and therefore one chevron. They are separate stories about the
// same season and collapse independently now.
//
//   HotPick 🔥 : WIN                              16
//     BUFFALO BILLS
//   1pt PICKS                        6 of 15       6
//   ┌───────────────── teal ─────────────────────────┐
//   │                                        22 PTS  │
//
// The two rows always ADD to the footer total — that is the whole point of the
// card, and it's why the three numbers share one right-aligned tabular column.
// Break the column and the arithmetic stops being checkable at a glance.
//
// The rules it holds:
//   Rule 2  — no "+" anywhere. A positive number is bare (16, 22); only a
//             genuine negative carries its minus (−16). Nothing reads as a
//             potential swing.
//   Rule 1  — the flame is allowed here: at week complete it stops being your
//             call and becomes your story.
//   Hard Rule #9 — every colour is a token. No hex in this file.
//
// "6 of 15" is the NON-HotPick picks. The server's correct_picks/total_picks
// INCLUDE the HotPick, so they go through derivePickDisplay() — without it the
// card reads "7 of 16" and the arithmetic on screen stops adding up.

import React, {useMemo} from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {Flame} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme/hooks';
import {PICKED_NAME_SIZE} from '@shared/components/GameChip';
import {bodyType, borderRadius, displayType, monoType, spacing} from '@shared/theme';
import {ModuleSection} from './ModuleSection';
import {fullTeamName} from './teamColors';
import {
  HIDDEN_PHASES,
  PLAYOFF_PHASES,
  derivePickDisplay,
  fmtPoints,
  sectionWeekLabel,
  type WeekRow,
} from './weekRecap';

// The team name matches the GameChip's picked-team name exactly — the Recap is
// describing the pick that chip showed. The result label above it is a quarter
// larger so the outcome lands before the team does, and the flame rides with it.
const RESULT_SIZE = Math.round(PICKED_NAME_SIZE * 1.25);
const FLAME_SIZE = Math.round(RESULT_SIZE * 0.85);

export function RecapModule() {
  const {colors} = useTheme();
  const recentWeeks = useGlobalStore(s => s.recentWeeks) as WeekRow[];
  const lastWeekHotPick = useGlobalStore(s => s.lastWeekHotPick);
  // Current week's HotPick — supplies the picked team for the settling/complete
  // recap, where lastWeekHotPick (fetched for currentWeek−1) doesn't apply.
  const userHotPick = useNFLStore(s => s.userHotPick);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const configLoaded = useNFLStore(s => s.configLoaded);

  const phase = String(currentPhase ?? '');
  const isPlayoffs = PLAYOFF_PHASES.includes(phase);
  // Once the week is scored (all games final), it stops being "in play" and its
  // result is real — from here the current week drives the recap.
  const weekSettled = weekState === 'settling' || weekState === 'complete';

  // From SETTLING onward the recap describes THIS week, not last week: every
  // game is final, the server has scored it, and making the Player wait for the
  // next week to open before they can see their own result is the wrong beat. It
  // then stays on that week through `complete` and naturally becomes "last week"
  // when the next week opens — same row, no jump.
  //
  // Before settling it's the most recent FINISHED week.
  const recap = useMemo(() => {
    const cutoff = weekSettled ? currentWeek : currentWeek - 1;
    const eligible = recentWeeks
      .filter(w => w.week <= cutoff)
      .sort((a, b) => a.week - b.week);
    return eligible.length > 0 ? eligible[eligible.length - 1] : null;
  }, [recentWeeks, currentWeek, weekSettled]);

  // The HotPick's picked team, from whichever store holds that week's pick:
  //   • current week  → userHotPick (fetched for currentWeek)
  //   • previous week → lastWeekHotPick (fetched for currentWeek − 1)
  // Any other week has no team on hand, so the line is omitted rather than
  // showing the wrong week's team.
  const teamCode =
    recap == null
      ? null
      : recap.week === currentWeek
        ? userHotPick?.picked_team ?? null
        : recap.week === currentWeek - 1
          ? lastWeekHotPick?.team ?? null
          : null;
  const team = teamCode ? (fullTeamName(teamCode) ?? teamCode).toUpperCase() : null;

  // Hold while a competition config is loading (e.g. the moment the onboarding
  // demo exits — nflStore still holds the demo's played week until the real
  // config re-inits). Rendering here would flash the demo's leftover result.
  if (!configLoaded) return null;
  // No season to recap in the off-season / pre-season, and nothing to recap
  // until a week has actually finished.
  if (HIDDEN_PHASES.includes(phase)) return null;
  if (recap == null) return null;

  // The HotPick's own contribution is its rank signed by the outcome; the base
  // Picks are the remainder, so the two rows always add to the footer total.
  const rank = recap.hotPickRank;
  const hpWon = recap.isHotPickCorrect;
  const hpResolved = rank != null && hpWon != null;
  const hpPoints = rank == null || hpWon == null ? 0 : hpWon ? rank : -rank;
  const picksPoints = recap.total - hpPoints;
  const picks = derivePickDisplay(recap);
  const hpColor = hpWon ? colors.gameWon : colors.gameLost;

  return (
    <ModuleSection
      label={`${sectionWeekLabel(recap.week, isPlayoffs)} RECAP`}
      value={recap.total}
      collapsible>
      <View style={[styles.card, {backgroundColor: colors.surface}]}>
        <View style={styles.body}>
          {/* No HotPick designated that week → the row and the team name drop
              out entirely. A "—" here would imply a pick that didn't resolve. */}
          {hpResolved && (
            <View style={styles.row}>
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
                    {hpWon ? 'WIN' : 'LOSS'}
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
                {fmtPoints(hpPoints)}
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
              {`${picks.correct} of ${picks.total}`}
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

        {/* The week's total, on the accent bar. `background` is the token that
            flips WITH accentTeal (white on the light teal bar, near-black on the
            dark one) — a fixed white fails AA on the dark-mode accent. */}
        <View style={[styles.footer, {backgroundColor: colors.accentTeal}]}>
          <Text style={[displayType.display, styles.total, {color: colors.background}]}>
            {fmtPoints(recap.total)}
          </Text>
          <Text style={[bodyType.bold, styles.pts, {color: colors.background}]}>
            PTS
          </Text>
        </View>
      </View>
    </ModuleSection>
  );
}

// One right-aligned column for all three numbers, and one hanging slot to its
// right. The rows leave that slot empty; the footer puts PTS in it — which is
// how the ones column stays put between the rows and the bar.
const VALUE_COL = 54;
const SUFFIX_COL = 34;

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // Only the HotPick's outcome gets the larger size — that's the line the
  // Player came for. Everything else sits at team-name scale.
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
