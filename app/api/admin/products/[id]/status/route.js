// PATCH /api/admin/products/:id/status
//
// Statement-by-statement port of server/controllers/adminController.js's
// toggleAdminProductStatus (Task 13, task-13-brief.md). Protected +
// admin-only.
//
// `isActive`, if present in the body, is used as-given (coerced to
// Boolean); otherwise the current value is flipped.
//
// Shape checked against tools/golden/077-admin.product-status-toggle.json.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../../lib/auth.js';
import { serializeProduct } from '../../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../../lib/auditLogger.js';

export const PATCH = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const { rows: existingRows } = await query('select * from products where id = $1', [id]);
  const product = existingRows[0];

  if (!product) {
    return fail('Product not found', 404);
  }

  const newStatus = body.isActive !== undefined ? Boolean(body.isActive) : !product.is_active;

  const { rows: updatedRows } = await query('update products set is_active = $1 where id = $2 returning *', [
    newStatus,
    id
  ]);
  const updatedProduct = updatedRows[0];

  await recordAuditLog({
    adminId: user.id,
    action: newStatus ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
    entity: 'Product',
    entityId: String(updatedProduct.id),
    ipAddress: getClientIp(request),
    metadata: { name: updatedProduct.name, sku: updatedProduct.sku, isActive: newStatus }
  });

  return ok({
    success: true,
    message: `Product ${newStatus ? 'activated' : 'deactivated'} successfully`,
    product: serializeProduct(updatedProduct)
  });
});
