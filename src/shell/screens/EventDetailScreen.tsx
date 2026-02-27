import React from 'react';
import {useGlobalStore} from '@shell/stores/globalStore';
import {TournamentTabNavigator} from '@templates/tournament/navigation/TournamentTabNavigator';
import {SeasonTabNavigator} from '@templates/season/navigation/SeasonTabNavigator';
import {SeriesTabNavigator} from '@templates/series/navigation/SeriesTabNavigator';
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
  const activeSport = useGlobalStore(s => s.activeSport);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const userPools = useGlobalStore(s => s.userPools);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  if (!activeSport || !activePoolId) {
    return null;
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
          onOpenProfile={() => navigation.navigate('Profile')}
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
          onOpenProfile={() => navigation.navigate('Profile')}
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
          onOpenProfile={() => navigation.navigate('Profile')}
          onGoHome={goHome}
        />
      );
  }
}
