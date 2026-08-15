// GET /api/admin/payments/:id
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminPaymentById (Task 13, task-13-brief.md). Protected + admin-only.
//
// `.populate('orderId')` (no select string -- the FULL order document) is
// exactly serializeOrder(row)'s own shape, reused directly rather than
// adding a redundant "full" variant of serializeOrderSummaryForPayment.
//
// Shape checked against tools/golden/100-extra2.admin-payment-by-id.json.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import {
  serializePayment,
  serializeOrder,
  serializePaymentUserSummary,
  serializePopulatedUserSummary
} from '../../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const { rows: paymentRows } = await query('select * from payments where id = $1', [id]);
  const paymentRow = paymentRows[0];

  if (!paymentRow) {
    return fail('Payment record not found', 404);
  }

  const [{ rows: orderRows }, { rows: userRows }] = await Promise.all([
    query('select * from orders where id = $1', [paymentRow.order_id]),
    query('select * from users where id = $1', [paymentRow.user_id])
  ]);

  let verifierRow = null;
  if (paymentRow.verified_by != null) {
    const { rows: verifierRows } = await query('select * from users where id = $1', [paymentRow.verified_by]);
    verifierRow = verifierRows[0] || null;
  }

  const payment = serializePayment(paymentRow);
  payment.orderId = orderRows[0] ? serializeOrder(orderRows[0]) : paymentRow.order_id;
  payment.userId = userRows[0] ? serializePaymentUserSummary(userRows[0]) : paymentRow.user_id;
  if (verifierRow) {
    payment.verifiedBy = serializePopulatedUserSummary(verifierRow);
  }

  return ok({
    success: true,
    payment
  });
});
