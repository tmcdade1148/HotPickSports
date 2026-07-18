import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider, initialWindowMetrics} from 'react-native-safe-area-context';
import {RootNavigator} from '@shell/navigation/RootNavigator';
import {AppErrorBoundary} from '@shell/components/AppErrorBoundary';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    // initialMetrics is load-bearing: without it insets are 0 on frame 0, so
    // every SafeAreaView paints flush to the top and snaps down. Don't remove.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {/* Render-crash safety net: contains a thrown screen instead of
          white-screening the session. Reports via logError (no Sentry). */}
      <AppErrorBoundary>
        <RootNavigator />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

export default App;
