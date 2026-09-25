// Product Management Expansion (2026-08-20):
// docs/superpowers/specs/2026-08-20-product-management-expansion-design.md
//
// Route-level tests for the expanded product record -- per-size inventory,
// colours, product/model details -- exercised as real route handler functions
// against a PGlite-backed lib/db.js, the same pattern
// test/api/products.test.js and test/api/orders.test.js established.
//
// The behaviour that matters most here is inventory: a size-tracked product
// must never sell more of a size than it has, must decrement the size it
// actually sold, and must put the units back on that same size when the order
// is cancelled. Those three are covered end to end through the real
// create_order()/cancel_order() functions, not through mocked SQL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

import { POST as adminCreateProduct } from '../../app/api/admin/products/route.js';
import { PUT as adminUpdateProduct } from '../../app/api/admin/products/[id]/route.js';
import { GET as getProductById } from '../../app/api/products/[id]/route.js';
import { POST as createOrderRoute } from '../../app/api/orders/route.js';
import { PATCH as cancelOrderRoute } from '../../app/api/orders/[id]/cancel/route.js';
import { POST as addCartItem } from '../../app/api/cart/items/route.js';

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

function jsonRequest(path, method, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function patchRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'PATCH', headers });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

let userCounter = 0;
async function insertUser(overrides = {}) {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, phone, role, is_active, is_email_verified)
     values ($1, $2, $3, $4, $5, true, true)
     returning *`,
    [
      overrides.firstName || 'Detail',
      overrides.lastName || 'Tester',
      overrides.email || `product-details-${userCounter}@zahzanmigrationtest.com`,
      overrides.phone || '03001234567',
      overrides.role || 'customer'
    ]
  );
  return rows[0];
}

function authHeader(user) {
  return { authorization: `Bearer ${generateToken(user.id, user.role)}` };
}

async function insertAdmin() {
  return insertUser({ role: 'admin', firstName: 'Admin' });
}

let skuCounter = 0;
function uniqueSku() {
  skuCounter += 1;
  return `ZHZ-PDX-${skuCounter}`;
}

/** Inserts a size-tracked product directly, bypassing the routes. */
async function insertSizeTrackedProduct(sizeStock, overrides = {}) {
  const sku = overrides.sku || uniqueSku();
  const total = Object.values(sizeStock).reduce((a, b) => a + b, 0);
  const { rows } = await query(
    `insert into products (name, slug, sku, category, price, stock, size_stock, sizes, is_active, images, color)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, true, $9, $10)
     returning *`,
    [
      overrides.name || 'Size Tracked Kurta',
      overrides.slug || `size-tracked-${sku.toLowerCase()}`,
      sku,
      overrides.category || 'Lawn',
      overrides.price ?? 5000,
      overrides.stock ?? total,
      JSON.stringify(sizeStock),
      Object.keys(sizeStock),
      overrides.images || ['https://example.test/a.jpg'],
      overrides.color ?? 'Olive Green'
    ]
  );
  return rows[0];
}

async function reloadProduct(id) {
  const { rows } = await query('select * from products where id = $1', [id]);
  return rows[0];
}

const validShippingAddress = {
  fullName: 'Sara Malik',
  phone: '03007654321',
  addressLine1: '123 Gulberg Boulevard',
  city: 'Lahore',
  state: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan'
};

const validCustomerInfo = {
  fullName: 'Sara Malik',
  email: 'sara@zahzanmigrationtest.com',
  phone: '03007654321'
};

/** Places a Buy Now COD order for one product/size/quantity. */
async function buyNow(user, product, { size, quantity }) {
  return createOrderRoute(
    jsonRequest(
      '/api/orders',
      'POST',
      {
        customerInfo: validCustomerInfo,
        shippingAddress: validShippingAddress,
        isBuyNow: true,
        paymentChoice: 'cod',
        buyNowItem: {
          productId: product.id,
          quantity,
          selectedSize: size,
          selectedColor: 'Olive Green'
        }
      },
      authHeader(user)
    )
  );
}

describe('Product Management Expansion -- per-size inventory and product details', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  // -------------------------------------------------------------------------
  // Admin create
  // -------------------------------------------------------------------------

  describe('POST /api/admin/products', () => {
    it('stores every expanded field and returns them through the product API', async () => {
      const admin = await insertAdmin();
      const sku = uniqueSku();

      const res = await adminCreateProduct(
        jsonRequest(
          '/api/admin/products',
          'POST',
          {
            name: 'Olive Grove',
            sku,
            category: 'Lawn',
            price: 18900,
            originalPrice: 22900,
            badge: 'NEW',
            description: 'Full description.',
            quickDescription: 'Short description.',
            fabric: 'Pure Lawn',
            work: 'Tonal Needlework',
            colors: [
              { name: 'Olive Green', hex: '#556B2F' },
              { name: 'Sand', hex: null }
            ],
            sizeStock: { S: 10, M: 15, L: 8 },
            breakdown: {
              shirt: 'Embroidered lawn shirt.',
              trouser: 'Cambric trouser.',
              dupatta: 'Organza dupatta.'
            },
            modelHeight: `5'8"`,
            modelSize: 'S',
            fitNote: 'Relaxed fluid fit.',
            careInstructions: ['Dry clean recommended', 'Iron on reverse'],
            images: ['https://example.test/1.jpg', 'https://example.test/2.jpg']
          },
          authHeader(admin)
        )
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);

      const product = body.product;
      expect(product.fabric).toBe('Pure Lawn');
      expect(product.work).toBe('Tonal Needlework');
      expect(product.sizeStock).toEqual({ S: 10, M: 15, L: 8 });
      // The size list is derived from the size-stock keys so the selector can
      // never offer a size with no inventory row.
      expect(product.sizes).toEqual(['S', 'M', 'L']);
      // The product-level total is the sum, keeping every consumer that still
      // reads `stock` correct.
      expect(product.stock).toBe(33);
      expect(product.colors).toEqual([
        { name: 'Olive Green', hex: '#556B2F' },
        { name: 'Sand', hex: null }
      ]);
      expect(product.breakdown).toEqual({
        shirt: 'Embroidered lawn shirt.',
        trouser: 'Cambric trouser.',
        dupatta: 'Organza dupatta.'
      });
      expect(product.modelHeight).toBe(`5'8"`);
      expect(product.modelSize).toBe('S');
      // model_info is composed server-side, so the frozen product page's
      // SIZE & FIT row renders exactly the line it always rendered.
      expect(product.modelInfo).toBe(`Model Height: 5'8" | Model wears: S`);
      expect(product.fitNote).toBe('Relaxed fluid fit.');
      expect(product.careInstructions).toEqual(['Dry clean recommended', 'Iron on reverse']);
      expect(product.originalPrice).toBe(22900);
      expect(product.badge).toBe('NEW');
      expect(product.quickDescription).toBe('Short description.');

      // The public product endpoint the frozen page actually calls returns
      // the same values.
      const publicRes = await getProductById(
        getRequest(`/api/products/${product.id}`),
        paramsContext({ id: product.id })
      );
      expect(publicRes.status).toBe(200);
      const publicBody = await publicRes.json();
      expect(publicBody.product.sizeStock).toEqual({ S: 10, M: 15, L: 8 });
      expect(publicBody.product.fabric).toBe('Pure Lawn');
      expect(publicBody.product.fitNote).toBe('Relaxed fluid fit.');
    });

    it('no longer invents a fabric, work, colour, care instruction or stock photo', async () => {
      const admin = await insertAdmin();

      const res = await adminCreateProduct(
        jsonRequest(
          '/api/admin/products',
          'POST',
          { name: 'Bare Minimum', sku: uniqueSku(), category: 'Lawn', price: 100, stock: 5 },
          authHeader(admin)
        )
      );

      expect(res.status).toBe(201);
      const { product } = await res.json();

      // Absent, not fabricated. serializeProduct omits null columns entirely.
      expect(product.fabric).toBeUndefined();
      expect(product.work).toBeUndefined();
      expect(product.color).toBeUndefined();
      expect(product.colors).toEqual([]);
      expect(product.careInstructions).toEqual([]);
      expect(product.images).toEqual([]);
      expect(product.image).toBeUndefined();
    });

    it('accepts a size-tracked product without an explicit stock', async () => {
      const admin = await insertAdmin();

      const res = await adminCreateProduct(
        jsonRequest(
          '/api/admin/products',
          'POST',
          {
            name: 'No Explicit Stock',
            sku: uniqueSku(),
            category: 'Lawn',
            price: 100,
            sizeStock: { S: 2, M: 3 }
          },
          authHeader(admin)
        )
      );

      expect(res.status).toBe(201);
      const { product } = await res.json();
      expect(product.stock).toBe(5);
    });

    describe('validation (spec sec21 -- never trust the frontend)', () => {
      const cases = [
        {
          label: 'a negative price',
          patch: { price: -1 },
          message: 'Price must be a number of 0 or more.'
        },
        {
          label: 'a non-numeric price',
          patch: { price: 'free' },
          message: 'Price must be a number of 0 or more.'
        },
        {
          label: 'a negative compare-at price',
          patch: { originalPrice: -5 },
          message: 'Compare-at price must be a number of 0 or more.'
        },
        {
          label: 'a negative stock',
          patch: { stock: -3 },
          message: 'Stock must be a whole number of 0 or more.'
        },
        {
          label: 'a fractional stock',
          patch: { stock: 2.5 },
          message: 'Stock must be a whole number of 0 or more.'
        },
        {
          label: 'a negative size stock',
          patch: { sizeStock: { M: -1 } },
          message: 'Stock for size "M" must be a whole number of 0 or more.'
        },
        {
          label: 'a non-numeric size stock',
          patch: { sizeStock: { M: 'lots' } },
          message: 'Stock for size "M" must be a whole number of 0 or more.'
        },
        {
          label: 'a duplicated size',
          patch: { sizeStock: [{ size: 'M', stock: 1 }, { size: 'M', stock: 2 }] },
          message: 'Size "M" is listed more than once in size stock.'
        },
        {
          label: 'a size stock row with no size',
          patch: { sizeStock: [{ size: '', stock: 4 }] },
          message: 'Size stock entries must have a size.'
        },
        {
          label: 'a colour with no name',
          patch: { colors: [{ name: '   ', hex: '#FFF' }] },
          message: 'Each color must have a name.'
        },
        {
          label: 'a colour with a nonsense hex',
          patch: { colors: [{ name: 'Sand', hex: 'beige' }] },
          message: 'Color "Sand" has an invalid hex value. Use a form like #556B2F.'
        }
      ];

      for (const { label, patch, message } of cases) {
        it(`rejects ${label}`, async () => {
          const admin = await insertAdmin();
          const res = await adminCreateProduct(
            jsonRequest(
              '/api/admin/products',
              'POST',
              {
                name: 'Validation Case',
                sku: uniqueSku(),
                category: 'Lawn',
                price: 100,
                stock: 1,
                ...patch
              },
              authHeader(admin)
            )
          );

          expect(res.status).toBe(400);
          const body = await res.json();
          expect(body.message).toBe(message);
        });
      }

      it('rejects a size stock value that bypasses the API and hits the column directly', async () => {
        // The CHECK constraint from 0004 is the last line of defence, so it is
        // asserted independently of the route's own validation.
        await expect(
          query(
            `insert into products (name, slug, sku, category, price, size_stock)
             values ('Direct', 'direct-bad-size-stock', 'ZHZ-DIRECT-1', 'Lawn', 1, '{"M":-4}'::jsonb)`
          )
        ).rejects.toThrow();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Admin update
  // -------------------------------------------------------------------------

  describe('PUT /api/admin/products/:id', () => {
    it('edits every expanded field, and the customer API reflects it immediately', async () => {
      const admin = await insertAdmin();
      const product = await insertSizeTrackedProduct({ S: 4, M: 4 });

      const res = await adminUpdateProduct(
        jsonRequest(
          `/api/admin/products/${product.id}`,
          'PUT',
          {
            fabric: 'Khaddar',
            work: 'Block Print',
            colors: [{ name: 'Ivory', hex: '#FFFFF0' }],
            sizeStock: { S: 1, M: 2, L: 3 },
            breakdown: { shirt: 'New shirt.', trouser: 'New trouser.', dupatta: 'New dupatta.' },
            modelHeight: `5'6"`,
            modelSize: 'M',
            fitNote: 'Straight fit.',
            careInstructions: ['Hand wash cold'],
            quickDescription: 'Updated short copy.',
            badge: 'RESTOCK',
            originalPrice: 9999
          },
          authHeader(admin)
        ),
        paramsContext({ id: product.id })
      );

      expect(res.status).toBe(200);
      const { product: updated } = await res.json();

      expect(updated.fabric).toBe('Khaddar');
      expect(updated.work).toBe('Block Print');
      expect(updated.colors).toEqual([{ name: 'Ivory', hex: '#FFFFF0' }]);
      expect(updated.sizeStock).toEqual({ S: 1, M: 2, L: 3 });
      expect(updated.sizes).toEqual(['S', 'M', 'L']);
      expect(updated.stock).toBe(6);
      expect(updated.breakdown).toEqual({
        shirt: 'New shirt.',
        trouser: 'New trouser.',
        dupatta: 'New dupatta.'
      });
      expect(updated.modelInfo).toBe(`Model Height: 5'6" | Model wears: M`);
      expect(updated.fitNote).toBe('Straight fit.');
      expect(updated.careInstructions).toEqual(['Hand wash cold']);
      expect(updated.quickDescription).toBe('Updated short copy.');
      expect(updated.badge).toBe('RESTOCK');
      expect(updated.originalPrice).toBe(9999);

      // No frontend change is needed for updated product information to show.
      const publicRes = await getProductById(
        getRequest(`/api/products/${product.id}`),
        paramsContext({ id: product.id })
      );
      const publicBody = await publicRes.json();
      expect(publicBody.product.fabric).toBe('Khaddar');
      expect(publicBody.product.sizeStock).toEqual({ S: 1, M: 2, L: 3 });
    });

    it('recomposes the model line when only the height is edited', async () => {
      const admin = await insertAdmin();
      const product = await insertSizeTrackedProduct({ M: 1 });

      await adminUpdateProduct(
        jsonRequest(
          `/api/admin/products/${product.id}`,
          'PUT',
          { modelHeight: `5'4"`, modelSize: 'S' },
          authHeader(admin)
        ),
        paramsContext({ id: product.id })
      );

      const res = await adminUpdateProduct(
        jsonRequest(`/api/admin/products/${product.id}`, 'PUT', { modelHeight: `5'9"` }, authHeader(admin)),
        paramsContext({ id: product.id })
      );

      const { product: updated } = await res.json();
      expect(updated.modelInfo).toBe(`Model Height: 5'9" | Model wears: S`);
    });

    it('turns size tracking back off when an empty size stock is supplied', async () => {
      const admin = await insertAdmin();
      const product = await insertSizeTrackedProduct({ S: 3, M: 3 });

      const res = await adminUpdateProduct(
        jsonRequest(
          `/api/admin/products/${product.id}`,
          'PUT',
          { sizeStock: {}, stock: 12, sizes: ['S', 'M'] },
          authHeader(admin)
        ),
        paramsContext({ id: product.id })
      );

      const { product: updated } = await res.json();
      expect(updated.sizeStock).toEqual({});
      expect(updated.stock).toBe(12);
    });

    it('leaves an unmentioned price alone rather than re-validating it', async () => {
      const admin = await insertAdmin();
      const product = await insertSizeTrackedProduct({ M: 1 }, { price: 1234 });

      const res = await adminUpdateProduct(
        jsonRequest(`/api/admin/products/${product.id}`, 'PUT', { fabric: 'Linen' }, authHeader(admin)),
        paramsContext({ id: product.id })
      );

      expect(res.status).toBe(200);
      const { product: updated } = await res.json();
      expect(updated.price).toBe(1234);
    });

    it('rejects a negative stock on update', async () => {
      const admin = await insertAdmin();
      const product = await insertSizeTrackedProduct({ M: 1 });

      const res = await adminUpdateProduct(
        jsonRequest(`/api/admin/products/${product.id}`, 'PUT', { stock: -2 }, authHeader(admin)),
        paramsContext({ id: product.id })
      );

      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe('Stock must be a whole number of 0 or more.');
    });
  });

  // -------------------------------------------------------------------------
  // Authorisation (spec sec33/sec34) -- unchanged, asserted so it stays that way
  // -------------------------------------------------------------------------

  describe('authorisation', () => {
    it('refuses product creation for a signed-in customer', async () => {
      const customer = await insertUser();
      const res = await adminCreateProduct(
        jsonRequest(
          '/api/admin/products',
          'POST',
          { name: 'Nope', sku: uniqueSku(), category: 'Lawn', price: 10, stock: 1 },
          authHeader(customer)
        )
      );
      expect(res.status).toBe(403);
    });

    it('refuses product edits for a signed-in customer', async () => {
      const customer = await insertUser();
      const product = await insertSizeTrackedProduct({ M: 1 });
      const res = await adminUpdateProduct(
        jsonRequest(`/api/admin/products/${product.id}`, 'PUT', { price: 1 }, authHeader(customer)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(403);
    });

    it('refuses product creation with no token at all', async () => {
      const res = await adminCreateProduct(
        jsonRequest('/api/admin/products', 'POST', {
          name: 'Nope',
          sku: uniqueSku(),
          category: 'Lawn',
          price: 10,
          stock: 1
        })
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Inventory: order, reject, restock
  // -------------------------------------------------------------------------

  describe('stock movement through create_order()', () => {
    it('decrements the ordered size and the total together', async () => {
      const user = await insertUser();
      const product = await insertSizeTrackedProduct({ S: 5, M: 5, L: 5 });

      const res = await buyNow(user, product, { size: 'M', quantity: 2 });
      expect(res.status).toBe(201);

      const after = await reloadProduct(product.id);
      expect(after.size_stock).toEqual({ S: 5, M: 3, L: 5 });
      expect(after.stock).toBe(13);
    });

    it('rejects an order for more than that size has, even when the total would cover it', async () => {
      const user = await insertUser();
      // 20 units in total, but only 1 in M -- the product-level check alone
      // would have let this through. That is the whole point of size stock.
      const product = await insertSizeTrackedProduct({ S: 19, M: 1 });

      const res = await buyNow(user, product, { size: 'M', quantity: 4 });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe(
        `Insufficient stock for "${product.name}". Available stock is 1, but 4 was requested.`
      );

      // Nothing moved: the whole statement rolled back.
      const after = await reloadProduct(product.id);
      expect(after.size_stock).toEqual({ S: 19, M: 1 });
      expect(after.stock).toBe(20);
    });

    it('rejects an order for a size the product does not stock at all', async () => {
      const user = await insertUser();
      const product = await insertSizeTrackedProduct({ S: 5 });

      const res = await buyNow(user, product, { size: 'XXL', quantity: 1 });

      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe(
        `Insufficient stock for "${product.name}". Available stock is 0, but 1 was requested.`
      );
    });

    it('walks a size down to zero and then refuses the next unit (spec sec38)', async () => {
      const user = await insertUser();
      const product = await insertSizeTrackedProduct({ M: 5 });

      const first = await buyNow(user, product, { size: 'M', quantity: 2 });
      expect(first.status).toBe(201);
      expect((await reloadProduct(product.id)).size_stock).toEqual({ M: 3 });

      const second = await buyNow(user, product, { size: 'M', quantity: 4 });
      expect(second.status).toBe(400);
      expect((await second.json()).message).toBe(
        `Insufficient stock for "${product.name}". Available stock is 3, but 4 was requested.`
      );

      expect((await reloadProduct(product.id)).size_stock).toEqual({ M: 3 });
    });

    it('leaves a product with no size stock behaving exactly as before', async () => {
      const user = await insertUser();
      const { rows } = await query(
        `insert into products (name, slug, sku, category, price, stock, sizes, is_active, images)
         values ('Legacy', $1, $2, 'Lawn', 1000, 10, '{"S","M"}', true, '{"https://example.test/x.jpg"}')
         returning *`,
        [`legacy-${uniqueSku().toLowerCase()}`, uniqueSku()]
      );
      const product = rows[0];

      const res = await buyNow(user, product, { size: 'M', quantity: 3 });
      expect(res.status).toBe(201);

      const after = await reloadProduct(product.id);
      expect(after.stock).toBe(7);
      expect(after.size_stock).toEqual({});
    });
  });

  describe('stock movement through cancel_order()', () => {
    it('restocks the size that was actually sold', async () => {
      const user = await insertUser();
      const product = await insertSizeTrackedProduct({ S: 5, M: 5 });

      const orderRes = await buyNow(user, product, { size: 'M', quantity: 3 });
      expect(orderRes.status).toBe(201);
      const orderBody = await orderRes.json();
      const orderId = orderBody.order.id || orderBody.order._id;

      expect((await reloadProduct(product.id)).size_stock).toEqual({ S: 5, M: 2 });

      const cancelRes = await cancelOrderRoute(
        patchRequest(`/api/orders/${orderId}/cancel`, authHeader(user)),
        paramsContext({ id: orderId })
      );
      expect(cancelRes.status).toBe(200);

      const after = await reloadProduct(product.id);
      expect(after.size_stock).toEqual({ S: 5, M: 5 });
      expect(after.stock).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Cart
  // -------------------------------------------------------------------------

  describe('POST /api/cart/items', () => {
    it('validates the selected size rather than the product total', async () => {
      const user = await insertUser();
      const product = await insertSizeTrackedProduct({ S: 19, M: 1 });

      const res = await addCartItem(
        jsonRequest(
          '/api/cart/items',
          'POST',
          { productId: product.id, quantity: 3, selectedSize: 'M' },
          authHeader(user)
        )
      );

      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe(
        'Cannot add items. Available stock is 1 (currently in cart: 0).'
      );
    });

    it('accepts a quantity the selected size can cover', async () => {
      const user = await insertUser();
      const product = await insertSizeTrackedProduct({ S: 2, M: 6 });

      const res = await addCartItem(
        jsonRequest(
          '/api/cart/items',
          'POST',
          { productId: product.id, quantity: 4, selectedSize: 'M' },
          authHeader(user)
        )
      );

      expect(res.status).toBe(200);
    });
  });
});
