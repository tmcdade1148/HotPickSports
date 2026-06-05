module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Visible but non-blocking — these are hygiene/advisory, not correctness.
    // The hard CI gate still blocks genuine errors (e.g. react-hooks/rules-of-hooks,
    // no-undef). Drive these warnings down over time.
    '@typescript-eslint/no-unused-vars': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      // Jest globals for test files + the global setup.
      files: ['__tests__/**/*', 'jest.setup.js'],
      env: {jest: true},
    },
  ],
};
