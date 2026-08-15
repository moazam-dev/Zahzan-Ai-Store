// Driver-agnostic Postgres access (AR1, AR4).
//
// Both the production driver (`pg`, against Supabase's Postgres via
// SUPABASE_DB_URL) and the test driver (`@electric-sql/pglite`, an in-process
// WASM Postgres) are exposed behind the exact same shape:
//
//   query(text, params) -> Promise<{ rows: [...] }>
//   tx(fn)               -> Promise<returnValueOfFn>, rolling back on throw
//   close()               -> Promise<void>
//
// No call site anywhere else in the app is allowed to know or care which
// driver is active. The driver is selected once, lazily, from
// process.env.ZAHZAN_DB_DRIVER: 'pglite' selects PGlite, anything else
// (including unset) selects the `pg` Pool.

import pg from 'pg';

const { Pool } = pg;

function getDriverName() {
  return process.env.ZAHZAN_DB_DRIVER === 'pglite' ? 'pglite' : 'pg';
}

// B2 fix (final whole-branch review): the production `pg` Pool is NOT a
// plain module-scope variable, for the exact same reason the comment below
// (originally written about PGlite alone) already explains and which this
// module's own prior version wrongly claimed didn't apply here. Confirmed
// against the actual `next build` output (not just reasoned about): as
// measured by `grep -rho 'connectionString:process.env.SUPABASE_DB_URL'
// .next/server --include='*.js' | wc -l` against a real build, 4 distinct
// server chunks each inline their own copy of this file, INCLUDING their
// own `new Pool(...)` call -- so a plain `let pgPool` gave each of those 4
// chunks its own independent Pool, each defaulting to `pg`'s own `max: 10`,
// for up to ~40 real connections against Supabase's pooler from a single
// Node process under trivial concurrent load. This was found at
// build-output level (grepping the compiled server chunks), not inferred
// from source alone -- a future reader should not "simplify" this back to a
// module-scope `let` on the theory that a Pool is somehow different from
// the PGlite singleton, or that 4 chunks is too few to matter; empirically,
// for Turbopack's per-entry-point bundling, neither is true. `globalThis`
// is the one thing every separately-bundled entry point genuinely shares
// within one OS process, so storing the Pool there (exactly the pattern
// already used for PGlite two keys below) is what actually makes "one Pool
// per process" true.
const PG_POOL_GLOBAL_KEY = '__zahzanPgPool';

// The PGlite singleton (test/local-verification driver only) is deliberately
// NOT a plain module-scope variable. Turbopack/webpack give every server
// *entry point* (each route handler's own bundle, and separately,
// instrumentation.js's own bundle) its own independent copy of this module's
// top-level scope -- confirmed empirically (Task 15): a `pgliteInstance`
// declared as a normal `let` here is invisible across entry points even
// though they all run in the same OS process and even the same Node.js
// module cache can't help, since each entry point's build output inlines
// its own copy of this file's code. `globalThis` is the one thing every
// entry point's code genuinely shares (it's the same JS realm), so storing
// the instance there is what actually makes "one PGlite instance per
// process" true across route handlers AND instrumentation.js's register()
// hook. This whole function is only ever called when ZAHZAN_DB_DRIVER=pglite.
const PGLITE_GLOBAL_KEY = '__zahzanPgliteInstance';
const PGLITE_PROMISE_GLOBAL_KEY = '__zahzanPglitePromise';

function getPgPool() {
  if (!globalThis[PG_POOL_GLOBAL_KEY]) {
    globalThis[PG_POOL_GLOBAL_KEY] = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
  }
  return globalThis[PG_POOL_GLOBAL_KEY];
}

async function getPglite() {
  if (globalThis[PGLITE_GLOBAL_KEY]) return globalThis[PGLITE_GLOBAL_KEY];
  if (!globalThis[PGLITE_PROMISE_GLOBAL_KEY]) {
    globalThis[PGLITE_PROMISE_GLOBAL_KEY] = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      globalThis[PGLITE_GLOBAL_KEY] = new PGlite();
      return globalThis[PGLITE_GLOBAL_KEY];
    })();
  }
  return globalThis[PGLITE_PROMISE_GLOBAL_KEY];
}

/**
 * Run a parameterized query. Returns an object with a `.rows` array, in the
 * shape both `pg` and PGlite already produce natively.
 */
export async function query(text, params = []) {
  if (getDriverName() === 'pglite') {
    const db = await getPglite();
    return db.query(text, params);
  }
  return getPgPool().query(text, params);
}

/**
 * Run `fn` inside a transaction. `fn` receives an object with the same
 * `query(text, params)` signature, scoped to the transaction. If `fn`
 * throws, the transaction is rolled back and the error re-thrown. Otherwise
 * the transaction is committed and `fn`'s return value is returned.
 */
export async function tx(fn) {
  if (getDriverName() === 'pglite') {
    const db = await getPglite();
    // PGlite's transaction() commits on normal return and rolls back
    // automatically if the callback throws.
    return db.transaction(async (t) => {
      const handle = { query: (text, params) => t.query(text, params) };
      return fn(handle);
    });
  }

  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const handle = { query: (text, params) => client.query(text, params) };
    const result = await fn(handle);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Shut down whichever driver is active. Safe to call even if never used. */
export async function close() {
  if (globalThis[PG_POOL_GLOBAL_KEY]) {
    await globalThis[PG_POOL_GLOBAL_KEY].end();
    globalThis[PG_POOL_GLOBAL_KEY] = null;
  }
  if (globalThis[PGLITE_GLOBAL_KEY]) {
    await globalThis[PGLITE_GLOBAL_KEY].close();
    globalThis[PGLITE_GLOBAL_KEY] = null;
    globalThis[PGLITE_PROMISE_GLOBAL_KEY] = null;
  }
}
