import React, {useEffect, useCallback, useMemo, useRef, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {View, SectionList, ActivityIndicator, Alert, StyleSheet, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {BarChart3} from 'lucide-react-native';
import {useSeasonStore} from '../stores/seasonStore';
import {WeekSelector} from '../components/WeekSelector';
import {SeasonMatchCard} from '../components/SeasonMatchCard';
import {isWeekLocked} from '../utils/weekLock';
import {hasStarted, resolveWeekScore} from '../utils/weekScore';
import {PicksProgressHeader} from '../components/PicksProgressHeader';
import {SubmitPicksFooter} from '../components/SubmitPicksFooter';
import {useAuth} from '@shared/hooks/useAuth';
import {spacing, borderRadius} from '@shared/theme';
import {PILL_HEIGHT} from '@shared/theme/pill';
import type {DbSeasonGame} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {useNavReserve} from '@shared/hooks/useNavReserve';
import {fmtPoints, ordinalSuffix} from '@shared/utils/format';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {DemoIntroModal, DemoScoreModal} from '@shell/components/home/DemoModals';
import {DemoButton} from '@shell/components/home/DemoButton';
import {PracticeBanner} from '@shell/components/PracticeBanner';
import {useExitDemo} from '@shell/hooks/useExitDemo';

// ---------------------------------------------------------------------------
// Game ordering — once a game actually kicks off it rises to the top, grouped
// into broad kickoff WAVES (THURSDAY NIGHT / SUNDAY 1PM / SUNDAY 4PM / SUNDAY
// NIGHT / MONDAY NIGHT). One section per wave, in chronological order (earliest kickoff on top), the HotPick first in its wave then rank-ordered
// within the wave. So the list tracks the week's progress — Thursday on top
// first, then the Sunday 1pm block below it, then 4pm, SNF, MNF. Games not yet
// started stay in a single "OPEN" group below, ranked by HotPick value (1 → 16)
// since those are the picks you can still make. A game lifts up only when it
// actually kicks off — that's the GROUPING rule, and it is not the lock rule:
// picks lock for the WHOLE WEEK at the first kickoff (see weekLock.ts), so games
// sitting in "OPEN" after that are unstarted, not still pickable.
// ---------------------------------------------------------------------------

/** Effective HotPick rank for ordering: frozen_rank (locked at deadline) ?? live rank. */
function effectiveRank(g: DbSeasonGame): number {
  return g.frozen_rank ?? g.rank ?? 999;
}

/**
 * Broad kickoff "wave" bucket for a game — groups all games in the same slot
 * under one header (e.g. every 1pm game → "SUNDAY 1PM", every 4pm game →
 * "SUNDAY 4PM") instead of one header per exact kickoff. Slots are detected
 * from the UTC kickoff (timezone-independent), matching the NFL schedule waves.
 * Returns a stable key (for bucketing) + a display label.
 */
function waveBucket(g: DbSeasonGame): {key: string; label: string} {
  const d = new Date(g.kickoff_at);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, 4=Thu, 5=Fri, 6=Sat
  const hour = d.getUTCHours();
  if (day === 4 && hour >= 17) return {key: 'thu', label: 'THURSDAY NIGHT'};
  if (day === 5 && hour < 4) return {key: 'thu', label: 'THURSDAY NIGHT'};
  if (day === 5) return {key: 'fri', label: 'FRIDAY'};
  if (day === 6) return {key: 'sat', label: 'SATURDAY'};
  if (day === 0 && hour >= 13 && hour < 17) return {key: 'sun_am', label: 'SUNDAY MORNING'};
  if (day === 0 && hour >= 17 && hour < 20) return {key: 'sun1', label: 'SUNDAY 1PM'};
  if (day === 0 && hour >= 20 && hour < 23) return {key: 'sun4', label: 'SUNDAY 4PM'};
  if (day === 0 && hour >= 23) return {key: 'snf', label: 'SUNDAY NIGHT'};
  if (day === 1 && hour < 4) return {key: 'snf', label: 'SUNDAY NIGHT'};
  if (day === 1 && hour >= 17) return {key: 'mnf', label: 'MONDAY NIGHT'};
  if (day === 2 && hour < 4) return {key: 'mnf', label: 'MONDAY NIGHT'};
  return {key: 'other', label: 'OTHER'};
}

/**
 * SeasonPicksScreen — Main weekly picks screen.
 * SectionList grouped by kickoff wave, SeasonMatchCards below.
 * Never references a specific sport.
 */
export function SeasonPicksScreen() {
  const {colors} = useTheme();
  const navReserve = useNavReserve();
  const styles = createStyles(colors);
  const config = useSeasonStore(s => s.config);
  const games = useSeasonStore(s => s.games);
  const currentWeek = useSeasonStore(s => s.currentWeek);
  const isLoading = useSeasonStore(s => s.isLoading);
  const hotPickCount = useSeasonStore(s => s.getHotPickCount());
  const pickCount = useSeasonStore(s => s.getPickCount());
  const setCurrentWeek = useSeasonStore(s => s.setCurrentWeek);
  const fetchWeekGames = useSeasonStore(s => s.fetchWeekGames);
  const fetchUserPicks = useSeasonStore(s => s.fetchUserPicks);
  const weekPicks = useSeasonStore(s => s.weekPicks);
  const {user} = useAuth();
  const dbCurrentWeek = useNFLStore(s => s.currentWeek);
  const weekState = useNFLStore(s => s.weekState);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const picksOpenAt = useNFLStore(s => s.picksOpenAt);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const subscribeToGameScores = useSeasonStore(s => s.subscribeToGameScores);

  // ── Onboarding demo state (inert unless the demo is active) ──
  const navigation = useNavigation<any>();
  const isDemoActive = useGlobalStore(s => s.isDemoActive);
  const demoIntroOpen = useGlobalStore(s => s.demoIntroOpen);
  const demoScoreOpen = useGlobalStore(s => s.demoScoreOpen);
  const demoResult = useGlobalStore(s => s.demoResult);
  const demoRevealed = demoResult != null; // results shown once a result exists
  const dismissDemoIntro = useGlobalStore(s => s.dismissDemoIntro);
  const dismissDemoScore = useGlobalStore(s => s.dismissDemoScore);
  // Exit the demo straight to Home — shared by the two popup escape hatches
  // (tap outside) and the PRACTICE banner's Exit control.
  //
  // The body used to live here and was duplicated byte-for-byte in
  // DemoResultScreen.handleDone, while MainTabNavigator's tab listener ran a
  // THIRD, shorter version that had already dropped markConfigStale and the
  // reset_demo RPC. All three now share @shell/hooks/useExitDemo.
  const handleExitHome = useExitDemo();

  // Check if all games are final for this week
  const allGamesFinal = games.length > 0 && games.every(g => {
    const status = (g.status ?? '').toUpperCase();
    return status === 'FINAL' || status === 'COMPLETED' || status === 'STATUS_FINAL';
  });

  // Live week earned points — fetched on mount and kept current via Realtime.
  // The scoring Edge Function writes to season_user_totals as each game finalizes,
  // so this updates progressively throughout the week rather than only at the end.
  const [weekEarned, setWeekEarned] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.id || !config) {
      setWeekEarned(null);
      return;
    }

    const fetchEarned = async () => {
      const {data} = await supabase
        .from('season_user_totals')
        .select('week_points')
        .eq('user_id', user.id)
        .eq('competition', config.competition)
        .eq('week', currentWeek)
        .maybeSingle();
      setWeekEarned(data?.week_points ?? null);
    };
    fetchEarned();

    // Subscribe to scoring updates for this user's week row
    const channel = supabase
      .channel(`week_earned_${user.id}_${config.competition}_${currentWeek}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'season_user_totals',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row.competition === config.competition && row.week === currentWeek) {
            setWeekEarned(row.week_points ?? null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, config, currentWeek]);

  // Pick split stats per game (from game_pick_stats table)
  const [pickStats, setPickStats] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!config || !activePoolId || games.length === 0) return;
    const fetchStats = async () => {
      const {data} = await supabase
        .from('game_pick_stats')
        .select('game_id, team_a, team_b, team_a_pick_count, team_b_pick_count, total_picks, hotpick_team_a_count, hotpick_team_b_count, hotpick_total')
        .eq('pool_id', activePoolId)
        .eq('competition', config.competition)
        .eq('week', currentWeek);
      if (data) {
        const map: Record<string, any> = {};
        for (const row of data) {
          map[row.game_id] = {
            teamAPickCount: row.team_a_pick_count,
            teamBPickCount: row.team_b_pick_count,
            totalPicks: row.total_picks,
            hotpickTeamACount: row.hotpick_team_a_count,
            hotpickTeamBCount: row.hotpick_team_b_count,
            hotpickTotal: row.hotpick_total,
          };
        }
        setPickStats(map);
      }
    };
    fetchStats();
  }, [config, activePoolId, currentWeek, games.length]);

  // Compute potential week score from current picks
  const potentialWeekScore = (() => {
    if (weekPicks.length === 0) return 0;
    let total = 0;
    for (const pick of weekPicks) {
      const game = games.find(g => g.game_id === pick.game_id);
      const rank = game?.frozen_rank ?? game?.rank ?? 1;
      if (pick.is_hotpick) {
        total += rank;
      } else {
        total += 1;
      }
    }
    return total;
  })();

  // Week Score — derived by the SHARED helper so Home's WEEK eyebrow shows this
  // exact number at every point of the weekend. Never derive it a second way here.
  const isLiveWeek = currentWeek === dbCurrentWeek;
  const displayWeekScore = useMemo(
    () =>
      resolveWeekScore({
        picks: weekPicks,
        games,
        isLiveWeek,
        serverWeekPoints: weekEarned,
      }),
    [weekPicks, games, isLiveWeek, weekEarned],
  );

  // Keep the viewing week in sync with the league's current week, but DON'T
  // yank the user off a week they've navigated back to. On first mount we land
  // on the live week. After that we only follow the league forward when the
  // user is still on the (previously) live week — if they've lingered on an
  // earlier, completed week (e.g. to read its FINAL SCORE banner), we leave
  // them there until they move themselves.
  // (picksAreOpen needs currentWeek === dbCurrentWeek, so the live week must
  // stay in sync for the new week not to read as locked.)
  const prevDbWeekRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevDbWeekRef.current;
    prevDbWeekRef.current = dbCurrentWeek;
    const viewingWeek = useSeasonStore.getState().currentWeek;
    if (prev === null) {
      // First sync — land on the live week.
      if (dbCurrentWeek > viewingWeek) setCurrentWeek(dbCurrentWeek);
      return;
    }
    // Follow forward only if the user was on the previously-live week.
    if (dbCurrentWeek > prev && viewingWeek === prev) {
      setCurrentWeek(dbCurrentWeek);
    }
  }, [dbCurrentWeek, setCurrentWeek]);

  useEffect(() => {
    if (!config) {
      return;
    }
    const load = async () => {
      await fetchWeekGames(currentWeek);
      if (user?.id) {
        await fetchUserPicks(user.id, currentWeek);
      }
    };
    load();
  }, [config, currentWeek, weekState, user?.id, fetchWeekGames, fetchUserPicks]);

  // Re-fetch games when Picks tab regains focus so lock_at changes are picked up
  // even if weekState hasn't changed (e.g. new wave kicks off during 'live')
  useFocusEffect(
    useCallback(() => {
      if (!config) return;
      fetchWeekGames(currentWeek);
    }, [config, currentWeek, fetchWeekGames]),
  );

  // Subscribe to live game updates (scores, status, lock_at) whenever the
  // screen is mounted — not just during 'live'. lock_at changes from the
  // simulator can arrive during any weekState.
  useEffect(() => {
    if (!config) return;
    const unsub = subscribeToGameScores();
    return unsub;
  }, [config, subscribeToGameScores]);

  // Block week navigation if user has picks but no HotPick
  const handleSelectWeek = useCallback(
    (week: number) => {
      if (pickCount > 0 && hotPickCount === 0) {
        Alert.alert(
          'Select Your HotPick',
          'You need to pick a HotPick before switching weeks. Tap the flame icon on any game.',
        );
        return;
      }
      setCurrentWeek(week);
    },
    [pickCount, hotPickCount, setCurrentWeek],
  );

  // Phase gate only — does this week_state allow picking at all. It is NOT the
  // lock: that's weekLocked just below, a WHOLE-WEEK rule (first kickoff seals
  // the week, never per game). 'live' stays here because the phase permits
  // interaction; weekLocked is what actually closes the cards.
  const picksAreOpen =
    (weekState === 'picks_open' || weekState === 'live') && currentWeek === dbCurrentWeek;

  // Whole-week lock (matches the server's enforce_pick_lock): read-only once the
  // week's first kickoff passes. Single shared source — the card, the section
  // grouping below, and the submit footer all read this, never their own MIN.
  // picksAreOpen keeps its phase meaning; weekLocked is a separate fact.
  const weekLocked = isWeekLocked(games);

  // Started games (or the whole week locked) rise to the top, grouped into
  // kickoff-time WAVES — one section per kickoff time, labelled with that time
  // (e.g. "SUN 1:00 PM"), newest wave first. So as the week plays out each new
  // wave lands on top with its own time header. A game only lifts up once it
  // actually kicks off, not when its picks merely lock (Sunday seal). Games not
  // yet started stay in a single rank-ordered "OPEN" group below (rank helps
  // prioritize the picks you can still make).
  const sections = useMemo(() => {
    const started: DbSeasonGame[] = [];
    const open: DbSeasonGame[] = [];
    for (const g of games) {
      (!picksAreOpen || weekLocked || hasStarted(g) ? started : open).push(g);
    }
    const byRank = (a: DbSeasonGame, b: DbSeasonGame) => effectiveRank(a) - effectiveRank(b);
    // The user's HotPick sorts to the top of its wave — a wrapper-level sort, so
    // the chip never learns HotPick status. byRank orders the rest of the wave.
    const hotPickGameId = weekPicks.find(p => p.is_hotpick)?.game_id ?? null;
    const byWave = (a: DbSeasonGame, b: DbSeasonGame) =>
      a.game_id === hotPickGameId ? -1 : b.game_id === hotPickGameId ? 1 : byRank(a, b);

    const out: {title: string; data: DbSeasonGame[]}[] = [];

    // Bucket started games into broad waves (1pm / 4pm / SNF / MNF / …) → one
    // section per wave, ordered by the wave's earliest kickoff, newest first.
    type Wave = {label: string; start: number; games: DbSeasonGame[]};
    const waves = new Map<string, Wave>();
    for (const g of started) {
      const {key, label} = waveBucket(g);
      const start = new Date(g.kickoff_at).getTime();
      const w = waves.get(key);
      if (w) {
        w.games.push(g);
        if (start < w.start) w.start = start;
      } else {
        waves.set(key, {label, start, games: [g]});
      }
    }
    // Chronological (earliest wave on top); the HotPick first in its wave, then rank-order (reads 1→16).
    for (const w of [...waves.values()].sort((a, b) => a.start - b.start)) {
      out.push({title: w.label, data: w.games.sort(byWave)});
    }

    if (open.length) {
      open.sort(byRank);
      out.push({title: 'OPEN', data: open});
    }
    return out;
  }, [games, picksAreOpen, weekLocked, weekPicks]);

  if (!config) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Outside the weekly cycle → no slate, just a holding screen (REFERENCE.md
  // §557 idle phases). No countdown here: Home owns that. Picks points, Home tells.
  //
  // The phase alone is NOT sufficient. A preseason competition (nfl_2026_pre)
  // runs current_phase = 'REGULAR' permanently — isolation comes from the
  // competition string, never the phase (Hard Rule #22) — so none of these
  // names ever match there, and this screen rendered a game list while
  // week_state was still 'idle'. week_state is the only value that can say
  // "no week is running" for that competition.
  //
  // Adding 'idle' does NOT reintroduce the lag the old comment warned about.
  // A live week cycles picks_open → locked → live → settling → complete →
  // picks_open and never returns to 'idle'; admin_advance_season_phase forces
  // 'idle' only for OFF_SEASON and PRE_SEASON, both already matched above. So
  // this fires only when there genuinely is no week.
  const IDLE_PHASES = [
    'OFF_SEASON',
    'PRE_SEASON',
    'REGULAR_COMPLETE',
    'SUPERBOWL_INTRO',
    'SEASON_COMPLETE',
  ];
  if (IDLE_PHASES.includes(currentPhase) || weekState === 'idle') {
    const {title, body} = (() => {
      switch (currentPhase) {
        case 'SEASON_COMPLETE':
          return {
            title: "That's the season.",
            body: "No more picks. The Ladder's final — go see where you landed.",
          };
        case 'REGULAR_COMPLETE':
        case 'SUPERBOWL_INTRO':
          return {
            title: 'Nothing to pick yet.',
            body: "That week's done. The next one's coming.",
          };
        default: {
          // OFF_SEASON, PRE_SEASON — and now an idle week in any other phase,
          // which is how a preseason competition (permanently 'REGULAR')
          // reaches this copy. Date reads from season_picks_open_at (never
          // hardcoded), so nfl_2026_pre prints its own 2026-08-11 with no
          // special case. Same formatter as PreseasonPicksOpenLine on Home.
          const picksOpenLabel = picksOpenAt
            ? `${picksOpenAt.toLocaleDateString('en-US', {month: 'long'})} ${picksOpenAt.getDate()}${ordinalSuffix(picksOpenAt.getDate())}`
            : 'September 2nd';
          return {
            title: 'Your perfect record starts here.',
            body: `Picks open ${picksOpenLabel}. Commitments are made on Thursdays, and all weekend you stress about it. For now, you're undefeated.`,
          };
        }
      }
    })();
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{body}</Text>
      </View>
    );
  }

  const renderGame = ({item}: {item: DbSeasonGame}) => (
    <View style={styles.cardWrapper}>
      <SeasonMatchCard
        game={item}
        config={config}
        userId={user?.id ?? ''}
        pickSplit={pickStats[item.game_id] ?? null}
        picksAreOpen={picksAreOpen}
        weekLocked={weekLocked}
        hotPickSelected={hotPickCount > 0}
      />
    </View>
  );

  const renderSectionHeader = ({section}: {section: {title: string}}) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* PRACTICE banner — pinned to the very top of the content area, above
          the WeekSelector, so it is in normal flow and can never scroll away.
          Present from entry to exit whenever the demo is active. */}
      {isDemoActive && <PracticeBanner />}

      <WeekSelector
        totalWeeks={config.totalWeeks}
        currentWeek={currentWeek}
        activeWeek={dbCurrentWeek}
        onSelectWeek={handleSelectWeek}
        accentColor={colors.secondary}
        playoffStartWeek={config.playoffStartWeek}
        playoffWeekLabels={config.playoffWeekLabels}
        weekPrefix={config.periodLabels?.short}
      />

      {!isLoading && games.length > 0 && (
        <>
          <PicksProgressHeader
            currentWeek={currentWeek}
            pickCount={pickCount}
            totalGames={games.length}
            hotPickCount={hotPickCount}
            hotPicksRequired={config.hotPicksPerWeek}
            accentColor={config.color}
          />

          {/* Score widgets */}
          {allGamesFinal && displayWeekScore != null ? (
            <View style={styles.widgetRow}>
              <View style={styles.widgetFull}>
                <Text style={styles.widgetLabelFinal}>
                  Week {currentWeek} {'\u2022'} FINAL SCORE
                </Text>
                <View style={styles.widgetValueRow}>
                  <Text style={[
                    styles.widgetValue,
                    {color: displayWeekScore >= 0 ? colors.success : colors.error},
                  ]}>
                    {fmtPoints(displayWeekScore)}
                  </Text>
                  <Text style={[
                    styles.widgetPts,
                    {color: displayWeekScore >= 0 ? colors.success : colors.error},
                  ]}>pts</Text>
                  <Text style={styles.widgetTarget}>/{potentialWeekScore} ceiling pts</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.widgetRow}>
              <View style={styles.widget}>
                <Text style={styles.widgetLabel}>Week Ceiling</Text>
                <View style={styles.widgetValueRow}>
                  <Text style={[
                    styles.widgetValue,
                    pickCount > 0 && {color: colors.primary},
                  ]}>
                    {potentialWeekScore}
                  </Text>
                  <Text style={styles.widgetPts}>pts</Text>
                </View>
              </View>
              <View style={styles.widget}>
                <Text style={styles.widgetLabel}>Week Score</Text>
                <View style={styles.widgetValueRow}>
                  <Text style={[
                    styles.widgetValue,
                    displayWeekScore != null && displayWeekScore > 0 && {color: colors.success},
                    displayWeekScore != null && displayWeekScore < 0 && {color: colors.error},
                  ]}>
                    {displayWeekScore == null ? '—' : fmtPoints(displayWeekScore)}
                  </Text>
                  <Text style={styles.widgetPts}>pts</Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={config.color} />
        </View>
      ) : games.length === 0 ? (
        <View style={styles.emptyStateCentered}>
          <Text style={styles.emptyTitle}>No Games</Text>
        </View>
      ) : (
        // Wrapping the SectionList in a flex:1 View (rather than putting
        // flex:1 directly on the SectionList style prop) avoids a quirk
        // where the internal VirtualizedList style merge pushed the
        // sibling header views (PicksProgressHeader + widgets) down and
        // left a large gap below the WeekSelector.
        <View style={styles.listFlex}>
          <SectionList
            sections={sections}
            keyExtractor={item => item.game_id}
            renderItem={renderGame}
            renderSectionHeader={renderSectionHeader}
            // Demo entry point (spec §6.3) — a ListHeaderComponent, NOT a fixed
            // block. WeekSelector, PicksProgressHeader and the widget row are
            // already stacked above this list; a fourth fixed block would push
            // the first game off screen on the smallest supported device. As a
            // list header it scrolls away and costs no permanent height.
            //
            // Hidden while the demo is active: the demo must never offer to
            // launch itself.
            ListHeaderComponent={
              isDemoActive ? null : (
                <DemoButton variant="line" label="What's a HotPick?" />
              )
            }
            // Clears BOTH stacked pills — the nav (navReserve) and the floating
            // submit pill above it (its height + the gap it sits on) — so the
            // last game card scrolls fully above the pair. The submit pill is
            // absolutely positioned, so it reserves no flow height of its own.
            contentContainerStyle={[
              styles.list,
              {paddingBottom: navReserve + spacing.xs + PILL_HEIGHT + spacing.md},
            ]}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, {backgroundColor: colors.border}]} />
            )}
            stickySectionHeadersEnabled={false}
          />
        </View>
      )}

      {/* Demo: once revealed, swap the submit button for a Ladder link. */}
      {isDemoActive && demoRevealed ? (
        <View
          style={[
            styles.demoFooter,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              // Same slot as SubmitPicksFooter, same nav-pill clearance.
              paddingBottom: navReserve + spacing.sm,
            },
          ]}>
          <TouchableOpacity
            style={[styles.demoLadderBtn, {backgroundColor: colors.primary}]}
            onPress={() => navigation.navigate('DemoResult')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View the Ladder">
            <BarChart3 size={18} color={colors.onPrimary} strokeWidth={2.25} />
            <Text style={[styles.demoLadderLabel, {color: colors.onPrimary}]}>View the Ladder</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SubmitPicksFooter />
      )}

      {/* Demo onboarding modals — inert unless the demo is active. */}
      {isDemoActive && (
        <>
          <DemoIntroModal visible={demoIntroOpen} onClose={dismissDemoIntro} onExitHome={handleExitHome} />
          <DemoScoreModal
            visible={demoScoreOpen}
            result={demoResult}
            onClose={dismissDemoScore}
            onExitHome={handleExitHome}
            onViewLadder={() => {
              dismissDemoScore();
              navigation.navigate('DemoResult');
            }}
          />
        </>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  demoFooter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  demoLadderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  demoLadderLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  list: {
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  listFlex: {
    flex: 1,
  },
  cardWrapper: {
    marginBottom: spacing.sm,
  },
  separator: {
    height: 0,
    opacity: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  widgetRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  widget: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  widgetFull: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  widgetLabelFinal: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  widgetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  widgetValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  widgetValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  widgetTarget: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  widgetPts: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyStateCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
