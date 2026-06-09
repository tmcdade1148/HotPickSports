module.exports = {
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
    'react-native-worklets/plugin', // must be last (Reanimated 4 / worklets 0.7.4)
  ],
};
