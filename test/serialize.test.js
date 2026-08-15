import { describe, expect, it } from 'vitest';
import {
  serializeAddress,
  serializeAuditLog,
  serializeAuthUser,
  serializeCart,
  serializeCartItem,
  serializeNewsletterSubscriber,
  serializeOrder,
  serializePayment,
  serializeProduct,
  serializeStory,
  serializeTryOnJob,
  serializeUser
} from '../lib/serialize.js';

const NOW = '2026-08-15T09:30:00.000Z';

// Matches a genuine snake_case key (a letter/digit, underscore, letter/
// digit) without false-flagging `_id` (leading underscore, nothing before
// it) or `__v` (two leading underscores, nothing alphanumeric before
// either).
const SNAKE_CASE_KEY_RE = /[a-z0-9]_[a-z0-9]/i;

function collectSnakeCaseKeys(value, path = '$') {
  const found = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...collectSnakeCaseKeys(item, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      if (SNAKE_CASE_KEY_RE.test(key)) found.push(`${path}.${key}`);
      found.push(...collectSnakeCaseKeys(val, `${path}.${key}`));
    }
  }
  return found;
}

describe('lib/serialize.js', () => {
  // -------------------------------------------------------------------
  // Fixtures -- shaped exactly like a row test/schema.test.js's own
  // queries would return: numeric(12,2) columns as strings (the real,
  // verified driver behaviour -- see the header comment in
  // lib/serialize.js), timestamptz columns as ISO strings (a Date object
  // would work identically through toIso(), a string exercises the same
  // path PGlite/pg both actually return).
  // -------------------------------------------------------------------

  const userRow = {
    id: 'u-1',
    first_name: 'Sara',
    last_name: 'Malik',
    email: 'sara@example.com',
    password: '$2a$10$hashedhashedhashedhashedhashedhashedhashed',
    auth_provider: 'local',
    google_id: '',
    facebook_id: '',
    phone: '03001234567',
    role: 'customer',
    is_email_verified: true,
    is_active: true,
    created_at: NOW,
    updated_at: NOW
  };

  const productRow = {
    id: 'p-1',
    name: 'ZAHZAN Ivory Silk Kurta',
    slug: 'ivory-silk-kurta-zhz-001',
    sku: 'ZHZ-001',
    description: 'Hand-finished.',
    quick_description: '',
    price: '8500.00',
    original_price: null,
    category: 'Kurtas',
    badge: null,
    images: ['https://example.test/1.png'],
    image: 'https://example.test/1.png',
    hover_image: null,
    colors: [{ name: 'Ivory', hex: '#F5F0E6' }],
    color: 'Ivory',
    sizes: ['S', 'M', 'L'],
    fabric: 'Pure Silk',
    work: null,
    breakdown: null,
    model_info: null,
    care_instructions: ['Dry clean only'],
    gallery: [],
    stock: 25,
    is_active: true,
    created_at: NOW,
    updated_at: NOW
  };

  const orderRow = {
    id: 'o-1',
    order_number: 'ZHZ-20260815-0001',
    user_id: 'u-1',
    customer_name: 'Sara Malik',
    customer_email: 'sara@example.com',
    customer_phone: '03001234567',
    items: [{ productId: 'p-1', productName: 'ZAHZAN Ivory Silk Kurta', quantity: 1, unitPrice: 8500 }],
    shipping_address: { fullName: 'Sara Malik', city: 'Lahore' },
    subtotal: '8500.00',
    shipping_cost: '250.00',
    total: '8750.00',
    payment_method: 'Cash on Delivery',
    payment_status: 'not_required',
    order_status: 'Pending',
    created_at: NOW,
    updated_at: NOW
  };

  const paymentRow = {
    id: 'pay-1',
    order_id: 'o-1',
    user_id: 'u-1',
    payment_method: 'JazzCash',
    amount: '8750.00',
    transaction_reference: 'TXN001',
    proof_url: 'https://example.test/proof.png',
    proof_public_id: 'zahzan/payment-proofs/payment_1',
    status: 'Pending',
    rejection_reason: '',
    verified_by: null,
    verified_at: null,
    created_at: NOW,
    updated_at: NOW
  };

  const addressRow = {
    id: 'addr-1',
    user_id: 'u-1',
    full_name: 'Sara Malik',
    phone: '03001234567',
    address_line1: '123 Gulberg Boulevard',
    address_line2: '',
    city: 'Lahore',
    province: 'Punjab',
    postal_code: '54000',
    country: 'Pakistan',
    label: 'Home',
    is_default: true,
    created_at: NOW,
    updated_at: NOW
  };

  const subscriberRow = {
    id: 'sub-1',
    email: 'subscriber@example.com',
    status: 'subscribed',
    source: 'footer',
    unsubscribe_token: 'super-secret-token-value',
    user_id: null,
    subscribed_at: NOW,
    unsubscribed_at: null,
    created_at: NOW,
    updated_at: NOW
  };

  const auditLogRow = {
    id: 'log-1',
    admin_id: 'u-admin-1',
    action: 'ADMIN_LOGIN',
    entity: 'User',
    entity_id: '',
    ip_address: '::1',
    metadata: {},
    created_at: NOW,
    updated_at: NOW
  };

  const storyRow = {
    id: 'story-1',
    user_id: 'u-1',
    name: 'Jane Doe',
    username: '',
    image: 'https://example.test/story.png',
    caption: '',
    rating: null,
    product_id: null,
    color: '',
    status: 'pending',
    reviewed_at: null,
    reviewed_by: null,
    created_at: NOW,
    updated_at: NOW
  };

  const tryOnJobRow = {
    id: 'job-1',
    user_id: 'u-1',
    product_id: null,
    color: '',
    input_image: 'https://example.test/in.png',
    output_image: '',
    status: 'queued',
    error: '',
    completed_at: null,
    expires_at: null,
    created_at: NOW,
    updated_at: NOW
  };

  // -------------------------------------------------------------------
  // null / undefined -> null, for every function
  // -------------------------------------------------------------------

  const allFns = {
    serializeUser,
    serializeAuthUser,
    serializeProduct,
    serializeOrder,
    serializeCartItem,
    serializeCart,
    serializePayment,
    serializeAddress,
    serializeNewsletterSubscriber,
    serializeAuditLog,
    serializeStory,
    serializeTryOnJob
  };

  it('every function returns null for a null input, and never throws for undefined', () => {
    for (const [name, fn] of Object.entries(allFns)) {
      expect(fn(null), name).toBeNull();
      expect(() => fn(undefined)).not.toThrow();
      expect(fn(undefined), name).toBeNull();
    }
  });

  // -------------------------------------------------------------------
  // _id === id (GC2), for the nine functions it applies to. Three
  // functions deliberately do NOT carry `_id` at all -- see the dedicated
  // tests for each further down, which document exactly why.
  // -------------------------------------------------------------------

  it('_id and id are both present and equal, for every entity GC2 governs', () => {
    const cases = [
      serializeUser(userRow),
      serializeProduct(productRow),
      serializeOrder(orderRow),
      serializePayment(paymentRow),
      serializeAddress(addressRow),
      serializeNewsletterSubscriber(subscriberRow),
      serializeAuditLog(auditLogRow),
      serializeStory(storyRow),
      serializeTryOnJob(tryOnJobRow)
    ];
    for (const out of cases) {
      expect(out._id, JSON.stringify(out)).toBeTruthy();
      expect(out._id).toBe(out.id);
    }
  });

  // -------------------------------------------------------------------
  // camelCase conversion is complete: no snake_case key survives anywhere
  // in the output, walked recursively.
  // -------------------------------------------------------------------

  it('camelCase conversion is complete for every function (no snake_case key anywhere in the output)', () => {
    const outputs = [
      serializeUser(userRow, { wishlist: ['p-1'] }),
      serializeAuthUser(userRow, { includeCreatedAt: true }),
      serializeProduct(productRow),
      serializeOrder(orderRow, { payment: paymentRow }),
      serializeCartItem({
        id: 'ci-1',
        product_id: 'p-1',
        quantity: 2,
        selected_size: 'M',
        selected_color: '',
        product: productRow
      }),
      serializeCart(
        { id: 'cart-1', user_id: 'u-1' },
        [{ id: 'ci-1', product_id: 'p-1', quantity: 2, selected_size: 'M', selected_color: '', product: productRow }]
      ),
      serializePayment(paymentRow),
      serializeAddress(addressRow),
      serializeNewsletterSubscriber(subscriberRow),
      serializeAuditLog({ ...auditLogRow, metadata: { orderId: 'o-1', orderNumber: 'ZHZ-1' } }),
      serializeStory(storyRow),
      serializeTryOnJob(tryOnJobRow)
    ];

    for (const out of outputs) {
      expect(collectSnakeCaseKeys(out)).toEqual([]);
    }
  });

  // -------------------------------------------------------------------
  // Secrets never leak
  // -------------------------------------------------------------------

  it('password never appears anywhere in serializeUser output', () => {
    const out = serializeUser(userRow);
    expect(JSON.stringify(out)).not.toContain(userRow.password);
    expect(out.password).toBeUndefined();
  });

  it('unsubscribeToken never appears anywhere in serializeNewsletterSubscriber output', () => {
    const out = serializeNewsletterSubscriber(subscriberRow);
    expect(JSON.stringify(out)).not.toContain(subscriberRow.unsubscribe_token);
    expect(out.unsubscribeToken).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Per-function shape checks
  // -------------------------------------------------------------------

  it('serializeUser: full shape, camelCase, no password/__v, wishlist defaults to []', () => {
    const out = serializeUser(userRow);
    expect(out).toEqual({
      _id: 'u-1',
      firstName: 'Sara',
      lastName: 'Malik',
      email: 'sara@example.com',
      authProvider: 'local',
      googleId: '',
      facebookId: '',
      phone: '03001234567',
      role: 'customer',
      isEmailVerified: true,
      isActive: true,
      wishlist: [],
      createdAt: NOW,
      updatedAt: NOW,
      name: 'Sara Malik',
      id: 'u-1'
    });
    expect(out.__v).toBeUndefined();
  });

  it('serializeAuthUser: Ruling C8 -- id only, NEVER _id; createdAt only when requested', () => {
    const base = serializeAuthUser(userRow);
    expect(base).toEqual({
      id: 'u-1',
      firstName: 'Sara',
      lastName: 'Malik',
      name: 'Sara Malik',
      email: 'sara@example.com',
      phone: '03001234567',
      role: 'customer',
      authProvider: 'local',
      isEmailVerified: true
    });
    expect(base._id).toBeUndefined();

    const withCreatedAt = serializeAuthUser(userRow, { includeCreatedAt: true });
    expect(withCreatedAt.createdAt).toBe(NOW);
    expect(withCreatedAt._id).toBeUndefined();
  });

  it('serializeProduct: numeric(12,2) price string -> JS number, __v: 0, optional fields omitted when null', () => {
    const out = serializeProduct(productRow);
    expect(out.price).toBe(8500);
    expect(typeof out.price).toBe('number');
    expect(out.__v).toBe(0);
    expect(out._id).toBe('p-1');
    expect(out.id).toBe('p-1');
    // No Mongoose default -> omitted when null, not present as null.
    expect('originalPrice' in out).toBe(false);
    expect('badge' in out).toBe(false);
    expect('hoverImage' in out).toBe(false);
    expect('work' in out).toBe(false);
    expect('breakdown' in out).toBe(false);
    expect('modelInfo' in out).toBe(false);
  });

  it('serializeProduct: optional fields present when set', () => {
    const out = serializeProduct({
      ...productRow,
      original_price: '9500.00',
      badge: 'New',
      hover_image: 'https://example.test/2.png',
      work: 'Hand Embroidery',
      breakdown: { shirt: '1.2m' },
      model_info: 'Height 5\'7"'
    });
    expect(out.originalPrice).toBe(9500);
    expect(out.badge).toBe('New');
    expect(out.hoverImage).toBe('https://example.test/2.png');
    expect(out.work).toBe('Hand Embroidery');
    expect(out.breakdown).toEqual({ shirt: '1.2m' });
    expect(out.modelInfo).toBe('Height 5\'7"');
  });

  it('serializeOrder: keeps items/shippingAddress as-is, converts numeric strings, optional payment key', () => {
    const withoutPayment = serializeOrder(orderRow);
    expect(withoutPayment.items).toBe(orderRow.items);
    expect(withoutPayment.shippingAddress).toBe(orderRow.shipping_address);
    expect(withoutPayment.subtotal).toBe(8500);
    expect(withoutPayment.shippingCost).toBe(250);
    expect(withoutPayment.total).toBe(8750);
    expect('payment' in withoutPayment).toBe(false);

    const withNullPayment = serializeOrder(orderRow, { payment: null });
    expect(withNullPayment.payment).toBeNull();

    const withPayment = serializeOrder(orderRow, { payment: paymentRow });
    expect(withPayment.payment).toEqual(serializePayment(paymentRow));
  });

  it('serializeCart / serializeCartItem: matches formatCartResponse field-for-field, drops items with a deleted product', () => {
    const items = [
      {
        id: 'ci-1',
        product_id: 'p-1',
        quantity: 2,
        selected_size: null,
        selected_color: '',
        product: productRow
      },
      // No fallback product -- must be dropped entirely, and must not
      // affect subtotal/totalCount.
      { id: 'ci-2', product_id: 'p-deleted', quantity: 5, selected_size: 'M', selected_color: '', product: null }
    ];

    const cart = serializeCart({ id: 'cart-1', user_id: 'u-1' }, items);

    expect(cart).toEqual({
      id: 'cart-1',
      user: 'u-1',
      items: [
        {
          id: 'ci-1',
          cartItemId: 'ci-1',
          productId: 'p-1',
          product: {
            _id: 'p-1',
            name: 'ZAHZAN Ivory Silk Kurta',
            price: 8500,
            category: 'Kurtas',
            images: ['https://example.test/1.png'],
            image: 'https://example.test/1.png',
            colors: [{ name: 'Ivory', hex: '#F5F0E6' }],
            sizes: ['S', 'M', 'L'],
            stock: 25,
            id: 'p-1'
          },
          name: 'ZAHZAN Ivory Silk Kurta',
          price: 8500,
          category: 'Kurtas',
          image: 'https://example.test/1.png',
          size: 'M', // selected_size null -> 'M' fallback, on read same as write
          selectedSize: 'M',
          color: '',
          selectedColor: '',
          quantity: 2,
          subtotal: 17000,
          stock: 25
        }
      ],
      subtotal: 17000,
      totalCount: 2
    });
  });

  it('serializeCart: an empty cart', () => {
    expect(serializeCart({ id: 'cart-1', user_id: 'u-1' }, [])).toEqual({
      id: 'cart-1',
      user: 'u-1',
      items: [],
      subtotal: 0,
      totalCount: 0
    });
  });

  it('serializePayment: numeric(12,2) amount string -> JS number, verifiedBy/verifiedAt omitted until set', () => {
    const pending = serializePayment(paymentRow);
    expect(pending.amount).toBe(8750);
    expect('verifiedBy' in pending).toBe(false);
    expect('verifiedAt' in pending).toBe(false);

    const verified = serializePayment({ ...paymentRow, status: 'Verified', verified_by: 'u-admin-1', verified_at: NOW });
    expect(verified.verifiedBy).toBe('u-admin-1');
    expect(verified.verifiedAt).toBe(NOW);
  });

  it('serializeAddress: adds id alongside _id (GC2), even though the raw Mongoose shape today has _id only', () => {
    const out = serializeAddress(addressRow);
    expect(out._id).toBe('addr-1');
    expect(out.id).toBe('addr-1');
    expect(out.__v).toBe(0);
    expect(out.userId).toBe('u-1');
  });

  it('serializeNewsletterSubscriber: unsubscribedAt is null (not omitted) when unset; userId omitted when unset', () => {
    const out = serializeNewsletterSubscriber(subscriberRow);
    expect(out.unsubscribedAt).toBeNull();
    expect('unsubscribedAt' in out).toBe(true);
    expect('userId' in out).toBe(false);
    expect(out.__v).toBeUndefined();
  });

  it('serializeNewsletterSubscriber: userId as a bare id, or as a populated summary when `user` is passed', () => {
    const withBareId = serializeNewsletterSubscriber({ ...subscriberRow, user_id: 'u-1' });
    expect(withBareId.userId).toBe('u-1');

    const withPopulated = serializeNewsletterSubscriber(
      { ...subscriberRow, user_id: 'u-1' },
      { user: { id: 'u-1', first_name: 'Sara', last_name: 'Malik', email: 'sara@example.com' } }
    );
    expect(withPopulated.userId).toEqual({
      _id: 'u-1',
      firstName: 'Sara',
      lastName: 'Malik',
      email: 'sara@example.com',
      name: 'Sara Malik',
      id: 'u-1'
    });
  });

  it('serializeAuditLog: empty metadata is OMITTED (Mongoose minimize: true), non-empty metadata is kept', () => {
    const empty = serializeAuditLog(auditLogRow);
    expect('metadata' in empty).toBe(false);

    const withMetadata = serializeAuditLog({ ...auditLogRow, metadata: { orderId: 'o-1' } });
    expect(withMetadata.metadata).toEqual({ orderId: 'o-1' });
  });

  it('serializeAuditLog: adminId as a bare id, or as a populated summary when `admin` is passed', () => {
    const bare = serializeAuditLog(auditLogRow);
    expect(bare.adminId).toBe('u-admin-1');

    const populated = serializeAuditLog(auditLogRow, {
      admin: { id: 'u-admin-1', first_name: 'Contract', last_name: 'Admin', email: 'admin@example.com' }
    });
    expect(populated.adminId).toEqual({
      _id: 'u-admin-1',
      firstName: 'Contract',
      lastName: 'Admin',
      email: 'admin@example.com',
      name: 'Contract Admin',
      id: 'u-admin-1'
    });
  });

  it('serializeStory / serializeTryOnJob: _id and id both present (GC2), optional fields omitted when unset', () => {
    const story = serializeStory(storyRow);
    expect(story._id).toBe(story.id);
    expect('rating' in story).toBe(false);
    expect('productId' in story).toBe(false);
    expect('reviewedAt' in story).toBe(false);

    const job = serializeTryOnJob(tryOnJobRow);
    expect(job._id).toBe(job.id);
    expect('productId' in job).toBe(false);
    expect('completedAt' in job).toBe(false);
    expect('expiresAt' in job).toBe(false);
  });
});
