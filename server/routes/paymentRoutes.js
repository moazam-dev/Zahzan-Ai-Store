import express from 'express';
import {
  submitPaymentProof,
  getPaymentStatus
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/proof', protect, upload.single('proofImage'), submitPaymentProof);
router.get('/:id', protect, getPaymentStatus);

export default router;
