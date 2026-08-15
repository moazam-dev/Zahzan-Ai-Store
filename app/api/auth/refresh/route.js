// POST /api/auth/refresh
//
// Statement-by-statement port of server/controllers/authController.js's
// refreshToken (Task 8, task-8-brief.md). No rate limiter attaches, matching
// server/routes/authRoutes.js's `router.post('/refresh', refreshToken)`.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { generateToken, verifyRefreshToken } from '../../../../lib/jwt.js';

export const POST = withApiHandler(async (request) => {
  const body = await request.json().catch(() => ({}));
  const incomingToken = body.refreshToken;

  if (!incomingToken) {
    return fail('Refresh token is required.', 400);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(incomingToken);
  } catch (err) {
    return fail('Invalid or expired refresh token.', 401);
  }

  const { rows: tokenRows } = await query('select * from refresh_tokens where token = $1 and is_revoked = false', [
    incomingToken
  ]);
  const storedToken = tokenRows[0];

  if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
    return fail('Refresh token is revoked or expired.', 401);
  }

  const { rows: userRows } = await query('select * from users where id = $1', [decoded.id]);
  const user = userRows[0];

  if (!user || !user.is_active) {
    return fail('User no longer active or exists.', 401);
  }

  const newAccessToken = generateToken(user.id, user.role);

  return ok({
    success: true,
    message: 'Access token renewed successfully.',
    token: newAccessToken
  });
});
