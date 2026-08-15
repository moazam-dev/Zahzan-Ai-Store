#!/usr/bin/env node
// tools/seed-admin.mjs
//
// Postgres equivalent of server/scripts/seedAdmin.js (task-14-brief.md).
// Same data, same behaviour: ensures a single admin user + admin_users
// metadata row exist, creating them only if missing, promoting an existing
// matching user to role 'admin' if found with a different role. Intended
// for fresh/dev environments -- NOT for the user's real admin account (use
// tools/migrate-admins.mjs for that, which copies the real bcrypt hash
// verbatim instead of hashing ADMIN_PASSWORD).
//
// GC7: email is lowercased and trimmed on write (Mongoose applied
// `lowercase: true` automatically in the old stack; Postgres does not).
//
// Usage:
//   node tools/seed-admin.mjs
//
// Env vars:
//   ADMIN_EMAIL (default admin@zahzan.com), ADMIN_PASSWORD (default
//     AdminZahzan2026!) -- same defaults as server/scripts/seedAdmin.js.
//   SUPABASE_DB_URL -- target Postgres connection string (read by
//     lib/db.js's `pg` driver; required unless ZAHZAN_DB_DRIVER=pglite).

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, close as closePg } from '../lib/db.js';

export async function seedAdmin(db, { adminEmail, adminPassword }) {
  // GC7: lowercase + trim, matching Mongoose's `lowercase: true` schema
  // option applied on every write in the old stack.
  const email = String(adminEmail).trim().toLowerCase();

  console.log(`[seed-admin] Checking if admin user exists with email: ${email}`);

  const { rows: existingRows } = await db.query(
    'select id, role from users where lower(email) = lower($1)',
    [email]
  );

  let userId;
  let userCreated = false;
  let roleUpdated = false;

  if (existingRows.length > 0) {
    console.log('[seed-admin] Admin user already exists.');
    userId = existingRows[0].id;
    if (existingRows[0].role !== 'admin') {
      await db.query('update users set role = $1 where id = $2', ['admin', userId]);
      roleUpdated = true;
      console.log('[seed-admin] User role updated to admin.');
    }
  } else {
    // Mirrors the source's userSchema.pre('save') hash step
    // (bcrypt.genSalt(10) + bcrypt.hash), applied here explicitly since
    // there is no Mongoose middleware in Postgres.
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const { rows } = await db.query(
      `insert into users (
         first_name, last_name, email, password, role, is_email_verified, is_active
       ) values ($1,$2,$3,$4,$5,$6,$7)
       returning id`,
      ['Zahzan', 'Admin', email, hashedPassword, 'admin', true, true]
    );
    userId = rows[0].id;
    userCreated = true;
    console.log('[seed-admin] Admin user created successfully.');
  }

  const { rows: profileRows } = await db.query(
    'select id from admin_users where user_id = $1',
    [userId]
  );

  let profileCreated = false;
  if (profileRows.length === 0) {
    await db.query(
      `insert into admin_users (user_id, permissions, department)
       values ($1,$2,$3)`,
      [userId, ['all'], 'Executive']
    );
    profileCreated = true;
    console.log('[seed-admin] AdminUser metadata profile created successfully.');
  }

  console.log('[seed-admin] Admin seed process completed.');

  return {
    read: existingRows.length + profileRows.length,
    inserted: (userCreated ? 1 : 0) + (profileCreated ? 1 : 0),
    updated: roleUpdated ? 1 : 0,
    skipped: (userCreated ? 0 : 1) + (profileCreated ? 0 : 1) - (roleUpdated ? 1 : 0)
  };
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@zahzan.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminZahzan2026!';
  const summary = await seedAdmin({ query }, { adminEmail, adminPassword });
  console.log('[seed-admin] Summary:', JSON.stringify(summary, null, 2));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('seed-admin.mjs')) {
  main()
    .then(() => closePg())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(`[seed-admin] Error during admin seeding: ${err.message}`);
      try {
        await closePg();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
