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
import {colors, spacing, borderRadius, typography} from '@shared/theme';
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
  const userPickCount = useNFLStore(s => s.userPickCount);

  const initialize = useNFLStore(s => s.initialize);
  const fetchUserPickStatus = useNFLStore(s => s.fetchUserPickStatus);
  const fetchPoolStandings = useNFLStore(s => s.fetchPoolStandings);
  const fetchUserSeasonScore = useNFLStore(s => s.fetchUserSeasonScore);

  const userId = useGlobalStore(s => s.user?.id ?? null);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);

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
  }, [userId, activePoolId, fetchPoolStandings]);

  // ── 2b. Fetch pool-independent season score for ScoreModule ──────────
  useEffect(() => {
    if (userId) {
      fetchUserSeasonScore(userId);
    }
  }, [userId, fetchUserSeasonScore]);

  // ── 3. Fetch user pick status when picks_open ────────────────────────
  useEffect(() => {
    if (weekState !== 'picks_open' || !userId) {
      return;
    }
    fetchUserPickStatus(userId);
  }, [weekState, userId, currentWeek, fetchUserPickStatus]);

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

  // ── Phase label for CardHeader ───────────────────────────────────────
  const phaseLabel =
    currentPhase === 'PLAYOFFS'
      ? 'Playoffs'
      : currentPhase === 'SUPERBOWL'
        ? 'Super Bowl'
        : 'Regular Season';

  return (
    <View style={[styles.card, {borderTopColor: config.color}]}>
      {/* Card header with pool switcher */}
      <CardHeader
        eventName={config.shortName}
        weekLabel={`Week ${currentWeek} \u00B7 ${phaseLabel}`}
        poolName={activePool?.name ?? 'Select Pool'}
        userPools={userPools}
        activePoolId={activePoolId}
        onSwitchPool={setActivePoolId}
        accentColor={config.color}
        smackUnreadCounts={smackUnreadCounts}
      />

      {/* Week state sub-component */}
      {renderWeekState({
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
        userHasSubmitted: userPickCount > 0,
        poolPicksSubmittedCount,
        poolMemberCount,
        onMakePicks: onNavigateToEvent ?? (() => {}),
      })}
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
  userHasSubmitted: boolean;
  poolPicksSubmittedCount: number;
  poolMemberCount: number;
  onMakePicks: () => void;
}) {
  switch (props.weekState) {
    case 'picks_open':
      return (
        <PicksOpenCard
          deadline={props.picksDeadline}
          currentWeek={props.currentWeek}
          highestRankedGame={props.highestRankedGame}
          userHasSubmitted={props.userHasSubmitted}
          poolPicksSubmittedCount={props.poolPicksSubmittedCount}
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
          totalWeeks={props.totalWeeks}
          poolStandings={props.poolStandings}
          userId={props.userId}
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Card Header with Pool Switcher dropdown + week/phase label
// ---------------------------------------------------------------------------

interface CardHeaderProps {
  eventName: string;
  weekLabel: string;
  poolName: string;
  userPools: DbPool[];
  activePoolId: string | null;
  onSwitchPool: (poolId: string | null) => void;
  accentColor: string;
  smackUnreadCounts: Record<string, number>;
}

function CardHeader({
  eventName,
  weekLabel,
  poolName,
  userPools,
  activePoolId,
  onSwitchPool,
  accentColor,
  smackUnreadCounts,
}: CardHeaderProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const switchTo = (poolId: string) => {
    onSwitchPool(poolId);
    setModalVisible(false);
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={[styles.eventName, {color: accentColor}]}>{eventName}</Text>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
      </View>

      <TouchableOpacity
        style={styles.poolSelector}
        onPress={() => setModalVisible(true)}>
        <Text style={styles.poolName} numberOfLines={1}>
          {poolName}
        </Text>
        <ChevronDown size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          {/* Background dismiss — sibling, not parent of modal content */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          {/* Modal content — completely decoupled from dismiss handler */}
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Switch Pool</Text>
            <ScrollView bounces={false}>
              {userPools.map(item => {
                const unread = smackUnreadCounts[item.id] ?? 0;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.poolOption}
                    onPress={() => switchTo(item.id)}>
                    <View style={styles.poolOptionRow}>
                      <Text
                        style={[
                          styles.poolOptionText,
                          item.id === activePoolId && {color: accentColor},
                        ]}>
                        {item.name}
                      </Text>
                      {unread > 0 && (
                        <MessageCircle
                          size={14}
                          color={colors.primary}
                          fill={colors.primary}
                        />
                      )}
                    </View>
                    {item.id === activePoolId && (
                      <Text style={{color: accentColor, fontSize: 16}}>
                        {'\u2713'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderTopWidth: 3,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flex: 1,
  },
  eventName: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  weekLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  poolSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  poolName: {
    ...typography.caption,
    color: colors.text,
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
    color: colors.text,
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
    color: colors.text,
  },
});
