// GET /api/admin/auth/me
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminProfile (Task 13, task-13-brief.md). Protected + admin-only --
// matches server/routes/adminRoutes.js's router-wide `protect` +
// `requireAdmin` followed by `router.get('/auth/me', getAdminProfile)`.
//
// Auth ordering (task-13-brief.md): requireAuth (401) BEFORE requireAdmin
// (403) -- matches Express's middleware chain order (`protect` before
// `requireAdmin`) exactly.
//
// Shape checked against tools/golden/055-admin.me.json.

export const runtime = 'nodejs';

import { ok, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { serializeAdminAuthUser } from '../../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  return ok({
    success: true,
    user: serializeAdminAuthUser(user)
  });
});
