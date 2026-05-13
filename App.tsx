import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from '@shell/navigation/RootNavigator';
import {useAppFonts} from '@shared/theme/fonts';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  // Kick off font loading in the background. We do NOT block the navigator
  // on this — if the loader hangs (e.g. autolinking edge case on bare RN),
  // we'd otherwise show a permanent white screen. System fonts substitute
  // gracefully until Saira / Manrope finish loading.
  useAppFonts();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
