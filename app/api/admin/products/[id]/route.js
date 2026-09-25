// PUT /api/admin/products/:id, DELETE /api/admin/products/:id
//
// Statement-by-statement port of server/controllers/adminController.js's
// updateAdminProduct and deleteAdminProduct (Task 13, task-13-brief.md).
// Protected + admin-only.
//
// updateAdminProduct quirks, reproduced not fixed (GC4):
//   - `sku`, if present in the body, is assigned as-is in the source, but
//     Mongoose's schema-level `uppercase: true` cast (server/models/Product.js)
//     applies on assignment regardless -- GC7 requires the same explicit
//     uppercase here.
//   - `colors`, if present and an array, maps string entries to
//     `{ name, hex: '#FFFFFF' }` -- deliberately NO `image` key, unlike
//     createAdminProduct's equivalent branch.
//   - slug is regenerated from the (possibly just-updated) name/sku whenever
//     EITHER was present in the body.
//   - `image`/`hoverImage` are unconditionally re-derived from `images[0]`/
//     `images[1] || images[0]` whenever the product's (possibly
//     just-updated) `images` array is non-empty -- this runs AFTER the
//     fields loop, so it silently overwrites any `image`/`hoverImage` value
//     the same request body also supplied. Reproduced exactly.
//
// deleteAdminProduct: `?permanent=true` (query string) OR `permanent: true`
// (JSON body) permanently deletes; otherwise soft-deletes (isActive: false).
//
// Shape checked against tools/golden/076-admin.product-update.json,
// 078-admin.product-soft-delete.json, 079-admin.product-permanent-delete.json.
//
// ---------------------------------------------------------------------------
// Product Management Expansion (2026-08-20), updateAdminProduct only:
//
//   - Every field Add Product can set, Edit Product can now change:
//     quickDescription, originalPrice, badge, sizeStock, breakdown,
//     modelHeight/modelSize, fitNote (spec sec14).
//   - Supplying `sizeStock` makes per-size inventory authoritative: `stock`
//     becomes its sum and `sizes` becomes its keys. Supplying `{}` turns size
//     tracking back off.
//   - Price/stock are validated when supplied instead of being passed to
//     Number() unchecked.
//   - The fabricated '#FFFFFF' hex on string colour entries is gone.
//
// deleteAdminProduct is unchanged: soft delete still sets is_active = false,
// preserving order history and every product reference (spec sec20).
// ---------------------------------------------------------------------------

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { serializeProduct } from '../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../lib/auditLogger.js';
import { trimIfString, trimStringArray, trimColorVariant } from '../../../../../lib/trimFields.js';
import {
  normaliseSizeStock,
  sumSizeStock,
  isSizeTracked,
  sizesFromSizeStock,
  validateColors,
  stripBlankColors,
  composeModelInfo,
  toStockInteger
} from '../../../../../lib/productFields.js';

// Scalar/array columns the field loop copies straight across. jsonb columns
// (colors, breakdown, size_stock) are NOT in here -- each needs its own
// normalisation before it can be written, and is handled explicitly below.
const FIELD_COLUMN = {
  name: 'name',
  description: 'description',
  quickDescription: 'quick_description',
  price: 'price',
  originalPrice: 'original_price',
  sku: 'sku',
  category: 'category',
  badge: 'badge',
  stock: 'stock',
  sizes: 'sizes',
  color: 'color',
  fabric: 'fabric',
  work: 'work',
  modelHeight: 'model_height',
  modelSize: 'model_size',
  modelInfo: 'model_info',
  fitNote: 'fit_note',
  careInstructions: 'care_instructions',
  images: 'images',
  image: 'image',
  hoverImage: 'hover_image',
  isActive: 'is_active'
};

export const PUT = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const { rows: existingRows } = await query('select * from products where id = $1', [id]);
  const existing = existingRows[0];

  if (!existing) {
    return fail('Product not found', 404);
  }

  const body = await request.json().catch(() => ({}));
  const prevStock = existing.stock;
  const prevPrice = existing.price;

  // Working copy in JS-object/camelCase form, mirroring the source
  // mutating its Mongoose document field-by-field before a single save().
  const next = {
    name: existing.name,
    description: existing.description,
    quickDescription: existing.quick_description,
    price: existing.price,
    originalPrice: existing.original_price,
    sku: existing.sku,
    category: existing.category,
    badge: existing.badge,
    stock: existing.stock,
    sizes: existing.sizes,
    color: existing.color,
    fabric: existing.fabric,
    work: existing.work,
    modelHeight: existing.model_height,
    modelSize: existing.model_size,
    modelInfo: existing.model_info,
    fitNote: existing.fit_note,
    careInstructions: existing.care_instructions,
    images: existing.images,
    image: existing.image,
    hoverImage: existing.hover_image,
    isActive: existing.is_active,
    colors: existing.colors,
    breakdown: existing.breakdown,
    sizeStock: existing.size_stock,
    slug: existing.slug
  };

  // Mongoose's schema-level `trim: true` (+ `uppercase: true` on sku) casts
  // each of these fields on ASSIGNMENT (server/models/Product.js) -- the
  // source's field loop never trims explicitly, relying entirely on that
  // cast. Reproduced here at the same point: only a field this request
  // actually supplied gets (re-)cast, exactly like Mongoose only re-casts a
  // path that was actually assigned.
  const SCALAR_TRIM_FIELDS = new Set([
    'name',
    'description',
    'quickDescription',
    'category',
    'badge',
    'color',
    'fabric',
    'work',
    'modelHeight',
    'modelSize',
    'modelInfo',
    'fitNote',
    'image',
    'hoverImage'
  ]);
  const ARRAY_TRIM_FIELDS = new Set(['sizes', 'careInstructions', 'images']);

  for (const field of Object.keys(FIELD_COLUMN)) {
    if (body[field] !== undefined) {
      if (SCALAR_TRIM_FIELDS.has(field)) {
        next[field] = trimIfString(body[field]);
      } else if (ARRAY_TRIM_FIELDS.has(field)) {
        next[field] = trimStringArray(body[field]);
      } else {
        next[field] = body[field];
      }
    }
  }
  if (next.sku != null) next.sku = String(next.sku).trim().toUpperCase();
  if (next.price != null) next.price = Number(next.price);

  // Never trust a submitted price or stock (spec sec21). Validated only when
  // the request actually supplied the field -- a PUT that does not mention
  // price must not start failing because the stored value predates this check.
  if (body.price !== undefined && (!Number.isFinite(next.price) || next.price < 0)) {
    return fail('Price must be a number of 0 or more.', 400);
  }

  if (body.originalPrice !== undefined) {
    if (next.originalPrice === null || next.originalPrice === '') {
      next.originalPrice = null;
    } else {
      next.originalPrice = Number(next.originalPrice);
      if (!Number.isFinite(next.originalPrice) || next.originalPrice < 0) {
        return fail('Compare-at price must be a number of 0 or more.', 400);
      }
    }
  }

  if (body.stock !== undefined) {
    const validatedStock = toStockInteger(next.stock);
    if (validatedStock === null) {
      return fail('Stock must be a whole number of 0 or more.', 400);
    }
    next.stock = validatedStock;
  }

  // Per-size inventory. Supplying it makes it authoritative: the product-level
  // total becomes the sum and the size list becomes its keys, so the selector
  // can never offer a size with no inventory row (spec sec7, sec30). Supplying
  // an empty map turns size tracking OFF again, at which point the explicit
  // `stock` in the same request (or the stored one) is the authority.
  if (body.sizeStock !== undefined) {
    const sizeStockResult = normaliseSizeStock(body.sizeStock);
    if (!sizeStockResult.ok) {
      return fail(sizeStockResult.message, 400);
    }
    next.sizeStock = sizeStockResult.value;

    if (isSizeTracked(next.sizeStock)) {
      next.stock = sumSizeStock(next.sizeStock);
      next.sizes = sizesFromSizeStock(next.sizeStock);
    }
  }

  if (body.colors !== undefined && Array.isArray(body.colors)) {
    const cleanedColors = stripBlankColors(body.colors);
    const colorsResult = validateColors(cleanedColors);
    if (!colorsResult.ok) {
      return fail(colorsResult.message, 400);
    }
    // The source's update path deliberately omits the `image` key here, unlike
    // createAdminProduct's equivalent branch -- reproduced, not fixed. Only the
    // fabricated '#FFFFFF' hex is gone: a colour with no hex renders as a named
    // chip on the Product Page rather than as a white swatch that lies about
    // the garment's colour.
    next.colors = cleanedColors.map((c) =>
      typeof c === 'string' ? { name: c.trim(), hex: null } : trimColorVariant(c)
    );
  }

  // The page's SHIRT / TROUSER / DUPATTA trio.
  if (body.breakdown !== undefined) {
    if (body.breakdown === null) {
      next.breakdown = null;
    } else if (typeof body.breakdown === 'object' && !Array.isArray(body.breakdown)) {
      next.breakdown = {
        shirt: trimIfString(body.breakdown.shirt ?? '') || '',
        trouser: trimIfString(body.breakdown.trouser ?? '') || '',
        dupatta: trimIfString(body.breakdown.dupatta ?? '') || ''
      };
    } else {
      return fail('Product details must be an object with shirt, trouser and dupatta values.', 400);
    }
  }

  // model_info stays the single line the Product Page renders. Recomposed
  // whenever either structured part was supplied, so editing the height alone
  // updates the rendered line instead of leaving it stale. A request that
  // supplies neither leaves whatever is stored (including a modelInfo the same
  // request set directly) untouched.
  if (body.modelHeight !== undefined || body.modelSize !== undefined) {
    next.modelInfo = composeModelInfo(next.modelHeight, next.modelSize);
  }

  if (body.name || body.sku) {
    const baseSlug = (next.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    next.slug = `${baseSlug}-${(next.sku || '').toLowerCase()}`;
  }

  if (next.images && next.images.length > 0) {
    next.image = next.images[0];
    next.hoverImage = next.images[1] || next.images[0];
  }

  const { rows: updatedRows } = await query(
    `update products set
       name = $1, description = $2, quick_description = $3, price = $4,
       original_price = $5, sku = $6, category = $7, badge = $8, stock = $9,
       size_stock = $10::jsonb, sizes = $11, color = $12, fabric = $13, work = $14,
       breakdown = $15::jsonb, model_height = $16, model_size = $17,
       model_info = $18, fit_note = $19, care_instructions = $20,
       images = $21, image = $22, hover_image = $23, is_active = $24,
       colors = $25::jsonb, slug = $26
     where id = $27
     returning *`,
    [
      next.name,
      next.description,
      next.quickDescription ?? '',
      next.price,
      next.originalPrice,
      next.sku,
      next.category,
      next.badge,
      next.stock,
      JSON.stringify(next.sizeStock ?? {}),
      next.sizes,
      next.color,
      next.fabric,
      next.work,
      next.breakdown ? JSON.stringify(next.breakdown) : null,
      next.modelHeight,
      next.modelSize,
      next.modelInfo,
      next.fitNote,
      next.careInstructions,
      next.images,
      next.image,
      next.hoverImage,
      next.isActive,
      JSON.stringify(next.colors ?? []),
      next.slug,
      id
    ]
  );
  const product = updatedRows[0];

  const actionName = prevStock !== product.stock ? 'STOCK_UPDATED' : 'PRODUCT_UPDATED';

  await recordAuditLog({
    adminId: user.id,
    action: actionName,
    entity: 'Product',
    entityId: String(product.id),
    ipAddress: getClientIp(request),
    metadata: {
      name: product.name,
      prevPrice: Number(prevPrice),
      newPrice: Number(product.price),
      prevStock,
      newStock: product.stock
    }
  });

  return ok({
    success: true,
    message: 'Product updated successfully',
    product: serializeProduct(product)
  });
});

export const DELETE = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const isPermanent = searchParams.get('permanent') === 'true' || body.permanent === true;

  const { rows: existingRows } = await query('select * from products where id = $1', [id]);
  const product = existingRows[0];

  if (!product) {
    return fail('Product not found', 404);
  }

  if (isPermanent) {
    await query('delete from products where id = $1', [id]);

    await recordAuditLog({
      adminId: user.id,
      action: 'PRODUCT_PERMANENTLY_DELETED',
      entity: 'Product',
      entityId: String(id),
      ipAddress: getClientIp(request),
      metadata: { name: product.name, sku: product.sku }
    });

    return ok({
      success: true,
      message: 'Product permanently deleted from database'
    });
  }

  const { rows: updatedRows } = await query('update products set is_active = false where id = $1 returning *', [
    id
  ]);
  const updatedProduct = updatedRows[0];

  await recordAuditLog({
    adminId: user.id,
    action: 'PRODUCT_DEACTIVATED',
    entity: 'Product',
    entityId: String(updatedProduct.id),
    ipAddress: getClientIp(request),
    metadata: { name: updatedProduct.name, sku: updatedProduct.sku }
  });

  return ok({
    success: true,
    message: 'Product deactivated successfully',
    product: serializeProduct(updatedProduct)
  });
});
