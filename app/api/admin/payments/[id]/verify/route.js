// PATCH /api/admin/payments/:id/verify
//
// Statement-by-statement port of server/controllers/adminController.js's
// verifyAdminPayment (Task 13, task-13-brief.md). Protected + admin-only.
//
// Both `payment` and `order` in the response are the LIVE rows, not
// populated/toObject()'d variants -- `verifiedBy` stays a bare id (not
// populated) and order.items keep their `id` key. Confirmed against
// tools/golden/073-admin.payment-verify.json.
//
// dispatch() awaits unconditionally (task-13-brief.md) -- the source's
// `Promise.all([...]).catch(...)` fire-and-forget pair is wrapped in ONE
// dispatch() call so both sends still race/settle together, exactly like
// the source's single Promise.all.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok, fail } from '../../../../../../lib/http.js';
import { withApiHandler } from '../../../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../../../lib/auth.js';
import { serializePayment, serializeOrder } from '../../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../../lib/auditLogger.js';
import { sendCustomerPaymentVerifiedEmail, sendCustomerOrderStatusEmail, dispatch } from '../../../../../../lib/email.js';
import { signProofUrl } from '../../../../../../lib/storage.js';

export const PATCH = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const { rows: paymentRows } = await query('select * from payments where id = $1', [id]);
  const payment = paymentRows[0];

  if (!payment) {
    return fail('Payment record not found', 404);
  }

  if (payment.status !== 'Pending') {
    return fail(`Payment has already been processed and is currently "${payment.status}".`, 400);
  }

  const { rows: updatedPaymentRows } = await query(
    `update payments set status = 'Verified', verified_by = $1, verified_at = now() where id = $2 returning *`,
    [user.id, payment.id]
  );
  const updatedPayment = updatedPaymentRows[0];

  const { rows: orderRows } = await query('select * from orders where id = $1', [updatedPayment.order_id]);
  let order = orderRows[0] || null;

  if (order) {
    const newOrderStatus = order.order_status === 'Pending' ? 'Confirmed' : order.order_status;
    const { rows: updatedOrderRows } = await query(
      `update orders set payment_status = 'verified', order_status = $1 where id = $2 returning *`,
      [newOrderStatus, order.id]
    );
    order = updatedOrderRows[0];
  }

  await recordAuditLog({
    adminId: user.id,
    action: 'PAYMENT_VERIFIED',
    entity: 'Payment',
    entityId: String(updatedPayment.id),
    ipAddress: getClientIp(request),
    metadata: {
      orderId: order ? String(order.id) : '',
      orderNumber: order ? order.order_number : '',
      amount: Number(updatedPayment.amount),
      paymentMethod: updatedPayment.payment_method,
      transactionReference: updatedPayment.transaction_reference
    }
  });

  const serializedPayment = serializePayment(updatedPayment);
  // Re-sign, same reasoning as app/api/admin/payments/route.js's list
  // endpoint (lib/storage.js's private-bucket design: proof_url stores a
  // path, not a durable URL).
  serializedPayment.proofUrl = await signProofUrl(updatedPayment.proof_public_id);
  const serializedOrder = order ? serializeOrder(order) : null;

  if (order) {
    await dispatch(
      Promise.all([
        sendCustomerPaymentVerifiedEmail(serializedOrder, serializedPayment),
        sendCustomerOrderStatusEmail(serializedOrder, 'Confirmed')
      ])
    );
  }

  return ok({
    success: true,
    message: 'Payment verified successfully',
    payment: serializedPayment,
    order: serializedOrder
  });
});
