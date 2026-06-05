import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from '@shell/navigation/RootNavigator';
import {wrapWithMonitoring} from '@shared/monitoring/sentry';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

// Wrapped so Sentry can capture render-tree errors. No-ops (returns App
// unchanged) when monitoring isn't active — see @shared/monitoring/sentry.
export default wrapWithMonitoring(App);
