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

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import { serializeProduct } from '../../../../lib/serialize.js';
import { recordAuditLog, getClientIp } from '../../../../lib/auditLogger.js';
import { trimIfString, trimStringArray, trimColorVariant } from '../../../../lib/trimFields.js';

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85';

export const GET = withErrorHandler(async (request) => {
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

export const POST = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const {
    name,
    description,
    price,
    sku,
    category,
    stock,
    sizes,
    colors,
    color,
    fabric,
    work,
    careInstructions,
    images,
    image,
    hoverImage
  } = body;

  if (!name || price === undefined || !sku || !category || stock === undefined) {
    return fail('Name, price, SKU, category, and stock are required fields.', 400);
  }

  const formattedSku = sku.trim().toUpperCase();
  const { rows: existingSkuRows } = await query('select id from products where sku = $1', [formattedSku]);
  if (existingSkuRows[0]) {
    return fail(`Product with SKU "${formattedSku}" already exists in database.`, 400);
  }

  const baseSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  let slug = `${baseSlug}-${formattedSku.toLowerCase()}`;

  const { rows: existingSlugRows } = await query('select id from products where slug = $1', [slug]);
  if (existingSlugRows[0]) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  // Mongoose's schema-level `trim: true` casts every one of these fields
  // (server/models/Product.js) on assignment, before product.save() -- the
  // source controller never trims them explicitly, relying entirely on that
  // cast. Reproduced here at the same point these values are computed, on
  // exactly the fields the request actually supplied (matches cast-on-
  // assignment semantics); the fallback-vs-provided DECISION below (based on
  // raw truthiness) is unchanged -- only the value that ends up persisted is
  // trimmed.
  const imagesArray =
    Array.isArray(images) && images.length > 0
      ? trimStringArray(images)
      : [image ? trimIfString(image) : DEFAULT_IMAGE];

  let formattedColors = [];
  if (Array.isArray(colors)) {
    formattedColors = colors.map((c) =>
      typeof c === 'string' ? { name: c.trim(), hex: '#FFFFFF', image: imagesArray[0] } : trimColorVariant(c)
    );
  } else if (color) {
    formattedColors = [{ name: color.trim(), hex: '#FFFFFF', image: imagesArray[0] }];
  } else {
    formattedColors = [{ name: 'Ivory', hex: '#FFFFFF', image: imagesArray[0] }];
  }

  const finalColor = color ? color.trim() : (formattedColors[0] ? formattedColors[0].name : 'Ivory');
  const finalFabric = fabric ? fabric.trim() : 'Pure Silk';
  const finalWork = work ? work.trim() : 'Hand Embroidery';
  const finalSizes = Array.isArray(sizes) ? trimStringArray(sizes) : ['S', 'M', 'L', 'XL'];
  const finalCareInstructions = Array.isArray(careInstructions)
    ? trimStringArray(careInstructions)
    : ['Dry clean only'];
  const finalHoverImage = hoverImage ? trimIfString(hoverImage) : imagesArray[1] || imagesArray[0];

  const { rows } = await query(
    `insert into products (
       name, slug, description, price, sku, category, stock, sizes, colors, color,
       fabric, work, care_instructions, images, image, hover_image, is_active
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true
     ) returning *`,
    [
      name.trim(),
      slug,
      description ? description.trim() : '',
      Number(price),
      formattedSku,
      category.trim(),
      Number(stock),
      finalSizes,
      JSON.stringify(formattedColors),
      finalColor,
      finalFabric,
      finalWork,
      finalCareInstructions,
      imagesArray,
      imagesArray[0],
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
