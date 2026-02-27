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
import type {SeriesConfig} from '@shared/types/templates';
import type {DbPool} from '@shared/types/database';
import {useNHLStore} from '@sports/nhl/stores/nhlStore';
import {useGlobalStore} from '@shell/stores/globalStore';

interface SeriesEventCardProps {
  config: SeriesConfig;
}

/**
 * SeriesEventCard — Smart Home Screen card for series-template events.
 *
 * Subscribes to:
 *   1. currentRound + picks state from nhlStore
 *   2. activePoolId from globalStore
 */
export function SeriesEventCard({config}: SeriesEventCardProps) {
  const currentRound = useNHLStore(s => s.currentRound);
  const seriesPicksOpen = useNHLStore(s => s.seriesPicksOpen);
  const isComplete = useNHLStore(s => s.isComplete);

  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);

  const activePool = userPools.find(p => p.id === activePoolId);

  const roundLabel = currentRound.replace(/_/g, ' ');

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
        <Text style={styles.label}>{roundLabel}</Text>
        {isComplete ? (
          <Text style={styles.headline}>Playoffs complete</Text>
        ) : seriesPicksOpen ? (
          <>
            <Text style={styles.headline}>Series picks open</Text>
            <Text style={styles.sub}>
              Make your picks for the {roundLabel.toLowerCase()}
            </Text>
          </>
        ) : (
          <Text style={styles.headline}>Series in progress</Text>
        )}
      </View>
    </View>
  );
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
    color: colors.text,
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
