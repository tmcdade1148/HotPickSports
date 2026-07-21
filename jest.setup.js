// Global jest setup. Mocks native modules that aren't available in the jest
// (node) environment so suites don't crash at import time.

// @supabase/realtime-js calls WebSocketFactory.getWebSocketConstructor() eagerly
// when the Supabase client is constructed (new SupabaseClient → _initRealtimeClient).
// Under jest's Node 20 environment there is no global WebSocket, so on Node < 22 it
// throws "Node.js 20 detected without native WebSocket support" and crashes any
// suite that transitively imports src/shared/config/supabase.ts (→ nflStore → most
// screens). Tests never open a realtime socket, so providing an inert global
// WebSocket constructor satisfies the lookup suite-wide without pulling in `ws`.
if (typeof global.WebSocket === 'undefined') {
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      this.readyState = MockWebSocket.CLOSED;
    }
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  }
  global.WebSocket = MockWebSocket;
}

// AsyncStorage has no native backing under jest — use the library's official
// in-memory mock. Without this, anything importing supabase.ts (→ nflStore →
// most screens) throws "NativeModule: AsyncStorage is null".
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-constants ships un-transpiled and has no node backing. The standalone
// logError() (→ imported by seasonStore → most board screens) reads
// Constants.expoConfig?.version, so give it an inert shape suite-wide.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {expoConfig: {version: '0.0.0-test'}},
}));

// expo-updates resolves its native module eagerly at IMPORT time —
// build/ExpoUpdates.js does `requireNativeModule('ExpoUpdates')` (the throwing
// variant), which raises "Cannot find native module 'ExpoUpdates'" in the node
// environment. That fails to LOAD any suite that renders VersionStamp (→ App,
// WelcomeScreen, SettingsScreen). VersionStamp's try/catch guards only the
// render-time reads, not the import, so it can't catch this. Mock the members it
// reads; isEnabled:false renders the "dev" branch and short-circuits the rest.
jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: false,
  isEmbeddedLaunch: false,
  channel: null,
  createdAt: null,
}));

