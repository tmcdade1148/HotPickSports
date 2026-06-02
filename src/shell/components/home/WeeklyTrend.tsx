// Right-aligned strip of the last up-to-3 weeks. Current-week pill
// pulses while the week is settling; past weeks render with a Lock glyph.

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Lock} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {useTheme} from '@shell/theme/hooks';
import {displayType, bodyType, monoType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';
import {isFinalStatus, isLiveStatus} from '@sports/nfl/utils/gameStatus';

interface WeekSlot {
  week: number;
  earned: number;
  ceiling: number | null;
  correctPicks: number | null;
  totalPicks: number | null;
  isCurrent: boolean;
  /** Synthetic "regular-season total" pill shown during early playoff rounds. */
  isRegTotal?: boolean;
}

const PLAYOFF_START_WEEK = 19; // standard NFL mapping (matches periodLabel)

// Pill label: playoff weeks (19–22) read as their round; the regular-season
// total pill reads "REG SEASON"; everything else is "WEEK n".
function slotLabel(slot: WeekSlot): string {
  if (slot.isRegTotal) return 'REG SEASON';
  switch (slot.week) {
    case 19: return 'WILD CARD';
    case 20: return 'DIVISIONAL';
    case 21: return 'CONFERENCE';
    case 22: return 'SUPER BOWL';
    default: return `WEEK ${slot.week}`;
  }
}

// Accessibility label for a pill.
function slotA11yLabel(slot: WeekSlot): string {
  const won =
    slot.totalPicks != null && slot.correctPicks != null
      ? `, ${slot.correctPicks} of ${slot.totalPicks} games won`
      : '';
  return slot.ceiling != null
    ? `${slotLabel(slot)}: ${slot.earned} of ${slot.ceiling} ceiling points${won}`
    : `${slotLabel(slot)}: ${slot.earned} points${won}`;
}

export function WeeklyTrend() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const setCurrentWeek = useSeasonStore(s => s.setCurrentWeek);
  // The week currently being viewed on the Picks page (may differ from the
  // live/active week) — gets the faded-orange highlight.
  const viewedWeek = useSeasonStore(s => s.currentWeek);

  // Tapping a real-week pill opens that week on the Picks page. The synthetic
  // "REG SEASON" aggregate (week < 0) has no single week, so it isn't tappable.
  const openWeek = useCallback(
    (week: number) => {
      if (week <= 0) return;
      setCurrentWeek(week);
      navigation.navigate('PicksTab');
    },
    [setCurrentWeek, navigation],
  );

  const userId         = useGlobalStore(s => s.user?.id);
  const recentWeeks    = useGlobalStore(s => s.recentWeeks);
  const currentWeek    = useNFLStore(s => s.currentWeek);
  const currentPhase   = useNFLStore(s => s.currentPhase);
  const weekResult     = useNFLStore(s => s.weekResult);
  const regSeasonTotal = useSeasonStore(s => s.regularSeasonUserPoints);
  const loadRegPodium  = useSeasonStore(s => s.loadRegularSeasonPodium);
  const userPickCount  = useNFLStore(s => s.userPickCount);
  const userHotPick    = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const liveScores     = useNFLStore(s => s.liveScores);
  const weekPicks      = useSeasonStore(s => s.weekPicks);
  const games          = useSeasonStore(s => s.games);

  // Load the user's regular-season total for the early-playoff "REG SEASON"
  // pill (Wild Card + Divisional). The season leaderboard is playoff-scoped
  // during the playoffs, so this is fetched separately (phase=REGULAR).
  useEffect(() => {
    const isEarlyPlayoff =
      (currentPhase === 'PLAYOFFS') &&
      (currentWeek === PLAYOFF_START_WEEK || currentWeek === PLAYOFF_START_WEEK + 1);
    if (isEarlyPlayoff && userId) {
      loadRegPodium(userId).catch(() => {});
    }
  }, [currentPhase, currentWeek, userId, loadRegPodium]);

  // Current-week ceiling — mirrors SeasonPicksScreen's potentialWeekScore.
  const currentCeiling = useMemo(() => {
    const picks = userPickCount ?? 0;
    if (picks === 0) return null;
    const hotPickRank =
      userHotPick && (userHotPickGame?.frozen_rank ?? userHotPickGame?.rank ?? null);
    if (hotPickRank == null) {
      // No HotPick yet — every pick worth 1.
      return picks;
    }
    // (#picks − 1 non-hotpicks @ 1pt each) + hotpick @ rank pts.
    return Math.max(0, picks - 1) + hotPickRank;
  }, [userPickCount, userHotPick, userHotPickGame]);

  // Live earned — sums up the user's picks against game outcomes:
  //   • Game final + pick correct  →  + (rank if hotpick, else +1)
  //   • Game final + pick incorrect →  − rank if hotpick, else 0
  //   • Game live + currently winning →  + (rank if hotpick, else +1)
  //   • Game live + currently losing →  − rank if hotpick, else 0
  //   • Game scheduled (not started) →  0 (no contribution)
  // Mirrors the server-side scoring shape so the display estimate
  // converges with the authoritative settled total. This is for display
  // only — Rule #3's "server-side scoring" still owns the recorded value.
  const live = useMemo(() => {
    if (weekPicks.length === 0 || games.length === 0) {
      return {
        earned: weekResult?.weekPoints ?? null,
        correctPicks: weekResult?.correctPicks ?? null,
        totalPicks: weekResult?.totalPicks ?? null,
      };
    }
    const gameById = new Map(games.map(g => [g.game_id, g]));
    let total = 0;
    let correct = 0;
    let counted = 0; // picks with a known outcome (live winning + final)
    for (const pick of weekPicks) {
      const game = gameById.get(pick.game_id);
      if (!game) continue;
      const rank = game.frozen_rank ?? game.rank ?? 1;
      const value = pick.is_hotpick ? rank : 1;
      const score = liveScores[pick.game_id];
      if (!score) continue;
      const pickedHome = pick.picked_team === game.home_team;
      const userScore = pickedHome ? score.homeScore : score.awayScore;
      const oppScore  = pickedHome ? score.awayScore : score.homeScore;
      if (isFinalStatus(score.status)) {
        counted += 1;
        const isCorrect = userScore > oppScore;
        if (isCorrect) correct += 1;
        total += isCorrect ? value : pick.is_hotpick ? -rank : 0;
      } else if (isLiveStatus(score.status)) {
        if (userScore > oppScore) {
          correct += 1; // running win (mirrors UI of "games won so far")
          counted += 1;
          total += value;
        } else if (userScore < oppScore) {
          counted += 1;
          if (pick.is_hotpick) total -= rank;
        }
      }
      // scheduled / pre-game contributes 0
    }
    return {
      earned: total,
      correctPicks: correct,
      totalPicks: counted || weekPicks.length,
    };
  }, [weekPicks, games, liveScores, weekResult]);
  const liveEarned = live.earned;

  const slots: WeekSlot[] = useMemo(() => {
    const past: WeekSlot[] = recentWeeks
      .filter(r => r.week !== currentWeek) // dedupe against current
      .map(r => ({
        week: r.week,
        earned: r.total,
        ceiling: null,
        correctPicks: r.correctPicks,
        totalPicks: r.totalPicks,
        isCurrent: false,
      }));

    // Pull the current-week row out of recentWeeks if it exists — this
    // is the authoritative settled total for the current week and
    // ensures the slot still renders when weekResult/liveEarned haven't
    // been computed yet (notably on iOS cold-launches in complete state).
    const currentRow = recentWeeks.find(r => r.week === currentWeek);
    const fallbackEarned =
      liveEarned ?? weekResult?.weekPoints ?? currentRow?.total ?? null;
    // Always show the current-week slot once the week exists — even
    // with zero data — so the strip advances visually on week rollover.
    // The pill renders as a placeholder until picks/scores populate.
    const current: WeekSlot[] =
      currentWeek > 0
        ? [{
            week: currentWeek,
            earned: fallbackEarned ?? 0,
            ceiling: currentCeiling,
            correctPicks:
              live.correctPicks ??
              weekResult?.correctPicks ??
              currentRow?.correctPicks ??
              null,
            totalPicks:
              live.totalPicks ??
              weekResult?.totalPicks ??
              currentRow?.totalPicks ??
              null,
            isCurrent: true,
          }]
        : [];

    const all = [...past, ...current].sort((a, b) => a.week - b.week);

    // Regular season → just the 3 most recent weeks.
    const isPlayoffs = currentPhase === 'PLAYOFFS' || currentPhase === 'SUPERBOWL';
    if (!isPlayoffs) return all.slice(-3);

    // Playoffs: show only playoff weeks (≥19). At Wild Card + Divisional,
    // prepend a single "regular-season total" pill instead of the old W17/W18
    // weeks; it falls off by Conference week as playoff weeks accumulate.
    const playoffOnly = all.filter(s => s.week >= PLAYOFF_START_WEEK);
    const showRegTotal =
      (currentWeek === PLAYOFF_START_WEEK || currentWeek === PLAYOFF_START_WEEK + 1) &&
      regSeasonTotal != null;
    const regSlot: WeekSlot[] = showRegTotal
      ? [{
          week: -1,
          earned: regSeasonTotal as number,
          ceiling: null,
          correctPicks: null,
          totalPicks: null,
          isCurrent: false,
          isRegTotal: true,
        }]
      : [];
    return [...regSlot, ...playoffOnly].slice(-3);
  }, [recentWeeks, currentWeek, currentPhase, regSeasonTotal, weekResult, userPickCount, currentCeiling, liveEarned]);

  // Single walk over liveScores — derives the live-game count and the
  // "every game final" flag in one pass.
  const {liveGameCount, weekComplete} = useMemo(() => {
    const all = Object.values(liveScores);
    let live = 0;
    let allFinal = all.length > 0;
    for (const g of all) {
      if (isLiveStatus(g.status)) live += 1;
      if (!isFinalStatus(g.status)) allFinal = false;
    }
    return {liveGameCount: live, weekComplete: allFinal};
  }, [liveScores]);
  const hasLiveGame = liveGameCount > 0;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!weekComplete) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 0, duration: 900, useNativeDriver: false}),
        Animated.timing(pulse, {toValue: 1, duration: 900, useNativeDriver: false}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [weekComplete, pulse]);
  const pulsingBorder = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.primary],
  });

  if (slots.length === 0) return null;

  return (
    <View style={styles.outer}>
      {hasLiveGame && (
        <View style={styles.liveLead}>
          <View style={styles.liveDotWrap}>
            <View
              style={[styles.liveDotGlow, {backgroundColor: hexToRgba(colors.live, 0.18)}]}
            />
            <View style={[styles.liveDot, {backgroundColor: colors.live}]} />
          </View>
          <Text style={[bodyType.bold, styles.liveLabel, {color: colors.live}]}>
            {liveGameCount === 1 ? 'GAME IN PROGRESS' : 'GAMES IN PROGRESS'}
          </Text>
        </View>
      )}
      <View style={styles.row}>
      {slots.map(s => {
        const tappable = s.week > 0;
        // Pill fill by state: full HotPick blue for the live/active week,
        // faded orange for the week currently selected on the Picks page,
        // faded blue for other past weeks. (Active wins over selected.)
        const isActive = s.isCurrent;
        const isSelected = !isActive && tappable && s.week === viewedWeek;
        const isPastWeek = !isActive && !isSelected && tappable;
        const bg = isActive
          ? colors.highlight
          : isSelected
          ? colors.primary + '33'
          : isPastWeek
          ? colors.highlight + '33'
          : 'transparent';
        const pill = (
        <Animated.View
          style={[
            styles.slot,
            {
              backgroundColor: bg,
              borderColor:
                isActive && weekComplete
                  ? pulsingBorder
                  : isActive
                  ? colors.primary
                  : isSelected
                  ? colors.primary
                  : isPastWeek
                  ? colors.highlight + '80'
                  : colors.border,
            },
          ]}>
          <View style={styles.weekLabelRow}>
            <Text
              style={[bodyType.bold, styles.weekLabel, {color: colors.textTertiary}]}
              numberOfLines={1}>
              {slotLabel(s)}
            </Text>
            {!s.isCurrent && (
              <Lock size={9} color={colors.loss} strokeWidth={2.5} />
            )}
          </View>
          <View style={styles.numericStack}>
            <Text
              style={[
                displayType.display,
                styles.earned,
                {
                  color:
                    s.earned > 0
                      ? colors.win
                      : s.earned < 0
                      ? colors.loss
                      : s.isCurrent
                      ? colors.primary
                      : colors.textPrimary,
                },
              ]}
              numberOfLines={1}>
              {s.earned > 0 ? `+${s.earned}` : s.earned}
            </Text>
            {s.totalPicks != null && s.totalPicks > 0 && s.correctPicks != null && (
              <Text style={[monoType.regular, styles.pickCount, {color: colors.textTertiary}]}>
                <Text style={styles.pickCountWon}>{s.correctPicks}</Text>
                /{s.totalPicks}
              </Text>
            )}
          </View>
        </Animated.View>
        );

        if (!tappable) {
          return (
            <View key={s.week} accessible accessibilityLabel={slotA11yLabel(s)}>
              {pill}
            </View>
          );
        }
        return (
          <TouchableOpacity
            key={s.week}
            activeOpacity={0.7}
            onPress={() => openWeek(s.week)}
            accessibilityRole="button"
            accessibilityLabel={slotA11yLabel(s)}
            accessibilityHint="Opens this week on the Picks page">
            {pill}
          </TouchableOpacity>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginTop: spacing.md,
  },
  liveLead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 6,
  },
  liveDotWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotGlow: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveLabel: {
    fontSize: 15,
    letterSpacing: 1.4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  slot: {
    minWidth: 86,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: borderRadius.md + 2,
    borderWidth: 1,
    // Pill contents are centered as a block; the numeric lines
    // (score + games-won) are right-justified to EACH OTHER inside
    // their own column below.
    alignItems: 'center',
    // iOS compresses or hides flex children in a flex-end row when
    // the measured width is tight; lock each pill's footprint.
    flexShrink: 0,
    flexGrow: 0,
  },
  numericStack: {
    alignItems: 'center',
  },
  weekLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  weekLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  earned: {
    fontSize: 18,
    lineHeight: 20,
  },
  ceiling: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 1,
  },
  pickCount: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  // Win count gets the heavier weight — the total denominator stays
  // lighter so the eye lands on what the user actually won.
  pickCountWon: {
    fontSize: 14,
    fontWeight: '800',
  },
});
