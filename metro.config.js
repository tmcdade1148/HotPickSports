const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration for Expo bare workflow
 * https://docs.expo.dev/guides/customizing-metro/
 *
 * Uses expo/metro-config (not @react-native/metro-config) so that the
 * EAGER_BUNDLE phase in EAS Build can produce OTA-compatible bundles.
 */
module.exports = getDefaultConfig(__dirname);
