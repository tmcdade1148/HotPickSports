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

// Crash/error monitoring pulls in native-only modules (@sentry/react-native,
// expo-constants, expo-updates) that ship un-transpiled ESM and have no node
// backing. Anything importing globalStore or App transitively imports this, so
// mock it with inert no-ops. The guard logic it wraps is trivial and not under
// test; this matches how we mock other native-dependent modules above.
jest.mock('@shared/monitoring/sentry', () => ({
  initMonitoring: jest.fn(),
  wrapWithMonitoring: component => component,
  setMonitoringUser: jest.fn(),
  captureError: jest.fn(),
  isMonitoringActive: () => false,
}));
