// lib/rateLimit.js
//
// Replaces server/middleware/rateLimiter.js's four express-rate-limit
// instances plus the `apiLimiter` block in server/server.js -- both are
// in-memory per Express process, which cannot survive ephemeral,
// horizontally-scaled serverless functions (MIGRATION_PLAN.md sec7.5).
// Backed by the `rate_limits` table + `check_rate_limit()` function this
// same task appends to supabase/migrations/0001_init.sql.
//
// Five configs, matching the five limiters that actually exist in the
// current app (the source's fifth rateLimiter.js export,
// `verificationLimiter`, guards an email-verification endpoint that does
// not exist in the current API surface -- confirmed in Task 2's capture
// work, GET /api/auth/verify-email is a 404 -- so there is no sixth config
// here; only these five are ever wired to a live route). Every `max`/
// `windowSeconds`/`message` below is copied verbatim from the source.

import { query } from './db.js';
import { fail } from './http.js';

export const globalRateLimit = {
  id: 'global',
  max: 200,
  windowSeconds: 15 * 60,
  message: 'Too many requests from this IP, please try again after 15 minutes'
};

export const loginRateLimit = {
  id: 'login',
  max: 10,
  windowSeconds: 15 * 60,
  message: 'Too many login attempts. Please try again after 15 minutes.'
};

export const registerRateLimit = {
  id: 'register',
  max: 10,
  windowSeconds: 60 * 60,
  message: 'Too many accounts created from this IP. Please try again in an hour.'
};

export const passwordResetRateLimit = {
  id: 'passwordReset',
  max: 5,
  windowSeconds: 15 * 60,
  message: 'Too many password reset requests. Please try again after 15 minutes.'
};

export const newsletterRateLimit = {
  id: 'newsletter',
  max: 15,
  windowSeconds: 15 * 60,
  message: 'Too many newsletter subscription requests from this IP. Please try again later.'
};

/**
 * Client IP: `x-forwarded-for`'s first entry (Express's `req.ip` behind a
 * trusted proxy resolves the same way), falling back to `x-real-ip`, then
 * the literal string `'unknown'` -- matches the brief exactly.
 */
function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  return 'unknown';
}

/**
 * @param {Request} request only `request.headers.get(...)` is used --
 *        unit-testable with a plain `new Request(url, { headers })`.
 * @param {{ id: string, max: number, windowSeconds: number, message: string }} config
 *        one of the five exports above (or an equivalent shape).
 * @returns {Promise<{ limited: true, response: Response } | { limited: false }>}
 *        `response` is a ready-to-return 429 carrying the config's exact
 *        message. The DB key is `${config.id}:${ip}` -- qualified by which
 *        limiter this is, not just the IP, so e.g. a login attempt and a
 *        newsletter subscribe from the same address never share a counter
 *        (express-rate-limit's separate middleware instances never did
 *        either, each with its own in-memory store).
 */
export async function checkRateLimit(request, config) {
  const ip = getClientIp(request);
  const key = `${config.id}:${ip}`;

  const { rows } = await query('select check_rate_limit($1, $2, $3) as limited', [
    key,
    config.max,
    config.windowSeconds
  ]);

  if (rows[0].limited) {
    return { limited: true, response: fail(config.message, 429) };
  }

  return { limited: false };
}
