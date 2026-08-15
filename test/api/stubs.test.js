// Task 12 (task-12-brief.md): route-level tests for the four permanent 501
// stubs -- app/api/stories/route.js (POST, GET) and app/api/try-on/route.js
// + app/api/try-on/[id]/route.js (POST, GET). GC4 / MIGRATION_PLAN.md sec6.2
// item 11: these must stay 501 stubs, not be implemented.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

import { POST as storiesPostRoute, GET as storiesGetRoute } from '../../app/api/stories/route.js';
import { POST as tryOnPostRoute } from '../../app/api/try-on/route.js';
import { GET as tryOnGetRoute } from '../../app/api/try-on/[id]/route.js';

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

function postRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'POST', headers });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

const EXPECTED_STUB_BODY = { success: false, message: 'Endpoint not implemented yet' };

let userCounter = 0;
async function insertUser() {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, role, is_active, is_email_verified)
     values ($1, $2, $3, $4, true, true)
     returning *`,
    ['Stub', 'Tester', `stub-fixture-${userCounter}@zahzanmigrationtest.com`, 'customer']
  );
  return rows[0];
}

function authHeader(user) {
  return { authorization: `Bearer ${generateToken(user.id, user.role)}` };
}

describe('permanent 501 stubs (Task 12)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('GET /api/stories -- public, always 501 -- shape matches tools/golden/088-stubs.stories-get.json', () => {
    it('returns 501 with the exact body, no auth required', async () => {
      const res = await storiesGetRoute(getRequest('/api/stories'));
      expect(res.status).toBe(501);
      await expect(res.json()).resolves.toEqual(EXPECTED_STUB_BODY);
    });
  });

  describe('POST /api/stories -- protected -- shape matches tools/golden/104-extra2.stories-post.json', () => {
    it('returns 501 with the exact body when authenticated', async () => {
      const user = await insertUser();
      const res = await storiesPostRoute(postRequest('/api/stories', authHeader(user)));
      expect(res.status).toBe(501);
      await expect(res.json()).resolves.toEqual(EXPECTED_STUB_BODY);
    });

    it('rejects an unauthenticated request with 401, never reaching the 501 stub', async () => {
      const res = await storiesPostRoute(postRequest('/api/stories'));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).not.toBe('Endpoint not implemented yet');
    });
  });

  describe('POST /api/try-on -- protected -- shape matches tools/golden/087-stubs.try-on-post.json', () => {
    it('returns 501 with the exact body when authenticated', async () => {
      const user = await insertUser();
      const res = await tryOnPostRoute(postRequest('/api/try-on', authHeader(user)));
      expect(res.status).toBe(501);
      await expect(res.json()).resolves.toEqual(EXPECTED_STUB_BODY);
    });

    it('rejects an unauthenticated request with 401, never reaching the 501 stub', async () => {
      const res = await tryOnPostRoute(postRequest('/api/try-on'));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).not.toBe('Endpoint not implemented yet');
    });
  });

  describe('GET /api/try-on/:id -- protected -- shape matches tools/golden/103-extra2.tryon-get-by-id.json', () => {
    it('returns 501 with the exact body when authenticated, any id', async () => {
      const user = await insertUser();
      const res = await tryOnGetRoute(
        getRequest('/api/try-on/000000000000000000000000', authHeader(user)),
        paramsContext({ id: '000000000000000000000000' })
      );
      expect(res.status).toBe(501);
      await expect(res.json()).resolves.toEqual(EXPECTED_STUB_BODY);
    });

    it('rejects an unauthenticated request with 401, never reaching the 501 stub', async () => {
      const res = await tryOnGetRoute(getRequest('/api/try-on/000000000000000000000000'), paramsContext({ id: '000000000000000000000000' }));
      expect(res.status).toBe(401);
    });
  });
});
