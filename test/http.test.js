import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, notFound, ok, withErrorHandler } from '../lib/http.js';

// Not explicitly required by task-5-brief.md's Tests section (only
// test/auth.test.js and test/rateLimit.test.js are named), but lib/http.js
// is new production code every other lib/*.js file in this task depends
// on (fail() underpins both requireAuth's and checkRateLimit's error
// responses), and its NODE_ENV-conditional stack-trace behaviour is
// exactly the kind of thing worth locking down with a real test rather
// than trusting by inspection.

describe('lib/http.js', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ok(data, status) returns data as-is with the given status, default 200', async () => {
    const res = ok({ success: true, product: { name: 'Kurta' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, product: { name: 'Kurta' } });

    const created = ok({ success: true }, 201);
    expect(created.status).toBe(201);
  });

  it('fail(message, status) builds the { success: false, message } envelope, default 400', async () => {
    const res = fail('Invalid email or password.', 401);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ success: false, message: 'Invalid email or password.' });

    const defaulted = fail('Bad request');
    expect(defaulted.status).toBe(400);
  });

  it('notFound(path) reproduces errorMiddleware.js\'s exact "Not Found - <path>" message at 404', async () => {
    const res = notFound('/api/auth/verify-email?token=whatever');
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      success: false,
      message: 'Not Found - /api/auth/verify-email?token=whatever'
    });
  });

  it('withErrorHandler: a handler that returns normally is unaffected', async () => {
    const handler = withErrorHandler(async () => ok({ success: true }));
    const res = await handler();
    expect(res.status).toBe(200);
  });

  it('withErrorHandler: a thrown Error becomes { success: false, message }, status 500 by default', async () => {
    const handler = withErrorHandler(async () => {
      throw new Error('Something broke');
    });
    const res = await handler();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ success: false, message: 'Something broke' });
  });

  it('withErrorHandler: honours an explicit .statusCode on the thrown error', async () => {
    const handler = withErrorHandler(async () => {
      const err = new Error('Not found here');
      err.statusCode = 404;
      throw err;
    });
    const res = await handler();
    expect(res.status).toBe(404);
  });

  it('withErrorHandler: an error with no message falls back to "Internal Server Error"', async () => {
    const handler = withErrorHandler(async () => {
      throw new Error();
    });
    const res = await handler();
    const body = await res.json();
    expect(body.message).toBe('Internal Server Error');
  });

  it('withErrorHandler: includes stack ONLY when NODE_ENV === "development" (matches errorMiddleware.js exactly)', async () => {
    const handler = withErrorHandler(async () => {
      throw new Error('boom');
    });

    vi.stubEnv('NODE_ENV', 'production');
    const prodBody = await (await handler()).json();
    expect('stack' in prodBody).toBe(false);

    vi.stubEnv('NODE_ENV', 'development');
    const devBody = await (await handler()).json();
    expect('stack' in devBody).toBe(true);
    expect(typeof devBody.stack).toBe('string');
  });
});
