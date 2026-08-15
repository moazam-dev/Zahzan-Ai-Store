// DELETE /api/users/me/wishlist/:productId
//
// Statement-by-statement port of server/controllers/userController.js's
// removeUserWishlist (Task 9, task-9-brief.md). Protected -- matches
// server/routes/userRoutes.js's
// `router.delete('/me/wishlist/:productId', protect, removeUserWishlist)`.
//
// Shape checked against tools/golden/030-users.wishlist-delete.json. The
// source's `if (user.wishlist) { ...filter...; await user.save(); }` guard
// is always true in practice (a User document's wishlist array always
// exists, default `[]`) -- an unconditional DELETE here is behaviourally
// identical (a no-op if the pair isn't present), not a change in observable
// behaviour.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok } from '../../../../../../lib/http.js';
import { withApiHandler } from '../../../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../../../lib/auth.js';

export const DELETE = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { productId } = await context.params;

  await query('delete from wishlist_items where user_id = $1 and product_id = $2', [user.id, productId]);

  const { rows: wishlistRows } = await query(
    'select product_id from wishlist_items where user_id = $1 order by created_at asc',
    [user.id]
  );

  return ok({ success: true, wishlist: wishlistRows.map((row) => row.product_id) });
});
