#!/usr/bin/env node
// tools/migrate-admins.mjs
//
// One-time (repeatable) migration: copies every Mongo `users` document
// with role: 'admin' (zahzan_db) into the Postgres `users` table, plus its
// matching `adminusers` metadata document into `admin_users`
// (supabase/migrations/0001_init.sql, Task 3). Task 14 brief.
//
// SAFETY: Mongo is opened STRICTLY READ-ONLY -- two `.find({}).toArray()`
// calls (users, adminusers) and never a write. zahzan_db is the user's
// real, irreplaceable development data.
//
// THE BCRYPT HASH IS COPIED VERBATIM, NEVER RE-HASHED. The old app's
// bcrypt.compare() only ever needs the hash string itself to keep
// validating the SAME plaintext password -- re-hashing it (or, worse,
// hashing the hash) would silently lock every admin out of their own store
// with no error until their next login attempt. See test/migrate.test.js's
// bcrypt round-trip test.
//
// Idempotent by email: re-running UPDATEs the existing `users` row via
// `on conflict (lower(email))` (matching users_email_lower_idx, Task 3)
// instead of inserting a duplicate; the matching `admin_users` row is
// upserted via `on conflict (user_id)` (admin_users_user_id_idx).
//
// GC7: email is lowercased and trimmed on write -- Mongoose applied
// `lowercase: true` automatically in the old stack; Postgres does not.
//
// Usage:
//   node tools/migrate-admins.mjs [--dry-run] [--mongo-uri <uri>]
//
// Env vars:
//   MONGO_MIGRATION_URI or MONGODB_URI -- source Mongo connection string.
//     Defaults to mongodb://localhost:27017/zahzan_db.
//   SUPABASE_DB_URL -- target Postgres connection string (read by
//     lib/db.js's `pg` driver; required unless ZAHZAN_DB_DRIVER=pglite).

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { query, close as closePg } from '../lib/db.js';

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/zahzan_db';

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    mongoUri: process.env.MONGO_MIGRATION_URI || process.env.MONGODB_URI || DEFAULT_MONGO_URI
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--mongo-uri') args.mongoUri = argv[++i];
  }
  return args;
}

/** Maps a raw Mongo admin `users` document to a Postgres `users` row. */
export function mapAdminUserDoc(doc) {
  return {
    first_name: doc.firstName,
    last_name: doc.lastName,
    // GC7: Mongoose's `lowercase: true` ran on every write; applied
    // explicitly here since Postgres has no equivalent.
    email: String(doc.email ?? '').trim().toLowerCase(),
    // Copied VERBATIM -- see file header. Never re-hashed, never re-derived.
    password: doc.password,
    // Defensive fallbacks: the real admin@zahzan.com document in zahzan_db
    // predates these fields (added to the schema after that document was
    // created) and genuinely has none of the three stored -- there is
    // nothing to read, so the same defaults Mongoose's schema itself
    // declares are used.
    auth_provider: doc.authProvider ?? 'local',
    google_id: doc.googleId ?? '',
    facebook_id: doc.facebookId ?? '',
    phone: doc.phone ?? '',
    role: 'admin',
    is_email_verified: doc.isEmailVerified ?? true,
    is_active: doc.isActive ?? true,
    created_at: doc.createdAt ? new Date(doc.createdAt) : new Date()
  };
}

/** Maps a raw Mongo `adminusers` document to a Postgres `admin_users` row (minus user_id, resolved by the caller after the users upsert). */
export function mapAdminProfileDoc(doc) {
  return {
    permissions: Array.isArray(doc.permissions) ? doc.permissions : [],
    department: doc.department ?? 'Management',
    created_at: doc.createdAt ? new Date(doc.createdAt) : new Date()
  };
}

/**
 * Core migration logic. Takes a driver-agnostic `db` handle (same
 * `query(text, params) -> { rows }` shape as lib/db.js / test/helpers/db.js)
 * plus the already-fetched raw Mongo documents, so tests can drive this
 * against PGlite with fixture documents and zero Mongo dependency.
 *
 * `adminUsers`: raw `users` documents with role: 'admin'.
 * `adminProfiles`: raw `adminusers` documents (matched to their owning
 * admin user by `userId`).
 */
export async function migrateAdmins(db, { adminUsers, adminProfiles }, { dryRun = false } = {}) {
  const summary = {
    users: { read: adminUsers.length, inserted: 0, updated: 0, skipped: 0 },
    adminProfiles: { read: adminProfiles.length, inserted: 0, updated: 0, skipped: 0 }
  };

  for (const userDoc of adminUsers) {
    const row = mapAdminUserDoc(userDoc);

    if (dryRun) {
      summary.users.skipped += 1;
      continue;
    }

    const { rows: userRows } = await db.query(
      `insert into users (
         first_name, last_name, email, password, auth_provider, google_id,
         facebook_id, phone, role, is_email_verified, is_active, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (lower(email)) do update set
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         password = excluded.password,
         auth_provider = excluded.auth_provider,
         google_id = excluded.google_id,
         facebook_id = excluded.facebook_id,
         phone = excluded.phone,
         role = excluded.role,
         is_email_verified = excluded.is_email_verified,
         is_active = excluded.is_active
       returning id, (xmax = 0) as inserted`,
      [
        row.first_name, row.last_name, row.email, row.password, row.auth_provider,
        row.google_id, row.facebook_id, row.phone, row.role, row.is_email_verified,
        row.is_active, row.created_at
      ]
    );

    const newUserId = userRows[0].id;
    if (userRows[0].inserted === true || userRows[0].inserted === 't') {
      summary.users.inserted += 1;
    } else {
      summary.users.updated += 1;
    }

    const profileDoc = adminProfiles.find((p) => String(p.userId) === String(userDoc._id));
    if (!profileDoc) {
      // Nothing to copy -- do not fabricate a metadata row for an admin
      // that never had one in Mongo.
      continue;
    }

    const profileRow = mapAdminProfileDoc(profileDoc);
    const { rows: profileRows } = await db.query(
      `insert into admin_users (user_id, permissions, department, created_at)
       values ($1,$2,$3,$4)
       on conflict (user_id) do update set
         permissions = excluded.permissions,
         department = excluded.department
       returning id, (xmax = 0) as inserted`,
      [newUserId, profileRow.permissions, profileRow.department, profileRow.created_at]
    );

    if (profileRows[0].inserted === true || profileRows[0].inserted === 't') {
      summary.adminProfiles.inserted += 1;
    } else {
      summary.adminProfiles.updated += 1;
    }
  }

  // Any adminusers documents whose owning admin user wasn't in `adminUsers`
  // at all (e.g. role since changed away from 'admin') are read but not
  // migrated -- counted as skipped, not silently dropped.
  const matchedProfileCount = summary.adminProfiles.inserted + summary.adminProfiles.updated;
  summary.adminProfiles.skipped = dryRun
    ? adminProfiles.length
    : adminProfiles.length - matchedProfileCount;

  return { summary };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[migrate-admins] Mongo source: ${args.mongoUri}${args.dryRun ? ' (DRY RUN -- read-only, no Postgres writes)' : ''}`);

  const client = new MongoClient(args.mongoUri);
  let adminUsers;
  let adminProfiles;
  try {
    await client.connect();
    const db = client.db();
    // READ-ONLY: the only two Mongo calls this script ever makes.
    adminUsers = await db.collection('users').find({ role: 'admin' }).toArray();
    adminProfiles = await db.collection('adminusers').find({}).toArray();
  } finally {
    await client.close();
  }

  const { summary } = await migrateAdmins({ query }, { adminUsers, adminProfiles }, { dryRun: args.dryRun });

  console.log('[migrate-admins] Summary:', JSON.stringify(summary, null, 2));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('migrate-admins.mjs')) {
  main()
    .then(() => closePg())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[migrate-admins] FAILED:', err.message);
      try {
        await closePg();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
