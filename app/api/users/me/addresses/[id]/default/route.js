// PATCH /api/users/me/addresses/:id/default
//
// Statement-by-statement port of server/controllers/userController.js's
// setDefaultAddress (Task 9, task-9-brief.md). Protected -- matches
// server/routes/userRoutes.js's
// `router.patch('/me/addresses/:id/default', protect, setDefaultAddress)`.
//
// Shape checked against tools/golden/025-users.address-set-default.json.
// Single-default invariant: every other address for this user is cleared
// before this one is set, in the same request.

export const runtime = 'nodejs';

import { query } from '../../../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../../../lib/http.js';
import { requireAuth } from '../../../../../../../lib/auth.js';
import { serializeAddress } from '../../../../../../../lib/serialize.js';

export const PATCH = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { id: addressId } = await context.params;

  const { rows } = await query('select * from addresses where id = $1 and user_id = $2', [addressId, user.id]);
  const address = rows[0];

  if (!address) {
    return fail('Address not found or unauthorized.', 404);
  }

  await query('update addresses set is_default = false where user_id = $1', [user.id]);

  const { rows: updatedRows } = await query(
    'update addresses set is_default = true where id = $1 returning *',
    [addressId]
  );

  return ok({
    success: true,
    message: 'Default address updated successfully.',
    address: serializeAddress(updatedRows[0])
  });
});
