#!/usr/bin/env node
// tools/backfill-product-details.mjs
//
// Populates the columns added by supabase/migrations/0004_product_details.sql
// for products that already exist, so the Product Page keeps rendering what it
// rendered before -- except that the values now come from the database instead
// of being hardcoded in views/Product.jsx.
//
// Run this ONCE, AFTER applying 0004_product_details.sql:
//
//   node tools/backfill-product-details.mjs            # apply
//   node tools/backfill-product-details.mjs --dry-run  # report only
//
// Env vars:
//   SUPABASE_DB_URL -- target Postgres connection string (read by lib/db.js's
//     `pg` driver; required unless ZAHZAN_DB_DRIVER=pglite).
//
// ---------------------------------------------------------------------------
// WHAT IT WRITES, AND WHY EACH VALUE IS NOT INVENTED
//
//   fit_note      <- the exact sentence views/Product.jsx used to render
//                    beneath the model details for every product. It was
//                    already being shown to customers, so storing it changes
//                    nothing a customer sees -- it only moves it somewhere an
//                    admin can edit. Written only where fit_note is null.
//
//   model_height  <- parsed out of the product's OWN existing model_info line
//   model_size       ("Model Height: 5'8\" | Model wears: S"). Nothing is
//                    guessed: a model_info that does not carry a recognisable
//                    part leaves that column null. Written only where null.
//
//   colors        <- [{ name: <the product's existing `color`>, hex: null }]
//                    for products whose colors list is empty but which do have
//                    a single `color`. hex stays null rather than being
//                    guessed from the colour's name; the Product Page renders
//                    a named chip when there is no hex, and an admin can set
//                    the real value later.
//
// WHAT IT DELIBERATELY DOES NOT WRITE
//
//   size_stock    -- left as `{}`. A product carrying `stock: 8` and sizes
//                    S/M/L does not tell us how those 8 units are split, and
//                    inventing a split (8 -> 3/3/2) would put fabricated stock
//                    numbers in front of customers and let the store oversell.
//                    While size_stock is empty the product behaves EXACTLY as
//                    it does today: availability, cart validation and checkout
//                    all fall back to the product-level total. Enter the real
//                    per-size numbers in Admin > Products > Edit when you have
//                    them, and per-size tracking switches on for that product.
//
// The script is additive and idempotent: it never inserts, never deletes,
// never overwrites a value that is already set, and re-running it is a no-op.
// It reports the product count at the end so a run that changed the size of
// the catalogue would be obvious immediately.

// `.env.local` is where this project actually keeps SUPABASE_DB_URL -- `next
// dev` loads it automatically, but plain `node tools/...` does NOT: dotenv
// only reads `.env` by default, and this repo has no `.env` at all. Loading it
// explicitly (and first, so `.env` can still override for a one-off run
// against a different database) is the difference between this script working
// and failing with an empty connection string.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { query, close as closePg } from '../lib/db.js';
import { parseModelInfo } from '../lib/productFields.js';

// The exact string views/Product.jsx hardcoded beneath the model details.
// Copied verbatim, including the trailing full stop.
const LEGACY_FIT_NOTE = 'Relaxed fluid fit tailored for standard Pakistani sizing.';

export async function backfillProductDetails(db, { dryRun = false, log = console.log } = {}) {
  const { rows: products } = await db.query(
    'select id, name, sku, model_info, model_height, model_size, fit_note, colors, color, size_stock from products order by created_at asc'
  );

  log(`[backfill-product-details] Read ${products.length} product(s).`);

  const summary = {
    read: products.length,
    fitNoteSet: 0,
    modelHeightSet: 0,
    modelSizeSet: 0,
    colorsSet: 0,
    unchanged: 0,
    sizeStockLeftEmpty: 0
  };

  for (const product of products) {
    const updates = [];
    const params = [];
    const changes = [];

    if (product.fit_note == null) {
      params.push(LEGACY_FIT_NOTE);
      updates.push(`fit_note = $${params.length}`);
      changes.push('fit_note');
      summary.fitNoteSet += 1;
    }

    const parsed = parseModelInfo(product.model_info);

    if (product.model_height == null && parsed.height) {
      params.push(parsed.height);
      updates.push(`model_height = $${params.length}`);
      changes.push('model_height');
      summary.modelHeightSet += 1;
    }

    if (product.model_size == null && parsed.size) {
      params.push(parsed.size);
      updates.push(`model_size = $${params.length}`);
      changes.push('model_size');
      summary.modelSizeSet += 1;
    }

    // `colors` is `not null default '[]'`, so an untouched product has an
    // empty array here rather than null.
    const existingColors = Array.isArray(product.colors) ? product.colors : [];
    if (existingColors.length === 0 && product.color) {
      params.push(JSON.stringify([{ name: product.color, hex: null }]));
      updates.push(`colors = $${params.length}::jsonb`);
      changes.push('colors');
      summary.colorsSet += 1;
    }

    const sizeStockKeys = product.size_stock ? Object.keys(product.size_stock) : [];
    if (sizeStockKeys.length === 0) {
      summary.sizeStockLeftEmpty += 1;
    }

    if (updates.length === 0) {
      summary.unchanged += 1;
      log(`  - ${product.name} (${product.sku}): already complete, nothing to write.`);
      continue;
    }

    if (dryRun) {
      log(`  - ${product.name} (${product.sku}): WOULD set ${changes.join(', ')}.`);
      continue;
    }

    params.push(product.id);
    await db.query(`update products set ${updates.join(', ')} where id = $${params.length}`, params);
    log(`  - ${product.name} (${product.sku}): set ${changes.join(', ')}.`);
  }

  const { rows: countRows } = await db.query('select count(*)::int as count from products');
  summary.finalProductCount = countRows[0].count;

  log(
    `[backfill-product-details] Done. Database contains ${summary.finalProductCount} product(s) ` +
      '(unchanged by this script -- it only updates existing rows).'
  );

  if (summary.sizeStockLeftEmpty > 0) {
    log(
      `[backfill-product-details] ${summary.sizeStockLeftEmpty} product(s) still have no per-size ` +
        'stock. They continue to use their product-level stock total, exactly as before. ' +
        'Set the real per-size numbers in Admin > Products > Edit > Size & Stock.'
    );
  }

  return summary;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('[backfill-product-details] DRY RUN -- no changes will be written.');
  }

  const summary = await backfillProductDetails({ query }, { dryRun });
  console.log('[backfill-product-details] Summary:', JSON.stringify(summary, null, 2));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('backfill-product-details.mjs')) {
  main()
    .then(() => closePg())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[backfill-product-details] Failed:', err.message);
      try {
        await closePg();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
