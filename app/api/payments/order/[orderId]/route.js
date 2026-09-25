// GET /api/payments/order/:orderId
//
// Statement-by-statement port of server/controllers/paymentController.js's
// getPaymentByOrderId (Task 12, task-12-brief.md). Protected -- matches
// server/routes/paymentRoutes.js's `router.get('/order/:orderId', protect,
// getPaymentByOrderId)`.
//
// Error handling: the source's whole body is a try/catch that calls
// `next(error)` with no local message prefix (0 prefixed catches in
// paymentController.js) -- withErrorHandler alone is the faithful
// reproduction. See ../../_submitPaymentProof.js's header comment for the
// same reasoning applied to the other two payment endpoints.
//
// Every read re-signs a fresh URL from `proof_public_id`
// (MIGRATION_PLAN.md sec7.4) -- the stored `proof_url` column is only ever
// a storage path, never persisted as a signed URL.
//
// Shape checked against tools/golden/050-payments.get-by-order-id.json.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { optionalAuth, canAccessOrder } from '../../../../../lib/auth.js';
import { verifyOrderAccessToken } from '../../../../../lib/jwt.js';
import { serializePayment } from '../../../../../lib/serialize.js';
import { signProofUrl } from '../../../../../lib/storage.js';

export const GET = withApiHandler(async (request, context) => {
  // Guest checkout (2026-08-20): authorised below by either a signed-in
  // owner/admin or an order-access token, so this no longer refuses the
  // request before the order is even loaded.
  const { user } = await optionalAuth(request);

  const { orderId } = await context.params;

  // The order-access token comes from the `token` query parameter here (this
  // is a GET, so there is no body). It names one order id and carries a
  // `scope` claim that verifyToken refuses, so it grants nothing else and
  // cannot be used as a login.
  const tokenParam = new URL(request.url).searchParams.get('token');
  const accessTokenOrderId = verifyOrderAccessToken(tokenParam);

  // A caller who presented no credentials AT ALL still gets requireAuth's
  // original 401, before the order is looked up -- so this endpoint does not
  // start telling anonymous callers which order ids exist.
  if (!user && accessTokenOrderId == null) {
    return fail('Not authorized, no token provided', 401);
  }

  const { rows: orderRows } = await query('select * from orders where id = $1', [orderId]);
  const order = orderRows[0];

  if (!order) {
    return fail('Order not found.', 404);
  }

  const authorisedByToken = accessTokenOrderId != null && accessTokenOrderId === order.id;

  if (!authorisedByToken && !canAccessOrder(order, user) && user?.role !== 'admin') {
    return fail('You are not authorized to view payments for this order.', 403);
  }

  const { rows: paymentRows } = await query(
    'select * from payments where order_id = $1 order by created_at desc',
    [order.id]
  );

  const payments = await Promise.all(
    paymentRows.map(async (row) => ({
      ...serializePayment(row),
      proofUrl: await signProofUrl(row.proof_public_id)
    }))
  );

  return ok({
    success: true,
    payments
  });
});
