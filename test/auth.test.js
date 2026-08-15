import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAdmin, requireAuth } from '../lib/auth.js';
import { generateToken } from '../lib/jwt.js';
import { applyMigrationViaQuery } from './helpers/applyMigration.js';

// Forces lib/db.js onto the PGlite driver. Read at call time inside
// query()/close(), not at import time, so setting it here (before any
// query() call happens, in beforeAll below) is sufficient regardless of
// import ordering.
process.env.ZAHZAN_DB_DRIVER = 'pglite';

// Static import so lib/auth.js and this test file share the exact same
// lib/db.js module instance -- and therefore the exact same lazily-
// created PGlite singleton -- within this test process.
const { query, close } = await import('../lib/db.js');

function requestWithAuthHeader(headerValue) {
  const headers = headerValue !== undefined ? { authorization: headerValue } : {};
  return new Request('http://localhost/api/test', { headers });
}

describe('lib/auth.js (requireAuth / requireAdmin)', () => {
  let customerId;
  let adminId;

  beforeAll(async () => {
    await applyMigrationViaQuery(query);

    const { rows: customerRows } = await query(
      `insert into users (first_name, last_name, email, role) values ($1, $2, $3, $4) returning id`,
      ['Sara', 'Malik', 'sara@example.com', 'customer']
    );
    customerId = customerRows[0].id;

    const { rows: adminRows } = await query(
      `insert into users (first_name, last_name, email, role) values ($1, $2, $3, $4) returning id`,
      ['Contract', 'Admin', 'admin@example.com', 'admin']
    );
    adminId = adminRows[0].id;
  });

  afterAll(async () => {
    await close();
  });

  it('a token minted by lib/jwt.js verifies and resolves the user row', async () => {
    const token = generateToken(customerId, 'customer');
    const { user, response } = await requireAuth(requestWithAuthHeader(`Bearer ${token}`));

    expect(response).toBeUndefined();
    expect(user).toBeDefined();
    expect(user.id).toBe(customerId);
    expect(user.email).toBe('sara@example.com');
    expect(user.role).toBe('customer');
  });

  it('no Authorization header -> "Not authorized, no token provided"', async () => {
    const { user, response } = await requireAuth(requestWithAuthHeader());

    expect(user).toBeUndefined();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'Not authorized, no token provided'
    });
  });

  it('an Authorization header that does not start with "Bearer" -> the same "no token provided" message', async () => {
    // Matches the original: `req.headers.authorization.startsWith('Bearer')`
    // is the ONLY branch condition -- anything else (missing, or a
    // differently-schemed header) falls through to the same message.
    const { response } = await requireAuth(requestWithAuthHeader('Basic dXNlcjpwYXNz'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'Not authorized, no token provided'
    });
  });

  it('an expired token -> "Not authorized, token failed or expired"', async () => {
    const expiredToken = jwt.sign(
      { id: customerId, role: 'customer' },
      process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure',
      { expiresIn: -10 } // already 10 seconds in the past
    );

    const { user, response } = await requireAuth(requestWithAuthHeader(`Bearer ${expiredToken}`));

    expect(user).toBeUndefined();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'Not authorized, token failed or expired'
    });
  });

  it('a malformed/garbage token -> the same "token failed or expired" message', async () => {
    const { response } = await requireAuth(requestWithAuthHeader('Bearer not-a-real-jwt-at-all'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'Not authorized, token failed or expired'
    });
  });

  it('a valid token for a user that no longer exists -> "User not found or account deactivated"', async () => {
    const { rows } = await query(
      `insert into users (first_name, last_name, email, role) values ($1, $2, $3, $4) returning id`,
      ['Temp', 'User', 'temp-user-to-delete@example.com', 'customer']
    );
    const tempId = rows[0].id;
    const token = generateToken(tempId, 'customer');

    await query('delete from users where id = $1', [tempId]);

    const { user, response } = await requireAuth(requestWithAuthHeader(`Bearer ${token}`));

    expect(user).toBeUndefined();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'User not found or account deactivated'
    });
  });

  it('requireAdmin passes an admin user (returns null)', async () => {
    const { user } = await requireAuth(requestWithAuthHeader(`Bearer ${generateToken(adminId, 'admin')}`));
    expect(requireAdmin(user)).toBeNull();
  });

  it('requireAdmin rejects a customer with the exact 403 message', async () => {
    const { user } = await requireAuth(requestWithAuthHeader(`Bearer ${generateToken(customerId, 'customer')}`));

    const denied = requireAdmin(user);
    expect(denied).not.toBeNull();
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({
      success: false,
      message: 'Access denied: Admin authorization required'
    });
  });

  it('requireAdmin rejects a null/undefined user the same way', () => {
    expect(requireAdmin(null).status).toBe(403);
    expect(requireAdmin(undefined).status).toBe(403);
  });

  it('the resolved user carries no password hash, in any form', async () => {
    // A real-shaped bcrypt hash (not a placeholder) -- if requireAuth's
    // query ever regresses to `select *`, this exact string would show up
    // verbatim in `user.password` and in JSON.stringify(user).
    const seededHash = '$2b$10$abcdefghijklmnopqrstuvKZ1234567890abcdefghijklmnopqrstuv';

    const { rows } = await query(
      `insert into users (first_name, last_name, email, role, password) values ($1, $2, $3, $4, $5) returning id`,
      ['Hashed', 'Person', 'hashed-person@example.com', 'customer', seededHash]
    );
    const hashedUserId = rows[0].id;

    const { user, response } = await requireAuth(
      requestWithAuthHeader(`Bearer ${generateToken(hashedUserId, 'customer')}`)
    );

    expect(response).toBeUndefined();
    expect(user).toBeDefined();
    expect(user.id).toBe(hashedUserId);
    expect(user.password).toBeUndefined();
    expect('password' in user).toBe(false);
    expect(JSON.stringify(user)).not.toContain(seededHash);
  });
});
