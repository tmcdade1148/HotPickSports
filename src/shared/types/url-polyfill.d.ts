/**
 * Ambient widening for the WHATWG URL API.
 *
 * `react-native-url-polyfill/auto` (imported in src/shared/config/supabase.ts)
 * swaps the global `URL`/`URLSearchParams` for the full WHATWG implementation
 * at runtime. React Native 0.83.2's bundled type declarations only expose a
 * subset of that surface, so we widen the globals here to match what the
 * polyfill actually provides. These members are additive — TypeScript merges
 * them into RN's existing `URL`/`URLSearchParams` interfaces.
 */
export {};

declare global {
  interface URL {
    readonly hostname: string;
    readonly pathname: string;
  }

  interface URLSearchParams {
    get(name: string): string | null;
  }
}
