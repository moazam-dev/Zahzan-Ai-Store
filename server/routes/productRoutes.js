import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct
} from '../controllers/productController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', protect, requireAdmin, createProduct);

export default router;
