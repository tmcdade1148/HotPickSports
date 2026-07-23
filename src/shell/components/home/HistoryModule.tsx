// HistoryModule — Home's HISTORY chart. Bars only.
//
// The orange HEAD panel is GONE (eyebrow design pass). It showed the CURRENT
// week and was documented as permanent — that number now lives in the WEEK
// eyebrow at the top of Home, and the season total lives in this module's own
// eyebrow. With the head removed, the current week becomes the RIGHTMOST SLOT:
// labelled, empty until it settles, then a normal bar. Nothing appears twice
// because nothing is duplicated any more.
//
// This retires the mirrored-panels layout intent and makes HOME_MODULE_MAP v4.1
// stale. The Recap half of this file now lives in RecapModule.tsx.
//
// The rules it holds:
//   Rule 5  — bar height = week_points (negatives hang BELOW the zero axis),
//             colour = did the flame hit. Orange = hit, blue = missed. NEVER
//             positive/negative colour — the height already says the sign.
//   Rule 2  — no "+" anywhere; only a genuine negative carries its minus.
//   §2      — the module NEVER sums its own bars into a season total. The
//             eyebrow reads globalStore.seasonTotal, the same value IdentityBar
//             shows, so the two can't disagree during settling.
//   Hard Rule #9 — every colour is a token. No hex in this file.

import React, {useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme/hooks';
import {displayType, monoType, spacing, borderRadius} from '@shared/theme';
import {fmtPoints} from '@shared/utils/format';
import {ModuleSection} from './ModuleSection';
import {HIDDEN_PHASES, PLAYOFF_PHASES, weekLabel, type WeekRow} from './weekRecap';

// Five week slots visible at rest — one more than before, because the head no
// longer eats ~28% of the card. Older weeks live in the carousel behind them.
const VISIBLE_SLOTS = 5;
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
// Consequence worth knowing: bar heights are ABSOLUTE. A +24 is the same height
// whatever else is on screen, so weeks stay comparable as the carousel scrolls.
const MAX_ZONE_H = 58;        // the cap — roughly today's height
const PERFECT_WEEK = 31;      // 15 Picks + rank-16 HotPick
const PX_PER_POINT = MAX_ZONE_H / PERFECT_WEEK;
const MIN_BAR = 4;            // a ±1 week still has to be visible
// Below this the number can't sit inside its own bar without touching both
// edges, so it moves outside — above a positive bar, below a negative one.
// Device dial: raise it if the digits look cramped on a small screen.
const LABEL_FITS_INSIDE = 20;
// One line of that number, for the room a zone reserves when it moves outside.
const OUTSIDE_LABEL_H = 14;

/** Pixel height for a points magnitude, floored so ±1 shows and capped at the zone. */
function barHeight(points: number): number {
  if (points === 0) return 0;
  return Math.max(MIN_BAR, Math.min(MAX_ZONE_H, Math.round(Math.abs(points) * PX_PER_POINT)));
}

type Cell =
  | {kind: 'week'; week: number; data: WeekRow | null}
  | {kind: 'marker'}
  // An unfilled grid position early in a season. Draws its share of the zero
  // axis and nothing else — no bar, no label. The grid is always five columns
  // wide so the axis reads as one continuous line from the first week.
  | {kind: 'padding'};

export function HistoryModule() {
  const {colors} = useTheme();
  const recentWeeks = useGlobalStore(s => s.recentWeeks) as WeekRow[];
  // The season total — READ, never summed from the bars below (§2). This is the
  // same user-scoped value IdentityBar's SEASON PTS shows.
  const seasonTotal = useGlobalStore(s => s.seasonTotal);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const configLoaded = useNFLStore(s => s.configLoaded);

  // Card width drives the slot split. Measured rather than assumed so the five
  // slots stay equal on any device.
  const [cardW, setCardW] = useState(0);

  const phase = String(currentPhase ?? '');
  const isPlayoffs = PLAYOFF_PHASES.includes(phase);
  const isRegularComplete = phase === 'REGULAR_COMPLETE';
  // Once the week is scored (all games final) its result is real and it draws a
  // bar. Before that it holds its slot, labelled and empty.
  const weekSettled = weekState === 'settling' || weekState === 'complete';
  const settledThrough = weekSettled ? currentWeek : currentWeek - 1;

  // Cells, oldest → newest, running all the way to the CURRENT week. A week with
  // no scored row (the Player made no picks) still holds its position: labelled,
  // no bar. The timeline never closes over a missed week — the gap is the point.
  const cells: Cell[] = useMemo(() => {
    const out: Cell[] = [];
    const scored = [...recentWeeks].sort((a, b) => a.week - b.week);
    if (scored.length > 0 || currentWeek > 0) {
      const byWeek = new Map(scored.map(w => [w.week, w]));
      const oldest = scored.length > 0 ? Math.min(scored[0].week, currentWeek) : currentWeek;
      // The current week is always the last slot — empty until it settles.
      const newest = isRegularComplete
        ? Math.max(scored[scored.length - 1]?.week ?? currentWeek, currentWeek)
        : currentWeek;
      for (let w = oldest; w <= newest; w++) {
        out.push({kind: 'week', week: w, data: byWeek.get(w) ?? null});
      }
    }
    // End-of-regular-season marker takes the last slot, pushing the final weeks
    // left.
    if (isRegularComplete) out.push({kind: 'marker'});
    // Pad the LEFT so the grid is always at least five columns. Early in a
    // season the filled weeks sit right and the empty positions still carry the
    // axis — so the line runs the full width from week one instead of appearing
    // to grow with the data.
    while (out.length < VISIBLE_SLOTS) out.unshift({kind: 'padding'});
    return out;
  }, [recentWeeks, currentWeek, isRegularComplete]);

  // Each zone is sized to the biggest week IN VIEW on its own side of the axis —
  // so an all-positive season collapses the lower zone to nothing instead of
  // holding ~58px open for a negative that never arrives. A zone holding a bar
  // too short for its own number also has to reserve the row that number moves
  // out into, or a +1 week would print its digit on top of the axis.
  const {posH, negH} = useMemo(() => {
    const vis = cells.slice(-VISIBLE_SLOTS);
    let maxPos = 0;
    let maxNeg = 0;
    let outsidePos = false;
    let outsideNeg = false;
    for (const c of vis) {
      if (c.kind !== 'week' || !c.data || c.week > settledThrough) continue;
      if (c.data.totalPicks <= 0) continue;
      const t = c.data.total;
      const short = barHeight(t) < LABEL_FITS_INSIDE;
      // A settled 0 has no bar at all, so its number joins the positives.
      if (t >= 0) {
        if (t > maxPos) maxPos = t;
        if (short) outsidePos = true;
      } else {
        if (-t > maxNeg) maxNeg = -t;
        if (short) outsideNeg = true;
      }
    }
    return {
      posH: barHeight(maxPos) + (outsidePos ? OUTSIDE_LABEL_H : 0),
      negH: barHeight(maxNeg) + (outsideNeg ? OUTSIDE_LABEL_H : 0),
    };
  }, [cells, settledThrough]);

  // Hold while a competition config is loading (e.g. the moment the onboarding
  // demo exits — nflStore still holds the demo's played week until the real
  // config re-inits). Rendering here would flash the demo's leftover history.
  if (!configLoaded) return null;
  // Hidden entirely in the off-season and pre-season — there is no season to
  // show. Also hidden before the very first week is playable.
  if (HIDDEN_PHASES.includes(phase)) return null;
  if (currentWeek <= 0) return null;
  // A chart needs something to compare. One settled week is the Recap's job;
  // HISTORY starts once there are two weeks to look across.
  if (recentWeeks.filter(w => w.week <= settledThrough).length < 2) return null;

  const slotW = cardW > 0 ? cardW / VISIBLE_SLOTS : 0;

  return (
    <ModuleSection label="HISTORY" value={seasonTotal} collapsible>
      <View
        style={[styles.card, {backgroundColor: colors.surface}]}
        onLayout={e => setCardW(e.nativeEvent.layout.width)}>
        {/* Five slots at rest; older weeks scroll behind them, with the newest
            pinned right (contentContainer anchors to flex-end). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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
              // A slot draws a bar only once its week is SCORED. That covers
              // three cases with one rule: the current week before it settles,
              // a week the Player skipped, and a week still being scored.
              const scored =
                w != null && w.totalPicks > 0 && cell.week <= settledThrough;
              const total = scored && w ? w.total : 0;
              const barColor =
                w?.isHotPickCorrect === true
                  ? colors.primary
                  : w?.isHotPickCorrect === false
                    ? colors.hotpickMiss
                    : colors.textTertiary; // scored, but no HotPick resolved
              // Absolute height — a fixed pixels-per-point, so this bar reads
              // the same whatever else is in view.
              const mag = barHeight(total);
              const inside = mag >= LABEL_FITS_INSIDE;
              const number = scored ? fmtPoints(total) : null;

              // The score sits INSIDE its bar, top-aligned. `background` is the
              // token that flips WITH the bars: white on the light theme's
              // orange and mid-blue, near-black on the dark theme's light-blue
              // miss bar, where a fixed white would vanish.
              const insideLabel = number != null && inside && (
                <Text
                  style={[displayType.display, styles.barLabel, {color: colors.background}]}
                  numberOfLines={1}>
                  {number}
                </Text>
              );
              const outsideLabel = number != null && !inside && (
                <Text
                  style={[displayType.display, styles.outsideLabel, {color: colors.textPrimary}]}
                  numberOfLines={1}>
                  {number}
                </Text>
              );

              return (
                <View key={`${cell.week}-${i}`} style={[styles.slot, {width: slotW}]}>
                  <View style={[styles.posZone, {height: posH}]}>
                    {/* A settled 0 has no bar, so its number goes above the
                        axis with the positives. */}
                    {total >= 0 && outsideLabel}
                    {total > 0 && (
                      <View style={[styles.bar, {height: mag, backgroundColor: barColor}]}>
                        {insideLabel}
                      </View>
                    )}
                  </View>
                  <View style={[styles.axis, {backgroundColor: colors.border}]} />
                  <View style={[styles.negZone, {height: negH}]}>
                    {total < 0 && (
                      <View style={[styles.bar, {height: mag, backgroundColor: barColor}]}>
                        {insideLabel}
                      </View>
                    )}
                    {total < 0 && outsideLabel}
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
      </View>
    </ModuleSection>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
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
    alignItems: 'center',
  },
  // Top-aligned inside the bar — the number reads as a cap on the column
  // rather than floating in the middle of it.
  barLabel: {
    ...monoType.regular,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 3,
  },
  outsideLabel: {
    ...monoType.regular,
    fontSize: 11,
    lineHeight: 14,
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
