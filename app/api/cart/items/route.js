// POST /api/cart/items
//
// Statement-by-statement port of server/controllers/cartController.js's
// addToCart (Task 10, task-10-brief.md). Protected -- matches
// server/routes/cartRoutes.js's `router.post('/items', addToCart)`.
//
// Shape checked against tools/golden/032-cart.add.json and
// tools/golden/033-cart.add-same-again.json.
//
// The merge rule (cartController.js:121-126), reproduced exactly:
//
//   const existingIndex = cart.items.findIndex(
//     (item) =>
//       item.product.toString() === productId.toString() &&
//       item.selectedSize === finalSize &&
//       (selectedColor ? item.selectedColor === selectedColor : true)
//   );
//
// The color clause is NOT `item.selectedColor === selectedColor` -- when the
// incoming request has no selectedColor (falsy), the clause degenerates to
// `true` and matches ANY existing line for that product+size regardless of
// what color THAT line was stored with. This is deliberately reproduced
// as-is (GC4): it is the source's actual matching rule, not a bug this port
// introduces or fixes.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth } from '../../../../lib/auth.js';
import { serializeCart } from '../../../../lib/serialize.js';
import { trimIfString } from '../../../../lib/trimFields.js';

async function getOrCreateCart(userId) {
  const { rows } = await query('select * from carts where user_id = $1', [userId]);
  if (rows[0]) return rows[0];

  const { rows: createdRows } = await query('insert into carts (user_id) values ($1) returning *', [userId]);
  return createdRows[0];
}

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

export const POST = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  // addToCart's source (cartController.js:82-163) wraps its whole body in a
  // local try/catch that builds `Failed to add item to cart: ${error.message}`
  // on any unexpected failure. The early validation returns below (400/404)
  // sit INSIDE that same try in the source and never reach its catch, so
  // they stay unprefixed here too -- same precedent as
  // app/api/products/route.js's POST (Task 9) and app/api/orders/route.js's
  // POST (Task 11).
  try {
    const body = await request.json().catch(() => ({}));
    const { productId, quantity = 1, selectedSize, selectedColor } = body;

    if (!productId) {
      return fail('Product ID is required', 400);
    }

    const { rows: productRows } = await query('select * from products where id = $1', [productId]);
    const product = productRows[0];

    if (!product || !product.is_active) {
      return fail('Product not found or unavailable', 404);
    }

    const requestedQty = Math.max(1, Number(quantity) || 1);

    // Validate size if provided -- cartController.js:105-112.
    let finalSize = selectedSize;
    if (product.sizes && product.sizes.length > 0) {
      if (!finalSize || !product.sizes.includes(finalSize)) {
        finalSize = product.sizes[0];
      }
    } else {
      finalSize = finalSize || 'M';
    }

    const cart = await getOrCreateCart(user.id);

    const { rows: existingItemRows } = await query('select * from cart_items where cart_id = $1', [cart.id]);

    const existingItem = existingItemRows.find(
      (item) =>
        item.product_id === productId &&
        item.selected_size === finalSize &&
        (selectedColor ? item.selected_color === selectedColor : true)
    );

    const existingQty = existingItem ? existingItem.quantity : 0;
    const newTotalQty = existingQty + requestedQty;

    if (newTotalQty > product.stock) {
      return fail(`Cannot add items. Available stock is ${product.stock} (currently in cart: ${existingQty}).`, 400);
    }

    if (existingItem) {
      await query('update cart_items set quantity = $1 where id = $2', [newTotalQty, existingItem.id]);
    } else {
      // Cart's `items[]` sub-schema declares `trim: true` on both
      // selectedSize and selectedColor (server/models/Cart.js) -- applied by
      // Mongoose on assignment/push, AFTER the matching comparison above
      // (which the source, and this port, correctly runs against the raw,
      // untrimmed finalSize/selectedColor -- see cartController.js:121-126).
      // Trimmed only for the value actually persisted here.
      await query(
        `insert into cart_items (cart_id, product_id, quantity, selected_size, selected_color)
         values ($1, $2, $3, $4, $5)`,
        [cart.id, productId, requestedQty, trimIfString(finalSize), trimIfString(selectedColor) || '']
      );
    }

    const items = await loadCartItems(cart.id);

    return ok({ success: true, message: 'Item added to cart', cart: serializeCart(cart, items) });
  } catch (error) {
    return fail(`Failed to add item to cart: ${error.message}`, 500);
  }
});
