// Task 8 (task-8-brief.md): route-level tests for GET /api/health and the
// nine app/api/auth/* route handlers, exercised as real functions against a
// PGlite-backed lib/db.js -- the same pattern test/auth.test.js and
// test/rateLimit.test.js already established for lib/*.js.
//
// Per Ruling C3 (task-8-brief.md, binding): response SHAPE and exact
// MESSAGE STRINGS are asserted against the golden files named in comments
// below. Whole-body equality against a golden is deliberately NOT done --
// ids/timestamps legitimately differ between the Mongo-seeded goldens and
// this PGlite fixture data (Task 15's job).
//
// Every mutating request is given its own unique x-forwarded-for IP via
// postRequest()'s automatic counter, so the five rate limiters this task
// wires up (registerRateLimit, loginRateLimit, passwordResetRateLimit) are
// exercised for real by lib/rateLimit.js without the many requests across
// this file's many test cases tripping each other's shared per-IP counters
// (registerRateLimit: max 10/hour; passwordResetRateLimit: max 5/15min,
// shared between forgot-password AND reset-password, matching
// server/routes/authRoutes.js reusing the same `passwordResetLimiter`
// instance on both routes).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

// Static import so every route handler and this test file share the exact
// same lib/db.js module instance (and therefore the same lazily-created
// PGlite singleton) within this test process -- same trick test/auth.test.js
// and test/rateLimit.test.js use.
const { query, close } = await import('../../lib/db.js');

import { GET as healthRoute } from '../../app/api/health/route.js';
import { POST as registerRoute } from '../../app/api/auth/register/route.js';
import { POST as loginRoute } from '../../app/api/auth/login/route.js';
import { POST as googleRoute } from '../../app/api/auth/google/route.js';
import { POST as facebookRoute } from '../../app/api/auth/facebook/route.js';
import { POST as refreshRoute } from '../../app/api/auth/refresh/route.js';
import { POST as logoutRoute } from '../../app/api/auth/logout/route.js';
import { POST as forgotPasswordRoute } from '../../app/api/auth/forgot-password/route.js';
import { POST as resetPasswordRoute } from '../../app/api/auth/reset-password/route.js';
import { GET as meRoute } from '../../app/api/auth/me/route.js';

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 60000) % 250}.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`;
}

function postRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp(), ...headers },
    body: JSON.stringify(body)
  });
}

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

async function registerUser(overrides = {}) {
  const res = await registerRoute(
    postRequest('/api/auth/register', {
      firstName: 'Fixture',
      lastName: 'User',
      password: 'Password@123',
      ...overrides
    })
  );
  const body = await res.json();
  return { res, body };
}

describe('GET /api/health and app/api/auth/* route handlers (Task 8)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('GET /api/health', () => {
    it('reports a connected db status -- shape matches tools/golden/001-health.json', async () => {
      const res = await healthRoute(getRequest('/api/health'));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Zahzan API is running',
        data: {
          dbStatus: 'connected',
          environment: expect.any(String),
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('POST /api/auth/register -> POST /api/auth/login round trip', () => {
    it('registers a new account then logs in with the same credentials', async () => {
      const email = 'roundtrip@zahzanmigrationtest.com';

      const { res: registerRes, body: registerBody } = await registerUser({
        firstName: 'Round',
        lastName: 'Trip',
        email,
        password: 'Roundtrip@123',
        confirmPassword: 'Roundtrip@123',
        phone: '03001112222'
      });

      // Shape + exact message checked against tools/golden/002-auth.register.json.
      expect(registerRes.status).toBe(201);
      expect(registerBody.success).toBe(true);
      expect(registerBody.message).toBe('Account created successfully. Welcome to ZAHZAN!');
      expect(typeof registerBody.token).toBe('string');
      expect(typeof registerBody.refreshToken).toBe('string');
      expect(registerBody.user).toEqual({
        id: expect.any(String),
        firstName: 'Round',
        lastName: 'Trip',
        name: 'Round Trip',
        email,
        phone: '03001112222',
        role: 'customer',
        authProvider: 'local',
        isEmailVerified: true
      });
      // Ruling C8: the auth user payload emits `id` only, never `_id`.
      expect('_id' in registerBody.user).toBe(false);

      const loginRes = await loginRoute(postRequest('/api/auth/login', { email, password: 'Roundtrip@123' }));
      // Shape + exact message checked against tools/golden/003-auth.login.json.
      expect(loginRes.status).toBe(200);
      const loginBody = await loginRes.json();
      expect(loginBody.success).toBe(true);
      expect(loginBody.message).toBe('Login successful.');
      expect(loginBody.user.id).toBe(registerBody.user.id);
      expect(loginBody.user.email).toBe(email);
    });
  });

  describe('POST /api/auth/register validation branches', () => {
    it('rejects a duplicate email with the exact message', async () => {
      const email = 'duplicate@zahzanmigrationtest.com';
      const payload = { firstName: 'Dup', lastName: 'One', email, confirmPassword: 'Password@123' };

      const { res: first } = await registerUser(payload);
      expect(first.status).toBe(201);

      const second = await registerRoute(
        postRequest('/api/auth/register', { ...payload, password: 'Password@123' })
      );
      expect(second.status).toBe(400);
      await expect(second.json()).resolves.toEqual({
        success: false,
        message: 'An account with this email address already exists.'
      });
    });

    it('rejects a password shorter than 6 characters', async () => {
      const { res } = await registerUser({
        firstName: 'Short',
        lastName: 'Pass',
        email: 'shortpass@zahzanmigrationtest.com',
        password: 'abc'
      });
      expect(res.status).toBe(400);
    });

    it('a password shorter than 6 characters gets the exact message', async () => {
      const res = await registerRoute(
        postRequest('/api/auth/register', {
          firstName: 'Short',
          lastName: 'Pass2',
          email: 'shortpass2@zahzanmigrationtest.com',
          password: 'abc'
        })
      );
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    });

    it('rejects a mismatched confirmPassword with the exact message', async () => {
      const res = await registerRoute(
        postRequest('/api/auth/register', {
          firstName: 'Mismatch',
          lastName: 'Confirm',
          email: 'mismatch@zahzanmigrationtest.com',
          password: 'Password@123',
          confirmPassword: 'Password@456'
        })
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Passwords do not match.'
      });
    });
  });

  describe('POST /api/auth/login failure branches', () => {
    it('wrong password -> 401, matching tools/golden/010-auth.login-wrong-password.json', async () => {
      const email = 'wrongpass@zahzanmigrationtest.com';
      await registerUser({ firstName: 'Wrong', lastName: 'Pass', email, password: 'CorrectPass@123' });

      const res = await loginRoute(postRequest('/api/auth/login', { email, password: 'TotallyWrong@1' }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid email or password.'
      });
    });

    it('a deactivated account -> 403 with the exact message', async () => {
      const email = 'deactivated@zahzanmigrationtest.com';
      const { body } = await registerUser({
        firstName: 'De',
        lastName: 'Active',
        email,
        password: 'Password@123'
      });

      await query('update users set is_active = false where id = $1', [body.user.id]);

      const res = await loginRoute(postRequest('/api/auth/login', { email, password: 'Password@123' }));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Account has been deactivated. Please contact client support.'
      });
    });
  });

  describe('GET /api/auth/me', () => {
    it('no token -> 401, matching tools/golden/011-auth.me-no-token.json', async () => {
      const res = await meRoute(getRequest('/api/auth/me'));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Not authorized, no token provided'
      });
    });

    it('a bad/malformed token -> 401, matching tools/golden/012-auth.me-malformed-token.json', async () => {
      const res = await meRoute(getRequest('/api/auth/me', { authorization: 'Bearer not-a-real-jwt' }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Not authorized, token failed or expired'
      });
    });

    it('a good token -> 200 with the user, shape matches tools/golden/004-auth.me.json', async () => {
      const email = 'me-route@zahzanmigrationtest.com';
      const { body: registerBody } = await registerUser({
        firstName: 'Me',
        lastName: 'Route',
        email,
        password: 'Password@123'
      });

      const res = await meRoute(getRequest('/api/auth/me', { authorization: `Bearer ${registerBody.token}` }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user).toMatchObject({
        id: registerBody.user.id,
        firstName: 'Me',
        lastName: 'Route',
        name: 'Me Route',
        email,
        role: 'customer',
        authProvider: 'local',
        isEmailVerified: true
      });
      // Unlike register/login, /me includes createdAt (golden 004 vs 003).
      expect(typeof body.user.createdAt).toBe('string');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('a revoked refresh token fails with the exact message', async () => {
      const { body } = await registerUser({
        firstName: 'Refresh',
        lastName: 'Revoked',
        email: 'refresh-revoked@zahzanmigrationtest.com',
        password: 'Password@123'
      });

      await query('update refresh_tokens set is_revoked = true where token = $1', [body.refreshToken]);

      const res = await refreshRoute(postRequest('/api/auth/refresh', { refreshToken: body.refreshToken }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Refresh token is revoked or expired.'
      });
    });

    it('a valid refresh token renews the access token -- shape matches tools/golden/005-auth.refresh.json', async () => {
      const { body } = await registerUser({
        firstName: 'Refresh',
        lastName: 'Valid',
        email: 'refresh-valid@zahzanmigrationtest.com',
        password: 'Password@123'
      });

      const res = await refreshRoute(postRequest('/api/auth/refresh', { refreshToken: body.refreshToken }));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Access token renewed successfully.',
        token: expect.any(String)
      });
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('returns the generic response for an unknown email', async () => {
      const res = await forgotPasswordRoute(
        postRequest('/api/auth/forgot-password', { email: 'does-not-exist@zahzanmigrationtest.com' })
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    });

    it('returns the identical generic response for a real account, and creates a reset token', async () => {
      const email = 'forgot-real@zahzanmigrationtest.com';
      const { body } = await registerUser({ firstName: 'Forgot', lastName: 'Real', email, password: 'Password@123' });

      const res = await forgotPasswordRoute(postRequest('/api/auth/forgot-password', { email }));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });

      const { rows } = await query('select is_used from password_reset_tokens where user_id = $1', [body.user.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].is_used).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('an expired token fails with the exact message', async () => {
      const { body } = await registerUser({
        firstName: 'Reset',
        lastName: 'Expired',
        email: 'reset-expired@zahzanmigrationtest.com',
        password: 'Password@123'
      });

      const expiredToken = 'expired-reset-token-fixture';
      await query(
        `insert into password_reset_tokens (user_id, token, expires_at)
         values ($1, $2, now() - interval '1 hour')`,
        [body.user.id, expiredToken]
      );

      const res = await resetPasswordRoute(
        postRequest('/api/auth/reset-password', { token: expiredToken, newPassword: 'NewPassword@123' })
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid or expired password reset token.'
      });
    });

    it("a valid token succeeds and revokes every one of the user's refresh tokens", async () => {
      const email = 'reset-valid@zahzanmigrationtest.com';
      const { body } = await registerUser({
        firstName: 'Reset',
        lastName: 'Valid',
        email,
        password: 'OldPassword@123'
      });

      const validToken = 'valid-reset-token-fixture';
      await query(
        `insert into password_reset_tokens (user_id, token, expires_at)
         values ($1, $2, now() + interval '1 hour')`,
        [body.user.id, validToken]
      );

      const res = await resetPasswordRoute(
        postRequest('/api/auth/reset-password', { token: validToken, newPassword: 'NewPassword@123' })
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Password reset successfully. You can now log in with your new password.'
      });

      const { rows: tokenRows } = await query('select is_used from password_reset_tokens where token = $1', [
        validToken
      ]);
      expect(tokenRows[0].is_used).toBe(true);

      const { rows: refreshRows } = await query('select is_revoked from refresh_tokens where user_id = $1', [
        body.user.id
      ]);
      expect(refreshRows.length).toBeGreaterThan(0);
      expect(refreshRows.every((row) => row.is_revoked === true)).toBe(true);

      const oldLogin = await loginRoute(postRequest('/api/auth/login', { email, password: 'OldPassword@123' }));
      expect(oldLogin.status).toBe(401);

      const newLogin = await loginRoute(postRequest('/api/auth/login', { email, password: 'NewPassword@123' }));
      expect(newLogin.status).toBe(200);
    });
  });

  describe('POST /api/auth/google and POST /api/auth/facebook', () => {
    it('creates a new account on first Google sign-in -- shape matches tools/golden/091-extra2.auth-google.json', async () => {
      const res = await googleRoute(
        postRequest('/api/auth/google', {
          googleId: 'google-uid-test-001',
          email: 'google-signin@zahzanmigrationtest.com',
          firstName: 'Google',
          lastName: 'Signin'
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Google authentication successful.');
      expect(body.user).toEqual({
        id: expect.any(String),
        firstName: 'Google',
        lastName: 'Signin',
        name: 'Google Signin',
        email: 'google-signin@zahzanmigrationtest.com',
        phone: '',
        role: 'customer',
        authProvider: 'google',
        isEmailVerified: true
      });
    });

    it('creates a new account on first Facebook sign-in -- shape matches tools/golden/092-extra2.auth-facebook.json', async () => {
      const res = await facebookRoute(
        postRequest('/api/auth/facebook', {
          facebookId: 'facebook-uid-test-001',
          email: 'facebook-signin@zahzanmigrationtest.com',
          firstName: 'Facebook',
          lastName: 'Signin'
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Facebook authentication successful.');
      expect(body.user).toEqual({
        id: expect.any(String),
        firstName: 'Facebook',
        lastName: 'Signin',
        name: 'Facebook Signin',
        email: 'facebook-signin@zahzanmigrationtest.com',
        phone: '',
        role: 'customer',
        authProvider: 'facebook',
        isEmailVerified: true
      });
    });

    it('Facebook sign-in with no email falls back to facebook_<id>@zahzan.com', async () => {
      const res = await facebookRoute(
        postRequest('/api/auth/facebook', {
          facebookId: 'facebook-no-email-uid-002',
          firstName: 'NoEmail',
          lastName: 'Fallback'
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe('facebook_facebook-no-email-uid-002@zahzan.com');
    });

    it('linking Google to an existing local account flips authProvider and forces isEmailVerified true', async () => {
      const email = 'link-google@zahzanmigrationtest.com';
      await registerUser({ firstName: 'Link', lastName: 'Google', email, password: 'Password@123' });

      const res = await googleRoute(
        postRequest('/api/auth/google', { googleId: 'google-link-uid-003', email })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.authProvider).toBe('google');
      expect(body.user.isEmailVerified).toBe(true);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the given refresh token and returns the success message', async () => {
      const { body } = await registerUser({
        firstName: 'Log',
        lastName: 'Out',
        email: 'logout@zahzanmigrationtest.com',
        password: 'Password@123'
      });

      const res = await logoutRoute(postRequest('/api/auth/logout', { refreshToken: body.refreshToken }));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Logged out successfully.'
      });

      const { rows } = await query('select is_revoked from refresh_tokens where token = $1', [body.refreshToken]);
      expect(rows[0].is_revoked).toBe(true);
    });
  });
});
