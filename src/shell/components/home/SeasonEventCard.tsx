import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import {ChevronDown} from 'lucide-react-native';
import {colors, spacing, borderRadius, typography} from '@shared/theme';
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
}

/**
 * SeasonEventCard — Smart Home Screen card for season-template events.
 *
 * Subscribes to exactly two store slices:
 *   1. weekState from nflStore (determines which sub-component renders)
 *   2. activePoolId from globalStore (drives pool switcher + all tabs)
 *
 * The pool switcher dropdown lives inside this card's header.
 * Calling setActivePoolId updates Home, Board, and SmackTalk simultaneously.
 */
export function SeasonEventCard({config}: SeasonEventCardProps) {
  // Two subscriptions — nothing else
  const weekState = useNFLStore(s => s.weekState);
  const activePoolId = useGlobalStore(s => s.activePoolId);

  // Additional data for sub-components (still from the same two stores)
  const currentWeek = useNFLStore(s => s.currentWeek);
  const picksDeadline = useNFLStore(s => s.picksDeadline);
  const userHotPick = useNFLStore(s => s.userHotPick);
  const liveScores = useNFLStore(s => s.liveScores);
  const weekResult = useNFLStore(s => s.weekResult);
  const poolStandings = useNFLStore(s => s.poolStandings);
  const userId = useGlobalStore(s => s.user?.id ?? null);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);

  const activePool = userPools.find(p => p.id === activePoolId);

  return (
    <View style={[styles.card, {borderTopColor: config.color}]}>
      {/* Card header with pool switcher */}
      <CardHeader
        eventName={config.shortName}
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
        liveScores,
        weekResult,
        poolStandings,
        userId,
        totalWeeks: config.totalWeeks,
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
  liveScores: Record<string, any>;
  weekResult: any;
  poolStandings: any[];
  userId: string | null;
  totalWeeks: number;
}) {
  switch (props.weekState) {
    case 'picks_open':
      return (
        <PicksOpenCard
          deadline={props.picksDeadline}
          currentWeek={props.currentWeek}
        />
      );
    case 'locked':
      return <LockedCard currentWeek={props.currentWeek} />;
    case 'live':
      return (
        <LiveCard
          currentWeek={props.currentWeek}
          userHotPick={props.userHotPick}
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
// Card Header with Pool Switcher dropdown
// ---------------------------------------------------------------------------

interface CardHeaderProps {
  eventName: string;
  poolName: string;
  userPools: DbPool[];
  activePoolId: string | null;
  onSwitchPool: (poolId: string | null) => void;
  accentColor: string;
  smackUnreadCounts: Record<string, number>;
}

function CardHeader({
  eventName,
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
      <Text style={[styles.eventName, {color: accentColor}]}>{eventName}</Text>

      <TouchableOpacity
        style={styles.poolSelector}
        onPress={() => setModalVisible(true)}>
        <Text style={styles.poolName} numberOfLines={1}>
          {poolName}
        </Text>
        <ChevronDown size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Switch Pool</Text>
            <FlatList
              data={userPools}
              keyExtractor={p => p.id}
              renderItem={({item}) => {
                const unread = smackUnreadCounts[item.id] ?? 0;
                return (
                  <TouchableOpacity
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
                        <View style={styles.unreadDot} />
                      )}
                    </View>
                    {item.id === activePoolId && (
                      <Text style={{color: accentColor, fontSize: 16}}>
                        {'\u2713'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
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
  eventName: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
