// GET /api/admin/customers/:id
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminCustomerById (Task 13, task-13-brief.md). Protected + admin-only.
//
// Shape checked against tools/golden/101-extra2.admin-customer-by-id.json.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { serializeUser, serializeAddress, serializeOrder } from '../../../../../lib/serialize.js';

export const GET = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const { rows: customerRows } = await query('select * from users where id = $1', [id]);
  const customer = customerRows[0];

  if (!customer) {
    return fail('Customer not found', 404);
  }

  const { rows: addressRows } = await query('select * from addresses where user_id = $1', [customer.id]);
  const { rows: orderRows } = await query('select * from orders where user_id = $1 order by created_at desc', [
    customer.id
  ]);

  return ok({
    success: true,
    customer: serializeUser(customer),
    addresses: addressRows.map(serializeAddress),
    orders: orderRows.map((row) => serializeOrder(row))
  });
});
