// POST /api/auth/forgot-password
//
// Statement-by-statement port of server/controllers/authController.js's
// forgotPassword (Task 8, task-8-brief.md). passwordResetLimiter attaches,
// matching server/routes/authRoutes.js's `router.post('/forgot-password',
// passwordResetLimiter, forgotPassword)`.
//
// Deliberate deviation from the source (per the finished lib/email.js
// interface, ruling C13): the source fires `sendPasswordResetEmail(...)`
// without awaiting it. Here it is awaited via `dispatch()`, which still
// guarantees a failed/rejected send can never fail this request -- see
// lib/email.js's header comment.

export const runtime = 'nodejs';

import crypto from 'crypto';
import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler, checkRateLimit, passwordResetRateLimit } from '../../../../lib/rateLimit.js';
import { sendPasswordResetEmail, dispatch } from '../../../../lib/email.js';

export const POST = withApiHandler(async (request) => {
  const { limited, response } = await checkRateLimit(request, passwordResetRateLimit);
  if (limited) return response;

  const body = await request.json().catch(() => ({}));
  const { email } = body;

  const genericResponse = {
    success: true,
    message: 'If an account exists with this email, a password reset link has been sent.'
  };

  if (!email) {
    return fail('Email address is required.', 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const { rows } = await query('select * from users where email = $1', [normalizedEmail]);
  const user = rows[0];

  if (!user) {
    return ok(genericResponse);
  }

  await query('delete from password_reset_tokens where user_id = $1', [user.id]);

  const rawResetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await query('insert into password_reset_tokens (user_id, token, expires_at) values ($1, $2, $3)', [
    user.id,
    rawResetToken,
    expiresAt
  ]);

  await dispatch(sendPasswordResetEmail(user.email, rawResetToken));

  return ok(genericResponse);
});
