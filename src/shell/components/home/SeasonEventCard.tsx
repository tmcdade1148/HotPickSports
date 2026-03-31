import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {ChevronDown, MessageCircle} from 'lucide-react-native';
import {spacing, borderRadius, typography} from '@shared/theme';
import {supabase} from '@shared/config/supabase';
import type {SeasonConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {PicksOpenCard} from './PicksOpenCard';
import {LockedCard} from './LockedCard';
import {LiveCard} from './LiveCard';
import {SettlingCard} from './SettlingCard';
import {CompleteCard} from './CompleteCard';
import {WeekScoreModule} from './WeekScoreModule';
import {useTheme, useBrand} from '@shell/theme';
import {useCountdown} from '@shared/hooks/useCountdown';

interface SeasonEventCardProps {
  config: SeasonConfig;
  /** Navigate to EventDetail for this event (drives CTA button) */
  onNavigateToEvent?: () => void;
}

/**
 * SeasonEventCard — Smart Home Screen card for season-template events.
 *
 * Responsibilities:
 *   1. Initializes nflStore with competition config on mount
 *   2. Fetches user pick status when weekState is picks_open
 *   3. Computes pool-scoped "poolies submitted" count via local state
 *   4. Subscribes to Realtime for live updates during picks_open
 *   5. Renders CardHeader with pool switcher + week/phase label
 *   6. Dispatches to the correct week-state sub-component
 */
export function SeasonEventCard({config, onNavigateToEvent}: SeasonEventCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  // ── Store subscriptions ──────────────────────────────────────────────
  const weekState = useNFLStore(s => s.weekState);
  const currentWeek = useNFLStore(s => s.currentWeek);
  const currentPhase = useNFLStore(s => s.currentPhase);
  const picksDeadline = useNFLStore(s => s.picksDeadline);
  const userHotPick = useNFLStore(s => s.userHotPick);
  const userHotPickGame = useNFLStore(s => s.userHotPickGame);
  const liveScores = useNFLStore(s => s.liveScores);
  const weekResult = useNFLStore(s => s.weekResult);
  const poolStandings = useNFLStore(s => s.poolStandings);
  const highestRankedGame = useNFLStore(s => s.highestRankedGame);
  const weekFirstKickoff = useNFLStore(s => s.weekFirstKickoff);
  const userPickCount = useNFLStore(s => s.userPickCount);
  const totalGamesThisWeek = useNFLStore(s => s.totalGamesThisWeek);
  const userSeasonTotal = useNFLStore(s => s.userSeasonTotal);

  const initialize = useNFLStore(s => s.initialize);
  const fetchUserPickStatus = useNFLStore(s => s.fetchUserPickStatus);
  const fetchUserHotPick = useNFLStore(s => s.fetchUserHotPick);
  const fetchPoolStandings = useNFLStore(s => s.fetchPoolStandings);
  const fetchUserSeasonScore = useNFLStore(s => s.fetchUserSeasonScore);

  const userId = useGlobalStore(s => s.user?.id ?? null);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.visiblePools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  // Subscribe to manualGlobalJoins so isPoolVisible re-evaluates on load
  useGlobalStore(s => s.manualGlobalJoins);

  const activePool = userPools.find(p => p.id === activePoolId);

  // ── Pool-scoped poolies submitted count (local state) ────────────────
  const [poolMemberCount, setPoolMemberCount] = useState(0);
  const [poolPicksSubmittedCount, setPoolPicksSubmittedCount] = useState(0);

  // ── 1. Initialize nflStore on mount ──────────────────────────────────
  useEffect(() => {
    initialize(config.competition);
  }, [config.competition, initialize]);

  // ── 2a. Fetch pool standings for StandingsBadge ───────────────────────
  useEffect(() => {
    if (userId && activePoolId) {
      fetchPoolStandings(userId, activePoolId);
    }
  }, [userId, activePoolId, currentPhase, fetchPoolStandings]);

  // ── 2b. Fetch pool-independent season score for ScoreModule ──────────
  useEffect(() => {
    if (userId) {
      fetchUserSeasonScore(userId);
    }
  }, [userId, currentPhase, fetchUserSeasonScore]);

  // ── 3. Fetch user pick status + HotPick when picks_open ──────────────
  useEffect(() => {
    if (weekState !== 'picks_open' || !userId) {
      return;
    }
    fetchUserPickStatus(userId);
    fetchUserHotPick(userId);
  }, [weekState, userId, currentWeek, fetchUserPickStatus, fetchUserHotPick]);

  // ── 3. Pool-scoped poolies count query ───────────────────────────────
  const fetchPooliesCount = useCallback(async () => {
    if (!activePoolId || weekState !== 'picks_open') {
      setPoolMemberCount(0);
      setPoolPicksSubmittedCount(0);
      return;
    }

    const competition = config.competition;

    // Get active pool member user IDs
    const {data: members} = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', activePoolId)
      .eq('status', 'active');

    const memberUserIds = members?.map(m => m.user_id) ?? [];
    setPoolMemberCount(memberUserIds.length);

    if (memberUserIds.length === 0) {
      setPoolPicksSubmittedCount(0);
      return;
    }

    // Count distinct users among pool members who have picks this week
    // Pool-independent: we query season_picks by user IDs, NOT by pool_id
    const {data: picksData} = await supabase
      .from('season_picks')
      .select('user_id')
      .eq('competition', competition)
      .eq('week', currentWeek)
      .in('user_id', memberUserIds);

    // Count distinct users who have at least one pick
    const distinctUsers = new Set(picksData?.map(p => p.user_id) ?? []);
    setPoolPicksSubmittedCount(distinctUsers.size);
  }, [activePoolId, weekState, config.competition, currentWeek]);

  useEffect(() => {
    fetchPooliesCount();
  }, [fetchPooliesCount]);

  // ── 4. Realtime subscription for picks_open state ────────────────────
  useEffect(() => {
    if (weekState !== 'picks_open' || !activePoolId) {
      return;
    }

    const channel = supabase
      .channel(`season_picks:${config.competition}:week${currentWeek}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'season_picks',
          filter: `competition=eq.${config.competition}`,
        },
        () => {
          // Re-fetch poolies count when any pick is inserted
          fetchPooliesCount();
          // Also refresh user's own pick status
          if (userId) {
            fetchUserPickStatus(userId);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    weekState,
    activePoolId,
    config.competition,
    currentWeek,
    fetchPooliesCount,
    userId,
    fetchUserPickStatus,
  ]);

  // ── Kickoff countdown ──────────────────────────────────────────────
  // In PRE_SEASON, count down to picks opening (from config.picksOpenDate).
  // During active weeks, count down to first kickoff.
  const countdownTarget = currentPhase === 'PRE_SEASON' && !weekFirstKickoff
    ? new Date(config.picksOpenDate)
    : weekFirstKickoff;
  const kickoff = useCountdown(countdownTarget);

  // Kickoff countdown (first game of the week)
  const firstGameKickoff = useCountdown(weekFirstKickoff);

  // HotPick game kickoff countdown
  const hotPickKickoffDate = userHotPickGame?.kickoff_at
    ? new Date(userHotPickGame.kickoff_at)
    : null;
  const hotPickKickoff = useCountdown(hotPickKickoffDate);

  // ── Glow color: partner secondary or HotPick teal ─────────────────
  const isBranded = !!(activePool?.brand_config as any)?.is_branded;
  const glowColor = isBranded
    ? (activePool?.brand_config as any)?.secondary_color || '#0E6666'
    : '#0E6666';

  return (
    <View style={styles.outerWrapper}>
      {/* Score + Kickoff pills row */}
      <View style={styles.pillRow}>
        {/* Score pill */}
        <View style={styles.scorePill}>
          <Text style={styles.scoreTotalLabel}>Season Total</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>
              {userSeasonTotal ?? 0}
            </Text>
            <Text style={styles.scorePtsLabel}>pts</Text>
          </View>
        </View>

        {/* Kickoff pill */}
        {kickoff.timeLeft && (
          <View style={styles.kickoffPill}>
            <View style={{flex: 1}}>
              {currentPhase === 'PRE_SEASON' ? (
                <>
                  <Text style={styles.kickoffLabel}>Season starts in:</Text>
                  {!kickoff.hasExpired && (
                    <Text style={styles.kickoffValue}>{kickoff.timeLeft}</Text>
                  )}
                </>
              ) : weekState === 'picks_open' ? (
                <>
                  <Text style={styles.kickoffLabel}>
                    PICKS are <Text style={{fontWeight: '900', color: '#1b9a06'}}>LIVE!</Text>
                  </Text>
                  {firstGameKickoff.timeLeft && !firstGameKickoff.hasExpired && (
                    <View style={styles.subCountdownRow}>
                      <Text style={styles.subCountdownLabel}>Kickoff in:</Text>
                      <Text style={styles.subCountdownValue}>{firstGameKickoff.timeLeft}</Text>
                    </View>
                  )}
                  {poolMemberCount > 0 && (
                    <Text style={styles.socialLine}>
                      {poolPicksSubmittedCount} of {poolMemberCount} poolies have locked in
                    </Text>
                  )}
                </>
              ) : weekState === 'locked' ? (
                <Text style={styles.kickoffLabel}>Picks are locked</Text>
              ) : weekState === 'live' ? (
                <Text style={[styles.kickoffLabel, {color: '#1b9a06', fontWeight: '700', fontStyle: 'italic'}]}>Games in progress</Text>
              ) : weekState === 'settling' ? (
                <Text style={styles.kickoffLabel}>Scores settling</Text>
              ) : (
                <>
                  <Text style={styles.kickoffLabel}>Picks go LIVE in:</Text>
                  {!kickoff.hasExpired && (
                    <Text style={styles.kickoffValue}>{kickoff.timeLeft}</Text>
                  )}
                </>
              )}
              {/* HotPick game card — only during picks_open (LiveCard handles live state) */}
              {weekState === 'picks_open' && userHotPick && userHotPickGame && (
                <View style={styles.hotPickCard}>
                  <View style={styles.hotPickHeader}>
                    <Text style={styles.hotPickBadge}>
                      HotPick {userHotPickGame.frozen_rank ?? userHotPickGame.rank ?? 0} pts
                    </Text>
                  </View>
                  <Text style={styles.hotPickMatchup}>
                    {userHotPickGame.away_team} @ {userHotPickGame.home_team}
                  </Text>
                  <View style={styles.hotPickPickedRow}>
                    <Text style={styles.hotPickPickedLabel}>Your pick:</Text>
                    <View style={styles.hotPickPickedBox}>
                      <Text style={styles.hotPickPickedTeam}>{userHotPick.picked_team}</Text>
                    </View>
                  </View>
                  <Text style={styles.hotPickKickoffTime}>
                    {new Date(userHotPickGame.kickoff_at).toLocaleDateString([], {weekday: 'long'})}
                    {', '}
                    {new Date(userHotPickGame.kickoff_at).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Week Score — between pills and week state card (hidden in PRE_SEASON) */}
      {currentPhase !== 'PRE_SEASON' && <WeekScoreModule />}

      {/* Week state content — outside the card box (hidden in PRE_SEASON) */}
      {currentPhase !== 'PRE_SEASON' && renderWeekState({
        weekState,
        currentWeek,
        picksDeadline,
        userHotPick,
        userHotPickGame,
        liveScores,
        weekResult,
        poolStandings,
        userId,
        totalWeeks: config.totalWeeks,
        highestRankedGame,
        weekFirstKickoff,
        userHasSubmitted: userPickCount > 0,
        userPickCount,
        totalGames: totalGamesThisWeek,
        poolPicksSubmittedCount,
        poolMemberCount,
        onMakePicks: onNavigateToEvent ?? (() => {}),
        weekLabelColor: isBranded
          ? (activePool?.brand_config as any)?.highlight_color || undefined
          : undefined,
      })}

      {/* Pool Switcher moved to shared PoolSwitcherBar in MainTabNavigator */}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Week state renderer — dispatches to the correct sub-component
// ---------------------------------------------------------------------------

function renderWeekState(props: {
  weekState: string;
  currentWeek: number;
  picksDeadline: Date | null;
  userHotPick: any;
  userHotPickGame: any;
  liveScores: Record<string, any>;
  weekResult: any;
  poolStandings: any[];
  userId: string | null;
  totalWeeks: number;
  highestRankedGame: any;
  weekFirstKickoff: Date | null;
  userHasSubmitted: boolean;
  userPickCount: number;
  totalGames: number;
  poolPicksSubmittedCount: number;
  poolMemberCount: number;
  onMakePicks: () => void;
  weekLabelColor?: string;
}) {
  switch (props.weekState) {
    case 'picks_open':
      return (
        <PicksOpenCard
          deadline={props.picksDeadline}
          currentWeek={props.currentWeek}
          highestRankedGame={props.highestRankedGame}
          weekFirstKickoff={props.weekFirstKickoff}
          hotPickKickoff={props.userHotPickGame?.kickoff_at ? new Date(props.userHotPickGame.kickoff_at) : null}
          hotPickTeam={props.userHotPick?.picked_team ?? null}
          userHasSubmitted={props.userHasSubmitted}
          userPickCount={props.userPickCount}
          totalGames={props.totalGames}
          poolPicksSubmittedCount={props.poolPicksSubmittedCount}
          weekLabelColor={props.weekLabelColor}
          poolMemberCount={props.poolMemberCount}
          onMakePicks={props.onMakePicks}
        />
      );
    case 'locked':
      return <LockedCard currentWeek={props.currentWeek} />;
    case 'live':
      return (
        <LiveCard
          currentWeek={props.currentWeek}
          userHotPick={props.userHotPick}
          userHotPickGame={props.userHotPickGame}
          liveScores={props.liveScores}
        />
      );
    case 'settling':
      return (
        <SettlingCard
          currentWeek={props.currentWeek}
          weekResult={props.weekResult}
        />
      );
    case 'complete':
      return (
        <CompleteCard
          currentWeek={props.currentWeek}
          weekPoints={props.weekResult?.weekPoints ?? 0}
          correctPicks={props.weekResult?.correctPicks ?? 0}
          totalPicks={props.weekResult?.totalPicks ?? 0}
          hotPickCorrect={props.weekResult?.hotPickCorrect ?? null}
          hotpickRank={props.userHotPickGame?.frozen_rank ?? props.userHotPickGame?.rank ?? null}
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Pool Switcher Button — prominent pill below week state content
// ---------------------------------------------------------------------------

// PoolSwitcherButton removed — unified in PoolSwitcherBar

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: any) => StyleSheet.create({
  outerWrapper: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  scorePill: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  scoreTotalLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scorePtsLabel: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  kickoffPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  kickoffIcon: {
    fontSize: 24,
  },
  kickoffLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  kickoffValue: {
    ...typography.h3,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  subCountdownRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  subCountdownLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  subCountdownValue: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  socialLine: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  hotPickCard: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    padding: spacing.sm,
  },
  hotPickHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  hotPickBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hotPickMatchup: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  hotPickPickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  hotPickPickedLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  hotPickPickedBox: {
    borderWidth: 1.5,
    borderColor: colors.highlight,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hotPickPickedTeam: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.highlight,
  },
  hotPickKickoffTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  poolSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  poolName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '500',
    maxWidth: 150,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '80%',
    maxHeight: '50%',
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  poolOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poolOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  poolOptionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
