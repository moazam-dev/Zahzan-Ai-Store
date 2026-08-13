import {
  sendEmail,
  sendAdminNewOrderEmail,
  sendCustomerOrderConfirmationEmail,
  sendAdminPaymentProofEmail,
  sendCustomerPaymentVerifiedEmail,
  sendCustomerOrderStatusEmail,
  sendPasswordResetEmail
} from '../services/emailService.js';

export {
  sendEmail,
  sendAdminNewOrderEmail,
  sendCustomerOrderConfirmationEmail,
  sendAdminPaymentProofEmail,
  sendCustomerPaymentVerifiedEmail,
  sendCustomerOrderStatusEmail,
  sendPasswordResetEmail
};

export const sendVerificationEmail = async (email, token, name = 'Valued Client') => {
  // Legacy stub: Verification is no longer mandatory for account access
  console.log(`[Email Service] Verification email skipped for ${email} (Instant Access Enabled).`);
  return true;
};

export const sendEmailChangeConfirmation = async (newEmail, token) => {
  return true;
};
