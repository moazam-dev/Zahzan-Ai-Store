// test/migrate.test.js
//
// Tests tools/migrate-products.mjs and tools/migrate-admins.mjs against
// PGlite, using FIXTURES that stand in for raw Mongo documents -- no live
// Mongo connection is opened anywhere in this file (task-14-brief.md's
// Tests section is explicit about this). The scripts' Mongo-reading code
// path (MongoClient.connect / .find()) lives only behind each file's
// `main()` / CLI guard, which this file never imports or calls -- only the
// exported, driver-agnostic `migrateProducts(db, docs, opts)` /
// `migrateAdmins(db, docs, opts)` functions are exercised here.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createTestDb } from './helpers/db.js';
import { mapProductDoc, migrateProducts } from '../tools/migrate-products.mjs';
import { mapAdminUserDoc, migrateAdmins } from '../tools/migrate-admins.mjs';

const db = await createTestDb();

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await db.reset();
});

// A fixture shaped exactly like a raw document out of Mongo's `products`
// collection (server/models/Product.js) -- ObjectId-ish string `_id`,
// camelCase fields, arrays and a nested `colors`/`breakdown` shape.
function makeProductDoc(overrides = {}) {
  return {
    _id: '6a7ca2fc6c78ca138a83a527',
    name: 'Ivory Bloom',
    slug: 'ivory-bloom',
    sku: 'zah-ivory-001', // deliberately lowercase -- GC7 must uppercase it on write
    description: 'Fine cotton lawn with sculptural drape.',
    quickDescription: 'A refined embroidered lawn three-piece.',
    price: 18900,
    category: 'Lawn',
    badge: 'NEW',
    images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'],
    image: 'https://img.test/a.jpg',
    hoverImage: 'https://img.test/b.jpg',
    color: 'Warm Ivory',
    sizes: ['S', 'M', 'L'],
    fabric: 'Fine Cotton Lawn',
    work: 'Tonal Needlework',
    breakdown: {
      shirt: 'Fine cotton lawn shirt',
      trouser: 'Tailored solid cotton trouser',
      dupatta: 'Sheer organza dupatta'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: S",
    careInstructions: ['Dry clean only', 'Cold hand wash'],
    gallery: ['https://img.test/a.jpg', 'https://img.test/c.jpg'],
    stock: 5,
    isActive: true,
    colors: [{ name: 'Ivory', hex: '#F5F0E6', image: 'https://img.test/a.jpg' }],
    __v: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides
  };
}

function makeAdminUserDoc(overrides = {}) {
  return {
    _id: '6a7ca29f02667eb74aab3487',
    firstName: 'Zahzan',
    lastName: 'Admin',
    email: '  Admin@Zahzan.com  ', // deliberately mixed-case + padded -- GC7 must normalise it
    password: '$2b$10$PLACEHOLDER', // overwritten per-test with a real hash
    role: 'admin',
    isEmailVerified: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    __v: 0,
    ...overrides
  };
}

function makeAdminProfileDoc(overrides = {}) {
  return {
    _id: '6a7ca2a002667eb74aab348b',
    userId: '6a7ca29f02667eb74aab3487',
    permissions: ['all'],
    department: 'Executive',
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    __v: 0,
    ...overrides
  };
}

describe('migrate-products.mjs', () => {
  it('maps array fields to text[] and colors/breakdown to jsonb correctly', async () => {
    const doc = makeProductDoc();
    const { summary, idmap } = await migrateProducts(db, [doc], {});

    expect(summary).toEqual({ read: 1, inserted: 1, updated: 0, skipped: 0 });
    expect(idmap[doc._id]).toMatch(/^[0-9a-f-]{36}$/);

    const { rows } = await db.query('select * from products where slug = $1', ['ivory-bloom']);
    expect(rows).toHaveLength(1);
    const row = rows[0];

    // text[] fields: order-preserving flat string arrays.
    expect(row.images).toEqual(doc.images);
    expect(row.sizes).toEqual(doc.sizes);
    expect(row.care_instructions).toEqual(doc.careInstructions);
    expect(row.gallery).toEqual(doc.gallery);

    // jsonb fields: structured shape preserved.
    expect(row.colors).toEqual(doc.colors);
    expect(row.breakdown).toEqual(doc.breakdown);

    // slug, sku (GC7-normalised), createdAt preserved.
    expect(row.slug).toBe('ivory-bloom');
    expect(row.sku).toBe('ZAH-IVORY-001');
    expect(new Date(row.created_at).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('GC7: uppercases sku via mapProductDoc regardless of source casing', () => {
    expect(mapProductDoc(makeProductDoc({ sku: '  zah-x-1  ' })).sku).toBe('ZAH-X-1');
  });

  it('re-running is idempotent: a second run UPDATEs the same row by slug, not a duplicate', async () => {
    const doc = makeProductDoc();

    const first = await migrateProducts(db, [doc], {});
    expect(first.summary).toEqual({ read: 1, inserted: 1, updated: 0, skipped: 0 });

    const changed = { ...doc, price: 19900, stock: 2 };
    const second = await migrateProducts(db, [changed], {});
    expect(second.summary).toEqual({ read: 1, inserted: 0, updated: 1, skipped: 0 });

    const { rows } = await db.query('select id, price, stock from products where slug = $1', ['ivory-bloom']);
    expect(rows).toHaveLength(1); // exactly one row, not two
    expect(rows[0].id).toBe(first.idmap[doc._id]); // same row, updated in place
    expect(Number(rows[0].price)).toBe(19900);
    expect(rows[0].stock).toBe(2);
  });

  it('--dry-run writes nothing', async () => {
    const doc = makeProductDoc();
    const { summary, idmap } = await migrateProducts(db, [doc], { dryRun: true });

    expect(summary).toEqual({ read: 1, inserted: 0, updated: 0, skipped: 1 });
    expect(idmap).toEqual({});

    const { rows } = await db.query('select * from products');
    expect(rows).toHaveLength(0);
  });
});

describe('migrate-admins.mjs', () => {
  it('copies the bcrypt hash byte-for-byte, and it still verifies with bcryptjs.compare', async () => {
    const plaintext = 'CorrectHorseBatteryStaple!42';
    const realHash = await bcrypt.hash(plaintext, 10);
    const userDoc = makeAdminUserDoc({ password: realHash });
    const profileDoc = makeAdminProfileDoc();

    const { summary } = await migrateAdmins(
      db,
      { adminUsers: [userDoc], adminProfiles: [profileDoc] },
      {}
    );
    expect(summary.users).toEqual({ read: 1, inserted: 1, updated: 0, skipped: 0 });

    const { rows } = await db.query('select password from users where lower(email) = $1', ['admin@zahzan.com']);
    expect(rows).toHaveLength(1);

    // Byte-for-byte survival.
    expect(rows[0].password).toBe(realHash);

    // The copied hash still authenticates the ORIGINAL plaintext password --
    // the failure mode this test exists to catch (a mangled hash locks the
    // client's admin out with no error until their next login attempt).
    await expect(bcrypt.compare(plaintext, rows[0].password)).resolves.toBe(true);
    await expect(bcrypt.compare('wrong-password', rows[0].password)).resolves.toBe(false);
  });

  it('GC7: normalises email (lowercase + trim) via mapAdminUserDoc', () => {
    expect(mapAdminUserDoc(makeAdminUserDoc({ email: '  Admin@Zahzan.COM  ' })).email).toBe('admin@zahzan.com');
  });

  it('also migrates the matching admin_users metadata row', async () => {
    const userDoc = makeAdminUserDoc();
    const profileDoc = makeAdminProfileDoc();

    const { summary } = await migrateAdmins(
      db,
      { adminUsers: [userDoc], adminProfiles: [profileDoc] },
      {}
    );
    expect(summary.adminProfiles).toEqual({ read: 1, inserted: 1, updated: 0, skipped: 0 });

    const { rows } = await db.query(
      `select au.permissions, au.department
       from admin_users au
       join users u on u.id = au.user_id
       where lower(u.email) = 'admin@zahzan.com'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].permissions).toEqual(['all']);
    expect(rows[0].department).toBe('Executive');
  });

  it('re-running is idempotent by email: a second run UPDATEs the same user row, not a duplicate', async () => {
    const userDoc = makeAdminUserDoc();
    const profileDoc = makeAdminProfileDoc();

    await migrateAdmins(db, { adminUsers: [userDoc], adminProfiles: [profileDoc] }, {});
    const changed = { ...userDoc, phone: '03001234567' };
    const second = await migrateAdmins(db, { adminUsers: [changed], adminProfiles: [profileDoc] }, {});

    expect(second.summary.users).toEqual({ read: 1, inserted: 0, updated: 1, skipped: 0 });

    const { rows } = await db.query('select phone from users where lower(email) = $1', ['admin@zahzan.com']);
    expect(rows).toHaveLength(1); // exactly one row, not two
    expect(rows[0].phone).toBe('03001234567');
  });

  it('--dry-run writes nothing', async () => {
    const userDoc = makeAdminUserDoc();
    const profileDoc = makeAdminProfileDoc();

    const { summary } = await migrateAdmins(
      db,
      { adminUsers: [userDoc], adminProfiles: [profileDoc] },
      { dryRun: true }
    );

    expect(summary.users).toEqual({ read: 1, inserted: 0, updated: 0, skipped: 1 });
    expect(summary.adminProfiles.skipped).toBe(1);

    const { rows: userRows } = await db.query('select * from users');
    expect(userRows).toHaveLength(0);
    const { rows: profileRows } = await db.query('select * from admin_users');
    expect(profileRows).toHaveLength(0);
  });
});
