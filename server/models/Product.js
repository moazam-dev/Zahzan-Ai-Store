import mongoose from 'mongoose';

const colorVariantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  hex: { type: String, trim: true },
  image: { type: String, trim: true }
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    sku: {
      type: String,
      required: [true, 'Product SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    quickDescription: {
      type: String,
      trim: true,
      default: ''
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price must be a non-negative number']
    },
    originalPrice: {
      type: Number,
      min: [0, 'Original price must be non-negative']
    },
    category: {
      type: String,
      required: [true, 'Product category is required'],
      trim: true
    },
    badge: {
      type: String,
      trim: true
    },
    images: [
      {
        type: String,
        trim: true
      }
    ],
    image: {
      type: String,
      trim: true
    },
    hoverImage: {
      type: String,
      trim: true
    },
    colors: [colorVariantSchema],
    color: {
      type: String,
      trim: true
    },
    sizes: [
      {
        type: String,
        trim: true
      }
    ],
    fabric: {
      type: String,
      trim: true
    },
    work: {
      type: String,
      trim: true
    },
    breakdown: {
      shirt: { type: String, trim: true },
      trouser: { type: String, trim: true },
      dupatta: { type: String, trim: true }
    },
    modelInfo: {
      type: String,
      trim: true
    },
    careInstructions: [
      {
        type: String,
        trim: true
      }
    ],
    gallery: [
      {
        type: String,
        trim: true
      }
    ],
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative']
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

productSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

productSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

const Product = mongoose.model('Product', productSchema);

export default Product;

