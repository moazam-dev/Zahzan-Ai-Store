// GET /api/admin/products, POST /api/admin/products
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminProducts and createAdminProduct (Task 13, task-13-brief.md).
// Protected + admin-only.
//
// getAdminProducts: default limit 20 (this endpoint's own controller
// default). category: anchored case-insensitive exact match. status:
// 'active' -> is_active = true, 'deactivated'/'inactive' -> is_active =
// false, anything else (including absent/'all') -> no filter at all
// (matches the source's `if (status === 'active') ... if (status ===
// 'deactivated' || status === 'inactive') ...` -- no `else`, so an
// unrecognised status value is silently ignored, same as customers' status
// param). search: unanchored substring match on name/sku/description.
//
// createAdminProduct: SKU is trimmed + uppercased and checked for a
// pre-existing duplicate BEFORE the slug is built (slug incorporates the
// already-uppercased-then-lowercased SKU). A slug collision appends the last
// 4 digits of Date.now() -- reproduced verbatim, including that this can't
// be perfectly deterministic under test (rare collision-of-collision is
// unreachable in the 67-endpoint surface and untested here for that reason).
//
// Shape checked against tools/golden/066-admin.products-list-paged.json,
// 067-admin.products-list-search.json, 068-admin.products-list-status.json,
// 075-admin.product-create.json.
//
// ---------------------------------------------------------------------------
// Product Management Expansion (2026-08-20), createAdminProduct only:
//
//   - Accepts the full product record the Product Page renders --
//     quickDescription, originalPrice, badge, sizeStock, breakdown,
//     modelHeight/modelSize, fitNote, careInstructions, gallery ordering --
//     so nothing product-specific has to be edited in frontend code.
//   - `stock` is no longer required when `sizeStock` is supplied: the total is
//     derived from the per-size counts, and `sizes` is derived from its keys.
//   - Price and stock are validated instead of being passed to Number()
//     unchecked (a negative price or 'abc' used to be stored).
//   - The invented placeholder defaults are REMOVED (see the comment at the
//     imagesArray assignment). This deliberately changes what a create call
//     that omits those fields stores, so golden capture 075 was regenerated.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import { serializeProduct } from '../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../lib/auditLogger.js';
import { trimIfString, trimStringArray, trimColorVariant } from '../../../../lib/trimFields.js';
import {
  normaliseSizeStock,
  sumSizeStock,
  isSizeTracked,
  sizesFromSizeStock,
  validateColors,
  stripBlankColors,
  composeModelInfo,
  toStockInteger
} from '../../../../lib/productFields.js';

export const GET = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get('limit'), 10) || 20);
  const skip = (page - 1) * limit;

  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const status = searchParams.get('status');

  const conditions = [];
  const params = [];

  if (category && category !== 'all') {
    params.push(category);
    conditions.push(`category ilike $${params.length}`);
  }

  if (status && status !== 'all') {
    if (status === 'active') conditions.push('is_active = true');
    if (status === 'deactivated' || status === 'inactive') conditions.push('is_active = false');
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    const idx = params.length;
    conditions.push(`(name ilike $${idx} or sku ilike $${idx} or description ilike $${idx})`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const { rows: countRows } = await query(`select count(*)::int as count from products ${where}`, params);
  const total = countRows[0].count;

  const listParams = [...params, limit, skip];
  const { rows } = await query(
    `select * from products ${where} order by created_at desc limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  return ok({
    success: true,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    products: rows.map(serializeProduct)
  });
});

export const POST = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const {
    name,
    description,
    quickDescription,
    price,
    originalPrice,
    sku,
    category,
    badge,
    stock,
    sizeStock,
    sizes,
    colors,
    color,
    fabric,
    work,
    breakdown,
    modelHeight,
    modelSize,
    modelInfo,
    fitNote,
    careInstructions,
    images,
    image,
    hoverImage
  } = body;

  // Size-tracked products derive `stock` from the per-size counts, so an
  // explicit `stock` is no longer required when sizeStock carries the
  // inventory. Without sizeStock the original requirement stands unchanged.
  const sizeStockResult = normaliseSizeStock(sizeStock);
  if (!sizeStockResult.ok) {
    return fail(sizeStockResult.message, 400);
  }
  const finalSizeStock = sizeStockResult.value;
  const sizeTracked = isSizeTracked(finalSizeStock);

  if (!name || price === undefined || !sku || !category || (stock === undefined && !sizeTracked)) {
    return fail('Name, price, SKU, category, and stock are required fields.', 400);
  }

  // Never trust a submitted price or stock (spec sec21). The old route passed
  // both straight to Number(), so 'abc' became NaN and a negative price was
  // stored as-is; both are now rejected before they can reach the database.
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return fail('Price must be a number of 0 or more.', 400);
  }

  let numericOriginalPrice = null;
  if (originalPrice !== undefined && originalPrice !== null && originalPrice !== '') {
    numericOriginalPrice = Number(originalPrice);
    if (!Number.isFinite(numericOriginalPrice) || numericOriginalPrice < 0) {
      return fail('Compare-at price must be a number of 0 or more.', 400);
    }
  }

  // The total is the sum of the size counts when size-tracked, so the two can
  // never disagree -- see 0004_product_details.sql on why `stock` is kept.
  let finalStock;
  if (sizeTracked) {
    finalStock = sumSizeStock(finalSizeStock);
  } else {
    finalStock = toStockInteger(stock);
    if (finalStock === null) {
      return fail('Stock must be a whole number of 0 or more.', 400);
    }
  }

  const cleanedColors = stripBlankColors(colors);
  const colorsResult = validateColors(cleanedColors);
  if (!colorsResult.ok) {
    return fail(colorsResult.message, 400);
  }

  const formattedSku = sku.trim().toUpperCase();
  const { rows: existingSkuRows } = await query('select id from products where sku = $1', [formattedSku]);
  if (existingSkuRows[0]) {
    return fail(`Product with SKU "${formattedSku}" already exists in database.`, 400);
  }

  // An admin-supplied slug wins over the generated one (it is part of the
  // Basic Information section of the form). A collision on a slug the admin
  // typed is reported rather than silently suffixed -- they chose that URL on
  // purpose and need to know it is taken. The generated path keeps its
  // original silent-suffix behaviour.
  const providedSlug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  let slug;

  if (providedSlug) {
    slug = providedSlug;
    const { rows: slugTakenRows } = await query('select id from products where slug = $1', [slug]);
    if (slugTakenRows[0]) {
      return fail(`Product with slug "${slug}" already exists in database.`, 400);
    }
  } else {
    const baseSlug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    slug = `${baseSlug}-${formattedSku.toLowerCase()}`;

    const { rows: existingSlugRows } = await query('select id from products where slug = $1', [slug]);
    if (existingSlugRows[0]) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }
  }

  // Mongoose's schema-level `trim: true` casts every one of these fields
  // (server/models/Product.js) on assignment, before product.save() -- the
  // source controller never trims them explicitly, relying entirely on that
  // cast. Reproduced here at the same point these values are computed, on
  // exactly the fields the request actually supplied (matches cast-on-
  // assignment semantics); the fallback-vs-provided DECISION below (based on
  // raw truthiness) is unchanged -- only the value that ends up persisted is
  // trimmed.
  // The invented placeholder defaults this route used to apply -- an Unsplash
  // stock photo, 'Pure Silk', 'Hand Embroidery', a colour called 'Ivory',
  // 'Dry clean only' -- are gone. They were fabricated product facts: a
  // product created without a fabric was shown to customers as being made of
  // pure silk. Unset fields are now stored empty and the Product Page renders
  // the label with a blank value until an admin fills it in (spec sec22).
  const imagesArray =
    Array.isArray(images) && images.length > 0
      ? trimStringArray(images).filter((url) => typeof url === 'string' && url !== '')
      : image
        ? [trimIfString(image)]
        : [];

  let formattedColors = [];
  if (Array.isArray(cleanedColors)) {
    formattedColors = cleanedColors.map((c) =>
      typeof c === 'string'
        ? { name: c.trim(), hex: null, image: imagesArray[0] ?? null }
        : trimColorVariant(c)
    );
  } else if (color) {
    formattedColors = [{ name: color.trim(), hex: null, image: imagesArray[0] ?? null }];
  }

  const finalColor = color ? color.trim() : (formattedColors[0] ? formattedColors[0].name : null);
  const finalFabric = fabric ? trimIfString(fabric) : null;
  const finalWork = work ? trimIfString(work) : null;

  // When size-tracked, the size list IS the size-stock's key list -- that is
  // what keeps the selector from offering a size the product has no inventory
  // row for (spec sec30).
  const finalSizes = sizeTracked
    ? sizesFromSizeStock(finalSizeStock)
    : Array.isArray(sizes)
      ? trimStringArray(sizes)
      : [];

  const finalCareInstructions = Array.isArray(careInstructions)
    ? trimStringArray(careInstructions).filter((line) => typeof line === 'string' && line !== '')
    : [];

  const finalHoverImage = hoverImage ? trimIfString(hoverImage) : imagesArray[1] || imagesArray[0] || null;

  // breakdown is the page's SHIRT / TROUSER / DUPATTA trio. Stored as null
  // rather than an object of empty strings when nothing was supplied, so
  // serializeProduct omits the key exactly as it does for a legacy product.
  const finalBreakdown =
    breakdown && typeof breakdown === 'object'
      ? {
          shirt: trimIfString(breakdown.shirt ?? '') || '',
          trouser: trimIfString(breakdown.trouser ?? '') || '',
          dupatta: trimIfString(breakdown.dupatta ?? '') || ''
        }
      : null;

  // model_info stays the single line the page renders. It is composed from the
  // structured inputs when either is supplied, and only falls back to a
  // directly-supplied modelInfo for API clients that still send one.
  const finalModelHeight = modelHeight ? trimIfString(modelHeight) : null;
  const finalModelSize = modelSize ? trimIfString(modelSize) : null;
  const composedModelInfo = composeModelInfo(finalModelHeight, finalModelSize);
  const finalModelInfo =
    composedModelInfo ?? (typeof modelInfo === 'string' && modelInfo.trim() ? modelInfo.trim() : null);

  const finalFitNote = fitNote ? trimIfString(fitNote) : null;
  const finalQuickDescription = quickDescription ? trimIfString(quickDescription) : '';
  const finalBadge = badge ? trimIfString(badge) : null;

  const { rows } = await query(
    `insert into products (
       name, slug, description, quick_description, price, original_price, sku,
       category, badge, stock, size_stock, sizes, colors, color,
       fabric, work, breakdown, model_height, model_size, model_info, fit_note,
       care_instructions, images, image, hover_image, is_active
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16,
       $17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,true
     ) returning *`,
    [
      name.trim(),
      slug,
      description ? description.trim() : '',
      finalQuickDescription,
      numericPrice,
      numericOriginalPrice,
      formattedSku,
      category.trim(),
      finalBadge,
      finalStock,
      JSON.stringify(finalSizeStock),
      finalSizes,
      JSON.stringify(formattedColors),
      finalColor,
      finalFabric,
      finalWork,
      finalBreakdown ? JSON.stringify(finalBreakdown) : null,
      finalModelHeight,
      finalModelSize,
      finalModelInfo,
      finalFitNote,
      finalCareInstructions,
      imagesArray,
      imagesArray[0] ?? null,
      finalHoverImage
    ]
  );
  const product = rows[0];

  await recordAuditLog({
    adminId: user.id,
    action: 'PRODUCT_CREATED',
    entity: 'Product',
    entityId: String(product.id),
    ipAddress: getClientIp(request),
    metadata: { name: product.name, sku: product.sku, price: Number(product.price), stock: product.stock }
  });

  return ok(
    {
      success: true,
      message: 'Product created successfully',
      product: serializeProduct(product)
    },
    201
  );
});
