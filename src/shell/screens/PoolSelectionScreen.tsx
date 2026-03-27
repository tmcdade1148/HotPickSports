import React, {useEffect} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {spacing, borderRadius} from '@shared/theme';
import type {DbPool} from '@shared/types/database';
import {useTheme} from '@shell/theme';

/**
 * PoolSelectionScreen — Displays the user's pools for the active event.
 * Allows selecting an existing pool, creating a new one, or joining via code.
 */
export function PoolSelectionScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const user = useGlobalStore(s => s.user);
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const userPools = useGlobalStore(s => s.visiblePools);
  const isLoadingPools = useGlobalStore(s => s.isLoadingPools);
  const fetchUserPools = useGlobalStore(s => s.fetchUserPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  useEffect(() => {
    if (!activeSport) {
      setActiveSport(getDefaultEvent());
    }
  }, [activeSport, setActiveSport]);

  useEffect(() => {
    if (user?.id && activeSport?.competition) {
      fetchUserPools(user.id, activeSport.competition);
    }
  }, [user?.id, activeSport?.competition, fetchUserPools]);

  const selectPool = (pool: DbPool) => {
    setActivePoolId(pool.id);
    navigation.navigate('Home');
  };

  if (isLoadingPools) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Pools</Text>
        <Text style={styles.subtitle}>
          {activeSport?.shortName ?? activeSport?.name ?? 'Event'}
        </Text>
      </View>

      {userPools.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Pools Yet</Text>
          <Text style={styles.emptyText}>
            Create a pool and invite friends, or join an existing pool with an
            invite code.
          </Text>
        </View>
      ) : (
        <FlatList
          data={userPools}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <TouchableOpacity
              style={styles.poolRow}
              onPress={() => selectPool(item)}>
              <View style={styles.poolInfo}>
                <Text style={styles.poolName}>{item.name}</Text>
                <Text style={styles.poolCode}>Code: {item.invite_code}</Text>
              </View>
              <Text style={styles.arrow}>{'>'}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('CreatePool')}>
          <Text style={styles.primaryButtonText}>Create New Pool</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('JoinPool')}>
          <Text style={styles.secondaryButtonText}>Join with Code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  list: {
    padding: spacing.md,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  poolInfo: {
    flex: 1,
  },
  poolName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  poolCode: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  arrow: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '300',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
