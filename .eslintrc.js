module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Visible but non-blocking — these are hygiene/advisory, not correctness.
    // The hard CI gate still blocks genuine errors (e.g. react-hooks/rules-of-hooks,
    // no-undef). Drive these warnings down over time.
    '@typescript-eslint/no-unused-vars': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    // Font-scaling lock: Text/TextInput must come from @shared/components/AppText
    // (allowFontScaling locked off) — never raw from react-native, or the OS
    // font-size slider re-breaks fixed layouts. Same "one source, enforced
    // everywhere" discipline as brand colors (Rule #9) and lexicon strings.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Text', 'TextInput'],
            message:
              "Import Text/TextInput from '@shared/components/AppText' " +
              '(font-scaling is locked there). Legal screens use LegalText.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Jest globals for test files + the global setup.
      files: ['__tests__/**/*', 'jest.setup.js'],
      env: {jest: true},
    },
    {
      // The two files that legitimately import Text/TextInput from react-native:
      // the wrapper (the source of truth) and the startup backstop patch that
      // covers Animated.Text + third-party text the wrapper can't reach.
      files: [
        'src/shared/components/AppText.tsx',
        'src/shared/setup/fontScaleCap.ts',
      ],
      rules: {'no-restricted-imports': 'off'},
    },
  ],
};
