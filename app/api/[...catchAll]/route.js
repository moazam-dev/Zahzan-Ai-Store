// Catch-all for any /api/* path that doesn't match a real route handler.
//
// Reproduces server/middleware/errorMiddleware.js's `notFound` middleware,
// which server/server.js mounted last via `app.use(notFound)`: for any
// unmatched request, Express responded 404 with
// `{ success: false, message: \`Not Found - ${req.originalUrl}\` }`, where
// `req.originalUrl` includes the query string.
//
// Review finding on Task 8 (task-8-report.md): the migrated app had no
// equivalent, so unmatched /api/* paths fell through to Next's default HTML
// 404 page instead of this JSON envelope -- a GC1 message-string parity
// violation on two live call sites (views/Account.jsx's verify-email and
// change-password calls, goldens 089/090).
//
// Next's App Router resolves static segments (e.g. app/api/health,
// app/api/auth/login) before falling back to a catch-all segment like this
// one, so this file only ever runs for paths with no matching route handler
// -- verified empirically (not just by that documented resolution order)
// per the fix brief; see the fix report for the raw HTTP responses proving
// /api/health and /api/auth/login are unaffected.
//
// lib/http.js's `notFound(path)` helper (built in Task 5 for exactly this)
// builds the envelope; this file only reconstructs `path` to match
// `req.originalUrl` -- pathname + query string, no origin/host.
//
// B1 fix (final whole-branch review): server/server.js:60 mounted
// `apiLimiter` (now `globalRateLimit`) as global middleware on `/api`
// BEFORE `notFound` (mounted last, server/server.js's final `app.use`), so
// an unmatched /api/* path was still subject to the global rate limit in
// the source. `withApiHandler` (lib/rateLimit.js) reproduces that ordering
// here too.

export const runtime = 'nodejs';

import { notFound } from '../../../lib/http.js';
import { withApiHandler } from '../../../lib/rateLimit.js';

function handle(request) {
  const url = new URL(request.url);
  return notFound(`${url.pathname}${url.search}`);
}

const wrapped = withApiHandler(handle);

export const GET = wrapped;
export const POST = wrapped;
export const PUT = wrapped;
export const PATCH = wrapped;
export const DELETE = wrapped;
export const HEAD = wrapped;
export const OPTIONS = wrapped;
