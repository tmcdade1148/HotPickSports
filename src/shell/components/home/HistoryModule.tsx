// HistoryModule — Home's HISTORY module (Home Module Map v4 §6, Tom's
// July 2026 layout pass).
//
// TWO CARDS, mirrored:
//   LAST WEEK RECAP — orange panel on the LEFT (rounded left), detail rows right
//   YOUR HISTORY    — bar timeline left, orange HEAD panel on the RIGHT
// The past anchors left; the live end of the timeline anchors right.
//
// The rules it holds:
//   Rule 5  — bar height = week_points (negatives hang BELOW the zero axis),
//             colour = did the flame hit. Orange = hit, blue = missed. NEVER
//             positive/negative colour — the height already says the sign.
//   Rule 2  — no "+" anywhere. A positive number is bare (16, 22); only a
//             genuine negative carries its minus (−13). Nothing reads as a
//             potential swing.
//   §2      — the module never sums its own bars into a season total.
//   Rule 1  — the flame is allowed here: at week complete it stops being your
//             call and becomes your story.
//
// THE HEAD IS PERMANENT and always describes the CURRENT week — it never
// borrows a finished week's number. The rightmost bar is always the previous
// week. That partition is why nothing can appear twice.

import React, {useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius, sectionHeaderType} from '@shared/theme';
import {fullTeamName} from './teamColors';
import {derivePickDisplay} from './weekRecap';

// Four week slots visible at rest; older weeks live in the carousel behind
// them. The head sits OUTSIDE the scroller so it can never scroll away.
const VISIBLE_SLOTS = 4;
// Head panel as a share of the card width (~28% in the reference layout).
const HEAD_RATIO = 0.28;
// ── Vertical scale ──
// A point is a FIXED number of pixels, and each zone is only as tall as the
// data in view actually needs. Reserving both extremes up front cost ~58px of
// empty space below the axis on an all-positive season.
//
// The scale is pinned to the theoretical best week so the cap is reached
// exactly at a perfect one: 15 base Picks + a rank-16 HotPick = 31. The worst
// week is a rank-16 HotPick miss with nothing else landing = −16, which is why
// the chart is legitimately taller above the line than below — the upside is
// nearly twice the downside, and the map says so ("Perfect week 31, worst −16.
// The HotPick is the only thing that can subtract").
//
// Consequence worth knowing: bar heights are now ABSOLUTE. A +24 is the same
// height whatever else is on screen, so weeks stay comparable as the carousel
// scrolls — previously every bar rescaled to whichever week happened to be in
// view.
const MAX_ZONE_H = 58;        // the cap — roughly today's height
const PERFECT_WEEK = 31;      // 15 Picks + rank-16 HotPick
const PX_PER_POINT = MAX_ZONE_H / PERFECT_WEEK;
const MIN_BAR = 4;            // a ±1 week still has to be visible

/** Pixel height for a points magnitude, floored so ±1 shows and capped at the zone. */
function barHeight(points: number): number {
  if (points === 0) return 0;
  return Math.max(MIN_BAR, Math.min(MAX_ZONE_H, Math.round(Math.abs(points) * PX_PER_POINT)));
}

// Phases where HISTORY does not exist at all.
const HIDDEN_PHASES = ['OFF_SEASON', 'PRE_SEASON'];
// Phases whose weeks are the PLAYOFF set. The data layer already scopes
// season_user_totals by phase, so "playoffs start fresh" needs no extra
// filtering here — the rows simply change underneath.
const PLAYOFF_PHASES = ['PLAYOFFS', 'SUPERBOWL_INTRO', 'SUPERBOWL', 'SEASON_COMPLETE'];
// Playoff rounds read as rounds, not week numbers.
const ROUND_LABEL: Record<number, string> = {19: 'WC', 20: 'DIV', 21: 'CONF', 22: 'SB'};
const PLAYOFF_FIRST_WEEK = 19;

/** Sub-label under the head's week — what the current week is doing. */
function headStateLabel(weekState: string | null | undefined, regularComplete: boolean): string {
  if (regularComplete) return 'up next';
  switch (weekState) {
    case 'picks_open': return 'picks open';
    case 'locked':     return 'locked';
    case 'live':       return 'in progress';
    // All games are final but the server is still scoring — the number can
    // still move, so calling it "final" here would be a beat early.
    case 'settling':   return 'in progress';
    case 'complete':   return 'final';
    default:           return '';
  }
}

/** Bar label — "W7" in the regular season, "WC"/"DIV"/"CONF"/"SB" in playoffs. */
function weekLabel(week: number, isPlayoffs: boolean): string {
  if (isPlayoffs) return ROUND_LABEL[week] ?? `W${week}`;
  return `W${week}`;
}

/** Panel label — the same idea with room to spell it out: "WEEK 7" / "WC". */
function panelWeekLabel(week: number, isPlayoffs: boolean): string {
  if (isPlayoffs) return ROUND_LABEL[week] ?? `WEEK ${week}`;
  return `WEEK ${week}`;
}

/** No plus signs, ever. A real negative keeps its minus (U+2212). */
function fmtPoints(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

type WeekRow = {
  week: number;
  total: number;
  correctPicks: number;
  totalPicks: number;
  isHotPickCorrect: boolean | null;
  hotPickRank: number | null;
};
type Cell =
  | {kind: 'week'; week: number; data: WeekRow | null}
  | {kind: 'marker'}
  // An unfilled grid position early in a season. Draws its share of the zero
  // axis and nothing else — no bar, no label. The grid is always four columns
  // wide so the axis reads as one continuous line from the first week.
  | {kind: 'padding'};

export function HistoryModule() {
  const {colors} = useTheme();
  const recentWeeks = useGlobalStore(s => s.recentWeeks) as WeekRow[];
  const lastWeekHotPick = useGlobalStore(s => s.lastWeekHotPick);
  // Current week's HotPick — supplies the picked team for the settling/complete
  // recap, where lastWeekHotPick (fetched for currentWeek−1) doesn't apply.
  const userHotPick = useNFLStore(s => s.userHotPick);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  // Server-computed running total for the current week — points banked from
  // games already FINAL as of the last scoring run. Never a projection.
  const currentWeekPoints = useNFLStore(s => s.currentWeekPoints);
  const configLoaded = useNFLStore(s => s.configLoaded);

  // Card width drives the head/slot split. Measured rather than assumed so the
  // four slots stay equal on any device.
  const [cardW, setCardW] = useState(0);

  const phase = String(currentPhase ?? '');
  const isPlayoffs = PLAYOFF_PHASES.includes(phase);
  const isRegularComplete = phase === 'REGULAR_COMPLETE';
  // Once the week is scored (all games final), it stops being "in play" and
  // its result is real. From here the current week joins the timeline as a bar
  // AND drives the recap — the same shared boundary in both places.
  const weekSettled = weekState === 'settling' || weekState === 'complete';

  // The bars. Normally the FINISHED weeks only — the head owns the current
  // week, which is why a week can't be both a bar and the head. Two exceptions:
  //   • settling / complete — the current week IS scored now, so it also lands
  //     on the timeline as the rightmost bar (Tom, Jul 2026: "populate the
  //     history chart with the week's result"). The head still shows it too;
  //     they're the big-number and the shape views of the same week.
  //   • REGULAR_COMPLETE — the regular season is over, so week 18 is finished
  //     and belongs on the timeline while the head has moved to the playoffs.
  const weeks = useMemo(() => {
    if (isRegularComplete) return [...recentWeeks].sort((a, b) => a.week - b.week);
    const cutoff = weekSettled ? currentWeek : currentWeek - 1;
    return recentWeeks.filter(w => w.week <= cutoff).sort((a, b) => a.week - b.week);
  }, [recentWeeks, currentWeek, isRegularComplete, weekSettled]);

  // Cells, oldest → newest. A week inside the range with no scored row (the
  // player made no picks) still holds its position: labelled, no bar. The
  // timeline never closes over a missed week.
  const cells: Cell[] = useMemo(() => {
    const out: Cell[] = [];
    if (weeks.length > 0) {
      const byWeek = new Map(weeks.map(w => [w.week, w]));
      const oldest = weeks[0].week;
      const newest = weeks[weeks.length - 1].week;
      for (let w = oldest; w <= newest; w++) {
        out.push({kind: 'week', week: w, data: byWeek.get(w) ?? null});
      }
    }
    // End-of-regular-season marker takes the slot nearest the head, pushing
    // the final weeks left.
    if (isRegularComplete) out.push({kind: 'marker'});
    // Pad the LEFT so the grid is always at least four columns. Early in a
    // season the filled weeks sit right, against the head, and the empty
    // positions still carry the axis — so the line runs the full width from
    // week one instead of appearing to grow with the data.
    while (out.length < VISIBLE_SLOTS) out.unshift({kind: 'padding'});
    return out;
  }, [weeks, isRegularComplete]);

  // Each zone is sized to the biggest week IN VIEW on its own side of the
  // axis — so an all-positive season collapses the lower zone to nothing
  // instead of holding ~58px open for a negative that never arrives, and the
  // module only grows as tall as the scores actually demand.
  const {posH, negH} = useMemo(() => {
    const vis = cells.slice(-VISIBLE_SLOTS);
    let maxPos = 0;
    let maxNeg = 0;
    for (const c of vis) {
      if (c.kind !== 'week' || !c.data) continue;
      const t = c.data.total;
      if (t > 0 && t > maxPos) maxPos = t;
      if (t < 0 && -t > maxNeg) maxNeg = -t;
    }
    return {posH: barHeight(maxPos), negH: barHeight(maxNeg)};
  }, [cells]);

  // ── THE RECAP ──
  // From SETTLING onward the recap describes THIS week, not last week: every
  // game is final, the server has scored it, and making the player wait for
  // the next week to open before they can see their own result is the wrong
  // beat. It then stays on that week through `complete` and naturally becomes
  // "last week" when the next week opens — same row, no jump.
  //
  // Before settling it's the most recent FINISHED week, which is also the
  // rightmost bar. Recap = the detail, bar = the shape — and from settling on,
  // both describe the current week (weekSettled put it into `weeks`, so the
  // rightmost bar is already the current week here too).
  const currentRow = useMemo(
    () => recentWeeks.find(w => w.week === currentWeek) ?? null,
    [recentWeeks, currentWeek],
  );
  const recap =
    (weekSettled ? currentRow : null) ??
    (weeks.length > 0 ? weeks[weeks.length - 1] : null);

  // The HotPick's picked team, from whichever store holds that week's pick:
  //   • current week  → userHotPick (fetched for currentWeek)
  //   • previous week → lastWeekHotPick (fetched for currentWeek − 1)
  // Any other week has no team on hand, so the line is omitted rather than
  // showing the wrong week's team.
  const recapTeamCode =
    recap == null
      ? null
      : recap.week === currentWeek
        ? userHotPick?.picked_team ?? null
        : recap.week === currentWeek - 1
          ? lastWeekHotPick?.team ?? null
          : null;
  const recapTeam = recapTeamCode
    ? (fullTeamName(recapTeamCode) ?? recapTeamCode).toUpperCase()
    : null;

  // ── HEAD ── permanent, always the CURRENT week.
  // In REGULAR_COMPLETE the regular season is done and the playoffs haven't
  // begun, so it points at Wild Card with nothing banked yet.
  const headWeekNum = isRegularComplete ? PLAYOFF_FIRST_WEEK : currentWeek;
  const headPoints = isRegularComplete ? 0 : currentWeekPoints;
  const headWeekLabel = panelWeekLabel(headWeekNum, isPlayoffs || isRegularComplete);
  const headState = headStateLabel(weekState, isRegularComplete);

  // Hold while a competition config is loading (e.g. the moment the onboarding
  // demo exits — nflStore still holds the demo's played week until the real
  // config re-inits). Rendering here would flash the demo's leftover history.
  if (!configLoaded) return null;
  // Hidden entirely in the off-season and pre-season — there is no season to
  // show. Also hidden before the very first week is playable.
  if (HIDDEN_PHASES.includes(phase)) return null;
  if (currentWeek <= 0) return null;

  const headW = cardW > 0 ? Math.round(cardW * HEAD_RATIO) : 0;
  const slotW = cardW > 0 ? (cardW - headW) / VISIBLE_SLOTS : 0;

  // Recap arithmetic. The HotPick's own contribution is its rank signed by the
  // outcome; the base Picks are the remainder, so the two rows always add to
  // the number in the orange panel.
  const hpPoints =
    recap == null || recap.hotPickRank == null || recap.isHotPickCorrect == null
      ? 0
      : recap.isHotPickCorrect
        ? recap.hotPickRank
        : -recap.hotPickRank;
  const picksPoints = recap == null ? 0 : recap.total - hpPoints;
  const picks = recap == null ? {correct: 0, total: 0} : derivePickDisplay(recap);
  const hpWon = recap?.isHotPickCorrect === true;
  const hpLost = recap?.isHotPickCorrect === false;
  const hpColor = hpWon ? colors.gameWon : hpLost ? colors.gameLost : colors.textTertiary;

  return (
    <View style={styles.wrap}>
      {/* ── LAST WEEK RECAP ── */}
      {recap != null && (
        <>
          <Text style={[bodyType.bold, styles.sectionLabel, {color: colors.textTertiary}]}>
            YOUR RECAP
          </Text>
          <View style={[styles.card, styles.recapCard, {backgroundColor: colors.surface}]}>
            {/* Orange panel, LEFT. Always orange regardless of the number's
                sign — outcome colour lives on the rows, not the panel. */}
            <View style={[styles.panel, styles.panelLeft, {backgroundColor: colors.primary}]}>
              {/* No adjustsFontSizeToFit: this codebase has a documented iOS
                  bug where it mis-measures inside a flex row and shrinks text
                  to the minimum even when it fits. Fixed size + a tight
                  numberOfLines is the reliable behaviour here. */}
              <Text
                style={[displayType.display, styles.panelNumber, {color: colors.onPrimary}]}
                numberOfLines={1}>
                {fmtPoints(recap.total)}
              </Text>
              <Text style={[bodyType.bold, styles.panelPts, {color: colors.onPrimary}]}>
                PTS
              </Text>
              <Text style={[bodyType.bold, styles.panelWeek, {color: colors.onPrimary}]}>
                {panelWeekLabel(recap.week, isPlayoffs)}
              </Text>
            </View>

            <View style={styles.recapBody}>
              <View style={styles.recapRow}>
                <View style={styles.recapLabelCol}>
                  <Text style={[displayType.display, styles.recapLabel, {color: colors.textPrimary}]}>
                    {'HOTPICK 🔥'}
                  </Text>
                  {recapTeam ? (
                    <Text
                      style={[displayType.display, styles.recapTeam, {color: colors.textTertiary}]}
                      numberOfLines={1}>
                      {recapTeam}
                    </Text>
                  ) : null}
                </View>
                <Text style={[displayType.display, styles.recapMid, {color: hpColor}]}>
                  {hpWon ? 'WIN' : hpLost ? 'LOSS' : '—'}
                </Text>
                <Text style={[displayType.display, styles.recapValue, {color: hpColor}]}>
                  {fmtPoints(hpPoints)}
                </Text>
              </View>

              <View style={styles.recapRow}>
                <View style={styles.recapLabelCol}>
                  <Text style={[displayType.display, styles.recapLabel, {color: colors.textPrimary}]}>
                    PICKS
                  </Text>
                </View>
                <Text style={[bodyType.regular, styles.recapMidPlain, {color: colors.textTertiary}]}>
                  {`${picks.correct} of ${picks.total}`}
                </Text>
                <Text
                  style={[
                    displayType.display,
                    styles.recapValue,
                    {color: picksPoints < 0 ? colors.gameLost : colors.gameWon},
                  ]}>
                  {fmtPoints(picksPoints)}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}

      {/* ── YOUR HISTORY ── */}
      <Text style={[bodyType.bold, styles.sectionLabel, {color: colors.textTertiary}]}>
        YOUR HISTORY
      </Text>
      <View
        style={[styles.card, styles.chartCard, {backgroundColor: colors.surface}]}
        onLayout={e => setCardW(e.nativeEvent.layout.width)}>
        {/* Timeline. Four slots at rest; older weeks scroll behind them, with
            the newest pinned right (contentContainer anchors to flex-end). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{width: cardW - headW}}
          contentContainerStyle={styles.scrollContent}>
          {cardW > 0 &&
            cells.map((cell, i) => {
              if (cell.kind === 'marker') {
                return (
                  <View key="marker" style={[styles.slot, {width: slotW}]}>
                    <View style={[styles.markerWrap, {height: posH + 1 + negH}]}>
                      {['END OF', 'REG.', 'SEASON'].map(line => (
                        <Text
                          key={line}
                          style={[displayType.display, styles.markerText, {color: colors.textTertiary}]}
                          numberOfLines={1}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  </View>
                );
              }
              if (cell.kind === 'padding') {
                // Empty grid position: axis only. No bar, no label — an
                // unlabelled blank means "no week here yet", while a LABELLED
                // blank means "week played, no picks made". The two must stay
                // distinguishable.
                return (
                  <View key={`pad-${i}`} style={[styles.slot, {width: slotW}]}>
                    <View style={[styles.posZone, {height: posH}]} />
                    <View style={[styles.axis, {backgroundColor: colors.border}]} />
                    <View style={[styles.negZone, {height: negH}]} />
                    <Text style={[displayType.display, styles.slotLabel]}> </Text>
                  </View>
                );
              }
              const w = cell.data;
              // A slot with no row is a MISSED week: labelled, no bar. The gap
              // is the point — a skipped week must stay visible.
              const noSlate = w == null || w.totalPicks <= 0;
              const barColor =
                w?.isHotPickCorrect === true
                  ? colors.primary
                  : w?.isHotPickCorrect === false
                    ? colors.hotpickMiss
                    : colors.textTertiary; // scored, but no HotPick resolved
              // Absolute height — a fixed pixels-per-point, so this bar reads
              // the same whatever else is in view.
              const mag = w == null ? 0 : barHeight(w.total);

              return (
                <View key={`${cell.week}-${i}`} style={[styles.slot, {width: slotW}]}>
                  <View style={[styles.posZone, {height: posH}]}>
                    {!noSlate && w != null && w.total > 0 && (
                      <View style={[styles.bar, {height: mag, backgroundColor: barColor}]} />
                    )}
                  </View>
                  <View style={[styles.axis, {backgroundColor: colors.border}]} />
                  <View style={[styles.negZone, {height: negH}]}>
                    {!noSlate && w != null && w.total < 0 && (
                      <View style={[styles.bar, {height: mag, backgroundColor: barColor}]} />
                    )}
                  </View>
                  <Text
                    style={[displayType.display, styles.slotLabel, {color: colors.textTertiary}]}
                    numberOfLines={1}>
                    {weekLabel(cell.week, isPlayoffs)}
                  </Text>
                </View>
              );
            })}
        </ScrollView>

        {/* Orange HEAD panel, RIGHT. Permanent — always the current week,
            never a borrowed finished week. Shows a SERVER number: banked
            points from games already final, never a projection. */}
        <View style={[styles.panel, styles.panelRight, {backgroundColor: colors.primary, width: headW}]}>
          <Text
            style={[displayType.display, styles.panelNumber, {color: colors.onPrimary}]}
            numberOfLines={1}>
            {fmtPoints(headPoints)}
          </Text>
          <Text style={[bodyType.bold, styles.panelPts, {color: colors.onPrimary}]}>
            PTS
          </Text>
          <Text style={[bodyType.bold, styles.panelWeek, {color: colors.onPrimary}]}>
            {headWeekLabel}
          </Text>
          {headState ? (
            <Text style={[displayType.display, styles.panelState, {color: colors.onPrimary}]}>
              {headState}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionLabel: {
    // Shared token — matches YOUR CONTESTS / YOUR LEAGUES exactly.
    ...sectionHeaderType,
    marginBottom: 10,
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden', // lets the orange panels bleed to the card's edges
    flexDirection: 'row',
  },
  recapCard: {
    marginBottom: spacing.lg,
    minHeight: 88,
  },
  chartCard: {
    alignItems: 'stretch',
  },
  // ── Orange panels — full card height, rounded on their outer side only.
  panel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 6,
  },
  panelLeft: {
    width: 84,
  },
  panelRight: {
    // width applied inline from the measured card
  },
  panelNumber: {
    fontSize: 34,
    lineHeight: 38,
  },
  // "PTS" sits tight under the number — it's a unit on that number, not a
  // separate line — so the week label below it carries the larger gap.
  panelPts: {
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: -2,
  },
  panelWeek: {
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 6,
  },
  panelState: {
    fontSize: 10,
    letterSpacing: 0.4,
    marginTop: 6,
    opacity: 0.9,
  },
  // ── Recap rows
  recapBody: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recapLabelCol: {
    flex: 1,
  },
  recapLabel: {
    fontSize: 15,
  },
  recapTeam: {
    fontSize: 11,
    marginTop: 1,
  },
  recapMid: {
    fontSize: 14,
    width: 62,
    textAlign: 'right',
  },
  recapMidPlain: {
    fontSize: 13,
    width: 62,
    textAlign: 'right',
  },
  recapValue: {
    fontSize: 20,
    width: 54,
    textAlign: 'right',
  },
  // ── Timeline
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingVertical: spacing.md,
  },
  slot: {
    alignItems: 'center',
  },
  // Heights are applied inline (posH / negH) — each zone is only as tall as
  // the data in view needs, so an all-positive season doesn't hold empty
  // space open below the axis.
  posZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  negZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  axis: {
    height: 1,
    alignSelf: 'stretch',
  },
  bar: {
    width: '68%',
    borderRadius: 6,
  },
  slotLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  // Height applied inline to match the axis span exactly.
  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: {
    fontSize: 10,
    letterSpacing: 0.4,
    lineHeight: 13,
  },
});
