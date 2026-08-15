import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  globalRateLimit,
  loginRateLimit,
  newsletterRateLimit,
  passwordResetRateLimit,
  registerRateLimit
} from '../lib/rateLimit.js';
import { applyMigrationViaQuery } from './helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
const { query, close } = await import('../lib/db.js');

// B1 fix (final whole-branch review) regression coverage: real route
// handlers, exercised end-to-end through withApiHandler -- not just
// checkRateLimit's own config-shape/counter-arithmetic tests above -- to
// prove the actual wiring (lib/rateLimit.js:withApiHandler, applied to
// every one of the 57 app/api/**/route.js files in place of a bare
// withErrorHandler) is really in effect. GET /api/products is picked
// because it has NO route-specific limiter of its own (per
// tools/golden/013-018), so any limiting it exhibits can only come from the
// new global wrapper. POST /api/auth/login is picked because it's one of
// the five routes that already had its own specific limiter, to prove the
// global check now runs in addition to, not instead of, the specific one.
import { GET as productsListRoute } from '../app/api/products/route.js';
import { POST as loginRoute } from '../app/api/auth/login/route.js';

function requestFromIp(ip, header = 'x-forwarded-for') {
  return new Request('http://localhost/api/test', { headers: { [header]: ip } });
}

function getRequestFromIp(path, ip) {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip }
  });
}

function postRequestFromIp(path, body, ip) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body)
  });
}

describe('lib/rateLimit.js (checkRateLimit)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  it('the five exported configs match server/middleware/rateLimiter.js and server.js exactly', () => {
    // Copied verbatim from the source, not from lib/rateLimit.js itself --
    // this test exists to catch a transcription slip, so it must not
    // share a source of truth with the file it's checking.
    expect(globalRateLimit).toMatchObject({
      max: 200,
      windowSeconds: 15 * 60,
      message: 'Too many requests from this IP, please try again after 15 minutes'
    });
    expect(loginRateLimit).toMatchObject({
      max: 10,
      windowSeconds: 15 * 60,
      message: 'Too many login attempts. Please try again after 15 minutes.'
    });
    expect(registerRateLimit).toMatchObject({
      max: 10,
      windowSeconds: 60 * 60,
      message: 'Too many accounts created from this IP. Please try again in an hour.'
    });
    expect(passwordResetRateLimit).toMatchObject({
      max: 5,
      windowSeconds: 15 * 60,
      message: 'Too many password reset requests. Please try again after 15 minutes.'
    });
    expect(newsletterRateLimit).toMatchObject({
      max: 15,
      windowSeconds: 15 * 60,
      message: 'Too many newsletter subscription requests from this IP. Please try again later.'
    });
  });

  it('requests under the limit all pass', async () => {
    const config = { id: 'test-under-limit', max: 5, windowSeconds: 900, message: 'blocked' };
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(requestFromIp('1.2.3.4'), config);
      expect(result.limited).toBe(false);
      expect(result.response).toBeUndefined();
    }
  });

  it('the request that crosses max is limited and carries the exact configured message, status 429', async () => {
    const config = {
      id: 'test-crosses-max',
      max: 3,
      windowSeconds: 900,
      message: 'Too many login attempts. Please try again after 15 minutes.'
    };
    const ip = '5.6.7.8';

    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(requestFromIp(ip), config);
      expect(result.limited, `request ${i + 1} of 3 (within max) should not be limited`).toBe(false);
    }

    const fourth = await checkRateLimit(requestFromIp(ip), config);
    expect(fourth.limited).toBe(true);
    expect(fourth.response.status).toBe(429);
    await expect(fourth.response.json()).resolves.toEqual({
      success: false,
      message: config.message
    });
  });

  it('the window resets after expiry (window_start manipulated directly, not waited for)', async () => {
    const config = { id: 'test-window-reset', max: 2, windowSeconds: 900, message: 'blocked' };
    const ip = '9.9.9.9';

    await checkRateLimit(requestFromIp(ip), config); // count 1
    await checkRateLimit(requestFromIp(ip), config); // count 2
    const overLimit = await checkRateLimit(requestFromIp(ip), config); // count 3 -> limited
    expect(overLimit.limited).toBe(true);

    // Simulate the 15-minute window having actually elapsed, without
    // waiting 15 minutes in the test.
    const { rowCount } = await query(
      `update rate_limits set window_start = now() - interval '20 minutes' where key = $1`,
      [`${config.id}:${ip}`]
    );
    expect(rowCount ?? 1).toBeGreaterThan(0);

    const afterReset = await checkRateLimit(requestFromIp(ip), config);
    expect(afterReset.limited).toBe(false);

    // And the reset really did restart the count at 1, not just "not yet
    // over" -- two more should still fit under max: 2.
    const second = await checkRateLimit(requestFromIp(ip), config);
    expect(second.limited).toBe(false);
    const third = await checkRateLimit(requestFromIp(ip), config);
    expect(third.limited).toBe(true);
  });

  it('different IPs get independent counters', async () => {
    const config = { id: 'test-independent-ips', max: 1, windowSeconds: 900, message: 'blocked' };

    const first = await checkRateLimit(requestFromIp('10.0.0.1'), config);
    expect(first.limited).toBe(false);
    const firstAgain = await checkRateLimit(requestFromIp('10.0.0.1'), config);
    expect(firstAgain.limited).toBe(true);

    // A completely different IP is unaffected by 10.0.0.1 already being
    // over its limit.
    const second = await checkRateLimit(requestFromIp('10.0.0.2'), config);
    expect(second.limited).toBe(false);
  });

  it('client IP resolution: x-forwarded-for (first entry) wins, then x-real-ip, then "unknown"', async () => {
    const config = { id: 'test-ip-resolution', max: 100, windowSeconds: 900, message: 'blocked' };

    await checkRateLimit(
      new Request('http://localhost/api/test', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }),
      config
    );
    const { rows: forwardedRows } = await query('select 1 as found from rate_limits where key = $1', [
      `${config.id}:1.1.1.1`
    ]);
    expect(forwardedRows).toHaveLength(1);

    await checkRateLimit(new Request('http://localhost/api/test', { headers: { 'x-real-ip': '3.3.3.3' } }), config);
    const { rows: realIpRows } = await query('select 1 as found from rate_limits where key = $1', [
      `${config.id}:3.3.3.3`
    ]);
    expect(realIpRows).toHaveLength(1);

    await checkRateLimit(new Request('http://localhost/api/test'), config);
    const { rows: unknownRows } = await query('select 1 as found from rate_limits where key = $1', [
      `${config.id}:unknown`
    ]);
    expect(unknownRows).toHaveLength(1);
  });

  it('two different configs never share a counter for the same IP', async () => {
    const loginLike = { id: 'test-multi-a', max: 1, windowSeconds: 900, message: 'a' };
    const newsletterLike = { id: 'test-multi-b', max: 1, windowSeconds: 900, message: 'b' };
    const ip = '7.7.7.7';

    const a1 = await checkRateLimit(requestFromIp(ip), loginLike);
    expect(a1.limited).toBe(false);
    // loginLike is now at its max for this IP -- newsletterLike must be
    // completely unaffected, matching separate express-rate-limit
    // middleware instances each with their own in-memory store.
    const b1 = await checkRateLimit(requestFromIp(ip), newsletterLike);
    expect(b1.limited).toBe(false);
  });
});

describe('B1 fix (final whole-branch review): withApiHandler applies the global rate limit to real routes', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  it(
    'GET /api/products (no route-specific limiter) is 200 for globalRateLimit.max requests, then 429 with the exact global message',
    async () => {
      const ip = 'global-limit-test.1';

      for (let i = 0; i < globalRateLimit.max; i++) {
        const res = await productsListRoute(getRequestFromIp('/api/products', ip));
        expect(res.status, `request ${i + 1} of ${globalRateLimit.max} should not be limited`).toBe(200);
      }

      const overLimit = await productsListRoute(getRequestFromIp('/api/products', ip));
      expect(overLimit.status).toBe(429);
      await expect(overLimit.json()).resolves.toEqual({
        success: false,
        message: globalRateLimit.message
      });
    },
    60000
  );

  it('a single POST /api/auth/login request consumes BOTH the global counter and the login counter', async () => {
    const ip = 'both-counters-test.1';

    const res = await loginRoute(
      postRequestFromIp('/api/auth/login', { email: 'nobody@zahzanmigrationtest.com', password: 'wrong' }, ip)
    );
    // Invalid credentials -- the route's own body still ran (proving the
    // global check, when not limited, falls through to the handler exactly
    // as before), so this is 401, not 429.
    expect(res.status).toBe(401);

    const { rows: globalRows } = await query('select count from rate_limits where key = $1', [`global:${ip}`]);
    expect(globalRows).toHaveLength(1);
    expect(globalRows[0].count).toBe(1);

    const { rows: loginRows } = await query('select count from rate_limits where key = $1', [`login:${ip}`]);
    expect(loginRows).toHaveLength(1);
    expect(loginRows[0].count).toBe(1);
  });

  it(
    "ordering: the global limiter runs BEFORE the route-specific one -- exhausting login's own (lower) max still reports login's message, not the global one, proving both counters are independently enforced on every request",
    async () => {
      const ip = 'ordering-test.1';

      for (let i = 0; i < loginRateLimit.max; i++) {
        const res = await loginRoute(
          postRequestFromIp('/api/auth/login', { email: 'nobody@zahzanmigrationtest.com', password: 'wrong' }, ip)
        );
        expect(res.status, `request ${i + 1} of ${loginRateLimit.max} should not be limited`).toBe(401);
      }

      const overLimit = await loginRoute(
        postRequestFromIp('/api/auth/login', { email: 'nobody@zahzanmigrationtest.com', password: 'wrong' }, ip)
      );
      expect(overLimit.status).toBe(429);
      await expect(overLimit.json()).resolves.toEqual({
        success: false,
        message: loginRateLimit.message
      });

      // The global counter runs FIRST on every single request regardless of
      // what the route-specific check later decides -- including the
      // (loginRateLimit.max + 1)-th request, which the login check itself
      // rejects with 429, but only AFTER the global check already ran and
      // incremented its own counter (globalRateLimit.max is 200, far above
      // loginRateLimit.max + 1, so the global check itself never limits
      // here). So the global counter sits at loginRateLimit.max + 1 -- one
      // consumption per request made, with no early exit.
      const { rows: globalRows } = await query('select count from rate_limits where key = $1', [`global:${ip}`]);
      expect(globalRows[0].count).toBe(loginRateLimit.max + 1);
    },
    60000
  );
});
