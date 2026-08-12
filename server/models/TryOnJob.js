import mongoose from 'mongoose';

const tryOnJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    color: {
      type: String,
      default: ''
    },
    inputImage: {
      type: String,
      required: [true, 'Input image is required']
    },
    outputImage: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued'
    },
    error: {
      type: String,
      default: ''
    },
    completedAt: {
      type: Date
    },
    expiresAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

const TryOnJob = mongoose.model('TryOnJob', tryOnJobSchema);

export default TryOnJob;
