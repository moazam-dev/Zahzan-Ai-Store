// Task 13 (task-13-brief.md): route-level tests for the 21
// app/api/admin/* route handlers, exercised as real functions against a
// PGlite-backed lib/db.js -- the same pattern test/api/orders.test.js and
// test/api/payments.test.js established for Tasks 11/12.
//
// Per Ruling C3 (binding): response SHAPE and exact MESSAGE STRINGS are
// asserted against the golden files named in comments below. Whole-body
// equality against a golden is deliberately NOT done -- ids/timestamps
// legitimately differ between the Mongo-seeded goldens and this PGlite
// fixture data.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
// Task 15 fix: the admin order/payment routes now re-sign payment proof
// URLs on every read (lib/storage.js's private-bucket design -- proof_url
// stores a storage PATH, not a durable URL, so every read has to sign a
// fresh one; this test file's routes previously never touched lib/storage.js
// at all, so it never needed this). Without it, signProofUrl defaults to
// the 'supabase' driver and tries to construct a real Supabase client with
// no credentials configured, same as test/api/orders.test.js and
// test/api/payments.test.js already guard against.
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');
const { signProofUrl } = await import('../../lib/storage.js');

import { POST as adminLoginRoute } from '../../app/api/admin/auth/login/route.js';
import { GET as adminMeRoute } from '../../app/api/admin/auth/me/route.js';
import { GET as dashboardRoute } from '../../app/api/admin/dashboard/route.js';
import { GET as ordersListRoute } from '../../app/api/admin/orders/route.js';
import { GET as orderByIdRoute } from '../../app/api/admin/orders/[id]/route.js';
import { PATCH as orderStatusRoute } from '../../app/api/admin/orders/[id]/status/route.js';
import { GET as paymentsListRoute } from '../../app/api/admin/payments/route.js';
import { GET as paymentByIdRoute } from '../../app/api/admin/payments/[id]/route.js';
import { PATCH as paymentVerifyRoute } from '../../app/api/admin/payments/[id]/verify/route.js';
import { PATCH as paymentRejectRoute } from '../../app/api/admin/payments/[id]/reject/route.js';
import { GET as customersListRoute } from '../../app/api/admin/customers/route.js';
import { GET as customerByIdRoute } from '../../app/api/admin/customers/[id]/route.js';
import { PATCH as customerStatusRoute } from '../../app/api/admin/customers/[id]/status/route.js';
import { GET as productsListRoute, POST as productCreateRoute } from '../../app/api/admin/products/route.js';
import { PUT as productUpdateRoute, DELETE as productDeleteRoute } from '../../app/api/admin/products/[id]/route.js';
import { PATCH as productStatusRoute } from '../../app/api/admin/products/[id]/status/route.js';
import { GET as newsletterListRoute } from '../../app/api/admin/newsletter/route.js';
import { GET as newsletterExportRoute } from '../../app/api/admin/newsletter/export/route.js';
import { GET as auditLogsRoute } from '../../app/api/admin/audit-logs/route.js';

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

function patchRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {})
  });
}

function putRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {})
  });
}

function deleteRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'DELETE', headers });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

let userCounter = 0;
async function insertUser(overrides = {}) {
  userCounter += 1;
  const password = overrides.password ? await bcrypt.hash(overrides.password, 4) : null;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, phone, role, is_active, is_email_verified, password)
     values ($1, $2, $3, $4, $5, $6, true, $7)
     returning *`,
    [
      overrides.firstName || 'Admin',
      overrides.lastName || 'Tester',
      overrides.email || `admin-fixture-${userCounter}@zahzanmigrationtest.com`,
      overrides.phone || '03001234567',
      overrides.role || 'customer',
      overrides.isActive ?? true,
      password
    ]
  );
  return rows[0];
}

async function insertAdmin(overrides = {}) {
  return insertUser({ role: 'admin', password: 'AdminPass@123', ...overrides });
}

function tokenFor(user) {
  return generateToken(user.id, user.role);
}

function authHeader(user) {
  return { authorization: `Bearer ${tokenFor(user)}` };
}

let productCounter = 0;
async function insertProduct(overrides = {}) {
  productCounter += 1;
  const sku = overrides.sku || `ZHZ-ADM-${productCounter}-${Math.random().toString(36).slice(2, 6)}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, description, category, price, stock, is_active, images, color)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      overrides.name || 'Admin Test Product',
      overrides.slug || `admin-test-product-${sku.toLowerCase()}`,
      sku,
      overrides.description || '',
      overrides.category || 'Test Category',
      overrides.price ?? 5000,
      overrides.stock ?? 10,
      overrides.isActive ?? true,
      overrides.images || ['https://example.com/p.jpg'],
      overrides.color || 'Ivory'
    ]
  );
  return rows[0];
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
      overrides.orderNumber || `ZHZ-ADMTEST-${orderCounter}`,
      user.id,
      overrides.customerName || 'Sara Malik',
      overrides.customerEmail || user.email,
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

async function insertPayment(order, user, overrides = {}) {
  const { rows } = await query(
    `insert into payments (order_id, user_id, payment_method, amount, transaction_reference, proof_url, proof_public_id, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      order.id,
      user.id,
      overrides.paymentMethod || 'JazzCash',
      overrides.amount ?? order.total,
      overrides.transactionReference || `TXN${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      overrides.proofUrl || 'zahzan/payment-proofs/fixture',
      overrides.proofPublicId || 'zahzan/payment-proofs/fixture',
      overrides.status || 'Pending'
    ]
  );
  return rows[0];
}

async function insertSubscriber(overrides = {}) {
  const { rows } = await query(
    `insert into newsletter_subscribers (email, status, source)
     values ($1, $2, $3)
     returning *`,
    [
      overrides.email || `subscriber-${Math.random().toString(36).slice(2, 8)}@zahzanmigrationtest.com`,
      overrides.status || 'subscribed',
      overrides.source || 'footer'
    ]
  );
  return rows[0];
}

describe('app/api/admin/* route handlers (Task 13)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('POST /api/admin/auth/login -- shape matches tools/golden/054-admin.login.json', () => {
    it('an admin logs in successfully', async () => {
      const admin = await insertAdmin({ firstName: 'Contract', lastName: 'Admin' });

      const res = await adminLoginRoute(
        postRequest('/api/admin/auth/login', { email: admin.email, password: 'AdminPass@123' })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Admin login successful');
      expect(typeof body.token).toBe('string');
      expect(body.user).toEqual({
        id: admin.id,
        firstName: 'Contract',
        lastName: 'Admin',
        name: 'Contract Admin',
        email: admin.email,
        role: 'admin'
      });
    });

    it('GC4 quirk: the minted token carries the default role, NOT admin', async () => {
      const admin = await insertAdmin();
      const res = await adminLoginRoute(
        postRequest('/api/admin/auth/login', { email: admin.email, password: 'AdminPass@123' })
      );
      const body = await res.json();

      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.decode(body.token);
      expect(decoded.role).toBe('customer');
      expect(decoded.id).toBe(admin.id);
    });

    it('a customer account is rejected with 403', async () => {
      const customer = await insertUser({ password: 'CustPass@123' });
      const res = await adminLoginRoute(
        postRequest('/api/admin/auth/login', { email: customer.email, password: 'CustPass@123' })
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Access denied: Account does not have administrator privileges'
      });
    });

    it('wrong password -> 401 exact message', async () => {
      const admin = await insertAdmin();
      const res = await adminLoginRoute(
        postRequest('/api/admin/auth/login', { email: admin.email, password: 'WrongPassword' })
      );
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid administrator credentials'
      });
    });

    it('missing credentials -> 400 exact message', async () => {
      const res = await adminLoginRoute(postRequest('/api/admin/auth/login', { email: 'x@x.com' }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Please provide email and password'
      });
    });
  });

  describe('GET /api/admin/auth/me -- shape matches tools/golden/055-admin.me.json', () => {
    it('returns the narrow admin profile shape', async () => {
      const admin = await insertAdmin({ firstName: 'Contract', lastName: 'Admin' });
      const res = await adminMeRoute(getRequest('/api/admin/auth/me', authHeader(admin)));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        user: {
          id: admin.id,
          firstName: 'Contract',
          lastName: 'Admin',
          name: 'Contract Admin',
          email: admin.email,
          role: 'admin'
        }
      });
    });
  });

  describe('Auth ordering: 401 before 403, and a customer token is rejected on multiple admin routes', () => {
    it('no token -> 401 on GET /api/admin/dashboard', async () => {
      const res = await dashboardRoute(getRequest('/api/admin/dashboard'));
      expect(res.status).toBe(401);
    });

    it('a customer token -> 403 exact message on GET /api/admin/dashboard -- matches tools/golden/084', async () => {
      const customer = await insertUser();
      const res = await dashboardRoute(getRequest('/api/admin/dashboard', authHeader(customer)));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Access denied: Admin authorization required'
      });
    });

    it('a customer token -> 403 on GET /api/admin/orders -- matches tools/golden/085', async () => {
      const customer = await insertUser();
      const res = await ordersListRoute(getRequest('/api/admin/orders', authHeader(customer)));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Access denied: Admin authorization required'
      });
    });

    it('a customer token -> 403 on DELETE /api/admin/products/:id -- matches tools/golden/086', async () => {
      const customer = await insertUser();
      const product = await insertProduct();
      const res = await productDeleteRoute(
        deleteRequest(`/api/admin/products/${product.id}`, authHeader(customer)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Access denied: Admin authorization required'
      });
    });
  });

  describe('GET /api/admin/orders -- pagination/search/status, shape matches 057/058/059', () => {
    it('paginates, and totalPages is correct at an 11-row/limit-10 boundary', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'boundary-owner@zahzanmigrationtest.com' });
      for (let i = 0; i < 11; i++) {
        await insertOrder(owner, { orderStatus: 'Pending' });
      }

      const res = await ordersListRoute(getRequest('/api/admin/orders?limit=10', authHeader(admin)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(11);
      expect(body.currentPage).toBe(1);
      expect(body.totalPages).toBe(2);
      expect(body.orders).toHaveLength(10);

      const page2 = await ordersListRoute(getRequest('/api/admin/orders?limit=10&page=2', authHeader(admin)));
      const page2Body = await page2.json();
      expect(page2Body.orders).toHaveLength(1);
    });

    it('searches by customer name, and filters by status (anchored exact match)', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'search-owner@zahzanmigrationtest.com' });
      await insertOrder(owner, { customerName: 'Unique Search Name', orderStatus: 'Shipped' });
      await insertOrder(owner, { customerName: 'Someone Else', orderStatus: 'Pending' });

      const searchRes = await ordersListRoute(
        getRequest('/api/admin/orders?search=Unique Search', authHeader(admin))
      );
      const searchBody = await searchRes.json();
      expect(searchBody.orders.every((o) => o.customerName === 'Unique Search Name')).toBe(true);
      expect(searchBody.orders.length).toBeGreaterThanOrEqual(1);

      const statusRes = await ordersListRoute(getRequest('/api/admin/orders?status=Shipped', authHeader(admin)));
      const statusBody = await statusRes.json();
      expect(statusBody.orders.every((o) => o.orderStatus === 'Shipped')).toBe(true);

      // A substring that is NOT the full status must NOT match (anchored, not substring).
      const substringRes = await ordersListRoute(getRequest('/api/admin/orders?status=Ship', authHeader(admin)));
      const substringBody = await substringRes.json();
      expect(substringBody.orders.length).toBe(0);
    });

    it('items lack `id` on the admin list, but DO carry it after a status update -- Mongoose toObject() quirk', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'itemid-owner@zahzanmigrationtest.com' });
      const order = await insertOrder(owner, {
        items: [{ productId: null, productName: 'X', quantity: 1, unitPrice: 10, totalPrice: 10, _id: 'abc', id: 'abc' }]
      });

      const listRes = await ordersListRoute(getRequest('/api/admin/orders', authHeader(admin)));
      const listBody = await listRes.json();
      const listedOrder = listBody.orders.find((o) => o._id === order.id);
      expect(listedOrder.items[0]).not.toHaveProperty('id');

      const detailRes = await orderByIdRoute(
        getRequest(`/api/admin/orders/${order.id}`, authHeader(admin)),
        paramsContext({ id: order.id })
      );
      const detailBody = await detailRes.json();
      expect(detailBody.order.items[0]).not.toHaveProperty('id');

      const statusRes = await orderStatusRoute(
        patchRequest(`/api/admin/orders/${order.id}/status`, { orderStatus: 'Confirmed' }, authHeader(admin)),
        paramsContext({ id: order.id })
      );
      const statusBody = await statusRes.json();
      expect(statusBody.order.items[0]).toHaveProperty('id');
    });

    // Final whole-branch review, TEST + DOC ACCURACY item: this is one of
    // four correctly-signed proofUrl sites that lacked a regression
    // assertion (the other three: PATCH .../verify, PATCH .../reject, and
    // GET /api/payments/order/:orderId). Same pattern as
    // test/api/orders.test.js:401 and this file's own GET /api/admin/orders/:id
    // test just above.
    it('nested order.payment.proofUrl is freshly signed, not the raw stored path', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'list-nested-payment-owner@zahzanmigrationtest.com' });
      const order = await insertOrder(owner);
      const payment = await insertPayment(order, owner);

      const res = await ordersListRoute(getRequest('/api/admin/orders', authHeader(admin)));
      expect(res.status).toBe(200);
      const body = await res.json();
      const listedOrder = body.orders.find((o) => o._id === order.id);
      expect(listedOrder.payment._id).toBe(payment.id);

      const resigned = await signProofUrl(payment.proof_public_id);
      expect(listedOrder.payment.proofUrl).not.toBe(payment.proof_url);
      expect(listedOrder.payment.proofUrl).toBe(resigned);
    });
  });

  describe('GET /api/admin/orders/:id -- shape matches tools/golden/099-extra2.admin-order-by-id.json', () => {
    it('returns the order with payment nested inside AND as a top-level sibling', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'nested-payment-owner@zahzanmigrationtest.com' });
      const order = await insertOrder(owner);
      const payment = await insertPayment(order, owner);

      const res = await orderByIdRoute(
        getRequest(`/api/admin/orders/${order.id}`, authHeader(admin)),
        paramsContext({ id: order.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.order.payment._id).toBe(payment.id);
      expect(body.payment._id).toBe(payment.id);

      // Task 15 Critical-1 regression test (same pattern as
      // test/api/orders.test.js:401): BOTH copies (nested under order, and
      // the top-level sibling) must carry a freshly signed proof URL, never
      // the raw stored path.
      const resigned = await signProofUrl(payment.proof_public_id);
      expect(body.order.payment.proofUrl).not.toBe(payment.proof_url);
      expect(body.order.payment.proofUrl).toBe(resigned);
      expect(body.payment.proofUrl).not.toBe(payment.proof_url);
      expect(body.payment.proofUrl).toBe(resigned);
    });

    it('order not found -> 404', async () => {
      const admin = await insertAdmin();
      const res = await orderByIdRoute(
        getRequest('/api/admin/orders/00000000-0000-0000-0000-000000000000', authHeader(admin)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Order not found' });
    });
  });

  describe('PATCH /api/admin/orders/:id/status -- shape matches tools/golden/072', () => {
    it('updates the status, restores stock on cancel, and writes an ORDER_STATUS_CHANGED audit log', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'status-owner@zahzanmigrationtest.com' });
      const product = await insertProduct({ stock: 5 });
      const order = await insertOrder(owner, {
        orderStatus: 'Confirmed',
        items: [{ productId: product.id, productName: product.name, quantity: 2, unitPrice: 100, totalPrice: 200 }]
      });

      const res = await orderStatusRoute(
        patchRequest(`/api/admin/orders/${order.id}/status`, { orderStatus: 'Cancelled' }, authHeader(admin)),
        paramsContext({ id: order.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Order status updated to Cancelled');
      expect(body.order.orderStatus).toBe('Cancelled');

      const { rows: productRows } = await query('select stock from products where id = $1', [product.id]);
      expect(productRows[0].stock).toBe(7); // 5 + 2 restored

      const { rows: logRows } = await query(
        `select * from audit_logs where action = 'ORDER_STATUS_CHANGED' and entity_id = $1 order by created_at desc limit 1`,
        [order.id]
      );
      expect(logRows).toHaveLength(1);
      expect(logRows[0].metadata.previousStatus).toBe('Confirmed');
      expect(logRows[0].metadata.newStatus).toBe('Cancelled');
    });

    it('invalid status -> 400 exact message', async () => {
      const admin = await insertAdmin();
      const owner = await insertUser({ email: 'invalid-status-owner@zahzanmigrationtest.com' });
      const order = await insertOrder(owner);

      const res = await orderStatusRoute(
        patchRequest(`/api/admin/orders/${order.id}/status`, { orderStatus: 'Bogus' }, authHeader(admin)),
        paramsContext({ id: order.id })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid order status. Allowed:');
    });
  });

  describe('GET /api/admin/customers -- pagination/search, status ignored -- shape matches 063/064/065', () => {
    it('paginates and searches; a status param has NO effect (source never reads it)', async () => {
      const admin = await insertAdmin();
      await insertUser({ firstName: 'FindMeCustomer', email: 'findme@zahzanmigrationtest.com' });
      await insertUser({ firstName: 'Other', email: 'other-customer@zahzanmigrationtest.com' });

      const searchRes = await customersListRoute(
        getRequest('/api/admin/customers?search=FindMeCustomer', authHeader(admin))
      );
      const searchBody = await searchRes.json();
      expect(searchBody.customers).toHaveLength(1);
      expect(searchBody.customers[0].firstName).toBe('FindMeCustomer');

      const allRes = await customersListRoute(getRequest('/api/admin/customers', authHeader(admin)));
      const allBody = await allRes.json();
      const statusRes = await customersListRoute(
        getRequest('/api/admin/customers?status=active', authHeader(admin))
      );
      const statusBody = await statusRes.json();
      expect(statusBody.total).toBe(allBody.total);
    });
  });

  describe('GET /api/admin/customers/:id -- shape matches tools/golden/101', () => {
    it('returns the customer with addresses and orders', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'detail-customer@zahzanmigrationtest.com' });
      await insertOrder(customer);

      const res = await customerByIdRoute(
        getRequest(`/api/admin/customers/${customer.id}`, authHeader(admin)),
        paramsContext({ id: customer.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.customer._id).toBe(customer.id);
      expect(body.orders).toHaveLength(1);
      expect(body.addresses).toEqual([]);
    });
  });

  describe('PATCH /api/admin/customers/:id/status -- shape matches tools/golden/080', () => {
    it('deactivates a customer and writes a CUSTOMER_STATUS_UPDATED audit log', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'toggle-customer@zahzanmigrationtest.com' });

      const res = await customerStatusRoute(
        patchRequest(`/api/admin/customers/${customer.id}/status`, { isActive: false }, authHeader(admin)),
        paramsContext({ id: customer.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Customer account deactivated successfully');
      expect(body.customer.isActive).toBe(false);

      const { rows: logRows } = await query(
        `select * from audit_logs where action = 'CUSTOMER_STATUS_UPDATED' and entity_id = $1`,
        [customer.id]
      );
      expect(logRows).toHaveLength(1);
    });
  });

  describe('GET /api/admin/products -- pagination/search/category/status -- shape matches 066/067/068', () => {
    it('paginates, searches, and filters by category (anchored) and status', async () => {
      const admin = await insertAdmin();
      await insertProduct({ name: 'FindableWidget', category: 'Widgets', isActive: true });
      await insertProduct({ name: 'Other Product', category: 'Gadgets', isActive: false });

      const searchRes = await productsListRoute(
        getRequest('/api/admin/products?search=FindableWidget', authHeader(admin))
      );
      const searchBody = await searchRes.json();
      expect(searchBody.products.some((p) => p.name === 'FindableWidget')).toBe(true);

      const categoryRes = await productsListRoute(
        getRequest('/api/admin/products?category=Widgets', authHeader(admin))
      );
      const categoryBody = await categoryRes.json();
      expect(categoryBody.products.every((p) => p.category === 'Widgets')).toBe(true);

      const activeRes = await productsListRoute(
        getRequest('/api/admin/products?status=active', authHeader(admin))
      );
      const activeBody = await activeRes.json();
      expect(activeBody.products.every((p) => p.isActive === true)).toBe(true);

      const deactivatedRes = await productsListRoute(
        getRequest('/api/admin/products?status=deactivated', authHeader(admin))
      );
      const deactivatedBody = await deactivatedRes.json();
      expect(deactivatedBody.products.every((p) => p.isActive === false)).toBe(true);
    });
  });

  describe('POST /api/admin/products -- shape matches tools/golden/075', () => {
    it('creates a product, uppercases the SKU, and writes a PRODUCT_CREATED audit log', async () => {
      const admin = await insertAdmin();
      const res = await productCreateRoute(
        postRequest(
          '/api/admin/products',
          { name: 'Amber Velvet Coat', price: 22000, sku: 'zhz-adm-t1', category: 'Coats', stock: 8 },
          authHeader(admin)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Product created successfully');
      expect(body.product.sku).toBe('ZHZ-ADM-T1');
      expect(body.product.isActive).toBe(true);

      const { rows: logRows } = await query(
        `select * from audit_logs where action = 'PRODUCT_CREATED' and entity_id = $1`,
        [body.product._id]
      );
      expect(logRows).toHaveLength(1);
    });

    it('a duplicate SKU -> 400 exact message', async () => {
      const admin = await insertAdmin();
      await insertProduct({ sku: 'ZHZ-DUP-1' });
      const res = await productCreateRoute(
        postRequest(
          '/api/admin/products',
          { name: 'Dup', price: 100, sku: 'zhz-dup-1', category: 'Test', stock: 1 },
          authHeader(admin)
        )
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Product with SKU "ZHZ-DUP-1" already exists in database.');
    });

    // Implicit `trim: true` parity (fix-implicit-trim-report.md): the source
    // controller never trimmed sizes/colors/color/fabric/work/
    // careInstructions/images/image/hoverImage explicitly -- Mongoose's
    // schema cast did it silently on assignment. Submitting padded
    // whitespace and reading the STORED row back proves this write path
    // reproduces that cast.
    it('trims sizes/colors/color/fabric/work/careInstructions/images/image/hoverImage, matching the old Mongoose schema cast', async () => {
      const admin = await insertAdmin();
      const res = await productCreateRoute(
        postRequest(
          '/api/admin/products',
          {
            name: 'Padded Admin Product',
            price: 12000,
            sku: 'zhz-adm-trim-1',
            category: 'Coats',
            stock: 4,
            sizes: ['  S  ', ' M '],
            colors: ['  Ivory  ', { name: ' Rose ', hex: '#F00', image: ' https://example.com/rose.jpg ' }],
            color: '  Ivory  ',
            fabric: '  Velvet  ',
            work: '  Zari Work  ',
            careInstructions: ['  Hand wash only  '],
            images: ['  https://example.com/a.jpg  ', ' https://example.com/b.jpg '],
            hoverImage: '  https://example.com/hover.jpg  '
          },
          authHeader(admin)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);

      const { rows } = await query('select * from products where id = $1', [body.product._id]);
      const stored = rows[0];
      expect(stored.sizes).toEqual(['S', 'M']);
      expect(stored.colors).toEqual([
        { name: 'Ivory', hex: '#FFFFFF', image: 'https://example.com/a.jpg' },
        { name: 'Rose', hex: '#F00', image: 'https://example.com/rose.jpg' }
      ]);
      expect(stored.color).toBe('Ivory');
      expect(stored.fabric).toBe('Velvet');
      expect(stored.work).toBe('Zari Work');
      expect(stored.care_instructions).toEqual(['Hand wash only']);
      expect(stored.images).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
      expect(stored.hover_image).toBe('https://example.com/hover.jpg');

      // Negative: name/description/category were already explicitly trimmed
      // by the source controller (`name.trim()` etc.) before this fix --
      // still correctly trimmed, not double-handled into anything different.
      expect(stored.name).toBe('Padded Admin Product');
    });
  });

  describe('PUT /api/admin/products/:id -- shape matches tools/golden/076', () => {
    it('updates price/stock and writes a STOCK_UPDATED audit log when stock changed', async () => {
      const admin = await insertAdmin();
      const product = await insertProduct({ price: 22000, stock: 8 });

      const res = await productUpdateRoute(
        putRequest(`/api/admin/products/${product.id}`, { price: 23000, stock: 6 }, authHeader(admin)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Product updated successfully');
      expect(body.product.price).toBe(23000);
      expect(body.product.stock).toBe(6);

      const { rows: logRows } = await query(
        `select * from audit_logs where action = 'STOCK_UPDATED' and entity_id = $1`,
        [product.id]
      );
      expect(logRows).toHaveLength(1);
    });

    // Implicit `trim: true` parity (fix-implicit-trim-report.md): the source
    // controller's field-loop (`product[field] = req.body[field]`) never
    // trimmed anything explicitly -- Mongoose's schema cast on assignment
    // did it silently before product.save(). This PUT route previously
    // reproduced NONE of it. Submitting padded whitespace across every
    // affected field and reading the STORED row back proves the fix.
    it('trims every implicitly-trimmed field on update, matching the old Mongoose schema cast', async () => {
      const admin = await insertAdmin();
      const product = await insertProduct({ name: 'Original Name', category: 'OriginalCat' });

      const res = await productUpdateRoute(
        putRequest(
          `/api/admin/products/${product.id}`,
          {
            name: '  Updated Padded Name  ',
            description: '  Updated padded description  ',
            sku: '  zhz-upd-trim-1  ',
            category: '  UpdatedCat  ',
            color: '  Rose  ',
            fabric: '  Chiffon  ',
            work: '  Block Print  ',
            sizes: ['  S  ', ' L '],
            careInstructions: ['  Iron on low heat  '],
            images: ['  https://example.com/upd-a.jpg  ', ' https://example.com/upd-b.jpg '],
            colors: ['  Padded String Color  ', { name: ' Object Color ', hex: ' #ABC ' }]
          },
          authHeader(admin)
        ),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const { rows } = await query('select * from products where id = $1', [product.id]);
      const stored = rows[0];
      expect(stored.name).toBe('Updated Padded Name');
      expect(stored.description).toBe('Updated padded description');
      expect(stored.sku).toBe('ZHZ-UPD-TRIM-1');
      expect(stored.category).toBe('UpdatedCat');
      expect(stored.color).toBe('Rose');
      expect(stored.fabric).toBe('Chiffon');
      expect(stored.work).toBe('Block Print');
      expect(stored.sizes).toEqual(['S', 'L']);
      expect(stored.care_instructions).toEqual(['Iron on low heat']);
      expect(stored.images).toEqual(['https://example.com/upd-a.jpg', 'https://example.com/upd-b.jpg']);
      // image/hoverImage are unconditionally re-derived from the
      // (now-trimmed) images[0]/images[1] by the source's own post-loop
      // logic -- reproduced unchanged, so they inherit the trim too.
      expect(stored.image).toBe('https://example.com/upd-a.jpg');
      expect(stored.hover_image).toBe('https://example.com/upd-b.jpg');
      expect(stored.colors).toEqual([
        { name: 'Padded String Color', hex: '#FFFFFF' },
        { name: 'Object Color', hex: '#ABC' }
      ]);

      // Negative: price/stock (not string fields the schema trims) are
      // untouched by this same request.
      expect(Number(stored.price)).toBe(Number(product.price));
      expect(stored.stock).toBe(product.stock);
    });

    it('a field NOT present in the request body is left completely untouched, including its pre-existing whitespace', async () => {
      // Negative test: seed a product whose stored `work` value already
      // carries no whitespace (a clean baseline), then update ONLY `price`.
      // `work` must round-trip byte-identical -- proving this fix only acts
      // on fields the request actually supplied, exactly like Mongoose only
      // re-casts a path that was actually assigned.
      const admin = await insertAdmin();
      const product = await insertProduct({ price: 1000 });
      await query('update products set work = $1 where id = $2', ['Untouched Work Value', product.id]);

      const res = await productUpdateRoute(
        putRequest(`/api/admin/products/${product.id}`, { price: 1500 }, authHeader(admin)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);

      const { rows } = await query('select work, price from products where id = $1', [product.id]);
      expect(rows[0].work).toBe('Untouched Work Value');
      expect(Number(rows[0].price)).toBe(1500);
    });
  });

  describe('PATCH /api/admin/products/:id/status -- shape matches tools/golden/077', () => {
    it('toggles isActive when no body is supplied', async () => {
      const admin = await insertAdmin();
      const product = await insertProduct({ isActive: true });

      const res = await productStatusRoute(
        patchRequest(`/api/admin/products/${product.id}/status`, {}, authHeader(admin)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Product deactivated successfully');
      expect(body.product.isActive).toBe(false);
    });
  });

  describe('DELETE /api/admin/products/:id -- soft vs permanent, shape matches 078/079', () => {
    it('soft-deletes by default: the row stays, is_active flips to false', async () => {
      const admin = await insertAdmin();
      const product = await insertProduct({ isActive: true });

      const res = await productDeleteRoute(
        deleteRequest(`/api/admin/products/${product.id}`, authHeader(admin)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Product deactivated successfully');
      expect(body.product.isActive).toBe(false);

      const { rows } = await query('select * from products where id = $1', [product.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].is_active).toBe(false);
    });

    it('?permanent=true removes the row entirely and writes a PRODUCT_PERMANENTLY_DELETED audit log', async () => {
      const admin = await insertAdmin();
      const product = await insertProduct();

      const res = await productDeleteRoute(
        deleteRequest(`/api/admin/products/${product.id}?permanent=true`, authHeader(admin)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, message: 'Product permanently deleted from database' });

      const { rows } = await query('select * from products where id = $1', [product.id]);
      expect(rows).toHaveLength(0);

      const { rows: logRows } = await query(
        `select * from audit_logs where action = 'PRODUCT_PERMANENTLY_DELETED' and entity_id = $1`,
        [product.id]
      );
      expect(logRows).toHaveLength(1);
    });

    it('product not found -> 404', async () => {
      const admin = await insertAdmin();
      const res = await productDeleteRoute(
        deleteRequest('/api/admin/products/00000000-0000-0000-0000-000000000000', authHeader(admin)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Four-way FK cascade (controller ruling, task-13-brief.md): a permanent delete cannot 500', () => {
    it('a product referenced by story_submissions, tryon_jobs, cart_items AND wishlist_items all at once deletes cleanly, and every dependent row is gone', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'cascade4-customer@zahzanmigrationtest.com' });
      const product = await insertProduct({ name: 'Four-Way Cascade Product' });

      // story_submissions
      const { rows: storyRows } = await query(
        `insert into story_submissions (user_id, name, image, product_id) values ($1, $2, $3, $4) returning id`,
        [customer.id, 'Cascade Story', 'https://example.com/story.jpg', product.id]
      );
      // tryon_jobs
      const { rows: tryonRows } = await query(
        `insert into tryon_jobs (user_id, product_id, input_image) values ($1, $2, $3) returning id`,
        [customer.id, product.id, 'https://example.com/input.jpg']
      );
      // cart_items
      const { rows: cartRows } = await query('insert into carts (user_id) values ($1) returning id', [customer.id]);
      const { rows: cartItemRows } = await query(
        `insert into cart_items (cart_id, product_id) values ($1, $2) returning id`,
        [cartRows[0].id, product.id]
      );
      // wishlist_items
      const { rows: wishlistRows } = await query(
        `insert into wishlist_items (user_id, product_id) values ($1, $2) returning id`,
        [customer.id, product.id]
      );

      expect(storyRows).toHaveLength(1);
      expect(tryonRows).toHaveLength(1);
      expect(cartItemRows).toHaveLength(1);
      expect(wishlistRows).toHaveLength(1);

      const res = await productDeleteRoute(
        deleteRequest(`/api/admin/products/${product.id}?permanent=true`, authHeader(admin)),
        paramsContext({ id: product.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const { rows: storyAfter } = await query('select id from story_submissions where id = $1', [storyRows[0].id]);
      const { rows: tryonAfter } = await query('select id from tryon_jobs where id = $1', [tryonRows[0].id]);
      const { rows: cartItemAfter } = await query('select id from cart_items where id = $1', [cartItemRows[0].id]);
      const { rows: wishlistAfter } = await query('select id from wishlist_items where id = $1', [
        wishlistRows[0].id
      ]);

      expect(storyAfter).toHaveLength(0);
      expect(tryonAfter).toHaveLength(0);
      expect(cartItemAfter).toHaveLength(0);
      expect(wishlistAfter).toHaveLength(0);

      const { rows: productAfter } = await query('select id from products where id = $1', [product.id]);
      expect(productAfter).toHaveLength(0);
    });
  });

  describe('GET /api/admin/payments -- pagination/search/status -- shape matches 060/061/062', () => {
    it('paginates, populates orderId/userId, searches and filters by status', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'payment-list-customer@zahzanmigrationtest.com' });
      const order = await insertOrder(customer, { orderNumber: 'ZHZ-PAYLIST-1' });
      const payment = await insertPayment(order, customer, { transactionReference: 'FINDMEREF001' });

      const listRes = await paymentsListRoute(getRequest('/api/admin/payments', authHeader(admin)));
      const listBody = await listRes.json();
      const found = listBody.payments.find((p) => p._id === payment.id);
      expect(found.orderId._id).toBe(order.id);
      expect(found.orderId.orderNumber).toBe(order.order_number);
      expect(found.userId._id).toBe(customer.id);
      expect(found.userId.phone).toBe(customer.phone);

      // Task 15 Critical-1 regression test (same pattern as
      // test/api/orders.test.js:401): proof_url stores a raw storage PATH
      // (lib/storage.js's private-bucket design), so the list response must
      // carry a freshly SIGNED url, never the stored path verbatim.
      expect(found.proofUrl).not.toBe(payment.proof_url);
      const resigned = await signProofUrl(payment.proof_public_id);
      expect(found.proofUrl).toBe(resigned);

      const searchRes = await paymentsListRoute(
        getRequest('/api/admin/payments?search=FINDMEREF001', authHeader(admin))
      );
      const searchBody = await searchRes.json();
      expect(searchBody.payments.some((p) => p._id === payment.id)).toBe(true);

      const statusRes = await paymentsListRoute(getRequest('/api/admin/payments?status=Pending', authHeader(admin)));
      const statusBody = await statusRes.json();
      expect(statusBody.payments.every((p) => p.status === 'Pending')).toBe(true);
    });
  });

  describe('GET /api/admin/payments/:id -- shape matches tools/golden/100', () => {
    it('returns the full populated order and user summaries', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'payment-detail-customer@zahzanmigrationtest.com' });
      const order = await insertOrder(customer);
      const payment = await insertPayment(order, customer);

      const res = await paymentByIdRoute(
        getRequest(`/api/admin/payments/${payment.id}`, authHeader(admin)),
        paramsContext({ id: payment.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.orderId._id).toBe(order.id);
      expect(body.payment.orderId.customerName).toBe(order.customer_name);
      expect(body.payment.userId.email).toBe(customer.email);

      // Task 15 Critical-1 regression test (same pattern as
      // test/api/orders.test.js:401): the detail response must carry a
      // freshly signed proof URL, never the raw stored path.
      expect(body.payment.proofUrl).not.toBe(payment.proof_url);
      const resigned = await signProofUrl(payment.proof_public_id);
      expect(body.payment.proofUrl).toBe(resigned);
    });

    it('payment not found -> 404', async () => {
      const admin = await insertAdmin();
      const res = await paymentByIdRoute(
        getRequest('/api/admin/payments/00000000-0000-0000-0000-000000000000', authHeader(admin)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/admin/payments/:id/verify -- shape matches tools/golden/073', () => {
    it('flips the payment to Verified, confirms a Pending order, and is idempotent-safe (second call 400)', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'verify-customer@zahzanmigrationtest.com' });
      const order = await insertOrder(customer, { orderStatus: 'Pending', paymentStatus: 'submitted' });
      const payment = await insertPayment(order, customer);

      const res = await paymentVerifyRoute(
        patchRequest(`/api/admin/payments/${payment.id}/verify`, {}, authHeader(admin)),
        paramsContext({ id: payment.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Payment verified successfully');
      expect(body.payment.status).toBe('Verified');
      expect(body.payment.verifiedBy).toBe(admin.id);
      expect(body.order.paymentStatus).toBe('verified');
      expect(body.order.orderStatus).toBe('Confirmed');

      // Final whole-branch review, TEST + DOC ACCURACY item: this correctly-
      // signed site lacked a regression assertion. Same pattern as
      // test/api/orders.test.js:401.
      const resignedVerify = await signProofUrl(payment.proof_public_id);
      expect(body.payment.proofUrl).not.toBe(payment.proof_url);
      expect(body.payment.proofUrl).toBe(resignedVerify);

      const { rows: orderRows } = await query('select payment_status, order_status from orders where id = $1', [
        order.id
      ]);
      expect(orderRows[0].payment_status).toBe('verified');
      expect(orderRows[0].order_status).toBe('Confirmed');

      // Idempotent-safe: verifying an already-processed payment 400s, doesn't 500 or double-apply.
      const second = await paymentVerifyRoute(
        patchRequest(`/api/admin/payments/${payment.id}/verify`, {}, authHeader(admin)),
        paramsContext({ id: payment.id })
      );
      expect(second.status).toBe(400);
      const secondBody = await second.json();
      expect(secondBody.message).toBe('Payment has already been processed and is currently "Verified".');
    });

    it('payment not found -> 404', async () => {
      const admin = await insertAdmin();
      const res = await paymentVerifyRoute(
        patchRequest('/api/admin/payments/00000000-0000-0000-0000-000000000000/verify', {}, authHeader(admin)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/admin/payments/:id/reject -- shape matches tools/golden/074', () => {
    it('flips the payment to Rejected and the order paymentStatus to rejected', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'reject-customer@zahzanmigrationtest.com' });
      const order = await insertOrder(customer, { orderStatus: 'Confirmed', paymentStatus: 'submitted' });
      const payment = await insertPayment(order, customer);

      const res = await paymentRejectRoute(
        patchRequest(
          `/api/admin/payments/${payment.id}/reject`,
          { rejectionReason: 'Transaction reference could not be matched to bank statement.' },
          authHeader(admin)
        ),
        paramsContext({ id: payment.id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Payment rejected');
      expect(body.payment.status).toBe('Rejected');
      expect(body.payment.rejectionReason).toBe('Transaction reference could not be matched to bank statement.');
      expect(body.order.paymentStatus).toBe('rejected');
      // orderStatus is untouched by reject (unlike verify).
      expect(body.order.orderStatus).toBe('Confirmed');

      // Final whole-branch review, TEST + DOC ACCURACY item: this correctly-
      // signed site lacked a regression assertion. Same pattern as
      // test/api/orders.test.js:401.
      const resignedReject = await signProofUrl(payment.proof_public_id);
      expect(body.payment.proofUrl).not.toBe(payment.proof_url);
      expect(body.payment.proofUrl).toBe(resignedReject);
    });

    it('missing rejectionReason -> 400 exact message', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'reject-missing-reason@zahzanmigrationtest.com' });
      const order = await insertOrder(customer);
      const payment = await insertPayment(order, customer);

      const res = await paymentRejectRoute(
        patchRequest(`/api/admin/payments/${payment.id}/reject`, {}, authHeader(admin)),
        paramsContext({ id: payment.id })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe(
        'A rejection reason is required (e.g. Invalid reference ID, incorrect amount, unclear receipt).'
      );
    });
  });

  describe('GET /api/admin/newsletter -- pagination/search/status -- shape matches 069/070/071', () => {
    it('paginates, searches, and filters by exact (non-anchored-regex) lowercased status', async () => {
      const admin = await insertAdmin();
      await insertSubscriber({ email: 'findme-subscriber@zahzanmigrationtest.com', status: 'subscribed' });
      await insertSubscriber({ email: 'other-subscriber@zahzanmigrationtest.com', status: 'unsubscribed' });

      const searchRes = await newsletterListRoute(
        getRequest('/api/admin/newsletter?search=findme-subscriber', authHeader(admin))
      );
      const searchBody = await searchRes.json();
      expect(searchBody.subscribers).toHaveLength(1);

      const statusRes = await newsletterListRoute(
        getRequest('/api/admin/newsletter?status=subscribed', authHeader(admin))
      );
      const statusBody = await statusRes.json();
      expect(statusBody.subscribers.every((s) => s.status === 'subscribed')).toBe(true);
      expect(statusBody.stats).toEqual({
        totalSubscribers: expect.any(Number),
        activeSubscribers: expect.any(Number),
        unsubscribedSubscribers: expect.any(Number)
      });
    });
  });

  describe('GET /api/admin/newsletter/export -- shape matches tools/golden/081', () => {
    it('returns text/csv with the exact column header order', async () => {
      const admin = await insertAdmin();
      await insertSubscriber({ email: 'csv-subscriber@zahzanmigrationtest.com', status: 'subscribed' });

      const res = await newsletterExportRoute(getRequest('/api/admin/newsletter/export', authHeader(admin)));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const text = await res.text();
      expect(text.startsWith('Email,Status,Source,Subscribed Date,Unsubscribed Date\n')).toBe(true);
      expect(text).toContain('csv-subscriber@zahzanmigrationtest.com');

      const { rows: logRows } = await query(`select * from audit_logs where action = 'NEWSLETTER_EXPORT'`);
      expect(logRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/admin/audit-logs -- shape matches tools/golden/082', () => {
    it('lists logs with a populated adminId, filterable by anchored exact action', async () => {
      const admin = await insertAdmin();
      // Generate at least one log via a real admin action.
      await insertAdmin({ email: `other-admin-${Date.now()}@zahzanmigrationtest.com` });
      const product = await insertProduct();
      await productStatusRoute(
        patchRequest(`/api/admin/products/${product.id}/status`, {}, authHeader(admin)),
        paramsContext({ id: product.id })
      );

      const res = await auditLogsRoute(getRequest('/api/admin/audit-logs', authHeader(admin)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.logs.length).toBeGreaterThanOrEqual(1);
      const entry = body.logs.find((l) => l.action === 'PRODUCT_DEACTIVATED');
      expect(entry.adminId).toEqual({
        _id: admin.id,
        firstName: admin.first_name,
        lastName: admin.last_name,
        email: admin.email,
        name: `${admin.first_name} ${admin.last_name}`,
        id: admin.id
      });

      const filteredRes = await auditLogsRoute(
        getRequest('/api/admin/audit-logs?action=PRODUCT_DEACTIVATED', authHeader(admin))
      );
      const filteredBody = await filteredRes.json();
      expect(filteredBody.logs.every((l) => l.action === 'PRODUCT_DEACTIVATED')).toBe(true);
    });
  });

  describe('GET /api/admin/dashboard -- shape matches tools/golden/056', () => {
    it('matches hand-computed fixtures, including the low-stock partition', async () => {
      const admin = await insertAdmin();
      const customer = await insertUser({ email: 'dashboard-customer@zahzanmigrationtest.com' });

      // Orders: 1 Pending (revenue-counted), 1 Cancelled (revenue-excluded).
      await insertOrder(customer, { orderStatus: 'Pending', total: 1000 });
      await insertOrder(customer, { orderStatus: 'Cancelled', total: 5000 });

      // Inventory: one low-stock (stock 2, > 0), one out-of-stock (stock 0),
      // one well-stocked (stock 50, excluded from lowStockProducts entirely).
      await insertProduct({ name: 'Low Stock Item', stock: 2, isActive: true });
      await insertProduct({ name: 'Out Of Stock Item', stock: 0, isActive: true });
      await insertProduct({ name: 'Well Stocked Item', stock: 50, isActive: true });
      // An inactive low-stock product must NOT appear (source: isActive: true in the query).
      await insertProduct({ name: 'Inactive Low Stock', stock: 1, isActive: false });

      const res = await dashboardRoute(getRequest('/api/admin/dashboard', authHeader(admin)));
      expect(res.status).toBe(200);
      const body = await res.json();
      const stats = body.stats;

      expect(stats.orders.total).toBeGreaterThanOrEqual(2);
      expect(stats.orders.pending).toBeGreaterThanOrEqual(1);
      expect(stats.orders.cancelled).toBeGreaterThanOrEqual(1);
      expect(stats.revenue).toBeGreaterThanOrEqual(1000);

      const names = stats.inventory.lowStockProducts.map((p) => p.name);
      expect(names).toContain('Low Stock Item');
      expect(names).toContain('Out Of Stock Item');
      expect(names).not.toContain('Well Stocked Item');
      expect(names).not.toContain('Inactive Low Stock');

      expect(stats.inventory.lowStockCount).toBeGreaterThanOrEqual(1); // stock > 0
      expect(stats.inventory.outOfStockCount).toBeGreaterThanOrEqual(1); // stock === 0

      // Hand-verify the partition arithmetic directly against the raw list.
      const handLowCount = stats.inventory.lowStockProducts.filter((p) => p.stock > 0).length;
      const handOutCount = stats.inventory.lowStockProducts.filter((p) => p.stock === 0).length;
      expect(stats.inventory.lowStockCount).toBe(handLowCount);
      expect(stats.inventory.outOfStockCount).toBe(handOutCount);

      expect(stats.customers.recent[0]).toHaveProperty('phone');
      expect(stats.customers.recent[0]).toHaveProperty('createdAt');
      expect(stats.newsletter).toHaveProperty('totalSubscribers');
      expect(stats.payments).toHaveProperty('pending');
      expect(Array.isArray(stats.recentOrders)).toBe(true);
      if (stats.recentOrders.length > 0 && stats.recentOrders[0].items.length > 0) {
        // recentOrders serializes via plain serializeOrder (live-document
        // path), so items DO carry `id` -- confirmed against golden 056.
        expect(stats.recentOrders[0].items[0]).toHaveProperty('id');
      }
    });
  });
});
