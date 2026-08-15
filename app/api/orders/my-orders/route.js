// GET /api/orders/my-orders
//
// Statement-by-statement port of server/controllers/orderController.js's
// getMyOrders (Task 11, task-11-brief.md) -- the SAME controller function
// server/routes/orderRoutes.js wires to both `router.get('/', getMyOrders)`
// (app/api/orders/route.js's GET) and `router.get('/my-orders',
// getMyOrders)` (this file). Duplicated rather than cross-imported, matching
// the established convention in this codebase (see app/api/cart/route.js,
// app/api/cart/items/route.js and app/api/cart/items/[id]/route.js, which
// each independently redefine identical helpers rather than sharing a
// module) -- also avoids exporting a non-HTTP-method name from a route.js
// file, which the App Router does not support.
//
// Keeps the source's own local try/catch (not just withErrorHandler), same
// reasoning as app/api/orders/route.js: the source wraps unexpected
// failures in its own `Failed to fetch orders: ...` message prefix.
//
// Shape checked against tools/golden/039-orders.my-orders.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../lib/auth.js';
import { serializeOrder } from '../../../../lib/serialize.js';

export const GET = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  try {
    const { rows } = await query('select * from orders where user_id = $1 order by created_at desc', [user.id]);

    return ok({
      success: true,
      count: rows.length,
      orders: rows.map((row) => serializeOrder(row))
    });
  } catch (error) {
    return fail(`Failed to fetch orders: ${error.message}`, 500);
  }
});
