// POST /api/payments
//
// Statement-by-statement port of server/controllers/paymentController.js's
// submitPaymentProof (Task 12, task-12-brief.md), reading the file under the
// `proof` multipart field -- matches server/routes/paymentRoutes.js's
// `router.post('/', protect, uploadPaymentProof.single('proof'),
// submitPaymentProof)`. Shares its ONE implementation with the
// POST /api/payments/proof alias (./proof/route.js) via
// ./_submitPaymentProof.js -- see that file's header comment for the
// error-handling reasoning (no local message prefix; withErrorHandler alone
// reproduces the source's `next(error)` path).
//
// Shape checked against tools/golden/048-payments.submit-proof.json.

export const runtime = 'nodejs';

import { withApiHandler } from '../../../lib/rateLimit.js';
import { submitPaymentProof } from './_submitPaymentProof.js';

export const POST = withApiHandler((request) => submitPaymentProof(request, 'proof'));
