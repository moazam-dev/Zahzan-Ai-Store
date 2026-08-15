import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Address from '../models/Address.js';
import Payment from '../models/Payment.js';
import NewsletterSubscriber from '../models/NewsletterSubscriber.js';
import AuditLog from '../models/AuditLog.js';
import { generateToken } from '../utils/jwt.js';
import { recordAuditLog } from '../utils/auditLogger.js';
import { sendCustomerPaymentVerifiedEmail, sendCustomerOrderStatusEmail } from '../services/emailService.js';

// @desc    Admin Dedicated Login
// @route   POST /api/admin/auth/login
// @access  Public
export const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Account does not have administrator privileges'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Administrator account is deactivated'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials'
      });
    }

    const token = generateToken(user._id);

    await recordAuditLog({
      adminId: user._id,
      action: 'ADMIN_LOGIN',
      entity: 'User',
      entityId: user._id.toString(),
      ipAddress: req.ip || ''
    });

    return res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current admin profile
// @route   GET /api/admin/auth/me
// @access  Private (Admin)
export const getAdminProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      name: `${req.user.firstName} ${req.user.lastName}`.trim(),
      email: req.user.email,
      role: req.user.role
    }
  });
};

// @desc    Get Dashboard statistics computed from real database records
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
export const getAdminDashboardStats = async (req, res, next) => {
  try {
    // 1. Orders breakdown
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'Pending' });
    const confirmedOrders = await Order.countDocuments({ orderStatus: 'Confirmed' });
    const processingOrders = await Order.countDocuments({ orderStatus: 'Processing' });
    const shippedOrders = await Order.countDocuments({ orderStatus: 'Shipped' });
    const deliveredOrders = await Order.countDocuments({ orderStatus: 'Delivered' });
    const cancelledOrders = await Order.countDocuments({ orderStatus: 'Cancelled' });

    // 2. Revenue calculation (sum of total for non-cancelled orders)
    const revenueAggregation = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].totalRevenue : 0;

    // 3. Customers count
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const recentCustomers = await User.find({ role: 'customer' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName email createdAt phone');

    // 4. Product / Inventory statistics
    const totalProducts = await Product.countDocuments({ isActive: true });
    const lowStockProducts = await Product.find({ isActive: true, stock: { $lte: 3 } })
      .select('name sku price stock image images category');
    const lowStockCount = lowStockProducts.filter((p) => p.stock > 0).length;
    const outOfStockCount = lowStockProducts.filter((p) => p.stock === 0).length;

    // 5. Newsletter statistics
    const totalSubscribers = await NewsletterSubscriber.countDocuments({ status: 'subscribed' });

    // 6. Payment statistics
    const pendingPaymentsCount = await Payment.countDocuments({ status: 'Pending' });
    const verifiedPaymentsCount = await Payment.countDocuments({ status: 'Verified' });
    const rejectedPaymentsCount = await Payment.countDocuments({ status: 'Rejected' });
    const verifiedPaymentSumAgg = await Payment.aggregate([
      { $match: { status: 'Verified' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const verifiedPaymentAmount = verifiedPaymentSumAgg.length > 0 ? verifiedPaymentSumAgg[0].total : 0;

    // 7. Recent orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);

    return res.status(200).json({
      success: true,
      stats: {
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          confirmed: confirmedOrders,
          processing: processingOrders,
          shipped: shippedOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders
        },
        revenue: totalRevenue,
        customers: {
          total: totalCustomers,
          recent: recentCustomers
        },
        inventory: {
          totalProducts,
          lowStockCount,
          outOfStockCount,
          lowStockProducts
        },
        payments: {
          pending: pendingPaymentsCount,
          verified: verifiedPaymentsCount,
          rejected: rejectedPaymentsCount,
          verifiedAmount: verifiedPaymentAmount
        },
        newsletter: {
          totalSubscribers
        },
        recentOrders
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all orders with pagination & search
// @route   GET /api/admin/orders
// @access  Private (Admin)
export const getAllOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.orderStatus = new RegExp(`^${status}$`, 'i');
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerEmail: searchRegex },
        { customerPhone: searchRegex }
      ];
    }

    const total = await Order.countDocuments(query);
    const rawOrders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Attach linked payment records to orders
    const orders = await Promise.all(
      rawOrders.map(async (ord) => {
        const ordObj = ord.toObject();
        const payment = await Payment.findOne({ orderId: ord._id }).sort({ createdAt: -1 });
        ordObj.payment = payment || null;
        return ordObj;
      })
    );

    return res.status(200).json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      orders
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get order details by ID or order number
// @route   GET /api/admin/orders/:id
// @access  Private (Admin)
export const getAdminOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let orderDoc;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      orderDoc = await Order.findById(id);
    }
    if (!orderDoc) {
      orderDoc = await Order.findOne({ orderNumber: id.toUpperCase() });
    }

    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orderDoc.toObject();
    const payment = await Payment.findOne({ orderId: orderDoc._id }).sort({ createdAt: -1 });
    order.payment = payment || null;

    return res.status(200).json({
      success: true,
      order,
      payment: payment || null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Order Status
// @route   PATCH /api/admin/orders/:id/status
// @access  Private (Admin)
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!orderStatus || !validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid order status. Allowed: ${validStatuses.join(', ')}`
      });
    }

    let order = await Order.findById(id);
    if (!order) {
      order = await Order.findOne({ orderNumber: id.toUpperCase() });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const previousStatus = order.orderStatus;
    order.orderStatus = orderStatus;
    await order.save();

    // If status changed to Cancelled from a non-cancelled state, restore product stock
    if (orderStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
      for (const item of order.items) {
        if (item.productId) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: item.quantity }
          });
        }
      }
    }

    await recordAuditLog({
      adminId: req.user._id,
      action: 'ORDER_STATUS_CHANGED',
      entity: 'Order',
      entityId: order._id.toString(),
      ipAddress: req.ip || '',
      metadata: { orderNumber: order.orderNumber, previousStatus, newStatus: orderStatus }
    });

    // Dispatch status update email if status actually changed
    if (previousStatus !== orderStatus) {
      sendCustomerOrderStatusEmail(order, orderStatus, {
        courier: req.body.courier,
        trackingNumber: req.body.trackingNumber
      }).catch((emailErr) => {
        console.warn('Warning: Order status email dispatch error:', emailErr.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${orderStatus}`,
      order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all registered customers with pagination & search
// @route   GET /api/admin/customers
// @access  Private (Admin)
export const getAllUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const { search } = req.query;
    const query = { role: 'customer' };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }

    const total = await User.countDocuments(query);
    const customers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      customers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer details & order history
// @route   GET /api/admin/customers/:id
// @access  Private (Admin)
export const getAdminCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = await User.findById(id).select('-password');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const addresses = await Address.find({ userId: customer._id });
    const orders = await Order.find({ userId: customer._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      customer,
      addresses,
      orders
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle Customer Active Status
// @route   PATCH /api/admin/customers/:id/status
// @access  Private (Admin)
export const updateCustomerStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const customer = await User.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    customer.isActive = Boolean(isActive);
    await customer.save();

    await recordAuditLog({
      adminId: req.user._id,
      action: 'CUSTOMER_STATUS_UPDATED',
      entity: 'User',
      entityId: customer._id.toString(),
      ipAddress: req.ip || '',
      metadata: { isActive: customer.isActive }
    });

    return res.status(200).json({
      success: true,
      message: `Customer account ${customer.isActive ? 'activated' : 'deactivated'} successfully`,
      customer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all products (Admin List with status filter)
// @route   GET /api/admin/products
// @access  Private (Admin)
export const getAdminProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const { search, category, status } = req.query;
    const query = {};

    if (category && category !== 'all') {
      query.category = new RegExp(`^${category}$`, 'i');
    }

    if (status && status !== 'all') {
      if (status === 'active') query.isActive = true;
      if (status === 'deactivated' || status === 'inactive') query.isActive = false;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { description: searchRegex }
      ];
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      products
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new product
// @route   POST /api/admin/products
// @access  Private (Admin)
export const createAdminProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      sku,
      category,
      stock,
      sizes,
      colors,
      color,
      fabric,
      work,
      careInstructions,
      images,
      image,
      hoverImage
    } = req.body;

    if (!name || price === undefined || !sku || !category || stock === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, SKU, category, and stock are required fields.'
      });
    }

    const formattedSku = sku.trim().toUpperCase();
    const existingSku = await Product.findOne({ sku: formattedSku });
    if (existingSku) {
      return res.status(400).json({
        success: false,
        message: `Product with SKU "${formattedSku}" already exists in database.`
      });
    }

    const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = `${baseSlug}-${formattedSku.toLowerCase()}`;

    const existingSlug = await Product.findOne({ slug });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const imagesArray = Array.isArray(images) && images.length > 0
      ? images
      : [image || 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'];

    // Format colors array to match colorVariantSchema [{ name, hex, image }]
    let formattedColors = [];
    if (Array.isArray(colors)) {
      formattedColors = colors.map(c => typeof c === 'string' ? { name: c, hex: '#FFFFFF', image: imagesArray[0] } : c);
    } else if (color) {
      formattedColors = [{ name: color, hex: '#FFFFFF', image: imagesArray[0] }];
    } else {
      formattedColors = [{ name: 'Ivory', hex: '#FFFFFF', image: imagesArray[0] }];
    }

    const product = await Product.create({
      name: name.trim(),
      slug,
      description: description ? description.trim() : '',
      price: Number(price),
      sku: formattedSku,
      category: category.trim(),
      stock: Number(stock),
      sizes: Array.isArray(sizes) ? sizes : ['S', 'M', 'L', 'XL'],
      colors: formattedColors,
      color: color || (formattedColors[0] ? formattedColors[0].name : 'Ivory'),
      fabric: fabric || 'Pure Silk',
      work: work || 'Hand Embroidery',
      careInstructions: Array.isArray(careInstructions) ? careInstructions : ['Dry clean only'],
      images: imagesArray,
      image: imagesArray[0],
      hoverImage: hoverImage || imagesArray[1] || imagesArray[0],
      isActive: true
    });

    await recordAuditLog({
      adminId: req.user._id,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: product._id.toString(),
      ipAddress: req.ip || '',
      metadata: { name: product.name, sku: product.sku, price: product.price, stock: product.stock }
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update existing product
// @route   PUT /api/admin/products/:id
// @access  Private (Admin)
export const updateAdminProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const prevStock = product.stock;
    const prevPrice = product.price;

    const fields = ['name', 'description', 'price', 'sku', 'category', 'stock', 'sizes', 'color', 'fabric', 'work', 'careInstructions', 'images', 'image', 'hoverImage', 'isActive'];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    if (req.body.colors) {
      if (Array.isArray(req.body.colors)) {
        product.colors = req.body.colors.map(c => typeof c === 'string' ? { name: c, hex: '#FFFFFF' } : c);
      }
    }

    if (req.body.name || req.body.sku) {
      const baseSlug = (product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      product.slug = `${baseSlug}-${(product.sku || '').toLowerCase()}`;
    }

    if (product.images && product.images.length > 0) {
      product.image = product.images[0];
      product.hoverImage = product.images[1] || product.images[0];
    }

    await product.save();

    const actionName = prevStock !== product.stock ? 'STOCK_UPDATED' : 'PRODUCT_UPDATED';

    await recordAuditLog({
      adminId: req.user._id,
      action: actionName,
      entity: 'Product',
      entityId: product._id.toString(),
      ipAddress: req.ip || '',
      metadata: { name: product.name, prevPrice, newPrice: product.price, prevStock, newStock: product.stock }
    });

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle product active status (Activate / Deactivate)
// @route   PATCH /api/admin/products/:id/status
// @access  Private (Admin)
export const toggleAdminProductStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const newStatus = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !product.isActive;
    product.isActive = newStatus;
    await product.save();

    await recordAuditLog({
      adminId: req.user._id,
      action: newStatus ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
      entity: 'Product',
      entityId: product._id.toString(),
      ipAddress: req.ip || '',
      metadata: { name: product.name, sku: product.sku, isActive: newStatus }
    });

    return res.status(200).json({
      success: true,
      message: `Product ${newStatus ? 'activated' : 'deactivated'} successfully`,
      product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product (Soft Deactivate or Permanent Delete)
// @route   DELETE /api/admin/products/:id
// @access  Private (Admin)
export const deleteAdminProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isPermanent = req.query.permanent === 'true' || req.body.permanent === true;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (isPermanent) {
      await Product.findByIdAndDelete(id);

      await recordAuditLog({
        adminId: req.user._id,
        action: 'PRODUCT_PERMANENTLY_DELETED',
        entity: 'Product',
        entityId: id,
        ipAddress: req.ip || '',
        metadata: { name: product.name, sku: product.sku }
      });

      return res.status(200).json({
        success: true,
        message: 'Product permanently deleted from database'
      });
    }

    // Default Soft Delete / Deactivate
    product.isActive = false;
    await product.save();

    await recordAuditLog({
      adminId: req.user._id,
      action: 'PRODUCT_DEACTIVATED',
      entity: 'Product',
      entityId: product._id.toString(),
      ipAddress: req.ip || '',
      metadata: { name: product.name, sku: product.sku }
    });

    return res.status(200).json({
      success: true,
      message: 'Product deactivated successfully',
      product
    });
  } catch (error) {
    next(error);
  }
};



// @desc    Get Audit Logs
// @route   GET /api/admin/audit-logs
// @access  Private (Admin)
export const getAdminAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const { action } = req.query;
    const query = {};

    if (action && action !== 'all') {
      query.action = new RegExp(`^${action}$`, 'i');
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('adminId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      logs
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get All Payments (Admin)
// @route   GET /api/admin/payments
// @access  Private (Admin)
export const getAdminPayments = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 15);
    const skip = (page - 1) * limit;

    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = new RegExp(`^${status}$`, 'i');
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const matchingOrders = await Order.find({
        $or: [{ orderNumber: searchRegex }, { customerEmail: searchRegex }]
      }).select('_id');
      const orderIds = matchingOrders.map((o) => o._id);

      query.$or = [
        { transactionReference: searchRegex },
        { orderId: { $in: orderIds } }
      ];
    }

    const total = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
      .populate('orderId', 'orderNumber total orderStatus paymentStatus items shippingAddress')
      .populate('userId', 'firstName lastName email phone')
      .populate('verifiedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      payments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Payment By ID (Admin)
// @route   GET /api/admin/payments/:id
// @access  Private (Admin)
export const getAdminPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id)
      .populate('orderId')
      .populate('userId', 'firstName lastName email phone')
      .populate('verifiedBy', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    return res.status(200).json({
      success: true,
      payment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Payment Proof (Admin)
// @route   PATCH /api/admin/payments/:id/verify
// @access  Private (Admin)
export const verifyAdminPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id);

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    // Concurrency / Status check: Ensure payment is currently Pending
    if (payment.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Payment has already been processed and is currently "${payment.status}".`
      });
    }

    payment.status = 'Verified';
    payment.verifiedBy = req.user._id;
    payment.verifiedAt = new Date();
    await payment.save();

    // Update associated Order status
    const order = await Order.findById(payment.orderId);
    if (order) {
      order.paymentStatus = 'verified';
      if (order.orderStatus === 'Pending') {
        order.orderStatus = 'Confirmed';
      }
      await order.save();
    }

    await recordAuditLog({
      adminId: req.user._id,
      action: 'PAYMENT_VERIFIED',
      entity: 'Payment',
      entityId: payment._id.toString(),
      ipAddress: req.ip || '',
      metadata: {
        orderId: order ? order._id.toString() : '',
        orderNumber: order ? order.orderNumber : '',
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        transactionReference: payment.transactionReference
      }
    });

    if (order) {
      Promise.all([
        sendCustomerPaymentVerifiedEmail(order, payment),
        sendCustomerOrderStatusEmail(order, 'Confirmed')
      ]).catch((emailErr) => {
        console.warn('Warning: Payment verified email dispatch error:', emailErr.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      payment,
      order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject Payment Proof (Admin)
// @route   PATCH /api/admin/payments/:id/reject
// @access  Private (Admin)
export const rejectAdminPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A rejection reason is required (e.g. Invalid reference ID, incorrect amount, unclear receipt).'
      });
    }

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    // Concurrency / Status check: Ensure payment is currently Pending
    if (payment.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Payment has already been processed and is currently "${payment.status}".`
      });
    }

    payment.status = 'Rejected';
    payment.rejectionReason = rejectionReason.trim();
    payment.verifiedBy = req.user._id;
    payment.verifiedAt = new Date();
    await payment.save();

    // Update associated Order status
    const order = await Order.findById(payment.orderId);
    if (order) {
      order.paymentStatus = 'rejected';
      await order.save();
    }

    await recordAuditLog({
      adminId: req.user._id,
      action: 'PAYMENT_REJECTED',
      entity: 'Payment',
      entityId: payment._id.toString(),
      ipAddress: req.ip || '',
      metadata: {
        orderId: order ? order._id.toString() : '',
        orderNumber: order ? order.orderNumber : '',
        rejectionReason: payment.rejectionReason
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Payment rejected',
      payment,
      order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Newsletter Subscribers List (Admin)
// @route   GET /api/admin/newsletter/subscribers
// @access  Private (Admin)
export const getAdminNewsletterSubscribers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    if (search) {
      query.email = new RegExp(search.trim(), 'i');
    }

    const total = await NewsletterSubscriber.countDocuments(query);
    const subscribers = await NewsletterSubscriber.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate real database stats
    const totalSubscribers = await NewsletterSubscriber.countDocuments({});
    const activeSubscribers = await NewsletterSubscriber.countDocuments({ status: 'subscribed' });
    const unsubscribedSubscribers = await NewsletterSubscriber.countDocuments({ status: 'unsubscribed' });

    return res.status(200).json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalSubscribers,
        activeSubscribers,
        unsubscribedSubscribers
      },
      subscribers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export Newsletter Subscribers as CSV (Admin)
// @route   GET /api/admin/newsletter/export
// @access  Private (Admin)
export const exportAdminNewsletterSubscribers = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    if (search) {
      query.email = new RegExp(search.trim(), 'i');
    }

    const subscribers = await NewsletterSubscriber.find(query).sort({ subscribedAt: -1 });

    // Generate CSV Header & Rows
    let csvContent = 'Email,Status,Source,Subscribed Date,Unsubscribed Date\n';
    
    subscribers.forEach((sub) => {
      const email = `"${sub.email.replace(/"/g, '""')}"`;
      const subStatus = sub.status;
      const source = `"${(sub.source || 'footer').replace(/"/g, '""')}"`;
      const subDate = sub.subscribedAt ? `"${new Date(sub.subscribedAt).toISOString()}"` : '""';
      const unsubDate = sub.unsubscribedAt ? `"${new Date(sub.unsubscribedAt).toISOString()}"` : '""';
      
      csvContent += `${email},${subStatus},${source},${subDate},${unsubDate}\n`;
    });

    await recordAuditLog({
      adminId: req.user._id,
      action: 'NEWSLETTER_EXPORT',
      entity: 'NewsletterSubscriber',
      ipAddress: req.ip || '',
      metadata: { recordCount: subscribers.length, filterStatus: status || 'all' }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="zahzan_newsletter_subscribers_${Date.now()}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

