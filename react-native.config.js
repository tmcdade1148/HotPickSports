// react-native.config.js
// Bare-RN asset linking config. The `assets` array points to directories
// whose contents should be bundled into the native iOS + Android builds.
//
// Used here to ship the custom display + body fonts (Saira Condensed Black,
// Manrope Bold, Manrope Regular). Run `npx react-native-asset` after any
// change to assets/fonts/, then rebuild the native bundles.

module.exports = {
  assets: ['./assets/fonts'],
};
