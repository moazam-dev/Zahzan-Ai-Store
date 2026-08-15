// GET /api/users/me/confirm-email-change
//
// Statement-by-statement port of server/controllers/userController.js's
// confirmEmailChange (Task 9, task-9-brief.md). Public -- matches
// server/routes/userRoutes.js's
// `router.get('/me/confirm-email-change', confirmEmailChange)` (no
// `protect`).
//
// Shape and exact message strings checked against
// tools/golden/096-extra2.users-confirm-email-change-invalid-token.json and
// tools/golden/097-extra2.users-confirm-email-change-success.json.
//
// The source reads `req.query.token || req.body.token` -- this is a GET
// route, so a request body is unusual but not impossible; reproduced by
// falling back to a parsed JSON body when the query string carries no
// token.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';

export const GET = withErrorHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  let token = searchParams.get('token');

  if (!token) {
    const body = await request.json().catch(() => ({}));
    token = body.token;
  }

  if (!token) {
    return fail('Email change token is required.', 400);
  }

  const { rows } = await query(
    'select * from email_change_tokens where token = $1 and expires_at > now()',
    [token]
  );
  const tokenDoc = rows[0];

  if (!tokenDoc) {
    return fail('Invalid or expired email change token.', 400);
  }

  const { rows: userRows } = await query('select * from users where id = $1', [tokenDoc.user_id]);
  const user = userRows[0];

  if (!user) {
    return fail('User account not found.', 404);
  }

  await query('update users set email = $1, is_email_verified = true where id = $2', [
    tokenDoc.new_email,
    user.id
  ]);

  await query('delete from email_change_tokens where id = $1', [tokenDoc.id]);

  return ok({
    success: true,
    message: 'Email address updated successfully.'
  });
});
