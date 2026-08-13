import express from 'express';
import {
  getPaymentMethods,
  submitPaymentProof,
  getPaymentByOrderId
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadPaymentProof } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Public / Authenticated route to get payment methods configuration
router.get('/methods', getPaymentMethods);

// Protected Customer Routes
router.post(
  '/',
  protect,
  (req, res, next) => {
    uploadPaymentProof.single('proof')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  submitPaymentProof
);

// Backward compatibility alias for /proof
router.post(
  '/proof',
  protect,
  (req, res, next) => {
    uploadPaymentProof.single('proofImage')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  submitPaymentProof
);

router.get('/order/:orderId', protect, getPaymentByOrderId);

export default router;
