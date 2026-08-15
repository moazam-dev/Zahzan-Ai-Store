#!/usr/bin/env node
// tools/contract-capture.mjs
//
// Drives a scripted journey over HTTP against a base URL (--base, default
// http://localhost:5000) and writes one normalised JSON file per
// interaction into an output directory (--out, default tools/golden/).
// Task 2 brief.
//
// The journey itself is stack-agnostic: it only knows HTTP paths, methods,
// bodies and expected statuses, so the same script can later be pointed at
// the ported Next.js stack (a later task) by passing a different --base.
//
// Optionally, this script can also boot the target server itself and shut
// it down when the journey finishes (AR5: "the harness must start the
// Express server itself ... wait for /api/health to answer, run the
// journey, and shut the server down"). That's opt-in via --start-cmd /
// --cwd / --env, so the script stays useful against a server someone
// already started by hand (e.g. `next dev` in a later task) too.
//
// Usage (old Express stack, contract-test DB, isolated port):
//   node tools/contract-capture.mjs \
//     --base http://localhost:5099 \
//     --out tools/golden \
//     --cwd server \
//     --start-cmd "node server.js" \
//     --env PORT=5099 \
//     --env MONGODB_URI=mongodb://localhost:27017/zahzan_contract_test \
//     --env RESEND_API_KEY= --env EMAIL_HOST= --env EMAIL_USER=

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

import { normalise, normaliseText, normaliseString } from './lib/normalise.mjs';
import { MongoClient, ObjectId } from 'mongodb';

/**
 * Recursively replaces every occurrence of any string in `raws` with
 * `<TOKEN>`, inside strings, object values and array elements alike. Used
 * only for the handful of genuinely-random one-off values (see the `redact`
 * option on Recorder.call) that don't fit any category in
 * tools/lib/normalise.mjs and have no business being added there.
 */
function redactDeep(value, raws) {
  if (typeof value === 'string') {
    let out = value;
    for (const raw of raws) {
      if (raw) out = out.split(raw).join('<TOKEN>');
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, raws));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, raws);
    return out;
  }
  return value;
}

/**
 * Resolves a product's real id by slug (Task 15 addition). tools/seed-
 * contract-db.mjs's fixture products are seeded with fixed, literal Mongo
 * ObjectId-shaped `_id` values against the old stack; the Postgres port
 * (tools/seed-contract-db-pg.mjs) cannot do the same -- `products.id` is a
 * real `uuid` column (supabase/migrations/0001_init.sql), which rejects a
 * 24-hex-char string outright, so the old stack's ids and the new stack's
 * ids are NEVER the same literal value. This resolves the id the SAME way
 * for both stacks -- one unrecorded GET by the fixture's own (stack-
 * independent) slug -- rather than hardcoding either id scheme, so this
 * script keeps working unmodified no matter which stack `--base` points at.
 * For the OLD stack this returns exactly the same value the previous
 * hardcoded literal did (the seed fixes both), so this is a pure
 * generalisation, not a behaviour change for the baseline capture.
 * Deliberately NOT recorded via `rec.call` -- it must not shift the
 * sequential golden file numbering relative to tools/golden/.
 */
async function resolveProductIdBySlug(base, slug) {
  const res = await fetch(`${base}/api/products/${slug}`);
  if (!res.ok) {
    throw new Error(`resolveProductIdBySlug(${slug}) failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  const id = body?.product?._id ?? body?.product?.id;
  if (!id) throw new Error(`resolveProductIdBySlug(${slug}): no product._id/.id in response`);
  return id;
}

/**
 * Resolves a seeded customer's real user id by logging in (Task 15
 * addition) -- same rationale as resolveProductIdBySlug above: `users.id`
 * is a Postgres uuid, not the old stack's literal Mongo ObjectId, so the
 * only stack-independent way to find "customer2's real id" is to ask the
 * API itself, via credentials tools/seed-contract-db.mjs /
 * tools/seed-contract-db-pg.mjs both fix identically. Unrecorded, same as
 * resolveProductIdBySlug.
 */
async function resolveUserIdByLogin(base, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    throw new Error(`resolveUserIdByLogin(${email}) failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body?.user?.id) throw new Error(`resolveUserIdByLogin(${email}): no user.id in response`);
  return body.user.id;
}

/**
 * Reads the current (single, since the controller deletes prior ones on
 * each new request) email-change token for a user directly out of Mongo.
 * The token is crypto.randomBytes(32).toString('hex') and the API never
 * returns it to any client -- by design it only ever reaches the user by
 * email, and email sending is disabled for capture (see
 * docs/CONTRACT_CAPTURE.md) -- so this is the only way to exercise the
 * `GET /api/users/me/confirm-email-change` success path at all. Same
 * technique tools/seed-contract-db.mjs already uses for the newsletter
 * unsubscribe token, just read live instead of seeded.
 */
async function fetchEmailChangeToken(mongoUri, userId) {
  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const doc = await client.db().collection('emailchangetokens').findOne({ userId: new ObjectId(userId) });
    return doc ? doc.token : null;
  } finally {
    await client.close();
  }
}

/**
 * Task 15 addition: the Postgres-stack equivalent of fetchEmailChangeToken
 * above. There is no Mongo to read from when `--base` points at the ported
 * Next.js/Postgres stack, and PGlite (the local verification driver,
 * AR3/AR4) is in-process WASM with no network listener a separate capture-
 * script process could connect to directly -- so this calls
 * app/api/test-email-change-token/route.js instead, a verification-only
 * route gated to 404 (i.e. a no-op) unless the target server itself has
 * ZAHZAN_DB_DRIVER=pglite set (see that route's header comment). Returns
 * `null` on any non-200 response (same "not found -> null" contract as
 * fetchEmailChangeToken), so the caller's existing skip-with-a-warning
 * fallback covers both "no token exists yet" and "this endpoint isn't
 * available on this target" uniformly.
 */
async function fetchEmailChangeTokenPg(base, userId) {
  const res = await fetch(`${base}/api/test-email-change-token?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.token ?? null;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    base: 'http://localhost:5000',
    out: path.join(REPO_ROOT, 'tools', 'golden'),
    cwd: null,
    startCmd: null,
    env: {},
    healthPath: '/api/health',
    readyTimeoutMs: 20000
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base') args.base = argv[++i];
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--cwd') args.cwd = path.resolve(argv[++i]);
    else if (arg === '--start-cmd') args.startCmd = argv[++i];
    else if (arg === '--health-path') args.healthPath = argv[++i];
    else if (arg === '--ready-timeout-ms') args.readyTimeoutMs = Number(argv[++i]);
    else if (arg === '--env') {
      const kv = argv[++i];
      const eq = kv.indexOf('=');
      const key = eq === -1 ? kv : kv.slice(0, eq);
      const val = eq === -1 ? '' : kv.slice(eq + 1);
      args.env[key] = val;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Server lifecycle (optional)
// ---------------------------------------------------------------------------

function spawnServer({ startCmd, cwd, env }) {
  const [cmd, ...cmdArgs] = startCmd.split(' ');
  const child = spawn(cmd, cmdArgs, {
    cwd: cwd || REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logBuffer = [];
  child.stdout.on('data', (d) => logBuffer.push(`[server stdout] ${d}`));
  child.stderr.on('data', (d) => logBuffer.push(`[server stderr] ${d}`));

  return { child, logBuffer };
}

async function waitForHealth(base, healthPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}${healthPath}`);
      if (res.ok) return;
      lastErr = new Error(`Health check returned status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms: ${lastErr?.message}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

// ---------------------------------------------------------------------------
// Interaction recorder
// ---------------------------------------------------------------------------

class Recorder {
  constructor(base, outDir) {
    this.base = base;
    this.outDir = outDir;
    this.seq = 0;
    this.files = [];
  }

  async init() {
    await rm(this.outDir, { recursive: true, force: true });
    await mkdir(this.outDir, { recursive: true });
  }

  nextFileName(name) {
    this.seq += 1;
    const slug = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    return `${String(this.seq).padStart(3, '0')}-${slug}.json`;
  }

  /**
   * Performs one HTTP call and writes a normalised record to disk.
   *
   * @param {string} name          stable, unique-per-journey interaction name
   * @param {string} method
   * @param {string} pathAndQuery  e.g. "/api/products?category=Kurtas"
   * @param {object} [opts]
   * @param {string} [opts.token]         bearer token to send
   * @param {object} [opts.json]          JSON request body
   * @param {{fields: object, file: {field: string, filename: string, buffer: Buffer, contentType: string}}} [opts.form]
   *        multipart/form-data request
   * @param {number|number[]} opts.expectStatus  status code(s) this call must return
   * @param {boolean} [opts.acceptHtml]   send Accept: text/html instead of application/json
   * @param {string[]} [opts.redact]      raw substrings to blank out of the recorded path/body
   *        (post-normalisation, simple string replace) as <TOKEN>. For one-off values that are
   *        genuinely random per run but never appear in the brief's normaliser categories -- e.g.
   *        a crypto.randomBytes() token read back out of Mongo to exercise a confirm-by-token
   *        endpoint. Deliberately NOT added to tools/lib/normalise.mjs itself: that file's scope
   *        was just narrowed (fix round 1, Finding 2) and a one-off capture-script value has no
   *        business broadening it back out again.
   */
  async call(name, method, pathAndQuery, opts = {}) {
    const { token, json, form, expectStatus, acceptHtml, redact } = opts;

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (acceptHtml) headers['Accept'] = 'text/html';
    else headers['Accept'] = 'application/json';

    let fetchBody;
    let requestBodyForCapture = null;

    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(json);
      requestBodyForCapture = normalise(json);
    } else if (form) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form.fields || {})) {
        fd.append(k, String(v));
      }
      const captured = normalise({ ...(form.fields || {}) });
      if (form.file) {
        const blob = new Blob([form.file.buffer], { type: form.file.contentType });
        fd.append(form.file.field, blob, form.file.filename);
        captured[form.file.field] = `<FILE:${form.file.filename}>`;
      }
      fetchBody = fd;
      requestBodyForCapture = captured;
    }

    const url = `${this.base}${pathAndQuery}`;
    const res = await fetch(url, { method, headers, body: fetchBody });

    const contentType = res.headers.get('content-type') || '';
    let rawBody;
    let normalisedBody;
    if (contentType.includes('application/json')) {
      rawBody = await res.json();
      normalisedBody = normalise(rawBody);
    } else {
      rawBody = await res.text();
      normalisedBody = normaliseText(rawBody);
    }

    if (expectStatus !== undefined) {
      const expected = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
      if (!expected.includes(res.status)) {
        throw new Error(
          `[${name}] ${method} ${pathAndQuery} -> expected status ${expected.join(' or ')}, got ${res.status}.\n` +
            `Response body: ${JSON.stringify(rawBody, null, 2)}`
        );
      }
    }

    let recordedPath = normaliseString(pathAndQuery);
    let recordedRequestBody = requestBodyForCapture;
    let recordedResponseBody = normalisedBody;

    if (redact && redact.length) {
      recordedPath = redactDeep(recordedPath, redact);
      recordedRequestBody = redactDeep(recordedRequestBody, redact);
      recordedResponseBody = redactDeep(recordedResponseBody, redact);
    }

    const record = {
      name,
      method,
      // Normalised too, not just the bodies: a dynamically-created
      // resource id (e.g. an order _id minted during this run) can appear
      // in the URL itself (PATCH /api/orders/<id>/cancel), and that id is
      // exactly as volatile as the same id appearing in a response body.
      // Leaving it raw would make the path differ between the two capture
      // runs the acceptance check diffs against each other, and would also
      // make this record useless for comparing against a future stack
      // that mints its own, differently-shaped ids for the same resource.
      path: recordedPath,
      requestBody: recordedRequestBody,
      status: res.status,
      responseBody: recordedResponseBody
    };

    const fileName = this.nextFileName(name);
    await writeFile(path.join(this.outDir, fileName), JSON.stringify(record, null, 2) + '\n', 'utf8');
    this.files.push(fileName);

    return { status: res.status, body: rawBody };
  }
}

// ---------------------------------------------------------------------------
// The journey (Task 2 brief, section by section, in the specified order)
// ---------------------------------------------------------------------------

async function runJourney(rec, mongoUri) {
  const ctx = {};
  const fixturePng = await readFile(path.join(REPO_ROOT, 'tools', 'fixtures', 'payment-proof.png'));

  // ---- 1. Health -----------------------------------------------------------
  await rec.call('health', 'GET', '/api/health', { expectStatus: 200 });

  // ---- 2. Auth happy path ----------------------------------------------------
  const primary = { email: 'journey.customer@zahzancontract.test', password: 'Journey@12345' };

  {
    const { body } = await rec.call('auth.register', 'POST', '/api/auth/register', {
      json: {
        firstName: 'Sara',
        lastName: 'Malik',
        email: primary.email,
        password: primary.password,
        confirmPassword: primary.password,
        phone: '03001234567'
      },
      expectStatus: 201
    });
    ctx.customerToken = body.token;
    ctx.customerRefreshToken = body.refreshToken;
    ctx.customerId = body.user.id;
  }

  {
    const { body } = await rec.call('auth.login', 'POST', '/api/auth/login', {
      json: { email: primary.email, password: primary.password },
      expectStatus: 200
    });
    ctx.customerToken = body.token;
    ctx.customerRefreshToken = body.refreshToken;
  }

  await rec.call('auth.me', 'GET', '/api/auth/me', { token: ctx.customerToken, expectStatus: 200 });

  {
    const { body } = await rec.call('auth.refresh', 'POST', '/api/auth/refresh', {
      json: { refreshToken: ctx.customerRefreshToken },
      expectStatus: 200
    });
    ctx.customerToken = body.token;
  }

  await rec.call('auth.forgot-password', 'POST', '/api/auth/forgot-password', {
    json: { email: primary.email },
    expectStatus: 200
  });

  // We cannot know the random reset token the server emailed out (email
  // sending is disabled for capture -- see docs/CONTRACT_CAPTURE.md), so
  // reset-password is exercised with a syntactically-plausible but unknown
  // token and captures the resulting failure response, which is itself
  // real, deterministic server behaviour.
  await rec.call('auth.reset-password', 'POST', '/api/auth/reset-password', {
    json: { token: 'a'.repeat(64), newPassword: 'NewJourney@12345' },
    expectStatus: 400
  });

  await rec.call('auth.logout', 'POST', '/api/auth/logout', {
    json: { refreshToken: ctx.customerRefreshToken },
    token: ctx.customerToken,
    expectStatus: 200
  });

  // logout revokes the refresh token/session but the access token (JWT) it
  // already issued is still valid until it expires -- re-login so the rest
  // of the journey has a good token again.
  {
    const { body } = await rec.call('auth.login-again-after-logout', 'POST', '/api/auth/login', {
      json: { email: primary.email, password: primary.password },
      expectStatus: 200
    });
    ctx.customerToken = body.token;
    ctx.customerRefreshToken = body.refreshToken;
  }

  // ---- 3. Auth failures ------------------------------------------------------
  await rec.call('auth.login-wrong-password', 'POST', '/api/auth/login', {
    json: { email: primary.email, password: 'TotallyWrongPass1' },
    expectStatus: 401
  });

  await rec.call('auth.me-no-token', 'GET', '/api/auth/me', { expectStatus: 401 });

  await rec.call('auth.me-malformed-token', 'GET', '/api/auth/me', {
    token: 'not-a-valid-jwt-token',
    expectStatus: 401
  });

  // ---- 4. Products -----------------------------------------------------------
  await rec.call('products.list', 'GET', '/api/products', { expectStatus: 200 });
  await rec.call('products.list-by-category', 'GET', '/api/products?category=Kurtas', { expectStatus: 200 });
  await rec.call('products.list-by-search', 'GET', '/api/products?search=Silk', { expectStatus: 200 });

  // Task 15: resolved dynamically, not hardcoded -- see
  // resolveProductIdBySlug's header comment for why.
  const PRODUCT1_ID = await resolveProductIdBySlug(rec.base, 'ivory-silk-kurta-zhz-001');
  const PRODUCT2_ID = await resolveProductIdBySlug(rec.base, 'emerald-velvet-shawl-zhz-002');
  const PRODUCT3_ID = await resolveProductIdBySlug(rec.base, 'rose-chiffon-dupatta-zhz-003');
  const PRODUCT4_ID = await resolveProductIdBySlug(rec.base, 'noir-formal-set-zhz-004');

  await rec.call('products.get-by-id', 'GET', `/api/products/${PRODUCT1_ID}`, { expectStatus: 200 });
  await rec.call('products.get-by-slug', 'GET', '/api/products/ivory-silk-kurta-zhz-001', { expectStatus: 200 });
  await rec.call('products.get-by-sku', 'GET', '/api/products/ZHZ-002', { expectStatus: 200 });
  await rec.call('products.get-nonexistent', 'GET', '/api/products/0000000000000000000000ff', { expectStatus: 404 });

  // ---- 5. Users --------------------------------------------------------------
  await rec.call('users.me', 'GET', '/api/users/me', { token: ctx.customerToken, expectStatus: 200 });

  await rec.call('users.patch-me', 'PATCH', '/api/users/me', {
    token: ctx.customerToken,
    json: { firstName: 'Sara', lastName: 'Malik-Updated', phone: '03007654321' },
    expectStatus: 200
  });

  {
    const { body } = await rec.call('users.address-create', 'POST', '/api/users/me/addresses', {
      token: ctx.customerToken,
      json: {
        fullName: 'Sara Malik',
        phone: '03007654321',
        addressLine1: '123 Gulberg Boulevard',
        addressLine2: 'Near DHA Phase 5',
        city: 'Lahore',
        province: 'Punjab',
        postalCode: '54000',
        country: 'Pakistan',
        label: 'Home',
        isDefault: true
      },
      expectStatus: 201
    });
    ctx.addressId = body.address._id;
  }

  await rec.call('users.address-list', 'GET', '/api/users/me/addresses', {
    token: ctx.customerToken,
    expectStatus: 200
  });

  await rec.call('users.address-patch', 'PATCH', `/api/users/me/addresses/${ctx.addressId}`, {
    token: ctx.customerToken,
    json: { addressLine2: 'Near DHA Phase 5, Block C', label: 'Home Address' },
    expectStatus: 200
  });

  await rec.call('users.address-set-default', 'PATCH', `/api/users/me/addresses/${ctx.addressId}/default`, {
    token: ctx.customerToken,
    json: {},
    expectStatus: 200
  });

  await rec.call('users.address-delete', 'DELETE', `/api/users/me/addresses/${ctx.addressId}`, {
    token: ctx.customerToken,
    expectStatus: 200
  });

  await rec.call('users.wishlist-get', 'GET', '/api/users/me/wishlist', {
    token: ctx.customerToken,
    expectStatus: 200
  });

  await rec.call('users.wishlist-toggle-on', 'POST', '/api/users/me/wishlist', {
    token: ctx.customerToken,
    json: { productId: PRODUCT2_ID },
    expectStatus: 200
  });

  await rec.call('users.wishlist-toggle-off', 'POST', '/api/users/me/wishlist', {
    token: ctx.customerToken,
    json: { productId: PRODUCT2_ID },
    expectStatus: 200
  });

  await rec.call('users.wishlist-delete', 'DELETE', `/api/users/me/wishlist/${PRODUCT2_ID}`, {
    token: ctx.customerToken,
    expectStatus: 200
  });

  // ---- 6. Cart -----------------------------------------------------------------
  await rec.call('cart.get-autocreate', 'GET', '/api/cart', { token: ctx.customerToken, expectStatus: 200 });

  {
    const { body } = await rec.call('cart.add', 'POST', '/api/cart/items', {
      token: ctx.customerToken,
      json: { productId: PRODUCT1_ID, quantity: 1, selectedSize: 'M' },
      expectStatus: 200
    });
    ctx.cartItemId = body.cart.items[0].cartItemId;
  }

  await rec.call('cart.add-same-again', 'POST', '/api/cart/items', {
    token: ctx.customerToken,
    json: { productId: PRODUCT1_ID, quantity: 1, selectedSize: 'M' },
    expectStatus: 200
  });

  await rec.call('cart.patch-quantity', 'PATCH', `/api/cart/items/${ctx.cartItemId}`, {
    token: ctx.customerToken,
    json: { quantity: 5 },
    expectStatus: 200
  });

  await rec.call('cart.delete-item', 'DELETE', `/api/cart/items/${ctx.cartItemId}`, {
    token: ctx.customerToken,
    expectStatus: 200
  });

  await rec.call('cart.clear', 'DELETE', '/api/cart', { token: ctx.customerToken, expectStatus: 200 });

  // ---- 7. Orders -----------------------------------------------------------------
  const shippingAddress = {
    fullName: 'Sara Malik',
    phone: '03007654321',
    addressLine1: '123 Gulberg Boulevard',
    city: 'Lahore',
    state: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan'
  };

  let order1;
  {
    const { body } = await rec.call('orders.create-cod-1', 'POST', '/api/orders', {
      token: ctx.customerToken,
      json: {
        customerInfo: { fullName: 'Sara Malik', email: primary.email, phone: '03007654321' },
        shippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: PRODUCT3_ID, quantity: 2, selectedSize: 'One Size' },
        paymentChoice: 'cod'
      },
      expectStatus: 201
    });
    order1 = body.order;
  }

  await rec.call('orders.list', 'GET', '/api/orders', { token: ctx.customerToken, expectStatus: 200 });
  await rec.call('orders.my-orders', 'GET', '/api/orders/my-orders', { token: ctx.customerToken, expectStatus: 200 });
  await rec.call('orders.get-by-id', 'GET', `/api/orders/${order1._id}`, { token: ctx.customerToken, expectStatus: 200 });
  await rec.call('orders.get-by-order-number', 'GET', `/api/orders/${order1.orderNumber}`, {
    token: ctx.customerToken,
    expectStatus: 200
  });
  await rec.call('orders.cancel-1', 'PATCH', `/api/orders/${order1._id}/cancel`, {
    token: ctx.customerToken,
    expectStatus: 200
  });

  let order2;
  {
    const { body } = await rec.call('orders.create-cod-2', 'POST', '/api/orders', {
      token: ctx.customerToken,
      json: {
        customerInfo: { fullName: 'Sara Malik', email: primary.email, phone: '03007654321' },
        shippingAddress,
        isBuyNow: true,
        buyNowItem: { productId: PRODUCT4_ID, quantity: 1, selectedSize: 'M' },
        paymentChoice: 'cod'
      },
      expectStatus: 201
    });
    order2 = body.order;
  }

  await rec.call('orders.cancel-2-first', 'PATCH', `/api/orders/${order2._id}/cancel`, {
    token: ctx.customerToken,
    expectStatus: 200
  });
  await rec.call('orders.cancel-2-second', 'PATCH', `/api/orders/${order2._id}/cancel`, {
    token: ctx.customerToken,
    expectStatus: 400
  });

  // ---- 8. Payments -----------------------------------------------------------------
  await rec.call('payments.methods', 'GET', '/api/payments/methods', { expectStatus: 200 });

  let order3;
  {
    const { body } = await rec.call('payments.create-advance-order', 'POST', '/api/orders', {
      token: ctx.customerToken,
      form: {
        fields: {
          customerInfo: JSON.stringify({ fullName: 'Sara Malik', email: primary.email, phone: '03007654321' }),
          shippingAddress: JSON.stringify(shippingAddress),
          isBuyNow: 'true',
          buyNowItem: JSON.stringify({ productId: PRODUCT1_ID, quantity: 1, selectedSize: 'M' }),
          paymentChoice: 'advance',
          paymentMethod: 'JazzCash',
          transactionReference: 'TXNADV0001'
        },
        file: { field: 'proof', filename: 'payment-proof.png', buffer: fixturePng, contentType: 'image/png' }
      },
      expectStatus: 201
    });
    order3 = body.order;
    ctx.payment1Id = body.payment.id;
  }

  {
    const { body } = await rec.call('payments.submit-proof', 'POST', '/api/payments', {
      token: ctx.customerToken,
      form: {
        fields: {
          orderId: order3._id,
          paymentMethod: 'Easypaisa',
          transactionReference: 'TXNADV0002'
        },
        file: { field: 'proof', filename: 'payment-proof.png', buffer: fixturePng, contentType: 'image/png' }
      },
      expectStatus: 201
    });
    ctx.payment2Id = body.payment.id;
  }

  await rec.call('payments.submit-proof-alias', 'POST', '/api/payments/proof', {
    token: ctx.customerToken,
    form: {
      fields: {
        orderId: order3._id,
        paymentMethod: 'Bank Transfer',
        transactionReference: 'TXNADV0003'
      },
      file: { field: 'proofImage', filename: 'payment-proof.png', buffer: fixturePng, contentType: 'image/png' }
    },
    expectStatus: 201
  });

  await rec.call('payments.get-by-order-id', 'GET', `/api/payments/order/${order3._id}`, {
    token: ctx.customerToken,
    expectStatus: 200
  });

  // ---- 9. Newsletter -----------------------------------------------------------------
  const journeyNewsletterEmail = 'journey.newsletter@zahzancontract.test';
  await rec.call('newsletter.subscribe', 'POST', '/api/newsletter/subscribe', {
    json: { email: journeyNewsletterEmail, source: 'footer' },
    expectStatus: 201
  });
  await rec.call('newsletter.subscribe-again', 'POST', '/api/newsletter/subscribe', {
    json: { email: journeyNewsletterEmail, source: 'footer' },
    expectStatus: 200
  });
  // The unsubscribe token is never returned by the API (it only ever goes
  // out in an email, and email sending is disabled for capture -- see
  // docs/CONTRACT_CAPTURE.md), so "unsubscribe by token" targets the
  // seeded subscriber, whose token tools/seed-contract-db.mjs fixes at a
  // known constant.
  const SEED_NEWSLETTER_TOKEN = 'ab'.repeat(32);
  await rec.call('newsletter.unsubscribe-by-token', 'GET', `/api/newsletter/unsubscribe/${SEED_NEWSLETTER_TOKEN}`, {
    expectStatus: 200
  });

  // ---- 10. Admin -----------------------------------------------------------------
  const admin = { email: 'admin@zahzancontract.test', password: 'Admin@12345' };
  {
    const { body } = await rec.call('admin.login', 'POST', '/api/admin/auth/login', {
      json: admin,
      expectStatus: 200
    });
    ctx.adminToken = body.token;
  }

  await rec.call('admin.me', 'GET', '/api/admin/auth/me', { token: ctx.adminToken, expectStatus: 200 });
  await rec.call('admin.dashboard', 'GET', '/api/admin/dashboard', { token: ctx.adminToken, expectStatus: 200 });

  // -- list endpoints, each with page/limit, search, status --
  await rec.call('admin.orders-list-paged', 'GET', '/api/admin/orders?page=1&limit=2', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.orders-list-search', 'GET', '/api/admin/orders?search=Sara', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.orders-list-status', 'GET', '/api/admin/orders?status=Pending', {
    token: ctx.adminToken,
    expectStatus: 200
  });

  await rec.call('admin.payments-list-paged', 'GET', '/api/admin/payments?page=1&limit=2', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.payments-list-search', 'GET', '/api/admin/payments?search=TXNADV', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.payments-list-status', 'GET', '/api/admin/payments?status=Pending', {
    token: ctx.adminToken,
    expectStatus: 200
  });

  await rec.call('admin.customers-list-paged', 'GET', '/api/admin/customers?page=1&limit=2', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.customers-list-search', 'GET', '/api/admin/customers?search=Amina', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.customers-list-status', 'GET', '/api/admin/customers?status=active', {
    token: ctx.adminToken,
    expectStatus: 200
  });

  await rec.call('admin.products-list-paged', 'GET', '/api/admin/products?page=1&limit=2', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.products-list-search', 'GET', '/api/admin/products?search=Silk', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.products-list-status', 'GET', '/api/admin/products?status=active', {
    token: ctx.adminToken,
    expectStatus: 200
  });

  await rec.call('admin.newsletter-list-paged', 'GET', '/api/admin/newsletter?page=1&limit=2', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.newsletter-list-search', 'GET', '/api/admin/newsletter?search=seed.subscriber', {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('admin.newsletter-list-status', 'GET', '/api/admin/newsletter?status=subscribed', {
    token: ctx.adminToken,
    expectStatus: 200
  });

  // -- order status update --
  await rec.call('admin.order-status-update', 'PATCH', `/api/admin/orders/${order3._id}/status`, {
    token: ctx.adminToken,
    json: { orderStatus: 'Confirmed' },
    expectStatus: 200
  });

  // -- payment verify / reject (two distinct payment records on order3) --
  await rec.call('admin.payment-verify', 'PATCH', `/api/admin/payments/${ctx.payment1Id}/verify`, {
    token: ctx.adminToken,
    json: {},
    expectStatus: 200
  });
  await rec.call('admin.payment-reject', 'PATCH', `/api/admin/payments/${ctx.payment2Id}/reject`, {
    token: ctx.adminToken,
    json: { rejectionReason: 'Transaction reference could not be matched to bank statement.' },
    expectStatus: 200
  });

  // -- product create / update / status toggle / soft delete / permanent delete --
  let adminProduct;
  {
    const { body } = await rec.call('admin.product-create', 'POST', '/api/admin/products', {
      token: ctx.adminToken,
      json: {
        name: 'ZAHZAN Amber Velvet Coat',
        price: 22000,
        sku: 'zhz-adm-001',
        category: 'Coats',
        stock: 8,
        fabric: 'Velvet',
        work: 'Hand Finished'
      },
      expectStatus: 201
    });
    adminProduct = body.product;
  }

  await rec.call('admin.product-update', 'PUT', `/api/admin/products/${adminProduct._id}`, {
    token: ctx.adminToken,
    json: { price: 23000, stock: 6 },
    expectStatus: 200
  });

  await rec.call('admin.product-status-toggle', 'PATCH', `/api/admin/products/${adminProduct._id}/status`, {
    token: ctx.adminToken,
    json: {},
    expectStatus: 200
  });

  await rec.call('admin.product-soft-delete', 'DELETE', `/api/admin/products/${adminProduct._id}`, {
    token: ctx.adminToken,
    expectStatus: 200
  });

  await rec.call('admin.product-permanent-delete', 'DELETE', `/api/admin/products/${adminProduct._id}?permanent=true`, {
    token: ctx.adminToken,
    expectStatus: 200
  });

  // -- customer status toggle --
  // Task 15: resolved dynamically, not hardcoded -- see
  // resolveUserIdByLogin's header comment for why.
  const CUSTOMER2_ID = await resolveUserIdByLogin(rec.base, 'customer2@zahzancontract.test', 'Customer@12345');
  await rec.call('admin.customer-status-toggle', 'PATCH', `/api/admin/customers/${CUSTOMER2_ID}/status`, {
    token: ctx.adminToken,
    json: { isActive: false },
    expectStatus: 200
  });

  // -- newsletter export --
  await rec.call('admin.newsletter-export', 'GET', '/api/admin/newsletter/export', {
    token: ctx.adminToken,
    expectStatus: 200
  });

  // -- audit logs --
  await rec.call('admin.audit-logs', 'GET', '/api/admin/audit-logs', { token: ctx.adminToken, expectStatus: 200 });

  // ---- 11. Authorization failures: customer token against admin routes ----------------
  {
    const { body } = await rec.call('auth.login-customer1', 'POST', '/api/auth/login', {
      json: { email: 'customer1@zahzancontract.test', password: 'Customer@12345' },
      expectStatus: 200
    });
    ctx.customer1Token = body.token;
  }

  await rec.call('authz.customer-vs-admin-dashboard', 'GET', '/api/admin/dashboard', {
    token: ctx.customer1Token,
    expectStatus: 403
  });
  await rec.call('authz.customer-vs-admin-orders-list', 'GET', '/api/admin/orders', {
    token: ctx.customer1Token,
    expectStatus: 403
  });
  await rec.call('authz.customer-vs-admin-product-delete', 'DELETE', `/api/admin/products/${PRODUCT1_ID}`, {
    token: ctx.customer1Token,
    expectStatus: 403
  });

  // ---- 12. 501 stubs -----------------------------------------------------------------
  await rec.call('stubs.try-on-post', 'POST', '/api/try-on', { token: ctx.customerToken, expectStatus: 501 });
  await rec.call('stubs.stories-get', 'GET', '/api/stories', { expectStatus: 501 });

  // ---- Bonus: frontend calls these but the server has no route for them (GC4 / dispatch
  // item 6) -- capturing the resulting 404 documents an existing, real mismatch rather
  // than "fixing" it.
  await rec.call('extra.auth-verify-email-404', 'GET', '/api/auth/verify-email?token=whatever', {
    expectStatus: 404
  });
  await rec.call('extra.auth-change-password-404', 'POST', '/api/auth/change-password', {
    token: ctx.customerToken,
    json: { oldPassword: 'x', newPassword: 'y' },
    expectStatus: 404
  });

  // ---- Coverage extension (fix round 1, Finding 1) --------------------------------------
  // Controller ruling: the Task 2 brief's journey list is a floor, not a ceiling (the binding
  // spec, MIGRATION_PLAN.md §3.1, says "must cover, at minimum"). These 11 endpoints were
  // reachable with the harness's existing capability and are appended here -- additive only,
  // after file 090, so the original 90 golden files are untouched.

  // 1/11: POST /api/auth/google -- controller trusts the request body outright (no real
  // Google call), so a fake body exercises real, deterministic server behaviour.
  await rec.call('extra2.auth-google', 'POST', '/api/auth/google', {
    json: {
      googleId: 'journey-google-uid-001',
      email: 'google.journey@zahzancontract.test',
      firstName: 'Google',
      lastName: 'Journey'
    },
    expectStatus: 200
  });

  // 2/11: POST /api/auth/facebook -- same pattern.
  await rec.call('extra2.auth-facebook', 'POST', '/api/auth/facebook', {
    json: {
      facebookId: 'journey-facebook-uid-001',
      email: 'facebook.journey@zahzancontract.test',
      firstName: 'Facebook',
      lastName: 'Journey'
    },
    expectStatus: 200
  });

  // 3/11: POST /api/users/me/email-change-request -- both 400 branches plus the 200 success.
  await rec.call('extra2.users-email-change-request-same-as-current', 'POST', '/api/users/me/email-change-request', {
    token: ctx.customerToken,
    json: { newEmail: primary.email },
    expectStatus: 400
  });
  await rec.call('extra2.users-email-change-request-duplicate', 'POST', '/api/users/me/email-change-request', {
    token: ctx.customerToken,
    json: { newEmail: 'customer1@zahzancontract.test' },
    expectStatus: 400
  });
  await rec.call('extra2.users-email-change-request-success', 'POST', '/api/users/me/email-change-request', {
    token: ctx.customerToken,
    json: { newEmail: 'sara.newemail@zahzancontract.test' },
    expectStatus: 200
  });

  // 4/11: GET /api/users/me/confirm-email-change -- the 400 branch is trivial (a garbage
  // token). The 200 success branch needs the real crypto.randomBytes(32) token, which the API
  // never returns to any client by design -- so it's read directly out of Mongo, the same
  // technique tools/seed-contract-db.mjs already uses for the newsletter unsubscribe token. The
  // real token is genuinely random per run and fits none of tools/lib/normalise.mjs's
  // categories, so it's `redact`ed out of the recorded path (see Recorder.call's `redact`
  // option) rather than left to leak into the golden file and break reproducibility.
  await rec.call('extra2.users-confirm-email-change-invalid-token', 'GET',
    '/api/users/me/confirm-email-change?token=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    { expectStatus: 400 }
  );

  // Task 15: try Mongo first (old stack, when --env MONGODB_URI is given),
  // then fall back to the Postgres-stack verification route (see
  // fetchEmailChangeTokenPg's header comment) -- whichever one applies to
  // the target `--base` actually returns a token; the other is a no-op
  // (unset mongoUri, or a 404 from a route gated off in any non-pglite
  // environment).
  const realToken = mongoUri
    ? await fetchEmailChangeToken(mongoUri, ctx.customerId)
    : await fetchEmailChangeTokenPg(rec.base, ctx.customerId);

  if (realToken) {
    await rec.call(
      'extra2.users-confirm-email-change-success',
      'GET',
      `/api/users/me/confirm-email-change?token=${realToken}`,
      { expectStatus: 200, redact: [realToken] }
    );
  } else {
    console.warn(
      '[contract-capture] extra2.users-confirm-email-change-success SKIPPED: no email-change token could be read back (neither --env MONGODB_URI nor the Postgres verification route returned one).'
    );
  }

  // 5/11: POST /api/products -- productController.createProduct, gated by protect+requireAdmin
  // on productRoutes, distinct from POST /api/admin/products (createAdminProduct) captured
  // earlier. This controller calls Product.create(req.body) directly with no field whitelisting,
  // so the body must already satisfy every schema requirement itself.
  await rec.call('extra2.products-create', 'POST', '/api/products', {
    token: ctx.adminToken,
    json: {
      name: 'ZAHZAN Coverage Test Product',
      slug: 'zahzan-coverage-test-product',
      sku: 'zhz-cov-001',
      category: 'Accessories',
      price: 3000,
      stock: 15
    },
    expectStatus: 201
  });

  // 6/11, 7/11, 8/11: admin get-by-id for orders/payments/customers -- every id used here
  // already exists in ctx/local scope from earlier in this same journey.
  await rec.call('extra2.admin-order-by-id', 'GET', `/api/admin/orders/${order3._id}`, {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('extra2.admin-payment-by-id', 'GET', `/api/admin/payments/${ctx.payment1Id}`, {
    token: ctx.adminToken,
    expectStatus: 200
  });
  await rec.call('extra2.admin-customer-by-id', 'GET', `/api/admin/customers/${CUSTOMER2_ID}`, {
    token: ctx.adminToken,
    expectStatus: 200
  });

  // 9/11: POST /api/newsletter/unsubscribe -- same controller as the already-captured
  // GET /unsubscribe/:token route, reading the token from the request body instead of the URL.
  // Reuses the seeded subscriber's token, already unsubscribed earlier in this journey, so this
  // exercises the controller's idempotent "already unsubscribed" 200 branch deterministically.
  await rec.call('extra2.newsletter-unsubscribe-post', 'POST', '/api/newsletter/unsubscribe', {
    json: { token: SEED_NEWSLETTER_TOKEN },
    expectStatus: 200
  });

  // 10/11: GET /api/try-on/:id -- unconditional 501, no DB lookup, any id works.
  await rec.call('extra2.tryon-get-by-id', 'GET', '/api/try-on/000000000000000000000000', {
    token: ctx.customerToken,
    expectStatus: 501
  });

  // 11/11: POST /api/stories -- unconditional 501.
  await rec.call('extra2.stories-post', 'POST', '/api/stories', {
    token: ctx.customerToken,
    expectStatus: 501
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let child = null;
  let logBuffer = [];

  if (args.startCmd) {
    const spawned = spawnServer(args);
    child = spawned.child;
    logBuffer = spawned.logBuffer;
  }

  try {
    if (args.startCmd) {
      await waitForHealth(args.base, args.healthPath, args.readyTimeoutMs);
    }

    const rec = new Recorder(args.base, args.out);
    await rec.init();
    // Only used to read back the one token the API never returns to a client
    // (see fetchEmailChangeToken). Deliberately NOT defaulted when absent:
    // this script is meant to be reusable against a future, Mongo-less
    // Next.js/Postgres stack (docs/CONTRACT_CAPTURE.md), where silently
    // trying to open a Mongo connection that was never asked for would be
    // wrong, not just unnecessary. Pass --env MONGODB_URI=... to enable it.
    const mongoUri = args.env.MONGODB_URI || undefined;
    await runJourney(rec, mongoUri);

    console.log(`[contract-capture] Captured ${rec.files.length} interactions into ${args.out}`);
  } catch (err) {
    console.error('[contract-capture] FAILED:', err.message);
    if (logBuffer.length) {
      console.error('----- spawned server output -----');
      console.error(logBuffer.join(''));
      console.error('----------------------------------');
    }
    process.exitCode = 1;
  } finally {
    if (child) await stopServer(child);
  }
}

main();
