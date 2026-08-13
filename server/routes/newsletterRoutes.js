import express from 'express';
import {
  subscribeNewsletter,
  unsubscribeNewsletter
} from '../controllers/newsletterController.js';
import { newsletterLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/subscribe', newsletterLimiter, subscribeNewsletter);
router.get('/unsubscribe/:token', unsubscribeNewsletter);
router.post('/unsubscribe', unsubscribeNewsletter);

export default router;
