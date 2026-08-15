// Task 12 (task-12-brief.md): route-level tests for the four
// app/api/payments/* route handlers, exercised as real functions against a
// PGlite-backed lib/db.js -- the same pattern test/api/orders.test.js and
// test/api/cart.test.js established for Tasks 10/11.
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
const { PAYMENT_METHODS } = await import('../../lib/paymentMethods.js');

import { GET as methodsRoute } from '../../app/api/payments/methods/route.js';
import { POST as submitProofRoute } from '../../app/api/payments/route.js';
import { POST as submitProofAliasRoute } from '../../app/api/payments/proof/route.js';
import { GET as getByOrderIdRoute } from '../../app/api/payments/order/[orderId]/route.js';

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const validPngBuffer = Buffer.from(VALID_PNG_BASE64, 'base64');

function pngBlob() {
  return new Blob([validPngBuffer], { type: 'image/png' });
}

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
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
      overrides.firstName || 'Payment',
      overrides.lastName || 'Tester',
      overrides.email || `payment-fixture-${userCounter}@zahzanmigrationtest.com`,
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

let orderCounter = 0;
async function insertOrder(user, overrides = {}) {
  orderCounter += 1;
  const { rows } = await query(
    `insert into orders
       (order_number, user_id, customer_name, customer_email, customer_phone, items, shipping_address,
        subtotal, shipping_cost, total, payment_method, payment_status, order_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      overrides.orderNumber || `ZHZ-TEST-${orderCounter}`,
      user.id,
      overrides.customerName || 'Sara Malik',
      overrides.customerEmail || 'sara@zahzanmigrationtest.com',
      overrides.customerPhone || '03007654321',
      JSON.stringify(overrides.items || []),
      JSON.stringify(
        overrides.shippingAddress || {
          fullName: 'Sara Malik',
          phone: '03007654321',
          addressLine1: '123 Gulberg Boulevard',
          city: 'Lahore',
          state: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan'
        }
      ),
      overrides.subtotal ?? 8500,
      overrides.shippingCost ?? 250,
      overrides.total ?? 8750,
      overrides.paymentMethod || 'JazzCash',
      overrides.paymentStatus || 'pending',
      overrides.orderStatus || 'Pending'
    ]
  );
  return rows[0];
}

describe('app/api/payments/* route handlers (Task 12)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('GET /api/payments/methods', () => {
    it('returns PAYMENT_METHODS unchanged -- shape matches tools/golden/046-payments.methods.json', async () => {
      const res = await methodsRoute();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, methods: PAYMENT_METHODS });
    });
  });

  describe('POST /api/payments -- shape matches tools/golden/048-payments.submit-proof.json', () => {
    it('submits payment proof under the "proof" field', async () => {
      const user = await insertUser();
      const order = await insertOrder(user, { total: 8750 });

      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          {
            orderId: order.id,
            paymentMethod: 'Easypaisa',
            transactionReference: 'TXNADV0002',
            proof: pngBlob()
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Payment proof submitted successfully. Awaiting administrator verification.');

      const payment = body.payment;
      expect(payment._id).toEqual(expect.any(String));
      expect(payment.id).toBe(payment._id);
      expect(payment.orderId).toBe(order.id);
      expect(payment.userId).toBe(user.id);
      expect(payment.paymentMethod).toBe('Easypaisa');
      // The amount comes from the ORDER ROW, never the request.
      expect(payment.amount).toBe(8750);
      expect(payment.transactionReference).toBe('TXNADV0002');
      expect(payment.status).toBe('Pending');
      expect(payment.rejectionReason).toBe('');
      expect(typeof payment.proofUrl).toBe('string');
      expect(payment.proofUrl.length).toBeGreaterThan(0);

      // The order's paymentStatus is updated to 'submitted'.
      const { rows } = await query('select payment_status from orders where id = $1', [order.id]);
      expect(rows[0].payment_status).toBe('submitted');
    });

    it('a lowercase transaction reference is stored uppercased', async () => {
      const user = await insertUser();
      const order = await insertOrder(user, { total: 1000 });

      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'abc123xyz', proof: pngBlob() },
          authHeader(user)
        )
      );
      const body = await res.json();
      expect(body.payment.transactionReference).toBe('ABC123XYZ');
    });

    it('missing orderId -> 400 exact message', async () => {
      const user = await insertUser();
      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { paymentMethod: 'JazzCash', transactionReference: 'TXN1', proof: pngBlob() },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Order ID is required.' });
    });

    it('missing paymentMethod -> 400 exact message', async () => {
      const user = await insertUser();
      const order = await insertOrder(user);
      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, transactionReference: 'TXN1', proof: pngBlob() },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Payment method selection is required.'
      });
    });

    it('missing transactionReference -> 400 exact message', async () => {
      const user = await insertUser();
      const order = await insertOrder(user);
      const res = await submitProofRoute(
        postMultipartRequest('/api/payments', { orderId: order.id, paymentMethod: 'JazzCash', proof: pngBlob() }, authHeader(user))
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Transaction reference ID is required.'
      });
    });

    it('missing proof file -> 400 exact multer-equivalent message', async () => {
      const user = await insertUser();
      const order = await insertOrder(user);
      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'TXN1' },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid file format. Only JPG, PNG, WEBP images and PDF documents are allowed.'
      });
    });

    it('order not found -> 404', async () => {
      const user = await insertUser();
      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          {
            orderId: '00000000-0000-0000-0000-000000000000',
            paymentMethod: 'JazzCash',
            transactionReference: 'TXN1',
            proof: pngBlob()
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Order not found.' });
    });

    it("someone else's order -> 403 exact message", async () => {
      const owner = await insertUser();
      const stranger = await insertUser();
      const order = await insertOrder(owner);

      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'TXN1', proof: pngBlob() },
          authHeader(stranger)
        )
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'You are not authorized to submit payment for this order.'
      });
    });

    it('a cancelled order -> 400 exact message', async () => {
      const user = await insertUser();
      const order = await insertOrder(user, { orderStatus: 'Cancelled' });

      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'TXN1', proof: pngBlob() },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Cannot submit payment for a cancelled order.'
      });
    });

    it('an already-verified order -> 400 exact message', async () => {
      const user = await insertUser();
      const order = await insertOrder(user, { paymentStatus: 'verified' });

      const res = await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'TXN1', proof: pngBlob() },
          authHeader(user)
        )
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Payment for this order has already been verified.'
      });
    });

    it('no token -> 401', async () => {
      const user = await insertUser();
      const order = await insertOrder(user);
      const res = await submitProofRoute(
        postMultipartRequest('/api/payments', {
          orderId: order.id,
          paymentMethod: 'JazzCash',
          transactionReference: 'TXN1',
          proof: pngBlob()
        })
      );
      expect(res.status).toBe(401);
    });

    describe('duplicate transaction reference guard', () => {
      it('a reference already used by a Pending payment on a DIFFERENT order is rejected, case-insensitively', async () => {
        const user = await insertUser();
        const orderA = await insertOrder(user);
        const orderB = await insertOrder(user);

        const first = await submitProofRoute(
          postMultipartRequest(
            '/api/payments',
            { orderId: orderA.id, paymentMethod: 'JazzCash', transactionReference: 'DUPREF001', proof: pngBlob() },
            authHeader(user)
          )
        );
        expect(first.status).toBe(201);

        const second = await submitProofRoute(
          postMultipartRequest(
            '/api/payments',
            { orderId: orderB.id, paymentMethod: 'Easypaisa', transactionReference: 'dupref001', proof: pngBlob() },
            authHeader(user)
          )
        );
        expect(second.status).toBe(400);
        await expect(second.json()).resolves.toEqual({
          success: false,
          message:
            'This transaction reference ID has already been submitted for another payment. Please check your transaction details.'
        });
      });

      it('the SAME order may resubmit, even reusing its own reference', async () => {
        const user = await insertUser();
        const order = await insertOrder(user);

        const first = await submitProofRoute(
          postMultipartRequest(
            '/api/payments',
            { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'SAMEORDER1', proof: pngBlob() },
            authHeader(user)
          )
        );
        expect(first.status).toBe(201);

        const second = await submitProofRoute(
          postMultipartRequest(
            '/api/payments',
            { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'SAMEORDER1', proof: pngBlob() },
            authHeader(user)
          )
        );
        expect(second.status).toBe(201);

        const { rows } = await query('select count(*)::int as c from payments where order_id = $1', [order.id]);
        expect(rows[0].c).toBe(2);
      });

      it('a Rejected payment on another order does NOT block reuse of its reference', async () => {
        const user = await insertUser();
        const orderA = await insertOrder(user);
        const orderB = await insertOrder(user);

        await query(
          `insert into payments (order_id, user_id, payment_method, amount, transaction_reference, proof_url, proof_public_id, status)
           values ($1, $2, 'JazzCash', 1000, 'REJREF001', 'path/x', 'path/x', 'Rejected')`,
          [orderA.id, user.id]
        );

        const res = await submitProofRoute(
          postMultipartRequest(
            '/api/payments',
            { orderId: orderB.id, paymentMethod: 'JazzCash', transactionReference: 'REJREF001', proof: pngBlob() },
            authHeader(user)
          )
        );
        expect(res.status).toBe(201);
      });
    });
  });

  describe('POST /api/payments/proof -- alias, shape matches tools/golden/049-payments.submit-proof-alias.json', () => {
    it('submits payment proof under the "proofImage" field', async () => {
      const user = await insertUser();
      const order = await insertOrder(user, { total: 8750 });

      const res = await submitProofAliasRoute(
        postMultipartRequest(
          '/api/payments/proof',
          {
            orderId: order.id,
            paymentMethod: 'Bank Transfer',
            transactionReference: 'TXNADV0003',
            proofImage: pngBlob()
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.payment.paymentMethod).toBe('Bank Transfer');
      expect(body.payment.transactionReference).toBe('TXNADV0003');
      expect(body.payment.amount).toBe(8750);
    });

    it("the 'proof' field name does NOT work on the alias route (file missing)", async () => {
      const user = await insertUser();
      const order = await insertOrder(user);

      const res = await submitProofAliasRoute(
        postMultipartRequest(
          '/api/payments/proof',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'TXN1', proof: pngBlob() },
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

  describe('GET /api/payments/order/:orderId -- shape matches tools/golden/050-payments.get-by-order-id.json', () => {
    it("lists an order's payments newest first, with a freshly signed proofUrl on every read", async () => {
      const user = await insertUser();
      const order = await insertOrder(user, { total: 8750 });

      await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'JazzCash', transactionReference: 'GETORDREF001', proof: pngBlob() },
          authHeader(user)
        )
      );
      await submitProofRoute(
        postMultipartRequest(
          '/api/payments',
          { orderId: order.id, paymentMethod: 'Easypaisa', transactionReference: 'GETORDREF002', proof: pngBlob() },
          authHeader(user)
        )
      );

      const res = await getByOrderIdRoute(
        getRequest(`/api/payments/order/${order.id}`, authHeader(user)),
        paramsContext({ orderId: order.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.payments).toHaveLength(2);
      // newest first
      expect(body.payments[0].transactionReference).toBe('GETORDREF002');
      expect(body.payments[1].transactionReference).toBe('GETORDREF001');
      for (const payment of body.payments) {
        expect(payment._id).toEqual(expect.any(String));
        expect(payment.id).toBe(payment._id);
        expect(typeof payment.proofUrl).toBe('string');
        expect(payment.proofUrl.length).toBeGreaterThan(0);
      }
    });

    it('an admin CAN view another user\'s order payments', async () => {
      const owner = await insertUser();
      const admin = await insertUser({ role: 'admin' });
      const order = await insertOrder(owner);

      const res = await getByOrderIdRoute(
        getRequest(`/api/payments/order/${order.id}`, authHeader(admin)),
        paramsContext({ orderId: order.id })
      );
      expect(res.status).toBe(200);
    });

    it("someone else's order -> 403 exact message", async () => {
      const owner = await insertUser();
      const stranger = await insertUser();
      const order = await insertOrder(owner);

      const res = await getByOrderIdRoute(
        getRequest(`/api/payments/order/${order.id}`, authHeader(stranger)),
        paramsContext({ orderId: order.id })
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'You are not authorized to view payments for this order.'
      });
    });

    it('order not found -> 404', async () => {
      const user = await insertUser();
      const res = await getByOrderIdRoute(
        getRequest('/api/payments/order/00000000-0000-0000-0000-000000000000', authHeader(user)),
        paramsContext({ orderId: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Order not found.' });
    });
  });
});
