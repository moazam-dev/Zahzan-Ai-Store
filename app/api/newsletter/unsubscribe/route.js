// POST /api/newsletter/unsubscribe
//
// Statement-by-statement port of server/controllers/newsletterController.js's
// unsubscribeNewsletter (Task 12, task-12-brief.md), reading the token from
// the JSON body (or a `?token=` query string). Public -- matches
// server/routes/newsletterRoutes.js's `router.post('/unsubscribe',
// unsubscribeNewsletter)` (no rate limiter on this route; `newsletterLimiter`
// attaches to /subscribe only). Shares its ONE implementation with the
// ../unsubscribe/[token]/route.js GET route via ../_unsubscribe.js.
//
// Shape checked against tools/golden/102-extra2.newsletter-unsubscribe-post.json.

export const runtime = 'nodejs';

import { withErrorHandler } from '../../../../lib/http.js';
import { unsubscribeNewsletter } from '../_unsubscribe.js';

export const POST = withErrorHandler((request) => unsubscribeNewsletter(request, null));
