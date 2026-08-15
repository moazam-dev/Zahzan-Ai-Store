// GET /api/cart, DELETE /api/cart
//
// Statement-by-statement port of server/controllers/cartController.js's
// getCart and clearCart (Task 10, task-10-brief.md). Both protected --
// matches server/routes/cartRoutes.js's `router.get('/', getCart)` and
// `router.delete('/', clearCart)` (cartRoutes.js applies `protect` to the
// whole router via `router.use(protect)`).
//
// Shape checked against tools/golden/031-cart.get-autocreate.json and
// tools/golden/036-cart.clear.json. Cart and cart items serialize with `id`
// only, never `_id` (docs/IMPLEMENTATION_PLAN.md's GC2 map, verified against
// golden 032 -- formatCartResponse hand-builds `id`/`cartItemId` rather than
// going through a Mongoose toJSON). Nested `product` objects DO carry both.
//
// loadCartItems below reproduces cartController.js:13's
// `cartDoc.items.filter((item) => item.product != null)` -- a LEFT JOIN so a
// cart_items row whose product has vanished still comes back (with
// `product: null`) and gets filtered out by serializeCart itself, exactly
// like the source. Ruling C15 (docs/IMPLEMENTATION_PLAN.md) already made
// cart_items.product_id `on delete cascade`, so in practice this row can no
// longer exist -- the filter stays anyway, "belt and braces" per the task
// dispatch, and costs nothing.

export const runtime = 'nodejs';

import { query } from '../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../lib/http.js';
import { requireAuth } from '../../../lib/auth.js';
import { serializeCart } from '../../../lib/serialize.js';

/** @param {string} userId */
async function getOrCreateCart(userId) {
  const { rows } = await query('select * from carts where user_id = $1', [userId]);
  if (rows[0]) return rows[0];

  const { rows: createdRows } = await query('insert into carts (user_id) values ($1) returning *', [userId]);
  return createdRows[0];
}

/**
 * Mirrors the populate select string in cartController.js's
 * formatCartResponse: `.populate({ path: 'items.product', select: 'name
 * price category image images stock sizes colors' })` (`id`/`_id` is always
 * included regardless of the select string).
 *
 * @param {string} cartId
 * @returns {Promise<object[]>} cart_items rows, each with an attached
 *          `product` (or `null` if the product row is gone).
 */
async function loadCartItems(cartId) {
  const { rows } = await query(
    `select
       ci.id as id,
       ci.product_id as product_id,
       ci.quantity as quantity,
       ci.selected_size as selected_size,
       ci.selected_color as selected_color,
       p.id as p_id,
       p.name as p_name,
       p.price as p_price,
       p.category as p_category,
       p.images as p_images,
       p.image as p_image,
       p.colors as p_colors,
       p.sizes as p_sizes,
       p.stock as p_stock
     from cart_items ci
     left join products p on p.id = ci.product_id
     where ci.cart_id = $1
     order by ci.created_at asc`,
    [cartId]
  );

  return rows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    quantity: row.quantity,
    selected_size: row.selected_size,
    selected_color: row.selected_color,
    product:
      row.p_id == null
        ? null
        : {
            id: row.p_id,
            name: row.p_name,
            price: row.p_price,
            category: row.p_category,
            images: row.p_images,
            image: row.p_image,
            colors: row.p_colors,
            sizes: row.p_sizes,
            stock: row.p_stock
          }
  }));
}

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  // getCart's source (cartController.js:57-77) wraps its whole body in a
  // local try/catch that builds `Failed to fetch cart: ${error.message}` on
  // any unexpected failure -- withErrorHandler's generic fallback would emit
  // a bare, unprefixed message instead, so the prefix is reproduced here
  // directly (same precedent as app/api/products/route.js's GET, Task 9).
  try {
    const cart = await getOrCreateCart(user.id);
    const items = await loadCartItems(cart.id);

    return ok({ success: true, cart: serializeCart(cart, items) });
  } catch (error) {
    return fail(`Failed to fetch cart: ${error.message}`, 500);
  }
});

export const DELETE = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  // clearCart's source (cartController.js:294-320) wraps its whole body in a
  // local try/catch that builds `Failed to clear cart: ${error.message}` on
  // any unexpected failure -- reproduced here for the same reason as GET
  // above.
  try {
    const { rows } = await query('select * from carts where user_id = $1', [user.id]);
    const cart = rows[0];

    if (cart) {
      await query('delete from cart_items where cart_id = $1', [cart.id]);
    }

    // clearCart's source (cartController.js:294-320) is the one function in
    // the controller that does NOT go through formatCartResponse -- it hand-
    // builds the response cart object instead, and when no cart row exists
    // yet (clearCart, unlike getCart, never auto-creates one) uses `''` for
    // `id`. serializeCart(cart, []) reproduces that hand-built shape field-
    // for-field when a cart exists; the `?? {...}` fallback reproduces the
    // no-cart branch's literal `id: cart ? cart._id.toString() : ''`.
    const serialized = cart
      ? serializeCart(cart, [])
      : { id: '', user: user.id, items: [], subtotal: 0, totalCount: 0 };

    return ok({ success: true, message: 'Cart cleared', cart: serialized });
  } catch (error) {
    return fail(`Failed to clear cart: ${error.message}`, 500);
  }
});
