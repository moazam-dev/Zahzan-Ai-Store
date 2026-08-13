import express from 'express';
import {
  registerUser,
  loginUser,
  googleAuth,
  facebookAuth,
  refreshToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  getMe
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter
} from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', registerLimiter, registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/google', googleAuth);
router.post('/facebook', facebookAuth);
router.post('/refresh', refreshToken);
router.post('/logout', logoutUser);

router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

router.get('/me', protect, getMe);

export default router;
