#!/usr/bin/env node
// tools/migrate-products.mjs
//
// One-time (repeatable) migration: copies every document in Mongo's
// `products` collection (zahzan_db) into the Postgres `products` table
// (supabase/migrations/0001_init.sql, Task 3). Task 14 brief.
//
// SAFETY: Mongo is opened STRICTLY READ-ONLY. This script issues exactly
// one Mongo call -- `.find({}).toArray()` -- and never an insert, update,
// delete, or admin command against Mongo. zahzan_db is the user's real,
// irreplaceable development data; a write here would be a catastrophic
// failure regardless of what else the script gets right.
//
// Field mapping (server/models/Product.js -> products table):
//   - images, sizes, careInstructions, gallery -> text[] (flat string
//     arrays, order-preserving, matching the column types Task 3 chose).
//   - colors, breakdown -> jsonb (fixed/structured shape, rendered whole).
//   - slug, sku, createdAt are preserved from the source document, not
//     regenerated.
//   - GC7: sku is uppercased (and trimmed) on write -- Mongoose applied
//     `uppercase: true` automatically in the old stack; Postgres does not.
//
// Idempotent: re-running UPDATEs the existing row by `slug` -- the same
// field server/models/Product.js already enforced as unique in Mongo --
// instead of inserting a duplicate (`insert ... on conflict (slug) do
// update`, the same pattern the products unique index already needs to
// support the ordinary POST /api/admin/products create/edit paths).
//
// Usage:
//   node tools/migrate-products.mjs [--dry-run] [--mongo-uri <uri>]
//
// Env vars:
//   MONGO_MIGRATION_URI or MONGODB_URI -- source Mongo connection string.
//     Defaults to mongodb://localhost:27017/zahzan_db.
//   SUPABASE_DB_URL -- target Postgres connection string (read by
//     lib/db.js's `pg` driver; required unless ZAHZAN_DB_DRIVER=pglite).
//
// Writes tools/migration-idmap.json:
//   { "products": { "<old Mongo _id hex>": "<new Postgres uuid>", ... } }

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, tx, close as closePg } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDMAP_PATH = path.resolve(__dirname, 'migration-idmap.json');
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

/**
 * Maps one raw Mongo `products` document to a Postgres `products` row
 * (snake_case columns). Defensive `??`/`Array.isArray` fallbacks throughout
 * because real documents in zahzan_db predate some optional fields (e.g.
 * `originalPrice` is absent on 5 of the 6 real products) -- Mongoose never
 * persisted a value for those, so there is nothing to read.
 */
export function mapProductDoc(doc) {
  return {
    name: doc.name,
    slug: doc.slug,
    // GC7: Mongoose's `uppercase: true` ran on every write; Postgres has no
    // equivalent, so it is applied explicitly here.
    sku: String(doc.sku ?? '').trim().toUpperCase(),
    description: doc.description ?? '',
    quick_description: doc.quickDescription ?? '',
    price: doc.price,
    original_price: doc.originalPrice ?? null,
    category: doc.category,
    badge: doc.badge ?? null,
    images: Array.isArray(doc.images) ? doc.images : [],
    image: doc.image ?? null,
    hover_image: doc.hoverImage ?? null,
    colors: Array.isArray(doc.colors) ? doc.colors : [],
    color: doc.color ?? null,
    sizes: Array.isArray(doc.sizes) ? doc.sizes : [],
    fabric: doc.fabric ?? null,
    work: doc.work ?? null,
    breakdown: doc.breakdown && typeof doc.breakdown === 'object' ? doc.breakdown : null,
    model_info: doc.modelInfo ?? null,
    care_instructions: Array.isArray(doc.careInstructions) ? doc.careInstructions : [],
    gallery: Array.isArray(doc.gallery) ? doc.gallery : [],
    stock: doc.stock ?? 0,
    is_active: doc.isActive ?? true,
    // Preserved from the source, not regenerated (task-14-brief.md).
    created_at: doc.createdAt ? new Date(doc.createdAt) : new Date()
  };
}

/**
 * Core migration logic. Takes a driver-agnostic `db` handle exposing the
 * same `query(text, params) -> { rows }` shape lib/db.js and
 * test/helpers/db.js both provide, plus the already-fetched array of raw
 * Mongo documents -- so tests can drive this against PGlite with fixture
 * documents, with zero Mongo dependency (task-14-brief.md's Tests section).
 *
 * `--dry-run`: maps and counts every document but issues no Postgres
 * writes at all (not even inside a rolled-back transaction) and returns an
 * empty idmap.
 *
 * A real (non-dry-run) run's writes are wrapped in a single `db.tx()` call,
 * so a constraint violation partway through leaves the catalogue exactly as
 * it was before this call started -- not a partial write of whichever
 * documents happened to be processed first. The idempotent upsert-by-slug
 * behaviour is unchanged; it still works exactly the same way on the next
 * (successful) re-run.
 */
export async function migrateProducts(db, mongoDocs, { dryRun = false } = {}) {
  const summary = { read: mongoDocs.length, inserted: 0, updated: 0, skipped: 0 };
  const idmap = {};

  if (dryRun) {
    for (const doc of mongoDocs) {
      // Still exercise the mapper so a genuinely malformed document is
      // caught (fails loudly) even in dry-run mode -- only the write is
      // skipped.
      mapProductDoc(doc);
      summary.skipped += 1;
    }
    return { summary, idmap };
  }

  await db.tx(async (txDb) => {
    for (const doc of mongoDocs) {
      const row = mapProductDoc(doc);

      const { rows } = await txDb.query(
        `insert into products (
           name, slug, sku, description, quick_description, price, original_price,
           category, badge, images, image, hover_image, colors, color, sizes,
           fabric, work, breakdown, model_info, care_instructions, gallery, stock,
           is_active, created_at
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
         )
         on conflict (slug) do update set
           name = excluded.name,
           sku = excluded.sku,
           description = excluded.description,
           quick_description = excluded.quick_description,
           price = excluded.price,
           original_price = excluded.original_price,
           category = excluded.category,
           badge = excluded.badge,
           images = excluded.images,
           image = excluded.image,
           hover_image = excluded.hover_image,
           colors = excluded.colors,
           color = excluded.color,
           sizes = excluded.sizes,
           fabric = excluded.fabric,
           work = excluded.work,
           breakdown = excluded.breakdown,
           model_info = excluded.model_info,
           care_instructions = excluded.care_instructions,
           gallery = excluded.gallery,
           stock = excluded.stock,
           is_active = excluded.is_active
         returning id, (xmax = 0) as inserted`,
        [
          row.name, row.slug, row.sku, row.description, row.quick_description,
          row.price, row.original_price, row.category, row.badge, row.images,
          row.image, row.hover_image, JSON.stringify(row.colors), row.color,
          row.sizes, row.fabric, row.work,
          row.breakdown ? JSON.stringify(row.breakdown) : null,
          row.model_info, row.care_instructions, row.gallery, row.stock,
          row.is_active, row.created_at
        ]
      );

      const newId = rows[0].id;
      if (rows[0].inserted === true || rows[0].inserted === 't') {
        summary.inserted += 1;
      } else {
        summary.updated += 1;
      }
      idmap[String(doc._id)] = newId;
    }
  });

  return { summary, idmap };
}

/** Merges `newIdmap` under `sectionKey` into the on-disk idmap file, preserving any other sections already there (e.g. a future `admins` section). */
async function writeIdmap(sectionKey, newIdmap) {
  let existing = {};
  try {
    existing = JSON.parse(await readFile(IDMAP_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  existing[sectionKey] = newIdmap;
  await writeFile(IDMAP_PATH, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return IDMAP_PATH;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[migrate-products] Mongo source: ${args.mongoUri}${args.dryRun ? ' (DRY RUN -- read-only, no Postgres writes)' : ''}`);

  const client = new MongoClient(args.mongoUri, {
    // Defence in depth, NOT a write barrier: this is a read-routing hint,
    // not a permission. It steers reads toward a secondary when the source
    // is a replica set (secondaries physically cannot accept writes); on a
    // single-node standalone (the default local `mongodb://localhost:27017`
    // dev setup) there is no secondary, so it has no effect there. The real
    // guarantee against writing to the user's irreplaceable zahzan_db is a
    // read-only Mongo credential -- see docs/DATA_MIGRATION.md's "MongoDB
    // safety" section.
    readPreference: 'secondaryPreferred'
  });
  let mongoDocs;
  try {
    await client.connect();
    const db = client.db();
    // READ-ONLY: the only Mongo call this script ever makes.
    mongoDocs = await db.collection('products').find({}).toArray();
  } finally {
    await client.close();
  }

  const { summary, idmap } = await migrateProducts({ query, tx }, mongoDocs, { dryRun: args.dryRun });

  if (!args.dryRun && Object.keys(idmap).length > 0) {
    const idmapPath = await writeIdmap('products', idmap);
    console.log(`[migrate-products] Wrote id map (${Object.keys(idmap).length} entries) to ${idmapPath}`);
  }

  console.log('[migrate-products] Summary:', JSON.stringify(summary, null, 2));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('migrate-products.mjs')) {
  main()
    .then(() => closePg())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[migrate-products] FAILED:', err.message);
      try {
        await closePg();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
