import mongoose from 'mongoose';

const emailChangeTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    newEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // Automatic TTL cleanup
    }
  },
  {
    timestamps: true
  }
);

const EmailChangeToken = mongoose.model('EmailChangeToken', emailChangeTokenSchema);

export default EmailChangeToken;
