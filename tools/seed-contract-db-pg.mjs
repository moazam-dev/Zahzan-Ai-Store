#!/usr/bin/env node
// tools/seed-contract-db-pg.mjs
//
// Postgres equivalent of tools/seed-contract-db.mjs (Task 2's Mongo contract
// fixture seed), written for Task 15 (parity verification). Seeds the SAME
// deterministic fixture content -- one admin, two customers, four products
// with fixed slugs/SKUs/prices/stock, one newsletter subscriber -- so that
// running tools/contract-capture.mjs's journey against the ported Next.js
// stack produces data comparable to tools/golden/ (captured against the old
// Mongo stack seeded by tools/seed-contract-db.mjs).
//
// Every literal value below (names, emails, passwords, slugs, SKUs, prices,
// stock, the newsletter unsubscribe token) is copied verbatim from
// tools/seed-contract-db.mjs's SEED_CREDENTIALS / SEED_PRODUCTS / seeded
// newsletter subscriber -- this file must NOT drift from that one, since
// tools/contract-capture.mjs's journey (customer1/customer2 credentials,
// product slugs used to resolve ids, the newsletter unsubscribe token) is
// shared between both stacks.
//
// Ids differ by necessity, not by choice: Mongo ObjectIds cannot exist in a
// Postgres `uuid` column, so this script lets Postgres mint its own
// gen_random_uuid() ids rather than trying to force literal
// '000000000000000000000011'-shaped values into a uuid column (which the
// column type would reject outright). tools/contract-capture.mjs was
// updated (Task 15) to resolve product/customer ids dynamically (by slug /
// by login) instead of hardcoding Mongo-shaped literals, specifically so it
// keeps working against whichever id scheme the target stack actually uses.
//
// created_at/updated_at/subscribed_at are set explicitly (not left to
// `default now()`) using the exact same day-offset formula
// tools/seed-contract-db.mjs uses, so that every `order by created_at desc`
// list endpoint (products list, admin customers/products/newsletter lists)
// produces the SAME RELATIVE ORDER as the old stack -- the normaliser
// collapses timestamps to <TS>, but contract-diff.mjs compares arrays
// element-by-element, so array order has to match or every field in a
// shifted row would show up as a spurious diff.
//
// Exports seedContractDb(db) (same `{ query }`-shaped handle every other
// tools/seed-*.mjs takes) so it can be called either as a standalone CLI
// script (against a real Postgres via SUPABASE_DB_URL) or, critically, from
// inside the SAME process as a PGlite-backed Next.js server (see
// tools/run-pglite-server.mjs) -- PGlite is an in-process WASM database, so
// a seed script run as a separate `node` process would populate a
// completely different, throwaway PGlite instance than the one the server
// process ends up serving from.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, close as closePg } from '../lib/db.js';

// Same fixed unsubscribe token as tools/seed-contract-db.mjs -- 64 literal
// hex characters, read directly by tools/contract-capture.mjs's journey.
export const SEED_NEWSLETTER_TOKEN = 'ab'.repeat(32);

export const SEED_CREDENTIALS = {
  admin: { email: 'admin@zahzancontract.test', password: 'Admin@12345' },
  customer1: { email: 'customer1@zahzancontract.test', password: 'Customer@12345' },
  customer2: { email: 'customer2@zahzancontract.test', password: 'Customer@12345' }
};

// Verbatim copy of tools/seed-contract-db.mjs's SEED_PRODUCTS field values
// (minus the Mongo-only `_id`/`images`+`image` duplication quirks that
// don't apply to a relational column -- `image`/`images` are still both
// set, matching the source exactly).
const SEED_PRODUCTS = [
  {
    name: 'ZAHZAN Ivory Silk Kurta',
    slug: 'ivory-silk-kurta-zhz-001',
    sku: 'ZHZ-001',
    description: 'Hand-finished ivory silk kurta with subtle embroidery.',
    price: 8500,
    category: 'Kurtas',
    images: ['https://images.example.test/products/zhz-001-a.jpg'],
    image: 'https://images.example.test/products/zhz-001-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-001-b.jpg',
    colors: [{ name: 'Ivory', hex: '#F5F0E6', image: 'https://images.example.test/products/zhz-001-a.jpg' }],
    color: 'Ivory',
    sizes: ['S', 'M', 'L', 'XL'],
    fabric: 'Pure Silk',
    work: 'Hand Embroidery',
    careInstructions: ['Dry clean only'],
    stock: 25,
    isActive: true
  },
  {
    name: 'ZAHZAN Emerald Velvet Shawl',
    slug: 'emerald-velvet-shawl-zhz-002',
    sku: 'ZHZ-002',
    description: 'Rich emerald velvet shawl with gold thread border.',
    price: 12500,
    category: 'Shawls',
    images: ['https://images.example.test/products/zhz-002-a.jpg'],
    image: 'https://images.example.test/products/zhz-002-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-002-b.jpg',
    colors: [{ name: 'Emerald', hex: '#0B5A3B', image: 'https://images.example.test/products/zhz-002-a.jpg' }],
    color: 'Emerald',
    sizes: ['One Size'],
    fabric: 'Velvet',
    work: 'Zari Border',
    careInstructions: ['Dry clean only'],
    stock: 10,
    isActive: true
  },
  {
    name: 'ZAHZAN Rose Chiffon Dupatta',
    slug: 'rose-chiffon-dupatta-zhz-003',
    sku: 'ZHZ-003',
    description: 'Lightweight rose chiffon dupatta, hand-rolled edges.',
    price: 4500,
    category: 'Dupattas',
    images: ['https://images.example.test/products/zhz-003-a.jpg'],
    image: 'https://images.example.test/products/zhz-003-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-003-b.jpg',
    colors: [{ name: 'Rose', hex: '#C97E8C', image: 'https://images.example.test/products/zhz-003-a.jpg' }],
    color: 'Rose',
    sizes: ['One Size'],
    fabric: 'Chiffon',
    work: 'Hand-Rolled Edges',
    careInstructions: ['Hand wash cold'],
    stock: 40,
    isActive: true
  },
  {
    name: 'ZAHZAN Noir Formal Set',
    slug: 'noir-formal-set-zhz-004',
    sku: 'ZHZ-004',
    description: 'Noir three-piece formal set with structured tailoring.',
    price: 18500,
    category: 'Formal Sets',
    images: ['https://images.example.test/products/zhz-004-a.jpg'],
    image: 'https://images.example.test/products/zhz-004-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-004-b.jpg',
    colors: [{ name: 'Noir', hex: '#111111', image: 'https://images.example.test/products/zhz-004-a.jpg' }],
    color: 'Noir',
    sizes: ['S', 'M', 'L'],
    fabric: 'Wool Blend',
    work: 'Structured Tailoring',
    careInstructions: ['Dry clean only'],
    stock: 5,
    isActive: true
  }
];

// Identical formula to tools/seed-contract-db.mjs's ts(): a fixed anchor
// date minus `daysAgo` days -- no Date.now(), so relative ordering (all
// that list endpoints actually depend on, since normalise.mjs collapses the
// absolute value to <TS> either way) is reproducible run to run.
function ts(daysAgo) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0) - daysAgo * 24 * 60 * 60 * 1000);
}

/**
 * Wipes every table this seed touches (plus anything that would FK-block a
 * plain delete) and re-seeds the deterministic contract fixtures. Idempotent
 * -- safe to call multiple times against the same database.
 *
 * @param {{query: Function}} db same shape lib/db.js exports.
 */
export async function seedContractDb(db) {
  console.log('[seed-contract-db-pg] Clearing existing contract-fixture data...');
  // TRUNCATE ... CASCADE handles every dependent row (orders, payments,
  // cart_items, wishlist_items, addresses, audit_logs, admin_users, etc.)
  // regardless of FK direction, mirroring seed-contract-db.mjs's
  // `dropDatabase()` full-reset semantics as closely as a shared, already-
  // migrated schema allows.
  await db.query(
    `truncate table
       cart_items, carts, wishlist_items, addresses, payments, orders,
       audit_logs, admin_users, notifications, story_submissions,
       tryon_jobs, refresh_tokens, password_reset_tokens,
       email_change_tokens, verification_tokens, newsletter_subscribers,
       products, users
     cascade`
  );

  const adminHash = await bcrypt.hash(SEED_CREDENTIALS.admin.password, 10);
  const customer1Hash = await bcrypt.hash(SEED_CREDENTIALS.customer1.password, 10);
  const customer2Hash = await bcrypt.hash(SEED_CREDENTIALS.customer2.password, 10);

  console.log('[seed-contract-db-pg] Seeding 1 admin, 2 customers...');
  const { rows: userRows } = await db.query(
    `insert into users (
       first_name, last_name, email, password, phone, role,
       is_email_verified, is_active, created_at, updated_at
     ) values
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9),
       ($10,$11,$12,$13,$14,$15,$16,$17,$18,$18),
       ($19,$20,$21,$22,$23,$24,$25,$26,$27,$27)
     returning id, email`,
    [
      'Contract', 'Admin', SEED_CREDENTIALS.admin.email, adminHash, '03000000001', 'admin', true, true,
      ts(30).toISOString(),
      'Amina', 'Yousaf', SEED_CREDENTIALS.customer1.email, customer1Hash, '03000000002', 'customer', true, true,
      ts(20).toISOString(),
      'Bilal', 'Chaudhry', SEED_CREDENTIALS.customer2.email, customer2Hash, '03000000003', 'customer', true, true,
      ts(19).toISOString()
    ]
  );

  console.log('[seed-contract-db-pg] Seeding 4 fixture products...');
  const insertedProducts = [];
  for (let idx = 0; idx < SEED_PRODUCTS.length; idx++) {
    const p = SEED_PRODUCTS[idx];
    const createdAt = ts(10 - idx).toISOString();
    const { rows } = await db.query(
      `insert into products (
         name, slug, sku, description, quick_description, price, category,
         images, image, hover_image, colors, color, sizes, fabric, work,
         care_instructions, gallery, stock, is_active, created_at, updated_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20
       ) returning id, slug`,
      [
        p.name,
        p.slug,
        // GC7: uppercase sku on write (Mongoose applied this automatically
        // in the old stack). Literal SKUs above are already uppercase, but
        // the write path still applies .toUpperCase() explicitly so this
        // stays correct if the list is ever edited.
        String(p.sku).trim().toUpperCase(),
        p.description,
        '',
        p.price,
        p.category,
        p.images,
        p.image,
        p.hoverImage,
        JSON.stringify(p.colors),
        p.color,
        p.sizes,
        p.fabric,
        p.work,
        p.careInstructions,
        [],
        p.stock,
        p.isActive,
        createdAt
      ]
    );
    insertedProducts.push(rows[0]);
  }

  console.log('[seed-contract-db-pg] Seeding 1 newsletter subscriber...');
  await db.query(
    `insert into newsletter_subscribers (
       email, status, source, unsubscribe_token, subscribed_at, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$5,$5)`,
    [
      'seed.subscriber@zahzancontract.test',
      'subscribed',
      'seed',
      SEED_NEWSLETTER_TOKEN,
      ts(15).toISOString()
    ]
  );

  console.log(
    `[seed-contract-db-pg] Seeded: ${userRows.length} users, ${insertedProducts.length} products, 1 newsletter subscriber.`
  );

  return { users: userRows, products: insertedProducts };
}

async function main() {
  const summary = await seedContractDb({ query });
  console.log('[seed-contract-db-pg] Summary:', JSON.stringify(summary, null, 2));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('seed-contract-db-pg.mjs')) {
  main()
    .then(() => closePg())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[seed-contract-db-pg] FAILED:', err.message);
      try {
        await closePg();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
