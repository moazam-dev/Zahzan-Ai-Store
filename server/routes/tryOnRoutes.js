import express from 'express';
import {
  createTryOnJob,
  getTryOnJobStatus
} from '../controllers/tryOnController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('inputImage'), createTryOnJob);
router.get('/:id', protect, getTryOnJobStatus);

export default router;
