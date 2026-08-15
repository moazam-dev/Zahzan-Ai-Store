// Shared implementation for POST /api/payments and its backward-compatible
// alias POST /api/payments/proof -- both are statement-by-statement ports of
// the SAME controller function, server/controllers/paymentController.js's
// submitPaymentProof (Task 12, task-12-brief.md). The two Express routes
// (server/routes/paymentRoutes.js) already point at the identical
// `submitPaymentProof` handler, differing only in which multipart field name
// each one's inline multer wrapper reads (`proof` vs `proofImage`) -- this
// file is that same one-implementation-two-callers shape, just moved out of
// route.js so both app/api/payments/route.js and
// app/api/payments/proof/route.js can share it (dispatch note: "share ONE
// implementation and differ ONLY in the multipart field name"). Not a
// route.js itself, so the App Router never treats it as a routable segment.
//
// Error handling: submitPaymentProof's source wraps its whole body in a
// try/catch that calls `next(error)` on anything unexpected -- ZERO local
// message-prefixing (confirmed by grepping the controller: 0 prefixed
// catches, 2 `next(error)` calls). So unlike app/api/orders/route.js or
// app/api/cart/route.js (which DO reproduce a local `Failed to X: ...`
// prefix because their sources build one), this function does NOT wrap
// itself in a local catch -- lib/http.js's withErrorHandler (applied by each
// caller route.js) is the faithful reproduction of `next(error)` ->
// errorMiddleware.js's generic `errorHandler`. Adding a local prefix here
// would invent a message string the old API never emitted.
//
// Shape checked against tools/golden/048-payments.submit-proof.json and
// tools/golden/049-payments.submit-proof-alias.json.
//
// proof_url / proof_public_id (MIGRATION_PLAN.md sec7.4, the dispatch's
// signed-URL requirement): `payments.proof_url` stores the storage PATH
// (uploadPaymentProof's `public_id`), never a signed URL -- a signed URL
// baked into the column would 403 once its 1-hour expiry passes. The
// response's `payment.proofUrl` is always a FRESHLY signed URL, generated
// right before responding via lib/storage.js's signProofUrl(). proof_url and
// proof_public_id therefore hold the identical path value on write (mirrors
// lib/storage.js's own doc comment: "public_id is the storage PATH ... this
// is what a caller persists to payments.proof_public_id and later passes
// back into signProofUrl()").

import { query } from '../../../lib/db.js';
import { ok, fail } from '../../../lib/http.js';
import { requireAuth } from '../../../lib/auth.js';
import { serializePayment } from '../../../lib/serialize.js';
import { parseUpload } from '../../../lib/multipart.js';
import { uploadPaymentProof, deletePaymentProof, signProofUrl } from '../../../lib/storage.js';
import { sendAdminPaymentProofEmail, dispatch } from '../../../lib/email.js';

/**
 * @param {Request} request
 * @param {'proof'|'proofImage'} fieldName the multipart field the caller's
 *        route expects the file under -- `proof` for POST /api/payments,
 *        `proofImage` for the POST /api/payments/proof alias
 *        (MIGRATION_PLAN.md sec7.7).
 */
export async function submitPaymentProof(request, fieldName) {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  // Mirrors paymentRoutes.js's inline multer wrapper: a field-missing /
  // format / size rejection returns 400 with the multer-equivalent message
  // directly (same precedent as app/api/orders/route.js's POST).
  let uploadedFile;
  try {
    uploadedFile = await parseUpload(request, fieldName, 'proof');
  } catch (uploadErr) {
    return fail(uploadErr.message, 400);
  }

  const { orderId, paymentMethod, transactionReference } = uploadedFile.fields;

  if (!orderId) {
    return fail('Order ID is required.', 400);
  }

  if (!paymentMethod) {
    return fail('Payment method selection is required.', 400);
  }

  if (!transactionReference || !transactionReference.trim()) {
    return fail('Transaction reference ID is required.', 400);
  }

  // 1. Retrieve Order from Database & Verify Ownership.
  const { rows: orderRows } = await query('select * from orders where id = $1', [orderId]);
  const order = orderRows[0];

  if (!order) {
    return fail('Order not found.', 404);
  }

  if (order.user_id !== user.id) {
    return fail('You are not authorized to submit payment for this order.', 403);
  }

  // 2. Verify Order Eligibility.
  if (order.order_status === 'Cancelled') {
    return fail('Cannot submit payment for a cancelled order.', 400);
  }

  if (order.payment_status === 'verified') {
    return fail('Payment for this order has already been verified.', 400);
  }

  // 3. Duplicate Transaction Reference Protection -- case-insensitive match
  // against a Pending or Verified payment on a DIFFERENT order; the stored
  // value is uppercased.
  const trimmedRef = transactionReference.trim().toUpperCase();
  const { rows: existingRefRows } = await query(
    `select * from payments
     where upper(transaction_reference) = $1
       and status in ('Pending', 'Verified')`,
    [trimmedRef]
  );
  const existingRefPayment = existingRefRows[0];

  if (existingRefPayment && existingRefPayment.order_id !== order.id) {
    return fail(
      'This transaction reference ID has already been submitted for another payment. Please check your transaction details.',
      400
    );
  }

  // 4. Authoritative Amount from Database Order -- never the request.
  const amount = order.total;

  // 5. Upload File to Storage.
  const uploadResult = await uploadPaymentProof(
    uploadedFile.buffer,
    uploadedFile.filename,
    uploadedFile.contentType,
    order.order_number
  );
  const proofPath = uploadResult.public_id;

  // 6. Create Payment Record (preserves history if a previous attempt was
  // rejected -- no update-in-place, always a fresh row, matching
  // Payment.create in the source).
  let paymentRow;
  try {
    const { rows } = await query(
      `insert into payments
         (order_id, user_id, payment_method, amount, transaction_reference, proof_url, proof_public_id, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'Pending')
       returning *`,
      [order.id, user.id, paymentMethod.trim(), amount, trimmedRef, proofPath, proofPath]
    );
    paymentRow = rows[0];
  } catch (payErr) {
    if (proofPath) {
      await deletePaymentProof(proofPath);
    }
    throw payErr;
  }

  // Update order payment status.
  await query('update orders set payment_status = $1 where id = $2', ['submitted', order.id]);

  // Sign the proof URL BEFORE building anything that leaves this function --
  // the email and the HTTP response must both carry a working, freshly
  // signed URL, never the raw storage path (lib/storage.js's own doc
  // comment: the payment-proofs bucket is private, so the stored path 403s
  // unless re-signed on every read).
  const signedUrl = await signProofUrl(paymentRow.proof_public_id);
  const responsePayment = { ...serializePayment(paymentRow), proofUrl: signedUrl };

  // Dispatch email notification to admin -- awaited via dispatch() (a
  // failed/rejected send can never fail this request; interface fact).
  await dispatch(
    sendAdminPaymentProofEmail(
      { orderNumber: order.order_number, customerName: order.customer_name, customerEmail: order.customer_email },
      responsePayment
    )
  );

  return ok(
    {
      success: true,
      message: 'Payment proof submitted successfully. Awaiting administrator verification.',
      payment: responsePayment
    },
    201
  );
}
