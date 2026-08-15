// Task 12 (task-12-brief.md): route-level tests for the three
// app/api/newsletter/* route handlers, exercised as real functions against a
// PGlite-backed lib/db.js.
//
// Per Ruling C3 (binding): response SHAPE and exact MESSAGE STRINGS are
// asserted against the golden files named in comments below.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

const { query, close } = await import('../../lib/db.js');

import { POST as subscribeRoute } from '../../app/api/newsletter/subscribe/route.js';
import { POST as unsubscribePostRoute } from '../../app/api/newsletter/unsubscribe/route.js';
import { GET as unsubscribeGetRoute } from '../../app/api/newsletter/unsubscribe/[token]/route.js';

function postJsonRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { accept: 'application/json', ...headers }
  });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

async function tokenForSubscriber(email) {
  const { rows } = await query('select unsubscribe_token from newsletter_subscribers where email = $1', [email]);
  return rows[0].unsubscribe_token;
}

let ipCounter = 0;
function uniqueIpHeader() {
  ipCounter += 1;
  return { 'x-forwarded-for': `10.0.0.${ipCounter}` };
}

describe('app/api/newsletter/* route handlers (Task 12)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('POST /api/newsletter/subscribe', () => {
    it('subscribes a new email -- shape matches tools/golden/051-newsletter.subscribe.json', async () => {
      const ip = uniqueIpHeader();
      const email = 'journey.newsletter@zahzancontract.test';

      const res = await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email, source: 'footer' }, ip));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: "You're now subscribed to the ZAHZAN newsletter.",
        subscriber: {
          id: expect.any(String),
          email,
          status: 'subscribed',
          subscribedAt: expect.any(String)
        }
      });
    });

    it('is idempotent for an already-subscribed address -- shape matches tools/golden/052-newsletter.subscribe-again.json', async () => {
      const ip = uniqueIpHeader();
      const email = 'idempotent@zahzancontract.test';

      const first = await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      expect(first.status).toBe(201);

      const second = await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      expect(second.status).toBe(200);
      await expect(second.json()).resolves.toEqual({
        success: true,
        isAlreadySubscribed: true,
        message: "You're already subscribed to the ZAHZAN newsletter."
      });
    });

    it('re-subscribes a previously unsubscribed address', async () => {
      const ip = uniqueIpHeader();
      const email = 'resubscribe@zahzancontract.test';

      await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      const token = await tokenForSubscriber(email);
      const unsubRes = await unsubscribeGetRoute(getRequest(`/api/newsletter/unsubscribe/${token}`), paramsContext({ token }));
      expect(unsubRes.status).toBe(200);

      const { rows: beforeRows } = await query('select status from newsletter_subscribers where email = $1', [email]);
      expect(beforeRows[0].status).toBe('unsubscribed');

      const resubRes = await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      expect(resubRes.status).toBe(200);
      await expect(resubRes.json()).resolves.toEqual({
        success: true,
        isResubscribed: true,
        message: "Welcome back! You're now resubscribed to the ZAHZAN newsletter."
      });

      const { rows: afterRows } = await query(
        'select status, unsubscribed_at from newsletter_subscribers where email = $1',
        [email]
      );
      expect(afterRows[0].status).toBe('subscribed');
      expect(afterRows[0].unsubscribed_at).toBeNull();
    });

    it('GC7: the stored email is lowercased and trimmed', async () => {
      const ip = uniqueIpHeader();
      const res = await subscribeRoute(
        postJsonRequest('/api/newsletter/subscribe', { email: '  MixedCase@Zahzancontract.TEST  ' }, ip)
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.subscriber.email).toBe('mixedcase@zahzancontract.test');

      const { rows } = await query('select email from newsletter_subscribers where email = $1', [
        'mixedcase@zahzancontract.test'
      ]);
      expect(rows).toHaveLength(1);
    });

    it('missing email -> 400 exact message', async () => {
      const ip = uniqueIpHeader();
      const res = await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', {}, ip));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Please enter a valid email address.'
      });
    });

    it('malformed email -> 400 exact message', async () => {
      const ip = uniqueIpHeader();
      const res = await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email: 'not-an-email' }, ip));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Please enter a valid email address format.'
      });
    });

    it('the newsletterLimiter caps at 15 requests per IP per 15 minutes, with the exact message', async () => {
      const ip = uniqueIpHeader();
      let last;
      for (let i = 0; i < 16; i++) {
        last = await subscribeRoute(
          postJsonRequest('/api/newsletter/subscribe', { email: `rl-${i}@zahzancontract.test` }, ip)
        );
      }
      expect(last.status).toBe(429);
      await expect(last.json()).resolves.toEqual({
        success: false,
        message: 'Too many newsletter subscription requests from this IP. Please try again later.'
      });
    });
  });

  describe('GET /api/newsletter/unsubscribe/:token -- shape matches tools/golden/053-newsletter.unsubscribe-by-token.json', () => {
    it('unsubscribes a subscribed address', async () => {
      const ip = uniqueIpHeader();
      const email = 'unsub-get@zahzancontract.test';
      await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      const token = await tokenForSubscriber(email);

      const res = await unsubscribeGetRoute(getRequest(`/api/newsletter/unsubscribe/${token}`), paramsContext({ token }));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'You have been unsubscribed from the ZAHZAN newsletter.'
      });
    });

    it('an invalid token -> 400 exact message', async () => {
      const res = await unsubscribeGetRoute(
        getRequest('/api/newsletter/unsubscribe/not-a-real-token'),
        paramsContext({ token: 'not-a-real-token' })
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid or expired unsubscribe link.'
      });
    });

    it('renders the HTML confirmation page when the client accepts text/html', async () => {
      const ip = uniqueIpHeader();
      const email = 'unsub-html@zahzancontract.test';
      await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      const token = await tokenForSubscriber(email);

      const res = await unsubscribeGetRoute(
        getRequest(`/api/newsletter/unsubscribe/${token}`, { accept: 'text/html' }),
        paramsContext({ token })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('You have been successfully unsubscribed from the ZAHZAN newsletter.');
    });
  });

  describe('POST /api/newsletter/unsubscribe -- shape matches tools/golden/102-extra2.newsletter-unsubscribe-post.json', () => {
    it('unsubscribes via a token in the JSON body', async () => {
      const ip = uniqueIpHeader();
      const email = 'unsub-post@zahzancontract.test';
      await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      const token = await tokenForSubscriber(email);

      const res = await unsubscribePostRoute(postJsonRequest('/api/newsletter/unsubscribe', { token }));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'You have been unsubscribed from the ZAHZAN newsletter.'
      });
    });

    it('unsubscribing an already-unsubscribed token returns the "already" message', async () => {
      const ip = uniqueIpHeader();
      const email = 'unsub-twice@zahzancontract.test';
      await subscribeRoute(postJsonRequest('/api/newsletter/subscribe', { email }, ip));
      const token = await tokenForSubscriber(email);

      const first = await unsubscribePostRoute(postJsonRequest('/api/newsletter/unsubscribe', { token }));
      expect(first.status).toBe(200);

      const second = await unsubscribePostRoute(postJsonRequest('/api/newsletter/unsubscribe', { token }));
      expect(second.status).toBe(200);
      await expect(second.json()).resolves.toEqual({
        success: true,
        message: 'You have already been unsubscribed from the ZAHZAN newsletter.'
      });
    });

    it('missing token -> 400 exact message', async () => {
      const res = await unsubscribePostRoute(postJsonRequest('/api/newsletter/unsubscribe', {}));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Unsubscribe token is required.'
      });
    });
  });
});
