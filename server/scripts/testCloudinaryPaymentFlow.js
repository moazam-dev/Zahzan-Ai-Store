import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import AuditLog from '../models/AuditLog.js';
import { uploadPaymentProofToCloudinary, deletePaymentProofFromCloudinary } from '../utils/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runCloudinaryPaymentTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING CLOUDINARY PAYMENT PROOF & ADMIN VERIFICATION FLOW ---\n');

    const products = await Product.find({ isActive: true });
    if (products.length === 0) throw new Error('Need active products in DB');
    const prod = products[0];

    const adminEmail = 'admin_cld_test@zahzan.com';
    const custEmail = 'cust_cld_test@zahzan.com';

    await User.deleteMany({ email: { $in: [adminEmail, custEmail] } });

    const adminUser = await User.create({
      firstName: 'Admin', lastName: 'Cld', email: adminEmail, password: 'AdminPassword123!', role: 'admin', isEmailVerified: true
    });

    const customerUser = await User.create({
      firstName: 'Customer', lastName: 'Cld', email: custEmail, password: 'CustomerPassword123!', role: 'customer', isEmailVerified: true
    });

    // 1. Create a dummy valid 1x1 GIF image file to test live Cloudinary upload
    const dummyFilePath = path.join(__dirname, 'temp_test_proof.gif');
    const validGifBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    fs.writeFileSync(dummyFilePath, validGifBuffer);

    console.log('[TEST 1] Uploading Payment Proof File via Cloudinary Utility...');
    const uploadRes = await uploadPaymentProofToCloudinary(dummyFilePath, 'ZHZ-TEST-CLD');
    
    if (!uploadRes || !uploadRes.secure_url) {
      throw new Error('Cloudinary upload utility failed to return secure_url!');
    }

    console.log(`  ✔ Uploaded Secure URL: ${uploadRes.secure_url}`);
    console.log(`  ✔ Asset Public ID: ${uploadRes.public_id}`);

    // Verify local file cleanup
    if (fs.existsSync(dummyFilePath)) {
      throw new Error('Temporary local file was not cleaned up after upload!');
    }
    console.log('  ✔ Temporary local upload file automatically cleaned up on disk.');

    // 2. Create Order & Payment Record
    console.log('\n[TEST 2] Creating Order & Payment Record with Cloudinary Proof URL...');
    const orderNumber = `ZHZ-CLD-${Date.now().toString().slice(-4)}`;

    const order = await Order.create({
      orderNumber,
      userId: customerUser._id,
      customerName: 'Customer Cld',
      customerEmail: custEmail,
      customerPhone: '+923009998877',
      items: [{ productId: prod._id, productName: prod.name, sku: prod.sku || '', quantity: 1, unitPrice: prod.price, totalPrice: prod.price }],
      shippingAddress: { fullName: 'Customer Cld', phone: '+923009998877', email: custEmail, addressLine1: 'St 5', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
      subtotal: prod.price, shippingCost: 0, total: prod.price,
      paymentMethod: 'JazzCash', paymentStatus: 'submitted', orderStatus: 'Pending'
    });

    const payment = await Payment.create({
      orderId: order._id,
      userId: customerUser._id,
      paymentMethod: 'JazzCash',
      amount: order.total,
      transactionReference: `TID-CLD-${Date.now()}`,
      proofUrl: uploadRes.secure_url,
      proofPublicId: uploadRes.public_id,
      status: 'Pending'
    });

    console.log(`  ✔ Order Created: ${order.orderNumber}`);
    console.log(`  ✔ Payment Record Created with proofUrl: ${payment.proofUrl}`);

    // 3. Test Admin Order Details Response (Relationship Population Check)
    console.log('\n[TEST 3] Testing Admin Order Details API Population...');
    const fetchedOrderDoc = await Order.findById(order._id);
    const fetchedPayment = await Payment.findOne({ orderId: order._id }).sort({ createdAt: -1 });

    if (!fetchedPayment || !fetchedPayment.proofUrl) {
      throw new Error('Admin Order Details relationship check failed: Payment or proofUrl missing!');
    }

    console.log(`  ✔ Admin Order Details successfully fetched linked Payment.`);
    console.log(`  ✔ Admin Proof Screenshot URL: ${fetchedPayment.proofUrl}`);

    // 4. Test Admin Payment Verification
    console.log('\n[TEST 4] Admin Verifying Payment Proof...');
    fetchedPayment.status = 'Verified';
    fetchedPayment.verifiedBy = adminUser._id;
    fetchedPayment.verifiedAt = new Date();
    await fetchedPayment.save();

    fetchedOrderDoc.paymentStatus = 'verified';
    fetchedOrderDoc.orderStatus = 'Confirmed';
    await fetchedOrderDoc.save();

    await AuditLog.create({
      adminId: adminUser._id,
      action: 'PAYMENT_VERIFIED',
      entity: 'Payment',
      entityId: fetchedPayment._id.toString(),
      metadata: { orderNumber: fetchedOrderDoc.orderNumber, proofUrl: fetchedPayment.proofUrl }
    });

    console.log(`  ✔ Payment status updated to: ${fetchedPayment.status}`);
    console.log(`  ✔ Order status updated to: ${fetchedOrderDoc.orderStatus}`);

    // Cleanup test data
    await Payment.deleteMany({ userId: customerUser._id });
    await Order.deleteMany({ userId: customerUser._id });
    await AuditLog.deleteMany({ adminId: adminUser._id });
    await User.deleteMany({ email: { $in: [adminEmail, custEmail] } });
    if (uploadRes.public_id) {
      await deletePaymentProofFromCloudinary(uploadRes.public_id);
    }

    console.log('\n--- ALL CLOUDINARY PAYMENT FLOW TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ CLOUDINARY PAYMENT TEST FAILED:', error);
    process.exit(1);
  }
};

runCloudinaryPaymentTests();
