// Test-only database helper. Boots a fresh, isolated, in-memory PGlite
// instance per call to createTestDb() and applies the real schema migration
// to it, so tests run against the same schema production does (AR3).
//
// supabase/migrations/0001_init.sql does not exist yet -- Task 3 creates it.
// Until then this silently skips applying it, so this task's own tests can
// pass today and Task 3's schema starts flowing into every test automatically
// once it lands, with no changes needed here.

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0001_init.sql'
);

async function readMigrationIfPresent() {
  try {
    return await readFile(MIGRATION_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Boots a fresh in-memory PGlite database, applies the schema migration if
 * it exists, and returns a handle exposing the same query/tx signature as
 * lib/db.js, plus reset() and destroy().
 */
export async function createTestDb() {
  const db = new PGlite();
  const migrationSql = await readMigrationIfPresent();

  if (migrationSql) {
    await db.exec(migrationSql);
  }

  async function query(text, params = []) {
    return db.query(text, params);
  }

  async function tx(fn) {
    return db.transaction(async (t) => {
      const handle = { query: (text, params) => t.query(text, params) };
      return fn(handle);
    });
  }

  /** Wipes all data back to a freshly-migrated state. */
  async function reset() {
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    if (migrationSql) {
      await db.exec(migrationSql);
    }
  }

  /** Shuts down the in-memory instance. */
  async function destroy() {
    await db.close();
  }

  return { query, tx, reset, destroy };
}
