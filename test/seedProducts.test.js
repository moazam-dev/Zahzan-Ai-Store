// tools/seed-products.mjs and tools/backfill-product-details.mjs, exercised
// against a real (PGlite) database with the real migrations applied.
//
// Both scripts touch the catalogue, so the assertions that matter most are the
// ones about COUNT: seeding must land exactly 6 products and never 6-old-plus-
// 6-new, and the backfill must not change the count at all (spec sec23/sec25).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { seedProducts } from '../tools/seed-products.mjs';
import { backfillProductDetails } from '../tools/backfill-product-details.mjs';

const LEGACY_FIT_NOTE = 'Relaxed fluid fit tailored for standard Pakistani sizing.';

// The scripts log progress; silence it so test output stays readable.
const quiet = () => {};

describe('tools/seed-products.mjs', () => {
  let db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db.reset();
  });

  it('seeds exactly 6 products, and re-running still leaves exactly 6', async () => {
    const first = await seedProducts(db);
    expect(first.inserted).toBe(6);

    const { rows: afterFirst } = await db.query('select count(*)::int as count from products');
    expect(afterFirst[0].count).toBe(6);

    // The script clears the table first, so a second run must not accumulate.
    await seedProducts(db);
    const { rows: afterSecond } = await db.query('select count(*)::int as count from products');
    expect(afterSecond[0].count).toBe(6);
  });

  it('populates the 0004 detail columns from each product\'s own data', async () => {
    await seedProducts(db);

    const { rows } = await db.query(
      'select name, model_info, model_height, model_size, fit_note, colors, color, size_stock from products order by name'
    );
    expect(rows).toHaveLength(6);

    for (const row of rows) {
      // Parsed out of that product's own model_info line, not invented. Every
      // seed product states a height, so every row gets one.
      expect(row.model_height, row.name).toBeTruthy();
      expect(row.model_info, row.name).toContain(row.model_height);

      // The size is only filled in when the line actually names one. Elara's
      // reads "Model Height: 5'8\" | Universal One-Size Layer" -- there is no
      // size to read, so model_size stays null rather than being guessed.
      if (/model\s*wears/i.test(row.model_info)) {
        expect(row.model_size, row.name).toBeTruthy();
      } else {
        expect(row.model_size, row.name).toBeNull();
      }

      // The sentence the product page used to hardcode for every product.
      expect(row.fit_note, row.name).toBe(LEGACY_FIT_NOTE);

      // One colour, named from the product's existing `color`, with no
      // invented hex.
      expect(row.colors, row.name).toEqual([{ name: row.color, hex: null }]);

      // Deliberately empty: the seed data does not say how each product's
      // stock splits across its sizes, so no split is fabricated.
      expect(row.size_stock, row.name).toEqual({});
    }
  });
});

describe('tools/backfill-product-details.mjs', () => {
  let db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db.reset();
  });

  /** A product as it looked BEFORE 0004 -- new columns all at their defaults. */
  async function insertLegacyProduct(overrides = {}) {
    const sku = overrides.sku || `ZHZ-LEGACY-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await db.query(
      `insert into products (name, slug, sku, category, price, stock, sizes, color, model_info)
       values ($1, $2, $3, 'Lawn', 1000, 8, '{"S","M","L"}', $4, $5)
       returning *`,
      [
        overrides.name || 'Legacy Product',
        overrides.slug || `legacy-${sku.toLowerCase()}`,
        sku,
        overrides.color ?? 'Warm Ivory',
        overrides.modelInfo ?? `Model Height: 5'8" | Model wears: Size S`
      ]
    );
    return rows[0];
  }

  it('fills the new columns from each product\'s own data without changing the count', async () => {
    await insertLegacyProduct();
    await insertLegacyProduct({ name: 'Second' });

    const summary = await backfillProductDetails(db, { log: quiet });

    expect(summary.read).toBe(2);
    expect(summary.finalProductCount).toBe(2);
    expect(summary.fitNoteSet).toBe(2);
    expect(summary.modelHeightSet).toBe(2);
    expect(summary.modelSizeSet).toBe(2);
    expect(summary.colorsSet).toBe(2);

    const { rows } = await db.query(
      'select model_height, model_size, fit_note, colors, size_stock from products'
    );
    for (const row of rows) {
      expect(row.model_height).toBe(`5'8"`);
      expect(row.model_size).toBe('S');
      expect(row.fit_note).toBe(LEGACY_FIT_NOTE);
      expect(row.colors).toEqual([{ name: 'Warm Ivory', hex: null }]);
      // Never fabricated -- see the script's header comment.
      expect(row.size_stock).toEqual({});
    }
  });

  it('is idempotent -- a second run writes nothing', async () => {
    await insertLegacyProduct();
    await backfillProductDetails(db, { log: quiet });

    const second = await backfillProductDetails(db, { log: quiet });
    expect(second.unchanged).toBe(1);
    expect(second.fitNoteSet).toBe(0);
    expect(second.colorsSet).toBe(0);
    expect(second.finalProductCount).toBe(1);
  });

  it('never overwrites a value an admin has already set', async () => {
    const product = await insertLegacyProduct();
    await db.query(
      `update products set fit_note = 'Admin wrote this.', model_height = '6ft',
         colors = '[{"name":"Sand","hex":"#C2B280"}]'::jsonb
       where id = $1`,
      [product.id]
    );

    await backfillProductDetails(db, { log: quiet });

    const { rows } = await db.query(
      'select fit_note, model_height, model_size, colors from products where id = $1',
      [product.id]
    );
    expect(rows[0].fit_note).toBe('Admin wrote this.');
    expect(rows[0].model_height).toBe('6ft');
    expect(rows[0].colors).toEqual([{ name: 'Sand', hex: '#C2B280' }]);
    // model_size was still null, so it IS filled in -- the script works
    // field by field, not row by row.
    expect(rows[0].model_size).toBe('S');
  });

  it('leaves a value null rather than guessing when it cannot parse one', async () => {
    await insertLegacyProduct({ modelInfo: 'She is quite tall, honestly' });

    await backfillProductDetails(db, { log: quiet });

    const { rows } = await db.query('select model_height, model_size, fit_note from products');
    expect(rows[0].model_height).toBeNull();
    expect(rows[0].model_size).toBeNull();
    // fit_note is still set: it does not depend on parsing anything.
    expect(rows[0].fit_note).toBe(LEGACY_FIT_NOTE);
  });

  it('--dry-run reports without writing', async () => {
    await insertLegacyProduct();

    const summary = await backfillProductDetails(db, { dryRun: true, log: quiet });
    expect(summary.fitNoteSet).toBe(1);

    const { rows } = await db.query('select fit_note, model_height from products');
    expect(rows[0].fit_note).toBeNull();
    expect(rows[0].model_height).toBeNull();
  });
});
