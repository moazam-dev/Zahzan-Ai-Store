// POST /api/payments/proof
//
// Backward-compatibility alias for POST /api/payments -- statement-by-
// statement port of the SAME server/controllers/paymentController.js
// submitPaymentProof (Task 12, task-12-brief.md), reading the file under the
// `proofImage` multipart field instead of `proof` -- matches
// server/routes/paymentRoutes.js's `router.post('/proof', protect,
// uploadPaymentProof.single('proofImage'), submitPaymentProof)`. Shares its
// ONE implementation with ../route.js via ../_submitPaymentProof.js -- see
// that file's header comment for the error-handling reasoning.
//
// Shape checked against tools/golden/049-payments.submit-proof-alias.json.

export const runtime = 'nodejs';

import { withErrorHandler } from '../../../../lib/http.js';
import { submitPaymentProof } from '../_submitPaymentProof.js';

export const POST = withErrorHandler((request) => submitPaymentProof(request, 'proofImage'));
