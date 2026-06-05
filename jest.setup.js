// Global jest setup. Mocks native modules that aren't available in the jest
// (node) environment so suites don't crash at import time.

// AsyncStorage has no native backing under jest — use the library's official
// in-memory mock. Without this, anything importing supabase.ts (→ nflStore →
// most screens) throws "NativeModule: AsyncStorage is null".
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
