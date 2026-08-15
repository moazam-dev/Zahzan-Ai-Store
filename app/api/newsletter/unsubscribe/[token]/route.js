// GET /api/newsletter/unsubscribe/:token
//
// Statement-by-statement port of server/controllers/newsletterController.js's
// unsubscribeNewsletter (Task 12, task-12-brief.md), reading the token from
// the dynamic URL segment -- matches server/routes/newsletterRoutes.js's
// `router.get('/unsubscribe/:token', unsubscribeNewsletter)`. Public. Shares
// its ONE implementation with ../route.js's POST via ../../_unsubscribe.js.
//
// Shape checked against tools/golden/053-newsletter.unsubscribe-by-token.json.

export const runtime = 'nodejs';

import { withApiHandler } from '../../../../../lib/rateLimit.js';
import { unsubscribeNewsletter } from '../../_unsubscribe.js';

export const GET = withApiHandler(async (request, context) => {
  const { token } = await context.params;
  return unsubscribeNewsletter(request, token);
});
