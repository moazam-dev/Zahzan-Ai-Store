// GET /api/products/:id
//
// Statement-by-statement port of server/controllers/productController.js's
// getProductById (Task 9, task-9-brief.md). Public -- matches
// server/routes/productRoutes.js's `router.get('/:id', getProductById)`.
//
// Tries a UUID lookup first (mirroring the source's
// `mongoose.Types.ObjectId.isValid(id)` branch -- ids are now real Postgres
// uuids, not 24-hex-char ObjectIds, but the "only attempt the id lookup
// when the string is well-formed" shape is the same), then falls back to
// slug (lowercased) or sku (uppercased). Returns the product under BOTH
// `product` and `data` keys -- confirmed against
// tools/golden/016-products.get-by-id.json,
// tools/golden/017-products.get-by-slug.json and
// tools/golden/018-products.get-by-sku.json, all of which carry the
// identical object twice.
//
// Keeps the source's own local try/catch (see app/api/products/route.js's
// header comment for why) so failures get the `Failed to fetch product:
// ...` message prefix, not withErrorHandler's generic fallback.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { serializeProduct } from '../../../../lib/serialize.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withApiHandler(async (request, context) => {
  try {
    const { id } = await context.params;
    let product = null;

    if (UUID_RE.test(id)) {
      const { rows } = await query('select * from products where id = $1', [id]);
      product = rows[0] || null;
    }

    if (!product) {
      const { rows } = await query('select * from products where slug = $1 or sku = $2 limit 1', [
        id.toLowerCase(),
        id.toUpperCase()
      ]);
      product = rows[0] || null;
    }

    if (!product) {
      return fail('Product not found', 404);
    }

    const serialized = serializeProduct(product);
    return ok({ success: true, product: serialized, data: serialized });
  } catch (error) {
    return fail(`Failed to fetch product: ${error.message}`, 500);
  }
});
