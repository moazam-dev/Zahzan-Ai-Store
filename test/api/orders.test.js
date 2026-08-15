// Task 11 (task-11-brief.md): route-level tests for the five app/api/orders/*
// route handlers, exercised as real functions against a PGlite-backed
// lib/db.js -- the same pattern test/api/cart.test.js and
// test/api/products.test.js established for Tasks 9/10.
//
// Per Ruling C3 (binding): response SHAPE and exact MESSAGE STRINGS are
// asserted against the golden files named in comments below. Whole-body
// equality against a golden is deliberately NOT done -- ids/timestamps
// legitimately differ between the Mongo-seeded goldens and this PGlite
// fixture data.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');
const { __resetMemoryStore, __memoryStoreEntries, signProofUrl } = await import('../../lib/storage.js');

import { POST as createOrderRoute, GET as listOrdersRoute } from '../../app/api/orders/route.js';
import { GET as myOrdersRoute } from '../../app/api/orders/my-orders/route.js';
import { GET as getOrderRoute } from '../../app/api/orders/[id]/route.js';
import { PATCH as cancelOrderRoute } from '../../app/api/orders/[id]/cancel/route.js';

// Same fixture PNG bytes test/multipart.test.js and test/storage.test.js use
// -- a genuine 1x1 PNG, not a text file wearing a .png extension.
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const validPngBuffer = Buffer.from(VALID_PNG_BASE64, 'base64');

function pngBlob(filename = 'proof.png') {
  return new Blob([validPngBuffer], { type: 'image/png' });
}

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

function postJsonRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function postMultipartRequest(path, fields, headers = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) {
      formData.append(key, value, 'proof.png');
    } else if (value !== undefined) {
      formData.append(key, value);
    }
  }
  return new Request(`http://localhost${path}`, { method: 'POST', headers, body: formData });
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
      overrides.firstName || 'Order',
      overrides.lastName || 'Tester',
      overrides.email || `order-fixture-${userCounter}@zahzanmigrationtest.com`,
      overrides.phone || '03001234567',
      overrides.role || 'customer'
    ]
  );
  return rows[0];
}

function tokenFor(user) {
  return generateToken(user.id, user.role);
}

function authHeader(user) {
  return { authorization: `Bearer ${tokenFor(user)}` };
}

async function insertProduct(overrides = {}) {
  const sku = overrides.sku || `ZHZ-ORD-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, category, price, stock, is_active, images, color)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      overrides.name || 'Order Test Kurta',
      overrides.slug || `order-test-${sku.toLowerCase()}`,
      sku,
      overrides.category || 'Kurtas',
      overrides.price ?? 8500,
      overrides.stock ?? 25,
      overrides.isActive ?? true,
      overrides.images || ['https://example.test/i.jpg'],
      overrides.color ?? 'Ivory'
    ]
  );
  return rows[0];
}

async function addToCart(user, product, overrides = {}) {
  const { rows: cartRows } = await query('select * from carts where user_id = $1', [user.id]);
  let cart = cartRows[0];
  if (!cart) {
    const { rows } = await query('insert into carts (user_id) values ($1) returning *', [user.id]);
    cart = rows[0];
  }
  await query(
    `insert into cart_items (cart_id, product_id, quantity, selected_size, selected_color)
     values ($1, $2, $3, $4, $5)`,
    [cart.id, product.id, overrides.quantity ?? 1, overrides.selectedSize || 'M', overrides.selectedColor || '']
  );
  return cart;
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

describe('app/api/orders/* route handlers (Task 11)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('POST /api/orders -- COD, cart checkout', () => {
    it('places a COD order from the cart -- shape matches tools/golden/037-orders.create-cod-1.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 4500, stock: 10 });
      await addToCart(user, product, { quantity: 2, selectedSize: 'One Size' });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: false,
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Order placed successfully (Cash on Delivery)');
      expect(body.payment).toBeNull();

      const order = body.order;
      expect(order._id).toEqual(expect.any(String));
      expect(order.id).toBe(order._id);
      expect(order.userId).toBe(user.id);
      expect(order.customerName).toBe('Sara Malik');
      expect(order.subtotal).toBe(9000);
      expect(order.shippingCost).toBe(250);
      expect(order.total).toBe(9250);
      expect(order.paymentMethod).toBe('Cash on Delivery');
      expect(order.paymentStatus).toBe('not_required');
      expect(order.orderStatus).toBe('Pending');
      expect(order.orderNumber).toMatch(/^ZHZ-\d{8}-\d{4}$/);

      expect(order.items).toHaveLength(1);
      const item = order.items[0];
      expect(item.productId).toBe(product.id);
      expect(item.productName).toBe('Order Test Kurta');
      expect(item.quantity).toBe(2);
      expect(item.unitPrice).toBe(4500);
      expect(item.totalPrice).toBe(9000);
      expect(item.size).toBe('One Size');
      expect(item._id).toEqual(expect.any(String));
      expect(item.id).toBe(item._id);
      expect(item.createdAt).toEqual(expect.any(String));
      expect(item.updatedAt).toEqual(expect.any(String));

      expect(order.shippingAddress).toEqual({
        fullName: 'Sara Malik',
        phone: '03007654321',
        email: validCustomerInfo.email,
        addressLine1: '123 Gulberg Boulevard',
        addressLine2: '',
        city: 'Lahore',
        state: 'Punjab',
        postalCode: '54000',
        country: 'Pakistan',
        deliveryInstructions: ''
      });
    });

    it('decrements stock by the ordered quantity and clears the cart for a cart checkout', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 1000, stock: 10 });
      await addToCart(user, product, { quantity: 3 });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          { customerInfo: validCustomerInfo, shippingAddress: validShippingAddress, isBuyNow: false, paymentChoice: 'cod' },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);

      const { rows: productRows } = await query('select stock from products where id = $1', [product.id]);
      expect(productRows[0].stock).toBe(7);

      const { rows: cartItemRows } = await query(
        'select ci.id from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = $1',
        [user.id]
      );
      expect(cartItemRows).toHaveLength(0);
    });
  });

  describe('POST /api/orders -- Buy Now', () => {
    it('places a buy-now COD order -- shape matches tools/golden/043-orders.create-cod-2.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ name: 'ZAHZAN Noir Formal Set', price: 18500, stock: 5 });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 1, selectedSize: 'M' },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.order.subtotal).toBe(18500);
      expect(body.order.shippingCost).toBe(250);
      expect(body.order.total).toBe(18750);
    });

    it('does NOT clear the cart for a buy-now order (the cart has unrelated items)', async () => {
      const user = await insertUser();
      const buyNowProduct = await insertProduct({ price: 1000, stock: 10 });
      const cartProduct = await insertProduct({ price: 2000, stock: 10 });
      await addToCart(user, cartProduct, { quantity: 1 });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: buyNowProduct.id, quantity: 1 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);

      const { rows: cartItemRows } = await query(
        'select ci.id from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = $1',
        [user.id]
      );
      expect(cartItemRows).toHaveLength(1);

      // The buy-now product's own stock IS decremented; the untouched cart
      // product's stock is not.
      const { rows: buyNowStock } = await query('select stock from products where id = $1', [buyNowProduct.id]);
      expect(buyNowStock[0].stock).toBe(9);
      const { rows: cartStock } = await query('select stock from products where id = $1', [cartProduct.id]);
      expect(cartStock[0].stock).toBe(10);
    });
  });

  describe('POST /api/orders -- advance payment with a proof file', () => {
    it('places an advance-payment order -- shape matches tools/golden/047-payments.create-advance-order.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ name: 'ZAHZAN Ivory Silk Kurta', price: 8500, stock: 10 });

      const res = await createOrderRoute(
        postMultipartRequest(
          '/api/orders',
          {
            customerInfo: JSON.stringify(validCustomerInfo),
            shippingAddress: JSON.stringify(validShippingAddress),
            isBuyNow: 'true',
            buyNowItem: JSON.stringify({ productId: product.id, quantity: 1, selectedSize: 'M' }),
            paymentChoice: 'advance',
            paymentMethod: 'JazzCash',
            transactionReference: 'TXNADV0001',
            proof: pngBlob()
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe('Order placed successfully. Payment proof submitted.');
      expect(body.order.paymentMethod).toBe('JazzCash');
      expect(body.order.paymentStatus).toBe('submitted');
      expect(body.order.total).toBe(8750);

      const payment = body.payment;
      expect(payment).not.toBeNull();
      expect(payment._id).toEqual(expect.any(String));
      expect(payment.id).toBe(payment._id);
      expect(payment.orderId).toBe(body.order._id);
      expect(payment.userId).toBe(user.id);
      expect(payment.paymentMethod).toBe('JazzCash');
      expect(payment.amount).toBe(8750);
      expect(payment.transactionReference).toBe('TXNADV0001');
      expect(payment.status).toBe('Pending');
      expect(typeof payment.proofUrl).toBe('string');
      expect(payment.proofUrl.length).toBeGreaterThan(0);

      // The proof really was uploaded through lib/storage.js.
      expect(__memoryStoreEntries().some(([path]) => path === payment.proofPublicId)).toBe(true);
    });

    it('regression: stores the storage PATH in payments.proof_url, never the expiring signed URL, while the response still gets a usable signed URL', async () => {
      // Defect found after Task 11's review (see task-11-report.md's
      // addendum): `payments.proof_url` must hold the storage PATH
      // (uploadPaymentProof's `public_id`), never a signed URL --
      // MIGRATION_PLAN.md sec7.4; lib/storage.js:139-146's doc comment;
      // app/api/payments/_submitPaymentProof.js's identical convention. A
      // signed URL baked into the column would 403 once its ~1hr expiry
      // passes, breaking admin proof verification for every advance-payment
      // order.
      const user = await insertUser();
      const product = await insertProduct({ name: 'ZAHZAN Regression Kurta', price: 5000, stock: 10 });

      const res = await createOrderRoute(
        postMultipartRequest(
          '/api/orders',
          {
            customerInfo: JSON.stringify(validCustomerInfo),
            shippingAddress: JSON.stringify(validShippingAddress),
            isBuyNow: 'true',
            buyNowItem: JSON.stringify({ productId: product.id, quantity: 1, selectedSize: 'M' }),
            paymentChoice: 'advance',
            paymentMethod: 'JazzCash',
            transactionReference: 'TXNREG0001',
            proof: pngBlob()
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      const payment = body.payment;
      expect(payment).not.toBeNull();

      const { rows: paymentDbRows } = await query('select proof_url, proof_public_id from payments where id = $1', [
        payment._id
      ]);
      const storedPayment = paymentDbRows[0];

      // A signed/expiring URL would carry a scheme and/or query-string
      // params (e.g. the memory driver's own `memory://...` prefix, or a
      // real Supabase signed URL's `?token=...`) -- the stored path must
      // have neither, and must be byte-identical to proof_public_id (both
      // columns hold the same path value on write).
      expect(storedPayment.proof_url).not.toMatch(/[?&]token=/);
      expect(storedPayment.proof_url).not.toContain('?');
      expect(storedPayment.proof_url).toBe(storedPayment.proof_public_id);
      expect(storedPayment.proof_url).toBe(payment.proofPublicId);

      // The create-order RESPONSE must still expose a usable, freshly-signed
      // URL -- not the raw path -- for the payment it returns.
      expect(payment.proofUrl).not.toBe(storedPayment.proof_url);
      expect(typeof payment.proofUrl).toBe('string');
      expect(payment.proofUrl.length).toBeGreaterThan(0);

      // The stored value round-trips: passing the stored proof_public_id
      // back through signProofUrl() produces a usable URL (proves the path
      // alone is sufficient to re-derive a working URL later, e.g. on an
      // admin read via app/api/payments/order/[orderId]/route.js).
      const resignedUrl = await signProofUrl(storedPayment.proof_public_id);
      expect(typeof resignedUrl).toBe('string');
      expect(resignedUrl.length).toBeGreaterThan(0);
      expect(resignedUrl).toBe(payment.proofUrl);
    });

    it('rejects a non-image, non-pdf proof file with the exact multer-equivalent message, before order creation', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const badBlob = new Blob(['not an image'], { type: 'text/plain' });

      const res = await createOrderRoute(
        postMultipartRequest(
          '/api/orders',
          {
            customerInfo: JSON.stringify(validCustomerInfo),
            shippingAddress: JSON.stringify(validShippingAddress),
            isBuyNow: 'true',
            buyNowItem: JSON.stringify({ productId: product.id, quantity: 1 }),
            paymentChoice: 'advance',
            paymentMethod: 'JazzCash',
            transactionReference: 'TXN1',
            proof: badBlob
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid file format. Only JPG, PNG, WEBP images and PDF documents are allowed.'
      });
    });
  });

  describe('POST /api/orders -- validation failures', () => {
    it('insufficient stock is rejected with the exact message, AND no partial writes (stock and order count unchanged)', async () => {
      const user = await insertUser();
      const product = await insertProduct({ name: 'Scarce Item', price: 5000, stock: 2 });

      const { rows: beforeOrders } = await query('select count(*)::int as c from orders');
      const { rows: beforeStock } = await query('select stock from products where id = $1', [product.id]);

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 5 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Insufficient stock for "Scarce Item". Available stock is 2, but 5 was requested.'
      });

      const { rows: afterOrders } = await query('select count(*)::int as c from orders');
      const { rows: afterStock } = await query('select stock from products where id = $1', [product.id]);
      expect(afterOrders[0].c).toBe(beforeOrders[0].c);
      expect(afterStock[0].stock).toBe(beforeStock[0].stock);
      expect(afterStock[0].stock).toBe(2);
    });

    it('an inactive product is rejected with 404 "Product ... is not available."', async () => {
      const user = await insertUser();
      const product = await insertProduct({ isActive: false });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 1 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: `Product "${product.id}" is not available.`
      });
    });

    it('an empty cart is rejected with 400 "Your cart is empty. Cannot process order."', async () => {
      const user = await insertUser();

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          { customerInfo: validCustomerInfo, shippingAddress: validShippingAddress, isBuyNow: false, paymentChoice: 'cod' },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Your cart is empty. Cannot process order.'
      });
    });

    it('an incomplete shipping address is rejected with the exact 400 message', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: { fullName: 'Sara Malik', phone: '03007654321' }, // missing addressLine1/city/state/postalCode/country
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 1 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message:
          'Complete shipping address is required (fullName, phone, addressLine1, city, state, postalCode, country).'
      });
    });

    it('no token -> 401', async () => {
      const res = await createOrderRoute(postJsonRequest('/api/orders', {}));
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/orders -- shipping cost boundary', () => {
    it('is FREE at exactly subtotal 20000', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 20000, stock: 5 });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 1 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      const body = await res.json();
      expect(body.order.subtotal).toBe(20000);
      expect(body.order.shippingCost).toBe(0);
      expect(body.order.total).toBe(20000);
    });

    it('is 250 at subtotal 19999 (just below the boundary)', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 19999, stock: 5 });

      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 1 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      const body = await res.json();
      expect(body.order.subtotal).toBe(19999);
      expect(body.order.shippingCost).toBe(250);
      expect(body.order.total).toBe(20249);
    });
  });

  describe('GET /api/orders, GET /api/orders/my-orders', () => {
    it('lists the authenticated user\'s orders -- shape matches tools/golden/038-orders.list.json / 039-orders.my-orders.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 1000 });
      await addToCart(user, product);
      await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          { customerInfo: validCustomerInfo, shippingAddress: validShippingAddress, isBuyNow: false, paymentChoice: 'cod' },
          authHeader(user)
        )
      );

      const listRes = await listOrdersRoute(getRequest('/api/orders', authHeader(user)));
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.success).toBe(true);
      expect(listBody.count).toBe(1);
      expect(listBody.orders).toHaveLength(1);

      const myOrdersRes = await myOrdersRoute(getRequest('/api/orders/my-orders', authHeader(user)));
      expect(myOrdersRes.status).toBe(200);
      const myOrdersBody = await myOrdersRes.json();
      expect(myOrdersBody.count).toBe(1);
      expect(myOrdersBody.orders[0]._id).toBe(listBody.orders[0]._id);
    });

    it('another user\'s orders are invisible', async () => {
      const userA = await insertUser();
      const userB = await insertUser();
      const product = await insertProduct({ price: 1000 });
      await addToCart(userA, product);
      await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          { customerInfo: validCustomerInfo, shippingAddress: validShippingAddress, isBuyNow: false, paymentChoice: 'cod' },
          authHeader(userA)
        )
      );

      const res = await listOrdersRoute(getRequest('/api/orders', authHeader(userB)));
      const body = await res.json();
      expect(body.count).toBe(0);
      expect(body.orders).toEqual([]);
    });
  });

  describe('GET /api/orders/:id', () => {
    async function placeOrder(user, product) {
      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity: 1 },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      return (await res.json()).order;
    }

    it('fetches by uuid -- shape matches tools/golden/040-orders.get-by-id.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 1000 });
      const order = await placeOrder(user, product);

      const res = await getOrderRoute(getRequest(`/api/orders/${order._id}`, authHeader(user)), paramsContext({ id: order._id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.order._id).toBe(order._id);
    });

    it('fetches by orderNumber, case-insensitively -- shape matches tools/golden/041-orders.get-by-order-number.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 1000 });
      const order = await placeOrder(user, product);

      const res = await getOrderRoute(
        getRequest(`/api/orders/${order.orderNumber.toLowerCase()}`, authHeader(user)),
        paramsContext({ id: order.orderNumber.toLowerCase() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.order.orderNumber).toBe(order.orderNumber);
    });

    it('unknown id -> 404 "Order not found"', async () => {
      const user = await insertUser();
      const res = await getOrderRoute(
        getRequest('/api/orders/00000000-0000-0000-0000-000000000000', authHeader(user)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Order not found' });
    });

    it("another user cannot fetch the order -> 403", async () => {
      const owner = await insertUser();
      const stranger = await insertUser();
      const product = await insertProduct({ price: 1000 });
      const order = await placeOrder(owner, product);

      const res = await getOrderRoute(getRequest(`/api/orders/${order._id}`, authHeader(stranger)), paramsContext({ id: order._id }));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'You are not authorized to view this order.'
      });
    });

    it('an admin CAN fetch another user\'s order', async () => {
      const owner = await insertUser();
      const admin = await insertUser({ role: 'admin' });
      const product = await insertProduct({ price: 1000 });
      const order = await placeOrder(owner, product);

      const res = await getOrderRoute(getRequest(`/api/orders/${order._id}`, authHeader(admin)), paramsContext({ id: order._id }));
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/orders/:id/cancel', () => {
    async function placeOrder(user, product, quantity = 1) {
      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: validCustomerInfo,
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            buyNowItem: { productId: product.id, quantity },
            paymentChoice: 'cod'
          },
          authHeader(user)
        )
      );
      return (await res.json()).order;
    }

    it('cancels a pending order and restores stock -- shape matches tools/golden/042-orders.cancel-1.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ stock: 10 });
      const order = await placeOrder(user, product, 3);

      const { rows: afterOrderStock } = await query('select stock from products where id = $1', [product.id]);
      expect(afterOrderStock[0].stock).toBe(7);

      const res = await cancelOrderRoute(
        patchRequest(`/api/orders/${order._id}/cancel`, authHeader(user)),
        paramsContext({ id: order._id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Order cancelled successfully');
      expect(body.order.orderStatus).toBe('Cancelled');

      const { rows: restoredStock } = await query('select stock from products where id = $1', [product.id]);
      expect(restoredStock[0].stock).toBe(10);
    });

    it('cancelling an already-shipped order is rejected -- 400 with the exact message', async () => {
      const user = await insertUser();
      const product = await insertProduct({ stock: 10 });
      const order = await placeOrder(user, product);

      await query('update orders set order_status = $1 where id = $2', ['Shipped', order._id]);

      const res = await cancelOrderRoute(
        patchRequest(`/api/orders/${order._id}/cancel`, authHeader(user)),
        paramsContext({ id: order._id })
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Order cannot be cancelled because it is already in "Shipped" status.'
      });
    });

    it('cancelling twice is rejected the second time -- shape matches tools/golden/044/045', async () => {
      const user = await insertUser();
      const product = await insertProduct({ stock: 10 });
      const order = await placeOrder(user, product);

      const first = await cancelOrderRoute(
        patchRequest(`/api/orders/${order._id}/cancel`, authHeader(user)),
        paramsContext({ id: order._id })
      );
      expect(first.status).toBe(200);

      const second = await cancelOrderRoute(
        patchRequest(`/api/orders/${order._id}/cancel`, authHeader(user)),
        paramsContext({ id: order._id })
      );
      expect(second.status).toBe(400);
      await expect(second.json()).resolves.toEqual({
        success: false,
        message: 'Order cannot be cancelled because it is already in "Cancelled" status.'
      });
    });

    it("another user cannot cancel the order -> 403", async () => {
      const owner = await insertUser();
      const stranger = await insertUser();
      const product = await insertProduct({ stock: 10 });
      const order = await placeOrder(owner, product);

      const res = await cancelOrderRoute(
        patchRequest(`/api/orders/${order._id}/cancel`, authHeader(stranger)),
        paramsContext({ id: order._id })
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'You are not authorized to cancel this order.'
      });

      // Stock was NOT restored by the rejected attempt.
      const { rows } = await query('select stock from products where id = $1', [product.id]);
      expect(rows[0].stock).toBe(9);
    });
  });

  describe('next_order_number() concurrency', () => {
    it('issuing many concurrent calls yields all-distinct order numbers', async () => {
      const results = await Promise.all(
        Array.from({ length: 25 }, () => query('select next_order_number() as n'))
      );
      const numbers = results.map((r) => r.rows[0].n);
      const distinct = new Set(numbers);

      expect(numbers).toHaveLength(25);
      expect(distinct.size).toBe(25);
      for (const n of numbers) {
        expect(n).toMatch(/^ZHZ-\d{8}-\d{4}$/);
      }
    });
  });
});
