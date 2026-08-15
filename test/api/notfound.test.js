// Fix report follow-up to Task 8 (see task-8-report.md's "Concerns for the
// reviewer" section, and this fix's report appended to the same file):
// the migrated app had no catch-all for unmatched /api/* paths, so such
// requests fell through to Next's default HTML 404 page instead of
// server/middleware/errorMiddleware.js's `notFound` JSON envelope
// (`{ success: false, message: 'Not Found - ' + req.originalUrl }`,
// req.originalUrl INCLUDING the query string).
//
// app/api/[...catchAll]/route.js reproduces that envelope via
// lib/http.js's notFound() helper. No database access happens anywhere in
// that file, so unlike test/api/auth.test.js this suite needs no PGlite
// migration fixture -- it exercises the exported route functions directly,
// the same way test/lib/http.test.js exercises lib/http.js's exports
// directly.

import { describe, expect, it } from 'vitest';
import {
  DELETE as catchAllDelete,
  GET as catchAllGet,
  HEAD as catchAllHead,
  OPTIONS as catchAllOptions,
  PATCH as catchAllPatch,
  POST as catchAllPost,
  PUT as catchAllPut
} from '../../app/api/[...catchAll]/route.js';

function request(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

describe('app/api/[...catchAll]/route.js (Task 8 fix: catch-all 404 parity)', () => {
  it('GET /api/auth/verify-email?token=whatever matches golden 089 exactly, query string included', async () => {
    const res = await catchAllGet(request('GET', '/api/auth/verify-email?token=whatever'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      success: false,
      message: 'Not Found - /api/auth/verify-email?token=whatever'
    });
  });

  it('POST /api/auth/change-password matches golden 090 exactly', async () => {
    const res = await catchAllPost(request('POST', '/api/auth/change-password', { oldPassword: 'x', newPassword: 'y' }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      success: false,
      message: 'Not Found - /api/auth/change-password'
    });
  });

  it('a nested, multi-segment unmatched path reports its own full path', async () => {
    const res = await catchAllGet(request('GET', '/api/does/not/exist'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      success: false,
      message: 'Not Found - /api/does/not/exist'
    });
  });

  it('preserves multiple query parameters verbatim, in the order given', async () => {
    const res = await catchAllGet(request('GET', '/api/auth/verify-email?token=abc&extra=1'));
    const body = await res.json();
    expect(body.message).toBe('Not Found - /api/auth/verify-email?token=abc&extra=1');
  });

  it('a path with no query string has no trailing "?"', async () => {
    const res = await catchAllGet(request('GET', '/api/nonexistent'));
    const body = await res.json();
    expect(body.message).toBe('Not Found - /api/nonexistent');
  });

  it('every exported HTTP method verb produces the same envelope for the same path (Express\'s notFound was method-agnostic)', async () => {
    const path = '/api/auth/change-password';
    const handlers = {
      GET: catchAllGet,
      POST: catchAllPost,
      PUT: catchAllPut,
      PATCH: catchAllPatch,
      DELETE: catchAllDelete,
      HEAD: catchAllHead,
      OPTIONS: catchAllOptions
    };

    for (const [method, handler] of Object.entries(handlers)) {
      const res = await handler(request(method, path));
      expect(res.status).toBe(404);
      // Each export is the same underlying handle() function (see
      // app/api/[...catchAll]/route.js), so calling it directly here --
      // rather than through a real HTTP transport that would strip a HEAD
      // response's body -- returns the identical Response object every
      // other verb returns.
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: `Not Found - ${path}`
      });
    }
  });

  it('the response has no origin/host prefix, only pathname + search', async () => {
    const res = await catchAllGet(request('GET', '/api/whatever?x=1'));
    const body = await res.json();
    expect(body.message).not.toContain('localhost');
    expect(body.message).not.toContain('http');
  });
});
