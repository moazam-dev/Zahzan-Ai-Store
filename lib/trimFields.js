// lib/trimFields.js
//
// Closes a specific parity gap between the old Express/Mongoose API and this
// port: Mongoose's `trim: true` schema option casts a field's value on
// PROPERTY ASSIGNMENT (`doc.field = value`, or a sub-document push), not
// merely at `.save()` time. So the old API silently stripped leading/
// trailing whitespace from every field a model schema declared `trim: true`
// on -- even in the (common) case where the controller code itself never
// called `.trim()`. The ported route handlers only reproduce the trims the
// CONTROLLERS did explicitly; this module supplies the missing schema-level
// ones, applied at the same write boundary, so a value submitted as
// `"  Ivory  "` is stored as `"Ivory"` here exactly as it was in the old API
// (GC1 byte parity on stored, user-visible data).
//
// This is a NEW file, not one of the finished lib/ interfaces -- it does not
// modify lib/serialize.js or any other existing lib/ module.
//
// Scope: this module only ever TRIMS. It never lowercases/uppercases (those
// casts, where the schema declares them alongside trim -- User.email,
// Order.customerEmail, NewsletterSubscriber.email, EmailChangeToken.newEmail,
// Product.sku -- are either already handled explicitly at every call site
// (GC7 for emails, GC7-equivalent for sku) or handled inline at the one call
// site that was missing it; see fix-implicit-trim-report.md for the full
// per-model audit). Fields the schema does NOT declare `trim: true` on are
// deliberately absent from the lists below and must stay absent -- over-
// trimming is as much a parity break as under-trimming.
//
// Every list below is meant to be diffed directly against the corresponding
// server/models/*.js file's `trim: true` declarations.

/** Trims a string; any non-string (undefined, null, number, boolean, object) passes through unchanged. */
export function trimIfString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims every string element of an array; a non-array value passes through unchanged. */
export function trimStringArray(value) {
  return Array.isArray(value) ? value.map(trimIfString) : value;
}

/**
 * Trims a Product `colorVariantSchema` sub-document ({ name, hex, image },
 * server/models/Product.js) -- all three of its fields declare `trim: true`.
 * Non-object input passes through unchanged.
 */
export function trimColorVariant(color) {
  if (!color || typeof color !== 'object') return color;
  return {
    ...color,
    ...(color.name !== undefined ? { name: trimIfString(color.name) } : {}),
    ...(color.hex !== undefined ? { hex: trimIfString(color.hex) } : {}),
    ...(color.image !== undefined ? { image: trimIfString(color.image) } : {})
  };
}

/** Trims every element of a Product `colors` array via trimColorVariant; non-array input passes through unchanged. */
export function trimColorVariants(colors) {
  return Array.isArray(colors) ? colors.map(trimColorVariant) : colors;
}

// ---------------------------------------------------------------------------
// Schema-derived `trim: true` field lists, per model. Reference/audit table
// -- see fix-implicit-trim-report.md for which of these fields actually
// needed a route-level code change (some write paths already trimmed a
// given field explicitly and are left untouched, not double-handled).

/** server/models/Product.js -- scalar (non-array, non-sub-document) fields. Excludes slug/sku (already cast explicitly at every write path: lowercase+trim / uppercase+trim). */
export const PRODUCT_TRIM_FIELDS = [
  'name',
  'description',
  'quickDescription',
  'category',
  'badge',
  'image',
  'hoverImage',
  'color',
  'fabric',
  'work',
  'modelInfo'
];

/** server/models/Product.js -- array-of-string fields (each element declares `trim: true`). */
export const PRODUCT_TRIM_ARRAY_FIELDS = ['images', 'sizes', 'careInstructions', 'gallery'];

/** server/models/Product.js -- `breakdown` embedded sub-document fields. */
export const PRODUCT_BREAKDOWN_TRIM_FIELDS = ['shirt', 'trouser', 'dupatta'];

/** server/models/Product.js -- `colors[]` sub-document fields (see trimColorVariant). */
export const PRODUCT_COLOR_TRIM_FIELDS = ['name', 'hex', 'image'];

/** server/models/Order.js -- top-level scalar fields. customerEmail is handled separately (lowercase + trim, GC7-equivalent). */
export const ORDER_TRIM_FIELDS = ['customerName', 'customerPhone'];

/** server/models/Order.js -- `shippingAddress` embedded sub-document fields. Already fully trimmed explicitly at its one write path (app/api/orders/route.js); listed here for audit completeness only. */
export const ORDER_SHIPPING_ADDRESS_TRIM_FIELDS = [
  'fullName',
  'phone',
  'email',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'deliveryInstructions'
];

/** server/models/Cart.js -- `items[]` sub-document fields. */
export const CART_ITEM_TRIM_FIELDS = ['selectedSize', 'selectedColor'];

/** server/models/Address.js fields -- already fully trimmed explicitly at every write path; listed for audit completeness only. */
export const ADDRESS_TRIM_FIELDS = [
  'fullName',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
  'country',
  'label'
];

/**
 * Trims the full set of Product write-boundary fields on a request-body-
 * shaped object: PRODUCT_TRIM_FIELDS (scalar), PRODUCT_TRIM_ARRAY_FIELDS
 * (array-of-string), `colors` (via trimColorVariants) and `breakdown` (via
 * PRODUCT_BREAKDOWN_TRIM_FIELDS). Only fields actually PRESENT on the input
 * are touched -- matches Mongoose's cast-on-assignment semantics, where a
 * field the caller never mentioned is never re-cast. Returns a shallow copy;
 * the input object is not mutated.
 */
export function trimProductPayload(body) {
  if (!body || typeof body !== 'object') return body;
  const result = { ...body };

  for (const field of PRODUCT_TRIM_FIELDS) {
    if (result[field] !== undefined) result[field] = trimIfString(result[field]);
  }
  for (const field of PRODUCT_TRIM_ARRAY_FIELDS) {
    if (result[field] !== undefined) result[field] = trimStringArray(result[field]);
  }
  if (result.colors !== undefined) {
    result.colors = trimColorVariants(result.colors);
  }
  if (result.breakdown !== undefined && result.breakdown && typeof result.breakdown === 'object') {
    const breakdown = { ...result.breakdown };
    for (const field of PRODUCT_BREAKDOWN_TRIM_FIELDS) {
      if (breakdown[field] !== undefined) breakdown[field] = trimIfString(breakdown[field]);
    }
    result.breakdown = breakdown;
  }

  return result;
}
