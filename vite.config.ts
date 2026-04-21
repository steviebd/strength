import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.spec.ts'],
    environment: 'node',
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      '.expo/**',
      '.wrangler/**',
      'apps/expo/node_modules/**',
      '.agents/**',
    ],
  },
  fmt: {
    semi: true,
    singleQuote: true,
  },
});
