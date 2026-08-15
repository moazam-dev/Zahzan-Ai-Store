// Task 10 (task-10-brief.md): route-level tests for the five app/api/cart/*
// route handlers, exercised as real functions against a PGlite-backed
// lib/db.js -- the same pattern test/api/users.test.js and
// test/api/products.test.js established for Tasks 8/9.
//
// Per Ruling C3 (binding): response SHAPE and exact MESSAGE STRINGS are
// asserted against the golden files named in comments below. Whole-body
// equality against a golden is deliberately NOT done -- ids/timestamps
// legitimately differ between the Mongo-seeded goldens and this PGlite
// fixture data.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

import { GET as cartGetRoute, DELETE as cartClearRoute } from '../../app/api/cart/route.js';
import { POST as cartAddRoute } from '../../app/api/cart/items/route.js';
import { PATCH as cartPatchRoute, DELETE as cartDeleteItemRoute } from '../../app/api/cart/items/[id]/route.js';

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

function postRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function patchRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function deleteRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'DELETE', headers });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

let userCounter = 0;
async function insertUser(overrides = {}) {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, role, is_active, is_email_verified)
     values ($1, $2, $3, $4, true, true)
     returning *`,
    [
      overrides.firstName || 'Cart',
      overrides.lastName || 'Tester',
      overrides.email || `cart-fixture-${userCounter}@zahzanmigrationtest.com`,
      overrides.role || 'customer'
    ]
  );
  return rows[0];
}

function tokenFor(user) {
  return generateToken(user.id, user.role);
}

function authHeader(user) {
  return { authorization: `Bearer ${tokenFor(user)}` };
}

async function insertProduct(overrides = {}) {
  const sku = overrides.sku || `ZHZ-CART-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, category, price, stock, is_active, sizes, colors, images)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      overrides.name || 'Cart Test Kurta',
      overrides.slug || `cart-test-${sku.toLowerCase()}`,
      sku,
      overrides.category || 'Kurtas',
      overrides.price ?? 8500,
      overrides.stock ?? 25,
      overrides.isActive ?? true,
      overrides.sizes || ['S', 'M', 'L', 'XL'],
      JSON.stringify(overrides.colors ?? [{ name: 'Ivory', hex: '#F5F0E6', image: 'https://example.test/i.jpg' }]),
      overrides.images || ['https://example.test/i.jpg']
    ]
  );
  return rows[0];
}

describe('app/api/cart/* route handlers (Task 10)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('GET /api/cart', () => {
    it('auto-creates the cart on first fetch -- shape matches tools/golden/031-cart.get-autocreate.json', async () => {
      const user = await insertUser();
      const res = await cartGetRoute(getRequest('/api/cart', authHeader(user)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        cart: {
          id: expect.any(String),
          user: user.id,
          items: [],
          subtotal: 0,
          totalCount: 0
        }
      });
      expect('_id' in body.cart).toBe(false);

      const { rows } = await query('select id from carts where user_id = $1', [user.id]);
      expect(rows).toHaveLength(1);

      // Fetching again returns the SAME cart, not a second row.
      await cartGetRoute(getRequest('/api/cart', authHeader(user)));
      const { rows: rowsAfter } = await query('select id from carts where user_id = $1', [user.id]);
      expect(rowsAfter).toHaveLength(1);
    });

    it('no token -> 401', async () => {
      const res = await cartGetRoute(getRequest('/api/cart'));
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/cart/items', () => {
    it('adds an item -- shape matches tools/golden/032-cart.add.json', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      const res = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Item added to cart');
      expect(body.cart.items).toHaveLength(1);

      const item = body.cart.items[0];
      expect(item).toEqual({
        id: expect.any(String),
        cartItemId: item.id,
        productId: product.id,
        product: {
          _id: product.id,
          id: product.id,
          name: 'Cart Test Kurta',
          price: 8500,
          category: 'Kurtas',
          images: ['https://example.test/i.jpg'],
          image: '',
          colors: [{ name: 'Ivory', hex: '#F5F0E6', image: 'https://example.test/i.jpg' }],
          sizes: ['S', 'M', 'L', 'XL'],
          stock: 25
        },
        name: 'Cart Test Kurta',
        price: 8500,
        category: 'Kurtas',
        image: 'https://example.test/i.jpg',
        size: 'M',
        selectedSize: 'M',
        color: '',
        selectedColor: '',
        quantity: 1,
        subtotal: 8500,
        stock: 25
      });
      expect('_id' in item).toBe(false);
      expect(body.cart.subtotal).toBe(8500);
      expect(body.cart.totalCount).toBe(1);
    });

    it('missing productId -> 400', async () => {
      const user = await insertUser();
      const res = await cartAddRoute(postRequest('/api/cart/items', {}, authHeader(user)));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Product ID is required' });
    });

    it('unknown product -> 404 "Product not found or unavailable"', async () => {
      const user = await insertUser();
      const otherUser = await insertUser();
      const res = await cartAddRoute(
        postRequest('/api/cart/items', { productId: otherUser.id, quantity: 1 }, authHeader(user))
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Product not found or unavailable' });
    });

    it('inactive product -> 404 "Product not found or unavailable"', async () => {
      const user = await insertUser();
      const product = await insertProduct({ isActive: false });
      const res = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1 }, authHeader(user))
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Product not found or unavailable' });
    });

    it('adding the SAME product+size+color again MERGES into one line -- shape matches tools/golden/033-cart.add-same-again.json', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      );
      const res = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toHaveLength(1);
      expect(body.cart.items[0].quantity).toBe(2);
      expect(body.cart.items[0].subtotal).toBe(17000);
      expect(body.cart.subtotal).toBe(17000);
      expect(body.cart.totalCount).toBe(2);
    });

    it('adding the SAME product with a DIFFERENT size creates a SEPARATE line', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      );
      const res = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'L' }, authHeader(user))
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toHaveLength(2);
      expect(body.cart.items.map((i) => i.quantity)).toEqual([1, 1]);
      expect(body.cart.totalCount).toBe(2);
    });

    it('reproduces the merge rule\'s color quirk: an explicit color creates a separate line, but a later request with NO color merges into the first matching product+size line regardless of its stored color (cartController.js:121-126)', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      // First line: product+size M, explicit color Ivory.
      const first = await cartAddRoute(
        postRequest(
          '/api/cart/items',
          { productId: product.id, quantity: 1, selectedSize: 'M', selectedColor: 'Ivory' },
          authHeader(user)
        )
      ).then((r) => r.json());
      expect(first.cart.items).toHaveLength(1);
      expect(first.cart.items[0].selectedColor).toBe('Ivory');

      // A DIFFERENT explicit color, same product+size -> a genuinely separate line
      // (item.selectedColor === selectedColor is a strict compare when selectedColor is truthy).
      const second = await cartAddRoute(
        postRequest(
          '/api/cart/items',
          { productId: product.id, quantity: 1, selectedSize: 'M', selectedColor: 'Navy' },
          authHeader(user)
        )
      ).then((r) => r.json());
      expect(second.cart.items).toHaveLength(2);

      // No color at all, same product+size -> the merge clause degenerates to
      // `true` (matches ANY existing color) and merges into the FIRST matching
      // line (Ivory), not a third line.
      const third = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      ).then((r) => r.json());
      expect(third.cart.items).toHaveLength(2);
      const ivoryLine = third.cart.items.find((i) => i.selectedColor === 'Ivory');
      const navyLine = third.cart.items.find((i) => i.selectedColor === 'Navy');
      expect(ivoryLine.quantity).toBe(2);
      expect(navyLine.quantity).toBe(1);
    });

    it('requesting more than available stock -> 400 with the exact message', async () => {
      const user = await insertUser();
      const product = await insertProduct({ stock: 2 });
      const res = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 3, selectedSize: 'M' }, authHeader(user))
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Cannot add items. Available stock is 2 (currently in cart: 0).'
      });
    });

    // Implicit `trim: true` parity (fix-implicit-trim-report.md):
    // server/models/Cart.js's items[] sub-schema declares `trim: true` on
    // both selectedSize and selectedColor. The source controller never
    // trimmed them explicitly -- Mongoose's schema cast did it silently on
    // push, AFTER the existing-line match comparison (cartController.js:
    // 121-126, reproduced as-is: that comparison correctly runs against the
    // RAW value). A product with no `sizes` list is used so `finalSize`
    // passes straight through untouched by the size-inclusion fallback,
    // isolating the trim behaviour under test.
    it('trims selectedSize/selectedColor at insert, matching the old Mongoose schema cast on Cart.items[]', async () => {
      const user = await insertUser();
      const product = await insertProduct({ sizes: [] });

      const res = await cartAddRoute(
        postRequest(
          '/api/cart/items',
          { productId: product.id, quantity: 1, selectedSize: '  L  ', selectedColor: '  Rose  ' },
          authHeader(user)
        )
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items[0].selectedSize).toBe('L');
      expect(body.cart.items[0].selectedColor).toBe('Rose');

      const { rows } = await query(
        `select ci.selected_size, ci.selected_color
         from cart_items ci join carts c on c.id = ci.cart_id
         where c.user_id = $1`,
        [user.id]
      );
      expect(rows[0].selected_size).toBe('L');
      expect(rows[0].selected_color).toBe('Rose');
    });

    it('negative: quantity (a Number, not a field the schema trims) round-trips unaffected', async () => {
      const user = await insertUser();
      const product = await insertProduct({ sizes: [] });

      const res = await cartAddRoute(
        postRequest(
          '/api/cart/items',
          { productId: product.id, quantity: 3, selectedSize: 'M' },
          authHeader(user)
        )
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items[0].quantity).toBe(3);
    });
  });

  describe('PATCH /api/cart/items/:id', () => {
    it('updates quantity -- shape matches tools/golden/034-cart.patch-quantity.json', async () => {
      const user = await insertUser();
      const product = await insertProduct({ stock: 25 });
      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      const res = await cartPatchRoute(
        patchRequest(`/api/cart/items/${cartItemId}`, { quantity: 5 }, authHeader(user)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect('message' in body).toBe(false);
      expect(body.cart.items[0].quantity).toBe(5);
      expect(body.cart.items[0].subtotal).toBe(42500);
      expect(body.cart.subtotal).toBe(42500);
      expect(body.cart.totalCount).toBe(5);
    });

    it('patching to a quantity above stock -> 400 with the exact message (invalid quantity)', async () => {
      const user = await insertUser();
      const product = await insertProduct({ stock: 5 });
      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      const res = await cartPatchRoute(
        patchRequest(`/api/cart/items/${cartItemId}`, { quantity: 999 }, authHeader(user)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Requested quantity exceeds available stock of 5'
      });
    });

    it('patching quantity to 0 or below removes the line', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      const res = await cartPatchRoute(
        patchRequest(`/api/cart/items/${cartItemId}`, { quantity: 0 }, authHeader(user)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toEqual([]);
    });

    it('unknown cart item id -> 404 "Item not found in cart"', async () => {
      const user = await insertUser();
      await cartGetRoute(getRequest('/api/cart', authHeader(user))); // auto-create the cart row
      const res = await cartPatchRoute(
        patchRequest('/api/cart/items/00000000-0000-0000-0000-000000000000', { quantity: 2 }, authHeader(user)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Item not found in cart' });
    });

    it('no cart yet -> 404 "Cart not found"', async () => {
      const user = await insertUser();
      const res = await cartPatchRoute(
        patchRequest('/api/cart/items/00000000-0000-0000-0000-000000000000', { quantity: 2 }, authHeader(user)),
        paramsContext({ id: '00000000-0000-0000-0000-000000000000' })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Cart not found' });
    });
  });

  describe('DELETE /api/cart/items/:id', () => {
    it('removes an item -- shape matches tools/golden/035-cart.delete-item.json', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      const res = await cartDeleteItemRoute(
        deleteRequest(`/api/cart/items/${cartItemId}`, authHeader(user)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Item removed from cart',
        cart: { id: added.cart.id, user: user.id, items: [], subtotal: 0, totalCount: 0 }
      });
    });

    it('the frontend\'s ?size= query param is ignored when the id is the cart item\'s own id (context/CartContext.jsx:139-167 always passes cartItemId)', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      // A size that does NOT match the item's actual size -- if `size` were
      // consulted for an itemId match, this delete would have to no-op.
      // It does not: itemIdStr === id short-circuits and removes it anyway.
      const res = await cartDeleteItemRoute(
        deleteRequest(`/api/cart/items/${cartItemId}?size=XL`, authHeader(user)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toEqual([]);
    });
  });

  describe('DELETE /api/cart (clear)', () => {
    it('clears the cart -- shape matches tools/golden/036-cart.clear.json', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 2, selectedSize: 'M' }, authHeader(user))
      );

      const res = await cartClearRoute(deleteRequest('/api/cart', authHeader(user)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: 'Cart cleared',
        cart: { id: expect.any(String), user: user.id, items: [], subtotal: 0, totalCount: 0 }
      });

      const { rows } = await query(
        'select ci.id from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = $1',
        [user.id]
      );
      expect(rows).toHaveLength(0);
    });

    it('clearing with no pre-existing cart returns id: "" -- reproduces cartController.js:294-320\'s hand-built fallback', async () => {
      const user = await insertUser();
      const res = await cartClearRoute(deleteRequest('/api/cart', authHeader(user)));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Cart cleared',
        cart: { id: '', user: user.id, items: [], subtotal: 0, totalCount: 0 }
      });
    });
  });

  describe('a deleted product disappears from the cart response', () => {
    it('cart_items.product_id cascades on product delete (Ruling C15), so the item is gone from GET /api/cart', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 1, selectedSize: 'M' }, authHeader(user))
      );

      await query('delete from products where id = $1', [product.id]);

      const res = await cartGetRoute(getRequest('/api/cart', authHeader(user)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.items).toEqual([]);
      expect(body.cart.subtotal).toBe(0);
      expect(body.cart.totalCount).toBe(0);
    });
  });

  describe('subtotal and totalCount arithmetic across multiple lines', () => {
    it('sums price*quantity per line and quantity across lines', async () => {
      const user = await insertUser();
      const productA = await insertProduct({ price: 1000, stock: 50 });
      const productB = await insertProduct({ price: 2500, stock: 50 });

      await cartAddRoute(
        postRequest('/api/cart/items', { productId: productA.id, quantity: 3, selectedSize: 'M' }, authHeader(user))
      );
      await cartAddRoute(
        postRequest('/api/cart/items', { productId: productB.id, quantity: 2, selectedSize: 'L' }, authHeader(user))
      );

      const res = await cartGetRoute(getRequest('/api/cart', authHeader(user)));
      const body = await res.json();
      expect(body.cart.items).toHaveLength(2);
      // 1000*3 + 2500*2 = 3000 + 5000 = 8000
      expect(body.cart.subtotal).toBe(8000);
      expect(body.cart.totalCount).toBe(5);
    });
  });

  describe('cart isolation between users -- mutating endpoints (Finding 2)', () => {
    it("user B cannot PATCH user A's cart item -- 404 'Item not found in cart', and user A's item is unchanged", async () => {
      const userA = await insertUser();
      const userB = await insertUser();
      const product = await insertProduct({ stock: 25 });

      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 3, selectedSize: 'M' }, authHeader(userA))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      // user B has their own cart row (auto-created), so the PATCH handler's
      // `select * from carts where user_id = $1` scopes to B's cart, which
      // does not contain A's cart_items row -- it falls into the 404 "Item
      // not found in cart" branch, not "Cart not found" (which would only
      // fire if B had no cart row at all) and never touches A's row.
      await cartGetRoute(getRequest('/api/cart', authHeader(userB)));

      const res = await cartPatchRoute(
        patchRequest(`/api/cart/items/${cartItemId}`, { quantity: 999 }, authHeader(userB)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ success: false, message: 'Item not found in cart' });

      // Assert at the database level: A's item still exists, unchanged.
      const { rows } = await query('select quantity from cart_items where id = $1', [cartItemId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe(3);
    });

    it("user B cannot DELETE user A's cart item -- 404 'Item not found in cart' is not returned (falls through as a no-op removal count of 0), and user A's item still exists", async () => {
      const userA = await insertUser();
      const userB = await insertUser();
      const product = await insertProduct({ stock: 25 });

      const added = await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 2, selectedSize: 'M' }, authHeader(userA))
      ).then((r) => r.json());
      const cartItemId = added.cart.items[0].id;

      // user B has their own (empty) cart row -- removeCartItem's source
      // scopes by `carts where user_id = $1` and then filters B's OWN items,
      // which never include A's cart_items row, so the filter is a no-op and
      // the handler returns its normal 200 success envelope for B's
      // (unaffected, still-empty) cart -- it does NOT reach into A's cart.
      const resB = await cartGetRoute(getRequest('/api/cart', authHeader(userB)));
      const bodyB = await resB.json();

      const res = await cartDeleteItemRoute(
        deleteRequest(`/api/cart/items/${cartItemId}`, authHeader(userB)),
        paramsContext({ id: cartItemId })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: 'Item removed from cart',
        cart: { id: bodyB.cart.id, user: userB.id, items: [], subtotal: 0, totalCount: 0 }
      });

      // Assert at the database level: A's item still exists, unchanged.
      const { rows } = await query('select quantity from cart_items where id = $1', [cartItemId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe(2);

      // And a genuine GET as user A confirms the item is still there and
      // unchanged from A's own point of view too.
      const resA = await cartGetRoute(getRequest('/api/cart', authHeader(userA)));
      const bodyA = await resA.json();
      expect(bodyA.cart.items).toHaveLength(1);
      expect(bodyA.cart.items[0].id).toBe(cartItemId);
      expect(bodyA.cart.items[0].quantity).toBe(2);
    });
  });

  describe('cart isolation between users', () => {
    it("user A's cart is invisible to user B", async () => {
      const userA = await insertUser();
      const userB = await insertUser();
      const product = await insertProduct();

      await cartAddRoute(
        postRequest('/api/cart/items', { productId: product.id, quantity: 4, selectedSize: 'M' }, authHeader(userA))
      );

      const resB = await cartGetRoute(getRequest('/api/cart', authHeader(userB)));
      const bodyB = await resB.json();
      expect(bodyB.cart.items).toEqual([]);
      expect(bodyB.cart.subtotal).toBe(0);
      expect(bodyB.cart.totalCount).toBe(0);

      const resA = await cartGetRoute(getRequest('/api/cart', authHeader(userA)));
      const bodyA = await resA.json();
      expect(bodyA.cart.items).toHaveLength(1);
      expect(bodyA.cart.items[0].quantity).toBe(4);

      // Different cart rows entirely.
      expect(bodyA.cart.id).not.toBe(bodyB.cart.id);
    });
  });
});
