// GET /api/try-on/:id
//
// Statement-by-statement port of server/controllers/tryOnController.js's
// getTryOnJobStatus (Task 12, task-12-brief.md) -- a PERMANENT 501 stub. GC4
// / MIGRATION_PLAN.md sec6.2 item 11: "Do not implement them."
//
// The auth gate is real: server/routes/tryOnRoutes.js wires `router.get(
// '/:id', protect, getTryOnJobStatus)` -- `protect` genuinely runs first and
// rejects an unauthenticated request with 401 before the always-501 stub
// body is reached (no DB lookup of `:id` ever happens -- the stub never
// reads it). See ../../stories/route.js's header comment for the identical
// reasoning.
//
// Shape checked against tools/golden/103-extra2.tryon-get-by-id.json.

export const runtime = 'nodejs';

import { fail, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth } from '../../../../lib/auth.js';

export const GET = withErrorHandler(async (request) => {
  const { response } = await requireAuth(request);
  if (response) return response;
  return fail('Endpoint not implemented yet', 501);
});
