// Task 9 (task-9-brief.md): route-level tests for the three app/api/products
// route handlers, exercised as real functions against a PGlite-backed
// lib/db.js -- the same pattern test/api/auth.test.js established for
// Task 8.
//
// Per Ruling C3 (binding): response SHAPE and exact MESSAGE STRINGS are
// asserted against the golden files named in comments below. Whole-body
// equality against a golden is deliberately NOT done -- ids/timestamps
// legitimately differ between the Mongo-seeded goldens and this PGlite
// fixture data.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

import { GET as listRoute, POST as createRoute } from '../../app/api/products/route.js';
import { GET as getByIdRoute } from '../../app/api/products/[id]/route.js';

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

function postRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

let userCounter = 0;
async function insertUser(overrides = {}) {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, role, is_active, is_email_verified)
     values ($1, $2, $3, $4, true, true)
     returning *`,
    [
      overrides.firstName || 'Fixture',
      overrides.lastName || 'User',
      overrides.email || `products-fixture-${userCounter}@zahzanmigrationtest.com`,
      overrides.role || 'customer'
    ]
  );
  return rows[0];
}

function tokenFor(user) {
  return generateToken(user.id, user.role);
}

async function insertProduct(overrides = {}) {
  const sku = overrides.sku || `ZHZ-TEST-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, description, category, price, stock, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      overrides.name || 'Test Product',
      overrides.slug || `test-product-${sku.toLowerCase()}`,
      sku,
      overrides.description || '',
      overrides.category || 'Test Category',
      overrides.price ?? 1000,
      overrides.stock ?? 10,
      overrides.isActive ?? true
    ]
  );
  return rows[0];
}

describe('app/api/products/* route handlers (Task 9)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('GET /api/products', () => {
    it('only returns isActive products -- shape matches tools/golden/013-products.list.json', async () => {
      const active1 = await insertProduct({ name: 'Active Kurta', category: 'FilterKurtas' });
      const active2 = await insertProduct({ name: 'Active Shawl', category: 'FilterShawls' });
      await insertProduct({ name: 'Inactive Item', category: 'FilterKurtas', isActive: false });

      const res = await listRoute(getRequest('/api/products'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const ids = body.products.map((p) => p._id);
      expect(ids).toContain(active1.id);
      expect(ids).toContain(active2.id);
      expect(body.count).toBe(body.products.length);
      // Every returned product has both _id and id (Product emits both, GC2).
      for (const p of body.products) {
        expect(p._id).toBe(p.id);
      }
    });

    it('sorts by created_at desc', async () => {
      const older = await insertProduct({ name: 'Older Sort Item', category: 'SortCat' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await insertProduct({ name: 'Newer Sort Item', category: 'SortCat' });

      const res = await listRoute(getRequest('/api/products?category=SortCat'));
      const body = await res.json();
      const ids = body.products.map((p) => p._id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    });

    it('category filter is an ANCHORED exact match, not a substring match -- matches tools/golden/014-products.list-by-category.json', async () => {
      await insertProduct({ name: 'Anchored Kurta', category: 'AnchorKurtas' });
      await insertProduct({ name: 'Anchored Kurta Sub', category: 'AnchorKurtasExtra' });

      const res = await listRoute(getRequest('/api/products?category=AnchorKurtas'));
      const body = await res.json();
      const categories = body.products.map((p) => p.category);
      expect(categories).toContain('AnchorKurtas');
      expect(categories).not.toContain('AnchorKurtasExtra');
    });

    it('category filter is case-insensitive', async () => {
      await insertProduct({ name: 'Case Item', category: 'CaseSensitiveCat' });
      const res = await listRoute(getRequest('/api/products?category=casesensitivecat'));
      const body = await res.json();
      expect(body.count).toBeGreaterThan(0);
      expect(body.products.every((p) => p.category === 'CaseSensitiveCat')).toBe(true);
    });

    it('category=All is not applied as a filter', async () => {
      const res = await listRoute(getRequest('/api/products?category=All'));
      const body = await res.json();
      const allRes = await listRoute(getRequest('/api/products'));
      const allBody = await allRes.json();
      expect(body.count).toBe(allBody.count);
    });

    it('search is a three-field OR across name, description, category -- matches tools/golden/015-products.list-by-search.json', async () => {
      const byName = await insertProduct({ name: 'UniqueSearchTermInName', category: 'SearchCatA' });
      const byDescription = await insertProduct({
        name: 'Plain Item',
        description: 'contains UniqueSearchTermInName too',
        category: 'SearchCatB'
      });
      const byCategory = await insertProduct({ name: 'Other Item', category: 'UniqueSearchTermInName-Cat' });

      const res = await listRoute(getRequest('/api/products?search=UniqueSearchTermInName'));
      const body = await res.json();
      const ids = body.products.map((p) => p._id);
      expect(ids).toContain(byName.id);
      expect(ids).toContain(byDescription.id);
      expect(ids).toContain(byCategory.id);
    });
  });

  describe('GET /api/products/:id', () => {
    it('looks up by uuid -- matches tools/golden/016-products.get-by-id.json (both product and data keys)', async () => {
      const product = await insertProduct({ name: 'Lookup By Id', category: 'LookupCat' });
      const res = await getByIdRoute(getRequest(`/api/products/${product.id}`), paramsContext({ id: product.id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.product._id).toBe(product.id);
      expect(body.data).toEqual(body.product);
    });

    it('looks up by slug, lowercased -- matches tools/golden/017-products.get-by-slug.json', async () => {
      const product = await insertProduct({
        name: 'Lookup By Slug',
        slug: 'lookup-by-slug-fixture',
        category: 'LookupCat'
      });
      const res = await getByIdRoute(
        getRequest('/api/products/LOOKUP-BY-SLUG-FIXTURE'),
        paramsContext({ id: 'LOOKUP-BY-SLUG-FIXTURE' })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.product._id).toBe(product.id);
    });

    it('looks up by sku, uppercased -- matches tools/golden/018-products.get-by-sku.json', async () => {
      const product = await insertProduct({ name: 'Lookup By Sku', sku: 'ZHZ-LOOKUP-1', category: 'LookupCat' });
      const res = await getByIdRoute(
        getRequest('/api/products/zhz-lookup-1'),
        paramsContext({ id: 'zhz-lookup-1' })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.product._id).toBe(product.id);
    });

    it('a nonexistent id 404s with the exact message -- matches tools/golden/019-products.get-nonexistent.json', async () => {
      const res = await getByIdRoute(
        getRequest('/api/products/00000000-0000-0000-0000-000000000000'),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Product not found'
      });
    });

    it('a nonexistent slug/sku-shaped id also 404s with the exact message', async () => {
      const res = await getByIdRoute(
        getRequest('/api/products/does-not-exist-anywhere'),
        paramsContext({ id: 'does-not-exist-anywhere' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Product not found'
      });
    });
  });

  describe('POST /api/products (admin only)', () => {
    it('rejects with no token', async () => {
      const res = await createRoute(postRequest('/api/products', { name: 'X' }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Not authorized, no token provided'
      });
    });

    it('rejects a non-admin customer with the exact message', async () => {
      const customer = await insertUser({ role: 'customer' });
      const res = await createRoute(
        postRequest('/api/products', { name: 'X' }, { authorization: `Bearer ${tokenFor(customer)}` })
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Access denied: Admin authorization required'
      });
    });

    it('an admin can create a product; slug auto-generates from name+sku when no slug is given, sku uppercases (GC7)', async () => {
      const admin = await insertUser({ role: 'admin' });
      const res = await createRoute(
        postRequest(
          '/api/products',
          {
            name: 'Brand New Silk Scarf',
            sku: 'zhz-new-001',
            category: 'Scarves',
            price: 5000,
            stock: 8
          },
          { authorization: `Bearer ${tokenFor(admin)}` }
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.product.sku).toBe('ZHZ-NEW-001');
      expect(body.product.slug).toBe('brand-new-silk-scarf-zhz-new-001');
      expect(body.product._id).toBe(body.product.id);
      expect(body.product.isActive).toBe(true);
    });

    it("an explicitly-provided slug is kept verbatim (lowercased), not overwritten -- matches tools/golden/098-extra2.products-create.json", async () => {
      const admin = await insertUser({ role: 'admin' });
      const res = await createRoute(
        postRequest(
          '/api/products',
          {
            name: 'ZAHZAN Coverage Test Product',
            slug: 'zahzan-coverage-test-product',
            sku: 'zhz-cov-001b',
            category: 'Accessories',
            price: 3000,
            stock: 15
          },
          { authorization: `Bearer ${tokenFor(admin)}` }
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.product.slug).toBe('zahzan-coverage-test-product');
      expect(body.product.sku).toBe('ZHZ-COV-001B');
    });

    it('text[] array fields (images, sizes, careInstructions, gallery) round-trip through create and a subsequent read', async () => {
      const admin = await insertUser({ role: 'admin' });
      const createRes = await createRoute(
        postRequest(
          '/api/products',
          {
            name: 'Array Field Round Trip Product',
            sku: 'zhz-arr-001',
            category: 'ArrayFieldCat',
            price: 4200,
            stock: 3,
            images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
            sizes: ['S', 'M', 'L'],
            careInstructions: ['Dry clean only', 'Do not bleach'],
            gallery: ['https://example.com/gallery1.jpg', 'https://example.com/gallery2.jpg', 'https://example.com/gallery3.jpg']
          },
          { authorization: `Bearer ${tokenFor(admin)}` }
        )
      );
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      expect(createBody.product.images).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
      expect(createBody.product.sizes).toEqual(['S', 'M', 'L']);
      expect(createBody.product.careInstructions).toEqual(['Dry clean only', 'Do not bleach']);
      expect(createBody.product.gallery).toEqual([
        'https://example.com/gallery1.jpg',
        'https://example.com/gallery2.jpg',
        'https://example.com/gallery3.jpg'
      ]);

      const getRes = await getByIdRoute(
        getRequest(`/api/products/${createBody.product._id}`),
        paramsContext({ id: createBody.product._id })
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.product.images).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
      expect(getBody.product.sizes).toEqual(['S', 'M', 'L']);
      expect(getBody.product.careInstructions).toEqual(['Dry clean only', 'Do not bleach']);
      expect(getBody.product.gallery).toEqual([
        'https://example.com/gallery1.jpg',
        'https://example.com/gallery2.jpg',
        'https://example.com/gallery3.jpg'
      ]);
    });

    it('a missing required field fails with a 400 and the "Failed to create product:" prefix', async () => {
      const admin = await insertUser({ role: 'admin' });
      const res = await createRoute(
        postRequest('/api/products', { category: 'NoName' }, { authorization: `Bearer ${tokenFor(admin)}` })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toMatch(/^Failed to create product:/);
    });

    // Implicit `trim: true` parity (fix-implicit-trim-report.md): Mongoose
    // stripped leading/trailing whitespace off every one of these fields on
    // assignment, even though the old controller never called .trim() on
    // them itself. Submitting padded whitespace and asserting the STORED row
    // (queried directly, not just the response) is trimmed proves the write
    // boundary now reproduces that schema-level cast.
    it('trims leading/trailing whitespace off every implicitly-trimmed field, matching the old Mongoose schema cast', async () => {
      const admin = await insertUser({ role: 'admin' });
      const res = await createRoute(
        postRequest(
          '/api/products',
          {
            name: '  Whitespace Silk Kurta  ',
            description: '  A lovely padded description.  ',
            quickDescription: '  Quick padded desc  ',
            category: '  PaddedCat  ',
            badge: '  New  ',
            image: '  https://example.com/main.jpg  ',
            hoverImage: '  https://example.com/hover.jpg  ',
            color: '  Ivory  ',
            fabric: '  Pure Silk  ',
            work: '  Hand Embroidery  ',
            modelInfo: '  Model wears size M  ',
            images: ['  https://example.com/a.jpg  ', ' https://example.com/b.jpg '],
            sizes: ['  S  ', ' M '],
            careInstructions: ['  Dry clean only  '],
            gallery: ['  https://example.com/g1.jpg  '],
            colors: [{ name: '  Ivory  ', hex: ' #FFFFFF ', image: ' https://example.com/c1.jpg ' }],
            breakdown: { shirt: '  Silk  ', trouser: ' Cotton ', dupatta: ' Chiffon ' },
            sku: 'zhz-trim-001',
            price: 5000,
            stock: 5
          },
          { authorization: `Bearer ${tokenFor(admin)}` }
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);

      const { rows } = await query('select * from products where id = $1', [body.product._id]);
      const stored = rows[0];
      expect(stored.name).toBe('Whitespace Silk Kurta');
      expect(stored.description).toBe('A lovely padded description.');
      expect(stored.quick_description).toBe('Quick padded desc');
      expect(stored.category).toBe('PaddedCat');
      expect(stored.badge).toBe('New');
      expect(stored.image).toBe('https://example.com/main.jpg');
      expect(stored.hover_image).toBe('https://example.com/hover.jpg');
      expect(stored.color).toBe('Ivory');
      expect(stored.fabric).toBe('Pure Silk');
      expect(stored.work).toBe('Hand Embroidery');
      expect(stored.model_info).toBe('Model wears size M');
      expect(stored.images).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
      expect(stored.sizes).toEqual(['S', 'M']);
      expect(stored.care_instructions).toEqual(['Dry clean only']);
      expect(stored.gallery).toEqual(['https://example.com/g1.jpg']);
      expect(stored.colors).toEqual([{ name: 'Ivory', hex: '#FFFFFF', image: 'https://example.com/c1.jpg' }]);
      expect(stored.breakdown).toEqual({ shirt: 'Silk', trouser: 'Cotton', dupatta: 'Chiffon' });

      // Negative: price/stock (not string fields the schema trims) round-trip
      // completely unaffected.
      expect(Number(stored.price)).toBe(5000);
      expect(stored.stock).toBe(5);
    });
  });
});
