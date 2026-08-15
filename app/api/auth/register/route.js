// POST /api/auth/register
//
// Statement-by-statement port of server/controllers/authController.js's
// registerUser (Task 8, task-8-brief.md). registerLimiter attaches, matching
// server/routes/authRoutes.js's `router.post('/register', registerLimiter,
// registerUser)`.

export const runtime = 'nodejs';

import bcrypt from 'bcryptjs';
import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler, checkRateLimit, registerRateLimit } from '../../../../lib/rateLimit.js';
import { serializeAuthUser } from '../../../../lib/serialize.js';
import { generateToken, generateRefreshToken } from '../../../../lib/jwt.js';

export const POST = withApiHandler(async (request) => {
  const { limited, response } = await checkRateLimit(request, registerRateLimit);
  if (limited) return response;

  const body = await request.json().catch(() => ({}));
  const { firstName, lastName, name, email, password, confirmPassword, phone } = body;

  let fName = firstName;
  let lName = lastName;
  if (!fName && name) {
    const parts = name.trim().split(' ');
    fName = parts[0];
    lName = parts.slice(1).join(' ') || parts[0];
  }

  if (!fName || !lName || !email || !password) {
    return fail('Please provide full name, email, and password.', 400);
  }

  if (confirmPassword && password !== confirmPassword) {
    return fail('Passwords do not match.', 400);
  }

  if (password.length < 6) {
    return fail('Password must be at least 6 characters long.', 400);
  }

  // GC7: lowercase + trim on every write path.
  const normalizedEmail = email.toLowerCase().trim();

  const { rows: existingRows } = await query('select id from users where email = $1', [normalizedEmail]);
  if (existingRows[0]) {
    return fail('An account with this email address already exists.', 400);
  }

  // Matches server/models/User.js's pre-save hook exactly: bcryptjs,
  // genSalt(10).
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const { rows } = await query(
    `insert into users (first_name, last_name, email, password, phone, auth_provider, role, is_email_verified, is_active)
     values ($1, $2, $3, $4, $5, 'local', 'customer', true, true)
     returning *`,
    [fName.trim(), lName.trim(), normalizedEmail, hashedPassword, phone ? phone.trim() : '']
  );
  const user = rows[0];

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

  return ok(
    {
      success: true,
      message: 'Account created successfully. Welcome to ZAHZAN!',
      token,
      refreshToken,
      user: serializeAuthUser(user)
    },
    201
  );
});
