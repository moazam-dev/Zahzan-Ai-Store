// GET /api/users/me, PATCH /api/users/me
//
// Statement-by-statement port of server/controllers/userController.js's
// getUserProfile and updateUserProfile (Task 9, task-9-brief.md). Both
// protected -- matches server/routes/userRoutes.js's
// `router.get('/me', protect, getUserProfile)` and
// `router.patch('/me', protect, updateUserProfile)`.
//
// Neither handler wraps its body in a local try/catch (the source's own
// `catch (error) { next(error); }` forwards to the generic error middleware
// -- exactly what lib/http.js's withErrorHandler already reproduces), unlike
// the three product endpoints, which build their own message-prefixed
// error responses.
//
// getUserProfile's `user` literal (id, firstName, lastName, name, email,
// phone, role, isEmailVerified, createdAt -- confirmed against
// tools/golden/020-users.me.json) is NOT the same shape as
// lib/serialize.js's serializeUser (which carries _id/id, wishlist,
// isActive, authProvider, googleId, facebookId, updatedAt) or the raw
// serializeAuthUser (which carries authProvider, absent from this golden).
// Reusing serializeAuthUser and deleting the one extra key follows the
// precedent app/api/auth/google/route.js already set (mutating the object
// serializeAuthUser returns rather than hand-building a literal) -- GC3
// forbids a route handler from constructing a response entity from raw
// column names itself, not from adjusting a serializer's own output.
// Flagged for reviewer attention in task-9-report.md since no
// lib/serialize.js function emits this exact narrower shape directly.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../lib/auth.js';
import { serializeAuthUser, serializeAddress } from '../../../../lib/serialize.js';

export const GET = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { rows } = await query(
    'select * from addresses where user_id = $1 order by is_default desc, created_at desc',
    [user.id]
  );

  const profileUser = serializeAuthUser(user, { includeCreatedAt: true });
  delete profileUser.authProvider;

  return ok({
    success: true,
    user: profileUser,
    addresses: rows.map(serializeAddress)
  });
});

export const PATCH = withApiHandler(async (request) => {
  const { user: authUser, response } = await requireAuth(request);
  if (response) return response;

  // The source re-fetches by id even though `protect` already resolved the
  // same row moments earlier, and has its own (practically unreachable but
  // still observable) 404 branch if that re-fetch comes back empty.
  // Reproduced rather than skipped, since -- unlike GET /api/auth/me's
  // redundant re-fetch (Task 8) -- this one has a distinct, differently-
  // worded failure branch of its own.
  const { rows } = await query('select * from users where id = $1', [authUser.id]);
  const user = rows[0];

  if (!user) {
    return fail('User not found.', 404);
  }

  const body = await request.json().catch(() => ({}));
  const { firstName, lastName, name, phone } = body;

  let newFirstName = user.first_name;
  let newLastName = user.last_name;

  if (firstName) newFirstName = firstName.trim();
  if (lastName) newLastName = lastName.trim();

  if (!firstName && !lastName && name) {
    const parts = name.trim().split(' ');
    newFirstName = parts[0];
    newLastName = parts.slice(1).join(' ') || parts[0];
  }

  let newPhone = user.phone;
  if (phone !== undefined) newPhone = phone.trim();

  const { rows: updatedRows } = await query(
    'update users set first_name = $1, last_name = $2, phone = $3 where id = $4 returning *',
    [newFirstName, newLastName, newPhone, user.id]
  );
  const updatedUser = updatedRows[0];

  const profileUser = serializeAuthUser(updatedUser);
  delete profileUser.authProvider;

  return ok({
    success: true,
    message: 'Profile updated successfully.',
    user: profileUser
  });
});
