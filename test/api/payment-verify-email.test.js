// Verifying a payment must send the customer exactly ONE email.
//
// Before this test, PATCH /api/admin/payments/:id/verify fired
// sendCustomerPaymentVerifiedEmail AND sendCustomerOrderStatusEmail(order,
// 'Confirmed') together in one Promise.all, so the customer received two
// messages for a single admin action. The payment-verified template already
// states "Your order status has now been advanced to Confirmed"
// (lib/email.js), which made the second message pure repetition.
//
// This is a DELIBERATE divergence from the migrated Express behaviour, not a
// parity defect -- see docs/PARITY_REPORT.md §12, ruling P1. No golden capture
// diverges: tools/golden/ records only method/path/requestBody/status/
// responseBody, and email dispatch is a side effect outside the HTTP response.
//
// Lives in its own file rather than in admin.test.js because vi.mock is
// hoisted and file-scoped: mocking lib/email.js inside admin.test.js would
// silently replace the email layer for all ~200 tests in that file.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

// Hoisted so the vi.mock factory below (itself hoisted above these imports)
// can close over the spies.
const { paymentVerifiedSpy, orderStatusSpy } = vi.hoisted(() => ({
  paymentVerifiedSpy: vi.fn().mockResolvedValue(true),
  orderStatusSpy: vi.fn().mockResolvedValue(true)
}));

vi.mock('../../lib/email.js', () => ({
  sendCustomerPaymentVerifiedEmail: paymentVerifiedSpy,
  sendCustomerOrderStatusEmail: orderStatusSpy,
  // Mirrors the real dispatch(): await the promise, swallow failures.
  dispatch: async (promise) => {
    try {
      return await promise;
    } catch {
      return undefined;
    }
  }
}));

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

const { PATCH: paymentVerifyRoute } = await import(
  '../../app/api/admin/payments/[id]/verify/route.js'
);
const { PATCH: orderStatusRoute } = await import(
  '../../app/api/admin/orders/[id]/status/route.js'
);

function patchRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {})
  });
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
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      overrides.firstName || 'Verify',
      overrides.lastName || 'Fixture',
      overrides.email || `verify-email-${userCounter}@zahzanmigrationtest.com`,
      overrides.phone || '03001234567',
      overrides.role || 'customer',
      overrides.isActive ?? true,
      true,
      password
    ]
  );
  return rows[0];
}

function authHeader(user) {
  return { authorization: `Bearer ${generateToken(user.id, user.role)}` };
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
      `ZHZ-VERIFYEMAIL-${orderCounter}`,
      user.id,
      'Sara Malik',
      user.email,
      '03007654321',
      JSON.stringify([]),
      JSON.stringify({
        fullName: 'Sara Malik',
        phone: '03007654321',
        addressLine1: '123 Gulberg Boulevard',
        city: 'Lahore',
        state: 'Punjab',
        postalCode: '54000',
        country: 'Pakistan'
      }),
      8500,
      250,
      8750,
      'JazzCash',
      'pending',
      overrides.orderStatus || 'Pending'
    ]
  );
  return rows[0];
}

async function insertPayment(order, user) {
  const { rows } = await query(
    `insert into payments (order_id, user_id, payment_method, amount, transaction_reference, proof_url, proof_public_id, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      order.id,
      user.id,
      'JazzCash',
      order.total,
      `TXN${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      'zahzan/payment-proofs/fixture',
      'zahzan/payment-proofs/fixture',
      'Pending'
    ]
  );
  return rows[0];
}

describe('PATCH /api/admin/payments/:id/verify -- customer email count', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    paymentVerifiedSpy.mockClear();
    orderStatusSpy.mockClear();
  });

  it('sends the payment-verified email once and no separate Confirmed status email', async () => {
    const admin = await insertUser({ role: 'admin', password: 'AdminPass@123' });
    const customer = await insertUser();
    const order = await insertOrder(customer);
    const payment = await insertPayment(order, customer);

    const res = await paymentVerifyRoute(
      patchRequest(`/api/admin/payments/${payment.id}/verify`, {}, authHeader(admin)),
      paramsContext({ id: payment.id })
    );

    expect(res.status).toBe(200);
    expect(paymentVerifiedSpy).toHaveBeenCalledTimes(1);
    expect(orderStatusSpy).not.toHaveBeenCalled();
  });

  it('still advances the order to Confirmed even though no status email is sent', async () => {
    const admin = await insertUser({ role: 'admin', password: 'AdminPass@123' });
    const customer = await insertUser();
    const order = await insertOrder(customer);
    const payment = await insertPayment(order, customer);

    await paymentVerifyRoute(
      patchRequest(`/api/admin/payments/${payment.id}/verify`, {}, authHeader(admin)),
      paramsContext({ id: payment.id })
    );

    const { rows } = await query('select order_status, payment_status from orders where id = $1', [
      order.id
    ]);
    expect(rows[0].order_status).toBe('Confirmed');
    expect(rows[0].payment_status).toBe('verified');
  });

  it('does not email a stale "Confirmed" status when the order has already moved on', async () => {
    // Regression guard for the bug the old second email carried: it passed a
    // hardcoded 'Confirmed', so verifying a late payment on an already-Shipped
    // order told the customer their order had gone backwards.
    const admin = await insertUser({ role: 'admin', password: 'AdminPass@123' });
    const customer = await insertUser();
    const order = await insertOrder(customer, { orderStatus: 'Shipped' });
    const payment = await insertPayment(order, customer);

    await paymentVerifyRoute(
      patchRequest(`/api/admin/payments/${payment.id}/verify`, {}, authHeader(admin)),
      paramsContext({ id: payment.id })
    );

    expect(orderStatusSpy).not.toHaveBeenCalled();
    const { rows } = await query('select order_status from orders where id = $1', [order.id]);
    expect(rows[0].order_status).toBe('Shipped');
  });

  it('subsequent status changes each still send exactly one email', async () => {
    // The "one by one" half of the requirement: the status route is untouched,
    // so every real transition still notifies the customer once.
    const admin = await insertUser({ role: 'admin', password: 'AdminPass@123' });
    const customer = await insertUser();
    const order = await insertOrder(customer);
    const payment = await insertPayment(order, customer);

    await paymentVerifyRoute(
      patchRequest(`/api/admin/payments/${payment.id}/verify`, {}, authHeader(admin)),
      paramsContext({ id: payment.id })
    );
    expect(orderStatusSpy).not.toHaveBeenCalled();

    for (const status of ['Processing', 'Shipped', 'Delivered']) {
      orderStatusSpy.mockClear();
      const res = await orderStatusRoute(
        patchRequest(`/api/admin/orders/${order.id}/status`, { orderStatus: status }, authHeader(admin)),
        paramsContext({ id: order.id })
      );
      expect(res.status).toBe(200);
      expect(orderStatusSpy).toHaveBeenCalledTimes(1);
      expect(orderStatusSpy.mock.calls[0][1]).toBe(status);
    }
  });

  it('re-saving the same status does not re-email', async () => {
    const admin = await insertUser({ role: 'admin', password: 'AdminPass@123' });
    const customer = await insertUser();
    const order = await insertOrder(customer, { orderStatus: 'Processing' });

    orderStatusSpy.mockClear();
    await orderStatusRoute(
      patchRequest(`/api/admin/orders/${order.id}/status`, { orderStatus: 'Processing' }, authHeader(admin)),
      paramsContext({ id: order.id })
    );
    expect(orderStatusSpy).not.toHaveBeenCalled();
  });
});
