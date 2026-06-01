import React, {useEffect, useCallback, useMemo, useState} from 'react';
import {View, Text, SectionList, ActivityIndicator, Alert, StyleSheet, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {BarChart3} from 'lucide-react-native';
import {useSeasonStore} from '../stores/seasonStore';
import {WeekSelector} from '../components/WeekSelector';
import {SeasonMatchCard} from '../components/SeasonMatchCard';
import {PicksProgressHeader} from '../components/PicksProgressHeader';
import {SubmitPicksFooter} from '../components/SubmitPicksFooter';
import {useAuth} from '@shared/hooks/useAuth';
import {spacing, borderRadius} from '@shared/theme';
import type {DbSeasonGame} from '@shared/types/database';
import {useTheme} from '@shell/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {DemoIntroModal, DemoScoreModal} from '@shell/components/home/DemoModals';

// ---------------------------------------------------------------------------
// Game ordering — games are arranged by HotPick rank (1 at top → 16 at bottom).
// Once a game locks (kicks off) it jumps to a "LOCKED" group at the top, while
// games that haven't kicked off stay in an "OPEN" group below — each group
// independently ranked 1→16. Replaces the older kickoff-time ("wave") grouping;
// the per-game kickoff time still shows on each card.
// ---------------------------------------------------------------------------

/** Effective HotPick rank for ordering: frozen_rank (locked at deadline) ?? live rank. */
function effectiveRank(g: DbSeasonGame): number {
  return g.frozen_rank ?? g.rank ?? 999;
}

/** Has this game kicked off / locked? (live, final, lock_at passed, or kickoff passed) */
function hasKickedOff(g: DbSeasonGame): boolean {
  const s = (g.status ?? '').toUpperCase();
  if (s === 'FINAL' || s === 'STATUS_FINAL' || s === 'COMPLETED' || s === 'IN_PROGRESS' || s === 'LIVE') {
    return true;
  }
  if (g.lock_at && new Date(g.lock_at).getTime() <= Date.now()) return true;
  if (new Date(g.kickoff_at).getTime() <= Date.now()) return true;
  return false;
}

/**
 * SeasonPicksScreen — Main weekly picks screen.
 * SectionList grouped by kickoff wave, SeasonMatchCards below.
 * Never references a specific sport.
 */
export function SeasonPicksScreen() {
  const {colors} = useTheme();
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

  // When the DB advances to a new week (week transition), auto-advance the
  // viewing week so seasonStore.currentWeek stays in sync with nflStore.currentWeek.
  // Without this, picksAreOpen = (weekState_open && currentWeek === dbCurrentWeek)
  // evaluates to false for the new week — locking all games after every transition.
  // Only fire when dbCurrentWeek changes (not when user manually navigates back).
  useEffect(() => {
    const viewingWeek = useSeasonStore.getState().currentWeek;
    if (dbCurrentWeek > viewingWeek) {
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

  // Wave-lock fallback: earliest kickoff of any live/final game this week.
  // Used by SeasonMatchCard to lock games without lock_at that kicked off at
  // or before this time. Games with lock_at use lock_at as authoritative.
  const liveAnchorTime = useMemo(() => {
    if (weekState !== 'live') return null;
    const liveOrFinalKickoffs = games
      .filter(g => {
        const s = (g.status ?? '').toUpperCase();
        return s === 'IN_PROGRESS' || s === 'LIVE' || s === 'FINAL' || s === 'STATUS_FINAL' || s === 'COMPLETED';
      })
      .map(g => new Date(g.kickoff_at).getTime());
    return liveOrFinalKickoffs.length > 0 ? Math.min(...liveOrFinalKickoffs) : null;
  }, [weekState, games]);

  // Picks remain interactive through 'live'; individual cards lock per kickoff.
  // 'locked' state and beyond are fully locked (all games sit in the LOCKED group).
  const picksAreOpen =
    (weekState === 'picks_open' || weekState === 'live') && currentWeek === dbCurrentWeek;

  // Two rank-ordered groups: LOCKED (kicked off, or whole week locked) on top,
  // OPEN (still pickable) below — each sorted by HotPick rank 1→16.
  const sections = useMemo(() => {
    const locked: DbSeasonGame[] = [];
    const open: DbSeasonGame[] = [];
    for (const g of games) {
      (!picksAreOpen || hasKickedOff(g) ? locked : open).push(g);
    }
    const byRank = (a: DbSeasonGame, b: DbSeasonGame) => effectiveRank(a) - effectiveRank(b);
    locked.sort(byRank);
    open.sort(byRank);
    const isFinalGame = (g: DbSeasonGame) => {
      const s = (g.status ?? '').toUpperCase();
      return s === 'FINAL' || s === 'STATUS_FINAL' || s === 'COMPLETED';
    };
    const out: {title: string; data: DbSeasonGame[]}[] = [];
    if (locked.length) {
      // Label the top group FINAL once its games are decided (incl. demo reveal),
      // otherwise LOCKED (kicked off but still in progress / pre-kickoff lock).
      out.push({title: locked.every(isFinalGame) ? 'FINAL' : 'LOCKED', data: locked});
    }
    if (open.length) out.push({title: 'OPEN', data: open});
    return out;
  }, [games, picksAreOpen]);

  if (!config) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // PRE_SEASON: no picks yet — show a holding screen
  if (currentPhase === 'PRE_SEASON') {
    const picksOpenLabel = picksOpenAt
      ? picksOpenAt.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'})
      : null;
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Picks aren't open yet.</Text>
        <Text style={styles.emptyText}>
          {picksOpenLabel
            ? `Picks open ${picksOpenLabel}. The schedule is loaded — come back then.`
            : 'The schedule is set. Check back when the season kicks off.'}
        </Text>
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
        liveAnchorTime={liveAnchorTime}
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
      <WeekSelector
        totalWeeks={config.totalWeeks}
        currentWeek={currentWeek}
        activeWeek={dbCurrentWeek}
        onSelectWeek={handleSelectWeek}
        accentColor={colors.secondary}
        playoffStartWeek={config.playoffStartWeek}
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
          {allGamesFinal && weekEarned != null ? (
            <View style={styles.widgetRow}>
              <View style={styles.widgetFull}>
                <Text style={styles.widgetLabelFinal}>
                  Week {currentWeek} {'\u2022'} FINAL SCORE
                </Text>
                <View style={styles.widgetValueRow}>
                  <Text style={[
                    styles.widgetValue,
                    {color: weekEarned >= 0 ? colors.success : colors.error},
                  ]}>
                    {weekEarned >= 0 ? '+' : ''}{weekEarned}
                  </Text>
                  <Text style={[
                    styles.widgetPts,
                    {color: weekEarned >= 0 ? colors.success : colors.error},
                  ]}>pts</Text>
                  <Text style={styles.widgetTarget}>/{potentialWeekScore} ceiling pts</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.widgetRow}>
              <View style={styles.widget}>
                <Text style={styles.widgetLabel}>Weekly Ceiling</Text>
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
                <Text style={styles.widgetLabel}>Weekly Score</Text>
                <View style={styles.widgetValueRow}>
                  <Text style={[
                    styles.widgetValue,
                    weekEarned != null && weekEarned > 0 && {color: colors.success},
                    weekEarned != null && weekEarned < 0 && {color: colors.error},
                  ]}>
                    {weekEarned == null
                      ? '—'
                      : weekEarned > 0
                        ? `+${weekEarned}`
                        : `${weekEarned}`}
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
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, {backgroundColor: colors.border}]} />
            )}
            stickySectionHeadersEnabled={false}
          />
        </View>
      )}

      {/* Demo: once revealed, swap the submit button for a Ladder link. */}
      {isDemoActive && demoRevealed ? (
        <View style={[styles.demoFooter, {backgroundColor: colors.background, borderTopColor: colors.border}]}>
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
          <DemoIntroModal visible={demoIntroOpen} onClose={dismissDemoIntro} />
          <DemoScoreModal
            visible={demoScoreOpen}
            result={demoResult}
            onClose={dismissDemoScore}
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
