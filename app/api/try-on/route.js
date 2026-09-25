// POST /api/try-on
//
// AI Virtual Try-On, powered by Google Gemini. Ruling P5,
// docs/PARITY_REPORT.md §12. Replaces the Replicate/IDM-VTON implementation.
//
// THE GARMENT IMAGE IS NEVER TAKEN FROM THE REQUEST. The client sends a
// productId; the backend resolves the garment image from the database. An
// earlier version accepted a `garmentImage` URL from the browser and forwarded
// it to the model, which let anyone use this endpoint -- and the site's API
// budget -- to run arbitrary image pairs. Any `garmentImage` in the body is
// now ignored outright rather than validated, because there is no version of
// trusting it that is safe.
//
// Ordering below is deliberate and follows the cost-protection sequence: every
// check that can reject the request for free runs BEFORE the one call that
// costs money.

export const runtime = 'nodejs';
// Gemini image generation takes appreciably longer than a normal request.
// Hosts that honour this (Vercel) will allow the handler to finish rather than
// killing it mid-generation.
export const maxDuration = 120;

import { query } from '../../../lib/db.js';
import { ok, fail } from '../../../lib/http.js';
import { withApiHandler, checkKeyedRateLimit } from '../../../lib/rateLimit.js';
import { requireAuth } from '../../../lib/auth.js';
import { serializeTryOnJob } from '../../../lib/serialize.js';
import { validateCustomerImage } from '../../../lib/imageValidation.js';
import { uploadTryOnImage, signTryOnUrl, deleteTryOnImage } from '../../../lib/storage.js';
import {
  generateTryOnImage,
  fetchImageBytes,
  isGeminiConfigured,
  TryOnError
} from '../../../lib/gemini.js';

const GENERIC_FAILURE = 'Virtual try-on could not be completed. Please try again.';

function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const POST = withApiHandler(async (request) => {
  // --- 1. Authenticated user ------------------------------------------------
  const { user, response } = await requireAuth(request);
  if (response) return response;

  if (!isGeminiConfigured()) {
    // 503, not 500: the service is unconfigured, not broken.
    return fail('Virtual try-on is not available right now. Please try again later.', 503);
  }

  const body = await request.json().catch(() => ({}));
  const { humanImage, productId, color = '' } = body;

  if (!productId) {
    return fail('Please select a product to try on.', 400);
  }

  // --- 2/3. Product exists and is active ------------------------------------
  const { rows: productRows } = await query(
    'select id, name, fabric, colors, color, images, image, ai_reference_image, is_active from products where id = $1',
    [productId]
  );
  const product = productRows[0];
  if (!product) {
    return fail('Product not found.', 404);
  }
  if (!product.is_active) {
    return fail('This product is not currently available for virtual try-on.', 400);
  }

  // --- 4. Selected colour exists --------------------------------------------
  // Only enforced when the caller actually specified one. Matching is
  // case-insensitive because the UI renders whatever casing the admin typed.
  if (color) {
    const available = [
      ...(Array.isArray(product.colors) ? product.colors.map((c) => c?.name).filter(Boolean) : []),
      product.color
    ]
      .filter(Boolean)
      .map((c) => String(c).toLowerCase());
    if (available.length > 0 && !available.includes(String(color).toLowerCase())) {
      return fail('The selected colour is not available for this product.', 400);
    }
  }

  // The garment reference: admin-nominated image if present, else the primary
  // product image. Never anything from the request body.
  const garmentUrl = product.ai_reference_image || product.images?.[0] || product.image || '';
  if (!garmentUrl) {
    return fail('This product has no image available for virtual try-on.', 400);
  }

  // --- 5. Validate the uploaded photograph ----------------------------------
  const validation = validateCustomerImage(humanImage);
  if (!validation.ok) {
    return fail(validation.message, 400);
  }

  // --- 6. Rate limit, per ACCOUNT -------------------------------------------
  const perHour = intFromEnv('TRY_ON_MAX_REQUESTS_PER_HOUR', 10);
  const limited = await checkKeyedRateLimit(`tryon-user:${user.id}`, {
    max: perHour,
    windowSeconds: 3600,
    message: `You have reached the virtual try-on limit of ${perHour} per hour. Please try again later.`
  });
  if (limited.limited) return limited.response;

  // --- 7. Concurrent jobs ---------------------------------------------------
  const maxConcurrent = intFromEnv('TRY_ON_MAX_CONCURRENT_JOBS', 1);
  const { rows: activeRows } = await query(
    "select count(*)::int as n from tryon_jobs where user_id = $1 and status in ('queued','processing')",
    [user.id]
  );
  if (activeRows[0].n >= maxConcurrent) {
    return fail('A virtual try-on is already in progress. Please wait for it to finish.', 429);
  }

  // --- Job row --------------------------------------------------------------
  // Created BEFORE the Gemini call so a crash mid-generation leaves a
  // 'processing' row that retention will clean up, rather than no trace.
  //
  // input_image deliberately stores a marker, not the photograph: the customer
  // uploaded a picture of themselves, and the spec is explicit that customer
  // photos are not persisted. The bytes go to Gemini and are then dropped.
  const retentionHours = intFromEnv('TRY_ON_RETENTION_HOURS', 24);
  const { rows: jobRows } = await query(
    `insert into tryon_jobs (user_id, product_id, color, input_image, status, expires_at)
     values ($1, $2, $3, $4, 'processing', now() + ($5 || ' hours')::interval)
     returning *`,
    [user.id, product.id, color, '[uploaded image, not retained]', String(retentionHours)]
  );
  const job = jobRows[0];

  let storedPath = '';
  try {
    const garment = await fetchImageBytes(garmentUrl);

    const generated = await generateTryOnImage({
      personImage: { buffer: validation.buffer, mime: validation.mime },
      garmentImage: garment,
      garmentDescription: [product.name, product.fabric].filter(Boolean).join(' - ')
    });

    const upload = await uploadTryOnImage(generated.buffer, generated.mime, 'output');
    storedPath = upload.path;

    await query(
      `update tryon_jobs
          set status = 'completed', output_image = $1, output_mime = $2, completed_at = now()
        where id = $3`,
      [storedPath, generated.mime, job.id]
    );
  } catch (err) {
    // The customer sees one message. Internal detail -- Gemini's wording, the
    // model id, stack traces -- stays in the server log.
    const internal = err instanceof TryOnError ? `${err.code}: ${err.message}` : String(err?.message || err);
    console.error('[try-on] generation failed for job', job.id, '--', internal.slice(0, 300));

    if (storedPath) await deleteTryOnImage(storedPath);

    await query("update tryon_jobs set status = 'failed', error = $1, completed_at = now() where id = $2", [
      // Stored for support/debugging, never returned to the browser.
      internal.slice(0, 500),
      job.id
    ]);

    return fail(GENERIC_FAILURE, 502);
  }

  const { rows: freshRows } = await query('select * from tryon_jobs where id = $1', [job.id]);
  const fresh = freshRows[0];
  const imageUrl = await signTryOnUrl(fresh.output_image);

  return ok({
    success: true,
    // Top-level fields are what the existing (frozen) VirtualTryOnModal reads.
    id: fresh.id,
    jobId: fresh.id,
    status: 'succeeded',
    output: imageUrl,
    // The envelope the backend spec asks for, carrying the same values.
    data: { jobId: fresh.id, status: 'completed', imageUrl },
    job: serializeTryOnJob(fresh)
  });
});
