import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';

// Helper function to format and populate cart with subtotal & totalCount
const formatCartResponse = async (cartDoc) => {
  await cartDoc.populate({
    path: 'items.product',
    select: 'name price category image images stock sizes colors'
  });

  // Filter out items where product may have been deleted
  cartDoc.items = cartDoc.items.filter((item) => item.product != null);

  let subtotal = 0;
  let totalCount = 0;

  const formattedItems = cartDoc.items.map((item) => {
    const productPrice = item.product.price || 0;
    const itemSubtotal = productPrice * item.quantity;
    subtotal += itemSubtotal;
    totalCount += item.quantity;

    const prodObj = item.product.toObject ? item.product.toObject() : item.product;

    return {
      id: item._id.toString(), // cartItemId
      cartItemId: item._id.toString(),
      productId: prodObj.id || prodObj._id.toString(),
      product: prodObj,
      name: prodObj.name,
      price: productPrice,
      category: prodObj.category,
      image: prodObj.images?.[0] || prodObj.image || '',
      size: item.selectedSize || 'M',
      selectedSize: item.selectedSize || 'M',
      color: item.selectedColor,
      selectedColor: item.selectedColor,
      quantity: item.quantity,
      subtotal: itemSubtotal,
      stock: prodObj.stock
    };
  });

  return {
    id: cartDoc._id.toString(),
    user: cartDoc.user.toString(),
    items: formattedItems,
    subtotal,
    totalCount
  };
};

// @desc    Get current user's cart
// @route   GET /api/cart
// @access  Private
export const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    const formattedCart = await formatCartResponse(cart);

    return res.status(200).json({
      success: true,
      cart: formattedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to fetch cart: ${error.message}`
    });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart/items
// @access  Private
export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, selectedSize, selectedColor } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const product = await Product.findById(productId);

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or unavailable'
      });
    }

    const requestedQty = Math.max(1, Number(quantity) || 1);

    // Validate size if provided
    let finalSize = selectedSize;
    if (product.sizes && product.sizes.length > 0) {
      if (!finalSize || !product.sizes.includes(finalSize)) {
        finalSize = product.sizes[0];
      }
    } else {
      finalSize = finalSize || 'M';
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    // Check if matching item exists in cart
    const existingIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId.toString() &&
        item.selectedSize === finalSize &&
        (selectedColor ? item.selectedColor === selectedColor : true)
    );

    const existingQty = existingIndex > -1 ? cart.items[existingIndex].quantity : 0;
    const newTotalQty = existingQty + requestedQty;

    if (newTotalQty > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Cannot add items. Available stock is ${product.stock} (currently in cart: ${existingQty}).`
      });
    }

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity = newTotalQty;
    } else {
      cart.items.push({
        product: product._id,
        quantity: requestedQty,
        selectedSize: finalSize,
        selectedColor: selectedColor || ''
      });
    }

    await cart.save();
    const formattedCart = await formatCartResponse(cart);

    return res.status(200).json({
      success: true,
      message: 'Item added to cart',
      cart: formattedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to add item to cart: ${error.message}`
    });
  }
};

// @desc    Update cart item quantity or details
// @route   PATCH /api/cart/items/:id
// @access  Private
export const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params; // cartItemId or productId
    const { quantity, delta, selectedSize } = req.body;

    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Match by cartItemId or by productId (+ size if given)
    const itemIndex = cart.items.findIndex((item) => {
      const itemIdStr = item._id ? item._id.toString() : '';
      const prodIdStr = item.product ? (item.product._id ? item.product._id.toString() : item.product.toString()) : '';
      
      if (itemIdStr === id) return true;
      if (prodIdStr === id) {
        if (selectedSize) {
          return item.selectedSize === selectedSize;
        }
        return true;
      }
      return false;
    });

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    const item = cart.items[itemIndex];
    let newQty = item.quantity;

    if (typeof quantity === 'number') {
      newQty = quantity;
    } else if (typeof delta === 'number') {
      newQty = item.quantity + delta;
    }

    if (newQty <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      const product = await Product.findById(item.product._id || item.product);

      if (!product) {
        cart.items.splice(itemIndex, 1);
      } else {
        if (newQty > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Requested quantity exceeds available stock of ${product.stock}`
          });
        }
        item.quantity = newQty;
      }
    }

    await cart.save();
    const formattedCart = await formatCartResponse(cart);

    return res.status(200).json({
      success: true,
      cart: formattedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to update cart item: ${error.message}`
    });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/items/:id
// @access  Private
export const removeCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { size } = req.query;

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = cart.items.filter((item) => {
      const itemIdStr = item._id ? item._id.toString() : '';
      const prodIdStr = item.product ? item.product.toString() : '';

      if (itemIdStr === id) return false;
      if (prodIdStr === id) {
        if (size) return item.selectedSize !== size;
        return false;
      }
      return true;
    });

    await cart.save();
    const formattedCart = await formatCartResponse(cart);

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      cart: formattedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to remove cart item: ${error.message}`
    });
  }
};

// @desc    Clear entire cart
// @route   DELETE /api/cart
// @access  Private
export const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Cart cleared',
      cart: {
        id: cart ? cart._id.toString() : '',
        user: req.user._id.toString(),
        items: [],
        subtotal: 0,
        totalCount: 0
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to clear cart: ${error.message}`
    });
  }
};
