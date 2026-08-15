// GET /api/auth/me
//
// Statement-by-statement port of server/controllers/authController.js's
// getMe (Task 8, task-8-brief.md). Protected: matches
// server/routes/authRoutes.js's `router.get('/me', protect, getMe)` via
// lib/auth.js's requireAuth (the finished port of `protect`).
//
// The source re-fetches the user by id even though `protect` already
// resolved the identical row moments earlier -- a redundant round trip with
// no observable effect on the response (same id, same columns). requireAuth
// already selects every column serializeAuthUser reads (including
// created_at), so that row is reused directly here instead of querying
// again; this changes no observable behaviour, only removes an unobservable
// duplicate DB call. Flagged in task-8-report.md.

export const runtime = 'nodejs';

import { requireAuth } from '../../../../lib/auth.js';
import { serializeAuthUser } from '../../../../lib/serialize.js';
import { ok } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';

export const GET = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  return ok({
    success: true,
    user: serializeAuthUser(user, { includeCreatedAt: true })
  });
});
