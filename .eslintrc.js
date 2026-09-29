module.exports = {
  ignorePatterns: ['dist/', '.expo/', 'playwright-report/', 'test-results/'],
  overrides: [{ files: ['supabase/functions/**/*.ts'], rules: { 'import/no-unresolved': 'off' } }],
  extends: ['expo', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
