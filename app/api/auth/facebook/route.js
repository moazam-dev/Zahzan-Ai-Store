// POST /api/auth/facebook
//
// Statement-by-statement port of server/controllers/authController.js's
// facebookAuth (Task 8, task-8-brief.md). No rate limiter attaches, matching
// server/routes/authRoutes.js's `router.post('/facebook', facebookAuth)`.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { serializeAuthUser } from '../../../../lib/serialize.js';
import { generateToken, generateRefreshToken } from '../../../../lib/jwt.js';

export const POST = withErrorHandler(async (request) => {
  const body = await request.json().catch(() => ({}));
  const { facebookId, email, name, firstName, lastName } = body;

  // GC7-equivalent: the fallback email is already lowercase; an explicit
  // email is lowercased/trimmed the same as every other write path.
  const targetEmail = email ? email.toLowerCase().trim() : `facebook_${facebookId || Date.now()}@zahzan.com`;

  const { rows } = await query('select * from users where facebook_id = $1 or email = $2', [
    facebookId || 'nonexistent',
    targetEmail
  ]);
  let user = rows[0];

  if (user) {
    if (!user.facebook_id && facebookId) {
      const { rows: updatedRows } = await query('update users set facebook_id = $1 where id = $2 returning *', [
        facebookId,
        user.id
      ]);
      user = updatedRows[0];
    }
  } else {
    let fName = firstName;
    let lName = lastName;
    if (!fName && name) {
      const parts = name.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ') || parts[0];
    }

    const { rows: createdRows } = await query(
      `insert into users (first_name, last_name, email, auth_provider, facebook_id, is_email_verified, is_active)
       values ($1, $2, $3, 'facebook', $4, true, true)
       returning *`,
      [(fName || 'Valued').trim(), (lName || 'Client').trim(), targetEmail, facebookId || `fb_${Date.now()}`]
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
  // Same hardcoded-true deviation as googleAuth -- see task-8-report.md.
  responseUser.isEmailVerified = true;

  return ok({
    success: true,
    message: 'Facebook authentication successful.',
    token,
    refreshToken,
    user: responseUser
  });
});
