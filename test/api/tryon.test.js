// Contract tests for the Gemini-backed Virtual Try-On endpoints:
//   POST   /api/try-on
//   GET    /api/try-on/:jobId
//   DELETE /api/try-on/:jobId
//
// Ruling P5, docs/PARITY_REPORT.md §12. Replaces the Replicate suite.
//
// Gemini is mocked at the SDK boundary and the garment fetch at global.fetch,
// so this suite makes no network call, needs no GEMINI_API_KEY, and spends no
// money. Storage runs on the in-process 'memory' driver.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: generateContentMock, list: vi.fn() };
    }
  },
  Modality: { IMAGE: 'IMAGE', TEXT: 'TEXT' }
}));

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');
const { __resetMemoryStore, __memoryStoreEntries } = await import('../../lib/storage.js');

const { POST: tryOnPost } = await import('../../app/api/try-on/route.js');
const { GET: tryOnGet, DELETE: tryOnDelete } = await import('../../app/api/try-on/[id]/route.js');

// --- helpers -----------------------------------------------------------------

function req(method, path, { body, headers } = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

const paramsContext = (params) => ({ params: Promise.resolve(params) });

let userCounter = 0;
async function insertUser() {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, role, is_active, is_email_verified)
     values ($1, $2, $3, 'customer', true, true) returning *`,
    ['TryOn', 'Tester', `tryon-${userCounter}@zahzanmigrationtest.com`]
  );
  return rows[0];
}

const authHeader = (u) => ({ authorization: `Bearer ${generateToken(u.id, u.role)}` });

let productCounter = 0;
async function insertProduct(overrides = {}) {
  productCounter += 1;
  const sku = `ZHZ-TRYON-${productCounter}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, category, price, stock, is_active, images, colors, color, fabric, ai_reference_image)
     values ($1, $2, $3, 'Ready to Wear', 25000, 5, $4, $5, $6::jsonb, $7, 'Pure Silk', $8)
     returning *`,
    [
      overrides.name || 'Ivory Silk Kameez',
      `ivory-silk-${productCounter}`,
      sku,
      overrides.isActive ?? true,
      overrides.images || ['https://cdn.test/primary.jpg'],
      JSON.stringify(overrides.colors ?? [{ name: 'Ivory', hex: '#FFFFFF' }]),
      overrides.color ?? 'Ivory',
      overrides.aiReferenceImage ?? ''
    ]
  );
  return rows[0];
}

// A 1x1 PNG, valid signature -- passes lib/imageValidation.js.
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000100' +
    '5c36f8ac0000000049454e44ae426082',
  'hex'
);
const PERSON_PHOTO = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

function geminiReturnsImage(mime = 'image/png') {
  generateContentMock.mockResolvedValue({
    candidates: [
      { content: { parts: [{ inlineData: { mimeType: mime, data: PNG_BYTES.toString('base64') } }] } }
    ]
  });
}

async function post(user, body) {
  return tryOnPost(req('POST', '/api/try-on', { body, headers: authHeader(user) }));
}

// --- suite -------------------------------------------------------------------

describe('Virtual Try-On on Gemini (ruling P5)', () => {
  let fetchSpy;

  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'AIza-test-key');
    vi.stubEnv('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image');
    vi.stubEnv('TRY_ON_MAX_REQUESTS_PER_HOUR', '100');
    vi.stubEnv('TRY_ON_MAX_CONCURRENT_JOBS', '5');
    generateContentMock.mockReset();
    geminiReturnsImage();
    __resetMemoryStore();
    // The garment image fetch. mockImplementation, NOT mockResolvedValue: a
    // Response body can only be read once, so a single shared instance makes
    // the second generation in any test fail with "body already read".
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } })
      );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  describe('authentication', () => {
    it('POST 401s anonymously and never calls Gemini', async () => {
      const res = await tryOnPost(req('POST', '/api/try-on', { body: { humanImage: PERSON_PHOTO } }));
      expect(res.status).toBe(401);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('GET and DELETE 401 anonymously', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      expect((await tryOnGet(req('GET', `/api/try-on/${id}`), paramsContext({ id }))).status).toBe(401);
      expect((await tryOnDelete(req('DELETE', `/api/try-on/${id}`), paramsContext({ id }))).status).toBe(401);
    });

    it('one customer cannot read or delete another customer\'s job', async () => {
      const owner = await insertUser();
      const stranger = await insertUser();
      const product = await insertProduct();

      const created = await (await post(owner, { humanImage: PERSON_PHOTO, productId: product.id })).json();

      const get = await tryOnGet(
        req('GET', `/api/try-on/${created.jobId}`, { headers: authHeader(stranger) }),
        paramsContext({ id: created.jobId })
      );
      expect(get.status).toBe(404);

      const del = await tryOnDelete(
        req('DELETE', `/api/try-on/${created.jobId}`, { headers: authHeader(stranger) }),
        paramsContext({ id: created.jobId })
      );
      expect(del.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('the garment is resolved server-side, never taken from the request', () => {
    it('ignores a garmentImage supplied by the client', async () => {
      const user = await insertUser();
      const product = await insertProduct({ images: ['https://cdn.test/official.jpg'] });

      await post(user, {
        humanImage: PERSON_PHOTO,
        productId: product.id,
        garmentImage: 'https://attacker.test/anything.png'
      });

      const fetched = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(fetched).toContain('https://cdn.test/official.jpg');
      expect(fetched.join(' ')).not.toMatch(/attacker\.test/);
    });

    it('prefers ai_reference_image over the storefront image when set', async () => {
      const user = await insertUser();
      const product = await insertProduct({
        images: ['https://cdn.test/hero.jpg'],
        aiReferenceImage: 'https://cdn.test/ai-flat.jpg'
      });

      await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain('https://cdn.test/ai-flat.jpg');
    });

    it('requires a productId', async () => {
      const user = await insertUser();
      const res = await post(user, { humanImage: PERSON_PHOTO });
      expect(res.status).toBe(400);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('404s an unknown product and 400s an inactive one, before calling Gemini', async () => {
      const user = await insertUser();
      const missing = await post(user, {
        humanImage: PERSON_PHOTO,
        productId: '00000000-0000-0000-0000-000000000000'
      });
      expect(missing.status).toBe(404);

      const inactive = await insertProduct({ isActive: false });
      const res = await post(user, { humanImage: PERSON_PHOTO, productId: inactive.id });
      expect(res.status).toBe(400);

      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('rejects a colour the product does not have', async () => {
      const user = await insertUser();
      const product = await insertProduct({ colors: [{ name: 'Ivory', hex: '#fff' }], color: 'Ivory' });

      const bad = await post(user, { humanImage: PERSON_PHOTO, productId: product.id, color: 'Neon Green' });
      expect(bad.status).toBe(400);

      // Case-insensitive match on a real colour.
      const good = await post(user, { humanImage: PERSON_PHOTO, productId: product.id, color: 'ivory' });
      expect(good.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  describe('upload validation runs before any spend', () => {
    it('rejects an SVG disguised as a PNG and never calls Gemini', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

      const res = await post(user, {
        humanImage: `data:image/png;base64,${svg.toString('base64')}`,
        productId: product.id
      });

      expect(res.status).toBe(400);
      expect((await res.json()).message).toMatch(/SVG/i);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('rejects a missing photograph', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const res = await post(user, { productId: product.id });
      expect(res.status).toBe(400);
      expect(generateContentMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('cost protection', () => {
    it('enforces a per-user hourly limit', async () => {
      vi.stubEnv('TRY_ON_MAX_REQUESTS_PER_HOUR', '2');
      const user = await insertUser();
      const product = await insertProduct();

      expect((await post(user, { humanImage: PERSON_PHOTO, productId: product.id })).status).toBe(200);
      expect((await post(user, { humanImage: PERSON_PHOTO, productId: product.id })).status).toBe(200);

      const third = await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(third.status).toBe(429);
      expect(generateContentMock).toHaveBeenCalledTimes(2);
    });

    it('limits per account, not per IP -- a second user is unaffected', async () => {
      vi.stubEnv('TRY_ON_MAX_REQUESTS_PER_HOUR', '1');
      const a = await insertUser();
      const b = await insertUser();
      const product = await insertProduct();

      expect((await post(a, { humanImage: PERSON_PHOTO, productId: product.id })).status).toBe(200);
      expect((await post(a, { humanImage: PERSON_PHOTO, productId: product.id })).status).toBe(429);
      expect((await post(b, { humanImage: PERSON_PHOTO, productId: product.id })).status).toBe(200);
    });

    it('refuses a concurrent generation while one is still in flight', async () => {
      vi.stubEnv('TRY_ON_MAX_CONCURRENT_JOBS', '1');
      const user = await insertUser();
      const product = await insertProduct();

      // Simulate a job that is still running.
      await query(
        `insert into tryon_jobs (user_id, product_id, input_image, status) values ($1, $2, 'x', 'processing')`,
        [user.id, product.id]
      );

      const res = await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(res.status).toBe(429);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('503s when Gemini is not configured, without touching the database', async () => {
      vi.stubEnv('GEMINI_API_KEY', '');
      const user = await insertUser();
      const product = await insertProduct();

      const res = await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(res.status).toBe(503);

      const { rows } = await query('select count(*)::int n from tryon_jobs where user_id = $1', [user.id]);
      expect(rows[0].n).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('successful generation', () => {
    it('stores the result, records the job, and returns a signed URL', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      const res = await post(user, { humanImage: PERSON_PHOTO, productId: product.id, color: 'Ivory' });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.status).toBe('succeeded');
      expect(body.output).toBeTruthy();
      // Spec envelope carries the same values.
      expect(body.data.status).toBe('completed');
      expect(body.data.imageUrl).toBe(body.output);

      const { rows } = await query('select * from tryon_jobs where id = $1', [body.jobId]);
      expect(rows[0].status).toBe('completed');
      expect(rows[0].output_image).toBeTruthy();
      expect(rows[0].output_mime).toBe('image/png');
      expect(rows[0].completed_at).not.toBeNull();
      expect(rows[0].expires_at).not.toBeNull();

      // The generated bytes really are in storage.
      expect(__memoryStoreEntries().some(([p]) => p === rows[0].output_image)).toBe(true);
    });

    it('sends the person photo and the garment as two inline images', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      await post(user, { humanImage: PERSON_PHOTO, productId: product.id });

      const parts = generateContentMock.mock.calls[0][0].contents[0].parts;
      const images = parts.filter((p) => p.inlineData);
      expect(images).toHaveLength(2);
      expect(parts[0].text).toMatch(/virtual try-on/i);
      expect(parts[0].text).toMatch(/Only modify the clothing/);
    });

    it('never persists the customer photograph', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const body = await (await post(user, { humanImage: PERSON_PHOTO, productId: product.id })).json();

      const { rows } = await query('select input_image from tryon_jobs where id = $1', [body.jobId]);
      expect(rows[0].input_image).not.toMatch(/base64|data:/i);
      expect(rows[0].input_image).toMatch(/not retained/i);
    });

    it('uses the configured model', async () => {
      vi.stubEnv('GEMINI_IMAGE_MODEL', 'gemini-custom-test-model');
      const user = await insertUser();
      const product = await insertProduct();
      await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(generateContentMock.mock.calls[0][0].model).toBe('gemini-custom-test-model');
    });
  });

  // ---------------------------------------------------------------------------
  describe('failure handling', () => {
    it('marks the job failed and returns a generic message when Gemini errors', async () => {
      generateContentMock.mockRejectedValue(new Error('Gemini internal detail 500 projects/secret'));
      const user = await insertUser();
      const product = await insertProduct();

      const res = await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(res.status).toBe(502);
      const body = await res.json();

      expect(body.message).toBe('Virtual try-on could not be completed. Please try again.');
      expect(JSON.stringify(body)).not.toMatch(/projects\/secret|internal detail/i);

      const { rows } = await query('select * from tryon_jobs where user_id = $1', [user.id]);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].error).toBeTruthy(); // kept server-side for support
    });

    it('fails cleanly when Gemini returns text instead of an image', async () => {
      generateContentMock.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'I cannot help with that.' }] } }]
      });
      const user = await insertUser();
      const product = await insertProduct();

      const res = await post(user, { humanImage: PERSON_PHOTO, productId: product.id });
      expect(res.status).toBe(502);

      const { rows } = await query('select status, error from tryon_jobs where user_id = $1', [user.id]);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].error).toMatch(/no_image/);
    });

    it('does not leak the internal error through GET either', async () => {
      generateContentMock.mockRejectedValue(new Error('SECRET-GEMINI-DETAIL'));
      const user = await insertUser();
      const product = await insertProduct();
      await post(user, { humanImage: PERSON_PHOTO, productId: product.id });

      const { rows } = await query('select id from tryon_jobs where user_id = $1', [user.id]);
      const res = await tryOnGet(
        req('GET', `/api/try-on/${rows[0].id}`, { headers: authHeader(user) }),
        paramsContext({ id: rows[0].id })
      );
      const body = await res.json();
      expect(body.status).toBe('failed');
      expect(JSON.stringify(body)).not.toMatch(/SECRET-GEMINI-DETAIL/);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/try-on/:jobId', () => {
    it('returns a completed job with a fresh signed URL', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const created = await (await post(user, { humanImage: PERSON_PHOTO, productId: product.id })).json();

      const res = await tryOnGet(
        req('GET', `/api/try-on/${created.jobId}`, { headers: authHeader(user) }),
        paramsContext({ id: created.jobId })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('succeeded');
      expect(body.output).toBeTruthy();
    });

    it('404s an unknown id and a malformed one, without a 500', async () => {
      const user = await insertUser();
      for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
        const res = await tryOnGet(
          req('GET', `/api/try-on/${id}`, { headers: authHeader(user) }),
          paramsContext({ id })
        );
        expect(res.status).toBe(404);
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /api/try-on/:jobId', () => {
    it('removes both the stored object and the row', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      const created = await (await post(user, { humanImage: PERSON_PHOTO, productId: product.id })).json();

      const { rows: before } = await query('select output_image from tryon_jobs where id = $1', [created.jobId]);
      const path = before[0].output_image;
      expect(__memoryStoreEntries().some(([p]) => p === path)).toBe(true);

      const res = await tryOnDelete(
        req('DELETE', `/api/try-on/${created.jobId}`, { headers: authHeader(user) }),
        paramsContext({ id: created.jobId })
      );
      expect(res.status).toBe(200);

      expect(__memoryStoreEntries().some(([p]) => p === path)).toBe(false);
      const { rows: after } = await query('select * from tryon_jobs where id = $1', [created.jobId]);
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('retention', () => {
    it('purge_expired() deletes expired try-on jobs', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      await query(
        `insert into tryon_jobs (user_id, product_id, input_image, status, expires_at)
         values ($1, $2, 'x', 'completed', now() - interval '1 hour')`,
        [user.id, product.id]
      );
      await query(
        `insert into tryon_jobs (user_id, product_id, input_image, status, expires_at)
         values ($1, $2, 'y', 'completed', now() + interval '24 hours')`,
        [user.id, product.id]
      );

      await query('select purge_expired()');

      const { rows } = await query('select input_image from tryon_jobs where user_id = $1', [user.id]);
      expect(rows.map((r) => r.input_image)).toEqual(['y']);
    });
  });
});
