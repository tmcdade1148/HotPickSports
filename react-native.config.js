// react-native.config.js
// Bare-RN asset linking config. The `assets` array points to directories
// whose contents should be bundled into the native iOS + Android builds.
//
// Used here to ship the custom display + body fonts (Saira Condensed Black,
// Manrope Bold, Manrope Regular). Run `npx react-native-asset` after any
// change to assets/fonts/, then rebuild the native bundles.

module.exports = {
  assets: ['./assets/fonts'],
  // Sentry is deferred and inert (no DSN configured, so its native module is
  // never initialized — see src/shared/monitoring/sentry.ts). Its CocoaPods
  // build does not produce a module map under Xcode 26, which breaks the iOS
  // build. Skip autolinking the Sentry pod on iOS until monitoring is actually
  // activated. The JS package stays installed (Metro still resolves the lazy
  // require), and Android keeps Sentry. Remove this block when wiring Sentry up.
  dependencies: {
    '@sentry/react-native': {
      platforms: {
        ios: null,
      },
    },
  },
};
