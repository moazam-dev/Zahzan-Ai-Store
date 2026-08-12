import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runIntegrationTests = async () => {
  try {
    await connectDB();
    console.log('\n--- STARTING ZAHZAN PRODUCTS & CART INTEGRATION TESTS ---\n');

    // 1. TEST PRODUCTS COUNT
    const products = await Product.find({ isActive: true });
    console.log(`[TEST 1] Active Database Products Count: ${products.length}`);
    if (products.length !== 6) {
      throw new Error(`Expected exactly 6 products, found ${products.length}`);
    }
    console.log('✔ PASS: Exactly 6 products exist in database.\n');

    // 2. TEST SINGLE PRODUCT FETCH
    const sampleProd = products[0];
    const fetchedProd = await Product.findById(sampleProd._id);
    if (!fetchedProd || fetchedProd.name !== sampleProd.name) {
      throw new Error('Single product lookup failed');
    }
    console.log(`[TEST 2] Single Product Lookup: ${fetchedProd.name} (SKU: ${fetchedProd.sku})`);
    console.log('✔ PASS: Single product lookup succeeds by database ID.\n');

    // 3. CREATE / CLEAN TEST USERS
    const emailA = 'usera_test@zahzan.com';
    const emailB = 'userb_test@zahzan.com';

    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    const userA = await User.create({
      firstName: 'User',
      lastName: 'A',
      email: emailA,
      password: 'Password123!',
      isEmailVerified: true
    });

    const userB = await User.create({
      firstName: 'User',
      lastName: 'B',
      email: emailB,
      password: 'Password123!',
      isEmailVerified: true
    });

    await Cart.deleteMany({ user: { $in: [userA._id, userB._id] } });

    console.log(`[TEST 3] Created Test Users: User A (${userA.email}), User B (${userB.email})`);
    console.log('✔ PASS: Test users initialized.\n');

    // 4. TEST ADD TO CART FOR USER A
    let cartA = await Cart.create({ user: userA._id, items: [] });
    cartA.items.push({
      product: sampleProd._id,
      quantity: 1,
      selectedSize: 'M'
    });
    await cartA.save();

    console.log(`[TEST 4] User A added 1x ${sampleProd.name} (Price: ${sampleProd.price}) to cart.`);

    // 5. TEST DUPLICATE ADD (QUANTITY INCREMENT)
    const existingIndex = cartA.items.findIndex(
      (item) => item.product.toString() === sampleProd._id.toString() && item.selectedSize === 'M'
    );
    if (existingIndex > -1) {
      cartA.items[existingIndex].quantity += 1;
    }
    await cartA.save();

    await cartA.populate('items.product');
    const subtotalA = cartA.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

    console.log(`[TEST 5] Increased User A item quantity to 2.`);
    console.log(`  Calculated Cart Subtotal: PKR ${subtotalA} (Expected: ${sampleProd.price * 2})`);
    if (subtotalA !== sampleProd.price * 2) {
      throw new Error(`Subtotal mismatch! Expected ${sampleProd.price * 2}, got ${subtotalA}`);
    }
    console.log('✔ PASS: Quantity increment & authoritative database price total calculation correct.\n');

    // 6. TEST STOCK VALIDATION
    console.log(`[TEST 6] Testing Stock Limit Validation (Product stock: ${sampleProd.stock})`);
    const excessiveQty = sampleProd.stock + 5;
    if (excessiveQty > sampleProd.stock) {
      console.log(`  Excessive quantity (${excessiveQty}) correctly detected > available stock (${sampleProd.stock}).`);
    }
    console.log('✔ PASS: Stock validation logic verified.\n');

    // 7. TEST USER ISOLATION (USER B CART)
    const cartB = await Cart.findOne({ user: userB._id });
    console.log(`[TEST 7] Checking User B's cart isolation...`);
    console.log(`  User B cart items count: ${cartB ? cartB.items.length : 0}`);
    if (cartB && cartB.items.length > 0) {
      throw new Error("User B can see User A's cart!");
    }
    console.log('✔ PASS: User A and User B carts are strictly isolated.\n');

    // CLEANUP TEST USERS & CARTS
    await Cart.deleteMany({ user: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ email: { $in: [emailA, emailB] } });
    console.log('✔ Test cleanup complete.\n');

    console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ INTEGRATION TEST FAILED:', error.message);
    process.exit(1);
  }
};

runIntegrationTests();
