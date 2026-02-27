module.exports = {
  preset: 'react-native',

  // Extend the default transformIgnorePatterns to include third-party RN libs
  // that ship un-transpiled ESM (e.g. react-native-url-polyfill).
  // The react-native preset only allows react-native & @react-native.
  transformIgnorePatterns: [
    'node_modules/(?!' +
      [
        '(jest-)?react-native',
        '@react-native(-community)?',
        'react-native-url-polyfill',
        'react-native-safe-area-context',
        'lucide-react-native',
        '@supabase/supabase-js',
      ].join('|') +
      ')',
  ],

  // Use the built-in mock from react-native-safe-area-context
  setupFiles: [
    './node_modules/react-native-safe-area-context/jest/mock.tsx',
  ],

  // Map path aliases to match babel-plugin-module-resolver config
  moduleNameMapper: {
    '^@shell/(.*)$': '<rootDir>/src/shell/$1',
    '^@templates/(.*)$': '<rootDir>/src/templates/$1',
    '^@sports/(.*)$': '<rootDir>/src/sports/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
};
