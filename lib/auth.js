// lib/auth.js
//
// Direct ports of server/middleware/authMiddleware.js's `protect` and
// server/middleware/adminMiddleware.js's `requireAdmin`, reshaped as plain
// functions a Next.js Route Handler calls directly instead of Express
// middleware chaining. Task 5 brief.

import { verifyToken } from './jwt.js';
import { query } from './db.js';
import { fail } from './http.js';

/**
 * Reproduces `protect` exactly, including its exact three failure
 * messages and -- subtly -- its exact try/catch scoping: the original
 * wraps BOTH `verifyToken` AND the `User.findById` lookup in the same try
 * block, so a lookup failure of any kind (not just a bad token) also
 * surfaces as "token failed or expired", not a 500. Replicated here on
 * purpose, not by accident.
 *
 * @param {Request} request a standard Request (or NextRequest, which is a
 *        subclass) -- only `request.headers.get(...)` is used, so this is
 *        trivially unit-testable with a plain `new Request(url, { headers
 *        })`, no Next.js runtime required.
 * @returns {Promise<{ user: object } | { response: Response }>} `user` is
 *        the full `users` row (snake_case -- callers serialize it
 *        themselves via lib/serialize.js) on success; `response` is a
 *        ready-to-return 401 on failure. Callers do:
 *        `const { user, response } = await requireAuth(request); if
 *        (response) return response;`
 */
export async function requireAuth(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return { response: fail('Not authorized, no token provided', 401) };
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    // Explicit column list, deliberately excluding `password`. Restores
    // parity with the original's TWO independent layers of protection --
    // server/middleware/authMiddleware.js's `.select('-password')` and
    // server/models/User.js's schema-level `select: false` on the password
    // field -- neither of which this port had until now. Every column
    // below is one lib/serialize.js's serializeUser/serializeAuthUser or
    // requireAdmin (role) actually reads; `wishlist` is intentionally
    // absent -- it's the `wishlist_items` table now, not a `users` column
    // (supabase/migrations/0001_init.sql).
    const { rows } = await query(
      `select id, first_name, last_name, email, auth_provider, google_id,
              facebook_id, phone, role, is_email_verified, is_active,
              created_at, updated_at
       from users where id = $1`,
      [decoded.id]
    );
    const user = rows[0];

    if (!user) {
      return { response: fail('User not found or account deactivated', 401) };
    }

    return { user };
  } catch (err) {
    return { response: fail('Not authorized, token failed or expired', 401) };
  }
}

/**
 * Reproduces `requireAdmin` exactly: the 403 *"Access denied: Admin
 * authorization required"* unless `user.role === 'admin'`.
 *
 * @param {object|null|undefined} user a `users` row, typically the
 *        `user` requireAuth() returned
 * @returns {Response|null} a ready-to-return 403 when denied, or `null`
 *        when the user is an admin. Callers do:
 *        `const denied = requireAdmin(user); if (denied) return denied;`
 */
export function requireAdmin(user) {
  if (user && user.role === 'admin') {
    return null;
  }
  return fail('Access denied: Admin authorization required', 403);
}
