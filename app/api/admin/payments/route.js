// GET /api/admin/payments
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminPayments (Task 13, task-13-brief.md). Protected + admin-only.
//
// Default limit 15 (this endpoint's own controller default). status:
// anchored case-insensitive exact match. search: the source first finds
// matching ORDERS (order_number / customer_email substring match), then
// queries payments where transactionReference matches OR orderId is one of
// those matched order ids -- reproduced as two queries here (AR1: direct
// parameterized SQL, no query builder).
//
// `orderId`/`userId`/`verifiedBy` are populated sub-objects, not bare ids --
// see lib/serialize.js's serializeOrderSummaryForPayment /
// serializePaymentUserSummary / serializePopulatedUserSummary.
//
// Shape checked against tools/golden/060-admin.payments-list-paged.json,
// 061-admin.payments-list-search.json, 062-admin.payments-list-status.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import {
  serializePayment,
  serializeOrderSummaryForPayment,
  serializePaymentUserSummary,
  serializePopulatedUserSummary
} from '../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get('limit'), 10) || 15);
  const skip = (page - 1) * limit;

  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`status ilike $${params.length}`);
  }

  if (search) {
    const { rows: matchingOrders } = await query(
      'select id from orders where order_number ilike $1 or customer_email ilike $1',
      [`%${search}%`]
    );
    const orderIds = matchingOrders.map((o) => o.id);

    params.push(`%${search}%`);
    const refIdx = params.length;
    params.push(orderIds);
    const idsIdx = params.length;
    conditions.push(`(transaction_reference ilike $${refIdx} or order_id = any($${idsIdx}::uuid[]))`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const { rows: countRows } = await query(`select count(*)::int as count from payments ${where}`, params);
  const total = countRows[0].count;

  const listParams = [...params, limit, skip];
  const { rows: paymentRows } = await query(
    `select * from payments ${where} order by created_at desc limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  const payments = await Promise.all(
    paymentRows.map(async (row) => {
      const [{ rows: orderRows }, { rows: userRows }] = await Promise.all([
        query('select * from orders where id = $1', [row.order_id]),
        query('select * from users where id = $1', [row.user_id])
      ]);
      let verifierRow = null;
      if (row.verified_by != null) {
        const { rows: verifierRows } = await query('select * from users where id = $1', [row.verified_by]);
        verifierRow = verifierRows[0] || null;
      }

      const serialized = serializePayment(row);
      serialized.orderId = orderRows[0] ? serializeOrderSummaryForPayment(orderRows[0]) : row.order_id;
      serialized.userId = userRows[0] ? serializePaymentUserSummary(userRows[0]) : row.user_id;
      if (verifierRow) {
        serialized.verifiedBy = serializePopulatedUserSummary(verifierRow);
      }
      return serialized;
    })
  );

  return ok({
    success: true,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    payments
  });
});
