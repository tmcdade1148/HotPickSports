module.exports = {
  // Expo SDK projects MUST use babel-preset-expo, not @react-native/babel-preset.
  // The RN preset's transform-runtime injects a bare `require(...)` into Expo's
  // injected prelude polyfills (e.g. web-streams-polyfill), which crashes the dev
  // bundle at bootstrap: "[runtime not ready]: Property 'require' doesn't exist"
  // (the require runtime isn't defined yet in the polyfill prelude). babel-preset-expo
  // is polyfill-aware and also inlines process.env.EXPO_OS. See REFERENCE.md §24.
  presets: ['babel-preset-expo'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@shell': './src/shell',
          '@templates': './src/templates',
          '@sports': './src/sports',
          '@shared': './src/shared',
        },
      },
    ],
    'react-native-worklets/plugin', // must be last (Reanimated 4 / worklets)
  ],
};
