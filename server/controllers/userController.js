import crypto from 'crypto';
import User from '../models/User.js';
import Address from '../models/Address.js';
import EmailChangeToken from '../models/EmailChangeToken.js';
import { sendEmailChangeConfirmation } from '../utils/email.js';

/**
 * @desc    Get current user profile & addresses
 * @route   GET /api/users/me
 * @access  Private
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const addresses = await Address.find({ userId: req.user._id }).sort({ isDefault: -1, createdAt: -1 });

    return res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      addresses
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update current user profile info (name, phone)
 * @route   PATCH /api/users/me
 * @access  Private
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, name, phone } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();

    if (!firstName && !lastName && name) {
      const parts = name.trim().split(' ');
      user.firstName = parts[0];
      user.lastName = parts.slice(1).join(' ') || parts[0];
    }

    if (phone !== undefined) user.phone = phone.trim();

    await user.save();

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request email change (sends confirmation to new email)
 * @route   POST /api/users/me/email-change-request
 * @access  Private
 */
export const requestEmailChange = async (req, res, next) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({
        success: false,
        message: 'New email address is required.'
      });
    }

    const normalizedNewEmail = newEmail.toLowerCase().trim();

    if (normalizedNewEmail === req.user.email) {
      return res.status(400).json({
        success: false,
        message: 'New email address cannot be the same as your current email.'
      });
    }

    // Check if new email is already taken
    const existingUser = await User.findOne({ email: normalizedNewEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    // Clear old change tokens for this user
    await EmailChangeToken.deleteMany({ userId: req.user._id });

    // Create new token
    const token = crypto.randomBytes(32).toString('hex');
    await EmailChangeToken.create({
      userId: req.user._id,
      newEmail: normalizedNewEmail,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    sendEmailChangeConfirmation(normalizedNewEmail, token);

    return res.json({
      success: true,
      message: `A confirmation link has been sent to ${normalizedNewEmail}. Please check your inbox to complete the update.`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm email change token
 * @route   GET /api/users/me/confirm-email-change
 * @access  Public / Private
 */
export const confirmEmailChange = async (req, res, next) => {
  try {
    const token = req.query.token || req.body.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Email change token is required.'
      });
    }

    const tokenDoc = await EmailChangeToken.findOne({
      token,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired email change token.'
      });
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    user.email = tokenDoc.newEmail;
    user.isEmailVerified = true;
    await user.save();

    await EmailChangeToken.deleteOne({ _id: tokenDoc._id });

    return res.json({
      success: true,
      message: 'Email address updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all addresses for authenticated user
 * @route   GET /api/users/me/addresses
 * @access  Private
 */
export const getUserAddresses = async (req, res, next) => {
  try {
    const addresses = await Address.find({ userId: req.user._id }).sort({ isDefault: -1, createdAt: -1 });

    return res.json({
      success: true,
      addresses
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new shipping address
 * @route   POST /api/users/me/addresses
 * @access  Private
 */
export const addUserAddress = async (req, res, next) => {
  try {
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      province,
      state,
      postalCode,
      country,
      label,
      isDefault
    } = req.body;

    if (!fullName || !phone || !addressLine1 || !city || !postalCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required address fields.'
      });
    }

    const existingAddressesCount = await Address.countDocuments({ userId: req.user._id });
    const shouldBeDefault = isDefault || existingAddressesCount === 0;

    if (shouldBeDefault) {
      await Address.updateMany(
        { userId: req.user._id },
        { $set: { isDefault: false } }
      );
    }

    const newAddress = await Address.create({
      userId: req.user._id,
      fullName: fullName.trim(),
      phone: phone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : '',
      city: city.trim(),
      province: (province || state || 'Punjab').trim(),
      postalCode: postalCode.trim(),
      country: (country || 'Pakistan').trim(),
      label: label ? label.trim() : 'Home',
      isDefault: shouldBeDefault
    });

    return res.status(201).json({
      success: true,
      message: 'Address added successfully.',
      address: newAddress
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing address
 * @route   PATCH /api/users/me/addresses/:id
 * @access  Private
 */
export const updateUserAddress = async (req, res, next) => {
  try {
    const addressId = req.params.id;
    const address = await Address.findOne({ _id: addressId, userId: req.user._id });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or unauthorized.'
      });
    }

    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      province,
      state,
      postalCode,
      country,
      label,
      isDefault
    } = req.body;

    if (isDefault) {
      await Address.updateMany(
        { userId: req.user._id },
        { $set: { isDefault: false } }
      );
      address.isDefault = true;
    }

    if (fullName) address.fullName = fullName.trim();
    if (phone) address.phone = phone.trim();
    if (addressLine1) address.addressLine1 = addressLine1.trim();
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2.trim();
    if (city) address.city = city.trim();
    if (province || state) address.province = (province || state).trim();
    if (postalCode) address.postalCode = postalCode.trim();
    if (country) address.country = country.trim();
    if (label) address.label = label.trim();

    await address.save();

    return res.json({
      success: true,
      message: 'Address updated successfully.',
      address
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete an address
 * @route   DELETE /api/users/me/addresses/:id
 * @access  Private
 */
export const deleteUserAddress = async (req, res, next) => {
  try {
    const addressId = req.params.id;
    const address = await Address.findOne({ _id: addressId, userId: req.user._id });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or unauthorized.'
      });
    }

    const wasDefault = address.isDefault;
    await Address.deleteOne({ _id: addressId });

    if (wasDefault) {
      const remainingAddress = await Address.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
      if (remainingAddress) {
        remainingAddress.isDefault = true;
        await remainingAddress.save();
      }
    }

    return res.json({
      success: true,
      message: 'Address deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set address as default
 * @route   PATCH /api/users/me/addresses/:id/default
 * @access  Private
 */
export const setDefaultAddress = async (req, res, next) => {
  try {
    const addressId = req.params.id;
    const address = await Address.findOne({ _id: addressId, userId: req.user._id });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or unauthorized.'
      });
    }

    await Address.updateMany(
      { userId: req.user._id },
      { $set: { isDefault: false } }
    );

    address.isDefault = true;
    await address.save();

    return res.json({
      success: true,
      message: 'Default address updated successfully.',
      address
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's wishlist
 * @route   GET /api/users/me/wishlist
 * @access  Private
 */
export const getUserWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist');
    const wishlistIds = user.wishlist ? user.wishlist.map((item) => (item._id ? item._id.toString() : item.toString())) : [];
    return res.json({
      success: true,
      wishlist: wishlistIds,
      products: user.wishlist || []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle item in user's wishlist
 * @route   POST /api/users/me/wishlist
 * @access  Private
 */
export const toggleUserWishlist = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user.wishlist) {
      user.wishlist = [];
    }

    const prodIdStr = productId.toString();
    const existingIndex = user.wishlist.findIndex((id) => id.toString() === prodIdStr);

    if (existingIndex > -1) {
      user.wishlist.splice(existingIndex, 1);
    } else {
      user.wishlist.push(productId);
    }

    await user.save();
    const wishlistIds = user.wishlist.map((id) => id.toString());

    return res.json({
      success: true,
      wishlist: wishlistIds
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove item from user's wishlist
 * @route   DELETE /api/users/me/wishlist/:productId
 * @access  Private
 */
export const removeUserWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const user = await User.findById(req.user._id);

    if (user.wishlist) {
      user.wishlist = user.wishlist.filter((id) => id.toString() !== productId.toString());
      await user.save();
    }

    const wishlistIds = user.wishlist ? user.wishlist.map((id) => id.toString()) : [];

    return res.json({
      success: true,
      wishlist: wishlistIds
    });
  } catch (error) {
    next(error);
  }
};

