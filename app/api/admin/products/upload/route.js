// POST /api/admin/products/upload
//
// Uploads a product image file to Supabase Storage's public `product-images`
// bucket and returns its public URL, so the admin dashboard can take a file
// from the operator's machine instead of a URL they hosted elsewhere first.
//
// Not part of the original 67-endpoint surface -- this is new. lib/storage.js's
// uploadProductImage() already existed for exactly this purpose but had no
// caller (see its own header comment); this route is that caller.
//
// The returned `url` is what the caller puts into the product's `images`
// array. `product-images` is the PUBLIC bucket, so unlike payment proofs the
// URL is stable and safe to persist -- no re-signing on read.

export const runtime = 'nodejs';

import { ok, fail } from '../../../../../lib/http.js';
import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { parseUpload } from '../../../../../lib/multipart.js';
import { uploadProductImage } from '../../../../../lib/storage.js';
import { recordAuditLog, getClientIp } from '../../../../../lib/auditLogger.js';

export const POST = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  let upload;
  try {
    // 'image' field name, 'image' rule set: jpg/jpeg/png/webp, 5MB cap --
    // the same limits multer enforced, applied by lib/multipart.js.
    upload = await parseUpload(request, 'image', 'image');
  } catch (error) {
    return fail(error.message, 400);
  }

  let stored;
  try {
    stored = await uploadProductImage(upload.buffer, upload.filename, upload.contentType);
  } catch (error) {
    return fail(`Failed to upload product image: ${error.message}`, 500);
  }

  await recordAuditLog({
    adminId: user.id,
    action: 'PRODUCT_IMAGE_UPLOADED',
    entity: 'ProductImage',
    entityId: stored.public_id,
    ipAddress: getClientIp(request),
    metadata: { filename: upload.filename, contentType: upload.contentType, bytes: upload.buffer.length }
  });

  return ok({
    success: true,
    url: stored.secure_url,
    path: stored.public_id
  });
});
