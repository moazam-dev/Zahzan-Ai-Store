import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import { PAYMENT_METHODS } from '../config/paymentMethods.js';
import { uploadPaymentProofToCloudinary, deletePaymentProofFromCloudinary } from '../utils/cloudinary.js';
import { sendAdminPaymentProofEmail } from '../services/emailService.js';

// @desc    Get active payment methods config
// @route   GET /api/payments/methods
// @access  Public / Authenticated
export const getPaymentMethods = async (req, res) => {
  return res.status(200).json({
    success: true,
    methods: PAYMENT_METHODS
  });
};

// @desc    Submit payment proof for an order
// @route   POST /api/payments
// @access  Private (Customer)
export const submitPaymentProof = async (req, res, next) => {
  try {
    const { orderId, paymentMethod, transactionReference } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required.' });
    }

    if (!paymentMethod) {
      return res.status(400).json({ success: false, message: 'Payment method selection is required.' });
    }

    if (!transactionReference || !transactionReference.trim()) {
      return res.status(400).json({ success: false, message: 'Transaction reference ID is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Payment proof screenshot or receipt file is required.' });
    }

    // 1. Retrieve Order from Database & Verify Ownership
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to submit payment for this order.'
      });
    }

    // 2. Verify Order Eligibility
    if (order.orderStatus === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot submit payment for a cancelled order.'
      });
    }

    if (order.paymentStatus === 'verified') {
      return res.status(400).json({
        success: false,
        message: 'Payment for this order has already been verified.'
      });
    }

    // 3. Duplicate Transaction Reference Protection
    const trimmedRef = transactionReference.trim().toUpperCase();
    const existingRefPayment = await Payment.findOne({
      transactionReference: new RegExp(`^${trimmedRef}$`, 'i'),
      status: { $in: ['Pending', 'Verified'] }
    });

    if (existingRefPayment && existingRefPayment.orderId.toString() !== orderId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'This transaction reference ID has already been submitted for another payment. Please check your transaction details.'
      });
    }

    // 4. Authoritative Amount from Database Order
    const amount = order.total;

    // 5. Upload File to Cloudinary
    const uploadResult = await uploadPaymentProofToCloudinary(req.file.path, order.orderNumber);
    const proofUrl = uploadResult.secure_url;
    const proofPublicId = uploadResult.public_id;

    // 6. Create Payment Record (Preserves history if previous attempt was rejected)
    let payment;
    try {
      payment = await Payment.create({
        orderId: order._id,
        userId: req.user._id,
        paymentMethod: paymentMethod.trim(),
        amount,
        transactionReference: trimmedRef,
        proofUrl,
        proofPublicId,
        status: 'Pending'
      });
    } catch (payErr) {
      if (proofPublicId) {
        await deletePaymentProofFromCloudinary(proofPublicId);
      }
      throw payErr;
    }

    // Update order payment status
    order.paymentStatus = 'submitted';
    await order.save();

    // Dispatch email notification to admin asynchronously
    sendAdminPaymentProofEmail(order, payment).catch((emailErr) => {
      console.warn('Warning: Failed to send payment proof email to admin:', emailErr.message);
    });

    return res.status(201).json({
      success: true,
      message: 'Payment proof submitted successfully. Awaiting administrator verification.',
      payment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get payments for a specific order (Customer view)
// @route   GET /api/payments/order/:orderId
// @access  Private (Customer)
export const getPaymentByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You are not authorized to view payments for this order.' });
    }

    const payments = await Payment.find({ orderId: order._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      payments
    });
  } catch (error) {
    next(error);
  }
};
