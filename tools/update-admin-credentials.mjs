#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import bcrypt from 'bcryptjs';
import { query, close as closePg } from '../lib/db.js';

export async function updateAdminCredentials(db, { adminEmail, adminPassword }) {
  const email = String(adminEmail).trim().toLowerCase();
  const password = String(adminPassword);

  if (!email || !password) {
    throw new Error('Email and password must both be provided.');
  }

  console.log(`[admin-credentials] Setting admin credentials for email: ${email}`);

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Check if user exists with this email or existing admin role
  const { rows: existingByEmail } = await db.query(
    'select id, email, role from users where lower(email) = lower($1)',
    [email]
  );

  let userId;

  if (existingByEmail.length > 0) {
    userId = existingByEmail[0].id;
    await db.query(
      `update users 
       set password = $1, role = 'admin', is_active = true, is_email_verified = true 
       where id = $2`,
      [hashedPassword, userId]
    );
    console.log(`[admin-credentials] Updated password & admin role for user ID: ${userId} (${email})`);
  } else {
    // Check if there is an existing admin user that we should update
    const { rows: existingAdmins } = await db.query(
      "select id, email from users where role = 'admin' limit 1"
    );

    if (existingAdmins.length > 0) {
      userId = existingAdmins[0].id;
      await db.query(
        `update users 
         set email = $1, password = $2, is_active = true, is_email_verified = true 
         where id = $3`,
        [email, hashedPassword, userId]
      );
      console.log(`[admin-credentials] Updated existing admin user (ID: ${userId}) to new email: ${email}`);
    } else {
      // Create fresh admin user
      const { rows: newRows } = await db.query(
        `insert into users (
           first_name, last_name, email, password, role, is_email_verified, is_active
         ) values ($1, $2, $3, $4, $5, $6, $7)
         returning id`,
        ['Zahzan', 'Admin', email, hashedPassword, 'admin', true, true]
      );
      userId = newRows[0].id;
      console.log(`[admin-credentials] Created new admin user with ID: ${userId} (${email})`);
    }
  }

  // Ensure admin_users metadata profile exists
  const { rows: profileRows } = await db.query(
    'select id from admin_users where user_id = $1',
    [userId]
  );

  if (profileRows.length === 0) {
    await db.query(
      `insert into admin_users (user_id, permissions, department)
       values ($1, $2, $3)`,
      [userId, ['all'], 'Executive']
    );
    console.log('[admin-credentials] AdminUser metadata profile created.');
  }

  console.log('✓ Successfully set admin credentials.');
  return { success: true, email, userId };
}

async function main() {
  const args = process.argv.slice(2);
  const emailArg = args[0];
  const passArg = args[1];

  const adminEmail = emailArg || process.env.ADMIN_EMAIL || 'admin@zahzan.com';
  const adminPassword = passArg || process.env.ADMIN_PASSWORD || 'AdminZahzan2026!';

  await updateAdminCredentials({ query }, { adminEmail, adminPassword });
}

main()
  .then(() => closePg())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(`[admin-credentials] Error: ${err.message}`);
    try {
      await closePg();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
