// Shared implementation for GET /api/newsletter/unsubscribe/:token and
// POST /api/newsletter/unsubscribe -- both are statement-by-statement ports
// of the SAME controller function, server/controllers/newsletterController.js's
// unsubscribeNewsletter (Task 12, task-12-brief.md). Not a route.js itself,
// so the App Router never treats it as a routable segment.
//
// Token resolution mirrors the source's `req.params.token || req.body.token
// || req.query.token` exactly: `params` (the GET route's dynamic segment)
// wins first, then a POST body's `token` field, then a `?token=` query
// string param on either route.
//
// Error handling: unsubscribeNewsletter's source wraps its whole body in a
// try/catch that calls `next(error)` with zero local message-prefixing --
// withErrorHandler alone (applied by each caller route.js) is the faithful
// reproduction; see app/api/payments/_submitPaymentProof.js's header comment
// for the identical reasoning applied there.
//
// The `req.accepts('html')` branch (a direct browser click on the emailed
// unsubscribe link renders a luxury HTML confirmation page instead of JSON)
// is reproduced below, HTML byte-identical to the source. No golden and no
// shipped frontend call site exercises this branch (grepped src/ -- nothing
// references "unsubscribe"; tools/contract-capture.mjs's own request helper
// defaults every capture to `Accept: application/json` and only sends
// `Accept: text/html` when a capture explicitly opts in via `acceptHtml`,
// which none of the newsletter captures do). The accepts() check here is
// therefore a simplified content-negotiation (does the Accept header
// mention 'text/html'?) rather than a full port of Express's `accepts`
// npm package's quality-value negotiation -- sufficient for the two literal
// Accept values the capture harness and any real browser/fetch call
// actually send, flagged in task-12-report.md as unverified against any
// golden.
//
// Shape checked against tools/golden/053-newsletter.unsubscribe-by-token.json
// and tools/golden/102-extra2.newsletter-unsubscribe-post.json.

import { query } from '../../../lib/db.js';
import { ok, fail } from '../../../lib/http.js';

function wantsHtml(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

const UNSUBSCRIBED_HTML = `
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
      `;

/**
 * @param {Request} request
 * @param {string|null|undefined} paramsToken the GET route's `:token`
 *        dynamic segment, or undefined for the POST route (which has none).
 */
export async function unsubscribeNewsletter(request, paramsToken) {
  const url = new URL(request.url);
  let bodyToken;
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    bodyToken = body.token;
  }
  const token = paramsToken || bodyToken || url.searchParams.get('token');

  if (!token) {
    return fail('Unsubscribe token is required.', 400);
  }

  const { rows } = await query('select * from newsletter_subscribers where unsubscribe_token = $1', [token]);
  const subscriber = rows[0];

  if (!subscriber) {
    return fail('Invalid or expired unsubscribe link.', 400);
  }

  if (subscriber.status === 'unsubscribed') {
    return ok({
      success: true,
      message: 'You have already been unsubscribed from the ZAHZAN newsletter.'
    });
  }

  await query(
    'update newsletter_subscribers set status = $1, unsubscribed_at = now() where id = $2',
    ['unsubscribed', subscriber.id]
  );

  if (wantsHtml(request)) {
    return new Response(UNSUBSCRIBED_HTML, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  }

  return ok({
    success: true,
    message: 'You have been unsubscribed from the ZAHZAN newsletter.'
  });
}
