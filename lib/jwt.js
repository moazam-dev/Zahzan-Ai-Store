// lib/jwt.js
//
// Verbatim port of server/utils/jwt.js (GC5): same jsonwebtoken library,
// same four functions, same env vars, same hardcoded dev-fallback secrets.
// A token minted by the old server must validate against the new API, and
// vice versa -- this file is byte-for-byte the same signing/verification
// logic, just moved.

import jwt from 'jsonwebtoken';

/**
 * Generate short-lived Access Token
 */
export const generateToken = (userId, role = 'customer') => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

/**
 * Generate long-lived Refresh Token
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || 'zahzan_jwt_refresh_secret_dev_key_2026_secure',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

/**
 * Verify Access Token
 *
 * Rejects a SCOPED token (see generateOrderAccessToken below) even though it
 * is signed with the same secret and would otherwise verify. Without this a
 * link emailed to a guest -- a URL, which ends up in mail clients, browser
 * history and referrer headers -- could be presented as `Authorization:
 * Bearer <token>` and accepted as a login. It would not currently get far
 * (requireAuth looks up `users where id = decoded.id`, and a scoped token has
 * no `id`), but that is an accident of the lookup, not a decision. This makes
 * it a decision.
 */
export const verifyToken = (token) => {
  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure'
  );

  if (decoded && decoded.scope) {
    throw new jwt.JsonWebTokenError('scoped token is not an access token');
  }

  return decoded;
};

// ---------------------------------------------------------------------------
// Guest order access (guest checkout, 2026-08-20)
// ---------------------------------------------------------------------------

/** The only scope currently minted. A scope claim marks a token as NOT a login. */
export const ORDER_ACCESS_SCOPE = 'order-access';

/**
 * Mints a token granting access to ONE order and nothing else.
 *
 * A guest who pays by bank transfer / JazzCash / Easypaisa has no account, so
 * there is no session to authorise "upload my payment screenshot" later. The
 * confirmation email carries a link holding this token instead.
 *
 * Deliberately narrow:
 *   - it names a single orderId, so it grants nothing about any other order
 *   - it carries `scope`, which verifyToken above refuses, so it can never be
 *     used as a login
 *   - it expires, so a forwarded or leaked email stops working
 *
 * @param {string} orderId
 * @returns {string}
 */
export const generateOrderAccessToken = (orderId) => {
  return jwt.sign(
    { orderId, scope: ORDER_ACCESS_SCOPE },
    process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure',
    { expiresIn: process.env.ORDER_ACCESS_EXPIRES_IN || '30d' }
  );
};

/**
 * Verifies an order access token and returns the order id it grants access to.
 * Returns null for anything that is not a valid, unexpired, correctly-scoped
 * order token -- including a genuine USER access token, which must not be
 * usable here either (a customer's login says nothing about which order they
 * are allowed to attach a payment to; that is checked separately against the
 * order's own owner).
 *
 * @param {string} token
 * @returns {string|null} the order id, or null
 */
export const verifyOrderAccessToken = (token) => {
  if (!token || typeof token !== 'string') return null;

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure'
    );

    if (!decoded || decoded.scope !== ORDER_ACCESS_SCOPE) return null;
    if (!decoded.orderId || typeof decoded.orderId !== 'string') return null;

    return decoded.orderId;
  } catch {
    return null;
  }
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET || 'zahzan_jwt_refresh_secret_dev_key_2026_secure'
  );
};
