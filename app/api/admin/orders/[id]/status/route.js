// PATCH /api/admin/orders/:id/status
//
// Statement-by-statement port of server/controllers/adminController.js's
// updateOrderStatus (Task 13, task-13-brief.md). Protected + admin-only.
//
// Pre-existing bug, reproduced not fixed (GC4, flagged in
// task-13-report.md): unlike getAdminOrderById, the source calls
// `Order.findById(id)` with NO ObjectId-format guard first. A malformed id
// makes Mongoose throw a CastError that propagates to `next(error)` -> a
// 500, instead of falling through to the orderNumber lookup. Reproduced
// here the same way: the id lookup below casts `$1::uuid` with no
// UUID_RE guard, so a malformed id raises a Postgres error that
// withErrorHandler turns into an equivalent 500 (exact message text
// necessarily differs -- different database, different error format -- but
// the observable "malformed id never reaches the orderNumber fallback,
// 500 instead" behaviour is preserved).
//
// order.items restocking on cancel and the response `order` both use plain
// serializeOrder (NOT serializeOrderForAdminList) -- the source returns the
// live Mongoose document directly here (`order` itself, never
// `.toObject()`'d), so items keep their `id` key. Confirmed against
// tools/golden/072-admin.order-status-update.json.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../../lib/auth.js';
import { serializeOrder } from '../../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../../lib/auditLogger.js';
import { sendCustomerOrderStatusEmail, dispatch } from '../../../../../../lib/email.js';

const VALID_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export const PATCH = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { orderStatus, courier, trackingNumber } = body;

  if (!orderStatus || !VALID_STATUSES.includes(orderStatus)) {
    return fail(`Invalid order status. Allowed: ${VALID_STATUSES.join(', ')}`, 400);
  }

  const { rows: idRows } = await query('select * from orders where id = $1::uuid', [id]);
  let orderRow = idRows[0] || null;

  if (!orderRow) {
    const { rows: numRows } = await query('select * from orders where order_number = $1', [id.toUpperCase()]);
    orderRow = numRows[0] || null;
  }

  if (!orderRow) {
    return fail('Order not found', 404);
  }

  const previousStatus = orderRow.order_status;

  const { rows: updatedRows } = await query(
    'update orders set order_status = $1 where id = $2 returning *',
    [orderStatus, orderRow.id]
  );
  orderRow = updatedRows[0];

  if (orderStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
    for (const item of orderRow.items ?? []) {
      if (item && item.productId) {
        await query('update products set stock = stock + $1 where id = $2', [item.quantity, item.productId]);
      }
    }
  }

  await recordAuditLog({
    adminId: user.id,
    action: 'ORDER_STATUS_CHANGED',
    entity: 'Order',
    entityId: String(orderRow.id),
    ipAddress: getClientIp(request),
    metadata: { orderNumber: orderRow.order_number, previousStatus, newStatus: orderStatus }
  });

  const serializedOrder = serializeOrder(orderRow);

  if (previousStatus !== orderStatus) {
    await dispatch(sendCustomerOrderStatusEmail(serializedOrder, orderStatus, { courier, trackingNumber }));
  }

  return ok({
    success: true,
    message: `Order status updated to ${orderStatus}`,
    order: serializedOrder
  });
});
