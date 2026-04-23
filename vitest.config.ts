import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // SOMA lives in a separate private repo (ClemenceChee/soma); its tests
      // ship with it. Any tests/soma/** files here are stale locals — the
      // directory is also in .gitignore, so they never reach the repo.
      'tests/soma/**',
    ],
  },
  resolve: {
    alias: {
      'agentflow-core': resolve(__dirname, 'packages/core/src'),
    },
  },
});
