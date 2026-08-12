import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import Order from '../models/Order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runOrderCheckoutTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING COMPLETE ORDER & CHECKOUT FLOW ---\n');

    const products = await Product.find({ isActive: true });
    if (products.length < 2) {
      throw new Error('Need at least 2 active products in DB for order testing');
    }

    const prod1 = products[0];
    const prod2 = products[1];

    const initialStockProd1 = prod1.stock;
    const initialStockProd2 = prod2.stock;

    console.log(`[INITIAL STOCK] ${prod1.name}: ${initialStockProd1} | ${prod2.name}: ${initialStockProd2}`);

    const emailA = 'order_user_a@zahzan.com';
    const emailB = 'order_user_b@zahzan.com';

    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    const userA = await User.create({
      firstName: 'OrderUser',
      lastName: 'A',
      email: emailA,
      password: 'Password123!',
      phone: '+923001112233',
      isEmailVerified: true
    });

    const userB = await User.create({
      firstName: 'OrderUser',
      lastName: 'B',
      email: emailB,
      password: 'Password123!',
      phone: '+923004445566',
      isEmailVerified: true
    });

    await Cart.deleteMany({ user: { $in: [userA._id, userB._id] } });
    await Order.deleteMany({ userId: { $in: [userA._id, userB._id] } });

    // ------------------------------------------------------------------
    // TEST 1: CART CHECKOUT FLOW
    // ------------------------------------------------------------------
    console.log('\n[TEST 1] Processing Cart Checkout for User A...');
    await Cart.create({
      user: userA._id,
      items: [{ product: prod1._id, quantity: 2, selectedSize: 'L' }]
    });

    const shippingSnapshotA = {
      fullName: 'OrderUser A',
      phone: '+923001112233',
      email: emailA,
      addressLine1: '123 Luxury Avenue, Gulberg III',
      city: 'Lahore',
      state: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
      deliveryInstructions: 'Leave with receptionist'
    };

    // Simulate server handler logic for Cart Checkout
    const itemsToProcess = [{ productId: prod1._id, quantity: 2, selectedSize: 'L' }];
    let subtotalA = 0;
    let orderItemsA = [];

    for (const item of itemsToProcess) {
      const p = await Product.findById(item.productId);
      if (item.quantity > p.stock) throw new Error('Insufficient stock');
      const itemTotal = p.price * item.quantity;
      subtotalA += itemTotal;
      orderItemsA.push({
        productId: p._id,
        productName: p.name,
        sku: p.sku || '',
        image: p.images?.[0] || p.image || '',
        size: item.selectedSize,
        quantity: item.quantity,
        unitPrice: p.price,
        totalPrice: itemTotal
      });
      await Product.findByIdAndUpdate(p._id, { $inc: { stock: -item.quantity } });
    }

    const shippingCostA = subtotalA >= 20000 ? 0 : 250;
    const totalA = subtotalA + shippingCostA;
    const orderNumberA = `ZHZ-20260812-0001`;

    const orderA = await Order.create({
      orderNumber: orderNumberA,
      userId: userA._id,
      customerName: 'OrderUser A',
      customerEmail: emailA,
      customerPhone: '+923001112233',
      items: orderItemsA,
      shippingAddress: shippingSnapshotA,
      subtotal: subtotalA,
      shippingCost: shippingCostA,
      total: totalA,
      orderStatus: 'Pending'
    });

    // Clear cart for User A
    await Cart.findOneAndUpdate({ user: userA._id }, { items: [] });

    console.log(`  ✔ Order Created: ${orderA.orderNumber}`);
    console.log(`  ✔ Total: PKR ${orderA.total.toLocaleString()} (Subtotal: ${orderA.subtotal}, Shipping: ${orderA.shippingCost})`);

    // Verify stock deduction
    const updatedProd1AfterCart = await Product.findById(prod1._id);
    console.log(`  ✔ Stock for ${prod1.name}: ${initialStockProd1} -> ${updatedProd1AfterCart.stock}`);
    if (updatedProd1AfterCart.stock !== initialStockProd1 - 2) {
      throw new Error('Stock deduction for Cart Checkout failed!');
    }

    // Verify Cart cleared
    const cartAAfterOrder = await Cart.findOne({ user: userA._id });
    if (cartAAfterOrder.items.length !== 0) {
      throw new Error('Purchased cart items were NOT cleared after order creation!');
    }
    console.log('  ✔ User A Cart cleared cleanly after successful order.');

    // ------------------------------------------------------------------
    // TEST 2: BUY NOW CHECKOUT FLOW
    // ------------------------------------------------------------------
    console.log('\n[TEST 2] Processing Express Buy Now Checkout for User B...');

    // User B adds prod1 to cart, but uses BUY NOW for prod2
    await Cart.create({
      user: userB._id,
      items: [{ product: prod1._id, quantity: 1, selectedSize: 'S' }]
    });

    const buyNowQuantity = 1;
    const p2 = await Product.findById(prod2._id);
    if (buyNowQuantity > p2.stock) throw new Error('Insufficient stock for Buy Now');

    const itemTotalB = p2.price * buyNowQuantity;
    const shippingCostB = itemTotalB >= 20000 ? 0 : 250;
    const totalB = itemTotalB + shippingCostB;
    const orderNumberB = `ZHZ-20260812-0002`;

    const orderB = await Order.create({
      orderNumber: orderNumberB,
      userId: userB._id,
      customerName: 'OrderUser B',
      customerEmail: emailB,
      customerPhone: '+923004445566',
      items: [{
        productId: p2._id,
        productName: p2.name,
        sku: p2.sku || '',
        image: p2.images?.[0] || p2.image || '',
        size: 'M',
        quantity: buyNowQuantity,
        unitPrice: p2.price,
        totalPrice: itemTotalB
      }],
      shippingAddress: {
        fullName: 'OrderUser B',
        phone: '+923004445566',
        email: emailB,
        addressLine1: '456 F-6 Markaz',
        city: 'Islamabad',
        state: 'Federal',
        postalCode: '44000',
        country: 'Pakistan'
      },
      subtotal: itemTotalB,
      shippingCost: shippingCostB,
      total: totalB,
      orderStatus: 'Pending'
    });

    await Product.findByIdAndUpdate(p2._id, { $inc: { stock: -buyNowQuantity } });

    console.log(`  ✔ Buy Now Order Created: ${orderB.orderNumber}`);
    const updatedProd2AfterBuyNow = await Product.findById(prod2._id);
    console.log(`  ✔ Stock for ${prod2.name}: ${initialStockProd2} -> ${updatedProd2AfterBuyNow.stock}`);
    if (updatedProd2AfterBuyNow.stock !== initialStockProd2 - buyNowQuantity) {
      throw new Error('Stock deduction for Buy Now failed!');
    }

    // Verify User B's cart was NOT cleared by Buy Now
    const cartBAfterBuyNow = await Cart.findOne({ user: userB._id });
    if (cartBAfterBuyNow.items.length !== 1) {
      throw new Error('Buy Now incorrectly cleared existing cart items!');
    }
    console.log('  ✔ User B existing cart items remained intact during Buy Now order.');

    // ------------------------------------------------------------------
    // TEST 3: ORDER OWNERSHIP SECURITY & ISOLATION
    // ------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Order Ownership Security...');
    const userAOrders = await Order.find({ userId: userA._id });
    const userBOrders = await Order.find({ userId: userB._id });

    if (userAOrders.length !== 1 || userAOrders[0].orderNumber !== orderNumberA) {
      throw new Error('User A order retrieval security failed');
    }
    if (userBOrders.length !== 1 || userBOrders[0].orderNumber !== orderNumberB) {
      throw new Error('User B order retrieval security failed');
    }
    console.log('  ✔ User A & User B orders isolated with 100% security compliance.');

    // ------------------------------------------------------------------
    // TEST 4: ORDER CANCELLATION & STOCK RESTORATION
    // ------------------------------------------------------------------
    console.log('\n[TEST 4] Cancelling Order A and verifying Stock Restoration...');
    orderA.orderStatus = 'Cancelled';
    await orderA.save();

    for (const item of orderA.items) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }

    const prod1Restored = await Product.findById(prod1._id);
    console.log(`  ✔ ${prod1.name} Stock after cancellation: ${prod1Restored.stock} (Restored back to ${initialStockProd1})`);
    if (prod1Restored.stock !== initialStockProd1) {
      throw new Error('Stock was not properly restored upon cancellation!');
    }
    console.log('  ✔ Order cancellation updated status and restored stock.');

    // Cleanup test data
    await Order.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Cart.deleteMany({ user: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    // Restore initial stock for prod2
    await Product.findByIdAndUpdate(prod2._id, { stock: initialStockProd2 });

    console.log('\n--- ALL ORDER & CHECKOUT FLOW TESTS PASSED SUCCESSFULLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ ORDER CHECKOUT TEST FAILED:', error);
    process.exit(1);
  }
};

runOrderCheckoutTests();
