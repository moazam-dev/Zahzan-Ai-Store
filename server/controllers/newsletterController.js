import crypto from 'crypto';
import NewsletterSubscriber from '../models/NewsletterSubscriber.js';

// Regex for basic email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @desc    Subscribe an email address to ZAHZAN Newsletter
 * @route   POST /api/newsletter/subscribe
 * @access  Public (Guest & Logged-in Customers)
 */
export const subscribeNewsletter = async (req, res, next) => {
  try {
    const { email, source } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address format.'
      });
    }

    const subscriptionSource = (source || 'footer').trim().toLowerCase();

    // Search for existing subscriber record in database
    let subscriber = await NewsletterSubscriber.findOne({ email: normalizedEmail });

    if (subscriber) {
      if (subscriber.status === 'subscribed') {
        return res.status(200).json({
          success: true,
          isAlreadySubscribed: true,
          message: "You're already subscribed to the ZAHZAN newsletter."
        });
      } else {
        // Resubscribe previously unsubscribed record
        subscriber.status = 'subscribed';
        subscriber.subscribedAt = new Date();
        subscriber.unsubscribedAt = null;
        subscriber.source = subscriptionSource;
        if (req.user) {
          subscriber.userId = req.user._id;
        }
        await subscriber.save();

        return res.status(200).json({
          success: true,
          isResubscribed: true,
          message: "Welcome back! You're now resubscribed to the ZAHZAN newsletter."
        });
      }
    }

    // Create new subscriber with a cryptographically secure unsubscribe token
    const unsubscribeToken = crypto.randomBytes(32).toString('hex');

    subscriber = await NewsletterSubscriber.create({
      email: normalizedEmail,
      status: 'subscribed',
      source: subscriptionSource,
      unsubscribeToken,
      userId: req.user ? req.user._id : undefined,
      subscribedAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: "You're now subscribed to the ZAHZAN newsletter.",
      subscriber: {
        id: subscriber._id,
        email: subscriber.email,
        status: subscriber.status,
        subscribedAt: subscriber.subscribedAt
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        isAlreadySubscribed: true,
        message: "You're already subscribed to the ZAHZAN newsletter."
      });
    }
    next(error);
  }
};

/**
 * @desc    Unsubscribe using secure token
 * @route   GET /api/newsletter/unsubscribe/:token (or POST /api/newsletter/unsubscribe)
 * @access  Public
 */
export const unsubscribeNewsletter = async (req, res, next) => {
  try {
    const token = req.params.token || req.body.token || req.query.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Unsubscribe token is required.'
      });
    }

    const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: token });

    if (!subscriber) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired unsubscribe link.'
      });
    }

    if (subscriber.status === 'unsubscribed') {
      return res.status(200).json({
        success: true,
        message: 'You have already been unsubscribed from the ZAHZAN newsletter.'
      });
    }

    subscriber.status = 'unsubscribed';
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();

    // If request accepts HTML (direct browser link click), render luxury HTML response page
    if (req.accepts('html')) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>ZAHZAN — Unsubscribed</title>
          <style>
            body { background-color: #faf8f5; color: #1c1b18; font-family: 'Times New Roman', serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background-color: #ffffff; border: 1px solid #e8e4dc; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
            h1 { letter-spacing: 0.35em; text-transform: uppercase; font-size: 24px; font-weight: 300; margin-bottom: 8px; }
            p { font-family: Arial, sans-serif; font-size: 13px; color: #706c64; line-height: 1.6; margin-top: 20px; }
            a { display: inline-block; margin-top: 28px; background: #1c1b18; color: #faf8f5; padding: 12px 28px; text-decoration: none; font-family: Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.25em; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>ZAHZAN</h1>
            <p>You have been successfully unsubscribed from the ZAHZAN newsletter.</p>
            <a href="/">Return to ZAHZAN Store</a>
          </div>
        </body>
        </html>
      `);
    }

    return res.status(200).json({
      success: true,
      message: 'You have been unsubscribed from the ZAHZAN newsletter.'
    });
  } catch (error) {
    next(error);
  }
};
