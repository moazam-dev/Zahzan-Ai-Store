// Guest checkout
// (docs/superpowers/specs/2026-08-20-guest-checkout-design.md).
//
// Route-level tests against a PGlite-backed lib/db.js, following the pattern
// test/api/orders.test.js established.
//
// Three properties matter most here and each is tested from both sides:
//
//   1. A guest can actually place an order, and cannot influence the price.
//   2. Order history links by email WITHOUT ever letting one account reach
//      another account's orders.
//   3. The order-access token grants exactly one order and is not a login.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

const { query, close } = await import('../../lib/db.js');
const { generateToken, generateOrderAccessToken, verifyToken, verifyOrderAccessToken } = await import(
  '../../lib/jwt.js'
);
const { optionalAuth, canAccessOrder } = await import('../../lib/auth.js');

import { POST as createOrderRoute, GET as listOrdersRoute } from '../../app/api/orders/route.js';
import { GET as myOrdersRoute } from '../../app/api/orders/my-orders/route.js';
import { GET as getOrderRoute } from '../../app/api/orders/[id]/route.js';
import { PATCH as cancelOrderRoute } from '../../app/api/orders/[id]/cancel/route.js';

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
      overrides.firstName || 'Guest',
      overrides.lastName || 'Tester',
      overrides.email || `guest-fixture-${userCounter}@zahzanmigrationtest.com`,
      overrides.phone || '03001234567',
      overrides.role || 'customer'
    ]
  );
  return rows[0];
}

function authHeader(user) {
  return { authorization: `Bearer ${generateToken(user.id, user.role)}` };
}

let skuCounter = 0;
async function insertProduct(overrides = {}) {
  skuCounter += 1;
  const sku = overrides.sku || `ZHZ-GUEST-${skuCounter}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, category, price, stock, is_active, images, color)
     values ($1, $2, $3, 'Lawn', $4, $5, true, '{"https://example.test/i.jpg"}', 'Ivory')
     returning *`,
    [
      overrides.name || 'Guest Test Kurta',
      overrides.slug || `guest-test-${sku.toLowerCase()}`,
      sku,
      overrides.price ?? 5000,
      overrides.stock ?? 25
    ]
  );
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

function guestInfo(email) {
  return { fullName: 'Sara Malik', email, phone: '03007654321' };
}

/** Places a COD order with no Authorization header at all. */
function placeGuestOrder(body) {
  return createOrderRoute(postJsonRequest('/api/orders', { paymentChoice: 'cod', ...body }));
}

describe('Guest checkout', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  // -------------------------------------------------------------------------
  // Placing an order without an account
  // -------------------------------------------------------------------------

  describe('POST /api/orders with no account', () => {
    it('places a Buy Now order and stores it against the email, with no user', async () => {
      const product = await insertProduct({ price: 4000, stock: 10 });

      const res = await placeGuestOrder({
        customerInfo: guestInfo('walkin@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: product.id, quantity: 2, selectedSize: 'M' }
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);

      const { rows } = await query('select * from orders where id = $1', [body.order.id]);
      expect(rows[0].user_id).toBeNull();
      expect(rows[0].customer_email).toBe('walkin@example.com');
      expect(rows[0].total).toBe('8250.00'); // 2 x 4000 + 250 shipping

      // Stock still moved -- a guest order is a real order.
      const { rows: prodRows } = await query('select stock from products where id = $1', [product.id]);
      expect(prodRows[0].stock).toBe(8);
    });

    it('places a cart order from items supplied in the request body', async () => {
      const a = await insertProduct({ price: 1000, stock: 5 });
      const b = await insertProduct({ price: 2000, stock: 5 });

      const res = await placeGuestOrder({
        customerInfo: guestInfo('cart-guest@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: false,
        items: [
          { productId: a.id, quantity: 1, selectedSize: 'S' },
          { productId: b.id, quantity: 2, selectedSize: 'L' }
        ]
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.order.items).toHaveLength(2);
      expect(body.order.subtotal).toBe(5000);
    });

    it('IGNORES a price supplied by the client and charges the catalogue price', async () => {
      const product = await insertProduct({ price: 9000, stock: 5 });

      const res = await placeGuestOrder({
        customerInfo: guestInfo('cheapskate@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: false,
        items: [
          {
            productId: product.id,
            quantity: 1,
            selectedSize: 'M',
            // All of this is attacker-controlled and all of it must be ignored.
            price: 1,
            unitPrice: 1,
            totalPrice: 1,
            productName: 'Free Kurta'
          }
        ]
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.order.items[0].unitPrice).toBe(9000);
      expect(body.order.items[0].productName).toBe(product.name);
      expect(body.order.subtotal).toBe(9000);
    });

    it('still enforces stock for a guest', async () => {
      const product = await insertProduct({ price: 1000, stock: 2 });

      const res = await placeGuestOrder({
        customerInfo: guestInfo('greedy@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: false,
        items: [{ productId: product.id, quantity: 5, selectedSize: 'M' }]
      });

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain('Insufficient stock');
    });

    it('requires an email even though it no longer requires an account', async () => {
      const product = await insertProduct();

      const res = await placeGuestOrder({
        customerInfo: { fullName: 'No Email', phone: '03007654321' },
        shippingAddress: validShippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: product.id, quantity: 1, selectedSize: 'M' }
      });

      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe('Customer name, email, and phone number are required.');
    });

    it('rejects an empty or malformed guest cart', async () => {
      const empty = await placeGuestOrder({
        customerInfo: guestInfo('empty@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: false,
        items: []
      });
      expect(empty.status).toBe(400);
      expect((await empty.json()).message).toBe('Your cart is empty. Cannot process order.');

      const noProduct = await placeGuestOrder({
        customerInfo: guestInfo('bad@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: false,
        items: [{ quantity: 1 }]
      });
      expect(noProduct.status).toBe(400);
      expect((await noProduct.json()).message).toBe('Each cart item must include a productId.');

      const badQty = await placeGuestOrder({
        customerInfo: guestInfo('bad2@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: false,
        items: [{ productId: (await insertProduct()).id, quantity: 0 }]
      });
      expect(badQty.status).toBe(400);
      expect((await badQty.json()).message).toBe('Each cart item must have a quantity of at least 1.');
    });

    it('does NOT let a signed-in customer check out lines that are not in their cart', async () => {
      const user = await insertUser();
      const product = await insertProduct({ price: 1000, stock: 5 });

      // `items` is a guest-only field. A signed-in caller supplying it still
      // gets the database cart -- which is empty here.
      const res = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: guestInfo(user.email),
            shippingAddress: validShippingAddress,
            isBuyNow: false,
            paymentChoice: 'cod',
            items: [{ productId: product.id, quantity: 1, selectedSize: 'M' }]
          },
          authHeader(user)
        )
      );

      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe('Your cart is empty. Cannot process order.');
    });
  });

  // -------------------------------------------------------------------------
  // History linking
  // -------------------------------------------------------------------------

  describe('order history linking by email', () => {
    it('shows a guest order to an account created later with the same email', async () => {
      const email = `later-signup-${userCounter}@example.com`;
      const product = await insertProduct({ price: 3000, stock: 5 });

      const placed = await placeGuestOrder({
        customerInfo: guestInfo(email),
        shippingAddress: validShippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: product.id, quantity: 1, selectedSize: 'M' }
      });
      expect(placed.status).toBe(201);
      const guestOrderId = (await placed.json()).order.id;

      // The account comes into existence AFTER the order.
      const user = await insertUser({ email });

      const res = await myOrdersRoute(getRequest('/api/orders/my-orders', authHeader(user)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.orders.map((o) => o.id)).toContain(guestOrderId);

      // The same order is reachable individually, and cancellable.
      const detail = await getOrderRoute(
        getRequest(`/api/orders/${guestOrderId}`, authHeader(user)),
        paramsContext({ id: guestOrderId })
      );
      expect(detail.status).toBe(200);

      const cancelled = await cancelOrderRoute(
        patchRequest(`/api/orders/${guestOrderId}/cancel`, authHeader(user)),
        paramsContext({ id: guestOrderId })
      );
      expect(cancelled.status).toBe(200);
    });

    it('matches case-insensitively on the email', async () => {
      const user = await insertUser({ email: `mixedcase-${userCounter}@example.com` });
      const product = await insertProduct({ price: 1000, stock: 5 });

      const placed = await placeGuestOrder({
        customerInfo: guestInfo(user.email.toUpperCase()),
        shippingAddress: validShippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: product.id, quantity: 1, selectedSize: 'M' }
      });
      const orderId = (await placed.json()).order.id;

      const res = await listOrdersRoute(getRequest('/api/orders', authHeader(user)));
      expect((await res.json()).orders.map((o) => o.id)).toContain(orderId);
    });

    it("never exposes an OWNED order via an email match", async () => {
      // The dangerous shape: an order that already belongs to one account but
      // carries a different person's email -- Alice, signed in, ordering a
      // gift and typing Mallory's address so the delivery updates go there.
      // Mallory must NOT get access to Alice's order, her shipping address, or
      // the ability to cancel it. `user_id is null` in the matching rule is
      // what prevents that.
      //
      // (Two accounts cannot share an email at all -- users_email_lower_idx is
      // unique -- so that variant of the attack is already impossible.)
      const alice = await insertUser({ email: `alice-${userCounter}@example.com` });
      const mallory = await insertUser({ email: `mallory-${userCounter}@example.com` });
      const product = await insertProduct({ price: 1000, stock: 5 });

      const placed = await createOrderRoute(
        postJsonRequest(
          '/api/orders',
          {
            customerInfo: guestInfo(mallory.email),
            shippingAddress: validShippingAddress,
            isBuyNow: true,
            paymentChoice: 'cod',
            buyNowItem: { productId: product.id, quantity: 1, selectedSize: 'M' }
          },
          authHeader(alice)
        )
      );
      expect(placed.status).toBe(201);
      const aliceOrderId = (await placed.json()).order.id;

      const { rows } = await query('select user_id, customer_email from orders where id = $1', [
        aliceOrderId
      ]);
      expect(rows[0].user_id).toBe(alice.id);
      expect(rows[0].customer_email).toBe(mallory.email);

      const list = await myOrdersRoute(getRequest('/api/orders/my-orders', authHeader(mallory)));
      expect((await list.json()).orders.map((o) => o.id)).not.toContain(aliceOrderId);

      const detail = await getOrderRoute(
        getRequest(`/api/orders/${aliceOrderId}`, authHeader(mallory)),
        paramsContext({ id: aliceOrderId })
      );
      expect(detail.status).toBe(403);

      const cancel = await cancelOrderRoute(
        patchRequest(`/api/orders/${aliceOrderId}/cancel`, authHeader(mallory)),
        paramsContext({ id: aliceOrderId })
      );
      expect(cancel.status).toBe(403);

      // Alice, the actual owner, still reaches it.
      const owner = await getOrderRoute(
        getRequest(`/api/orders/${aliceOrderId}`, authHeader(alice)),
        paramsContext({ id: aliceOrderId })
      );
      expect(owner.status).toBe(200);
    });

    it('does not show a guest order to an account with a different email', async () => {
      const product = await insertProduct({ price: 1000, stock: 5 });
      const placed = await placeGuestOrder({
        customerInfo: guestInfo('somebody-else@example.com'),
        shippingAddress: validShippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: product.id, quantity: 1, selectedSize: 'M' }
      });
      const orderId = (await placed.json()).order.id;

      const stranger = await insertUser();
      const res = await myOrdersRoute(getRequest('/api/orders/my-orders', authHeader(stranger)));
      expect((await res.json()).orders.map((o) => o.id)).not.toContain(orderId);

      const detail = await getOrderRoute(
        getRequest(`/api/orders/${orderId}`, authHeader(stranger)),
        paramsContext({ id: orderId })
      );
      expect(detail.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // canAccessOrder -- the shared predicate, tested directly
  // -------------------------------------------------------------------------

  describe('canAccessOrder', () => {
    const user = { id: 'u1', email: 'me@example.com' };

    it('allows an account its own order', () => {
      expect(canAccessOrder({ user_id: 'u1', customer_email: 'other@example.com' }, user)).toBe(true);
    });

    it('allows an account a guest order placed with its email, any case', () => {
      expect(canAccessOrder({ user_id: null, customer_email: 'ME@Example.com' }, user)).toBe(true);
    });

    it("refuses another ACCOUNT's order even when the email matches", () => {
      expect(canAccessOrder({ user_id: 'u2', customer_email: 'me@example.com' }, user)).toBe(false);
    });

    it('refuses a guest order with a different email', () => {
      expect(canAccessOrder({ user_id: null, customer_email: 'x@example.com' }, user)).toBe(false);
    });

    it('refuses when there is no user at all', () => {
      expect(canAccessOrder({ user_id: null, customer_email: 'me@example.com' }, null)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // optionalAuth
  // -------------------------------------------------------------------------

  describe('optionalAuth', () => {
    it('resolves a signed-in user', async () => {
      const user = await insertUser();
      const { user: resolved } = await optionalAuth(getRequest('/x', authHeader(user)));
      expect(resolved.id).toBe(user.id);
    });

    it('returns a null user, not an error, when there is no header', async () => {
      const result = await optionalAuth(getRequest('/x'));
      expect(result).toEqual({ user: null });
      expect(result.response).toBeUndefined();
    });

    it('treats a garbage or expired token as a guest rather than failing checkout', async () => {
      const result = await optionalAuth(getRequest('/x', { authorization: 'Bearer not-a-jwt' }));
      expect(result.user).toBeNull();
    });

    it('returns null for a token whose user no longer exists', async () => {
      const ghost = await insertUser();
      const header = authHeader(ghost);
      await query('delete from users where id = $1', [ghost.id]);
      const { user } = await optionalAuth(getRequest('/x', header));
      expect(user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Order access token
  // -------------------------------------------------------------------------

  describe('order access token', () => {
    it('round-trips the order id it was minted for', () => {
      const token = generateOrderAccessToken('order-123');
      expect(verifyOrderAccessToken(token)).toBe('order-123');
    });

    it('is NOT accepted as a login', () => {
      const token = generateOrderAccessToken('order-123');
      // Same secret, so it would verify structurally -- verifyToken refuses it
      // on the scope claim instead.
      expect(() => verifyToken(token)).toThrow();
    });

    it('a user access token is not accepted as an order token', () => {
      expect(verifyOrderAccessToken(generateToken('some-user-id'))).toBeNull();
    });

    it('rejects garbage, empty and non-string input', () => {
      expect(verifyOrderAccessToken('nonsense')).toBeNull();
      expect(verifyOrderAccessToken('')).toBeNull();
      expect(verifyOrderAccessToken(null)).toBeNull();
      expect(verifyOrderAccessToken(undefined)).toBeNull();
      expect(verifyOrderAccessToken(12345)).toBeNull();
    });

    it('still lets an ordinary user token be verified as a login', () => {
      const user = generateToken('u1', 'customer');
      expect(verifyToken(user).id).toBe('u1');
    });
  });
});
