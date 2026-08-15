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

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { serializeProduct } from '../../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../../lib/auditLogger.js';

const FIELD_COLUMN = {
  name: 'name',
  description: 'description',
  price: 'price',
  sku: 'sku',
  category: 'category',
  stock: 'stock',
  sizes: 'sizes',
  color: 'color',
  fabric: 'fabric',
  work: 'work',
  careInstructions: 'care_instructions',
  images: 'images',
  image: 'image',
  hoverImage: 'hover_image',
  isActive: 'is_active'
};

export const PUT = withErrorHandler(async (request, context) => {
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
    price: existing.price,
    sku: existing.sku,
    category: existing.category,
    stock: existing.stock,
    sizes: existing.sizes,
    color: existing.color,
    fabric: existing.fabric,
    work: existing.work,
    careInstructions: existing.care_instructions,
    images: existing.images,
    image: existing.image,
    hoverImage: existing.hover_image,
    isActive: existing.is_active,
    colors: existing.colors,
    slug: existing.slug
  };

  for (const field of Object.keys(FIELD_COLUMN)) {
    if (body[field] !== undefined) {
      next[field] = body[field];
    }
  }
  if (next.sku != null) next.sku = String(next.sku).toUpperCase();
  if (next.price != null) next.price = Number(next.price);
  if (next.stock != null) next.stock = Number(next.stock);

  if (body.colors !== undefined && Array.isArray(body.colors)) {
    next.colors = body.colors.map((c) => (typeof c === 'string' ? { name: c, hex: '#FFFFFF' } : c));
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
       name = $1, description = $2, price = $3, sku = $4, category = $5, stock = $6,
       sizes = $7, color = $8, fabric = $9, work = $10, care_instructions = $11,
       images = $12, image = $13, hover_image = $14, is_active = $15,
       colors = $16::jsonb, slug = $17
     where id = $18
     returning *`,
    [
      next.name,
      next.description,
      next.price,
      next.sku,
      next.category,
      next.stock,
      next.sizes,
      next.color,
      next.fabric,
      next.work,
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

export const DELETE = withErrorHandler(async (request, context) => {
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
