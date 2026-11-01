module.exports = {
  ignorePatterns: ['dist/', '.expo/', 'playwright-report/', 'test-results/'],
  overrides: [
    { files: ['supabase/functions/**/*.ts'], rules: { 'import/no-unresolved': 'off' } },
    // The service worker runs outside the app bundle and has its own globals (self, caches, clients).
    { files: ['public/sw.js'], env: { serviceworker: true, es2020: true } },
  ],
  extends: ['expo', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
