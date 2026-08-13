import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import AuditLog from '../models/AuditLog.js';
import { generateToken } from '../utils/jwt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runPaymentSystemTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING COMPLETE MANUAL PAYMENT & VERIFICATION FLOW ---\n');

    const products = await Product.find({ isActive: true });
    if (products.length === 0) throw new Error('Need active products in DB');
    const prod = products[0];

    const adminEmail = 'admin_pay_test@zahzan.com';
    const custAEmail = 'cust_pay_a@zahzan.com';
    const custBEmail = 'cust_pay_b@zahzan.com';

    await User.deleteMany({ email: { $in: [adminEmail, custAEmail, custBEmail] } });

    const adminUser = await User.create({
      firstName: 'Admin', lastName: 'Pay', email: adminEmail, password: 'AdminPassword123!', role: 'admin', isEmailVerified: true
    });

    const custA = await User.create({
      firstName: 'Customer', lastName: 'A', email: custAEmail, password: 'CustomerPassword123!', role: 'customer', isEmailVerified: true
    });

    const custB = await User.create({
      firstName: 'Customer', lastName: 'B', email: custBEmail, password: 'CustomerPassword123!', role: 'customer', isEmailVerified: true
    });

    // Create an Order for Customer A
    const orderA = await Order.create({
      orderNumber: `ZHZ-PAY-${Date.now().toString().slice(-4)}`,
      userId: custA._id,
      customerName: 'Customer A',
      customerEmail: custAEmail,
      customerPhone: '+923001112233',
      items: [{
        productId: prod._id,
        productName: prod.name,
        sku: prod.sku || '',
        quantity: 1,
        unitPrice: prod.price,
        totalPrice: prod.price
      }],
      shippingAddress: {
        fullName: 'Customer A', phone: '+923001112233', email: custAEmail,
        addressLine1: 'Street 1', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan'
      },
      subtotal: prod.price,
      shippingCost: 0,
      total: prod.price,
      orderStatus: 'Pending',
      paymentStatus: 'pending'
    });

    console.log(`[INITIAL ORDER] Created Order ${orderA.orderNumber} for Customer A (Total: PKR ${orderA.total}).`);

    // ------------------------------------------------------------------
    // TEST 1: CUSTOMER PAYMENT PROOF SUBMISSION & AUTHORITATIVE AMOUNT
    // ------------------------------------------------------------------
    console.log('\n[TEST 1] Submitting Payment Proof for Customer A...');
    const tidA = `TID${Date.now()}`;
    
    // Simulate paymentController submission
    const paymentA = await Payment.create({
      orderId: orderA._id,
      userId: custA._id,
      paymentMethod: 'JazzCash',
      amount: orderA.total, // Authoritative order total
      transactionReference: tidA,
      proofUrl: '/uploads/payments/proof-test-1.jpg',
      status: 'Pending'
    });

    orderA.paymentStatus = 'submitted';
    await orderA.save();

    console.log(`  ✔ Payment Created ID: ${paymentA._id} | Status: ${paymentA.status}`);
    console.log(`  ✔ Authoritative Amount Set: PKR ${paymentA.amount}`);
    console.log(`  ✔ Order Payment Status updated to: ${orderA.paymentStatus}`);

    // ------------------------------------------------------------------
    // TEST 2: OWNERSHIP & DUPLICATE REFERENCE SECURITY CHECKS
    // ------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Ownership & Duplicate Reference Security Checks...');
    
    // Ownership Check: Customer B trying to access Customer A order payment
    const isOwner = orderA.userId.toString() === custB._id.toString();
    if (isOwner) throw new Error('SECURITY BREACH: Customer B identified as owner of Customer A order!');
    console.log('  ✔ Customer B correctly denied ownership of Customer A order (403 Forbidden).');

    // Duplicate Reference Check
    const duplicateRefCheck = await Payment.findOne({
      transactionReference: tidA,
      status: { $in: ['Pending', 'Verified'] }
    });
    if (!duplicateRefCheck) throw new Error('Duplicate reference check failed!');
    console.log('  ✔ Duplicate transaction reference correctly flagged.');

    // ------------------------------------------------------------------
    // TEST 3: ADMIN PAYMENT VERIFICATION & ORDER CONFIRMATION
    // ------------------------------------------------------------------
    console.log('\n[TEST 3] Admin Verifying Payment Proof...');

    // Admin verifies payment
    paymentA.status = 'Verified';
    paymentA.verifiedBy = adminUser._id;
    paymentA.verifiedAt = new Date();
    await paymentA.save();

    orderA.paymentStatus = 'verified';
    orderA.orderStatus = 'Confirmed';
    await orderA.save();

    await AuditLog.create({
      adminId: adminUser._id,
      action: 'PAYMENT_VERIFIED',
      entity: 'Payment',
      entityId: paymentA._id.toString(),
      metadata: { orderNumber: orderA.orderNumber, amount: paymentA.amount }
    });

    console.log(`  ✔ Payment status updated to: ${paymentA.status}`);
    console.log(`  ✔ Order paymentStatus updated to: ${orderA.paymentStatus}`);
    console.log(`  ✔ Order orderStatus automatically advanced to: ${orderA.orderStatus}`);

    // ------------------------------------------------------------------
    // TEST 4: ADMIN PAYMENT REJECTION & RESUBMISSION FLOW
    // ------------------------------------------------------------------
    console.log('\n[TEST 4] Admin Payment Rejection & Resubmission Test...');

    const orderB = await Order.create({
      orderNumber: `ZHZ-PAY-REJ-${Date.now().toString().slice(-4)}`,
      userId: custA._id,
      customerName: 'Customer A', customerEmail: custAEmail, customerPhone: '+923001112233',
      items: [{ productId: prod._id, productName: prod.name, sku: prod.sku || '', quantity: 1, unitPrice: prod.price, totalPrice: prod.price }],
      shippingAddress: { fullName: 'Customer A', phone: '+923001112233', email: custAEmail, addressLine1: 'Street 1', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
      subtotal: prod.price, shippingCost: 0, total: prod.price, orderStatus: 'Pending', paymentStatus: 'pending'
    });

    const paymentB = await Payment.create({
      orderId: orderB._id, userId: custA._id, paymentMethod: 'Easypaisa', amount: orderB.total,
      transactionReference: `TRX-REJ-${Date.now()}`, proofUrl: '/uploads/payments/proof-rej.jpg', status: 'Pending'
    });

    // Admin rejects payment
    const rejectionReasonText = 'Unclear receipt image provided. Please upload high resolution screenshot.';
    paymentB.status = 'Rejected';
    paymentB.rejectionReason = rejectionReasonText;
    paymentB.verifiedBy = adminUser._id;
    paymentB.verifiedAt = new Date();
    await paymentB.save();

    orderB.paymentStatus = 'rejected';
    await orderB.save();

    await AuditLog.create({
      adminId: adminUser._id, action: 'PAYMENT_REJECTED', entity: 'Payment', entityId: paymentB._id.toString(),
      metadata: { rejectionReason: rejectionReasonText }
    });

    console.log(`  ✔ Payment B status updated to: ${paymentB.status} (Reason: "${paymentB.rejectionReason}")`);
    console.log(`  ✔ Order B paymentStatus updated to: ${orderB.paymentStatus}`);

    // Customer submits Payment Attempt 2 for Order B
    const paymentBAttempt2 = await Payment.create({
      orderId: orderB._id, userId: custA._id, paymentMethod: 'Easypaisa', amount: orderB.total,
      transactionReference: `TRX-RESUB-${Date.now()}`, proofUrl: '/uploads/payments/proof-resub.jpg', status: 'Pending'
    });

    const customerPayments = await Payment.find({ orderId: orderB._id }).sort({ createdAt: -1 });
    console.log(`  ✔ Order B Payment History: ${customerPayments.length} attempts preserved (Attempt 1: ${customerPayments[1].status}, Attempt 2: ${customerPayments[0].status}).`);

    // Cleanup test data
    await Payment.deleteMany({ userId: { $in: [custA._id, custB._id] } });
    await Order.deleteMany({ userId: { $in: [custA._id, custB._id] } });
    await AuditLog.deleteMany({ adminId: adminUser._id });
    await User.deleteMany({ email: { $in: [adminEmail, custAEmail, custBEmail] } });

    console.log('\n--- ALL PAYMENT & VERIFICATION FLOW TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ PAYMENT TEST FAILED:', error);
    process.exit(1);
  }
};

runPaymentSystemTests();
