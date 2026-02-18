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
 */
export function HomeScreen() {
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);

  useEffect(() => {
    if (!activeSport) {
      setActiveSport(getDefaultEvent());
    }
  }, [activeSport, setActiveSport]);

  if (!activeSport) {
    return null;
  }

  switch (activeSport.templateType) {
    case 'tournament':
      return (
        <TournamentTabNavigator config={activeSport as TournamentConfig} />
      );
    case 'season':
      return <SeasonTabNavigator config={activeSport as SeasonConfig} />;
    case 'series':
      return <SeriesTabNavigator config={activeSport as SeriesConfig} />;
  }
}
