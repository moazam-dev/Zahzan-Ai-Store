import express from 'express';
import {
  submitStory,
  getApprovedStories
} from '../controllers/storyController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('image'), submitStory);
router.get('/', getApprovedStories);

export default router;
