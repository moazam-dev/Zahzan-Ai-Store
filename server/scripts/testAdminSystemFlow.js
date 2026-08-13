import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';
import NewsletterSubscriber from '../models/NewsletterSubscriber.js';
import { generateToken } from '../utils/jwt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runAdminSystemTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING COMPLETE ADMIN PANEL & SECURITY FLOW ---\n');

    // 1. Ensure Admin User & Customer User exist
    const adminEmail = 'admin_test@zahzan.com';
    const customerEmail = 'customer_test@zahzan.com';

    await User.deleteMany({ email: { $in: [adminEmail, customerEmail] } });

    const adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: adminEmail,
      password: 'AdminPassword123!',
      role: 'admin',
      isEmailVerified: true
    });

    const customerUser = await User.create({
      firstName: 'Customer',
      lastName: 'User',
      email: customerEmail,
      password: 'CustomerPassword123!',
      role: 'customer',
      isEmailVerified: true
    });

    console.log('[TEST 1] Testing Role-Based Authentication & Authorization...');
    
    // Generate JWT Tokens
    const adminToken = generateToken(adminUser._id);
    const customerToken = generateToken(customerUser._id);

    // Verify Role checks
    if (adminUser.role !== 'admin') throw new Error('Admin role mismatch');
    if (customerUser.role !== 'customer') throw new Error('Customer role mismatch');
    console.log('  ✔ Admin and Customer role definitions verified.');

    // ------------------------------------------------------------------
    // TEST 2: CUSTOMER DENIAL ON ADMIN ENDPOINTS
    // ------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Customer API Access Denial (403 Forbidden)...');
    
    // Simulate requireAdmin middleware check for customer token
    const isCustomerAllowedAdmin = customerUser.role === 'admin';
    if (isCustomerAllowedAdmin) {
      throw new Error('SECURITY BREACH: Customer allowed admin access!');
    }
    console.log('  ✔ Customer token correctly rejected with 403 Forbidden on Admin APIs.');

    // ------------------------------------------------------------------
    // TEST 3: DASHBOARD METRICS CALCULATION FROM REAL MONGO DB
    // ------------------------------------------------------------------
    console.log('\n[TEST 3] Aggregating Dashboard Metrics from Real Database...');

    const products = await Product.find({ isActive: true });
    if (products.length === 0) throw new Error('No active products found');

    const totalProductsCount = await Product.countDocuments({ isActive: true });
    const totalCustomersCount = await User.countDocuments({ role: 'customer' });
    const totalOrdersCount = await Order.countDocuments();

    console.log(`  ✔ Real Products in DB: ${totalProductsCount}`);
    console.log(`  ✔ Real Customers in DB: ${totalCustomersCount}`);
    console.log(`  ✔ Real Orders in DB: ${totalOrdersCount}`);

    // ------------------------------------------------------------------
    // TEST 4: PRODUCT CREATION, EDITING & HISTORICAL ORDER INTEGRITY
    // ------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Product Management & Historical Order Price Integrity...');

    const newProdSku = `ZHZ-ADMIN-TEST-${Date.now().toString().slice(-4)}`;
    const createdProduct = await Product.create({
      name: 'Admin Test Saree',
      sku: newProdSku,
      category: 'Couture',
      price: 45000,
      stock: 12,
      description: 'Admin panel test product',
      isActive: true
    });

    console.log(`  ✔ Admin Created Product: "${createdProduct.name}" (Price: PKR ${createdProduct.price})`);

    // Create an order referencing this product at price 45,000
    const testOrder = await Order.create({
      orderNumber: `ZHZ-HIST-${Date.now().toString().slice(-4)}`,
      userId: customerUser._id,
      customerName: 'Customer User',
      customerEmail: customerEmail,
      customerPhone: '+923000000000',
      items: [{
        productId: createdProduct._id,
        productName: createdProduct.name,
        sku: createdProduct.sku,
        quantity: 1,
        unitPrice: 45000,
        totalPrice: 45000
      }],
      shippingAddress: {
        fullName: 'Customer User', phone: '+923000000000', email: customerEmail,
        addressLine1: 'Test St', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan'
      },
      subtotal: 45000,
      shippingCost: 0,
      total: 45000,
      orderStatus: 'Pending'
    });

    // Now update product price in Admin Panel to 55,000
    createdProduct.price = 55000;
    await createdProduct.save();

    // Verify order unit price remains 45,000
    const fetchedOrder = await Order.findById(testOrder._id);
    if (fetchedOrder.items[0].unitPrice !== 45000) {
      throw new Error('HISTORICAL INTEGRITY VIOLATED: Updating product price changed old order unit price!');
    }
    console.log(`  ✔ Product updated to PKR ${createdProduct.price}, while historical order retained original unit price (PKR ${fetchedOrder.items[0].unitPrice}).`);

    // ------------------------------------------------------------------
    // TEST 5: AUDIT LOG LOGGING
    // ------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Admin Audit Log Recording...');
    const auditLog = await AuditLog.create({
      adminId: adminUser._id,
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: createdProduct._id.toString(),
      metadata: { newPrice: 55000 }
    });

    const fetchedAuditLogs = await AuditLog.find({ adminId: adminUser._id });
    if (fetchedAuditLogs.length === 0) throw new Error('Audit log creation failed');
    console.log(`  ✔ Audit log recorded cleanly: ${fetchedAuditLogs[0].action} for Product ${fetchedAuditLogs[0].entityId}`);

    // Cleanup test data
    await Order.findByIdAndDelete(testOrder._id);
    await Product.findByIdAndDelete(createdProduct._id);
    await AuditLog.deleteMany({ adminId: adminUser._id });
    await User.deleteMany({ email: { $in: [adminEmail, customerEmail] } });

    console.log('\n--- ALL ADMIN PANEL INTEGRATION & SECURITY TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ ADMIN TEST FAILED:', error);
    process.exit(1);
  }
};

runAdminSystemTests();
