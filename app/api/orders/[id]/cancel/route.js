// PATCH /api/orders/:id/cancel
//
// Statement-by-statement port of server/controllers/orderController.js's
// cancelOrder (Task 11, task-11-brief.md). Protected -- matches
// server/routes/orderRoutes.js's `router.patch('/:id/cancel', cancelOrder)`.
//
// Resolves `:id` by UUID first, then by `order_number` uppercased -- same
// dual lookup as app/api/orders/[id]/route.js's getOrderById. Ownership only
// (no admin bypass) -- matches the source exactly: cancelOrder's ownership
// check has no `isAdmin` branch, unlike getOrderById's.
//
// Keeps the source's own local try/catch (not just withErrorHandler): the
// source wraps unexpected failures in its own `Failed to cancel order: ...`
// message prefix.
//
// The status-transition check plus stock restoration is delegated to
// supabase/migrations/0001_init.sql's cancel_order() -- one atomic
// `select * from cancel_order(...)` call; see that function's header
// comment for why this closes the source's own two-step (save-then-restore)
// race. cancel_order() RAISEs the source's exact
// `Order cannot be cancelled because it is already in "<status>" status.`
// message; classifyCancelOrderError below maps it back to 400, exactly
// reproducing the source's inline `return res.status(400)...` branch (never
// "Failed to cancel order: "-prefixed).
//
// Shape checked against tools/golden/042-orders.cancel-1.json,
// tools/golden/044-orders.cancel-2-first.json and
// tools/golden/045-orders.cancel-2-second.json.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../../lib/auth.js';
import { serializeOrder } from '../../../../../lib/serialize.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveOrder(id) {
  let order = null;

  if (UUID_RE.test(id)) {
    const { rows } = await query('select * from orders where id = $1', [id]);
    order = rows[0] || null;
  }

  if (!order) {
    const { rows } = await query('select * from orders where order_number = $1', [id.toUpperCase()]);
    order = rows[0] || null;
  }

  return order;
}

function classifyCancelOrderError(message) {
  if (message === 'Order not found') return 404;
  if (message.startsWith('Order cannot be cancelled because it is already in')) return 400;
  return null;
}

export const PATCH = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const order = await resolveOrder(id);

    if (!order) {
      return fail('Order not found', 404);
    }

    // Verify ownership -- no admin bypass here (unlike getOrderById).
    if (order.user_id !== user.id) {
      return fail('You are not authorized to cancel this order.', 403);
    }

    let cancelledOrder;
    try {
      const { rows } = await query('select * from cancel_order($1::uuid)', [order.id]);
      cancelledOrder = rows[0];
    } catch (cancelErr) {
      const status = classifyCancelOrderError(cancelErr.message);
      if (status) return fail(cancelErr.message, status);
      throw cancelErr;
    }

    return ok({
      success: true,
      message: 'Order cancelled successfully',
      order: serializeOrder(cancelledOrder)
    });
  } catch (error) {
    return fail(`Failed to cancel order: ${error.message}`, 500);
  }
});
