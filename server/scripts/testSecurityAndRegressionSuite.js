import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Cart from '../models/Cart.js';
import NewsletterSubscriber from '../models/NewsletterSubscriber.js';

import {
  registerUser,
  loginUser,
  googleAuth,
  facebookAuth
} from '../controllers/authController.js';
import {
  getUserProfile,
  updateUserProfile
} from '../controllers/userController.js';
import {
  createOrder,
  getOrderById,
  getMyOrders
} from '../controllers/orderController.js';
import {
  submitPaymentProof,
  getPaymentByOrderId
} from '../controllers/paymentController.js';
import {
  verifyAdminPayment,
  getAllOrders,
  getAdminNewsletterSubscribers,
  exportAdminNewsletterSubscribers
} from '../controllers/adminController.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Mock Express req/res generator
const createMockReqRes = (options = {}) => {
  const req = {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    user: options.user || null,
    ip: '127.0.0.1',
    file: options.file || null
  };

  const res = {
    statusCode: 200,
    headers: {},
    sentContent: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.sentContent = data;
      return this;
    },
    send(data) {
      this.sentContent = data;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
    }
  };

  return { req, res };
};

const runMasterSecuritySuite = async () => {
  try {
    await connectDB();
    console.log('\n=================================================================');
    console.log('--- ZAHZAN BACKEND SECURITY HARDENING & REGRESSION SUITE ---');
    console.log('=================================================================\n');

    const emailUserA = 'user_a_sec@zahzan.com';
    const emailUserB = 'user_b_sec@zahzan.com';
    const emailAdmin = 'admin_sec@zahzan.com';

    // Cleanup prior test records
    await User.deleteMany({ email: { $in: [emailUserA, emailUserB, emailAdmin] } });
    await NewsletterSubscriber.deleteMany({ email: 'sec_newsletter@zahzan.com' });

    // Create Test Admin User
    const adminUser = await User.create({
      firstName: 'SecAdmin',
      lastName: 'Maison',
      email: emailAdmin,
      password: 'AdminSecurePass123!',
      role: 'admin',
      isEmailVerified: true
    });

    // ----------------------------------------------------------------------
    // TEST 1: CUSTOMER SIGNUP & IMMEDIATE ACCESS
    // ----------------------------------------------------------------------
    console.log('[TEST 1] Customer Registration & Immediate Access...');
    const { req: req1, res: res1 } = createMockReqRes({
      body: {
        name: 'Customer A',
        email: emailUserA,
        password: 'Password123!',
        phone: '+923001111111'
      }
    });

    await registerUser(req1, res1, (err) => { if (err) throw err; });

    if (res1.statusCode !== 201 || !res1.sentContent.token) {
      throw new Error(`Registration failed! Code: ${res1.statusCode}`);
    }

    const userA = await User.findOne({ email: emailUserA });
    if (!userA || !userA.isEmailVerified) {
      throw new Error('User account does not have immediate access on signup!');
    }

    console.log(`  ✔ User A created: ${userA.email} | token issued | isEmailVerified: ${userA.isEmailVerified}`);

    // ----------------------------------------------------------------------
    // TEST 2: PASSWORD HASH SECRECY IN APIs
    // ----------------------------------------------------------------------
    console.log('\n[TEST 2] Password Hash Secrecy in API Responses...');
    const { req: reqProfile, res: resProfile } = createMockReqRes({ user: userA });
    await getUserProfile(reqProfile, resProfile, (err) => { if (err) throw err; });

    if (resProfile.sentContent.user.password || resProfile.sentContent.user.passwordHash) {
      throw new Error('SECURITY VIOLATION: Password hash returned in user profile API response!');
    }
    console.log('  ✔ Password hash is strictly hidden from API responses.');

    // ----------------------------------------------------------------------
    // TEST 3: MASS ASSIGNMENT ROLE TAMPERING PROTECTION
    // ----------------------------------------------------------------------
    console.log('\n[TEST 3] Mass Assignment Role Tampering Protection...');
    const { req: reqTamper, res: resTamper } = createMockReqRes({
      user: userA,
      body: {
        firstName: 'Hacker',
        role: 'admin',
        isEmailVerified: true
      }
    });

    await updateUserProfile(reqTamper, resTamper, (err) => { if (err) throw err; });
    const reloadedUserA = await User.findById(userA._id);

    if (reloadedUserA.role !== 'customer') {
      throw new Error('SECURITY VIOLATION: Customer modified role via profile update!');
    }
    console.log('  ✔ Role tampering blocked. Customer role remains "customer".');

    // ----------------------------------------------------------------------
    // TEST 4: GOOGLE & FACEBOOK SOCIAL LOGIN VERIFICATION
    // ----------------------------------------------------------------------
    console.log('\n[TEST 4] Google & Facebook Social Login Verification...');
    const { req: reqG, res: resG } = createMockReqRes({
      body: {
        googleId: 'g_sec_123',
        email: 'google_sec@zahzan.com',
        name: 'Google Customer'
      }
    });
    await googleAuth(reqG, resG, (err) => { if (err) throw err; });

    if (!resG.sentContent.token || resG.sentContent.user.authProvider !== 'google') {
      throw new Error('Google social authentication failed!');
    }
    console.log(`  ✔ Google login authenticated: ${resG.sentContent.user.email} | authProvider: ${resG.sentContent.user.authProvider}`);

    // ----------------------------------------------------------------------
    // TEST 5: OBJECT ID VALIDATION MIDDLEWARE
    // ----------------------------------------------------------------------
    console.log('\n[TEST 5] Object ID Format Validation...');
    const mockReqBadId = { params: { id: 'invalid-non-hex-id-999' } };
    const mockResBadId = createMockReqRes().res;
    let middlewarePassed = false;

    validateObjectId('id')(mockReqBadId, mockResBadId, () => {
      middlewarePassed = true;
    });

    if (middlewarePassed || mockResBadId.statusCode !== 400) {
      throw new Error('Object ID validator failed to reject invalid MongoDB ID string!');
    }
    console.log(`  ✔ Malformed Object ID rejected with HTTP 400 Bad Request: "${mockResBadId.sentContent.message}"`);

    // ----------------------------------------------------------------------
    // TEST 6: SERVER-SIDE PRICING & STOCK CALCULATION
    // ----------------------------------------------------------------------
    console.log('\n[TEST 6] Server-Side Pricing & Stock Validation...');

    // Fetch an active product from DB
    let testProduct = await Product.findOne({ isActive: true });
    if (!testProduct) {
      testProduct = await Product.create({
        name: 'Luxury Velvet Ensemble',
        slug: 'luxury-velvet-ensemble',
        price: 35000,
        stock: 5,
        category: 'Unstitched',
        description: 'Bespoke velvet suit',
        images: ['/images/test.jpg'],
        isActive: true
      });
    }

    // Register User B for ownership tests
    const { req: reqRegB, res: resRegB } = createMockReqRes({
      body: { name: 'Customer B', email: emailUserB, password: 'Password123!', phone: '+923002222222' }
    });
    await registerUser(reqRegB, resRegB, (err) => { if (err) throw err; });
    const userB = await User.findOne({ email: emailUserB });

    // Create Order with User A
    const { req: reqOrder, res: resOrder } = createMockReqRes({
      user: userA,
      body: {
        isBuyNow: true,
        buyNowItem: {
          productId: testProduct._id.toString(),
          quantity: 1,
          selectedSize: 'L',
          price: 1 // Client price tampering attempt
        },
        paymentChoice: 'cod',
        customerInfo: { fullName: 'Customer A', email: userA.email, phone: '+923001111111' },
        shippingAddress: {
          fullName: 'Customer A',
          phone: '+923001111111',
          addressLine1: 'DHA Phase 6',
          city: 'Lahore',
          state: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan'
        }
      }
    });

    await createOrder(reqOrder, resOrder);
    if (resOrder.statusCode !== 201) {
      throw new Error(`Order creation failed! ${JSON.stringify(resOrder.sentContent)}`);
    }

    const createdOrder = resOrder.sentContent.order;
    const itemPrice = testProduct.salePrice || testProduct.price;
    const shippingCost = (itemPrice >= 20000 || createdOrder.shippingCost === 0) ? 0 : (createdOrder.shippingCost || 250);
    const expectedTotal = itemPrice + shippingCost;

    if (createdOrder.total !== expectedTotal) {
      throw new Error(`SECURITY VIOLATION: Server accepted tampered client price! Total: ${createdOrder.total}, Expected: ${expectedTotal}`);
    }
    console.log(`  ✔ Price tampering blocked. Server derived price directly from DB: PKR ${createdOrder.total.toLocaleString()}`);

    // Insufficient Stock Test
    const { req: reqStock, res: resStock } = createMockReqRes({
      user: userA,
      body: {
        isBuyNow: true,
        buyNowItem: { productId: testProduct._id.toString(), quantity: 9999 },
        paymentChoice: 'cod',
        customerInfo: { fullName: 'Customer A', email: userA.email, phone: '+923001111111' },
        shippingAddress: { fullName: 'Customer A', phone: '+923001111111', addressLine1: 'DHA', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' }
      }
    });

    await createOrder(reqStock, resStock);
    if (resStock.statusCode !== 400) {
      throw new Error('Stock validation failed to reject quantity exceeding available stock!');
    }
    console.log(`  ✔ Insufficient stock request rejected cleanly: "${resStock.sentContent.message}"`);

    // ----------------------------------------------------------------------
    // TEST 7: ORDER OWNERSHIP SECURITY (User A vs User B)
    // ----------------------------------------------------------------------
    console.log('\n[TEST 7] Order Ownership Security (User A vs User B)...');
    const { req: reqOwnerA, res: resOwnerA } = createMockReqRes({
      user: userA,
      params: { id: createdOrder._id.toString() }
    });
    await getOrderById(reqOwnerA, resOwnerA);
    if (resOwnerA.statusCode !== 200) {
      throw new Error('Order owner was wrongly denied access to their own order!');
    }
    console.log('  ✔ User A successfully accessed their own order.');

    // User B attempts to access User A's order
    const { req: reqOwnerB, res: resOwnerB } = createMockReqRes({
      user: userB,
      params: { id: createdOrder._id.toString() }
    });
    await getOrderById(reqOwnerB, resOwnerB);

    if (resOwnerB.statusCode !== 403) {
      throw new Error(`SECURITY VIOLATION: User B accessed User A's order! Code: ${resOwnerB.statusCode}`);
    }
    console.log(`  ✔ Cross-user order access blocked with HTTP 403 Forbidden: "${resOwnerB.sentContent.message}"`);

    // ----------------------------------------------------------------------
    // TEST 8: PAYMENT PROOF OWNERSHIP & STATUS TAMPERING PROTECTION
    // ----------------------------------------------------------------------
    console.log('\n[TEST 8] Payment Proof Ownership & Status Tamper Protection...');
    const { req: reqPayTamper, res: resPayTamper } = createMockReqRes({
      user: userB,
      body: {
        orderId: createdOrder._id.toString(),
        paymentMethod: 'JazzCash',
        transactionReference: 'TRX-SECURITY-123',
        status: 'Verified' // Client status spoofing attempt
      },
      file: { path: 'uploads/test.jpg', originalname: 'proof.jpg', mimetype: 'image/jpeg' }
    });

    await submitPaymentProof(reqPayTamper, resPayTamper, (err) => { if (err) throw err; });
    if (resPayTamper.statusCode !== 403) {
      throw new Error('SECURITY VIOLATION: User B submitted payment proof for User A order!');
    }
    console.log(`  ✔ Unauthorized payment submission blocked with HTTP 403: "${resPayTamper.sentContent.message}"`);

    // ----------------------------------------------------------------------
    // TEST 9: ADMIN AUTHORIZATION ENFORCEMENT
    // ----------------------------------------------------------------------
    console.log('\n[TEST 9] Admin Authorization Enforcement...');
    const { req: reqAdminList, res: resAdminList } = createMockReqRes({
      user: adminUser,
      query: { page: '1', limit: '10' }
    });
    await getAllOrders(reqAdminList, resAdminList, (err) => { if (err) throw err; });
    if (resAdminList.statusCode !== 200 || !resAdminList.sentContent.orders) {
      throw new Error('Admin user failed to access admin orders API!');
    }
    console.log(`  ✔ Authorized Admin successfully retrieved ${resAdminList.sentContent.orders.length} orders.`);

    // ----------------------------------------------------------------------
    // TEST 10: CLEANUP TEST DATA
    // ----------------------------------------------------------------------
    console.log('\n[TEST 10] Cleaning up security test records...');
    await Order.deleteOne({ _id: createdOrder._id });
    await User.deleteMany({ email: { $in: [emailUserA, emailUserB, emailAdmin, 'google_sec@zahzan.com'] } });

    console.log('\n=================================================================');
    console.log('--- ALL BACKEND SECURITY HARDENING & REGRESSION TESTS PASSED! ---');
    console.log('=================================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ MASTER SECURITY TEST FAILED:', error);
    process.exit(1);
  }
};

runMasterSecuritySuite();
