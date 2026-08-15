import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatch,
  sendAdminNewOrderEmail,
  sendAdminPaymentProofEmail,
  sendCustomerOrderConfirmationEmail,
  sendCustomerOrderStatusEmail,
  sendCustomerPaymentVerifiedEmail,
  sendEmail,
  sendEmailChangeConfirmation,
  sendPasswordResetEmail,
  sendVerificationEmail
} from '../lib/email.js';

const order = {
  orderNumber: 'ZHZ-20260815-0001',
  customerName: 'Sara Malik',
  customerEmail: 'sara@example.com',
  customerPhone: '03001234567',
  items: [{ productName: 'Ivory Silk Kurta', size: 'M', quantity: 1, totalPrice: 8500 }],
  shippingAddress: { addressLine1: '123 Gulberg Boulevard', city: 'Lahore' },
  subtotal: 8500,
  shippingCost: 250,
  total: 8750,
  paymentMethod: 'Cash on Delivery',
  paymentStatus: 'not_required'
};

const payment = {
  paymentMethod: 'JazzCash',
  transactionReference: 'TXN001',
  amount: 8750,
  proofUrl: 'https://example.test/proof.png'
};

// Hoisted so the vi.mock('nodemailer', ...) factory below (itself hoisted
// above these imports/consts by Vitest) can close over it. Used only by
// the "HTML template regression guard" describe block further down --
// routing a send through the Nodemailer branch is the only way to observe
// the real `html` argument a sender produces, since the dev-log branch
// that every other test in this file relies on only ever logs `text`.
const { sendMailMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn().mockResolvedValue({ messageId: 'test-message-id' })
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock }))
  }
}));

describe('lib/email.js (no credentials configured -- degrades to DEV EMAIL SERVICE LOG)', () => {
  let logSpy;

  beforeEach(() => {
    // Matches how Task 2's capture harness disables email: leave these
    // three unset/empty so createTransporter()/getResendClient() both
    // return null and sendEmail() falls into its dev console.log branch.
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_HOST', '');
    vi.stubEnv('EMAIL_USER', '');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  function loggedText() {
    return logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
  }

  it('sendEmail resolves true without throwing', async () => {
    await expect(sendEmail({ to: 'a@b.com', subject: 'Test', html: '<p>x</p>', text: 'x' })).resolves.toBe(true);
  });

  it('every order/payment sender resolves without throwing (the current code degrades silently)', async () => {
    await expect(sendAdminNewOrderEmail(order)).resolves.toBe(true);
    await expect(sendCustomerOrderConfirmationEmail(order)).resolves.toBe(true);
    await expect(sendAdminPaymentProofEmail(order, payment)).resolves.toBe(true);
    await expect(sendCustomerPaymentVerifiedEmail(order, payment)).resolves.toBe(true);
    await expect(sendCustomerOrderStatusEmail(order, 'Confirmed')).resolves.toBe(true);
    await expect(sendPasswordResetEmail('sara@example.com', 'reset-token-abc')).resolves.toBe(true);
  });

  it('sendVerificationEmail and sendEmailChangeConfirmation resolve true (source stubs, never throw)', async () => {
    await expect(sendVerificationEmail('a@b.com', 'token')).resolves.toBe(true);
    await expect(sendEmailChangeConfirmation('new@b.com', 'token')).resolves.toBe(true);
  });

  it('sendAdminNewOrderEmail: dispatched text contains the order number and the formatted total', async () => {
    await sendAdminNewOrderEmail(order);
    const text = loggedText();
    expect(text).toContain('ZHZ-20260815-0001');
    expect(text).toContain('8,750');
  });

  it('sendCustomerOrderConfirmationEmail: dispatched text contains the order number and total', async () => {
    await sendCustomerOrderConfirmationEmail(order);
    const text = loggedText();
    expect(text).toContain('ZHZ-20260815-0001');
    expect(text).toContain('8,750');
  });

  it('sendAdminPaymentProofEmail: dispatched text contains order number and transaction reference', async () => {
    await sendAdminPaymentProofEmail(order, payment);
    const text = loggedText();
    expect(text).toContain('ZHZ-20260815-0001');
    expect(text).toContain('TXN001');
  });

  it('sendCustomerPaymentVerifiedEmail: dispatched text contains the order number', async () => {
    await sendCustomerPaymentVerifiedEmail(order, payment);
    expect(loggedText()).toContain('ZHZ-20260815-0001');
  });

  it('sendCustomerOrderStatusEmail: dispatched text contains the order number and new status', async () => {
    await sendCustomerOrderStatusEmail(order, 'Shipped');
    const text = loggedText();
    expect(text).toContain('ZHZ-20260815-0001');
    expect(text).toContain('Shipped');
  });

  it('sendPasswordResetEmail: dispatched text contains the reset token', async () => {
    await sendPasswordResetEmail('sara@example.com', 'reset-token-abc');
    expect(loggedText()).toContain('reset-token-abc');
  });

  describe('dispatch()', () => {
    it('in sync mode (ZAHZAN_EMAIL_SYNC=1), awaits and returns the real sender result', async () => {
      vi.stubEnv('ZAHZAN_EMAIL_SYNC', '1');
      await expect(dispatch(sendAdminNewOrderEmail(order))).resolves.toBe(true);
    });

    it('genuinely awaits the wrapped promise -- it has settled by the time dispatch() resolves (review Finding 1)', async () => {
      // The old implementation returned `undefined` immediately and only
      // attached a `.catch()`, so a naive test could be fooled by asserting
      // the promise was merely *created/called*. This asserts the actually
      // load-bearing property: a flag flipped *inside* the promise's own
      // executor is observably true right after `await dispatch(p)` returns,
      // which is only possible if dispatch() really waited for it.
      let settled = false;
      const slow = new Promise((resolve) => {
        setTimeout(() => {
          settled = true;
          resolve(true);
        }, 20);
      });

      const result = await dispatch(slow);
      expect(settled).toBe(true); // dispatch() did not return before the 20ms timer fired
      expect(result).toBe(true);
    });

    it('a rejecting promise does not make dispatch() reject -- the error is caught, logged, and swallowed', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const failing = Promise.reject(new Error('SMTP exploded'));

      await expect(dispatch(failing)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('Warning: email dispatch error:', 'SMTP exploded');

      warnSpy.mockRestore();
    });
  });

  describe('HTML template regression guard (review Finding 2: templates had no content protection)', () => {
    // Route through the Nodemailer branch instead of the dev console.log
    // branch every other test in this file uses -- the dev-log branch only
    // ever logs `text`, never `html`, so it can't see template drift at all.
    // `vi.mock('nodemailer', ...)` above captures the real `html` argument
    // sendMail() receives.
    beforeEach(() => {
      vi.stubEnv('EMAIL_HOST', 'smtp.example.test');
      vi.stubEnv('EMAIL_USER', 'user@example.test');
      sendMailMock.mockClear();
    });

    it('sendCustomerOrderConfirmationEmail: literal bullet/copyright characters, not HTML entities, and stable body text', async () => {
      await sendCustomerOrderConfirmationEmail(order);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const { html } = sendMailMock.mock.calls[0][0];

      // Stable, meaningful substrings from the header/body -- catches
      // reformatting or accidental deletion of a template section.
      expect(html).toContain('ZAHZAN');
      expect(html).toContain('Maison de Haute Couture');
      expect(html).toContain(`Order Confirmation #${order.orderNumber}`);
      expect(html).toContain('Dear <strong>Sara Malik</strong>');
      expect(html).toContain('ZAHZAN CLIENT CONCIERGE');

      // The exact drift that happened once during the port (transcribing
      // `&bull;`/`&copy;` HTML entities in place of the source's literal
      // Unicode characters) and was only caught by a throwaway script that
      // was deleted -- this is the durable, committed replacement.
      expect(html).toContain('•');
      expect(html).toContain('©');
      expect(html).toContain('Lahore, Pakistan • ');
      expect(html).not.toContain('&bull;');
      expect(html).not.toContain('&copy;');

      // Copyright year is `new Date().getFullYear()` and legitimately
      // varies -- assert the surrounding text, not a hardcoded year.
      expect(html).toMatch(/© \d{4} ZAHZAN\. All rights reserved\./);
    });

    it('sendAdminNewOrderEmail: literal bullet/copyright characters, not HTML entities, and stable body text', async () => {
      await sendAdminNewOrderEmail(order);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const { html } = sendMailMock.mock.calls[0][0];

      expect(html).toContain(`New Order Received #${order.orderNumber}`);
      expect(html).toContain('A new customer order has been placed on ZAHZAN Store.');
      expect(html).toContain('Order Articles');

      expect(html).toContain('•');
      expect(html).toContain('©');
      expect(html).toContain('Lahore, Pakistan • ');
      expect(html).not.toContain('&bull;');
      expect(html).not.toContain('&copy;');
      expect(html).toMatch(/© \d{4} ZAHZAN\. All rights reserved\./);
    });
  });
});
