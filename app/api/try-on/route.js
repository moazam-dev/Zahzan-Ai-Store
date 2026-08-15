// POST /api/try-on
//
// Statement-by-statement port of server/controllers/tryOnController.js's
// createTryOnJob (Task 12, task-12-brief.md) -- a PERMANENT 501 stub. GC4 /
// MIGRATION_PLAN.md sec6.2 item 11: "Do not implement them."
//
// The auth gate is real: server/routes/tryOnRoutes.js wires `router.post('/',
// protect, upload.single('inputImage'), createTryOnJob)` -- `protect`
// genuinely runs first and rejects an unauthenticated request with 401
// before the always-501 stub body is reached. See ../stories/route.js's
// header comment for the identical reasoning (same pattern, same
// tools/contract-capture.mjs evidence that every capture of this endpoint
// supplies a valid token).
//
// Shape checked against tools/golden/087-stubs.try-on-post.json.

export const runtime = 'nodejs';

import { fail, withErrorHandler } from '../../../lib/http.js';
import { requireAuth } from '../../../lib/auth.js';

export const POST = withErrorHandler(async (request) => {
  const { response } = await requireAuth(request);
  if (response) return response;
  return fail('Endpoint not implemented yet', 501);
});
