// Test-only helper: applies supabase/migrations/0001_init.sql through
// lib/db.js's `query(text, params)` -- the SAME function production code
// and lib/auth.js/lib/rateLimit.js call, and (for the pglite driver) the
// SAME lazily-created singleton PGlite instance, since it's a module-level
// singleton inside lib/db.js shared by every importer in the process.
//
// This exists because lib/db.js deliberately exposes only single-statement
// `query()` (mirroring what the `pg` driver needs), not PGlite's own
// `.exec()`, which is the only PGlite method that accepts a multi-
// statement script. So the migration file -- one script, many statements,
// including `$$ ... $$`-quoted plpgsql function bodies containing their
// own internal semicolons -- has to be split into individual statements
// first. test/helpers/db.js doesn't need this because it talks to PGlite
// directly and uses `.exec()`; tests that need to exercise the real
// `lib/db.js` code path (lib/auth.js, lib/rateLimit.js) do.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(__dirname, '../../supabase/migrations/0001_init.sql');

/**
 * Splits a SQL script into individual statements on `;`, except inside
 * `$$ ... $$` dollar-quoted bodies (toggled on each `$$` occurrence) or
 * `-- ...` line comments (this migration's header block has a semicolon
 * inside a comment sentence -- "sixteen mirror ... one-for-one; three are
 * introduced" -- so comment-awareness isn't optional here, it's load-
 * bearing). Sufficient for 0001_init.sql's actual structure; not a
 * general-purpose SQL parser (no `/* *\/` block comments or `$tag$`
 * custom dollar-quote delimiters, neither of which this migration uses).
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (!inDollarQuote && sql.startsWith('--', i)) {
      inLineComment = true;
      current += '--';
      i += 1;
      continue;
    }

    if (sql.startsWith('$$', i)) {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i += 1; // consume the second '$' too (loop's i++ consumes the first)
      continue;
    }

    if (ch === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

/**
 * Reads supabase/migrations/0001_init.sql and applies it statement-by-
 * statement through the given `query(text, params)` function (lib/db.js's
 * export, typically).
 */
export async function applyMigrationViaQuery(query) {
  const sql = await readFile(MIGRATION_PATH, 'utf8');
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await query(statement);
  }
  return statements.length;
}
