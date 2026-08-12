import mongoose from 'mongoose';

const adminUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    permissions: [
      {
        type: String,
        trim: true
      }
    ],
    department: {
      type: String,
      trim: true,
      default: 'Management'
    }
  },
  {
    timestamps: true
  }
);

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

export default AdminUser;
