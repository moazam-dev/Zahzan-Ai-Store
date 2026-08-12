import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import User from '../models/User.js';

// Helper function to generate human-readable unique order number: ZHZ-YYYYMMDD-XXXX
const generateOrderNumber = async () => {
  const dateObj = new Date();
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const prefix = `ZHZ-${dateStr}-`;
  
  // Find latest order for today
  const latestOrder = await Order.findOne({
    orderNumber: new RegExp(`^${prefix}`)
  }).sort({ createdAt: -1 });

  let sequence = 1;
  if (latestOrder && latestOrder.orderNumber) {
    const parts = latestOrder.orderNumber.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
  }

  const seqStr = String(sequence).padStart(4, '0');
  return `${prefix}${seqStr}`;
};

// @desc    Create a new order (Cart Checkout or Buy Now)
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    const {
      customerInfo,
      shippingAddress,
      isBuyNow,
      buyNowItem
    } = req.body;

    // 1. Validate Customer Info
    const customerName = customerInfo?.fullName || `${req.user.firstName} ${req.user.lastName}`.trim();
    const customerEmail = customerInfo?.email || req.user.email;
    const customerPhone = customerInfo?.phone || req.user.phone || shippingAddress?.phone;

    if (!customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, email, and phone number are required.'
      });
    }

    // 2. Validate Shipping Address
    if (
      !shippingAddress ||
      !shippingAddress.fullName ||
      !shippingAddress.phone ||
      !shippingAddress.addressLine1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.postalCode ||
      !shippingAddress.country
    ) {
      return res.status(400).json({
        success: false,
        message: 'Complete shipping address is required (fullName, phone, addressLine1, city, state, postalCode, country).'
      });
    }

    // Prepare permanent shipping address snapshot
    const shippingSnapshot = {
      fullName: shippingAddress.fullName.trim(),
      phone: shippingAddress.phone.trim(),
      email: shippingAddress.email ? shippingAddress.email.trim() : customerEmail,
      addressLine1: shippingAddress.addressLine1.trim(),
      addressLine2: shippingAddress.addressLine2 ? shippingAddress.addressLine2.trim() : '',
      city: shippingAddress.city.trim(),
      state: shippingAddress.state.trim(),
      postalCode: shippingAddress.postalCode.trim(),
      country: shippingAddress.country.trim(),
      deliveryInstructions: shippingAddress.deliveryInstructions ? shippingAddress.deliveryInstructions.trim() : ''
    };

    let itemsToProcess = [];

    // 3. Process Buy Now vs Cart Items
    if (isBuyNow) {
      if (!buyNowItem || !buyNowItem.productId) {
        return res.status(400).json({
          success: false,
          message: 'Buy Now product details are missing.'
        });
      }

      const quantity = Math.max(1, Number(buyNowItem.quantity) || 1);
      itemsToProcess.push({
        productId: buyNowItem.productId,
        quantity,
        selectedSize: buyNowItem.selectedSize || 'M',
        selectedColor: buyNowItem.selectedColor || ''
      });
    } else {
      // Cart Checkout: Fetch user's cart from database
      const cart = await Cart.findOne({ user: req.user._id });
      if (!cart || !cart.items || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Your cart is empty. Cannot process order.'
        });
      }

      itemsToProcess = cart.items.map((item) => ({
        productId: item.product,
        quantity: item.quantity,
        selectedSize: item.selectedSize || 'M',
        selectedColor: item.selectedColor || ''
      }));
    }

    // 4. Server-Side Validation & Authoritative Price/Stock Calculation
    let orderItems = [];
    let subtotal = 0;
    let stockUpdates = [];

    for (const itemReq of itemsToProcess) {
      const product = await Product.findById(itemReq.productId);

      if (!product || !product.isActive) {
        return res.status(404).json({
          success: false,
          message: `Product "${itemReq.productId}" is not available.`
        });
      }

      // Check stock availability
      if (itemReq.quantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available stock is ${product.stock}, but ${itemReq.quantity} was requested.`
        });
      }

      // Authoritative database price (NEVER trust client price)
      const unitPrice = product.price;
      const itemTotalPrice = unitPrice * itemReq.quantity;
      subtotal += itemTotalPrice;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku || '',
        image: product.images?.[0] || product.image || '',
        color: itemReq.selectedColor || product.color || '',
        size: itemReq.selectedSize || 'M',
        quantity: itemReq.quantity,
        unitPrice,
        totalPrice: itemTotalPrice
      });

      stockUpdates.push({
        productId: product._id,
        deductQty: itemReq.quantity
      });
    }

    // 5. Calculate Shipping Cost & Total
    // Standard nationwide shipping: Free above PKR 20,000, else PKR 250
    const shippingCost = subtotal >= 20000 ? 0 : 250;
    const total = subtotal + shippingCost;

    // 6. Generate Unique Order Number
    const orderNumber = await generateOrderNumber();

    // 7. Create Order Record
    const order = await Order.create({
      orderNumber,
      userId: req.user._id,
      customerName,
      customerEmail,
      customerPhone,
      items: orderItems,
      shippingAddress: shippingSnapshot,
      subtotal,
      shippingCost,
      total,
      paymentStatus: 'pending',
      orderStatus: 'Pending'
    });

    // 8. Deduct Stock from Products in Database
    for (const update of stockUpdates) {
      await Product.findByIdAndUpdate(update.productId, {
        $inc: { stock: -update.deductQty }
      });
    }

    // 9. Clear Purchased Items from Cart if Cart Checkout
    if (!isBuyNow) {
      const cart = await Cart.findOne({ user: req.user._id });
      if (cart) {
        cart.items = [];
        await cart.save();
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to create order: ${error.message}`
    });
  }
};

// @desc    Get authenticated user's order history
// @route   GET /api/orders (or /api/orders/my-orders)
// @access  Private
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to fetch orders: ${error.message}`
    });
  }
};

// @desc    Get order by ID or order number (Ownership / Admin check enforced)
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    let order;

    if (mongoose.Types.ObjectId.isValid(id)) {
      order = await Order.findById(id);
    }

    if (!order) {
      order = await Order.findOne({ orderNumber: id.toUpperCase() });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify ownership or admin access
    const isOwner = order.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this order.'
      });
    }

    return res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to fetch order: ${error.message}`
    });
  }
};

// @desc    Cancel order (Only if status is Pending or Confirmed)
// @route   PATCH /api/orders/:id/cancel
// @access  Private
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    let order;

    if (mongoose.Types.ObjectId.isValid(id)) {
      order = await Order.findById(id);
    }

    if (!order) {
      order = await Order.findOne({ orderNumber: id.toUpperCase() });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify ownership
    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this order.'
      });
    }

    // Verify status transition rule: Only Pending or Confirmed orders can be cancelled
    const currentStatus = (order.orderStatus || '').toLowerCase();
    if (currentStatus !== 'pending' && currentStatus !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is already in "${order.orderStatus}" status.`
      });
    }

    order.orderStatus = 'Cancelled';
    await order.save();

    // Restore stock to products
    for (const item of order.items) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity }
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to cancel order: ${error.message}`
    });
  }
};
