# Native Build & Toolchain Notes

> Extracted from `REFERENCE.md` §24. These are environment/tooling facts, not
> architecture — but each one cost real time, so they're written down. Hard-won
> lessons from the SDK 55 upgrade. CLAUDE.md's Deployment Rules point here.

### Dependency versions
- **`react-native` is pinned by the Expo SDK — never bump it on its own.**
  Expo SDK 55 ⇒ **react-native 0.83.6**. A stray bump to 0.84.0 (in the prebuild
  commit) left Expo's native modules undefined at runtime →
  `Cannot read property 'EventEmitter' of undefined` on launch. Always realign
  with `npx expo install --fix`; never hand-edit the RN version in
  `package.json`. The drift table for SDK 55 lives in `expo/bundledNativeModules.json`.
- **Never run `npm audit fix --force`.** It rewrote ~250 packages and broke
  `node_modules` twice. Recover with
  `git checkout package.json package-lock.json && rm -rf node_modules && npm ci`.
- RN 0.83.6's bundled global `URL`/`URLSearchParams` types are narrower than
  0.84's (no `hostname`/`pathname`/`URLSearchParams.get`). `react-native-url-polyfill`
  supplies them at runtime; the TS gap is patched in
  `src/shared/types/url-polyfill.d.ts`.

### iOS build (Xcode 26 + CocoaPods)
- **Disable "Explicitly Built Modules" for BOTH compilers in the Podfile.**
  Xcode 26 turns it on by default; its dependency scanner expects every pod's
  module map up front, but CocoaPods generates them later → thousands of
  `module map file ... not found` (e.g. `RCTSwiftUI.modulemap`). The Podfile
  `post_install` sets **both** `CLANG_ENABLE_EXPLICIT_MODULES = 'NO'` *and*
  `SWIFT_ENABLE_EXPLICIT_MODULES = 'NO'` on every pod target — setting only the
  CLANG flag leaves Swift pods (RCTSwiftUI, Sentry) broken. Keeping it in the
  Podfile means it survives `pod install`. Verify with
  `xcodebuild -showBuildSettings | grep -i explicit`.
- **Ruby 3.4 needs `gem 'nkf'`** in the `Gemfile`, or `pod install` dies with
  `cannot load such file -- kconv` (xcodeproj `< 1.26` still `require`s `kconv`,
  which Ruby 3.4 dropped from stdlib).
- **iOS release path is Xcode Archive** (EAS submit has been unreliable for this
  project), so local Xcode must stay buildable — don't rely on EAS alone.

### Metro
- **`config.resolver.unstable_enablePackageExports = false` in `metro.config.js`
  is load-bearing — do NOT remove it.** It disables Metro's package-"exports"
  resolution. With it ON (the SDK 55 default), Metro resolves an ESM build of a
  bootstrap polyfill (`@react-native/js-polyfills/console.js`) that calls
  `require` before the module runtime exists → the launch-blocking redbox
  `[runtime not ready]: Property 'require' doesn't exist`. The stack is
  bootstrap-level with **no app frames**, which is why it reads like a native/cache
  problem and sent us chasing babel, Pods, and Metro cache for a long time — none
  of those were it. This one line was the fix (expo/expo #36635 / #36551).
  **Caveat / known cost:** turning exports resolution off can occasionally
  mis-resolve a package that ships *only* an `exports` map (no legacy `main`), so
  if a dependency misbehaves around module loading later, this line is the first
  suspect — but replace it with a tested alternative; never delete it as "cleanup."
- **After any native or dependency-version change, start Metro with
  `--clear`** (`npx expo start --dev-client --clear`). Metro caches a snapshot of
  `node_modules`; a "module/file not found" error spanning *unrelated* packages
  (`foreignNames.js`, `checkDuplicateRouteNames.js`) is a stale cache, not the
  packages. `npx expo run:ios/android` does **not** reset the cache.

### Git
- **Local `main` can go stale silently** — `git pull` sometimes no-ops while
  `origin/main` has moved (cost us a "the fix never reached my Mac" detour). When
  in doubt: `git fetch origin main && git reset --hard origin/main`.
