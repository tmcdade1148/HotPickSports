import React, {useEffect} from 'react';
import {View, Text, ActivityIndicator, StyleSheet} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {isPoolVisible} from '@shared/utils/poolVisibility';
import {spacing, borderRadius} from '@shared/theme';
import {TournamentTabNavigator} from '@templates/tournament/navigation/TournamentTabNavigator';
import {SeasonTabNavigator} from '@templates/season/navigation/SeasonTabNavigator';
import {SeriesTabNavigator} from '@templates/series/navigation/SeriesTabNavigator';
import {useTheme} from '@shell/theme';
import type {
  TournamentConfig,
  SeasonConfig,
  SeriesConfig,
} from '@shared/types/templates';

/**
 * EventDetailScreen — Renders the active template's tab navigator.
 *
 * This is the architectural junction between the Shell and sport templates.
 * The Shell reads the active sport's templateType and renders the matching
 * template. Templates never know which sport they're rendering.
 *
 * Pool selection is read from global store — switching pools updates
 * the Board tab and SmackTalk simultaneously.
 */
export function EventDetailScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const activeSport = useGlobalStore(s => s.activeSport);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  // Safety net: auto-select a visible pool, or clear if active pool is hidden.
  useEffect(() => {
    if (userPools.length === 0) return;

    const activePool = activePoolId ? userPools.find(p => p.id === activePoolId) : undefined;
    const activeIsVisible = activePool ? isPoolVisible(activePool) : false;

    if (!activePoolId || !activeIsVisible) {
      const firstVisible = userPools.find(p => isPoolVisible(p));
      if (firstVisible) {
        setActivePoolId(firstVisible.id);
      } else if (!activePoolId) {
        // No visible pools — fall back to any pool so we don't get stuck loading
        setActivePoolId(userPools[0].id);
      }
      // If activePoolId is set but hidden and no visible pools exist,
      // keep it so tabs can render (header shows "Join or create a pool")
    }
  }, [activePoolId, userPools, setActivePoolId]);

  if (!activeSport || !activePoolId) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{marginBottom: spacing.md}}
        />
        <Text style={styles.loadingText}>Loading event...</Text>
        {__DEV__ && (
          <View style={styles.debugBox}>
            <Text style={styles.debugTitle}>Debug Info</Text>
            <Text style={styles.debugDetail}>
              activeSport: {activeSport ? activeSport.competition : 'null'}
            </Text>
            <Text style={styles.debugDetail}>
              activePoolId: {activePoolId ?? 'null'}
            </Text>
            <Text style={styles.debugDetail}>
              userPools: {userPools.length} available
            </Text>
          </View>
        )}
      </View>
    );
  }

  const activePool = userPools.find(p => p.id === activePoolId);
  const goHome = () => navigation.goBack();

  switch (activeSport.templateType) {
    case 'tournament':
      return (
        <TournamentTabNavigator
          config={activeSport as TournamentConfig}
          poolId={activePoolId}
          poolName={activePool?.name}
          userPools={userPools}
          onSwitchPool={setActivePoolId}
          onOpenSettings={() => navigation.navigate('Settings')}
          onGoHome={goHome}
        />
      );
    case 'season':
      return (
        <SeasonTabNavigator
          config={activeSport as SeasonConfig}
          poolId={activePoolId}
          poolName={activePool?.name}
          userPools={userPools}
          onSwitchPool={setActivePoolId}
          onOpenSettings={() => navigation.navigate('Settings')}
          onGoHome={goHome}
        />
      );
    case 'series':
      return (
        <SeriesTabNavigator
          config={activeSport as SeriesConfig}
          poolId={activePoolId}
          poolName={activePool?.name}
          userPools={userPools}
          onSwitchPool={setActivePoolId}
          onOpenSettings={() => navigation.navigate('Settings')}
          onGoHome={goHome}
        />
      );
  }
}

const createStyles = (colors: any) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  debugBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    width: '100%',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  debugDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
