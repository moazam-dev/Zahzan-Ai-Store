import express from 'express';
import {
  getAdminDashboardStats,
  getAllUsers,
  getAllOrders
} from '../controllers/adminController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(requireAdmin);

router.get('/dashboard', getAdminDashboardStats);
router.get('/users', getAllUsers);
router.get('/orders', getAllOrders);

export default router;
