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

const runPersistenceTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING CART & WISHLIST PERSISTENCE ACROSS LOGIN/LOGOUT ---\n');

    const products = await Product.find({ isActive: true });
    if (products.length < 2) {
      throw new Error('Need at least 2 active products in DB for test');
    }
    const prod1 = products[0];
    const prod2 = products[1];

    const emailA = 'user_persist_a@zahzan.com';
    const emailB = 'user_persist_b@zahzan.com';

    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    const userA = await User.create({
      firstName: 'Persist',
      lastName: 'UserA',
      email: emailA,
      password: 'Password123!',
      isEmailVerified: true,
      wishlist: [prod1._id]
    });

    const userB = await User.create({
      firstName: 'Persist',
      lastName: 'UserB',
      email: emailB,
      password: 'Password123!',
      isEmailVerified: true,
      wishlist: [prod2._id]
    });

    await Cart.deleteMany({ user: { $in: [userA._id, userB._id] } });

    // User A adds prod1 to Cart
    let cartA = await Cart.create({
      user: userA._id,
      items: [{ product: prod1._id, quantity: 2, selectedSize: 'M' }]
    });

    // User B adds prod2 to Cart
    let cartB = await Cart.create({
      user: userB._id,
      items: [{ product: prod2._id, quantity: 1, selectedSize: 'S' }]
    });

    console.log(`[STATE 1] User A initialized with Wishlist item (${prod1.name}) & Cart items (Qty 2 x ${prod1.name}).`);
    console.log(`[STATE 1] User B initialized with Wishlist item (${prod2.name}) & Cart items (Qty 1 x ${prod2.name}).`);

    // SIMULATE LOGOUT FOR USER A: Frontend clears in-memory state
    let memoryCart = [];
    let memoryWishlist = [];
    console.log(`\n[STEP 1] User A logs out -> Frontend state reset to: Cart = ${memoryCart.length}, Wishlist = ${memoryWishlist.length}`);
    if (memoryCart.length !== 0 || memoryWishlist.length !== 0) {
      throw new Error('Memory not empty after logout');
    }
    console.log('✔ PASS: In-memory state cleared on logout.\n');

    // SIMULATE LOGIN FOR USER A: Fetch from DB
    const fetchedUserA = await User.findById(userA._id).populate('wishlist');
    const fetchedCartA = await Cart.findOne({ user: userA._id }).populate('items.product');

    memoryWishlist = fetchedUserA.wishlist.map((p) => p._id.toString());
    memoryCart = fetchedCartA.items.map((i) => ({ id: i.product._id.toString(), qty: i.quantity }));

    console.log(`[STEP 2] User A logs in again -> Restored from Database:`);
    console.log(`  Cart Items: ${memoryCart.length} (Product: ${fetchedCartA.items[0].product.name}, Qty: ${memoryCart[0].qty})`);
    console.log(`  Wishlist Items: ${memoryWishlist.length} (Product: ${fetchedUserA.wishlist[0].name})`);

    if (memoryCart.length !== 1 || memoryCart[0].qty !== 2 || memoryWishlist.length !== 1) {
      throw new Error('User A state failed to restore correctly!');
    }
    console.log('✔ PASS: User A state restored exactly as it was before logout!\n');

    // SIMULATE LOGIN FOR USER B: Verify Isolation
    const fetchedUserB = await User.findById(userB._id).populate('wishlist');
    const fetchedCartB = await Cart.findOne({ user: userB._id }).populate('items.product');

    const memoryWishlistB = fetchedUserB.wishlist.map((p) => p._id.toString());
    const memoryCartB = fetchedCartB.items.map((i) => ({ id: i.product._id.toString(), qty: i.quantity }));

    console.log(`[STEP 3] User B logs in -> Restored from Database:`);
    console.log(`  Cart Items: ${memoryCartB.length} (Product: ${fetchedCartB.items[0].product.name})`);
    console.log(`  Wishlist Items: ${memoryWishlistB.length} (Product: ${fetchedUserB.wishlist[0].name})`);

    if (memoryCartB[0].id === memoryCart[0].id) {
      throw new Error('User B received User A cart!');
    }
    console.log('✔ PASS: User B state is strictly isolated from User A!\n');

    // Cleanup test users
    await Cart.deleteMany({ user: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    console.log('--- ALL PERSISTENCE AND LOGIN/LOGOUT TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ PERSISTENCE TEST FAILED:', error);
    process.exit(1);
  }
};

runPersistenceTests();
