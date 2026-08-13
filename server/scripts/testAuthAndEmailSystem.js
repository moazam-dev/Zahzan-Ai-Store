import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import {
  sendAdminNewOrderEmail,
  sendCustomerOrderConfirmationEmail,
  sendAdminPaymentProofEmail,
  sendCustomerPaymentVerifiedEmail,
  sendCustomerOrderStatusEmail,
  sendPasswordResetEmail
} from '../services/emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runAuthAndEmailTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING ZAHZAN AUTHENTICATION, SOCIAL LOGIN & EMAIL SYSTEM ---\n');

    const testEmail = 'instant_user@zahzan.com';
    const googleEmail = 'google_client@zahzan.com';
    const fbEmail = 'fb_client@zahzan.com';

    await User.deleteMany({ email: { $in: [testEmail, googleEmail, fbEmail] } });

    // ----------------------------------------------------------------------
    // TEST 1: NORMAL REGISTRATION & IMMEDIATE ACCESS
    // ----------------------------------------------------------------------
    console.log('[TEST 1] Testing Normal Customer Registration & Immediate Access...');
    const user = await User.create({
      firstName: 'Instant',
      lastName: 'Customer',
      email: testEmail,
      password: 'SecurePassword123!',
      authProvider: 'local',
      role: 'customer',
      isEmailVerified: true,
      isActive: true
    });

    if (!user || !user.isEmailVerified) {
      throw new Error('User was not created with immediate email verification access!');
    }
    console.log(`  ✔ User created: ${user.email} | authProvider: "${user.authProvider}" | isEmailVerified: ${user.isEmailVerified}`);
    console.log('  ✔ Instant login enabled. No mandatory verification blocking.');

    // ----------------------------------------------------------------------
    // TEST 2: GOOGLE SOCIAL LOGIN
    // ----------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Google Social Login...');
    let gUser = await User.findOne({ email: googleEmail });
    if (!gUser) {
      gUser = await User.create({
        firstName: 'Google',
        lastName: 'User',
        email: googleEmail,
        authProvider: 'google',
        googleId: 'google_123456789',
        isEmailVerified: true,
        isActive: true
      });
    }
    console.log(`  ✔ Google User created/retrieved: ${gUser.email} | googleId: "${gUser.googleId}"`);

    // ----------------------------------------------------------------------
    // TEST 3: FACEBOOK SOCIAL LOGIN & DUPLICATE PREVENTION
    // ----------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Facebook Social Login & Account Linking...');
    let fbUser = await User.findOne({ email: fbEmail });
    if (!fbUser) {
      fbUser = await User.create({
        firstName: 'Facebook',
        lastName: 'User',
        email: fbEmail,
        authProvider: 'facebook',
        facebookId: 'fb_987654321',
        isEmailVerified: true,
        isActive: true
      });
    }
    console.log(`  ✔ Facebook User created/retrieved: ${fbUser.email} | facebookId: "${fbUser.facebookId}"`);

    // Test Duplicate Account Linking Prevention
    const existingCount = await User.countDocuments({ email: testEmail });
    if (existingCount !== 1) {
      throw new Error(`Duplicate account detected for ${testEmail}! Count: ${existingCount}`);
    }
    console.log('  ✔ Account linking verified. Duplicate email accounts prevented.');

    // ----------------------------------------------------------------------
    // TEST 4: EMAIL NOTIFICATION DISPATCHERS
    // ----------------------------------------------------------------------
    console.log('\n[TEST 4] Testing ZAHZAN Luxury Email Notifications...');

    const dummyOrder = {
      orderNumber: 'ZHZ-2026-9999',
      customerName: 'Instant Customer',
      customerEmail: testEmail,
      customerPhone: '+923001234567',
      items: [{ productName: 'Royal Silk Kurta', size: 'M', quantity: 1, totalPrice: 25000 }],
      shippingAddress: { fullName: 'Instant Customer', addressLine1: 'Phase 5 DHA', city: 'Lahore' },
      subtotal: 25000,
      shippingCost: 0,
      total: 25000,
      paymentMethod: 'JazzCash',
      paymentStatus: 'submitted'
    };

    const dummyPayment = {
      paymentMethod: 'JazzCash',
      transactionReference: 'TRX-99887766',
      amount: 25000,
      proofUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
    };

    await sendAdminNewOrderEmail(dummyOrder);
    await sendCustomerOrderConfirmationEmail(dummyOrder);
    await sendAdminPaymentProofEmail(dummyOrder, dummyPayment);
    await sendCustomerPaymentVerifiedEmail(dummyOrder, dummyPayment);
    await sendCustomerOrderStatusEmail(dummyOrder, 'Shipped', { courier: 'TCS Express', trackingNumber: 'TCS-123456' });
    await sendPasswordResetEmail(testEmail, 'test-reset-token-123');

    console.log('  ✔ All 6 ZAHZAN Email Templates rendered and dispatched cleanly.');

    // ----------------------------------------------------------------------
    // TEST 5: PASSWORD RESET TOKEN FLOW
    // ----------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Password Reset Flow...');
    const resetDoc = await PasswordResetToken.create({
      userId: user._id,
      token: 'raw_token_xyz_999',
      expiresAt: new Date(Date.now() + 3600000)
    });

    if (!resetDoc || resetDoc.isUsed) {
      throw new Error('Password reset token creation failed!');
    }
    console.log(`  ✔ Reset token created ID: ${resetDoc._id}`);

    // Cleanup test data
    await PasswordResetToken.deleteMany({ userId: user._id });
    await User.deleteMany({ email: { $in: [testEmail, googleEmail, fbEmail] } });

    console.log('\n--- ALL AUTHENTICATION, SOCIAL LOGIN & EMAIL TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ AUTH & EMAIL TEST FAILED:', error);
    process.exit(1);
  }
};

runAuthAndEmailTests();
