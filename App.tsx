import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from '@shell/navigation/RootNavigator';
import {useAppFonts} from '@shared/theme/fonts';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const {fontsLoaded, fontError} = useAppFonts();

  // Hold render until fonts are loaded so the first paint uses the right
  // typography. If loading fails, render anyway with system-font fallback —
  // not a blocker. Per spec §6.3, display/body fonts anchor the visual
  // identity but the app must still function without them.
  if (!fontsLoaded && !fontError) {
    return null; // SplashScreen stays visible during this window
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
