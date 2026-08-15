import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    testTimeout: 30000,
    // Several test files (test/db.test.js, test/schema.test.js,
    // test/auth.test.js, test/rateLimit.test.js, test/serialize.test.js,
    // with more PGlite-backed suites coming) each spin up their own
    // in-process PGlite (WASM Postgres) instance via test/helpers/db.js.
    // Vitest runs test files concurrently by default, so these instances
    // used to boot in parallel and contend for CPU/memory, producing
    // flaky beforeAll/beforeEach hook timeouts that varied run to run
    // (test/schema.test.js alone reapplies the full migration 27 times).
    // Disabling file parallelism ensures only one PGlite instance exists
    // at a time, removing the contention at its source. hookTimeout stays
    // raised to 30s because PGlite genuinely takes seconds to boot and
    // test/schema.test.js's 27 reset() calls need the headroom even when
    // running alone.
    fileParallelism: false,
    hookTimeout: 30000,
  },
});
