// GET /api/test-email-change-token?userId=<uuid>
//
// Task 15 (parity verification) ONLY. Not one of the 67 governed endpoints,
// not exercised by tools/golden/, and inert everywhere except the exact
// local-verification setup Task 15 needs. Sibling of
// app/api/test-bootstrap/route.js -- same gating, same rationale.
//
// Why this exists: tools/contract-capture.mjs's
// `extra2.users-confirm-email-change-success` journey step needs the real
// crypto.randomBytes(32) email-change token to exercise
// GET /api/users/me/confirm-email-change's success branch -- the API never
// returns this token to any client (by design, it only ever reaches the
// user by email, and email sending is disabled during capture). Against
// the OLD Mongo stack, tools/contract-capture.mjs's own
// `fetchEmailChangeToken` reads it back directly out of MongoDB. Against
// this (Postgres) stack there is no equivalent out-of-band DB handle
// available to a separate capture-script process -- PGlite is in-process
// WASM with no network listener, so this route is the only way to read the
// token back at all, using the exact same `lib/db.js` `query` export (and
// therefore the exact same shared PGlite singleton -- see
// app/api/test-bootstrap/route.js's header comment) every real route
// handler uses.
//
// Gated hard on ZAHZAN_DB_DRIVER === 'pglite', identically to
// app/api/test-bootstrap/route.js: in any real deployment this returns the
// same 404 envelope app/api/[...catchAll]/route.js already returns for any
// unmapped path, and runs no code at all.

export const runtime = 'nodejs';

import { query } from '../../../lib/db.js';
import { ok, notFound, withErrorHandler } from '../../../lib/http.js';

export const GET = withErrorHandler(async (request) => {
  if (process.env.ZAHZAN_DB_DRIVER !== 'pglite') {
    const url = new URL(request.url);
    return notFound(`${url.pathname}${url.search}`);
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return notFound('/api/test-email-change-token');
  }

  const { rows } = await query(
    'select token from email_change_tokens where user_id = $1 order by created_at desc limit 1',
    [userId]
  );

  if (!rows[0]) {
    return notFound('/api/test-email-change-token');
  }

  return ok({ success: true, token: rows[0].token });
});
