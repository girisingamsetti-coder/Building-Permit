import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // E2E arrives with Playwright in a later phase.
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Integration tests share one database, so they must not race each other
    // for the same rows. Unit tests are unaffected by the single fork.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Argon2id is deliberately slow; auth tests pay that cost several times.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: false,
    reporters: 'default',
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // `server-only` throws when imported outside a React Server Component.
      // Under Vitest we are testing those modules directly, so it is stubbed.
      'server-only': resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
