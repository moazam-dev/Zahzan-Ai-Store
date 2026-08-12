import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  requestEmailChange,
  confirmEmailChange,
  getUserAddresses,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress,
  setDefaultAddress,
  getUserWishlist,
  toggleUserWishlist,
  removeUserWishlist
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Profile endpoints
router.get('/me', protect, getUserProfile);
router.patch('/me', protect, updateUserProfile);
router.post('/me/email-change-request', protect, requestEmailChange);
router.get('/me/confirm-email-change', confirmEmailChange);

// Address endpoints
router.get('/me/addresses', protect, getUserAddresses);
router.post('/me/addresses', protect, addUserAddress);
router.patch('/me/addresses/:id', protect, updateUserAddress);
router.delete('/me/addresses/:id', protect, deleteUserAddress);
router.patch('/me/addresses/:id/default', protect, setDefaultAddress);

// Wishlist endpoints
router.get('/me/wishlist', protect, getUserWishlist);
router.post('/me/wishlist', protect, toggleUserWishlist);
router.delete('/me/wishlist/:productId', protect, removeUserWishlist);

export default router;
