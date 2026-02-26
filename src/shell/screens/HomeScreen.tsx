import React, {useEffect} from 'react';
import {useGlobalStore} from '@shell/stores/globalStore';
import {getDefaultEvent} from '@sports/registry';
import {TournamentTabNavigator} from '@templates/tournament/navigation/TournamentTabNavigator';
import {SeasonTabNavigator} from '@templates/season/navigation/SeasonTabNavigator';
import {SeriesTabNavigator} from '@templates/series/navigation/SeriesTabNavigator';
import type {TournamentConfig, SeasonConfig, SeriesConfig} from '@shared/types/templates';

/**
 * HomeScreen — Renders the active template's tab navigator.
 *
 * This is the key architectural junction: the Shell reads the active sport's
 * templateType and renders the matching template. Templates never know which
 * sport they're rendering.
 *
 * Pool gate: If no activePoolId is set, navigation will redirect to
 * PoolSelection before this screen is rendered. The poolId and pool-switcher
 * props are passed down so templates never import from the shell layer.
 */
export function HomeScreen({navigation}: any) {
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  useEffect(() => {
    if (!activeSport) {
      setActiveSport(getDefaultEvent());
    }
  }, [activeSport, setActiveSport]);

  // Pool gate — redirect to PoolSelection if no pool is active
  useEffect(() => {
    if (activeSport && !activePoolId) {
      navigation.replace('PoolSelection');
    }
  }, [activeSport, activePoolId, navigation]);

  if (!activeSport || !activePoolId) {
    return null;
  }

  // Find the active pool name to display in the header
  const activePool = userPools.find(p => p.id === activePoolId);

  switch (activeSport.templateType) {
    case 'tournament':
      return (
        <TournamentTabNavigator
          config={activeSport as TournamentConfig}
          poolId={activePoolId}
          poolName={activePool?.name}
          userPools={userPools}
          onSwitchPool={setActivePoolId}
          onOpenProfile={() => navigation.navigate('Profile')}
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
          onOpenProfile={() => navigation.navigate('Profile')}
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
          onOpenProfile={() => navigation.navigate('Profile')}
        />
      );
  }
}
