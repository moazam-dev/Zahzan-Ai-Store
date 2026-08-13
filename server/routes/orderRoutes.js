import express from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder
} from '../controllers/orderController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadPaymentProof } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// All order routes require authentication
router.use(protect);

router.post(
  '/',
  (req, res, next) => {
    uploadPaymentProof.single('proof')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  createOrder
);

router.get('/', getMyOrders);
router.get('/my-orders', getMyOrders);
router.get('/:id', getOrderById);
router.patch('/:id/cancel', cancelOrder);

export default router;
