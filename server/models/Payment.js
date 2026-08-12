import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },
    method: {
      type: String,
      enum: ['JazzCash', 'Easypaisa', 'Bank Transfer', 'Cash on Delivery'],
      required: [true, 'Payment method is required']
    },
    transactionReference: {
      type: String,
      trim: true,
      default: ''
    },
    proofImage: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'verified', 'rejected'],
      default: 'pending'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
