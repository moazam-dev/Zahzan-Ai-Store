// GET /api/payments/methods
//
// Statement-by-statement port of server/controllers/paymentController.js's
// getPaymentMethods (Task 12, task-12-brief.md). Public/unauthenticated --
// matches server/routes/paymentRoutes.js's `router.get('/methods',
// getPaymentMethods)` (no `protect` middleware on this one route).
//
// Shape checked against tools/golden/046-payments.methods.json. lib/
// paymentMethods.js is a byte-identical port of
// server/config/paymentMethods.js (verified with `diff` and matching
// md5sums -- see task-12-report.md).

export const runtime = 'nodejs';

import { ok } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { PAYMENT_METHODS } from '../../../../lib/paymentMethods.js';

export const GET = withApiHandler(async () => {
  return ok({
    success: true,
    methods: PAYMENT_METHODS
  });
});
