// GET /api/admin/orders/:id
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminOrderById (Task 13, task-13-brief.md). Protected + admin-only.
//
// Tries a UUID lookup first (mirroring the source's
// `id.match(/^[0-9a-fA-F]{24}$/)` branch, the same UUID-vs-Mongo-ObjectId
// substitution app/api/orders/[id]/route.js already established for Task
// 11), then falls back to `order_number` uppercased.
//
// The source calls `orderDoc.toObject()` explicitly -- serializeOrderForAdminList
// reproduces that quirk (items lose their `id` key; see its JSDoc in
// lib/serialize.js). `payment` is BOTH nested inside `order` AND a top-level
// envelope sibling -- confirmed against
// tools/golden/099-extra2.admin-order-by-id.json.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { serializeOrderForAdminList, serializePayment } from '../../../../../lib/serialize.js';
import { signProofUrl } from '../../../../../lib/storage.js';

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
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const orderRow = await resolveOrder(id);

  if (!orderRow) {
    return fail('Order not found', 404);
  }

  const { rows: paymentRows } = await query(
    'select * from payments where order_id = $1 order by created_at desc limit 1',
    [orderRow.id]
  );
  const paymentRow = paymentRows[0] || null;

  const serializedOrder = serializeOrderForAdminList(orderRow, { payment: paymentRow });
  const serializedPayment = paymentRow ? serializePayment(paymentRow) : null;
  // Re-sign both copies of the proof URL (nested + top-level), same
  // reasoning as app/api/admin/payments/route.js's list endpoint
  // (lib/storage.js's private-bucket design: proof_url stores a path, not
  // a durable URL).
  if (paymentRow) {
    const signedUrl = await signProofUrl(paymentRow.proof_public_id);
    if (serializedOrder.payment) serializedOrder.payment.proofUrl = signedUrl;
    serializedPayment.proofUrl = signedUrl;
  }

  return ok({
    success: true,
    order: serializedOrder,
    payment: serializedPayment
  });
});
