// React Native 0.83.x ships a deliberately minimal global `URL` /
// `URLSearchParams` type (only `href`, `searchParams`, `append`, `toString`…),
// but this app imports `react-native-url-polyfill/auto`, which replaces the
// runtime with the full WHATWG implementations. RN 0.84 declared the complete
// types; on SDK 55's RN 0.83.x we bridge that gap here via declaration merging
// so tsc matches actual runtime behaviour (e.g. URL.hostname, searchParams.get).
//
// No imports/exports — keep this file a global ambient declaration so it merges
// with React Native's global `interface URL` / `interface URLSearchParams`.

interface URL {
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  readonly origin: string;
}

interface URLSearchParams {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  delete(name: string): void;
  forEach(
    callbackfn: (value: string, key: string, parent: URLSearchParams) => void,
    thisArg?: any,
  ): void;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  entries(): IterableIterator<[string, string]>;
  sort(): void;
  readonly size: number;
}
