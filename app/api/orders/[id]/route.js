// GET /api/orders/:id
//
// Statement-by-statement port of server/controllers/orderController.js's
// getOrderById (Task 11, task-11-brief.md). Protected -- matches
// server/routes/orderRoutes.js's `router.get('/:id', getOrderById)`.
//
// Tries a UUID lookup first (mirroring the source's
// `mongoose.Types.ObjectId.isValid(id)` branch, the same pattern
// app/api/products/[id]/route.js already established for Task 9), then
// falls back to `order_number` uppercased -- source:
// `Order.findOne({ orderNumber: id.toUpperCase() })`.
//
// Keeps the source's own local try/catch (not just withErrorHandler): the
// source wraps unexpected failures in its own `Failed to fetch order: ...`
// message prefix.
//
// Shape checked against tools/golden/040-orders.get-by-id.json and
// tools/golden/041-orders.get-by-order-number.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth } from '../../../../lib/auth.js';
import { serializeOrder } from '../../../../lib/serialize.js';

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

export const GET = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const order = await resolveOrder(id);

    if (!order) {
      return fail('Order not found', 404);
    }

    // Verify ownership or admin access.
    const isOwner = order.user_id === user.id;
    const isAdmin = user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return fail('You are not authorized to view this order.', 403);
    }

    return ok({ success: true, order: serializeOrder(order) });
  } catch (error) {
    return fail(`Failed to fetch order: ${error.message}`, 500);
  }
});
