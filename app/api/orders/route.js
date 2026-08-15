// POST /api/orders, GET /api/orders
//
// Statement-by-statement port of server/controllers/orderController.js's
// createOrder and getMyOrders (Task 11, task-11-brief.md). Both protected --
// matches server/routes/orderRoutes.js's `router.use(protect)` applied to
// the whole router, plus `router.post('/', uploadMiddleware, createOrder)`
// and `router.get('/', getMyOrders)`.
//
// Both handlers keep the source's own local try/catch (rather than relying
// solely on lib/http.js's withErrorHandler), following the precedent
// app/api/products/route.js already set for Task 9: the source wraps every
// unexpected failure into its own `Failed to create order: ...` /
// `Failed to fetch orders: ...` message prefix, which withErrorHandler's
// generic fallback does not reproduce. Validation failures (400/404) are
// still returned directly via `fail(...)`, INSIDE the try block, exactly
// like the source's early `return res.status(...).json(...)` calls -- they
// never reach the catch, so they are never prefixed.
//
// Shape checked against tools/golden/037-orders.create-cod-1.json,
// 038-orders.list.json, 043-orders.create-cod-2.json and
// 047-payments.create-advance-order.json.
//
// createOrder's atomic database work (stock validation, order insert,
// optional payment insert, stock decrement, cart clear) is delegated to
// supabase/migrations/0001_init.sql's create_order() -- see that function's
// header comment for why a single `select create_order(...)` call is
// atomic "for free" (Postgres rolls back every effect of a failed
// statement, including work a called function did internally). That
// function RAISEs the source's exact validation message strings;
// classifyCreateOrderError below maps them back to the right HTTP status,
// exactly reproducing the source's inline `return res.status(404)...` /
// `return res.status(400)...` branches (which never went through the
// source's own catch-all, so they are never "Failed to create order: "
// prefixed either).
//
// Content-type handling: the shipped frontend (components/CheckoutModal.jsx)
// sends a plain JSON body for COD (no file) and multipart/form-data with a
// real `proof` file for advance payment -- confirmed at
// CheckoutModal.jsx:214-270. The source's `req.body.proofUrl` fallback
// branch (no file, a client-supplied URL instead) is reachable only via a
// hand-crafted JSON request with `paymentChoice: 'advance'` and no
// multipart body at all; that path is reproduced below for parity even
// though no golden and no frontend call site exercises it. A hand-crafted
// MULTIPART request that supplies `proofUrl` instead of an actual `proof`
// file (mixing both mechanisms) is NOT reproduced -- lib/multipart.js's
// parseUpload requires the named file field to be present and throws its
// own format-error message otherwise, unlike multer's `.single('proof')`,
// which silently leaves `req.file` undefined when the field is simply
// absent. This is a deliberate, narrow deviation (the finished
// lib/multipart.js interface has no "optional file" mode) affecting only
// this one unreachable-from-the-shipped-frontend combination; flagged in
// task-11-report.md.

export const runtime = 'nodejs';

import { query } from '../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../lib/http.js';
import { requireAuth } from '../../../lib/auth.js';
import { serializeOrder, serializePayment } from '../../../lib/serialize.js';
import { parseUpload } from '../../../lib/multipart.js';
import { uploadPaymentProof, deletePaymentProof, signProofUrl } from '../../../lib/storage.js';
import { sendAdminNewOrderEmail, sendCustomerOrderConfirmationEmail, dispatch } from '../../../lib/email.js';
import { trimIfString } from '../../../lib/trimFields.js';

/**
 * Maps create_order()'s RAISEd message strings back to the HTTP status the
 * source returned inline for the equivalent JS branch. Anything unmatched
 * returns null, so the caller falls through to the generic
 * `Failed to create order: <message>` 500 -- matching the source's own
 * outer catch-all for genuinely unexpected failures.
 */
function classifyCreateOrderError(message) {
  if (/^Product ".*" is not available\.$/.test(message)) return 404;
  if (message.startsWith('Insufficient stock for "')) return 400;
  if (message === 'Your cart is empty. Cannot process order.') return 400;
  return null;
}

export const POST = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  let proofPublicId = '';

  try {
    const contentType = request.headers.get('content-type') || '';
    let rawBody;
    let uploadedFile = null;

    if (contentType.includes('multipart/form-data')) {
      // Mirrors orderRoutes.js's inline multer wrapper: a format/size
      // rejection returns 400 with the multer-equivalent message directly,
      // never "Failed to create order: "-prefixed.
      try {
        uploadedFile = await parseUpload(request, 'proof', 'proof');
      } catch (uploadErr) {
        return fail(uploadErr.message, 400);
      }
      rawBody = uploadedFile.fields;
    } else {
      rawBody = await request.json().catch(() => ({}));
    }

    let { customerInfo, shippingAddress, isBuyNow, buyNowItem, paymentChoice, paymentMethod, transactionReference } =
      rawBody;

    // Safely parse JSON strings if submitted via FormData.
    if (typeof customerInfo === 'string') {
      try {
        customerInfo = JSON.parse(customerInfo);
      } catch (e) {}
    }
    if (typeof shippingAddress === 'string') {
      try {
        shippingAddress = JSON.parse(shippingAddress);
      } catch (e) {}
    }
    if (typeof buyNowItem === 'string') {
      try {
        buyNowItem = JSON.parse(buyNowItem);
      } catch (e) {}
    }

    isBuyNow = isBuyNow === true || isBuyNow === 'true';
    paymentChoice = (paymentChoice || 'cod').toLowerCase();
    const isCOD = paymentChoice === 'cod' || paymentMethod === 'Cash on Delivery';

    // 1. Validate Customer Info.
    const customerName = customerInfo?.fullName || `${user.first_name} ${user.last_name}`.trim();
    const customerEmail = customerInfo?.email || user.email;
    const customerPhone = customerInfo?.phone || user.phone || shippingAddress?.phone;

    if (!customerName || !customerEmail || !customerPhone) {
      return fail('Customer name, email, and phone number are required.', 400);
    }

    // Mongoose's schema-level casts (server/models/Order.js): customerName
    // and customerPhone declare `trim: true`; customerEmail declares
    // `lowercase: true, trim: true` (GC7-equivalent) -- applied on
    // assignment, before Order.create(). The source never trimmed
    // customerInfo explicitly (unlike the shippingAddress snapshot below,
    // which it DOES trim by hand); applied here, AFTER the required-field
    // check above so that check's control flow/message/status is unchanged.
    // `trimmedCustomerEmail` (trim only) also feeds the shippingAddress.email
    // fallback below -- that sub-schema field declares `trim: true` but NOT
    // `lowercase: true`, a distinct cast from Order.customerEmail's, even
    // though both may be populated from this same raw source value.
    const normalizedCustomerName = trimIfString(customerName);
    const normalizedCustomerPhone = trimIfString(customerPhone);
    const trimmedCustomerEmail = trimIfString(customerEmail);
    const normalizedCustomerEmail =
      typeof trimmedCustomerEmail === 'string' ? trimmedCustomerEmail.toLowerCase() : trimmedCustomerEmail;

    // 2. Validate Shipping Address.
    if (
      !shippingAddress ||
      !shippingAddress.fullName ||
      !shippingAddress.phone ||
      !shippingAddress.addressLine1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.postalCode ||
      !shippingAddress.country
    ) {
      return fail(
        'Complete shipping address is required (fullName, phone, addressLine1, city, state, postalCode, country).',
        400
      );
    }

    // Advance Payment Validation & Storage Upload.
    //
    // proof_url / proof_public_id (MIGRATION_PLAN.md sec7.4, mirrors
    // app/api/payments/_submitPaymentProof.js's identical convention):
    // `payments.proof_url` stores the storage PATH (uploadPaymentProof's
    // `public_id`), never a signed URL -- a signed URL baked into the column
    // would 403 once its expiry passes. `uploadResult.secure_url` is a
    // freshly-signed URL valid only at upload time and must NOT be
    // persisted (see lib/storage.js:139-146). The response's
    // `payment.proofUrl` is re-signed fresh from proof_public_id right
    // before responding, below.
    let proofUrl = '';
    let proofFromUpload = false;
    if (!isCOD) {
      if (!paymentMethod || paymentMethod === 'Cash on Delivery') {
        return fail('Please select an advance payment channel (JazzCash, Easypaisa, or Bank Transfer).', 400);
      }
      if (!transactionReference || !transactionReference.trim()) {
        return fail('Transaction reference ID is required for advance payment.', 400);
      }
      if (uploadedFile) {
        const uploadResult = await uploadPaymentProof(
          uploadedFile.buffer,
          uploadedFile.filename,
          uploadedFile.contentType,
          'order'
        );
        proofUrl = uploadResult.public_id;
        proofPublicId = uploadResult.public_id;
        proofFromUpload = true;
      } else if (rawBody.proofUrl) {
        // No upload happened here -- there is no storage path to persist,
        // so this branch keeps whatever the caller supplied verbatim
        // (matches the source; not unified with the upload branch above).
        proofUrl = rawBody.proofUrl;
        proofPublicId = rawBody.proofPublicId || '';
      } else {
        return fail('Payment proof screenshot or receipt file is required for advance payment.', 400);
      }
    }

    // Prepare permanent shipping address snapshot.
    const shippingSnapshot = {
      fullName: shippingAddress.fullName.trim(),
      phone: shippingAddress.phone.trim(),
      email: shippingAddress.email ? shippingAddress.email.trim() : trimmedCustomerEmail,
      addressLine1: shippingAddress.addressLine1.trim(),
      addressLine2: shippingAddress.addressLine2 ? shippingAddress.addressLine2.trim() : '',
      city: shippingAddress.city.trim(),
      state: shippingAddress.state.trim(),
      postalCode: shippingAddress.postalCode.trim(),
      country: shippingAddress.country.trim(),
      deliveryInstructions: shippingAddress.deliveryInstructions ? shippingAddress.deliveryInstructions.trim() : ''
    };

    let itemsToProcess = [];

    // 3. Process Buy Now vs Cart Items.
    if (isBuyNow) {
      if (!buyNowItem || !buyNowItem.productId) {
        return fail('Buy Now product details are missing.', 400);
      }

      const quantity = Math.max(1, Number(buyNowItem.quantity) || 1);
      // OrderItem's `size`/`color` (server/models/OrderItem.js) both declare
      // `trim: true` -- applied by Mongoose on assignment when
      // Order.create() built the embedded item, downstream of this exact
      // `|| 'M'` / `|| ''` fallback (orderController.js:159-160, then
      // re-read as itemReq.selectedSize/selectedColor at :213-214). The
      // fallback here intentionally still runs against the RAW,
      // untrimmed buyNowItem value -- unchanged control flow -- with
      // trimIfString wrapped around the *result*, matching the order the
      // old cast actually happened in (fallback decided pre-cast, trim
      // applied to what gets persisted). create_order()'s own
      // `coalesce(nullif(..., ''), ...)` (supabase/migrations/0001_init.sql)
      // already treats a post-trim empty string as "absent" and re-applies
      // the same 'M' / product.color fallback there, so a whitespace-only
      // submission converges on the identical final stored value regardless
      // of whether trimming happens before or after this fallback -- see
      // fix-implicit-trim-report.md for the full trace.
      itemsToProcess.push({
        productId: buyNowItem.productId,
        quantity,
        selectedSize: trimIfString(buyNowItem.selectedSize || 'M'),
        selectedColor: trimIfString(buyNowItem.selectedColor || '')
      });
    } else {
      // Cart Checkout: fetch the user's cart from the database.
      const { rows: cartRows } = await query('select * from carts where user_id = $1', [user.id]);
      const cart = cartRows[0];
      let cartItems = [];
      if (cart) {
        const { rows } = await query('select * from cart_items where cart_id = $1', [cart.id]);
        cartItems = rows;
      }

      if (!cart || cartItems.length === 0) {
        return fail('Your cart is empty. Cannot process order.', 400);
      }

      itemsToProcess = cartItems.map((item) => ({
        productId: item.product_id,
        quantity: item.quantity,
        selectedSize: item.selected_size || 'M',
        selectedColor: item.selected_color || ''
      }));
    }

    // 7. Determine Order Payment Method and Payment Status.
    const selectedPaymentMethod = isCOD ? 'Cash on Delivery' : paymentMethod.trim();
    const finalPaymentStatus = isCOD ? 'not_required' : 'submitted';
    const normalizedTransactionReference = isCOD ? null : transactionReference.trim().toUpperCase();

    // 4-6, 8-10: atomic stock validation + order insert + optional payment
    // insert + stock decrement + cart clear -- see create_order()'s header
    // comment in supabase/migrations/0001_init.sql.
    let dbResult;
    try {
      const { rows } = await query(
        `select create_order(
           $1::uuid, $2::text, $3::text, $4::text, $5::jsonb, $6::jsonb,
           $7::boolean, $8::text, $9::text, $10::boolean, $11::text, $12::text, $13::text
         ) as result`,
        [
          user.id,
          normalizedCustomerName,
          normalizedCustomerEmail,
          normalizedCustomerPhone,
          JSON.stringify(itemsToProcess),
          JSON.stringify(shippingSnapshot),
          isBuyNow,
          selectedPaymentMethod,
          finalPaymentStatus,
          isCOD,
          normalizedTransactionReference,
          isCOD ? null : proofUrl,
          isCOD ? null : proofPublicId || ''
        ]
      );
      dbResult = rows[0].result;
    } catch (dbErr) {
      const status = classifyCreateOrderError(dbErr.message);
      if (status) return fail(dbErr.message, status);

      // Anything past validation (e.g. the payment insert itself) mirrors
      // the source's Payment.create try/catch: roll back the uploaded proof
      // before surfacing the failure.
      if (proofPublicId) {
        await deletePaymentProof(proofPublicId);
      }
      throw dbErr;
    }

    const { rows: orderRows } = await query('select * from orders where id = $1', [dbResult.orderId]);
    const orderRow = orderRows[0];

    let paymentRow = null;
    if (dbResult.paymentId) {
      const { rows: paymentRows } = await query('select * from payments where id = $1', [dbResult.paymentId]);
      paymentRow = paymentRows[0] || null;
    }

    const serializedOrder = serializeOrder(orderRow);

    // The response must still expose a usable, freshly-signed URL for the
    // payment's proof -- never the raw storage path -- when the proof was
    // actually uploaded through lib/storage.js. Mirrors
    // app/api/payments/_submitPaymentProof.js's response-time signing.
    let responsePayment = paymentRow ? serializePayment(paymentRow) : null;
    if (responsePayment && proofFromUpload) {
      responsePayment = { ...responsePayment, proofUrl: await signProofUrl(paymentRow.proof_public_id) };
    }

    // 11. Dispatch email notifications -- awaited via dispatch() (interface
    // fact: a failed/rejected send can never fail this request).
    await dispatch(sendAdminNewOrderEmail(serializedOrder));
    await dispatch(sendCustomerOrderConfirmationEmail(serializedOrder));

    return ok(
      {
        success: true,
        message: isCOD
          ? 'Order placed successfully (Cash on Delivery)'
          : 'Order placed successfully. Payment proof submitted.',
        order: serializedOrder,
        payment: responsePayment
      },
      201
    );
  } catch (error) {
    return fail(`Failed to create order: ${error.message}`, 500);
  }
});

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  try {
    const { rows } = await query('select * from orders where user_id = $1 order by created_at desc', [user.id]);

    return ok({
      success: true,
      count: rows.length,
      orders: rows.map((row) => serializeOrder(row))
    });
  } catch (error) {
    return fail(`Failed to fetch orders: ${error.message}`, 500);
  }
});
