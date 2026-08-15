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

    it('in the default (async) mode, does not block the caller on the wrapped promise', async () => {
      let resolved = false;
      const slow = new Promise((resolve) => {
        setTimeout(() => {
          resolved = true;
          resolve(true);
        }, 20);
      });

      const result = await dispatch(slow);
      expect(result).toBeUndefined();
      expect(resolved).toBe(false); // dispatch returned before the 20ms timer fired
    });
  });
});
