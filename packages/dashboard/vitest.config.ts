import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**/*'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        'src/cli.ts', // CLI is tested via integration
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      'agentflow-core': resolve(__dirname, '../core/src'),
    },
  },
});
