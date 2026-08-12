import nodemailer from 'nodemailer';

const createTransporter = () => {
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
};

/**
 * Generic email dispatcher with fallback to console logging
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const transporter = createTransporter();

  if (!transporter) {
    console.log('\n=================== [DEV EMAIL SERVICE LOG] ===================');
    console.log(`TO: ${to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`TEXT: ${text}`);
    console.log('=================================================================\n');
    return true;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"ZAHZAN Maison" <noreply@zahzan.com>',
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error.message);
    // Still log in dev for convenience
    console.log('\n[DEV EMAIL FALLBACK LOG]:', { to, subject, text });
    return false;
  }
};

/**
 * Send Email Verification link
 */
export const sendVerificationEmail = async (email, token, name = 'Valued Client') => {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const verificationLink = `${baseUrl}/account?action=verify-email&token=${token}`;

  const subject = 'Verify Your ZAHZAN Account';
  const text = `Hello ${name},\n\nPlease verify your ZAHZAN account by visiting the following link:\n${verificationLink}\n\nThis link will expire in 24 hours.\n\nWarm regards,\nZAHZAN Concierge`;

  const html = `
    <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Times New Roman', Georgia, serif; color: #1c1b18;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e8e4dc; padding: 40px; text-align: center;">
        <h1 style="font-size: 28px; letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 20px; color: #1c1b18;">ZAHZAN</h1>
        <hr style="border: none; border-top: 1px solid #e8e4dc; margin: 20px 0;" />
        <h2 style="font-size: 20px; font-weight: 300; margin-bottom: 16px; color: #5a5e4b;">Account Verification</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #706c64; margin-bottom: 28px;">
          Welcome to ZAHZAN. Please click the button below to confirm your email address and activate your account.
        </p>
        <a href="${verificationLink}" style="display: inline-block; background-color: #1c1b18; color: #faf8f5; text-decoration: none; padding: 14px 32px; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase;">
          Verify Email Address
        </a>
        <p style="font-size: 12px; color: #a09c94; margin-top: 30px;">
          Or copy and paste this link into your browser:<br />
          <a href="${verificationLink}" style="color: #5a5e4b;">${verificationLink}</a>
        </p>
        <p style="font-size: 11px; color: #a09c94; margin-top: 40px;">This link will expire in 24 hours.</p>
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text });
};

/**
 * Send Password Reset link
 */
export const sendPasswordResetEmail = async (email, token) => {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const resetLink = `${baseUrl}/account?action=reset-password&token=${token}`;

  const subject = 'Reset Your ZAHZAN Account Password';
  const text = `Hello,\n\nYou requested a password reset for your ZAHZAN account. Click the following link to reset your password:\n${resetLink}\n\nThis link will expire in 1 hour.\nIf you did not request this, please ignore this email.`;

  const html = `
    <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Times New Roman', Georgia, serif; color: #1c1b18;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e8e4dc; padding: 40px; text-align: center;">
        <h1 style="font-size: 28px; letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 20px; color: #1c1b18;">ZAHZAN</h1>
        <hr style="border: none; border-top: 1px solid #e8e4dc; margin: 20px 0;" />
        <h2 style="font-size: 20px; font-weight: 300; margin-bottom: 16px; color: #5a5e4b;">Password Reset Request</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #706c64; margin-bottom: 28px;">
          We received a request to reset your password. Click the button below to specify a new password.
        </p>
        <a href="${resetLink}" style="display: inline-block; background-color: #1c1b18; color: #faf8f5; text-decoration: none; padding: 14px 32px; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase;">
          Reset Password
        </a>
        <p style="font-size: 12px; color: #a09c94; margin-top: 30px;">
          Or copy and paste this link into your browser:<br />
          <a href="${resetLink}" style="color: #5a5e4b;">${resetLink}</a>
        </p>
        <p style="font-size: 11px; color: #a09c94; margin-top: 40px;">This link will expire in 1 hour.</p>
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text });
};

/**
 * Send Email Change confirmation
 */
export const sendEmailChangeConfirmation = async (newEmail, token) => {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const confirmLink = `${baseUrl}/account?action=confirm-email-change&token=${token}`;

  const subject = 'Confirm Your New Email Address — ZAHZAN';
  const text = `Hello,\n\nPlease confirm your new email address by visiting:\n${confirmLink}\n\nThis link will expire in 24 hours.`;

  const html = `
    <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Times New Roman', Georgia, serif; color: #1c1b18;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e8e4dc; padding: 40px; text-align: center;">
        <h1 style="font-size: 28px; letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 20px; color: #1c1b18;">ZAHZAN</h1>
        <hr style="border: none; border-top: 1px solid #e8e4dc; margin: 20px 0;" />
        <h2 style="font-size: 20px; font-weight: 300; margin-bottom: 16px; color: #5a5e4b;">Confirm Email Update</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #706c64; margin-bottom: 28px;">
          You requested to change your account email address. Click below to verify and complete the update.
        </p>
        <a href="${confirmLink}" style="display: inline-block; background-color: #1c1b18; color: #faf8f5; text-decoration: none; padding: 14px 32px; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase;">
          Confirm New Email
        </a>
        <p style="font-size: 12px; color: #a09c94; margin-top: 30px;">
          <a href="${confirmLink}" style="color: #5a5e4b;">${confirmLink}</a>
        </p>
      </div>
    </div>
  `;

  return sendEmail({ to: newEmail, subject, html, text });
};
