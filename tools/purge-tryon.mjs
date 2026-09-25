// Retention purge for Virtual Try-On (ruling P5).
//
//   node tools/purge-tryon.mjs [--dry-run]
//
// Deletes expired try-on jobs AND their stored images. Run it on a schedule
// (cron, a Supabase scheduled function, or any task runner) at least as often
// as TRY_ON_RETENTION_HOURS.
//
// ORDER MATTERS. Objects are deleted first, rows second. The reverse order can
// orphan objects permanently: once the row is gone nothing records the storage
// path, and object storage is not reachable from SQL. Running purge_expired()
// on its own is therefore safe but incomplete -- it collects the four token
// tables correctly and leaves try-on images behind.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function loadEnvLocal() {
  try {
    const raw = await readFile(path.resolve('.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* fine */
  }
}

await loadEnvLocal();

const DRY_RUN = process.argv.includes('--dry-run');

const { query, close } = await import('../lib/db.js');
const { deleteTryOnImage } = await import('../lib/storage.js');

const { rows: expired } = await query(
  `select id, output_image from tryon_jobs
    where expires_at is not null and expires_at < now()`
);

console.log(`${expired.length} expired try-on job(s)${DRY_RUN ? ' (dry run)' : ''}`);

let objectsDeleted = 0;
for (const job of expired) {
  if (!job.output_image) continue;
  if (DRY_RUN) {
    console.log(`  would delete object ${job.output_image}`);
    continue;
  }
  if (await deleteTryOnImage(job.output_image)) objectsDeleted += 1;
}

if (DRY_RUN) {
  console.log('dry run: no rows deleted.');
} else {
  // purge_expired() covers the token tables and rate_limits too, so this one
  // call finishes the whole retention sweep.
  const { rows } = await query('select purge_expired() as count');
  console.log(`${objectsDeleted} object(s) deleted, ${rows[0].count} row(s) purged across all tables.`);
}

await close();
