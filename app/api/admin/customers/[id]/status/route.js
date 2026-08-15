// PATCH /api/admin/customers/:id/status
//
// Statement-by-statement port of server/controllers/adminController.js's
// updateCustomerStatus (Task 13, task-13-brief.md). Protected + admin-only.
//
// Shape checked against tools/golden/080-admin.customer-status-toggle.json.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok, fail } from '../../../../../../lib/http.js';
import { withApiHandler } from '../../../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../../../lib/auth.js';
import { serializeUser } from '../../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../../lib/auditLogger.js';

export const PATCH = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const { rows: customerRows } = await query('select * from users where id = $1', [id]);
  const customer = customerRows[0];

  if (!customer) {
    return fail('Customer not found', 404);
  }

  const isActive = Boolean(body.isActive);
  const { rows: updatedRows } = await query('update users set is_active = $1 where id = $2 returning *', [
    isActive,
    customer.id
  ]);
  const updatedCustomer = updatedRows[0];

  await recordAuditLog({
    adminId: user.id,
    action: 'CUSTOMER_STATUS_UPDATED',
    entity: 'User',
    entityId: String(updatedCustomer.id),
    ipAddress: getClientIp(request),
    metadata: { isActive: updatedCustomer.is_active }
  });

  return ok({
    success: true,
    message: `Customer account ${updatedCustomer.is_active ? 'activated' : 'deactivated'} successfully`,
    customer: serializeUser(updatedCustomer)
  });
});
