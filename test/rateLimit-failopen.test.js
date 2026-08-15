// N1 fix regression coverage: checkRateLimit() (lib/rateLimit.js) must FAIL
// OPEN when the rate-limit datastore itself is unreachable (connection
// refused, pool exhausted, missing table, etc), not turn every one of the
// 67 routes wired through withApiHandler into a 500. The clearest instance
// of the regression this closes: GET /api/health exists specifically to
// report a DB outage as `200 { dbStatus: 'disconnected' }` (matching
// tools/golden/001-health.json), but withApiHandler's own unguarded
// checkRateLimit call used to throw first, before the health route's own
// try/catch around `select 1` ever ran.
//
// `lib/db.js`'s `query` is mocked (wrapping, not replacing, the real
// PGlite-backed implementation -- see test/api/payments.test.js for the
// same wrap-don't-replace pattern) so individual calls can be made to throw
// on demand, simulating an infra-level failure without needing a real
// unreachable database.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrationViaQuery } from './helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

// When true, every query issued through the mocked `query()` throws a
// simulated infrastructure error. When it's a Set of substrings, only calls
// whose SQL text contains one of those substrings throw; everything else
// falls through to the real PGlite-backed implementation.
let simulateFailureFor = null; // null | true | Set<string>

vi.mock('../lib/db.js', async (importOriginal) => {
  const actual = await importOriginal();
  const realQuery = actual.query;
  const mockedQuery = vi.fn(async (text, params) => {
    const shouldFail =
      simulateFailureFor === true ||
      (simulateFailureFor instanceof Set && [...simulateFailureFor].some((needle) => text.includes(needle)));
    if (shouldFail) {
      throw new Error('simulated infra failure: connection refused');
    }
    return realQuery(text, params);
  });
  return { ...actual, query: mockedQuery };
});

const { query, close } = await import('../lib/db.js');
const { checkRateLimit, globalRateLimit } = await import('../lib/rateLimit.js');

import { GET as productsListRoute } from '../app/api/products/route.js';
import { GET as healthRoute } from '../app/api/health/route.js';

function getRequestFromIp(path, ip) {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip }
  });
}

describe('N1 fix: checkRateLimit() fails open when the datastore is unreachable', () => {
  beforeAll(async () => {
    simulateFailureFor = null;
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    simulateFailureFor = null;
  });

  afterEach(() => {
    simulateFailureFor = null;
  });

  it('(a) with a working DB, limiting still works exactly as before', async () => {
    const config = { id: 'test-failopen-control', max: 2, windowSeconds: 900, message: 'blocked' };
    const ip = 'failopen-control.1';

    const first = await checkRateLimit(getRequestFromIp('/api/test', ip), config);
    expect(first.limited).toBe(false);
    const second = await checkRateLimit(getRequestFromIp('/api/test', ip), config);
    expect(second.limited).toBe(false);

    const third = await checkRateLimit(getRequestFromIp('/api/test', ip), config);
    expect(third.limited).toBe(true);
    expect(third.response.status).toBe(429);
  });

  it('(b) when the rate-limit query throws, the request proceeds and the handler’s own response is returned', async () => {
    // Only the check_rate_limit() call fails; every other query (including
    // GET /api/products' own product listing) still works normally --
    // proving the fallthrough reaches the real handler, not just that
    // "something" 200s.
    simulateFailureFor = new Set(['check_rate_limit']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await productsListRoute(getRequestFromIp('/api/products', 'failopen-products.1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data ?? body.products)).toBe(true);

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatch(/rate-limit datastore unreachable/);

    warnSpy.mockRestore();
  });

  it(
    '(c) GET /api/health with a fully unreachable DB returns 200 with dbStatus "disconnected", not a 500 ' +
      '(golden: tools/golden/001-health.json)',
    async () => {
      // The whole datastore is down: both withApiHandler's own global
      // checkRateLimit call AND the health route's own `select 1` ping
      // fail. Before the N1 fix, the FIRST of those (checkRateLimit, which
      // runs before the handler body) turned this into an uncaught 500
      // with a raw driver error, making the health route's own try/catch
      // unreachable.
      simulateFailureFor = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await healthRoute(getRequestFromIp('/api/health', 'failopen-health.1'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        message: 'Zahzan API is running',
        data: {
          dbStatus: 'disconnected'
        }
      });

      warnSpy.mockRestore();
    }
  );
});
