import express from 'express';
import {
  subscribeNewsletter,
  unsubscribeNewsletter
} from '../controllers/newsletterController.js';

const router = express.Router();

router.post('/subscribe', subscribeNewsletter);
router.post('/unsubscribe', unsubscribeNewsletter);

export default router;
