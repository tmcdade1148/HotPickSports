/**
 * HotPick Sports — Root App Component
 *
 * Initializes auth listener, wraps app in SafeAreaProvider,
 * and renders the root navigation (auth guard → main app).
 */
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGlobalStore } from './src/shell/stores/globalStore';
import { RootNavigation } from './src/shell/navigation/RootNavigation';

function App() {
  const initialize = useGlobalStore(s => s.initialize);

  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <RootNavigation />
    </SafeAreaProvider>
  );
}

export default App;
