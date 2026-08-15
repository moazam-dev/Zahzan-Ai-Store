import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    testTimeout: 30000,
    // Task 3 adds a second PGlite-backed test file (test/schema.test.js)
    // alongside Task 1's test/db.test.js. Each spins up its own in-memory
    // PGlite instance and applies 0001_init.sql in beforeAll; run together
    // (Vitest runs test files concurrently by default) that contends for
    // resources and comfortably exceeds Vitest's default 10s hookTimeout,
    // even though each is well under 30s on its own. Match hookTimeout to
    // the testTimeout above rather than the default.
    hookTimeout: 30000,
  },
});
