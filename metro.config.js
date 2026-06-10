const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration for Expo bare workflow
 * https://docs.expo.dev/guides/customizing-metro/
 *
 * Uses expo/metro-config (not @react-native/metro-config) so that the
 * EAGER_BUNDLE phase in EAS Build can produce OTA-compatible bundles.
 */
const config = getDefaultConfig(__dirname);

// SDK 55 / Hermes: disable Metro's package "exports" resolution, which can pull
// an ESM build of a bootstrap polyfill (@react-native/js-polyfills/console.js)
// that references `require` before the module runtime exists -> red box
// "[runtime not ready]: Property 'require' doesn't exist" at init.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
