// lib/email.js
//
// Port of server/services/emailService.js (its seven exported senders,
// HTML templates kept byte-identical) plus the two extra wrapper functions
// server/utils/email.js adds on top. Task 6, docs/IMPLEMENTATION_PLAN.md;
// MIGRATION_PLAN.md sec7.6.
//
// Two adjustments from the source, both directed by sec7.6:
//   1. The current code fires emails without awaiting (a detached
//      `.catch()`), which sec7.6 flags as a real bug on serverless: the
//      function may freeze/exit before the request completes and the
//      customer never gets their confirmation. `dispatch()` below is the
//      seam Tasks 8-13's route handlers use instead of the old
//      fire-and-forget `Promise.all([...]).catch(...)` pattern --
//      `await dispatch(sendX(...))` now genuinely awaits the send (per
//      sec7.6 lines 375-378 -- the binding spec -- not the weaker "fire
//      with a `.catch()`" wording an earlier task brief used), while
//      still guaranteeing a failed/rejected send can never fail the
//      caller's request: any error is caught inside dispatch() itself and
//      logged with the same 'Warning: email dispatch error:' prefix the
//      old fire-and-forget version used, never re-thrown to the caller.
//      `ZAHZAN_EMAIL_SYNC` no longer changes this behaviour -- awaiting is
//      now unconditional -- see the JSDoc on dispatch() below.
//   2. Whatever route handler eventually calls these must run on the
//      Node.js runtime, not Edge (nodemailer and resend both need Node
//      APIs) -- enforced by that handler's own `export const runtime =
//      'nodejs'` (Task 7+), not by this file.

import nodemailer from 'nodemailer';
import { Resend } from 'resend';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && apiKey.trim()) {
    return new Resend(apiKey.trim());
  }
  return null;
}

function createTransporter() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

/**
 * Generic email dispatcher using the Resend API (primary) with a
 * Nodemailer SMTP fallback. Never throws -- degrades to a dev console log
 * when neither is configured, matching the source exactly (this is what
 * lets capture/test runs disable email entirely just by leaving
 * RESEND_API_KEY/EMAIL_HOST/EMAIL_USER unset, the same trick Task 2's
 * capture harness relies on).
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    const resend = getResendClient();

    if (resend) {
      const fromHeader = process.env.EMAIL_FROM || 'ZAHZAN Maison <onboarding@resend.dev>';
      const payload = {
        from: fromHeader,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text
      };

      const result = await resend.emails.send(payload);

      if (result.error) {
        console.warn(`[Resend Warning] API returned error: ${result.error.message}. Attempting Nodemailer fallback...`);
      } else {
        console.log(`[Resend Success] Email delivered to Primary Inbox! ID: ${result.data?.id} | To: ${to}`);
        return true;
      }
    }

    const transporter = createTransporter();

    if (!transporter) {
      console.log('\n=================== [DEV EMAIL SERVICE LOG] ===================');
      console.log(`TO: ${to}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`TEXT: ${text}`);
      console.log('=================================================================\n');
      return true;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"ZAHZAN Maison" <zahzanofficial@gmail.com>',
      replyTo: process.env.EMAIL_USER || 'zahzanofficial@gmail.com',
      to,
      subject,
      text,
      html
    });

    console.log(`[SMTP Sent] Subject: "${subject}" -> To: ${to}`);
    return true;
  } catch (error) {
    console.error(`[Email Failure] Could not send email to ${to}:`, error.message);
    return false;
  }
}

// ----------------------------------------------------------------------
// LUXURY HTML TEMPLATE BUILDER FOR ZAHZAN MAISON -- byte-identical to the
// source (kept the source's own section banner comments too, so a diff
// against server/services/emailService.js stays easy to eyeball).
// ----------------------------------------------------------------------

const renderHeader = (title) => `
  <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Times New Roman', Georgia, serif; color: #1c1b18;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e8e4dc; padding: 40px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-size: 28px; letter-spacing: 0.35em; text-transform: uppercase; margin: 0; color: #1c1b18; font-weight: 300;">ZAHZAN</h1>
        <p style="font-size: 10px; font-family: Arial, sans-serif; letter-spacing: 0.25em; text-transform: uppercase; color: #5a5e4b; margin-top: 6px;">Maison de Haute Couture</p>
        <hr style="border: none; border-top: 1px solid #e8e4dc; margin: 25px 0 10px 0;" />
      </div>
      <h2 style="font-size: 20px; font-weight: 300; color: #1c1b18; margin-bottom: 20px; text-align: center;">${title}</h2>
`;

const renderFooter = () => `
      <hr style="border: none; border-top: 1px solid #e8e4dc; margin: 35px 0 20px 0;" />
      <div style="text-align: center; font-family: Arial, sans-serif; font-size: 11px; color: #706c64; line-height: 1.6;">
        <p style="letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 6px; color: #1c1b18;">ZAHZAN CLIENT CONCIERGE</p>
        <p style="margin: 0;">Lahore, Pakistan • <a href="mailto:support@zahzan.com" style="color: #5a5e4b; text-decoration: none;">support@zahzan.com</a></p>
        <p style="font-size: 10px; color: #a09c94; margin-top: 15px;">© ${new Date().getFullYear()} ZAHZAN. All rights reserved.</p>
      </div>
    </div>
  </div>
`;

const fmt = (num) => (num || 0).toLocaleString();

// ----------------------------------------------------------------------
// 1. NEW ORDER EMAIL — ADMIN NOTIFICATION
// ----------------------------------------------------------------------
export async function sendAdminNewOrderEmail(order) {
  const adminEmail = process.env.ADMIN_EMAIL || 'zahzanofficial@gmail.com';
  const subject = `ZAHZAN — New Order #${order.orderNumber} Received`;

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0eee8; font-size: 13px;">${item.productName} (${item.size || 'M'})</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0eee8; font-size: 13px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0eee8; font-size: 13px; text-align: right;">PKR ${fmt(item.totalPrice)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    ${renderHeader(`New Order Received #${order.orderNumber}`)}
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #1c1b18; line-height: 1.6;">
      <p style="margin-bottom: 20px;">A new customer order has been placed on ZAHZAN Store.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #faf8f5; padding: 15px;">
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Customer:</td>
          <td style="padding: 8px;">${order.customerName} (${order.customerEmail})</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Phone:</td>
          <td style="padding: 8px;">${order.customerPhone}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Payment Choice:</td>
          <td style="padding: 8px; font-weight: bold;">${order.paymentMethod} (${order.paymentStatus})</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Shipping Destination:</td>
          <td style="padding: 8px;">${order.shippingAddress.addressLine1}, ${order.shippingAddress.city}</td>
        </tr>
      </table>

      <h3 style="font-family: 'Times New Roman', serif; font-size: 16px; border-bottom: 1px solid #e8e4dc; padding-bottom: 5px;">Order Articles</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="text-align: left; font-size: 11px; text-transform: uppercase; color: #5a5e4b;">
            <th style="padding-bottom: 8px;">Item</th>
            <th style="padding-bottom: 8px; text-align: center;">Qty</th>
            <th style="padding-bottom: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="text-align: right; font-size: 16px; font-family: 'Times New Roman', serif; margin-top: 15px;">
        <strong>Total Order Payable: PKR ${fmt(order.total)}</strong>
      </div>
    </div>
    ${renderFooter()}
  `;

  const text = `New Order #${order.orderNumber} placed by ${order.customerName} (${order.customerEmail}). Total: PKR ${fmt(order.total)}. Payment Method: ${order.paymentMethod}`;
  return sendEmail({ to: adminEmail, subject, html, text });
}

// ----------------------------------------------------------------------
// 2. CUSTOMER ORDER CONFIRMATION EMAIL
// ----------------------------------------------------------------------
export async function sendCustomerOrderConfirmationEmail(order) {
  const isCOD = order.paymentMethod === 'Cash on Delivery';
  const subject = `ZAHZAN — Your Order #${order.orderNumber} Has Been Placed`;

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0eee8; font-size: 13px;">${item.productName} (${item.size || 'M'})</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0eee8; font-size: 13px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0eee8; font-size: 13px; text-align: right;">PKR ${fmt(item.totalPrice)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    ${renderHeader(`Order Confirmation #${order.orderNumber}`)}
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #1c1b18; line-height: 1.6;">
      <p style="margin-bottom: 20px;">Dear <strong>${order.customerName}</strong>,</p>
      <p style="margin-bottom: 20px;">Thank you for your order with ZAHZAN. We are delighted to confirm that your order record has been successfully registered.</p>
      
      <div style="background-color: #faf8f5; border: 1px solid #e8e4dc; padding: 20px; margin-bottom: 25px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #5a5e4b; letter-spacing: 0.15em;">PAYMENT STATUS</p>
        <p style="margin: 0; font-size: 14px; font-weight: bold; color: #1c1b18;">
          ${isCOD ? 'Cash on Delivery (Payment due upon physical delivery)' : 'Pay in Advance (Payment Proof Submitted — Pending Verification)'}
        </p>
      </div>

      <h3 style="font-family: 'Times New Roman', serif; font-size: 16px; border-bottom: 1px solid #e8e4dc; padding-bottom: 8px;">Order Articles Summary</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="text-align: left; font-size: 11px; text-transform: uppercase; color: #5a5e4b;">
            <th style="padding-bottom: 8px;">Article</th>
            <th style="padding-bottom: 8px; text-align: center;">Qty</th>
            <th style="padding-bottom: 8px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top: 1px solid #e8e4dc; padding-top: 15px; text-align: right; font-size: 16px; font-family: 'Times New Roman', serif;">
        <strong>Total Amount: PKR ${fmt(order.total)}</strong>
      </div>
    </div>
    ${renderFooter()}
  `;

  const text = `Dear ${order.customerName}, your ZAHZAN order #${order.orderNumber} has been received. Total: PKR ${fmt(order.total)}. Payment Method: ${order.paymentMethod}.`;
  return sendEmail({ to: order.customerEmail, subject, html, text });
}

// ----------------------------------------------------------------------
// 3. ADMIN PAYMENT PROOF EMAIL
// ----------------------------------------------------------------------
export async function sendAdminPaymentProofEmail(order, payment) {
  const adminEmail = process.env.ADMIN_EMAIL || 'zahzanofficial@gmail.com';
  const subject = `ZAHZAN — Payment Proof Submitted for Order #${order.orderNumber}`;

  const html = `
    ${renderHeader(`Payment Proof Submitted — #${order.orderNumber}`)}
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #1c1b18; line-height: 1.6;">
      <p style="margin-bottom: 20px;">A customer has uploaded an advance payment screenshot for verification.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #faf8f5; padding: 15px;">
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Order Number:</td>
          <td style="padding: 8px;">#${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Customer Name:</td>
          <td style="padding: 8px;">${order.customerName} (${order.customerEmail})</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Payment Method:</td>
          <td style="padding: 8px;">${payment.paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Transaction Ref / TRX ID:</td>
          <td style="padding: 8px; font-family: monospace; font-weight: bold;">${payment.transactionReference}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Order Total:</td>
          <td style="padding: 8px; font-weight: bold;">PKR ${fmt(payment.amount)}</td>
        </tr>
      </table>

      ${payment.proofUrl ? `
        <div style="text-align: center; margin: 20px 0; border: 1px solid #e8e4dc; padding: 15px;">
          <p style="font-size: 12px; color: #5a5e4b; text-transform: uppercase; margin-bottom: 10px;">Cloudinary Screenshot Preview</p>
          <a href="${payment.proofUrl}" target="_blank" style="display: inline-block; background-color: #1c1b18; color: #ffffff; text-decoration: none; padding: 10px 20px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;">
            Inspect Full Screenshot →
          </a>
        </div>
      ` : ''}

      <p style="font-size: 12px; color: #706c64;">Please review and verify this payment in your Admin Order Management panel.</p>
    </div>
    ${renderFooter()}
  `;

  const text = `Payment Proof Submitted for Order #${order.orderNumber}. Ref: ${payment.transactionReference}, Amount: PKR ${fmt(payment.amount)}.`;
  return sendEmail({ to: adminEmail, subject, html, text });
}

// ----------------------------------------------------------------------
// 4. CUSTOMER PAYMENT VERIFIED EMAIL
// ----------------------------------------------------------------------
export async function sendCustomerPaymentVerifiedEmail(order, payment) {
  const subject = `ZAHZAN — Payment Verified for Order #${order.orderNumber}`;

  const html = `
    ${renderHeader(`Payment Verified — Order #${order.orderNumber}`)}
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #1c1b18; line-height: 1.6;">
      <p style="margin-bottom: 20px;">Dear <strong>${order.customerName}</strong>,</p>
      <p style="margin-bottom: 20px;">We are pleased to inform you that your payment proof for Order <strong>#${order.orderNumber}</strong> has been successfully verified by our concierge team.</p>

      <div style="background-color: #f0f4ec; border: 1px solid #b4c4a4; padding: 20px; margin-bottom: 25px; text-align: center;">
        <p style="margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; color: #5a5e4b; letter-spacing: 0.15em;">PAYMENT STATUS</p>
        <h3 style="margin: 0; font-size: 18px; color: #5a5e4b; font-family: 'Times New Roman', serif;">✓ PAYMENT VERIFIED & CONFIRMED</h3>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #faf8f5; padding: 15px;">
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Payment Method:</td>
          <td style="padding: 8px;">${payment.paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Transaction Ref:</td>
          <td style="padding: 8px; font-family: monospace;">${payment.transactionReference}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #5a5e4b;">Amount Verified:</td>
          <td style="padding: 8px; font-weight: bold;">PKR ${fmt(payment.amount)}</td>
        </tr>
      </table>

      <p>Your order status has now been advanced to <strong>Confirmed</strong> and is being prepared for fulfillment.</p>
    </div>
    ${renderFooter()}
  `;

  const text = `Dear ${order.customerName}, your payment for ZAHZAN Order #${order.orderNumber} has been verified. Status: Confirmed.`;
  return sendEmail({ to: order.customerEmail, subject, html, text });
}

// ----------------------------------------------------------------------
// 5. CUSTOMER ORDER STATUS UPDATE EMAIL
// ----------------------------------------------------------------------
export async function sendCustomerOrderStatusEmail(order, newStatus, trackingInfo = {}) {
  const subject = `ZAHZAN — Your Order #${order.orderNumber} Status: ${newStatus}`;

  let statusMessage = '';
  if (newStatus === 'Confirmed') {
    statusMessage = 'Your order is confirmed and scheduled for tailor workshop preparation.';
  } else if (newStatus === 'Processing') {
    statusMessage = 'Your bespoke order is currently being crafted and quality inspected.';
  } else if (newStatus === 'Shipped') {
    statusMessage = 'Your order has been packaged and dispatched via courier express delivery.';
  } else if (newStatus === 'Delivered') {
    statusMessage = 'Your ZAHZAN delivery has been completed. We hope you cherish your luxury garment.';
  } else if (newStatus === 'Cancelled') {
    statusMessage = 'Your order has been cancelled.';
  }

  const html = `
    ${renderHeader(`Order Status Update — #${order.orderNumber}`)}
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #1c1b18; line-height: 1.6;">
      <p style="margin-bottom: 20px;">Dear <strong>${order.customerName}</strong>,</p>
      <p style="margin-bottom: 20px;">${statusMessage}</p>

      <div style="background-color: #faf8f5; border: 1px solid #e8e4dc; padding: 20px; text-align: center; margin-bottom: 25px;">
        <p style="margin: 0 0 5px 0; font-size: 11px; text-transform: uppercase; color: #5a5e4b; letter-spacing: 0.2em;">CURRENT STATUS</p>
        <h3 style="margin: 0; font-size: 22px; font-weight: 300; font-family: 'Times New Roman', serif; text-transform: uppercase;">${newStatus}</h3>
      </div>

      ${trackingInfo && trackingInfo.trackingNumber ? `
        <div style="background-color: #ffffff; border: 1px dashed #5a5e4b; padding: 15px; margin-bottom: 25px;">
          <p style="margin: 0 0 5px 0; font-size: 11px; text-transform: uppercase; color: #5a5e4b;">COURIER TRACKING INFORMATION</p>
          <p style="margin: 0; font-size: 14px;">Courier: <strong>${trackingInfo.courier || 'Express Courier'}</strong></p>
          <p style="margin: 0; font-size: 14px;">Tracking #: <strong style="font-family: monospace;">${trackingInfo.trackingNumber}</strong></p>
        </div>
      ` : ''}

      <p style="font-size: 12px; color: #706c64;">You can track your order at any time inside your customer account portal.</p>
    </div>
    ${renderFooter()}
  `;

  const text = `Dear ${order.customerName}, your ZAHZAN Order #${order.orderNumber} status is now: ${newStatus}.`;
  return sendEmail({ to: order.customerEmail, subject, html, text });
}

// ----------------------------------------------------------------------
// 6. PASSWORD RESET EMAIL
// ----------------------------------------------------------------------
export async function sendPasswordResetEmail(email, token) {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const resetLink = `${baseUrl}/account?action=reset-password&token=${token}`;
  const subject = 'ZAHZAN — Reset Your Account Password';

  const html = `
    ${renderHeader('Password Reset Request')}
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #1c1b18; line-height: 1.6; text-align: center;">
      <p style="margin-bottom: 20px; color: #706c64;">We received a request to reset the password for your ZAHZAN account. Click below to enter a new password.</p>
      
      <div style="margin: 30px 0;">
        <a href="${resetLink}" style="display: inline-block; background-color: #1c1b18; color: #faf8f5; text-decoration: none; padding: 14px 32px; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase;">
          RESET PASSWORD
        </a>
      </div>

      <p style="font-size: 11px; color: #a09c94; margin-top: 25px;">
        This password reset link will expire in 1 hour.<br />
        If you did not request a password reset, you can safely ignore this message.
      </p>
    </div>
    ${renderFooter()}
  `;

  const text = `Reset your ZAHZAN password by visiting: ${resetLink} (Link expires in 1 hour).`;
  return sendEmail({ to: email, subject, html, text });
}

// ----------------------------------------------------------------------
// 7 & 8. The two extra wrapper functions server/utils/email.js adds on
// top of emailService.js's senders (this file's "Read first" also names
// server/utils/email.js, not just emailService.js).
// ----------------------------------------------------------------------

/**
 * Legacy stub in the source too: `sendVerificationEmail` is exported by
 * server/utils/email.js but never imported/called anywhere in server/
 * (grepped to confirm) -- email verification isn't part of the live flow,
 * registration sets `isEmailVerified: true` immediately. Ported for
 * structural completeness of the module this task's "Read first" names,
 * not because any live endpoint calls it.
 */
export async function sendVerificationEmail(email, token, name = 'Valued Client') {
  console.log(`[Email Service] Verification email skipped for ${email} (Instant Access Enabled).`);
  return true;
}

/**
 * A genuine no-op in the source (`server/utils/email.js`: `export const
 * sendEmailChangeConfirmation = async (newEmail, token) => { return true;
 * };` -- no email is actually sent). Called by a LIVE endpoint though:
 * server/controllers/userController.js's requestEmailChange
 * (POST /api/users/me/email-change-request). Ported as the same no-op,
 * not "fixed" to actually send anything (GC4).
 */
export async function sendEmailChangeConfirmation(newEmail, token) {
  return true;
}

// ----------------------------------------------------------------------
// dispatch() -- see the header comment.
// ----------------------------------------------------------------------

/**
 * MIGRATION_PLAN.md sec7.6 (lines 375-378) is the binding spec: emails must
 * actually be awaited before the serverless function is allowed to end, or
 * the send can be frozen/killed mid-flight and the customer never gets
 * their order confirmation. So `dispatch()` always awaits the wrapped
 * promise -- `await dispatch(sendX(...))` is a real await, not a detached
 * fire-and-forget with a defensive `.catch()` bolted on.
 *
 * Critical constraint: a failed email must never fail the caller's
 * request. That behaviour (order still succeeds even if the email errors)
 * is observable and preserved exactly -- any rejection from the wrapped
 * promise is caught right here, logged with the same
 * 'Warning: email dispatch error:' prefix the old fire-and-forget version
 * used, and swallowed. dispatch() itself never rejects.
 *
 * `ZAHZAN_EMAIL_SYNC=1` no longer changes this function's behaviour --
 * awaiting is unconditional now, so the env var is redundant *for
 * dispatch() specifically*. It is intentionally not read here anymore
 * (rather than kept as dead branching); flagged in task-6-report.md's
 * fix addendum in case a later task still references the variable name
 * elsewhere.
 *
 * @param {Promise<boolean>} promise the result of calling one of the
 *        senders above.
 * @returns {Promise<boolean|undefined>} the sender's real true/false
 *        result once the send settles, or `undefined` if the promise
 *        rejected (the rejection is caught and logged, not propagated).
 */
export async function dispatch(promise) {
  try {
    return await promise;
  } catch (err) {
    console.warn('Warning: email dispatch error:', err?.message);
    return undefined;
  }
}
