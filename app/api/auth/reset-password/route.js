// POST /api/auth/reset-password
//
// Statement-by-statement port of server/controllers/authController.js's
// resetPassword (Task 8, task-8-brief.md). passwordResetLimiter attaches,
// matching server/routes/authRoutes.js's `router.post('/reset-password',
// passwordResetLimiter, resetPassword)`.

export const runtime = 'nodejs';

import bcrypt from 'bcryptjs';
import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { checkRateLimit, passwordResetRateLimit } from '../../../../lib/rateLimit.js';

export const POST = withErrorHandler(async (request) => {
  const { limited, response } = await checkRateLimit(request, passwordResetRateLimit);
  if (limited) return response;

  const body = await request.json().catch(() => ({}));
  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return fail('Reset token and new password are required.', 400);
  }

  if (newPassword.length < 6) {
    return fail('Password must be at least 6 characters long.', 400);
  }

  const { rows: tokenRows } = await query(
    `select * from password_reset_tokens
     where token = $1 and is_used = false and expires_at > now()`,
    [token]
  );
  const resetDoc = tokenRows[0];

  if (!resetDoc) {
    return fail('Invalid or expired password reset token.', 400);
  }

  const { rows: userRows } = await query('select * from users where id = $1', [resetDoc.user_id]);
  const user = userRows[0];

  if (!user) {
    return fail('User not found.', 404);
  }

  // Matches server/models/User.js's pre-save hook exactly: bcryptjs,
  // genSalt(10).
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  await query('update users set password = $1 where id = $2', [hashedPassword, user.id]);

  await query('update password_reset_tokens set is_used = true where id = $1', [resetDoc.id]);

  await query('update refresh_tokens set is_revoked = true where user_id = $1 and is_revoked = false', [user.id]);

  return ok({
    success: true,
    message: 'Password reset successfully. You can now log in with your new password.'
  });
});
