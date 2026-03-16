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
import {spacing, borderRadius, typography} from '@shared/theme';
import type {TournamentConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {useWorldCupStore} from '@sports/worldcup/stores/worldCupStore';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';

interface TournamentEventCardProps {
  config: TournamentConfig;
}

/**
 * TournamentEventCard — Smart Home Screen card for tournament-template events.
 *
 * Subscribes to:
 *   1. currentStage + picks state from worldCupStore
 *   2. activePoolId from globalStore
 */
export function TournamentEventCard({config}: TournamentEventCardProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const currentStage = useWorldCupStore(s => s.currentStage);
  const groupPicksOpen = useWorldCupStore(s => s.groupPicksOpen);
  const groupPicksLocked = useWorldCupStore(s => s.groupPicksLocked);
  const knockoutPicksOpen = useWorldCupStore(s => s.knockoutPicksOpen);
  const isComplete = useWorldCupStore(s => s.isComplete);

  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);

  const activePool = userPools.find(p => p.id === activePoolId);

  return (
    <View style={[styles.card, {borderTopColor: config.color}]}>
      <CardHeader
        eventName={config.shortName}
        poolName={activePool?.name ?? 'Select Pool'}
        userPools={userPools}
        activePoolId={activePoolId}
        onSwitchPool={setActivePoolId}
        accentColor={config.color}
        smackUnreadCounts={smackUnreadCounts}
      />
      <View style={styles.body}>
        <Text style={styles.label}>{currentStage.replace(/_/g, ' ')}</Text>
        <RenderTournamentState
          currentStage={currentStage}
          groupPicksOpen={groupPicksOpen}
          groupPicksLocked={groupPicksLocked}
          knockoutPicksOpen={knockoutPicksOpen}
          isComplete={isComplete}
        />
      </View>
    </View>
  );
}

function RenderTournamentState(props: {
  currentStage: string;
  groupPicksOpen: boolean;
  groupPicksLocked: boolean;
  knockoutPicksOpen: boolean;
  isComplete: boolean;
}) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  if (props.isComplete) {
    return <Text style={styles.headline}>Tournament complete</Text>;
  }

  if (props.currentStage === 'PRE_TOURNAMENT') {
    if (props.groupPicksOpen && !props.groupPicksLocked) {
      return (
        <>
          <Text style={styles.headline}>Group picks are open</Text>
          <Text style={styles.sub}>
            Lock in your group advancement predictions
          </Text>
        </>
      );
    }
    return <Text style={styles.headline}>Tournament starts soon</Text>;
  }

  if (props.knockoutPicksOpen) {
    return (
      <>
        <Text style={styles.headline}>Knockout picks open</Text>
        <Text style={styles.sub}>Make your picks before the next round</Text>
      </>
    );
  }

  return <Text style={styles.headline}>Matches in progress</Text>;
}

// ---------------------------------------------------------------------------
// Card Header (same pattern as SeasonEventCard)
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
  const {colors} = useTheme();
  const styles = createStyles(colors);
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
                      {unread > 0 && <View style={styles.unreadDot} />}
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

const createStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
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
    color: colors.textPrimary,
    fontWeight: '500',
    maxWidth: 150,
  },
  body: {
    padding: spacing.md,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  headline: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.surface,
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
