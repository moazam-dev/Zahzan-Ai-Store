import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import {
  getAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  toggleAdminProductStatus,
  deleteAdminProduct
} from '../controllers/adminController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const createMockReqRes = (options = {}) => {
  const req = {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    user: options.user || null,
    ip: '127.0.0.1'
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
    }
  };

  return { req, res };
};

const runProductManagementTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING ZAHZAN ADMIN PRODUCT MANAGEMENT (ADD, UPDATE, DEACTIVATE, ACTIVATE, DELETE) ---\n');

    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        firstName: 'ProductTest',
        lastName: 'Admin',
        email: 'prod_admin_test@zahzan.com',
        password: 'AdminPassword123!',
        role: 'admin',
        isEmailVerified: true
      });
    }

    const testSku = `ZHZ-TEST-${Date.now()}`;

    // ----------------------------------------------------------------------
    // TEST 1: CREATE PRODUCT
    // ----------------------------------------------------------------------
    console.log('[TEST 1] Testing Product Creation...');
    const { req: req1, res: res1 } = createMockReqRes({
      user: adminUser,
      body: {
        name: 'Royal Emerald Anarkali',
        price: 45000,
        sku: testSku,
        category: 'Ready to Wear',
        stock: 12,
        description: 'Bespoke hand-embroidered raw silk Anarkali',
        color: 'Emerald Green',
        fabric: 'Raw Silk',
        work: 'Zardozi & Tilla'
      }
    });

    await createAdminProduct(req1, res1, (err) => { if (err) throw err; });

    if (res1.statusCode !== 201 || !res1.sentContent.success) {
      throw new Error(`Product creation failed! Code: ${res1.statusCode}, Error: ${JSON.stringify(res1.sentContent)}`);
    }

    const prod1 = res1.sentContent.product;
    console.log(`  ✔ Product created ID: ${prod1._id || prod1.id} | Name: "${prod1.name}" | SKU: "${prod1.sku}" | Slug: "${prod1.slug}" | isActive: ${prod1.isActive}`);

    // ----------------------------------------------------------------------
    // TEST 2: UPDATE PRODUCT
    // ----------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Product Update...');
    const { req: req2, res: res2 } = createMockReqRes({
      user: adminUser,
      params: { id: prod1._id.toString() },
      body: {
        price: 49000,
        stock: 15,
        description: 'Updated luxury description'
      }
    });

    await updateAdminProduct(req2, res2, (err) => { if (err) throw err; });

    if (res2.statusCode !== 200 || res2.sentContent.product.price !== 49000) {
      throw new Error(`Product update failed! Code: ${res2.statusCode}`);
    }
    console.log(`  ✔ Product updated cleanly: Price=${res2.sentContent.product.price} | Stock=${res2.sentContent.product.stock}`);

    // ----------------------------------------------------------------------
    // TEST 3: DEACTIVATE PRODUCT
    // ----------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Product Deactivation...');
    const { req: req3, res: res3 } = createMockReqRes({
      user: adminUser,
      params: { id: prod1._id.toString() },
      body: { isActive: false }
    });

    await toggleAdminProductStatus(req3, res3, (err) => { if (err) throw err; });

    if (res3.statusCode !== 200 || res3.sentContent.product.isActive !== false) {
      throw new Error('Product deactivation failed!');
    }
    console.log(`  ✔ Product deactivated: isActive=${res3.sentContent.product.isActive}`);

    // Verify filter by status="deactivated"
    const { req: reqFilter, res: resFilter } = createMockReqRes({
      user: adminUser,
      query: { status: 'deactivated', search: testSku }
    });

    await getAdminProducts(reqFilter, resFilter, (err) => { if (err) throw err; });
    if (resFilter.sentContent.products.length !== 1) {
      throw new Error('Deactivated product filter failed to return deactivated product!');
    }
    console.log('  ✔ Admin product status filter ("deactivated") verified.');

    // ----------------------------------------------------------------------
    // TEST 4: REACTIVATE PRODUCT
    // ----------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Product Reactivation...');
    const { req: req4, res: res4 } = createMockReqRes({
      user: adminUser,
      params: { id: prod1._id.toString() },
      body: { isActive: true }
    });

    await toggleAdminProductStatus(req4, res4, (err) => { if (err) throw err; });

    if (res4.statusCode !== 200 || res4.sentContent.product.isActive !== true) {
      throw new Error('Product reactivation failed!');
    }
    console.log(`  ✔ Product reactivated: isActive=${res4.sentContent.product.isActive}`);

    // ----------------------------------------------------------------------
    // TEST 5: PERMANENT DELETE PRODUCT
    // ----------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Permanent Delete...');
    const { req: req5, res: res5 } = createMockReqRes({
      user: adminUser,
      params: { id: prod1._id.toString() },
      query: { permanent: 'true' }
    });

    await deleteAdminProduct(req5, res5, (err) => { if (err) throw err; });

    if (res5.statusCode !== 200 || !res5.sentContent.success) {
      throw new Error('Permanent delete failed!');
    }

    const checkDel = await Product.findById(prod1._id);
    if (checkDel) {
      throw new Error('Product document still exists in MongoDB after permanent delete!');
    }
    console.log('  ✔ Product permanently deleted from database.');

    // Cleanup
    if (adminUser.email === 'prod_admin_test@zahzan.com') {
      await User.deleteOne({ _id: adminUser._id });
    }

    console.log('\n--- ALL ADMIN PRODUCT MANAGEMENT TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ PRODUCT MANAGEMENT TEST FAILED:', error);
    process.exit(1);
  }
};

runProductManagementTests();
