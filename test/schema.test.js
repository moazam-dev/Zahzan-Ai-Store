import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let emailCounter = 0;
function uniqueEmail() {
  emailCounter += 1;
  return `schema-test-${emailCounter}@example.com`;
}

let skuCounter = 0;
function uniqueSku() {
  skuCounter += 1;
  return `SCHEMA-TEST-${skuCounter}`;
}

let orderNumberCounter = 0;
function uniqueOrderNumber() {
  orderNumberCounter += 1;
  return `ZHZ-99999999-${String(orderNumberCounter).padStart(4, '0')}`;
}

describe('0001_init.sql schema (applied to a fresh PGlite -- AR3)', () => {
  let db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db.reset();
  });

  /** Generic insert helper: `data` maps column name -> value. Returns the new row's id. */
  async function insertRow(table, data) {
    const cols = Object.keys(data);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const { rows } = await db.query(
      `insert into ${table} (${cols.join(', ')}) values (${placeholders.join(', ')}) returning id`,
      cols.map((c) => data[c])
    );
    return rows[0].id;
  }

  async function insertUser(overrides = {}) {
    return insertRow('users', {
      first_name: 'Test',
      last_name: 'User',
      email: uniqueEmail(),
      ...overrides
    });
  }

  async function insertProduct(overrides = {}) {
    const sku = overrides.sku || uniqueSku();
    return insertRow('products', {
      name: 'Test Product',
      slug: `test-product-${sku.toLowerCase()}`,
      sku,
      category: 'Test Category',
      price: 1000,
      ...overrides
    });
  }

  function baseOrderFields(userId, overrides = {}) {
    return {
      order_number: uniqueOrderNumber(),
      user_id: userId,
      customer_name: 'Test Customer',
      customer_email: 'customer@example.com',
      customer_phone: '03001234567',
      items: JSON.stringify([]),
      shipping_address: JSON.stringify({ fullName: 'Test Customer' }),
      subtotal: 0,
      total: 0,
      ...overrides
    };
  }

  // ---------------------------------------------------------------------
  // Table existence
  // ---------------------------------------------------------------------

  it('creates all twenty tables', async () => {
    const { rows } = await db.query(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `);
    const names = rows.map((r) => r.table_name);

    const expected = [
      'addresses',
      'admin_users',
      'audit_logs',
      'cart_items',
      'carts',
      'email_change_tokens',
      'newsletter_subscribers',
      'notifications',
      // Task 11 (task-11-brief.md): per-day counter table backing
      // next_order_number()'s atomic INSERT ... ON CONFLICT ... DO UPDATE
      // sequence allocation -- see supabase/migrations/0001_init.sql's Task
      // 11 section. Not one of the original nineteen (spec sec5.2); added
      // by the sanctioned race fix (spec sec8.2), same pattern as
      // rate_limits backing check_rate_limit().
      'order_number_counters',
      'orders',
      'password_reset_tokens',
      'payments',
      'products',
      'rate_limits',
      'refresh_tokens',
      'story_submissions',
      'tryon_jobs',
      'users',
      'verification_tokens',
      'wishlist_items'
    ].sort();

    expect(names).toHaveLength(20);
    expect(names).toEqual(expected);
  });

  // ---------------------------------------------------------------------
  // gen_random_uuid()
  // ---------------------------------------------------------------------

  it('gen_random_uuid() populates every id without one being supplied', async () => {
    const userId = await insertUser();
    expect(userId).toMatch(UUID_RE);

    const productId = await insertProduct();
    expect(productId).toMatch(UUID_RE);

    const orderId = await insertRow('orders', baseOrderFields(userId));
    expect(orderId).toMatch(UUID_RE);
  });

  // ---------------------------------------------------------------------
  // updated_at trigger
  // ---------------------------------------------------------------------

  it('updated_at actually advances on update via the set_updated_at trigger', async () => {
    const userId = await insertUser();
    const before = await db.query('select created_at, updated_at from users where id = $1', [userId]);
    expect(before.rows[0].created_at).toEqual(before.rows[0].updated_at);

    // Real wall-clock delay: now() differs per statement, but two
    // statements executed in the same instant could theoretically collide
    // at timestamptz's resolution -- guarantee separation instead of
    // hoping for it.
    await new Promise((resolve) => setTimeout(resolve, 20));

    await db.query('update users set first_name = $1 where id = $2', ['Changed', userId]);
    const after = await db.query('select created_at, updated_at from users where id = $1', [userId]);

    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].updated_at).getTime()
    );
    // created_at must NOT move.
    expect(new Date(after.rows[0].created_at).getTime()).toBe(new Date(before.rows[0].created_at).getTime());
  });

  it('the trigger is attached to every table Mongoose gave timestamps: true (spot check a few)', async () => {
    for (const table of ['products', 'orders', 'payments', 'carts', 'cart_items', 'newsletter_subscribers']) {
      const { rows } = await db.query(
        `select count(*)::int as n from information_schema.triggers
         where event_object_table = $1 and trigger_name = $2`,
        [table, `set_updated_at_${table}`]
      );
      expect(rows[0].n, `expected a set_updated_at trigger on ${table}`).toBe(1);
    }
  });

  // ---------------------------------------------------------------------
  // CHECK constraints -- reject every invalid value, accept every valid one
  // ---------------------------------------------------------------------

  describe('CHECK constraints', () => {
    it('users.auth_provider', async () => {
      await expect(insertUser({ email: uniqueEmail(), auth_provider: 'bogus' })).rejects.toThrow();
      for (const value of ['local', 'google', 'facebook']) {
        await expect(insertUser({ auth_provider: value })).resolves.toMatch(UUID_RE);
      }
    });

    it('users.role', async () => {
      await expect(insertUser({ role: 'superadmin' })).rejects.toThrow();
      for (const value of ['customer', 'admin']) {
        await expect(insertUser({ role: value })).resolves.toMatch(UUID_RE);
      }
    });

    it('orders.payment_method', async () => {
      const userId = await insertUser();
      await expect(
        insertRow('orders', baseOrderFields(userId, { payment_method: 'Crypto' }))
      ).rejects.toThrow();
      for (const value of ['Cash on Delivery', 'JazzCash', 'Easypaisa', 'Bank Transfer']) {
        await expect(
          insertRow('orders', baseOrderFields(userId, { payment_method: value }))
        ).resolves.toMatch(UUID_RE);
      }
    });

    it('orders.payment_status', async () => {
      const userId = await insertUser();
      await expect(
        insertRow('orders', baseOrderFields(userId, { payment_status: 'bogus' }))
      ).rejects.toThrow();
      for (const value of ['pending', 'submitted', 'verified', 'rejected', 'not_required']) {
        await expect(
          insertRow('orders', baseOrderFields(userId, { payment_status: value }))
        ).resolves.toMatch(UUID_RE);
      }
    });

    it('orders.order_status', async () => {
      const userId = await insertUser();
      await expect(
        insertRow('orders', baseOrderFields(userId, { order_status: 'Lost' }))
      ).rejects.toThrow();
      for (const value of ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled']) {
        await expect(
          insertRow('orders', baseOrderFields(userId, { order_status: value }))
        ).resolves.toMatch(UUID_RE);
      }
    });

    async function basePayment(userId, orderId, overrides = {}) {
      return {
        order_id: orderId,
        user_id: userId,
        payment_method: 'JazzCash',
        amount: 100,
        transaction_reference: `REF-${Math.random().toString(36).slice(2)}`,
        proof_url: 'https://example.test/proof.png',
        ...overrides
      };
    }

    it('payments.payment_method', async () => {
      const userId = await insertUser();
      const orderId = await insertRow('orders', baseOrderFields(userId));
      await expect(
        insertRow('payments', await basePayment(userId, orderId, { payment_method: 'Cash on Delivery' }))
      ).rejects.toThrow();
      for (const value of ['JazzCash', 'Easypaisa', 'Bank Transfer']) {
        await expect(
          insertRow('payments', await basePayment(userId, orderId, { payment_method: value }))
        ).resolves.toMatch(UUID_RE);
      }
    });

    it('payments.status', async () => {
      const userId = await insertUser();
      const orderId = await insertRow('orders', baseOrderFields(userId));
      await expect(insertRow('payments', await basePayment(userId, orderId, { status: 'Bogus' }))).rejects.toThrow();
      for (const value of ['Pending', 'Verified', 'Rejected']) {
        await expect(
          insertRow('payments', await basePayment(userId, orderId, { status: value }))
        ).resolves.toMatch(UUID_RE);
      }
    });

    it('newsletter_subscribers.status', async () => {
      await expect(
        insertRow('newsletter_subscribers', { email: uniqueEmail(), status: 'bogus' })
      ).rejects.toThrow();
      for (const value of ['subscribed', 'unsubscribed']) {
        await expect(
          insertRow('newsletter_subscribers', { email: uniqueEmail(), status: value })
        ).resolves.toMatch(UUID_RE);
      }
    });

    it('story_submissions.status', async () => {
      const base = { name: 'Jane', image: 'https://example.test/a.png' };
      await expect(insertRow('story_submissions', { ...base, status: 'bogus' })).rejects.toThrow();
      for (const value of ['pending', 'approved', 'rejected']) {
        await expect(insertRow('story_submissions', { ...base, status: value })).resolves.toMatch(UUID_RE);
      }
    });

    it('story_submissions.rating', async () => {
      const base = { name: 'Jane', image: 'https://example.test/a.png' };
      await expect(insertRow('story_submissions', { ...base, rating: 0 })).rejects.toThrow();
      await expect(insertRow('story_submissions', { ...base, rating: 6 })).rejects.toThrow();
      for (const value of [1, 2, 3, 4, 5]) {
        await expect(insertRow('story_submissions', { ...base, rating: value })).resolves.toMatch(UUID_RE);
      }
    });

    it('tryon_jobs.status', async () => {
      const userId = await insertUser();
      const base = { user_id: userId, input_image: 'https://example.test/in.png' };
      await expect(insertRow('tryon_jobs', { ...base, status: 'bogus' })).rejects.toThrow();
      for (const value of ['queued', 'processing', 'completed', 'failed']) {
        await expect(insertRow('tryon_jobs', { ...base, status: value })).resolves.toMatch(UUID_RE);
      }
    });

    it('numeric >= 0 checks reject a negative value (products.price, products.stock)', async () => {
      await expect(insertProduct({ price: -1 })).rejects.toThrow();
      await expect(insertProduct({ stock: -1 })).rejects.toThrow();
      await expect(insertProduct({ price: 0, stock: 0 })).resolves.toMatch(UUID_RE);
    });

    // Fix round 1 (post-review): the six CHECK constraints below existed in
    // 0001_init.sql from the start and are correct there -- this round adds
    // the test coverage the brief requires (task-3-brief.md:50, "each CHECK
    // constraint rejects an invalid value and accepts every valid one")
    // that was missing for them. Each asserts both directions: a violating
    // value is rejected and the valid boundary value (0 for every `>= 0`
    // check here, 1 for quantity's `>= 1`) is accepted -- getting a
    // boundary backwards would be worse than no test at all.

    it('products.original_price >= 0 (products_original_price_check)', async () => {
      await expect(insertProduct({ original_price: -1 })).rejects.toThrow();
      await expect(insertProduct({ original_price: 0 })).resolves.toMatch(UUID_RE);
    });

    it('orders.subtotal >= 0 (orders_subtotal_check)', async () => {
      const userId = await insertUser();
      await expect(insertRow('orders', baseOrderFields(userId, { subtotal: -1 }))).rejects.toThrow();
      await expect(insertRow('orders', baseOrderFields(userId, { subtotal: 0 }))).resolves.toMatch(UUID_RE);
    });

    it('orders.shipping_cost >= 0 (orders_shipping_cost_check)', async () => {
      const userId = await insertUser();
      await expect(
        insertRow('orders', baseOrderFields(userId, { shipping_cost: -1 }))
      ).rejects.toThrow();
      await expect(
        insertRow('orders', baseOrderFields(userId, { shipping_cost: 0 }))
      ).resolves.toMatch(UUID_RE);
    });

    it('orders.total >= 0 (orders_total_check)', async () => {
      const userId = await insertUser();
      await expect(insertRow('orders', baseOrderFields(userId, { total: -1 }))).rejects.toThrow();
      await expect(insertRow('orders', baseOrderFields(userId, { total: 0 }))).resolves.toMatch(UUID_RE);
    });

    it('payments.amount >= 0 (payments_amount_check)', async () => {
      const userId = await insertUser();
      const orderId = await insertRow('orders', baseOrderFields(userId));
      await expect(
        insertRow('payments', await basePayment(userId, orderId, { amount: -1 }))
      ).rejects.toThrow();
      await expect(
        insertRow('payments', await basePayment(userId, orderId, { amount: 0 }))
      ).resolves.toMatch(UUID_RE);
    });

    it('cart_items.quantity >= 1 (cart_items_quantity_check)', async () => {
      const userId = await insertUser();
      const productId = await insertProduct();
      const cartId = await insertRow('carts', { user_id: userId });
      await expect(
        insertRow('cart_items', { cart_id: cartId, product_id: productId, quantity: 0 })
      ).rejects.toThrow();
      await expect(
        insertRow('cart_items', { cart_id: cartId, product_id: productId, quantity: 1 })
      ).resolves.toMatch(UUID_RE);
    });
  });

  // ---------------------------------------------------------------------
  // Uniqueness
  // ---------------------------------------------------------------------

  it('users: unique index on lower(email) rejects a case-varied duplicate', async () => {
    await insertUser({ email: 'a@b.com' });
    await expect(insertUser({ email: 'A@B.com' })).rejects.toThrow();
    // A genuinely different address is still fine.
    await expect(insertUser({ email: 'c@b.com' })).resolves.toMatch(UUID_RE);
  });

  it('newsletter_subscribers: partial unique index on unsubscribe_token permits multiple NULLs, rejects a duplicate non-null', async () => {
    await expect(insertRow('newsletter_subscribers', { email: uniqueEmail() })).resolves.toMatch(UUID_RE);
    await expect(insertRow('newsletter_subscribers', { email: uniqueEmail() })).resolves.toMatch(UUID_RE);

    await expect(
      insertRow('newsletter_subscribers', { email: uniqueEmail(), unsubscribe_token: 'token-abc' })
    ).resolves.toMatch(UUID_RE);
    await expect(
      insertRow('newsletter_subscribers', { email: uniqueEmail(), unsubscribe_token: 'token-abc' })
    ).rejects.toThrow();
  });

  it('products.slug and products.sku are unique', async () => {
    await insertProduct({ slug: 'dup-slug', sku: uniqueSku() });
    await expect(insertProduct({ slug: 'dup-slug', sku: uniqueSku() })).rejects.toThrow();

    const sku = uniqueSku();
    await insertProduct({ sku });
    await expect(insertProduct({ sku })).rejects.toThrow();
  });

  it('orders.order_number and carts.user_id are unique', async () => {
    const userId = await insertUser();
    const orderNumber = uniqueOrderNumber();
    await insertRow('orders', baseOrderFields(userId, { order_number: orderNumber }));
    await expect(
      insertRow('orders', baseOrderFields(userId, { order_number: orderNumber }))
    ).rejects.toThrow();

    await insertRow('carts', { user_id: userId });
    await expect(insertRow('carts', { user_id: userId })).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // text[] / jsonb round-trip
  // ---------------------------------------------------------------------

  it('text[] columns round-trip', async () => {
    const productId = await insertProduct({
      images: ['https://example.test/1.png', 'https://example.test/2.png'],
      sizes: ['S', 'M', 'L'],
      care_instructions: ['Dry clean only'],
      gallery: []
    });

    const { rows } = await db.query(
      'select images, sizes, care_instructions, gallery from products where id = $1',
      [productId]
    );
    expect(rows[0].images).toEqual(['https://example.test/1.png', 'https://example.test/2.png']);
    expect(rows[0].sizes).toEqual(['S', 'M', 'L']);
    expect(rows[0].care_instructions).toEqual(['Dry clean only']);
    expect(rows[0].gallery).toEqual([]);
  });

  it('jsonb columns round-trip (fixed-shape array and object)', async () => {
    const colors = [{ name: 'Red', hex: '#ff0000', image: 'https://example.test/red.png' }];
    const breakdown = { shirt: '1.2m', trouser: '1.5m', dupatta: '2.5m' };

    const productId = await insertProduct({
      colors: JSON.stringify(colors),
      breakdown: JSON.stringify(breakdown)
    });

    const { rows } = await db.query('select colors, breakdown from products where id = $1', [productId]);
    expect(rows[0].colors).toEqual(colors);
    expect(rows[0].breakdown).toEqual(breakdown);
  });

  it('orders.items and orders.shipping_address (jsonb) round-trip an immutable checkout snapshot', async () => {
    const userId = await insertUser();
    const items = [
      { productId: '11111111-1111-1111-1111-111111111111', productName: 'Silk Kurta', quantity: 2, unitPrice: 8500 }
    ];
    const shippingAddress = { fullName: 'Sara Malik', city: 'Lahore', postalCode: '54000' };

    const orderId = await insertRow(
      'orders',
      baseOrderFields(userId, {
        items: JSON.stringify(items),
        shipping_address: JSON.stringify(shippingAddress)
      })
    );

    const { rows } = await db.query('select items, shipping_address from orders where id = $1', [orderId]);
    expect(rows[0].items).toEqual(items);
    expect(rows[0].shipping_address).toEqual(shippingAddress);
  });

  // ---------------------------------------------------------------------
  // Cascade deletes
  // ---------------------------------------------------------------------

  it('cart_items cascade-deletes when its cart is deleted', async () => {
    const userId = await insertUser();
    const productId = await insertProduct();
    const cartId = await insertRow('carts', { user_id: userId });
    await insertRow('cart_items', { cart_id: cartId, product_id: productId });

    const before = await db.query('select id from cart_items where cart_id = $1', [cartId]);
    expect(before.rows).toHaveLength(1);

    await db.query('delete from carts where id = $1', [cartId]);

    const after = await db.query('select id from cart_items where cart_id = $1', [cartId]);
    expect(after.rows).toHaveLength(0);
  });

  it('wishlist_items cascade-deletes when its user is deleted', async () => {
    const userId = await insertUser();
    const productId = await insertProduct();
    await insertRow('wishlist_items', { user_id: userId, product_id: productId });

    const before = await db.query('select id from wishlist_items where user_id = $1', [userId]);
    expect(before.rows).toHaveLength(1);

    await db.query('delete from users where id = $1', [userId]);

    const after = await db.query('select id from wishlist_items where user_id = $1', [userId]);
    expect(after.rows).toHaveLength(0);
  });

  it('wishlist_items enforces a unique (user_id, product_id) pair', async () => {
    const userId = await insertUser();
    const productId = await insertProduct();
    await insertRow('wishlist_items', { user_id: userId, product_id: productId });
    await expect(insertRow('wishlist_items', { user_id: userId, product_id: productId })).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // purge_expired()
  // ---------------------------------------------------------------------

  it('purge_expired() removes only expired rows, across all four token tables', async () => {
    const userId = await insertUser();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    await insertRow('refresh_tokens', { user_id: userId, token: 'rt-expired', expires_at: past });
    await insertRow('refresh_tokens', { user_id: userId, token: 'rt-valid', expires_at: future });

    await insertRow('password_reset_tokens', { user_id: userId, token: 'prt-expired', expires_at: past });
    await insertRow('password_reset_tokens', { user_id: userId, token: 'prt-valid', expires_at: future });

    await insertRow('email_change_tokens', {
      user_id: userId,
      new_email: 'expired@example.com',
      token: 'ect-expired',
      expires_at: past
    });
    await insertRow('email_change_tokens', {
      user_id: userId,
      new_email: 'valid@example.com',
      token: 'ect-valid',
      expires_at: future
    });

    await insertRow('verification_tokens', { user_id: userId, token: 'vt-expired', expires_at: past });
    await insertRow('verification_tokens', { user_id: userId, token: 'vt-valid', expires_at: future });

    // A row in a table purge_expired() must NOT touch, even though it also
    // has an expires_at in the past -- confirms the function is scoped to
    // exactly the four token tables (plus rate_limits, N3 fix, covered by
    // its own test below) and nothing else.
    await insertRow('tryon_jobs', {
      user_id: userId,
      input_image: 'https://example.test/in.png',
      expires_at: past
    });

    const { rows } = await db.query('select purge_expired() as count');
    expect(rows[0].count).toBe(4);

    expect((await db.query('select token from refresh_tokens')).rows.map((r) => r.token)).toEqual(['rt-valid']);
    expect((await db.query('select token from password_reset_tokens')).rows.map((r) => r.token)).toEqual([
      'prt-valid'
    ]);
    expect((await db.query('select token from email_change_tokens')).rows.map((r) => r.token)).toEqual([
      'ect-valid'
    ]);
    expect((await db.query('select token from verification_tokens')).rows.map((r) => r.token)).toEqual([
      'vt-valid'
    ]);
    expect((await db.query('select count(*)::int as n from tryon_jobs')).rows[0].n).toBe(1);
  });

  // N3 fix: rate_limits accrues one permanent row per unique
  // `${limiterId}:${ip}` key (lib/rateLimit.js's checkRateLimit, now called
  // by every one of the 67 routes via withApiHandler) and, unlike the four
  // token tables, has no expires_at of its own -- purge_expired() now also
  // deletes rows whose window_start is far older than the longest
  // configured window (registerRateLimit's 1 hour), which can no longer
  // affect any live rate-limit decision.
  it('purge_expired() also removes stale rate_limits rows, but not current ones', async () => {
    const staleWindowStart = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
    const currentWindowStart = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago

    await insertRow('rate_limits', { key: 'global:1.2.3.4-stale', window_start: staleWindowStart, count: 5 });
    await insertRow('rate_limits', { key: 'login:5.6.7.8-current', window_start: currentWindowStart, count: 2 });

    const { rows } = await db.query('select purge_expired() as count');
    expect(rows[0].count).toBe(1);

    const remaining = (await db.query('select key from rate_limits')).rows.map((r) => r.key);
    expect(remaining).toEqual(['login:5.6.7.8-current']);
  });
});
