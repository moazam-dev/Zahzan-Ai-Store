// POST /api/auth/logout
//
// Statement-by-statement port of server/controllers/authController.js's
// logoutUser (Task 8, task-8-brief.md). No rate limiter attaches, matching
// server/routes/authRoutes.js's `router.post('/logout', logoutUser)`.
//
// Pre-existing oddity (GC4 -- reported, not fixed; see task-8-report.md):
// the source route wires logoutUser WITHOUT the `protect` middleware, so
// `req.user` in the original controller is always undefined and its
// `if (req.user) { revoke ALL of the user's refresh tokens }` branch never
// executes in the live app -- only the single-token revocation by exact
// `refreshToken` match ever actually runs. Reproduced by simply never
// attempting to resolve a user from the request here.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, withErrorHandler } from '../../../../lib/http.js';

export const POST = withErrorHandler(async (request) => {
  const body = await request.json().catch(() => ({}));
  const incomingToken = body.refreshToken;

  if (incomingToken) {
    await query('update refresh_tokens set is_revoked = true where token = $1', [incomingToken]);
  }

  return ok({
    success: true,
    message: 'Logged out successfully.'
  });
});
