import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '**/*.{ts,tsx,js,jsx,mjs,cjs,json,yml,yaml}': 'vp check --fix',
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'apps/**/*.spec.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
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
