// POST /api/users/me/email-change-request
//
// Statement-by-statement port of server/controllers/userController.js's
// requestEmailChange (Task 9, task-9-brief.md). Protected -- matches
// server/routes/userRoutes.js's
// `router.post('/me/email-change-request', protect, requestEmailChange)`.
//
// Shape and exact message strings checked against
// tools/golden/093-extra2.users-email-change-request-same-as-current.json,
// tools/golden/094-extra2.users-email-change-request-duplicate.json and
// tools/golden/095-extra2.users-email-change-request-success.json.
//
// `await dispatch(sendEmailChangeConfirmation(...))` replaces the source's
// unawaited call, per lib/email.js's header comment and MIGRATION_PLAN.md
// sec7.6 -- sendEmailChangeConfirmation is a genuine no-op in the source
// (server/utils/email.js), so this changes no observable response, only
// when the (no-op) send settles relative to the response.

export const runtime = 'nodejs';

import crypto from 'crypto';
import { query } from '../../../../../lib/db.js';
import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../../lib/auth.js';
import { dispatch, sendEmailChangeConfirmation } from '../../../../../lib/email.js';

export const POST = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const { newEmail } = body;

  if (!newEmail) {
    return fail('New email address is required.', 400);
  }

  // GC7: lowercase + trim on every write path.
  const normalizedNewEmail = newEmail.toLowerCase().trim();

  if (normalizedNewEmail === user.email) {
    return fail('New email address cannot be the same as your current email.', 400);
  }

  const { rows: existingRows } = await query('select id from users where email = $1', [normalizedNewEmail]);
  if (existingRows[0]) {
    return fail('An account with this email address already exists.', 400);
  }

  await query('delete from email_change_tokens where user_id = $1', [user.id]);

  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `insert into email_change_tokens (user_id, new_email, token, expires_at)
     values ($1, $2, $3, $4)`,
    [user.id, normalizedNewEmail, token, new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );

  await dispatch(sendEmailChangeConfirmation(normalizedNewEmail, token));

  return ok({
    success: true,
    message: `A confirmation link has been sent to ${normalizedNewEmail}. Please check your inbox to complete the update.`
  });
});
