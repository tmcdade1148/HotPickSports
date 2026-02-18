module.exports = {
  presets: ['module:@react-native/babel-preset'],
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
  ],
};
