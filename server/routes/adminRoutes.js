import express from 'express';
import {
  adminLogin,
  getAdminProfile,
  getAdminDashboardStats,
  getAllOrders,
  getAdminOrderById,
  updateOrderStatus,
  getAllUsers,
  getAdminCustomerById,
  updateCustomerStatus,
  getAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  getAdminNewsletterSubscribers,
  exportAdminNewsletterSubscribers,
  getAdminAuditLogs,
  getAdminPayments,
  getAdminPaymentById,
  verifyAdminPayment,
  rejectAdminPayment
} from '../controllers/adminController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';

const router = express.Router();

// Public Admin Login Route
router.post('/auth/login', adminLogin);

// Protected Admin Routes Middleware
router.use(protect);
router.use(requireAdmin);

// Auth & Profile
router.get('/auth/me', getAdminProfile);

// Dashboard Statistics
router.get('/dashboard', getAdminDashboardStats);

// Orders Management
router.get('/orders', getAllOrders);
router.get('/orders/:id', getAdminOrderById);
router.patch('/orders/:id/status', updateOrderStatus);

// Payment Verification Management
router.get('/payments', getAdminPayments);
router.get('/payments/:id', getAdminPaymentById);
router.patch('/payments/:id/verify', verifyAdminPayment);
router.patch('/payments/:id/reject', rejectAdminPayment);

// Customers Management
router.get('/customers', getAllUsers);
router.get('/customers/:id', getAdminCustomerById);
router.patch('/customers/:id/status', updateCustomerStatus);

// Products Management
router.get('/products', getAdminProducts);
router.post('/products', createAdminProduct);
router.put('/products/:id', updateAdminProduct);
router.delete('/products/:id', deleteAdminProduct);

// Newsletter Management
router.get('/newsletter', getAdminNewsletterSubscribers);
router.get('/newsletter/export', exportAdminNewsletterSubscribers);

// Audit Logs
router.get('/audit-logs', getAdminAuditLogs);

export default router;
