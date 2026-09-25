// Test-only database helper. Boots a fresh, isolated, in-memory PGlite
// instance per call to createTestDb() and applies the real schema migration
// to it, so tests run against the same schema production does (AR3).
//
// Reads EVERY supabase/migrations/*.sql in filename order, not just 0001.
// This used to hardcode 0001_init.sql, which was correct while it was the
// only migration. Once 0002/0003 landed, that hardcoding meant new migrations
// reached Supabase but never the test database -- so tests would run against a
// stale schema and fail in a way that points at application code rather than
// at this helper. (test/helpers/applyMigration.js had the identical bug and
// was fixed the same way.)

import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/** Concatenated migration SQL, in filename order. Null when none exist. */
async function readMigrationIfPresent() {
  let files;
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  if (files.length === 0) return null;

  const parts = [];
  for (const file of files) {
    parts.push(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return parts.join('\n');
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
