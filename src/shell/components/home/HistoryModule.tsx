// HistoryModule — Home's HISTORY module (Home Module Map v4, module 6).
// Slice 6a: the STATIC surface — bar timeline, recap card, season line, and
// tap-drives-recap. The live head / morph is 6b and is deliberately absent.
//
// The canon this module exists to make visible: "the season is the unit, not
// the week," and "the good read loses about half the time." ~48% of bars go
// blue. That's the argument, not a bug.
//
// Rules it holds:
//   Rule 5  — height = week_points, colour = did the flame hit. NEVER
//             positive/negative colour: the height already says the sign.
//   Rule 2  — signed values are correct HERE. Every week rendered is finished,
//             so the sign is a result, not a projection.
//   §2      — the season total is IDENTITY's. This module never sums its bars.
//   §6      — recap is the most recent FINISHED week by default.
//   Rule 1  — the flame is allowed here: at week complete it stops being your
//             call and becomes your story ("it moves to the History recap").

import React, {useCallback, useMemo, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';
import {isWeekInProgress} from '@shared/utils/weekState';
import {derivePickDisplay} from './weekRecap';

// A FIXED 6-COLUMN GRID: 5 graph columns + the head. Equal widths, flexed to
// the container, so the layout is identical in every week of the season.
//
// The columns are POSITIONAL SLOTS KEYED BY WEEK, not a list of the rows we
// happen to have. That distinction is the whole point: the previous build
// mapped over the fetched rows, so a week with no scored row simply wasn't
// emitted and its neighbours closed the gap — a player who missed a week saw
// an unbroken season and couldn't tell. Deriving the slots from a week RANGE
// and looking each week's row up by number means a real week can never be
// silently dropped, and a missing one is visible as a hole.
const GRAPH_COLUMNS = 5;
const HALF_HEIGHT = 44; // usable bar zone above AND below the axis
const MIN_BAR = 3;      // a ±1 week still has to be visible

/** States in which the HEAD shows THIS week's running total rather than the
 *  most recent finished week. Map §6 Big-number table. */
const HEAD_SHOWS_THIS_WEEK = ['live', 'settling', 'complete'];

export function HistoryModule() {
  const {colors} = useTheme();
  const recentWeeks = useGlobalStore(s => s.recentWeeks);
  const hitRate = useGlobalStore(s => s.hotPickHitRate);
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  // Server-computed running total for the current week. Points banked from
  // games already FINAL as of the last scoring run — never a projection.
  const currentWeekPoints = useNFLStore(s => s.currentWeekPoints);

  // Which week the recap is showing. null = default (most recent finished).
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Selection is a transient inspection, not a preference — coming back to
  // Home should always land on the default week.
  useFocusEffect(
    useCallback(() => {
      setSelectedWeek(null);
    }, []),
  );

  // Which week the HEAD owns, and therefore which week is NOT a bar.
  //
  // The two must partition exactly: a week is either the head's or a bar's,
  // never both and never neither. That's why the bar filter below is written
  // as "not the head's week" rather than its own state test — one condition,
  // so the two can't drift apart.
  //
  // isWeekInProgress covers picks_open/locked/live/settling. `complete` is NOT
  // in progress, but the head still holds it (map: the head keeps the completed
  // week's final number until the next week opens, then it becomes a bar with
  // the same number — a seamless rotation). Hence the explicit list.
  const headOwnsCurrentWeek =
    currentWeek > 0 &&
    (isWeekInProgress(weekState) || HEAD_SHOWS_THIS_WEEK.includes(weekState ?? ''));

  // FINISHED weeks — everything the head doesn't own. Because the head's claim
  // is the single condition, no week can be double-counted or dropped.
  const weeks = useMemo(
    () => recentWeeks.filter(w => !(headOwnsCurrentWeek && w.week === currentWeek)),
    [recentWeeks, headOwnsCurrentWeek, currentWeek],
  );

  // What the head displays. Map §6 Big-number table:
  //   live / settling / complete → THIS week's server number (0 is legitimate
  //     during live — "nothing banked yet")
  //   picks_open / locked / idle → the most recent FINISHED week
  // "Never a zero for an unplayed week" falls out of this: an idle head reads
  // a SETTLED row, never the zero-row backfill, because the switch is on STATE
  // and not on whether a row exists.
  const headShowsThisWeek = HEAD_SHOWS_THIS_WEEK.includes(weekState ?? '');

  // ── THE 5 GRAPH SLOTS ──
  //
  // Built from a week RANGE ending at the newest finished week, then each slot
  // looks up its row by week number. Filling from the RIGHT: newest finished
  // week lands in the last slot (nearest the head), older weeks push left, and
  // any shortfall becomes empty padding on the LEFT.
  //
  //   after W1 final:  [ ][ ][ ][ ][W1]
  //   after W2 final:  [ ][ ][ ][W1][W2]
  //   5+ weeks:        oldest drops off the left as the newest enters
  //
  // A slot whose week has NO row (a missed week — the player made no picks, so
  // scoring never wrote one) still holds its position: labelled, no bar. The
  // timeline cannot collapse, which is the structural fix for the dropped-week
  // bug. `week: null` is padding only — those carry no label at all.
  const slots = useMemo(() => {
    const byWeek = new Map(weeks.map(w => [w.week, w]));
    const newest = weeks.length > 0 ? weeks[weeks.length - 1].week : null;
    if (newest == null) {
      return Array.from({length: GRAPH_COLUMNS}, () => ({week: null, data: null}));
    }
    // Clamp so week 0 / negatives never become slots early in a season.
    const oldest = Math.max(1, newest - (GRAPH_COLUMNS - 1));
    const real: Array<{week: number | null; data: (typeof weeks)[number] | null}> = [];
    for (let w = oldest; w <= newest; w++) {
      real.push({week: w, data: byWeek.get(w) ?? null});
    }
    const padding = Array.from({length: Math.max(0, GRAPH_COLUMNS - real.length)}, () => ({
      week: null,
      data: null,
    }));
    return [...padding, ...real];
  }, [weeks]);

  // Scale bars against the weeks actually ON SCREEN, so the visible window
  // always uses the full height rather than being flattened by an off-screen
  // outlier week.
  const maxAbs = useMemo(
    () =>
      Math.max(
        1,
        ...slots.map(s => (s.data ? Math.abs(s.data.total) : 0)),
      ),
    [slots],
  );

  const defaultWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const shown =
    (selectedWeek != null ? weeks.find(w => w.week === selectedWeek) : null) ??
    defaultWeek;
  const isDefaultShown = shown != null && shown.week === defaultWeek?.week;

  const avgRank = useMemo(() => {
    const ranks = weeks
      .map(w => w.hotPickRank)
      .filter((r): r is number => r != null);
    if (ranks.length === 0) return null;
    return ranks.reduce((a, b) => a + b, 0) / ranks.length;
  }, [weeks]);

  // The head's value + label. In idle states it reads the most recent FINISHED
  // week — a settled number, so a 0 can never come from the zero-row backfill.
  const headWeek = headShowsThisWeek ? currentWeek : defaultWeek?.week ?? null;
  const headPoints = headShowsThisWeek ? currentWeekPoints : defaultWeek?.total ?? null;

  // VISIBILITY. Map row 1: "hide if none."
  //   • Idle states with no finished week  → hidden (every new tester, until
  //     their first week settles). No empty chart, no zero placeholder.
  //   • live / settling / complete         → SHOWN even with zero bars, because
  //     the head itself is the content (week 1 renders a lone head).
  const hasBars = weeks.length > 0;
  if (!hasBars && !headShowsThisWeek) return null;
  if (headWeek == null || headPoints == null) return null;

  // The HotPick's own contribution is its rank, signed by the outcome. The
  // rest of the week's points are the base Picks — derived by subtraction so
  // the two lines always add to the week total shown in the header.
  // `shown` is null only in the lone-head case (live/settling with no settled
  // week yet), where there is no week to recap.
  const hotPickPoints =
    shown == null || shown.hotPickRank == null || shown.isHotPickCorrect == null
      ? 0
      : shown.isHotPickCorrect
        ? shown.hotPickRank
        : -shown.hotPickRank;
  const picksPoints = shown == null ? 0 : shown.total - hotPickPoints;
  const picks = shown == null ? {correct: 0, total: 0} : derivePickDisplay(shown);

  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

  return (
    <View style={styles.section}>
      <Text style={[bodyType.bold, styles.sectionTitle, {color: colors.textTertiary}]}>
        HISTORY
      </Text>

      {/* ── The grid ── 6 equal columns, no scrolling: 5 week slots + the head.
          Every column is flex:1, so the whole thing is width-independent and
          the layout never changes shape as the season fills. */}
      <View style={styles.grid}>
        {slots.map((slot, i) => {
          const w = slot.data;
          const isSelected = w != null && shown != null && w.week === shown.week;
          // Three distinct column kinds, and the distinction is the point:
          //   • padding   (week == null) — no week exists here yet. No label.
          //   • missed    (week set, data null) — a REAL week with no scored
          //     row. Labelled, no bar: the gap is visible, and the timeline
          //     does not close over it.
          //   • played    (data set) — label + bar.
          const isPadding = slot.week == null;
          // A row can also exist with no slate (total_picks = 0), which draws
          // no bar for the same reason a missed week doesn't.
          const noSlate = w == null || w.totalPicks <= 0;
          const barColor =
            w?.isHotPickCorrect === true
              ? colors.primary
              : w?.isHotPickCorrect === false
                ? colors.hotpickMiss
                : colors.textTertiary; // points, but no HotPick resolution
          const magnitude =
            w == null || w.total === 0
              ? 0
              : Math.max(
                  MIN_BAR,
                  Math.round((Math.abs(w.total) / maxAbs) * (HALF_HEIGHT - 4)),
                );

          // Only a week with a row has anything to recap, so padding and
          // missed weeks are inert rather than opening an empty card.
          const tappable = w != null;

          return (
            <Pressable
              // Padding slots have no week, so index keys them. They are
              // positional and interchangeable, so this is stable.
              key={slot.week ?? `pad-${i}`}
              onPress={
                tappable
                  ? () => setSelectedWeek(isSelected ? null : w.week)
                  : undefined
              }
              disabled={!tappable}
              style={styles.col}
              accessibilityRole={tappable ? 'button' : undefined}
              accessibilityLabel={
                isPadding
                  ? undefined
                  : w == null
                    ? `Week ${slot.week}, no picks made`
                    : `Week ${w.week}, ${w.total} points`
              }
              accessibilityState={tappable ? {selected: isSelected} : undefined}>
              <View style={styles.posZone}>
                {!noSlate && w != null && w.total > 0 && (
                  <View style={[styles.bar, {height: magnitude, backgroundColor: barColor}]} />
                )}
              </View>
              <View style={[styles.axis, {backgroundColor: colors.border}]} />
              <View style={styles.negZone}>
                {!noSlate && w != null && w.total < 0 && (
                  <View style={[styles.bar, {height: magnitude, backgroundColor: barColor}]} />
                )}
              </View>
              {/* Label comes from the SLOT's week, not from the row — one
                  source, so a label can never disagree with its bar. Padding
                  columns get none. */}
              <Text
                style={[
                  bodyType.bold,
                  styles.weekLabel,
                  {color: isSelected ? colors.textPrimary : colors.textTertiary},
                ]}
                numberOfLines={1}>
                {isPadding ? '' : `W${slot.week}`}
              </Text>
            </Pressable>
          );
        })}
        {/* ── THE HEAD ── column 6, permanent fixture at the right edge. Same
            flex:1 width as the five week slots, so the grid stays even.

            It shows a SERVER number and nothing else — during live/settling
            that's week_points as of the last scoring run (points banked from
            games already FINAL), never a projection and never client math.

            Always colors.primary: hit/miss colour belongs to bars, where the
            week has actually resolved. No pulse, no flash, no animation
            (rule 3 — displays hold still until FINAL). */}
        <View style={styles.head}>
          <View style={styles.headValueZone}>
            <Text
              style={[displayType.display, styles.headNumber, {color: colors.primary}]}
              numberOfLines={1}>
              {headPoints}
            </Text>
            <Text style={[bodyType.bold, styles.headUnit, {color: colors.primary}]}>
              PTS
            </Text>
          </View>
          <View style={[styles.axis, {backgroundColor: colors.border}]} />
          <View style={styles.negZone} />
          <Text
            style={[bodyType.bold, styles.weekLabel, {color: colors.textSecondary}]}
            numberOfLines={1}>
            {`W${headWeek}`}
          </Text>
        </View>
      </View>

      {/* ── Recap card — the detail surface for whichever week is shown.
          Absent in the lone-head case: with no settled week there is nothing
          to recap, and an empty card would be the placeholder the map's
          "hide if none" rule exists to prevent. ── */}
      {shown != null && (
      <View style={[styles.recap, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Text style={[bodyType.bold, styles.recapHeader, {color: colors.textSecondary}]}>
          {isDefaultShown ? 'LAST WEEK' : `WEEK ${shown.week}`}
          <Text style={{color: colors.textTertiary}}>{'  ·  '}</Text>
          {`${shown.total} PTS`}
        </Text>

        <View style={styles.recapRow}>
          <Text style={[bodyType.bold, styles.recapLabel, {color: colors.textPrimary}]}>
            {'🔥 HotPick'}
          </Text>
          <Text style={[bodyType.bold, styles.recapMid, {color: colors.textSecondary}]}>
            {shown.isHotPickCorrect == null
              ? '—'
              : shown.isHotPickCorrect
                ? 'WIN'
                : 'MISS'}
          </Text>
          <Text
            style={[
              displayType.display,
              styles.recapValue,
              {
                color:
                  hotPickPoints > 0
                    ? colors.gameWon
                    : hotPickPoints < 0
                      ? colors.gameLost
                      : colors.textTertiary,
              },
            ]}>
            {signed(hotPickPoints)}
          </Text>
        </View>

        <View style={styles.recapRow}>
          <Text style={[bodyType.regular, styles.recapLabel, {color: colors.textSecondary}]}>
            Picks
          </Text>
          <Text style={[bodyType.regular, styles.recapMid, {color: colors.textSecondary}]}>
            {`${picks.correct} of ${picks.total}`}
          </Text>
          <Text style={[displayType.display, styles.recapValue, {color: colors.textPrimary}]}>
            {signed(picksPoints)}
          </Text>
        </View>
      </View>
      )}

      {/* ── Season line ── Record = are you good. Average rank = who you are. */}
      {(hitRate != null || avgRank != null) && (
        <Text style={[bodyType.regular, styles.seasonLine, {color: colors.textSecondary}]}>
          {hitRate != null && `HotPick record ${hitRate.hits}-${hitRate.total - hitRate.hits}`}
          {hitRate != null && avgRank != null && '  ·  '}
          {avgRank != null && `average rank ${avgRank.toFixed(1)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  // 6 equal columns. No scrolling: this is a fixed window on the last five
  // finished weeks plus the head.
  grid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  // alignSelf:'stretch' is LOAD-BEARING. The parent column sets
  // alignItems:'center', which overrides the default 'stretch' and leaves these
  // zones shrink-to-fit — an INDEFINITE width. The bar's percentage width then
  // resolves against nothing and collapses to 0, which is what made every bar
  // invisible while the axis (the one child that already stretched) still drew.
  // Stretching here gives the zones the column's definite width, which is what
  // the percentage needs.
  //
  // alignItems:'center' is then required too: stretching the zone re-inherits
  // the default cross-axis alignment, which would pin a fixed-width child to
  // the left edge. This keeps the bar centred in its column.
  //
  // justifyContent anchors each bar to the axis: 'flex-end' grows the positive
  // bar upward from the zero line, 'flex-start' grows the negative bar down.
  posZone: {
    height: HALF_HEIGHT,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  negZone: {
    height: HALF_HEIGHT,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  axis: {
    height: 1,
    alignSelf: 'stretch',
  },
  // Scales to the column rather than a fixed pixel width, so the bars stay
  // proportional on any screen size.
  bar: {
    width: '46%',
    borderRadius: 2,
  },
  weekLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  // THE HEAD — column 6. Same flex:1 footprint as a week slot so the axis line
  // runs straight through at the same baseline.
  head: {
    flex: 1,
    alignItems: 'center',
  },
  headValueZone: {
    height: HALF_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  headNumber: {
    fontSize: 22,
    lineHeight: 24,
  },
  headUnit: {
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 1,
  },
  recap: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  recapHeader: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  recapLabel: {
    fontSize: 13,
    width: 96,
  },
  recapMid: {
    fontSize: 13,
    flex: 1,
  },
  recapValue: {
    fontSize: 15,
  },
  seasonLine: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
