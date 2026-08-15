// POST /api/auth/login
//
// Statement-by-statement port of server/controllers/authController.js's
// loginUser (Task 8, task-8-brief.md). loginLimiter attaches, matching
// server/routes/authRoutes.js's `router.post('/login', loginLimiter,
// loginUser)`.

export const runtime = 'nodejs';

import bcrypt from 'bcryptjs';
import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { checkRateLimit, loginRateLimit } from '../../../../lib/rateLimit.js';
import { serializeAuthUser } from '../../../../lib/serialize.js';
import { generateToken, generateRefreshToken } from '../../../../lib/jwt.js';

export const POST = withErrorHandler(async (request) => {
  const { limited, response } = await checkRateLimit(request, loginRateLimit);
  if (limited) return response;

  const body = await request.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return fail('Please provide email and password.', 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const { rows } = await query('select * from users where email = $1', [normalizedEmail]);
  const user = rows[0];

  // Preserved exactly, including the original's lack of a guard for a
  // social-only account with no password set: if user.password is not a
  // valid bcrypt hash, bcrypt.compare rejects and the rejection propagates
  // up to withErrorHandler as a 500, the same as the source's
  // `user.matchPassword(password)` throwing and being caught by
  // `next(error)` -> errorHandler.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return fail('Invalid email or password.', 401);
  }

  if (!user.is_active) {
    return fail('Account has been deactivated. Please contact client support.', 403);
  }

  const token = generateToken(user.id, user.role);
  const refreshToken = generateRefreshToken(user.id);

  await query(
    `insert into refresh_tokens (user_id, token, device_info, ip_address, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [
      user.id,
      refreshToken,
      request.headers.get('user-agent') || '',
      request.headers.get('x-forwarded-for') || '',
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ]
  );

  return ok({
    success: true,
    message: 'Login successful.',
    token,
    refreshToken,
    user: serializeAuthUser(user)
  });
});
