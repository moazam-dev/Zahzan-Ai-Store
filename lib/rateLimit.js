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
import { fail, withErrorHandler } from './http.js';

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

  // N1 fix: fail OPEN, not closed, when the rate-limit datastore itself is
  // unreachable (connection refused, pool exhausted, table missing, etc).
  // `withApiHandler` (below) runs this -- via `globalRateLimit` -- before
  // EVERY one of the 67 routes' own handler, with no guard, so an infra-
  // level failure here used to become a hard 500 for every endpoint,
  // including `GET /api/health`, whose whole job is to report a DB outage
  // rather than become one (its own try/catch around `select 1`,
  // app/api/health/route.js, was unreachable because this call threw
  // first).
  //
  // This is a parity restoration, not new leniency: the source's
  // `apiLimiter` (server/server.js) was express-rate-limit's in-memory
  // store -- it had no database dependency and so could never fail this
  // way. Making the limiter DB-backed was a necessary consequence of
  // serverless having no shared memory (MIGRATION_PLAN.md sec7.5), and
  // that necessity should not leak a brand-new failure mode into every
  // route. With the datastore down the app is largely non-functional
  // regardless; the one endpoint that must still answer accurately is
  // exactly the health check.
  //
  // Only an infra-level failure (the query throwing) fails open. A
  // legitimate "you are over the limit" result is a normal resolved value
  // (`rows[0].limited === true`), not a throw, and is handled below
  // exactly as before -- still a 429.
  let rows;
  try {
    ({ rows } = await query('select check_rate_limit($1, $2, $3) as limited', [
      key,
      config.max,
      config.windowSeconds
    ]));
  } catch (err) {
    console.warn(
      `checkRateLimit: rate-limit datastore unreachable for key "${key}" -- failing open (request allowed through):`,
      err?.message || err
    );
    return { limited: false };
  }

  if (rows[0].limited) {
    return { limited: true, response: fail(config.message, 429) };
  }

  return { limited: false };
}

/**
 * B1 fix (final whole-branch review): `server/server.js:60` applied
 * `apiLimiter` -- express-rate-limit configured with the exact numbers now
 * captured in `globalRateLimit` above -- as global middleware on EVERY
 * `/api` route, via `app.use('/api', apiLimiter)`, mounted before the
 * routers (line 91+) and before `notFound` (mounted last, so it ran for
 * unmatched paths too). The Next.js port never reproduced that: only the
 * five routes that already call `checkRateLimit` directly (register, login,
 * forgot-password, reset-password, newsletter/subscribe) were ever
 * throttled at all -- the other 62 endpoints, including
 * `POST /api/payments` (a 5 MB multipart upload) and all 21 admin routes,
 * were completely unthrottled.
 *
 * `withApiHandler` is the single composable wrapper every route.js now uses
 * in place of a bare `withErrorHandler(...)`, so the fix is one wrapper
 * change per handler rather than ~60 copy-pasted `checkRateLimit` calls.
 * Ordering matters and is preserved exactly: Express ran `apiLimiter`
 * BEFORE any route-specific limiter middleware and before body parsing, so
 * a request to e.g. POST /api/auth/login consumed BOTH the global counter
 * and the login counter, in that order, and a request that failed the
 * global check never reached express.json() or the controller at all. Here,
 * `withErrorHandler` stays outermost (so a thrown error -- including one
 * from the global check's own DB query -- still produces the standard
 * `{ success: false, message }` envelope, unchanged from today), and the
 * global `checkRateLimit` call runs first thing inside that, before
 * `handler` (the route's own body, which performs its own specific check
 * first thing when it has one, and its own `request.json()` after that) is
 * ever invoked. The two counters are independent (`checkRateLimit`'s key is
 * `${config.id}:${ip}`, and `globalRateLimit.id` is `'global'`, distinct
 * from `'login'`/`'register'`/`'passwordReset'`/`'newsletter'`), matching
 * separate express-rate-limit middleware instances each with their own
 * in-memory store.
 *
 * The limited response is `globalRateLimit`'s own config run through the
 * exact same `checkRateLimit` -> `fail(config.message, 429)` path every
 * other limiter uses -- status 429, message
 * "Too many requests from this IP, please try again after 15 minutes",
 * nothing invented.
 */
export function withApiHandler(handler) {
  return withErrorHandler(async (request, ...rest) => {
    const { limited, response } = await checkRateLimit(request, globalRateLimit);
    if (limited) return response;
    return handler(request, ...rest);
  });
}
