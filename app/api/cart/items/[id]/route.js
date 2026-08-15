// PATCH /api/cart/items/:id, DELETE /api/cart/items/:id
//
// Statement-by-statement port of server/controllers/cartController.js's
// updateCartItem and removeCartItem (Task 10, task-10-brief.md). Both
// protected -- matches server/routes/cartRoutes.js's
// `router.patch('/items/:id', updateCartItem)` and
// `router.delete('/items/:id', removeCartItem)`.
//
// `:id` addresses the cart_items row by its OWN uuid (supabase/migrations/
// 0001_init.sql's comment on cart_items: "each item's _id is returned as
// cartItemId and used directly in the URL PATCH/DELETE /api/cart/items/:id,
// so it needs a stable, addressable PK"). Both handlers below ALSO reproduce
// the source's secondary productId-based match (cartController.js:183-195
// and :263-273) for completeness/parity, even though no current frontend
// call site drives that path -- context/CartContext.jsx's removeFromCart and
// updateQuantity always pass a cart item's own `id` (== cartItemId, per
// lib/serialize.js's serializeCartItem: `id: item.id`).
//
// Shape checked against tools/golden/034-cart.patch-quantity.json and
// tools/golden/035-cart.delete-item.json.
//
// Frontend quirk (context/CartContext.jsx:139-167, removeFromCart): it
// appends `?size=${size}` to the DELETE URL. removeCartItem's source
// (cartController.js:249-289) DOES read `req.query.size`, but only in the
// productId-match branch -- and removeFromCart always passes a cartItemId as
// `id`, which matches the itemIdStr branch FIRST and returns `false`
// unconditionally (`if (itemIdStr === id) return false;`), before the `size`
// branch is ever reached. So in every real call from this frontend, `size`
// is read off the query string but never actually consulted -- reproduced
// here exactly, not "fixed" into doing something with it.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth } from '../../../../../lib/auth.js';
import { serializeCart } from '../../../../../lib/serialize.js';

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

export const PATCH = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  // updateCartItem's source (cartController.js:168-244) wraps its whole body
  // in a local try/catch that builds
  // `Failed to update cart item: ${error.message}` on any unexpected
  // failure. The early 404/400 returns below sit INSIDE that same try in the
  // source and never reach its catch, so they stay unprefixed here too --
  // same precedent as app/api/products/route.js's POST (Task 9) and
  // app/api/orders/route.js's POST (Task 11).
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { quantity, delta, selectedSize } = body;

    const { rows: cartRows } = await query('select * from carts where user_id = $1', [user.id]);
    const cart = cartRows[0];

    if (!cart) {
      return fail('Cart not found', 404);
    }

    const items = await loadCartItems(cart.id);

    // Match by cartItemId or by productId (+ size if given) --
    // cartController.js:183-195.
    const itemIndex = items.findIndex((item) => {
      const itemIdStr = item.id;
      const prodIdStr = item.product ? item.product.id : '';

      if (itemIdStr === id) return true;
      if (prodIdStr === id) {
        if (selectedSize) return item.selected_size === selectedSize;
        return true;
      }
      return false;
    });

    if (itemIndex === -1) {
      return fail('Item not found in cart', 404);
    }

    const item = items[itemIndex];
    let newQty = item.quantity;

    if (typeof quantity === 'number') {
      newQty = quantity;
    } else if (typeof delta === 'number') {
      newQty = item.quantity + delta;
    }

    if (newQty <= 0) {
      await query('delete from cart_items where id = $1', [item.id]);
    } else {
      const { rows: productRows } = await query('select * from products where id = $1', [item.product_id]);
      const product = productRows[0];

      if (!product) {
        await query('delete from cart_items where id = $1', [item.id]);
      } else {
        if (newQty > product.stock) {
          return fail(`Requested quantity exceeds available stock of ${product.stock}`, 400);
        }
        await query('update cart_items set quantity = $1 where id = $2', [newQty, item.id]);
      }
    }

    const updatedItems = await loadCartItems(cart.id);

    return ok({ success: true, cart: serializeCart(cart, updatedItems) });
  } catch (error) {
    return fail(`Failed to update cart item: ${error.message}`, 500);
  }
});

export const DELETE = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  // removeCartItem's source (cartController.js:249-289) wraps its whole body
  // in a local try/catch that builds
  // `Failed to remove cart item: ${error.message}` on any unexpected
  // failure -- reproduced here for the same reason as PATCH above. Note this
  // prefix ("remove cart item") differs from clearCart's ("clear cart") in
  // app/api/cart/route.js's DELETE, despite both being deletes.
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const size = searchParams.get('size');

    const { rows: cartRows } = await query('select * from carts where user_id = $1', [user.id]);
    const cart = cartRows[0];

    if (!cart) {
      return fail('Cart not found', 404);
    }

    const items = await loadCartItems(cart.id);

    // cartController.js:263-273. `item.product` here is NOT populated in the
    // source (removeCartItem never calls formatCartResponse before this
    // filter), so its productId compare is against the raw, unpopulated
    // product reference -- equivalent to comparing against `product_id`
    // directly here.
    const idsToDelete = items
      .filter((item) => {
        const itemIdStr = item.id;
        const prodIdStr = item.product_id;

        if (itemIdStr === id) return true;
        if (prodIdStr === id) {
          if (size) return item.selected_size === size;
          return true;
        }
        return false;
      })
      .map((item) => item.id);

    if (idsToDelete.length > 0) {
      await query('delete from cart_items where id = any($1::uuid[])', [idsToDelete]);
    }

    const remainingItems = await loadCartItems(cart.id);

    return ok({ success: true, message: 'Item removed from cart', cart: serializeCart(cart, remainingItems) });
  } catch (error) {
    return fail(`Failed to remove cart item: ${error.message}`, 500);
  }
});
