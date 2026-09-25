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
/**
 * Guest checkout (2026-08-20). Resolves the caller when there is one, and
 * reports "nobody is signed in" instead of refusing the request when there
 * isn't.
 *
 * Used only on routes a guest is genuinely allowed to reach -- currently
 * order creation. Every other route still uses requireAuth, which is
 * unchanged.
 *
 * The one decision worth stating: an INVALID or EXPIRED token yields
 * `{ user: null }` here, not a 401. A customer whose hour-long access token
 * lapsed while they were filling in the checkout form must not have their
 * order rejected -- and the order is not lost to them either, because order
 * history matches on the email address as well as on user_id, so it still
 * appears in their account. Failing closed here would trade a real, silent
 * loss of orders for no security benefit: the alternative to being treated as
 * a signed-in customer is being treated as a guest, which is a strictly
 * smaller set of privileges.
 *
 * Never returns a `response`, so callers do not need the
 * `if (response) return response` dance:
 *   `const { user } = await optionalAuth(request);`
 *
 * @param {Request} request
 * @returns {Promise<{ user: object | null }>} the full `users` row, or null
 */
export async function optionalAuth(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return { user: null };
  }

  const token = authHeader.split(' ')[1];
  if (!token) return { user: null };

  try {
    const decoded = verifyToken(token);

    // Same explicit column list as requireAuth, for the same reason: never
    // select `password`.
    const { rows } = await query(
      `select id, first_name, last_name, email, auth_provider, google_id,
              facebook_id, phone, role, is_email_verified, is_active,
              created_at, updated_at
       from users where id = $1`,
      [decoded.id]
    );

    return { user: rows[0] || null };
  } catch {
    return { user: null };
  }
}

/**
 * Guest checkout (2026-08-20). The single definition of "this signed-in
 * customer may see this order", used by every customer-facing order route so
 * the rule cannot drift between them.
 *
 * An account may access:
 *   - its own orders (user_id matches), and
 *   - GUEST orders placed with its email address.
 *
 * The `order.user_id == null` half of the second clause is load-bearing: it is
 * what stops one account from reaching another ACCOUNT's orders by changing
 * its own email address to match. Only orders that belong to nobody can be
 * claimed by an email match.
 *
 * Note the deliberate limitation, documented in the design and accepted:
 * nothing in this system verifies email ownership, so a guest order placed
 * with someone else's email address will be visible to that person. Making
 * this conditional on `user.is_email_verified` is the fix, once signup
 * actually verifies.
 *
 * @param {{user_id: string|null, customer_email: string}} order an `orders` row
 * @param {{id: string, email: string}|null} user
 * @returns {boolean}
 */
export function canAccessOrder(order, user) {
  if (!order || !user) return false;
  if (order.user_id && order.user_id === user.id) return true;

  if (order.user_id == null && order.customer_email && user.email) {
    return String(order.customer_email).toLowerCase() === String(user.email).toLowerCase();
  }

  return false;
}

export function requireAdmin(user) {
  if (user && user.role === 'admin') {
    return null;
  }
  return fail('Access denied: Admin authorization required', 403);
}
