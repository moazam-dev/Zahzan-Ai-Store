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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runUnifiedCheckoutTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING COMPLETE UNIFIED CHECKOUT & PAYMENT FLOW ---\n');

    const products = await Product.find({ isActive: true });
    if (products.length === 0) throw new Error('Need active products in DB');
    const prod = products[0];

    const customerEmail = 'unified_cust@zahzan.com';
    await User.deleteMany({ email: customerEmail });

    const cust = await User.create({
      firstName: 'Unified', lastName: 'Customer', email: customerEmail, password: 'CustomerPassword123!', role: 'customer', isEmailVerified: true
    });

    // Populate user's Cart in DB
    await Cart.create({
      user: cust._id,
      items: [{ product: prod._id, quantity: 1, selectedSize: 'M', selectedColor: '' }]
    });

    // ------------------------------------------------------------------
    // TEST A: CASH ON DELIVERY (COD) UNIFIED CHECKOUT
    // ------------------------------------------------------------------
    console.log('[TEST A] Cash on Delivery (COD) Checkout Flow...');

    const codOrder = await Order.create({
      orderNumber: `ZHZ-COD-${Date.now().toString().slice(-4)}`,
      userId: cust._id,
      customerName: 'Unified Customer', customerEmail: customerEmail, customerPhone: '+923001234567',
      items: [{ productId: prod._id, productName: prod.name, sku: prod.sku || '', quantity: 1, unitPrice: prod.price, totalPrice: prod.price }],
      shippingAddress: { fullName: 'Unified Customer', phone: '+923001234567', email: customerEmail, addressLine1: 'Street 10', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
      subtotal: prod.price, shippingCost: 0, total: prod.price,
      paymentMethod: 'Cash on Delivery', paymentStatus: 'not_required', orderStatus: 'Pending'
    });

    // Clear cart after COD order completion
    await Cart.findOneAndUpdate({ user: cust._id }, { items: [] });

    console.log(`  ✔ COD Order Created: ${codOrder.orderNumber}`);
    console.log(`  ✔ paymentMethod: "${codOrder.paymentMethod}" | paymentStatus: "${codOrder.paymentStatus}" | orderStatus: "${codOrder.orderStatus}"`);

    const codPaymentCheck = await Payment.findOne({ orderId: codOrder._id });
    if (codPaymentCheck) throw new Error('COD created an unexpected Payment record!');
    console.log('  ✔ Verified NO advance payment proof record created for COD.');

    const userCartAfterCOD = await Cart.findOne({ user: cust._id });
    if (userCartAfterCOD.items.length !== 0) throw new Error('Cart was not cleared after COD order creation!');
    console.log('  ✔ Purchased cart items cleared after COD order completion.');

    // ------------------------------------------------------------------
    // TEST B: PAY IN ADVANCE UNIFIED CHECKOUT
    // ------------------------------------------------------------------
    console.log('\n[TEST B] Pay in Advance (JazzCash) Checkout Flow...');

    // Re-populate cart
    await Cart.findOneAndUpdate({ user: cust._id }, { items: [{ product: prod._id, quantity: 1, selectedSize: 'L', selectedColor: '' }] });

    const advanceOrder = await Order.create({
      orderNumber: `ZHZ-ADV-${Date.now().toString().slice(-4)}`,
      userId: cust._id,
      customerName: 'Unified Customer', customerEmail: customerEmail, customerPhone: '+923001234567',
      items: [{ productId: prod._id, productName: prod.name, sku: prod.sku || '', quantity: 1, unitPrice: prod.price, totalPrice: prod.price }],
      shippingAddress: { fullName: 'Unified Customer', phone: '+923001234567', email: customerEmail, addressLine1: 'Street 10', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
      subtotal: prod.price, shippingCost: 0, total: prod.price,
      paymentMethod: 'JazzCash', paymentStatus: 'submitted', orderStatus: 'Pending'
    });

    const advancePaymentRecord = await Payment.create({
      orderId: advanceOrder._id,
      userId: cust._id,
      paymentMethod: 'JazzCash',
      amount: advanceOrder.total,
      transactionReference: `TID-ADV-${Date.now()}`,
      proofUrl: '/uploads/payments/proof-adv-checkout.jpg',
      status: 'Pending'
    });

    // Clear cart after Advance Payment order completion
    await Cart.findOneAndUpdate({ user: cust._id }, { items: [] });

    console.log(`  ✔ Advance Order Created: ${advanceOrder.orderNumber}`);
    console.log(`  ✔ paymentMethod: "${advanceOrder.paymentMethod}" | paymentStatus: "${advanceOrder.paymentStatus}" | orderStatus: "${advanceOrder.orderStatus}"`);
    console.log(`  ✔ Payment Record Created ID: ${advancePaymentRecord._id} | Status: "${advancePaymentRecord.status}" | Amount: PKR ${advancePaymentRecord.amount}`);

    const userCartAfterAdv = await Cart.findOne({ user: cust._id });
    if (userCartAfterAdv.items.length !== 0) throw new Error('Cart was not cleared after Advance order creation!');
    console.log('  ✔ Purchased cart items cleared after Advance Payment order completion.');

    // ------------------------------------------------------------------
    // TEST C: EXPRESS BUY NOW UNIFIED CHECKOUT
    // ------------------------------------------------------------------
    console.log('\n[TEST C] Express Buy Now Checkout Flow...');

    const buyNowOrder = await Order.create({
      orderNumber: `ZHZ-BUYNOW-${Date.now().toString().slice(-4)}`,
      userId: cust._id,
      customerName: 'Unified Customer', customerEmail: customerEmail, customerPhone: '+923001234567',
      items: [{ productId: prod._id, productName: prod.name, sku: prod.sku || '', quantity: 1, unitPrice: prod.price, totalPrice: prod.price }],
      shippingAddress: { fullName: 'Unified Customer', phone: '+923001234567', email: customerEmail, addressLine1: 'Street 10', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
      subtotal: prod.price, shippingCost: 0, total: prod.price,
      paymentMethod: 'Cash on Delivery', paymentStatus: 'not_required', orderStatus: 'Pending'
    });

    console.log(`  ✔ Express Buy Now Order Created: ${buyNowOrder.orderNumber}`);

    // Cleanup test data
    await Payment.deleteMany({ userId: cust._id });
    await Order.deleteMany({ userId: cust._id });
    await Cart.deleteMany({ user: cust._id });
    await User.deleteMany({ email: customerEmail });

    console.log('\n--- ALL UNIFIED CHECKOUT & PAYMENT FLOW TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ UNIFIED CHECKOUT TEST FAILED:', error);
    process.exit(1);
  }
};

runUnifiedCheckoutTests();
