// Next.js `register()` hook (https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
// Invoked automatically when a new server instance boots -- `next dev`,
// `next start`, and the programmatic `next()` API `tools/run-pglite-server.mjs`
// uses. Runs INSIDE the server's own module graph, so `./lib/db.js` resolves
// here to the same driver-selection logic every route handler's own
// `import '../lib/db.js'` resolves to.
//
// IMPORTANT, empirically confirmed during Task 15: under the programmatic
// custom-server API (`next({ dev: false, ... })`, what
// tools/run-pglite-server.mjs uses), `await app.prepare()` does NOT reliably
// await this hook before the server starts accepting requests -- Next only
// triggers `register()` lazily, on/around the first real request, racing
// against that same request. Worse, because Turbopack gives instrumentation.js
// its own separate build entry point from every route handler's bundle, a
// PLAIN module-scope singleton in lib/db.js (`let pgliteInstance`) is NOT
// shared between this file and a route handler's own copy of that module --
// each entry point got its own independent in-memory PGlite database,
// confirmed by seeding succeeding here while every route handler kept
// reporting `relation "products" does not exist`. lib/db.js was changed to
// store the PGlite singleton on `globalThis` instead (the one thing every
// entry point genuinely shares within one OS process) to fix that. This
// hook's own execution is ALSO deliberately idempotent and cached on
// `globalThis` (below), specifically so tools/run-pglite-server.mjs can call
// `register()` directly and deterministically await it before its server
// starts listening, without caring whether Next's own internal (unreliable-
// timing) invocation also fires later -- it will just resolve the same
// cached promise.
//
// Replaces two Task-15-only, unauthenticated HTTP routes
// (`POST /api/test-bootstrap`, `GET /api/test-email-change-token`) that used
// to exist solely to trigger DB migration + seeding from outside the server
// process. Doing the migration/seed step here instead means local
// PGlite-backed parity verification needs ZERO extra HTTP surface in the
// production route table.
//
// `GET /api/test-email-change-token` (the mid-run token read-back
// `tools/contract-capture.mjs`'s email-change journey step used) has NOT been
// ported here -- unlike migration/seeding, it isn't boot-time logic, it's an
// on-demand read of a token generated later, by a request the capture script
// itself issues mid-run, so a boot-time hook has no way to serve it. See
// docs/PARITY_REPORT.md's Critical-2 fix section for how a future engineer
// would re-enable that one specific journey step on a throwaway branch if
// full re-capture is ever needed again.
//
// Gated hard on ZAHZAN_DB_DRIVER === 'pglite': in any real deployment
// (SUPABASE_DB_URL + the `pg` driver -- i.e. every environment this env var
// is not explicitly set to 'pglite' in, including every production
// deployment), this returns immediately and touches no database at all.
//
// Also gated on `process.env.NEXT_RUNTIME === 'nodejs'` -- Next builds an
// Edge-runtime variant of instrumentation.js by default (for the
// `onRequestError` hook, which can run on Edge) as well as a Node one. This
// module's dynamic imports (lib/db.js, node:fs, PGlite) are all Node-only,
// so gating behind this check (Next's own documented pattern for exactly
// this situation) keeps Turbopack from bundling Node-only code into the
// Edge variant at all, rather than merely failing at runtime if it were
// ever reached there.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.ZAHZAN_DB_DRIVER !== 'pglite') return;

  // Idempotency guard, cached on globalThis for the same cross-entry-point
  // reason lib/db.js's PGlite singleton is: this function can genuinely be
  // invoked from more than one separately-bundled copy of this module
  // (Next's own internal lazy invocation, and tools/run-pglite-server.mjs's
  // explicit direct call) within the same process, and truncate-and-reseed
  // running twice concurrently would be a real race, not just wasted work.
  if (globalThis.__zahzanPgliteBootstrapPromise) {
    return globalThis.__zahzanPgliteBootstrapPromise;
  }

  globalThis.__zahzanPgliteBootstrapPromise = (async () => {
    const { query } = await import('./lib/db.js');
    const { applyMigrationViaQuery } = await import('./test/helpers/applyMigration.js');
    const { seedContractDb } = await import('./tools/seed-contract-db-pg.mjs');

    const statementCount = await applyMigrationViaQuery(query);
    const summary = await seedContractDb({ query });

    console.log(
      `[instrumentation] PGlite bootstrap complete: ${statementCount} migration statements applied, ` +
        `${summary.users.length} users seeded, ${summary.products.length} products seeded.`
    );
  })();

  return globalThis.__zahzanPgliteBootstrapPromise;
}
