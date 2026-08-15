// GET /api/admin/orders
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAllOrders (Task 13, task-13-brief.md). Protected + admin-only.
//
// Pagination contract: page/limit default 1/10 (matches this endpoint's own
// defaults in the source -- task-13-brief.md's blanket "page=1, limit=10"
// wording is the authority-vs-brief conflict flagged in task-13-report.md;
// the controller (this task's actual authority) is followed per-endpoint).
//
// status: anchored case-insensitive exact match (`^status$` in the source),
// reproduced as a plain `ilike` with no `%` wrapping -- order_status values
// are our own fixed enum strings with no LIKE metacharacters, so this is
// exact-match-safe. search: unanchored substring match across four columns,
// `ilike` with `%` wrapping (task-13-brief.md's explicit translation rule).
//
// Payment attach: EVERY order gets its latest payment (by created_at desc)
// attached under a nested `payment` key -- `null` when none exists -- unlike
// the customer-facing order create/list responses, where `payment` is a
// top-level envelope sibling, never nested inside `order`
// (lib/serialize.js's serializeOrder JSDoc covers this distinction).
//
// Shape checked against tools/golden/057-admin.orders-list-paged.json,
// 058-admin.orders-list-search.json, 059-admin.orders-list-status.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import { serializeOrderForAdminList } from '../../../../lib/serialize.js';
import { signProofUrl } from '../../../../lib/storage.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get('limit'), 10) || 10);
  const skip = (page - 1) * limit;

  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`order_status ilike $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(
      `(order_number ilike $${idx} or customer_name ilike $${idx} or customer_email ilike $${idx} or customer_phone ilike $${idx})`
    );
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const { rows: countRows } = await query(`select count(*)::int as count from orders ${where}`, params);
  const total = countRows[0].count;

  const listParams = [...params, limit, skip];
  const { rows: orderRows } = await query(
    `select * from orders ${where} order by created_at desc limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  const orders = await Promise.all(
    orderRows.map(async (orderRow) => {
      const { rows: paymentRows } = await query(
        'select * from payments where order_id = $1 order by created_at desc limit 1',
        [orderRow.id]
      );
      const paymentRow = paymentRows[0] || null;
      const serializedOrder = serializeOrderForAdminList(orderRow, { payment: paymentRow });
      // Re-sign the nested payment's proof URL, same reasoning as
      // app/api/admin/payments/route.js's list endpoint (lib/storage.js's
      // private-bucket design: proof_url stores a path, not a durable URL).
      if (serializedOrder.payment) {
        serializedOrder.payment.proofUrl = await signProofUrl(paymentRow.proof_public_id);
      }
      return serializedOrder;
    })
  );

  return ok({
    success: true,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    orders
  });
});
