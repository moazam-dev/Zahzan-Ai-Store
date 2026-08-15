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
// Known schema-driven behaviour difference (GC4 -- reported; resolved per
// Ruling C15, docs/IMPLEMENTATION_PLAN.md): both wishlist_items.product_id
// AND cart_items.product_id carry a `references products (id) on delete
// cascade` foreign key. The source's User.wishlist is a bare ObjectId[]
// with no referential integrity at all, and Cart.items is likewise
// unconstrained (server/controllers/cartController.js:13 filters
// `item.product != null`, proving the old code expected products to
// vanish out from under cart/wishlist entries). Deleting a product that
// still has cart or wishlist rows pointing at it now cascades those rows
// away instead of raising a Postgres 23503 (which RESTRICT -- the
// no-ON-DELETE-clause default this migration originally shipped with --
// would have turned into a raw 500 via lib/http.js's withErrorHandler,
// breaking the proven-working, always-200 admin permanent-delete action
// from server/controllers/adminController.js:710-736). This is NOT strict
// parity -- Ruling C15 documents the full trade-off table, including that
// it silently fixes a pre-existing TypeError crash in the old
// getUserWishlist (an accidental improvement, not intentional) and that
// toggling a nonexistent productId now 500s on an FK violation instead of
// silently succeeding (an unreachable divergence -- every UI call site
// sources productId from an already-fetched product). Not reopened here;
// the schema itself is a finished Task 3 interface and C15 is the binding
// ruling.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../../lib/auth.js';
import { serializeProduct } from '../../../../../lib/serialize.js';

export const GET = withApiHandler(async (request) => {
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

export const POST = withApiHandler(async (request) => {
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
