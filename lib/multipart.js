// lib/multipart.js
//
// Replaces multer (server/middleware/uploadMiddleware.js). Next.js Route
// Handlers give you `await request.formData()` directly -- no temp files,
// no `uploads/` directory, no `fs`. Task 6, docs/IMPLEMENTATION_PLAN.md;
// MIGRATION_PLAN.md sec7.7.
//
// Field names this is used with must match exactly (sec7.7): `proof` on
// POST /api/orders and POST /api/payments, `proofImage` on the
// POST /api/payments/proof alias, `image` on stories, `inputImage` on
// try-on. Enforcing the field name itself is the caller's job (it's what
// field name they ask parseUpload for); this file only validates what it's
// handed once a field is found.

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches multer's limits.fileSize exactly

// Copied verbatim from uploadMiddleware.js's checkImageFileTypes /
// checkPaymentProofFileTypes, including their looseness (no `^`/`$`
// anchors -- these are substring tests, e.g. the image MIME regex would
// technically accept a mimetype string that merely CONTAINS "webp"
// anywhere). GC4: preserve existing behaviour, do not tighten it.
const IMAGE_EXT_RE = /jpg|jpeg|png|webp/;
const IMAGE_MIME_RE = /jpg|jpeg|png|webp/;
const IMAGE_ERROR_MESSAGE = 'Only image files (jpg, jpeg, png, webp) are allowed';

const PROOF_EXT_RE = /jpg|jpeg|png|webp|pdf/;
const PROOF_MIME_RE = /image\/(jpeg|jpg|png|webp)|application\/pdf/;
const PROOF_ERROR_MESSAGE = 'Invalid file format. Only JPG, PNG, WEBP images and PDF documents are allowed.';

// multer's own built-in message for a LIMIT_FILE_SIZE MulterError -- not
// something the app customised. Confirmed against the installed package:
// server/node_modules/multer/lib/multer-error.js has
// `LIMIT_FILE_SIZE: 'File too large'`.
const FILE_TOO_LARGE_MESSAGE = 'File too large';

function extname(filename) {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

/**
 * @param {Request} request a standard Request (or NextRequest) whose body
 *        is multipart/form-data.
 * @param {string} fieldName the form field the file is expected under.
 * @param {'image'|'proof'} kind which validation rule set to apply --
 *        'image' matches uploadMiddleware.js's `upload` (general storage,
 *        checkImageFileTypes); 'proof' matches `uploadPaymentProof`
 *        (checkPaymentProofFileTypes).
 * @returns {Promise<{ buffer: Buffer, filename: string, contentType: string, fields: Record<string, string> }>}
 *        `fields` holds every OTHER form field as a plain string map,
 *        since the current controllers read `req.body` alongside
 *        `req.file` (e.g. createOrder reads `customerInfo`,
 *        `shippingAddress`, `paymentMethod`, `transactionReference` from
 *        the same multipart body the proof file arrives in).
 * @throws {Error} with the exact multer-equivalent message when the field
 *        is missing, the extension/MIME check fails, or the file exceeds
 *        5MB.
 */
export async function parseUpload(request, fieldName, kind) {
  const formData = await request.formData();

  const fields = {};
  let file;
  for (const [key, value] of formData.entries()) {
    if (key === fieldName && value instanceof Blob) {
      file = value;
      continue;
    }
    if (typeof value === 'string') {
      fields[key] = value;
    }
  }

  if (!file) {
    throw new Error(kind === 'proof' ? PROOF_ERROR_MESSAGE : IMAGE_ERROR_MESSAGE);
  }

  const filename = 'name' in file && file.name ? file.name : 'upload';
  const contentType = file.type || '';

  const extRe = kind === 'proof' ? PROOF_EXT_RE : IMAGE_EXT_RE;
  const mimeRe = kind === 'proof' ? PROOF_MIME_RE : IMAGE_MIME_RE;
  const errorMessage = kind === 'proof' ? PROOF_ERROR_MESSAGE : IMAGE_ERROR_MESSAGE;

  const extOk = extRe.test(extname(filename));
  const mimeOk = mimeRe.test(contentType);
  if (!extOk || !mimeOk) {
    throw new Error(errorMessage);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(FILE_TOO_LARGE_MESSAGE);
  }

  return { buffer, filename, contentType, fields };
}
