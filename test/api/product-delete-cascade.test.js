// Task 9 fix (review finding, Ruling C15 -- docs/IMPLEMENTATION_PLAN.md):
// proves `cart_items.product_id` and `wishlist_items.product_id` actually
// cascade on product delete, not merely that the DDL parses.
//
// cart_items has no route handler yet (cart endpoints are Task 13's scope,
// out of bounds for this fix), so its half of this test exercises the
// schema directly through lib/db.js's `query`, using the exact same
// `join products p on p.id = ... where ... order by ... created_at asc`
// shape app/api/users/me/wishlist/route.js's GET already uses -- i.e. the
// query pattern a future cart GET route will need, proving it does not
// throw and correctly omits the deleted product's row. wishlist_items DOES
// have a route (this task's own GET/POST /api/users/me/wishlist), so that
// half calls the real route handler end-to-end.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

import { GET as wishlistGetRoute, POST as wishlistPostRoute } from '../../app/api/users/me/wishlist/route.js';

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

let userCounter = 0;
async function insertUser(overrides = {}) {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, role, is_active, is_email_verified)
     values ($1, $2, $3, $4, true, true)
     returning *`,
    [
      overrides.firstName || 'Cascade',
      overrides.lastName || 'Tester',
      overrides.email || `cascade-fixture-${userCounter}@zahzanmigrationtest.com`,
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
  const sku = overrides.sku || `ZHZ-CASC-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, description, category, price, stock, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      overrides.name || 'Cascade Test Product',
      overrides.slug || `cascade-product-${sku.toLowerCase()}`,
      sku,
      overrides.description || '',
      overrides.category || 'Test Category',
      overrides.price ?? 1000,
      overrides.stock ?? 10,
      overrides.isActive ?? true
    ]
  );
  return rows[0];
}

async function insertCart(userId) {
  const { rows } = await query('insert into carts (user_id) values ($1) returning *', [userId]);
  return rows[0];
}

async function insertCartItem(cartId, productId, overrides = {}) {
  const { rows } = await query(
    `insert into cart_items (cart_id, product_id, quantity, selected_size)
     values ($1, $2, $3, $4)
     returning *`,
    [cartId, productId, overrides.quantity ?? 1, overrides.selectedSize ?? 'M']
  );
  return rows[0];
}

// Same shape app/api/users/me/wishlist/route.js's GET already uses --
// stands in for the not-yet-built cart GET route (Task 13).
async function readCartLikeWishlistGet(cartId) {
  const { rows } = await query(
    `select p.* from cart_items c
     join products p on p.id = c.product_id
     where c.cart_id = $1
     order by c.created_at asc`,
    [cartId]
  );
  return rows;
}

describe('Product delete cascade (Task 9 fix, Ruling C15)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('cart_items.product_id on delete cascade', () => {
    it('deleting a product referenced by a cart item succeeds and removes the cart_items row', async () => {
      const user = await insertUser();
      const product = await insertProduct({ name: 'In Cart Product' });
      const cart = await insertCart(user.id);
      const cartItem = await insertCartItem(cart.id, product.id);

      // Sanity: the row exists before the delete.
      const before = await query('select id from cart_items where id = $1', [cartItem.id]);
      expect(before.rows).toHaveLength(1);

      // The delete itself must succeed (no 23503 foreign-key-violation
      // error), matching the old app's admin permanent-delete, which
      // always returned 200.
      await expect(query('delete from products where id = $1', [product.id])).resolves.toBeTruthy();

      const after = await query('select id from cart_items where id = $1', [cartItem.id]);
      expect(after.rows).toHaveLength(0);
    });

    it('a cart-read-shaped query still succeeds (200-equivalent) after the referenced product is gone, and omits the deleted item', async () => {
      const user = await insertUser();
      const survivor = await insertProduct({ name: 'Surviving Cart Product' });
      const doomed = await insertProduct({ name: 'Doomed Cart Product' });
      const cart = await insertCart(user.id);
      await insertCartItem(cart.id, survivor.id);
      await insertCartItem(cart.id, doomed.id);

      await query('delete from products where id = $1', [doomed.id]);

      // Must not throw -- proves a future cart GET route built on this
      // join pattern will return 200, not crash, after the cascade.
      const rows = await readCartLikeWishlistGet(cart.id);
      const ids = rows.map((row) => row.id);
      expect(ids).toContain(survivor.id);
      expect(ids).not.toContain(doomed.id);
    });
  });

  describe('wishlist_items.product_id on delete cascade', () => {
    it('deleting a product referenced by a wishlist item succeeds and removes the wishlist_items row', async () => {
      const user = await insertUser();
      const product = await insertProduct({ name: 'In Wishlist Product' });

      const onRes = await wishlistPostRoute(
        postRequest('/api/users/me/wishlist', { productId: product.id }, authHeader(user))
      );
      expect(onRes.status).toBe(200);

      const before = await query('select id from wishlist_items where user_id = $1 and product_id = $2', [
        user.id,
        product.id
      ]);
      expect(before.rows).toHaveLength(1);

      await expect(query('delete from products where id = $1', [product.id])).resolves.toBeTruthy();

      const after = await query('select id from wishlist_items where user_id = $1 and product_id = $2', [
        user.id,
        product.id
      ]);
      expect(after.rows).toHaveLength(0);
    });

    it('GET /api/users/me/wishlist still returns 200 after the referenced product is deleted, omitting it', async () => {
      const user = await insertUser();
      const survivor = await insertProduct({ name: 'Surviving Wishlist Product' });
      const doomed = await insertProduct({ name: 'Doomed Wishlist Product' });

      await wishlistPostRoute(postRequest('/api/users/me/wishlist', { productId: survivor.id }, authHeader(user)));
      await wishlistPostRoute(postRequest('/api/users/me/wishlist', { productId: doomed.id }, authHeader(user)));

      await query('delete from products where id = $1', [doomed.id]);

      const res = await wishlistGetRoute(getRequest('/api/users/me/wishlist', authHeader(user)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.wishlist).toContain(survivor.id);
      expect(body.wishlist).not.toContain(doomed.id);
      const productIds = body.products.map((p) => p._id);
      expect(productIds).toContain(survivor.id);
      expect(productIds).not.toContain(doomed.id);
    });
  });
});
