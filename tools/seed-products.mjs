#!/usr/bin/env node
// tools/seed-products.mjs
//
// Postgres equivalent of server/scripts/seedProducts.js (task-14-brief.md).
// Same data, same behaviour: wipes the `products` table and reseeds it
// with the exact same 6 literal ZAHZAN products the Mongo script seeds,
// verifying the table ends up with exactly 6 rows. Intended for fresh/dev
// environments -- NOT for the user's real catalogue (use
// tools/migrate-products.mjs for that).
//
// Field mapping matches tools/migrate-products.mjs / Task 3's schema:
// images/sizes/careInstructions/gallery -> text[], colors/breakdown ->
// jsonb. GC7: sku is uppercased on write (Mongoose applied `uppercase:
// true` automatically in the old stack; Postgres does not) -- the literal
// SKUs below are already uppercase, but the write path still applies
// .toUpperCase() explicitly so this stays correct if the list is ever
// edited.
//
// Usage:
//   node tools/seed-products.mjs
//
// Env vars:
//   SUPABASE_DB_URL -- target Postgres connection string (read by
//     lib/db.js's `pg` driver; required unless ZAHZAN_DB_DRIVER=pglite).

import 'dotenv/config';
import { query, close as closePg } from '../lib/db.js';

// Verbatim copy of server/scripts/seedProducts.js's seedProductsList --
// same 6 products, same field values (GC4: no refactors, no additions).
const seedProductsList = [
  {
    name: 'Ivory Bloom',
    slug: 'ivory-bloom',
    sku: 'ZAH-IVORY-001',
    price: 18900,
    category: 'Lawn',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ],
    hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
    badge: 'NEW',
    sizes: ['S', 'M', 'L'],
    description: 'Fine cotton lawn with sculptural drape.',
    quickDescription: 'A refined embroidered lawn three-piece featuring a delicately worked shirt, tailored cotton trouser, and sheer organza dupatta.',
    stock: 8,
    fabric: 'Fine Cotton Lawn',
    color: 'Warm Ivory',
    work: 'Tonal Needlework',
    breakdown: {
      shirt: 'Fine cotton lawn shirt with embroidered neckline and sleeve borders',
      trouser: 'Tailored solid cotton trouser',
      dupatta: 'Sheer organza dupatta with embroidered scalloped borders'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: S",
    careInstructions: [
      'Professional dry clean recommended for first wear',
      'Gentle cold hand wash separately with neutral detergent',
      'Dry in shade to preserve color brilliance',
      'Medium iron on reverse side'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ],
    isActive: true
  },
  {
    name: 'Noor',
    slug: 'noor',
    sku: 'ZAH-NOOR-002',
    price: 21400,
    category: 'Ready to Wear',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ],
    hoverImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
    badge: 'LIMITED',
    sizes: ['XS', 'S', 'M'],
    description: 'Tailored silhouette with refined detailing.',
    quickDescription: 'An architectural raw silk pret suit embellished with hand-guided metallic zari thread along the placket and side slits.',
    stock: 3,
    fabric: 'Raw Silk Blend',
    color: 'Midnight Charcoal',
    work: 'Antique Zari Stitching',
    breakdown: {
      shirt: 'Structured raw silk straight kameez with zari embroidered placket',
      trouser: 'Matching raw silk straight-cut trouser',
      dupatta: 'Fluid organza dupatta with woven gold borders'
    },
    modelInfo: "Model Height: 5'7\" | Model wears: XS",
    careInstructions: [
      'Dry clean only',
      'Do not steam metal zari directly',
      'Store hanging in cotton garment bag',
      'Warm iron with press cloth'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ],
    isActive: true
  },
  {
    name: 'Mehr',
    slug: 'mehr',
    sku: 'ZAH-MEHR-003',
    price: 23900,
    category: 'Unstitched',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85'
    ],
    hoverImage: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
    badge: 'NEW',
    sizes: ['M', 'L', 'XL'],
    description: 'Soft handloom finish for elevated evenings.',
    quickDescription: 'An unstitched handloom cotton silk 3-piece featuring dense chikankari-inspired needlework and an embroidered chiffon dupatta.',
    stock: 12,
    fabric: 'Handloom Cotton Silk',
    color: 'Dusty Rose',
    work: 'Chikankari Embroidery',
    breakdown: {
      shirt: '3.25m unstitched cotton silk shirt fabric with heavy embroidered front panel',
      trouser: '2.5m unstitched solid cotton silk trouser fabric',
      dupatta: '2.75m embroidered chiffon dupatta'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: M",
    careInstructions: [
      'Dry clean recommended',
      'Cold water soak prior to stitching',
      'Do not scrub embroidered areas',
      'Warm iron'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85'
    ],
    isActive: true
  },
  {
    name: 'Aster',
    slug: 'aster',
    sku: 'ZAH-ASTER-004',
    price: 16900,
    originalPrice: 21500,
    category: 'Luxury Pret',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ],
    hoverImage: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
    badge: 'SALE',
    sizes: ['S', 'M', 'L'],
    description: 'Structured elegance with pearl accents.',
    quickDescription: 'A modern structured linen viscose pret shirt adorned with hand-stitched freshwater pearl clusters along the sleeve line.',
    stock: 5,
    fabric: 'Linen Viscose Blend',
    color: 'Soft Sage',
    work: 'Pearl Embellishment',
    breakdown: {
      shirt: 'Linen viscose shirt with pearl work collar and asymmetric hem',
      trouser: 'Tailored cigarette trouser',
      dupatta: 'Silk organza drape dupatta'
    },
    modelInfo: "Model Height: 5'9\" | Model wears: S",
    careInstructions: [
      'Dry clean only to protect pearl embellishments',
      'Do not wring or twist',
      'Store hanging',
      'Steam iron from inside out'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ],
    isActive: true
  },
  {
    name: 'Zariya',
    slug: 'zariya',
    sku: 'ZAH-ZARIYA-005',
    price: 25600,
    category: 'Formal',
    image: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
    ],
    hoverImage: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
    badge: 'NEW',
    sizes: ['S', 'M', 'L'],
    description: 'Fluid silhouette made for evening occasions.',
    quickDescription: 'A 12-panel flared kalidar in pure chiffon highlighted by handcrafted mirrorwork and delicate tilla borders.',
    stock: 6,
    fabric: 'Pure Chiffon & Satin',
    color: 'Blush Emerald',
    work: 'Hand Mirrorwork & Tilla',
    breakdown: {
      shirt: 'Pure chiffon 12-panel flared shirt with mirrorwork neckline and silk satin lining',
      trouser: 'Silk satin lined trouser',
      dupatta: 'Heavy embroidered chiffon dupatta'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: S",
    careInstructions: [
      'Dry clean only',
      'Handle mirrorwork with care',
      'Store in dry cotton wrap',
      'Cool iron on reverse side'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
    ],
    isActive: true
  },
  {
    name: 'Elara',
    slug: 'elara',
    sku: 'ZAH-ELARA-006',
    price: 22100,
    category: 'Accessories',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ],
    hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
    badge: 'BEST SELLER',
    sizes: ['One Size'],
    description: 'A refined statement layer for tailored looks.',
    quickDescription: 'An iconic 100% pure mulberry silk handwoven statement shawl accompanied by a bespoke antiqued brass brooch.',
    stock: 9,
    fabric: 'Pure Mulberry Silk',
    color: 'Royal Amber',
    work: 'Handloom Fringe & Hardware',
    breakdown: {
      shirt: '2.8m x 1.1m handwoven pure silk shawl with hand-twisted fringes',
      trouser: 'Custom antiqued brass brooch hardware included',
      dupatta: 'Arrives in ZAHZAN wooden presentation box'
    },
    modelInfo: "Model Height: 5'8\" | Universal One-Size Layer",
    careInstructions: [
      'Dry clean only',
      'Do not bleach or spot clean with water',
      'Store folded with cedar chips',
      'Low steam iron'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ],
    isActive: true
  }
];

export async function seedProducts(db) {
  console.log('[seed-products] Clearing existing product catalog...');
  await db.query('delete from products');

  console.log('[seed-products] Seeding exactly 6 real ZAHZAN products...');
  const inserted = [];
  for (const p of seedProductsList) {
    const { rows } = await db.query(
      `insert into products (
         name, slug, sku, description, quick_description, price, original_price,
         category, badge, images, image, hover_image, colors, color, sizes,
         fabric, work, breakdown, model_info, care_instructions, gallery, stock,
         is_active
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       ) returning *`,
      [
        p.name,
        p.slug,
        // GC7: uppercase sku on write (Mongoose applied this automatically).
        String(p.sku).trim().toUpperCase(),
        p.description ?? '',
        p.quickDescription ?? '',
        p.price,
        p.originalPrice ?? null,
        p.category,
        p.badge ?? null,
        p.images ?? [],
        p.image ?? null,
        p.hoverImage ?? null,
        JSON.stringify([]),
        p.color ?? null,
        p.sizes ?? [],
        p.fabric ?? null,
        p.work ?? null,
        p.breakdown ? JSON.stringify(p.breakdown) : null,
        p.modelInfo ?? null,
        p.careInstructions ?? [],
        p.gallery ?? [],
        p.stock ?? 0,
        p.isActive ?? true
      ]
    );
    inserted.push(rows[0]);
  }

  const { rows: countRows } = await db.query('select count(*)::int as count from products');
  const count = countRows[0].count;
  console.log(`[seed-products] Successfully seeded dataset. Database now contains EXACTLY ${count} products.`);

  if (count !== 6) {
    throw new Error(`Expected 6 products but found ${count}`);
  }

  inserted.forEach((prod, index) => {
    console.log(` Product ${index + 1}: ${prod.name} | ID: ${prod.id} | SKU: ${prod.sku} | Price: PKR ${prod.price}`);
  });

  return { read: seedProductsList.length, inserted: inserted.length, updated: 0, skipped: 0 };
}

async function main() {
  const summary = await seedProducts({ query });
  console.log('[seed-products] Summary:', JSON.stringify(summary, null, 2));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('seed-products.mjs')) {
  main()
    .then(() => closePg())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[seed-products] Failed to seed products:', err.message);
      try {
        await closePg();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
