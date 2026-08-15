// POST /api/newsletter/subscribe
//
// Statement-by-statement port of server/controllers/newsletterController.js's
// subscribeNewsletter (Task 12, task-12-brief.md). Public -- matches
// server/routes/newsletterRoutes.js's `router.post('/subscribe',
// newsletterLimiter, subscribeNewsletter)`.
//
// No `requireAuth` call here: server/routes/newsletterRoutes.js applies no
// `protect` middleware to this route, so `req.user` is NEVER populated by
// Express regardless of what Authorization header a caller sends -- the
// source's `if (req.user) { subscriber.userId = req.user._id; }` /
// `userId: req.user ? req.user._id : undefined` branches are structurally
// dead code on the live route (confirmed: no middleware anywhere in the
// route chain ever sets req.user for POST /api/newsletter/subscribe). This
// port reproduces that reality directly -- userId is never set from the
// request -- rather than "fixing" it into a working optional-auth check,
// which would be new behaviour the old API never had (GC4). Flagged in
// task-12-report.md.
//
// GC7: email is lowercased and trimmed before every read/write.
//
// Error handling: the source's whole body is a try/catch that calls
// `next(error)` on anything unexpected (0 local message-prefixing), PLUS one
// specific catch for a Mongo E11000 duplicate-key race (two concurrent
// subscribe requests for a brand-new email). The Postgres equivalent of that
// race is a unique_violation (23505) on newsletter_subscribers_email_idx,
// reproduced below with the same fallback response the source used.
//
// Shape checked against tools/golden/051-newsletter.subscribe.json and
// tools/golden/052-newsletter.subscribe-again.json.

export const runtime = 'nodejs';

import crypto from 'crypto';
import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler, checkRateLimit, newsletterRateLimit } from '../../../../lib/rateLimit.js';
import { serializeNewsletterSubscribeResult } from '../../../../lib/serialize.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withApiHandler(async (request) => {
  const { limited, response: limitResponse } = await checkRateLimit(request, newsletterRateLimit);
  if (limited) return limitResponse;

  const body = await request.json().catch(() => ({}));
  const { email, source } = body;

  if (!email || !email.trim()) {
    return fail('Please enter a valid email address.', 400);
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return fail('Please enter a valid email address format.', 400);
  }

  const subscriptionSource = (source || 'footer').trim().toLowerCase();

  const { rows } = await query('select * from newsletter_subscribers where email = $1', [normalizedEmail]);
  const subscriber = rows[0];

  if (subscriber) {
    if (subscriber.status === 'subscribed') {
      return ok({
        success: true,
        isAlreadySubscribed: true,
        message: "You're already subscribed to the ZAHZAN newsletter."
      });
    }

    // Resubscribe a previously unsubscribed record.
    await query(
      `update newsletter_subscribers
       set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null, source = $1
       where id = $2`,
      [subscriptionSource, subscriber.id]
    );

    return ok({
      success: true,
      isResubscribed: true,
      message: "Welcome back! You're now resubscribed to the ZAHZAN newsletter."
    });
  }

  // Create a new subscriber with a cryptographically secure unsubscribe
  // token.
  const unsubscribeToken = crypto.randomBytes(32).toString('hex');

  let newSubscriber;
  try {
    const { rows: insertedRows } = await query(
      `insert into newsletter_subscribers (email, status, source, unsubscribe_token, subscribed_at)
       values ($1, 'subscribed', $2, $3, now())
       returning *`,
      [normalizedEmail, subscriptionSource, unsubscribeToken]
    );
    newSubscriber = insertedRows[0];
  } catch (err) {
    if (err.code === '23505') {
      return ok({
        success: true,
        isAlreadySubscribed: true,
        message: "You're already subscribed to the ZAHZAN newsletter."
      });
    }
    throw err;
  }

  return ok(
    {
      success: true,
      message: "You're now subscribed to the ZAHZAN newsletter.",
      subscriber: serializeNewsletterSubscribeResult(newSubscriber)
    },
    201
  );
});
