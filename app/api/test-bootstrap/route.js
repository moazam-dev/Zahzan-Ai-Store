// POST /api/test-bootstrap
//
// Task 15 (parity verification) ONLY. Not one of the 67 governed endpoints,
// not exercised by tools/golden/, and inert everywhere except the exact
// local-verification setup Task 15 needs.
//
// Why this exists: lib/db.js's PGlite driver is documented as a "lazy
// module singleton" (lib/db.js:24-29), and PGlite itself is an in-process
// WASM database with no network listener. Applying
// supabase/migrations/0001_init.sql and the Task 15 contract fixtures from
// a SEPARATE `node` script -- even one running in the same OS process as
// the Next.js server -- lands in a DIFFERENT module instantiation of
// lib/db.js than the one Next's own server bundle gives every real route
// handler (confirmed empirically: a plain top-level `import '../lib/db.js'`
// from a hand-written script is not bundled by Next at all, so it can never
// be "the same singleton" a bundled route handler's own
// `import '.../lib/db.js'` resolves to, even though both run in one OS
// process -- this surfaced as `relation "products" does not exist` when
// route handlers hit a PGlite instance the migration was never applied to).
// The fix: run the migration/seed from INSIDE a real route handler, calling
// the exact same `lib/db.js` `query` export every other endpoint uses, so
// it necessarily lands in the one instance every other route handler in
// this same build shares.
//
// Gated hard on ZAHZAN_DB_DRIVER === 'pglite': in any real deployment
// (SUPABASE_DB_URL + the `pg` driver -- i.e. every environment this env var
// is not explicitly set to 'pglite' in), this returns the exact same 404
// envelope the app/api/[...catchAll]/route.js catch-all already returns for
// any unmapped path, so it is indistinguishable from "no such route" and
// runs no code at all. It is never reachable in production.

export const runtime = 'nodejs';

import { query } from '../../../lib/db.js';
import { ok, notFound, withErrorHandler } from '../../../lib/http.js';

export const POST = withErrorHandler(async (request) => {
  if (process.env.ZAHZAN_DB_DRIVER !== 'pglite') {
    const url = new URL(request.url);
    return notFound(`${url.pathname}${url.search}`);
  }

  const { applyMigrationViaQuery } = await import('../../../test/helpers/applyMigration.js');
  const { seedContractDb } = await import('../../../tools/seed-contract-db-pg.mjs');

  const statementCount = await applyMigrationViaQuery(query);
  const summary = await seedContractDb({ query });

  return ok({ success: true, statementCount, summary });
});
