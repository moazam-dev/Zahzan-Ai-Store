// GET /api/users/me/wishlist, POST /api/users/me/wishlist
//
// Statement-by-statement port of server/controllers/userController.js's
// getUserWishlist and toggleUserWishlist (Task 9, task-9-brief.md). Both
// protected -- matches server/routes/userRoutes.js's
// `router.get('/me/wishlist', protect, getUserWishlist)` and
// `router.post('/me/wishlist', protect, toggleUserWishlist)`.
//
// `wishlist` is the `wishlist_items` join table now (supabase/migrations/
// 0001_init.sql), not a `users` column -- User.wishlist was a bare
// ObjectId[] with no subdocument schema, ported to (user_id, product_id)
// rows. `wishlist_items.created_at` exists specifically to preserve
// insertion order on read (the migration's own comment), replicating the
// source's populate-in-array-order behaviour.
//
// Both responses return `wishlist` as an array of id STRINGS -- confirmed
// against tools/golden/027-users.wishlist-get.json,
// tools/golden/028-users.wishlist-toggle-on.json and
// tools/golden/029-users.wishlist-toggle-off.json -- and the GET additionally
// returns a `products` array of full product objects (via
// lib/serialize.js's serializeProduct, GC3).
//
// Known schema-driven behaviour difference (GC4 -- reported, not fixed):
// wishlist_items.product_id carries a `references products (id)` foreign
// key with no ON DELETE clause. The source's User.wishlist is a bare
// ObjectId[] with no referential integrity at all, so (a) toggling on a
// nonexistent productId silently succeeds in the old API, and (b) a later
// admin product deletion silently orphans wishlist entries, which then
// crashes getUserWishlist's old `item._id ? ... : item.toString()` line
// with a TypeError when populate() returns null for the missing ref. The
// new schema instead (a) rejects toggling a nonexistent productId with a
// foreign-key-violation 500, and (b) blocks the product deletion outright.
// Different failure shape, same class of underlying looseness; not fixed
// here since the schema itself is a finished Task 3 interface.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth } from '../../../../../lib/auth.js';
import { serializeProduct } from '../../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { rows } = await query(
    `select p.* from wishlist_items w
     join products p on p.id = w.product_id
     where w.user_id = $1
     order by w.created_at asc`,
    [user.id]
  );

  const products = rows.map(serializeProduct);
  const wishlistIds = products.map((product) => product._id);

  return ok({ success: true, wishlist: wishlistIds, products });
});

export const POST = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const { productId } = body;

  // No trailing period -- verbatim, unlike most other messages in this
  // controller.
  if (!productId) {
    return fail('Product ID is required', 400);
  }

  const { rows: existingRows } = await query(
    'select id from wishlist_items where user_id = $1 and product_id = $2',
    [user.id, productId]
  );

  if (existingRows[0]) {
    await query('delete from wishlist_items where user_id = $1 and product_id = $2', [user.id, productId]);
  } else {
    await query('insert into wishlist_items (user_id, product_id) values ($1, $2)', [user.id, productId]);
  }

  const { rows: wishlistRows } = await query(
    'select product_id from wishlist_items where user_id = $1 order by created_at asc',
    [user.id]
  );

  return ok({ success: true, wishlist: wishlistRows.map((row) => row.product_id) });
});
