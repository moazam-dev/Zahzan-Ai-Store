import mongoose from 'mongoose';

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      enum: ['subscribed', 'unsubscribed'],
      default: 'subscribed',
      index: true
    },
    source: {
      type: String,
      default: 'footer',
      trim: true
    },
    unsubscribeToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    unsubscribedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

newsletterSubscriberSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.unsubscribeToken;
    delete ret.__v;
    ret.id = ret._id.toString();
    return ret;
  }
});

const NewsletterSubscriber = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);

export default NewsletterSubscriber;
