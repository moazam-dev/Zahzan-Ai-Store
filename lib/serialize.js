// lib/serialize.js
//
// The single place database rows become API JSON. This is the keystone of
// GC1 (byte-identical response JSON), GC2 (every serialized entity carries
// `_id`; whether it ALSO carries `id` is per-entity -- see the third
// numbered item below, Ruling C12) and GC3 (snake_case columns -> camelCase
// JSON) -- no route handler is allowed to hand-build a response entity
// itself.
//
// Task 4, docs/IMPLEMENTATION_PLAN.md (no standalone task-4-brief.md
// existed when this was written -- see the Task 4 report for how that gap
// was handled). Cross-checked against MIGRATION_PLAN.md sec7.3 and the
// pre-flight Ruling C8 recorded in progress.md.
//
// -----------------------------------------------------------------------
// Two non-obvious things every function here has to account for, found by
// reading real driver output and real captured golden files rather than
// assuming:
//
// 1. NUMERIC(12,2) COLUMNS COME BACK AS STRINGS, NOT NUMBERS.
//    Verified empirically against both @electric-sql/pglite and node-
//    postgres's documented default behaviour: a `numeric` column comes
//    back as e.g. "100.00" (a JS string), while an `integer` column comes
//    back as a native JS number. Mongoose's `price: Number` always
//    serialized as a JSON number. Every price/amount/subtotal/total field
//    below is explicitly run through toNumber() -- skipping this would
//    silently turn `"price": 8500` into `"price": "8500.00"` on every
//    product response, which is exactly the kind of break this file
//    exists to prevent.
//
// 2. MONGOOSE'S `minimize: true` DEFAULT STRIPS EMPTY-OBJECT FIELDS.
//    Confirmed against tools/golden/082-admin.audit-logs.json: an
//    AuditLog row created with no `metadata` (recordAuditLog's JS default
//    parameter is `{}`) comes back from the OLD API with the `metadata`
//    key missing entirely, not `"metadata": {}`. Postgres's jsonb column
//    has no equivalent behaviour -- it just returns `{}` -- so
//    serializeAuditLog has to replicate the omission explicitly (see
//    isEmptyPlainObject below). Nothing else exercised in the 67 endpoints
//    carries a Mixed/empty-object-eligible field, so this is scoped to
//    that one field.
//
// A third thing, confirmed empirically against the captured goldens (Ruling
// C12, which corrected an earlier misreading of GC2 -- see the Task 4
// report's addendum): whether a serialized entity carries `id` in addition
// to `_id` is PER-ENTITY, decided by each Mongoose model's own toJSON
// config, not a blanket rule. Models with `toJSON: { virtuals: true }` plus
// an id transform -- Product, Order, Payment, User, AuditLog,
// NewsletterSubscriber, Cart -- emit BOTH `_id` and `id`. Models with NO
// toJSON config at all -- Address, AdminUser, Notification,
// StorySubmission, TryOnJob, RefreshToken -- emit `_id` ONLY. Confirmed
// directly: server/models/Address.js, StorySubmission.js and TryOnJob.js
// have zero toJSON customization, and tools/golden/022-users.address-
// create.json / tools/golden/023-users.address-list.json show the address
// object with `_id` and no `id`. So serializeAddress/serializeStory/
// serializeTryOnJob emit `_id` only -- adding `id` would be a GC1
// (byte-identical response JSON) key-for-key parity violation. GC1 wins
// over GC2's older, looser wording whenever they appear to conflict; the
// golden file settles the question. serializeAuthUser (Ruling C8) remains
// the one function that emits `id` with no `_id` at all -- a different,
// separately-documented case.

/** Postgres NUMERIC columns arrive as strings; Mongoose's Number fields
 * serialized as JSON numbers. Converts back, passing through null/undefined
 * as null (never NaN, never throws on a genuinely absent value). */
function toNumber(value) {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

/** timestamptz columns arrive as Date objects (pg) -- confirmed the same is
 * true of PGlite empirically, not just assumed -- but this accepts a string
 * or number too so it works regardless of driver quirks. Matches what
 * JSON.stringify produced for a Mongoose Date: `.toISOString()` (always
 * millisecond precision, always `Z`-suffixed UTC). */
function toIso(value) {
  if (value == null) return null;
  return new Date(value).toISOString();
}

/** Mongoose's `minimize: true` (the default) strips a Mixed/nested-object
 * field from JSON output entirely when it has zero own keys. Arrays are
 * NOT affected by minimize -- an empty array still serializes as `[]`. */
function isEmptyPlainObject(value) {
  return (
    value != null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
  );
}

/**
 * Mirrors the shape a `.populate(field, 'firstName lastName email')` call
 * produces on server/models/User.js: Mongoose always includes `_id`
 * regardless of the select string, and User's schema-level `toJSON({
 * virtuals: true })` means the populated subdocument still carries the
 * `name` virtual and the default `id` virtual too, even though neither was
 * in the select string. Confirmed against
 * tools/golden/082-admin.audit-logs.json's `adminId` (from
 * getAdminAuditLogs's `.populate('adminId', 'firstName lastName email')`);
 * the identical pattern is used by getAdminNewsletterSubscribers's
 * `.populate('userId', 'firstName lastName email')`, which
 * serializeNewsletterSubscriber's optional `user` reuses this for.
 */
export function serializePopulatedUserSummary(row) {
  if (row == null) return null;
  return {
    _id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
    id: row.id
  };
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

/**
 * @param {object|null} row a `users` row
 * @param {object} [opts]
 * @param {string[]} [opts.wishlist] product ids, from a separate
 *        `wishlist_items` query -- `User.wishlist` is a real join table now
 *        (Task 3, spec sec5.2), not a column on `users`, so it can't be read
 *        off `row` directly. Defaults to `[]`, matching a Mongoose array
 *        path's always-present-even-when-empty behaviour (confirmed:
 *        tools/golden/063-admin.customers-list-paged.json shows
 *        `"wishlist": []`, never an omitted key).
 */
export function serializeUser(row, { wishlist = [] } = {}) {
  if (row == null) return null;
  // Never reads row.password at all -- structurally cannot leak it,
  // regardless of what the caller's query happened to select.
  return {
    _id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    authProvider: row.auth_provider,
    googleId: row.google_id,
    facebookId: row.facebook_id,
    phone: row.phone,
    role: row.role,
    isEmailVerified: row.is_email_verified,
    isActive: row.is_active,
    wishlist,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    name: `${row.first_name} ${row.last_name}`.trim(),
    id: row.id
  };
}

/**
 * The narrower, hand-built object server/controllers/authController.js
 * returns from register/login/google/facebook/me -- NOT User's raw
 * toJSON() shape. **Ruling C8 (progress.md, pre-flight): emits `id` only,
 * deliberately no `_id`.** This is the one documented exemption from GC2:
 * the current authController.js literal never had `_id`, and no frontend
 * call site reads `user._id` off an auth response.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeCreatedAt] set for the `GET /api/auth/me`
 *        variant only (confirmed: tools/golden/004-auth.me.json has
 *        `createdAt`, tools/golden/003-auth.login.json does not).
 */
export function serializeAuthUser(row, { includeCreatedAt = false } = {}) {
  if (row == null) return null;
  const out = {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    role: row.role,
    authProvider: row.auth_provider,
    isEmailVerified: row.is_email_verified
  };
  if (includeCreatedAt) out.createdAt = toIso(row.created_at);
  return out;
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

/**
 * @param {object|null} row a `products` row
 */
export function serializeProduct(row) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    description: row.description ?? '',
    quickDescription: row.quick_description ?? '',
    price: toNumber(row.price),
    category: row.category,
    images: row.images ?? [],
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    careInstructions: row.care_instructions ?? [],
    gallery: row.gallery ?? [],
    stock: row.stock,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    // Postgres has no versionKey column at all -- __v is emitted purely for
    // GC1 byte-parity with the current Mongoose output (confirmed present,
    // always 0, in every products/orders/payments/addresses/audit_logs
    // golden capture). See the Task 4 report for the reasoning in full.
    __v: 0,
    id: row.id
  };
  // Fields with no Mongoose default: genuinely absent from the JSON when
  // unset, not present as null. Unlike e.g. `description` (default ''),
  // which is always present.
  if (row.original_price != null) out.originalPrice = toNumber(row.original_price);
  if (row.badge != null) out.badge = row.badge;
  if (row.image != null) out.image = row.image;
  if (row.hover_image != null) out.hoverImage = row.hover_image;
  if (row.color != null) out.color = row.color;
  if (row.fabric != null) out.fabric = row.fabric;
  if (row.work != null) out.work = row.work;
  if (row.breakdown != null) out.breakdown = row.breakdown;
  if (row.model_info != null) out.modelInfo = row.model_info;
  return out;
}

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

/**
 * `items` and `shipping_address` are kept exactly as the jsonb
 * arrays/objects they are (task-4 requirement) -- they were already
 * camelCase when written (Task 11's job, not this file's), so no key
 * conversion is applied to their contents, only pass-through.
 *
 * @param {object} [opts]
 * @param {object|null} [opts.payment] a `payments` row to attach. Only
 *        admin order endpoints attach one (getAllOrders, getAdminOrderById)
 *        -- the customer's own order list never does. Passing this key at
 *        all (even `{ payment: null }`) includes `payment` in the output
 *        (serialized, or `null` if none exists yet); omitting the key
 *        entirely omits `payment` from the output altogether. The nested
 *        `order.payment` behaviour itself is confirmed against
 *        tools/golden/057-admin.orders-list-paged.json and
 *        tools/golden/099-extra2.admin-order-by-id.json, where `order` (an
 *        admin listing/detail row) genuinely has a nested `payment` key.
 *        In the customer-facing create-order response
 *        (tools/golden/037-orders.create-cod-1.json), `"payment": null` is
 *        a TOP-LEVEL sibling of `"order"` in the response envelope, not a
 *        key nested inside the `order` object -- the `order` object there
 *        has no `payment` key at all. Do not double-nest payment when
 *        implementing the customer-facing order routes.
 */
export function serializeOrder(row, opts = {}) {
  if (row == null) return null;
  const out = {
    orderNumber: row.order_number,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    items: row.items,
    shippingAddress: row.shipping_address,
    subtotal: toNumber(row.subtotal),
    shippingCost: toNumber(row.shipping_cost),
    total: toNumber(row.total),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    _id: row.id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    __v: 0,
    id: row.id
  };
  if ('payment' in opts) {
    out.payment = opts.payment ? serializePayment(opts.payment) : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// cart / cart_items
// ---------------------------------------------------------------------------

/**
 * The subset of product fields server/controllers/cartController.js's
 * `.populate('items.product', 'name price category image images stock
 * sizes colors')` selects. NOT the same as serializeProduct's full output
 * -- deliberately narrower, matching the actual populate() select string
 * plus Mongoose's always-included `_id`/`id`.
 */
function serializeCartLineProduct(row) {
  if (row == null) return null;
  return {
    _id: row.id,
    name: row.name,
    price: toNumber(row.price),
    category: row.category,
    images: row.images ?? [],
    image: row.image ?? '',
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    stock: row.stock,
    id: row.id
  };
}

/**
 * @param {object|null} item a `cart_items` row with an attached `product`
 *        (a full `products` row) -- e.g. the result of a
 *        `cart_items JOIN products` query. Reproduces
 *        formatCartResponse's per-item shape exactly, including its
 *        `size`/`selectedSize` `|| 'M'` fallback (present in
 *        formatCartResponse's read path itself, not just at write time)
 *        and the fact that `color`/`selectedColor` are passed through with
 *        no such fallback (matches cartController.js: `color:
 *        item.selectedColor, selectedColor: item.selectedColor`, no `||
 *        ''`).
 */
export function serializeCartItem(item) {
  if (item == null) return null;
  const product = item.product ?? null;
  const price = product ? toNumber(product.price) : 0;
  const image = product ? product.images?.[0] || product.image || '' : '';

  return {
    id: item.id,
    cartItemId: item.id,
    productId: item.product_id,
    product: serializeCartLineProduct(product),
    name: product ? product.name : undefined,
    price,
    category: product ? product.category : undefined,
    image,
    size: item.selected_size || 'M',
    selectedSize: item.selected_size || 'M',
    color: item.selected_color,
    selectedColor: item.selected_color,
    quantity: item.quantity,
    subtotal: price * item.quantity,
    stock: product ? product.stock : undefined
  };
}

/**
 * Reproduces formatCartResponse exactly, including that items whose
 * product no longer exists are dropped BEFORE subtotal/totalCount are
 * computed (`cartDoc.items = cartDoc.items.filter((item) => item.product
 * != null)` in the original).
 *
 * @param {object|null} cart a `carts` row
 * @param {object[]} [items] `cart_items` rows, each with an attached
 *        `product` (see serializeCartItem)
 */
export function serializeCart(cart, items = []) {
  if (cart == null) return null;
  const validItems = (items ?? []).filter((item) => item && item.product != null);
  const serializedItems = validItems.map(serializeCartItem);
  const subtotal = serializedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCount = serializedItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    id: cart.id,
    user: cart.user_id,
    items: serializedItems,
    subtotal,
    totalCount
  };
}

// ---------------------------------------------------------------------------
// payments
// ---------------------------------------------------------------------------

/**
 * @param {object|null} row a `payments` row
 */
export function serializePayment(row) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    paymentMethod: row.payment_method,
    amount: toNumber(row.amount),
    transactionReference: row.transaction_reference,
    proofUrl: row.proof_url,
    proofPublicId: row.proof_public_id ?? '',
    status: row.status,
    rejectionReason: row.rejection_reason ?? '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    __v: 0,
    id: row.id
  };
  // No Mongoose default on either field -- absent until an admin actually
  // verifies/rejects the payment (confirmed:
  // tools/golden/047-payments.create-advance-order.json's fresh payment has
  // neither key; tools/golden/073-admin.payment-verify.json's does, after
  // verifyAdminPayment sets both).
  if (row.verified_by != null) out.verifiedBy = row.verified_by;
  if (row.verified_at != null) out.verifiedAt = toIso(row.verified_at);
  return out;
}

// ---------------------------------------------------------------------------
// addresses
// ---------------------------------------------------------------------------

/**
 * @param {object|null} row an `addresses` row
 */
export function serializeAddress(row) {
  if (row == null) return null;
  return {
    // Ruling C12 (supersedes the header comment's older reasoning): Address
    // has no custom toJSON transform at all, so the raw Mongoose output has
    // `_id` only, never `id` -- confirmed against
    // tools/golden/022-users.address-create.json and
    // tools/golden/023-users.address-list.json. GC1 (byte-identical
    // response JSON) wins over GC2's blanket "_id and id" wording whenever
    // they conflict; the golden file settles it. Do NOT add `id` here.
    _id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2 ?? '',
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country,
    label: row.label,
    isDefault: row.is_default,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    __v: 0
  };
}

// ---------------------------------------------------------------------------
// newsletter_subscribers
// ---------------------------------------------------------------------------

/**
 * Never reads row.unsubscribe_token -- structurally cannot leak it.
 *
 * @param {object} [opts]
 * @param {object|null} [opts.user] a `users` row, from
 *        getAdminNewsletterSubscribers's `.populate('userId', 'firstName
 *        lastName email')`. See serializePopulatedUserSummary.
 */
export function serializeNewsletterSubscriber(row, { user } = {}) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    email: row.email,
    status: row.status,
    source: row.source,
    subscribedAt: toIso(row.subscribed_at),
    // `unsubscribedAt` has an explicit Mongoose `default: null` (unlike
    // e.g. userId below, which has no default at all) -- always present as
    // `null` when unset, never omitted. Confirmed:
    // tools/golden/069-admin.newsletter-list-paged.json's still-subscribed
    // row has `"unsubscribedAt": null`, not an omitted key.
    unsubscribedAt: row.unsubscribed_at == null ? null : toIso(row.unsubscribed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    id: row.id
  };
  if (user) {
    out.userId = serializePopulatedUserSummary(user);
  } else if (row.user_id != null) {
    out.userId = row.user_id;
  }
  return out;
}

// ---------------------------------------------------------------------------
// audit_logs
// ---------------------------------------------------------------------------

/**
 * @param {object} [opts]
 * @param {object|null} [opts.admin] a `users` row, from
 *        getAdminAuditLogs's `.populate('adminId', 'firstName lastName
 *        email')`. See serializePopulatedUserSummary.
 */
export function serializeAuditLog(row, { admin } = {}) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    adminId: admin ? serializePopulatedUserSummary(admin) : row.admin_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id ?? '',
    ipAddress: row.ip_address ?? ''
  };
  // Mongoose `minimize: true` strips a zero-key Mixed field entirely --
  // see the header comment. metadata's column default is '{}'::jsonb, so
  // row.metadata is never actually null/undefined, only possibly `{}`.
  if (!isEmptyPlainObject(row.metadata)) {
    out.metadata = row.metadata ?? {};
  }
  out.createdAt = toIso(row.created_at);
  out.updatedAt = toIso(row.updated_at);
  out.__v = 0;
  out.id = row.id;
  return out;
}

// ---------------------------------------------------------------------------
// story_submissions / tryon_jobs
//
// Neither entity is ever produced by a live endpoint: both
// server/controllers/storyController.js and tryOnController.js are
// unconditional 501 stubs, and GC4 + MIGRATION_PLAN.md sec6.2 item 11
// require they STAY 501 stubs after the port ("Do not implement them").
// So unlike every function above, there is no golden capture to verify
// these two against -- their shape below is inferred from
// server/models/StorySubmission.js / TryOnJob.js directly (neither has a
// custom toJSON transform, the same pattern Address has), not confirmed
// against real output. Flagged in the Task 4 report for reviewer
// attention.
// ---------------------------------------------------------------------------

/**
 * @param {object|null} row a `story_submissions` row
 */
export function serializeStory(row) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    name: row.name,
    username: row.username ?? '',
    image: row.image,
    caption: row.caption ?? '',
    color: row.color ?? '',
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    __v: 0
  };
  if (row.user_id != null) out.userId = row.user_id;
  if (row.rating != null) out.rating = row.rating;
  if (row.product_id != null) out.productId = row.product_id;
  if (row.reviewed_at != null) out.reviewedAt = toIso(row.reviewed_at);
  if (row.reviewed_by != null) out.reviewedBy = row.reviewed_by;
  return out;
}

/**
 * @param {object|null} row a `tryon_jobs` row
 */
export function serializeTryOnJob(row) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    userId: row.user_id,
    color: row.color ?? '',
    inputImage: row.input_image,
    outputImage: row.output_image ?? '',
    status: row.status,
    error: row.error ?? '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    __v: 0
  };
  if (row.product_id != null) out.productId = row.product_id;
  if (row.completed_at != null) out.completedAt = toIso(row.completed_at);
  if (row.expires_at != null) out.expiresAt = toIso(row.expires_at);
  return out;
}

// ---------------------------------------------------------------------------
// admin-only derived serializers (Task 13, task-13-brief.md)
//
// Three genuinely new shapes, none reducible to the general-purpose
// functions above -- each is additive (no existing exported function's
// signature or behaviour changes), following the exact precedent
// serializePopulatedUserSummary already set for AuditLog.adminId /
// NewsletterSubscriber.userId: a Mongoose `.populate(field, '<select
// string>')` produces a narrower, differently-shaped object than the full
// entity, and GC3 ("no route handler may hand-build a response entity")
// means that narrower shape belongs here too, not assembled ad hoc in a
// route handler.
// ---------------------------------------------------------------------------

/**
 * getAdminPayments / getAdminPaymentById's `payment.userId` populated
 * summary -- `.populate('userId', 'firstName lastName email phone')`.
 * Distinct from serializePopulatedUserSummary (which is missing `phone`,
 * matching the DIFFERENT select strings AuditLog.adminId and
 * NewsletterSubscriber.userId use) -- confirmed against
 * tools/golden/060-admin.payments-list-paged.json and
 * tools/golden/100-extra2.admin-payment-by-id.json.
 */
export function serializePaymentUserSummary(row) {
  if (row == null) return null;
  return {
    _id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    name: `${row.first_name} ${row.last_name}`.trim(),
    id: row.id
  };
}

/**
 * adminLogin / getAdminProfile's hand-built `user` literal
 * (server/controllers/adminController.js:71-78, :91-98) -- narrower even
 * than serializeAuthUser (no phone/authProvider/isEmailVerified) and, unlike
 * it, carries no `_id` either. Confirmed against
 * tools/golden/054-admin.login.json and tools/golden/055-admin.me.json:
 * exactly `{ id, firstName, lastName, name, email, role }`, nothing else.
 */
export function serializeAdminAuthUser(row) {
  if (row == null) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    role: row.role
  };
}

/**
 * getAllOrders / getAdminOrderById's admin-list order shape.
 *
 * The source calls `order.toObject()` explicitly in both handlers (rather
 * than letting res.json() serialize the live Mongoose document directly, the
 * way updateOrderStatus/verifyAdminPayment/rejectAdminPayment/
 * getAdminDashboardStats's recentOrders all do). server/models/OrderItem.js
 * sets `virtuals: true` + an id-transform on `toJSON` only, NOT on
 * `toObject` -- so `.toObject()` on the parent, despite the parent's OWN
 * `toObject: { virtuals: true }`, does not cascade an `id` key onto each
 * embedded item (Mongoose subdocuments serialize through their own schema's
 * toObject/toJSON options, not the parent's). Every other admin order
 * response path serializes the live document (or a `.populate()`d one, which
 * always goes through toJSON()), so items DO carry `id` there.
 *
 * create_order() (this same migration file) bakes an `id` key into every
 * item at insert time (matching the toJSON path items normally take), so
 * serializeOrder's plain pass-through of `row.items` always includes it --
 * correct for every OTHER admin order endpoint, but wrong for exactly these
 * two. This function reproduces the `.toObject()` quirk by stripping `id`
 * back out of each item, and only each item -- confirmed against
 * tools/golden/057-admin.orders-list-paged.json /
 * tools/golden/099-extra2.admin-order-by-id.json (items lack `id`) versus
 * tools/golden/072-admin.order-status-update.json (items DO have `id`).
 */
export function serializeOrderForAdminList(row, opts = {}) {
  const out = serializeOrder(row, opts);
  if (out && Array.isArray(out.items)) {
    out.items = out.items.map((item) => {
      if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'id')) {
        const { id: _drop, ...rest } = item;
        return rest;
      }
      return item;
    });
  }
  return out;
}

/**
 * getAdminPayments's `payment.orderId` populated summary --
 * `.populate('orderId', 'orderNumber total orderStatus paymentStatus items
 * shippingAddress')`. Unlike serializeOrderForAdminList above, this order is
 * always reached through a real `.populate()` call, which serializes via the
 * normal toJSON() cascade -- so items DO keep their `id` (no stripping
 * needed here; `row.items` is passed straight through, already carrying it).
 * Confirmed against tools/golden/060-admin.payments-list-paged.json and
 * tools/golden/062-admin.payments-list-status.json.
 *
 * NOT used for getAdminPaymentById's `payment.orderId` -- that handler's
 * source calls `.populate('orderId')` with NO select string (the full
 * document), which is exactly serializeOrder(row)'s own shape; reuse that
 * directly instead of adding a second, redundant "full" variant here.
 */
export function serializeOrderSummaryForPayment(row) {
  if (row == null) return null;
  return {
    _id: row.id,
    orderNumber: row.order_number,
    items: row.items,
    shippingAddress: row.shipping_address,
    total: toNumber(row.total),
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    id: row.id
  };
}

/**
 * getAdminDashboardStats's `stats.customers.recent` entries --
 * `.select('firstName lastName email createdAt phone')`. Narrower than
 * serializeUser (no authProvider/role/isActive/wishlist/etc) and carries
 * `createdAt`, which serializePopulatedUserSummary does not. Confirmed
 * against tools/golden/056-admin.dashboard.json.
 */
export function serializeDashboardRecentCustomer(row) {
  if (row == null) return null;
  return {
    _id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    createdAt: toIso(row.created_at),
    name: `${row.first_name} ${row.last_name}`.trim(),
    id: row.id
  };
}

/**
 * getAdminDashboardStats's `stats.inventory.lowStockProducts` entries --
 * `.select('name sku price stock image images category')`. `image` has no
 * Mongoose default (matches serializeProduct's own handling of the same
 * column): present only when set, never emitted as `null`.
 */
export function serializeDashboardLowStockProduct(row) {
  if (row == null) return null;
  const out = {
    _id: row.id,
    name: row.name,
    sku: row.sku,
    price: toNumber(row.price),
    stock: row.stock,
    images: row.images ?? [],
    category: row.category,
    id: row.id
  };
  if (row.image != null) out.image = row.image;
  return out;
}
