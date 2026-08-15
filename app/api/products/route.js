// GET /api/products, POST /api/products
//
// Statement-by-statement port of server/controllers/productController.js's
// getProducts and createProduct (Task 9, task-9-brief.md). Matches
// server/routes/productRoutes.js's `router.get('/', getProducts)` and
// `router.post('/', protect, requireAdmin, createProduct)`.
//
// Both handlers keep the source's own local try/catch (rather than relying
// solely on lib/http.js's withErrorHandler) because the source wraps every
// failure -- validation AND unexpected errors alike -- into its own
// `Failed to fetch products: ...` / `Failed to create product: ...`
// message prefix and status code (500 / 400 respectively), which
// withErrorHandler's generic fallback does not reproduce.

export const runtime = 'nodejs';

import { query } from '../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../lib/auth.js';
import { serializeProduct } from '../../../lib/serialize.js';
import { trimProductPayload } from '../../../lib/trimFields.js';

export const GET = withErrorHandler(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const conditions = ['is_active = true'];
    const params = [];

    // Anchored case-insensitive exact match -- the source builds
    // `new RegExp(`^${category}$`, 'i')`. Postgres's `~*` is the same POSIX
    // case-insensitive regex operator, so the anchored pattern (and any
    // regex-metacharacter quirks a category value might carry) behaves
    // identically to the source, not "fixed" to be safer.
    if (category && category !== 'All') {
      params.push(`^${category}$`);
      conditions.push(`category ~* $${params.length}`);
    }

    // Three-field $or search, unanchored substring regex match -- same
    // `~*` operator for the same reason.
    if (search) {
      params.push(search);
      const idx = params.length;
      conditions.push(`(name ~* $${idx} or description ~* $${idx} or category ~* $${idx})`);
    }

    const sql = `select * from products where ${conditions.join(' and ')} order by created_at desc`;
    const { rows } = await query(sql, params);

    return ok({
      success: true,
      count: rows.length,
      products: rows.map(serializeProduct)
    });
  } catch (error) {
    return fail(`Failed to fetch products: ${error.message}`, 500);
  }
});

// Mirrors server/models/Product.js's `pre('validate')` hook: only
// auto-generates a slug when none was supplied (after the schema's own
// `lowercase: true, trim: true` cast on a provided slug -- i.e. an
// explicitly-given slug is kept, cast, never overwritten with a name-derived
// one). Confirmed against tools/golden/098-extra2.products-create.json: the
// request supplies `slug: "zahzan-coverage-test-product"` and the response
// slug is that exact value, NOT `<value>-zhz-cov-001` (which is what the
// hook would produce from name+sku alone).
function buildSlug(body) {
  const providedSlug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (providedSlug) return providedSlug;

  const name = typeof body.name === 'string' ? body.name : '';
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const sku = typeof body.sku === 'string' ? body.sku.trim().toLowerCase() : '';
  const skuPart = sku ? `-${sku}` : '';
  return `${baseSlug}${skuPart}`;
}

// Best-effort reproduction of Mongoose's ValidationError.message for
// Product.create(req.body) failing its `required` validators (name, slug,
// sku, price, category -- see server/models/Product.js). NOT confirmed
// against any golden capture -- none of the 104 golden files exercise this
// failure branch for POST /api/products -- so the exact field ordering and
// punctuation Mongoose would produce is not independently verified here.
// Flagged in task-9-report.md.
const REQUIRED_FIELD_MESSAGES = {
  name: 'Product name is required',
  slug: 'Product slug is required',
  sku: 'Product SKU is required',
  price: 'Product price is required',
  category: 'Product category is required'
};

function buildValidationMessage(body, slug) {
  const missing = [];
  if (!body.name) missing.push('name');
  if (!slug) missing.push('slug');
  if (!body.sku) missing.push('sku');
  if (body.price === undefined || body.price === null || body.price === '') missing.push('price');
  if (!body.category) missing.push('category');
  if (missing.length === 0) return null;
  const detail = missing.map((field) => `${field}: ${REQUIRED_FIELD_MESSAGES[field]}`).join(', ');
  return `Product validation failed: ${detail}`;
}

export const POST = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));

  try {
    const slug = buildSlug(body);
    const validationMessage = buildValidationMessage(body, slug);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    // GC7: uppercase sku on every write path (schema-level `uppercase: true`
    // cast in the source).
    const normalizedSku = typeof body.sku === 'string' ? body.sku.trim().toUpperCase() : body.sku;

    // Mongoose's schema-level `trim: true` casts every one of these fields
    // (plus colors[]/breakdown sub-document fields) on assignment, before
    // Product.create() -- see server/models/Product.js and
    // lib/trimFields.js's header comment. Applied only to the VALUES
    // actually persisted below -- the validation above still runs against
    // the raw `body`, unchanged (purely additive, no control-flow change).
    const trimmed = trimProductPayload(body);

    const { rows } = await query(
      `insert into products (
         name, slug, sku, description, quick_description, price, original_price,
         category, badge, images, image, hover_image, colors, color, sizes,
         fabric, work, breakdown, model_info, care_instructions, gallery, stock, is_active
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       ) returning *`,
      [
        trimmed.name,
        slug,
        normalizedSku,
        trimmed.description ?? '',
        trimmed.quickDescription ?? '',
        trimmed.price,
        trimmed.originalPrice ?? null,
        trimmed.category,
        trimmed.badge ?? null,
        trimmed.images ?? [],
        trimmed.image ?? null,
        trimmed.hoverImage ?? null,
        JSON.stringify(trimmed.colors ?? []),
        trimmed.color ?? null,
        trimmed.sizes ?? [],
        trimmed.fabric ?? null,
        trimmed.work ?? null,
        trimmed.breakdown ? JSON.stringify(trimmed.breakdown) : null,
        trimmed.modelInfo ?? null,
        trimmed.careInstructions ?? [],
        trimmed.gallery ?? [],
        trimmed.stock ?? 0,
        trimmed.isActive ?? true
      ]
    );

    return ok({ success: true, product: serializeProduct(rows[0]) }, 201);
  } catch (error) {
    return fail(`Failed to create product: ${error.message}`, 400);
  }
});
