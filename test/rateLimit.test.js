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

function requestFromIp(ip, header = 'x-forwarded-for') {
  return new Request('http://localhost/api/test', { headers: { [header]: ip } });
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
