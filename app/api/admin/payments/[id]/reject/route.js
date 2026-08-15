// PATCH /api/admin/payments/:id/reject
//
// Statement-by-statement port of server/controllers/adminController.js's
// rejectAdminPayment (Task 13, task-13-brief.md). Protected + admin-only.
// Unlike verify, the source sends no customer email on reject -- none is
// reproduced here either.
//
// Shape checked against tools/golden/074-admin.payment-reject.json.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok, fail } from '../../../../../../lib/http.js';
import { withApiHandler } from '../../../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../../../lib/auth.js';
import { serializePayment, serializeOrder } from '../../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../../lib/auditLogger.js';
import { signProofUrl } from '../../../../../../lib/storage.js';

export const PATCH = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { rejectionReason } = body;

  if (!rejectionReason || !rejectionReason.trim()) {
    return fail(
      'A rejection reason is required (e.g. Invalid reference ID, incorrect amount, unclear receipt).',
      400
    );
  }

  const { rows: paymentRows } = await query('select * from payments where id = $1', [id]);
  const payment = paymentRows[0];

  if (!payment) {
    return fail('Payment record not found', 404);
  }

  if (payment.status !== 'Pending') {
    return fail(`Payment has already been processed and is currently "${payment.status}".`, 400);
  }

  const { rows: updatedPaymentRows } = await query(
    `update payments
     set status = 'Rejected', rejection_reason = $1, verified_by = $2, verified_at = now()
     where id = $3
     returning *`,
    [rejectionReason.trim(), user.id, payment.id]
  );
  const updatedPayment = updatedPaymentRows[0];

  const { rows: orderRows } = await query('select * from orders where id = $1', [updatedPayment.order_id]);
  let order = orderRows[0] || null;

  if (order) {
    const { rows: updatedOrderRows } = await query(
      `update orders set payment_status = 'rejected' where id = $1 returning *`,
      [order.id]
    );
    order = updatedOrderRows[0];
  }

  await recordAuditLog({
    adminId: user.id,
    action: 'PAYMENT_REJECTED',
    entity: 'Payment',
    entityId: String(updatedPayment.id),
    ipAddress: getClientIp(request),
    metadata: {
      orderId: order ? String(order.id) : '',
      orderNumber: order ? order.order_number : '',
      rejectionReason: updatedPayment.rejection_reason
    }
  });

  // Re-sign, same reasoning as app/api/admin/payments/route.js's list
  // endpoint (lib/storage.js's private-bucket design: proof_url stores a
  // path, not a durable URL).
  const serializedPayment = serializePayment(updatedPayment);
  serializedPayment.proofUrl = await signProofUrl(updatedPayment.proof_public_id);

  return ok({
    success: true,
    message: 'Payment rejected',
    payment: serializedPayment,
    order: order ? serializeOrder(order) : null
  });
});
