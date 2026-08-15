// POST /api/auth/google
//
// Statement-by-statement port of server/controllers/authController.js's
// googleAuth (Task 8, task-8-brief.md). No rate limiter attaches, matching
// server/routes/authRoutes.js's `router.post('/google', googleAuth)`.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { serializeAuthUser } from '../../../../lib/serialize.js';
import { generateToken, generateRefreshToken } from '../../../../lib/jwt.js';

export const POST = withErrorHandler(async (request) => {
  const body = await request.json().catch(() => ({}));
  const { googleId, email, name, firstName, lastName } = body;

  if (!email) {
    return fail('Email address is required for Google authentication.', 400);
  }

  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await query('select * from users where google_id = $1 or email = $2', [
    googleId || 'nonexistent',
    normalizedEmail
  ]);
  let user = rows[0];

  if (user) {
    // Safely link Google ID to existing account if not set.
    if (!user.google_id && googleId) {
      const newAuthProvider = user.auth_provider === 'local' ? 'google' : user.auth_provider;
      const { rows: updatedRows } = await query(
        'update users set google_id = $1, auth_provider = $2 where id = $3 returning *',
        [googleId, newAuthProvider, user.id]
      );
      user = updatedRows[0];
    }
  } else {
    // Create new user for Google social login.
    let fName = firstName;
    let lName = lastName;
    if (!fName && name) {
      const parts = name.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ') || parts[0];
    }

    const { rows: createdRows } = await query(
      `insert into users (first_name, last_name, email, auth_provider, google_id, is_email_verified, is_active)
       values ($1, $2, $3, 'google', $4, true, true)
       returning *`,
      [(fName || 'Valued').trim(), (lName || 'Client').trim(), normalizedEmail, googleId || `google_${Date.now()}`]
    );
    user = createdRows[0];
  }

  if (!user.is_active) {
    return fail('Account is deactivated.', 403);
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

  const responseUser = serializeAuthUser(user);
  // The source hardcodes `isEmailVerified: true` in this literal, regardless
  // of the linked/created row's actual value -- unlike login/register/me,
  // which read user.isEmailVerified off the row. Preserved verbatim; see
  // task-8-report.md.
  responseUser.isEmailVerified = true;

  return ok({
    success: true,
    message: 'Google authentication successful.',
    token,
    refreshToken,
    user: responseUser
  });
});
