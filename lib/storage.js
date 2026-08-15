// lib/storage.js
//
// Replaces server/utils/cloudinary.js, server/middleware/uploadMiddleware.js's
// disk-storage half, and the local `uploads/` directory. Task 6,
// docs/IMPLEMENTATION_PLAN.md; buckets and the signed-URL requirement from
// MIGRATION_PLAN.md sec7.4.
//
// Two buckets:
//   - `product-images` -- public.
//   - `payment-proofs` -- PRIVATE. The DB column stores the storage PATH,
//     never a URL. Every read re-signs a fresh short-lived URL from that
//     path (see signProofUrl). Storing a signed URL directly in the
//     column would 403 once it expires -- this is the exact caveat
//     MIGRATION_PLAN.md sec7.4 calls out.
//
// Driver selected by ZAHZAN_STORAGE_DRIVER: 'supabase' (default) talks to
// real Supabase Storage; 'memory' is an in-process fake for tests, so
// test/storage.test.js never needs real SUPABASE_* credentials.
//
// Public API shape -- { secure_url, public_id } -- is kept identical to
// cloudinary.js's on purpose, so the call sites in orderController and
// paymentController (ported in later tasks) need near-zero edits: the
// current code does `const { secure_url, public_id } =
// uploadResult` and stores both fields directly on the Payment record.

const PAYMENT_PROOFS_BUCKET = 'payment-proofs';
const PRODUCT_IMAGES_BUCKET = 'product-images';

// Supabase signed URLs need an expiry; short-lived by design (private
// bucket -- see the header comment). One hour is generous for a single
// admin page view without leaving stale long-lived links around.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

function getDriverName() {
  return process.env.ZAHZAN_STORAGE_DRIVER === 'memory' ? 'memory' : 'supabase';
}

// ---------------------------------------------------------------------------
// 'supabase' driver
// ---------------------------------------------------------------------------

let supabaseClientPromise = null;

async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
    })();
  }
  return supabaseClientPromise;
}

function storagePath(prefix, filename) {
  // No Date.now() here on purpose is NOT the goal -- uniqueness is (two
  // uploads with the same original filename must not collide). Unlike the
  // 'memory' driver below (a brand-new test-only fake with no existing
  // behaviour to preserve), this path only has to be unique, not
  // deterministic, so a timestamp plus a random suffix is fine here --
  // mirrors the volatility multer's own filename() functions already had
  // (`proof-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`).
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${prefix}/${unique}-${safeName}`;
}

async function supabaseUpload(bucket, path, buffer, contentType) {
  const client = await getSupabaseClient();
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false
  });
  if (error) {
    throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
  }
  return path;
}

async function supabaseSignedUrl(bucket, path) {
  const client = await getSupabaseClient();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error) {
    throw new Error(`Failed to sign Supabase Storage URL: ${error.message}`);
  }
  return data.signedUrl;
}

async function supabasePublicUrl(bucket, path) {
  const client = await getSupabaseClient();
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function supabaseDelete(bucket, path) {
  const client = await getSupabaseClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Failed to delete from Supabase Storage: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 'memory' driver -- in-process fake for tests
// ---------------------------------------------------------------------------

// Module-scoped, not per-call: mirrors a real bucket's behaviour of
// persisting across multiple calls within a test run so
// deletePaymentProof/signProofUrl can be exercised against something
// uploadPaymentProof actually wrote.
const memoryStore = new Map();
let memoryCounter = 0;

function memoryUpload(prefix, filename, buffer, contentType) {
  memoryCounter += 1;
  // Deterministic on purpose -- unlike the 'supabase' driver's
  // storagePath(), there is no real bucket to collide in, and
  // task-6-brief.md explicitly asks the memory driver for "deterministic
  // URLs" so tests can assert on them directly.
  const path = `${prefix}/${memoryCounter}-${filename}`;
  memoryStore.set(path, { buffer, contentType });
  return path;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {Buffer} buffer
 * @param {string} filename original filename (extension preserved in the
 *        stored path for readability; not used for validation here --
 *        lib/multipart.js already validated extension/MIME/size before
 *        handing off a buffer)
 * @param {string} contentType
 * @param {string} [orderRef] mirrors cloudinary.js's `orderId = 'general'`
 *        parameter (folder/prefix hint); unused by the memory driver.
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 *        `public_id` is the storage PATH (not a Cloudinary-style opaque
 *        id) -- this is what a caller persists to `payments.proof_public_id`
 *        and later passes back into signProofUrl(). `secure_url` is a
 *        freshly-signed URL, valid at the moment of upload -- callers must
 *        NOT persist it long-term (see the header comment).
 */
export async function uploadPaymentProof(buffer, filename, contentType, orderRef = 'general') {
  if (getDriverName() === 'memory') {
    const publicId = memoryUpload(`payment_${orderRef}`, filename, buffer, contentType);
    return { secure_url: `memory://payment-proofs/${publicId}`, public_id: publicId };
  }

  const path = storagePath(`payment_${orderRef}`, filename);
  const publicId = await supabaseUpload(PAYMENT_PROOFS_BUCKET, path, buffer, contentType);
  const secureUrl = await supabaseSignedUrl(PAYMENT_PROOFS_BUCKET, publicId);
  return { secure_url: secureUrl, public_id: publicId };
}

/**
 * `product-images` is the PUBLIC bucket -- no signing needed, `secure_url`
 * is a stable public URL.
 *
 * Unlike uploadPaymentProof, no live endpoint in the current 67 currently
 * uploads a product image as a file (admin product create/update accept
 * `images` as a plain array of URL strings in the request body, and the
 * only two multipart uploads that use the OLD general-storage multer
 * instance -- stories' `image`, try-on's `inputImage` -- sit behind
 * permanent 501 stubs that never read the uploaded file). This function's
 * shape is therefore inferred for forward use, not verified against real
 * behaviour -- flagged in the Task 6 report.
 *
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} contentType
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
export async function uploadProductImage(buffer, filename, contentType) {
  if (getDriverName() === 'memory') {
    const publicId = memoryUpload('product', filename, buffer, contentType);
    return { secure_url: `memory://product-images/${publicId}`, public_id: publicId };
  }

  const path = storagePath('product', filename);
  const publicId = await supabaseUpload(PRODUCT_IMAGES_BUCKET, path, buffer, contentType);
  const secureUrl = await supabasePublicUrl(PRODUCT_IMAGES_BUCKET, publicId);
  return { secure_url: secureUrl, public_id: publicId };
}

/**
 * Mirrors deletePaymentProofFromCloudinary exactly, including its no-op on
 * ids starting with `local_` (cloudinary.js's own marker for "this was
 * never actually uploaded to Cloudinary, it's a local-disk fallback path"
 * -- the equivalent marker here, for the same reason, is `memory_`... but
 * the brief is explicit: *"including its no-op on ids starting with
 * local_"*, verbatim, so that literal prefix is preserved rather than
 * swapped for a new-driver-specific one. In practice this driver never
 * produces a `local_`-prefixed id itself; the check exists for parity with
 * the source function's own defensiveness, not because this driver needs
 * it.
 */
export async function deletePaymentProof(publicId) {
  if (!publicId || publicId.startsWith('local_')) return;

  if (getDriverName() === 'memory') {
    memoryStore.delete(publicId);
    return;
  }

  try {
    await supabaseDelete(PAYMENT_PROOFS_BUCKET, publicId);
  } catch (error) {
    // Matches cloudinary.js's deletePaymentProofFromCloudinary: never
    // throws, only warns. A failed cleanup delete must not fail the
    // request that triggered it.
    console.warn('Warning: Failed to delete payment proof from storage:', error.message);
  }
}

/**
 * Per MIGRATION_PLAN.md sec7.4's signed-URL caveat: every admin read of a
 * payment proof calls this fresh, rather than trusting a URL stored at
 * upload time (which may have expired).
 *
 * @param {string} publicId the storage path (payments.proof_public_id)
 * @returns {Promise<string>}
 */
export async function signProofUrl(publicId) {
  if (getDriverName() === 'memory') {
    return `memory://payment-proofs/${publicId}`;
  }
  return supabaseSignedUrl(PAYMENT_PROOFS_BUCKET, publicId);
}

/** Test-only: clears the in-process memory driver's store between tests. */
export function __resetMemoryStore() {
  memoryStore.clear();
  memoryCounter = 0;
}

/** Test-only: inspects what the memory driver has recorded. */
export function __memoryStoreEntries() {
  return Array.from(memoryStore.entries());
}
