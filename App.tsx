import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from '@shell/navigation/RootNavigator';
import {AppErrorBoundary} from '@shell/components/AppErrorBoundary';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
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
