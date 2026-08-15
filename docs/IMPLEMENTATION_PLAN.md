# ZAHZAN Migration — Implementation Plan

**Spec (binding authority):** `MIGRATION_PLAN.md` at the repository root. Where this plan and the
spec disagree, the spec wins. Where both are silent, the **existing Express/Mongoose code in
`server/` is the authority** — it defines the behaviour being preserved.

**Branch:** `migration/nextjs-supabase`. **Worktree:** `C:/Users/zaeem/Downloads/Zahzan-migration`.

---

## Global Constraints

These bind every task. A violation is a defect regardless of what a task description says.

**GC1 — Parity is absolute.** The migration changes the stack and nothing else. For every one of the
67 endpoints, these must be byte-identical to the current Express implementation:
- HTTP path, method, and status code
- Response JSON, key for key, including the envelope keys `success`, `message`, `count`, `total`,
  `currentPage`, `totalPages`
- Human-readable `message` strings, verbatim, including punctuation and capitalisation — the UI
  renders `data.message` directly

**GC2 — `_id` is never dropped, and the goldens decide whether `id` accompanies it.**
*(AMENDED mid-execution by controller ruling C12 — the original blanket wording was factually
wrong; see below.)*

Every serialized entity MUST carry `_id`. Three frontend call sites read bare `_id` with no
fallback (`src/pages/Account.jsx:1162,1192,1200` and
`src/pages/admin/AdminCustomers.jsx:294,313,116,118`), so dropping it silently breaks the saved
address list.

Whether an entity ALSO carries `id` is **per-entity, and `tools/golden/` is the authority** — not
a blanket rule. The old API's behaviour follows each Mongoose model's `toJSON` config: models that
set `toJSON: { virtuals: true }` plus an `id` transform (Product, Order, Payment, User, AuditLog,
NewsletterSubscriber, Cart) emit BOTH `_id` and `id`; models with no `toJSON` config (Address,
AdminUser, Notification, StorySubmission, TryOnJob, RefreshToken) emit `_id` ONLY. Verified against
the goldens: `023-users.address-list.json` addresses have `_id` and NOT `id`;
`082-admin.audit-logs.json` logs have BOTH.

**THE DEFINITIVE MAP** (established by the Task 4 review against the goldens; binding for Tasks
8-13 — do not re-derive it, and do not trust intuition over this table):

| Entity | Emits | Authority |
| --- | --- | --- |
| User, Product, Order, Payment, NewsletterSubscriber, AuditLog | **`_id` AND `id`** | model sets `toJSON: { virtuals: true }` + id transform |
| Cart, cart items | **`id` only, no `_id`** | `formatCartResponse` hand-builds `id`/`cartItemId`; golden `032-cart.add.json` |
| Auth user payload (register/login/google/facebook/me) | **`id` only, no `_id`** | Ruling C8; golden `003-auth.login.json` |
| Address, StorySubmission, TryOnJob | **`_id` only, no `id`** | no `toJSON` config; goldens `022`/`023` |

Adding an `id` key where the old API never emitted one is a **GC1 violation** (key-for-key
parity), not GC2 compliance. When GC1 and GC2 appear to conflict, GC1 wins and the golden file
settles the question.

**GC3 — JSON field names are camelCase.** Postgres columns are snake_case. The conversion happens
only in `lib/serialize.js`. No route handler may hand-build a response entity.

**GC4 — No refactors, no improvements, no additions.** Do not fix pre-existing bugs. Do not add
TypeScript. Do not add features. Do not "clean up" duplicated code. Endpoints that return 501 or 404
today must return 501 or 404 after the migration. If you find a bug, report it in your report file —
do not fix it.

**GC5 — JWT compatibility.** `lib/jwt.js` is a verbatim port of `server/utils/jwt.js`: same
`jsonwebtoken` library, same `{ id, role }` payload, same env vars, same hardcoded dev-fallback
secrets. A token minted by the old server must validate against the new API.

**GC6 — All API routes run on the Node.js runtime.** Every `route.js` exports
`export const runtime = 'nodejs'`. Never Edge — bcrypt, jsonwebtoken, pg, and nodemailer all need Node.

**GC7 — Write-time case transforms.** Mongoose applies `lowercase: true` to email fields and
`uppercase: true` to `Product.sku`. Postgres will not. Apply these explicitly on every write path.

**GC8 — Tests must pass before you report DONE.** Run `npm test` and paste the real output into your
report. Never claim a test passed without running it.

**GC9 — Secrets.** `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are server-only. Never prefix
them `NEXT_PUBLIC_`, never import them into a file carrying `'use client'`, never log their values.

---

## Architecture rulings

These were decided by the controller before execution and are binding. Rationale is recorded so a
reviewer can judge them, not relitigate them.

**AR1 — Data access is direct parameterized SQL, not the `supabase-js` PostgREST query builder.**
The spec's §6.3 sketched a `supabase-js` translation table. That is overridden because: (a) no Docker
is available on this machine, so there is no local Supabase stack and `supabase-js` route handlers
would be **completely untestable** until the user provisions a cloud project — the entire migration
would ship unverified; (b) the parity requirement demands exact control over `ILIKE` escaping,
`$or` semantics, ordering, and aggregation that PostgREST makes awkward; (c) the spec already
requires plpgsql functions for `create_order`, `admin_dashboard_stats` and `check_rate_limit`, so SQL
is in the stack regardless. Supabase remains the platform — this is Supabase's own Postgres, reached
over its connection pooler.
*Cost if wrong:* the data layer is less idiomatic for a Supabase-native team, and swapping to
PostgREST later means rewriting `lib/db.js` call sites.

**AR2 — `@supabase/supabase-js` is used for Storage only.** Buckets, uploads, signed URLs. Not for
database access.

**AR3 — Local test substrate is PGlite** (`@electric-sql/pglite`), an in-process WASM Postgres 18.
Verified to support uuid defaults, `text[]`, `jsonb`, plpgsql, `RAISE EXCEPTION` and `ILIKE`. The
same `supabase/migrations/0001_init.sql` is applied to it, so tests run against the real schema.
*Cost if wrong:* PGlite and Supabase's Postgres could differ in some corner; the Task 15 verification
against a real Supabase project is the backstop.

**AR4 — `lib/db.js` exposes a driver-agnostic `query(text, params) -> { rows }` plus `tx(fn)`.**
Production driver is `pg` (node-postgres) against `SUPABASE_DB_URL`; test driver is PGlite. Both have
the same call signature, so no code branches on environment.

**AR5 — The contract-capture harness uses a separate Mongo database, `zahzan_contract_test`,** seeded
by the existing seed scripts. The user's `zahzan_db` (6 products, 6 users, 13 orders of real dev
data) is never written to.
*Cost if wrong:* golden snapshots reflect seeded data rather than the user's dev data — acceptable,
because the comparison is old-behaviour vs new-behaviour on identical inputs.

**AR6 — Next.js 16 (current stable), plain JavaScript, App Router.**

---

## Ruling C15 — KNOWN DEVIATION FROM GC1 (accepted, documented, user-overridable)

`cart_items.product_id` and `wishlist_items.product_id` are changed to `on delete cascade`.

**Why the original schema was untenable.** They were written as plain `references products (id)`
with no `on delete` clause, i.e. RESTRICT. The old MongoDB app had NO referential integrity, and
`server/controllers/cartController.js:13` — `items.filter((item) => item.product != null)` — is
direct proof the old code EXPECTED products to vanish out from under cart items and handled it by
dropping them from the response. Meanwhile `adminController.js:710-736` implements a permanent
product delete that the admin UI calls, and which always returned 200. Under RESTRICT, permanently
deleting any product sitting in a cart or wishlist raises a Postgres 23503 that `withErrorHandler`
turns into a raw 500. RESTRICT is the ONLY one of the three options that breaks a
proven-working, golden-captured admin action.

**What CASCADE achieves, stated honestly — this is NOT strict parity:**

| Path | Old behaviour | Under CASCADE | Verdict |
| --- | --- | --- | --- |
| Admin permanent-delete of a referenced product | 200, always | 200, always | parity restored |
| Subsequent cart GET | orphan line silently dropped by the `!= null` filter | row is gone, join returns nothing | observably identical |
| Subsequent wishlist GET | **crashes** — `getUserWishlist` throws a TypeError on a null populate result, a pre-existing 500 bug | returns a shorter valid list, 200 | **accidental improvement, not parity** |
| Wishlist toggle with a nonexistent productId | 200, Mongo stores any string | 500, FK rejects the insert | **divergence; unreachable from the shipped frontend** |

Every UI call site sources `productId` from an already-fetched product object
(`views/Product.jsx:308`, `components/ProductCard.jsx:56`, `components/WishlistDrawer.jsx:135`),
so the last row is reachable only by a hand-crafted API call. No golden exercises it.

**The alternative — dropping the product FKs entirely — was rejected.** It would preserve that one
unreachable edge case at the cost of all referential integrity, including the guarantee CASCADE's
correctness on the admin-delete path depends on.

If the user prefers literal parity over integrity here, dropping both FKs is the change to make.

---

## Task 1: Toolchain, database adapter, and test harness

**Objective.** Stand up the build and test tooling every later task depends on. No application
behaviour yet.

**Files to create.**
- `package.json` — replace the Vite scripts. Dependencies: `next`, `react`, `react-dom`, `pg`,
  `@supabase/supabase-js`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `resend`. Dev dependencies:
  `vitest`, `@electric-sql/pglite`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `dotenv`.
  Scripts: `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `test` (`vitest run`),
  `test:watch` (`vitest`). Keep `lint` as `oxlint`.
  Do **not** remove `react-router-dom` yet — Task 7 removes it.
- `lib/db.js` — exports `query(text, params)` returning `{ rows }`, `tx(fn)` giving the callback an
  object with the same `query` signature and rolling back on throw, and `close()`. Chooses its driver
  from `process.env.ZAHZAN_DB_DRIVER`: `'pglite'` selects PGlite, anything else selects a `pg` Pool
  built from `SUPABASE_DB_URL`. The `pg` Pool is a module singleton.
- `test/helpers/db.js` — `createTestDb()` boots a fresh in-memory PGlite, applies
  `supabase/migrations/0001_init.sql` **if it exists** (Task 3 creates it; until then, skip silently),
  and returns a handle with the same `query`/`tx` signature plus `reset()` and `destroy()`.
- `vitest.config.js` — node environment, `test/**/*.test.js` include pattern, 30s timeout (PGlite
  boot is slow on first call).
- `.env.example` — add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
  `SUPABASE_STORAGE_BUCKET_PRODUCTS=product-images`,
  `SUPABASE_STORAGE_BUCKET_PROOFS=payment-proofs`. Keep every existing key except `MONGODB_URI`,
  `PORT` and the three `CLOUDINARY_*` keys, which move to a "dropped after migration" comment block.
- `.gitignore` — add `.next/`, `.env`, `.env.local`, `tools/golden-next/`.
  **Do not ignore `tools/golden/`** — the Task 2 baseline is committed to the branch and is the
  regression oracle for the whole plan (ruling C10, pre-flight). Only Task 15's regenerated
  `tools/golden-next/` is ignored.

**Tests.** `test/db.test.js`: boot the test db, create a scratch table, insert with `$1` params,
select it back, and assert `tx()` rolls back on throw. These must genuinely exercise PGlite.

**Verification.** `npm install` completes; `npm test` passes; `node -e "import('./lib/db.js')"` does
not throw when `ZAHZAN_DB_DRIVER=pglite`.

**Out of scope.** Any Next.js app directory, any route, any schema.

---

## Task 2: Contract capture harness and golden baseline

**Objective.** Capture the exact behaviour of the current Express + MongoDB stack, so later tasks can
be proven behaviour-identical. This is the safety net for the whole migration — build it before
anything is ported.

**Read first.** Every file in `server/routes/` and `server/controllers/` — the journey must exercise
the real surface.

**Files to create.**
- `tools/contract-capture.mjs` — drives a scripted journey over HTTP against a base URL taken from
  `--base` (default `http://localhost:5000`), writing one JSON file per interaction into a directory
  from `--out` (default `tools/golden/`). Each record captures: `name`, `method`, `path`, request
  body (with volatile fields normalised), `status`, and the response body after normalisation.
- `tools/lib/normalise.mjs` — replaces volatile values with stable placeholders so two runs diff
  cleanly. Normalise: any 24-hex Mongo ObjectId or UUID → `<ID>`; any ISO-8601 timestamp → `<TS>`;
  JWTs (three base64url segments separated by dots) → `<JWT>`; `orderNumber` values matching
  `ZHZ-\d{8}-\d{4}` → `<ORDERNO>`; any absolute `http(s)://` URL → `<URL>` (proof URLs move from
  Cloudinary to signed Supabase Storage URLs, so their host and path can never match); any
  `tools/golden` absolute path → `<PATH>`. Normalisation walks
  the JSON recursively and preserves key order and structure — only leaf values change.
- `tools/contract-diff.mjs` — compares two golden directories and prints a per-file structural diff,
  exiting non-zero when any file differs or is missing on either side.
- `tools/seed-contract-db.mjs` — seeds the `zahzan_contract_test` Mongo database deterministically:
  a fixed admin, two customers, four products with fixed slugs/SKUs/prices/stock, and one newsletter
  subscriber. Deterministic values only — no `Date.now()` in seeded content, no randomness.
- `docs/CONTRACT_CAPTURE.md` — how to run capture against old and new stacks and diff them.

**The journey must cover**, in this order, reusing tokens across steps:
1. `GET /api/health`
2. auth: register → login → `GET /api/auth/me` → refresh → forgot-password → reset-password → logout
3. auth failures: login with wrong password; `GET /api/auth/me` with no token; with a malformed token
4. products: list unfiltered; `?category=`; `?search=`; get by `_id`; get by slug; get by SKU;
   get a nonexistent id
5. users: `GET /me`; `PATCH /me`; addresses create → list → patch → set-default → delete;
   wishlist get → toggle on → toggle off → delete
6. cart: get (auto-creates) → add → add the same product again → patch quantity → delete item → clear
7. orders: create COD → list → `GET /api/orders/my-orders` → get by id → get by orderNumber → cancel;
   then create a second COD order and attempt to cancel it twice
8. payments: `GET /methods`; create an advance-payment order with a small PNG fixture; submit proof;
   submit via the `/proof` alias; `GET /order/:orderId`
9. newsletter: subscribe → subscribe the same address again → unsubscribe by token
10. admin: login → `auth/me` → dashboard → each list endpoint with `?page=1&limit=2`, with `?search=`
    and with `?status=` → order status update → payment verify → payment reject → product create,
    update, status toggle, soft delete, permanent delete → customer status toggle → newsletter export
    → audit logs
11. authorization failures: a customer token against three different admin routes
12. both 501 stubs: `POST /api/try-on`, `GET /api/stories`

**Ruling carried into this task (C5, pre-flight).** This is a fresh git worktree, so
`server/node_modules` does not exist even though the original checkout has it. Run
`npm install --prefix server` before attempting to start the Express server. `server/.env` has
already been copied into this worktree.

**Ruling carried into this task (AR5).** Capture runs against Mongo database
`zahzan_contract_test`, never `zahzan_db`. The harness must start the Express server itself with
`MONGODB_URI` pointed at the contract database, wait for `/api/health` to answer, run the journey,
and shut the server down. Emails must not actually send — set the env so `RESEND_API_KEY`,
`EMAIL_HOST` and `EMAIL_USER` are empty for the capture run, and confirm the email helper degrades
without throwing.

**Deliverable.** `tools/golden/` populated with the captured baseline, committed to the branch.

**Tests.** `test/normalise.test.js` — the normaliser replaces each volatile class, leaves stable
values alone, and is idempotent (normalising twice equals normalising once).

**Verification.** Run the capture end to end. Report how many interactions were captured and paste
the file list. Run the capture **twice** and diff the two runs against each other — the diff must be
empty, which proves the normaliser makes captures reproducible. This double-run check is the
acceptance criterion for the task.

**Out of scope.** Anything Next.js or Postgres.

---

## Task 3: Postgres schema

**Objective.** The complete schema, applied identically to Supabase and to PGlite.

**Read first.** All 16 files in `server/models/`.

**Files to create.**
- `supabase/migrations/0001_init.sql`

**Tables.** Nineteen. Sixteen mirroring the Mongoose models — `users`, `products`, `orders`,
`carts`, `payments`, `addresses`, `refresh_tokens`, `password_reset_tokens`, `email_change_tokens`,
`verification_tokens`, `newsletter_subscribers`, `audit_logs`, `admin_users`, `notifications`,
`story_submissions`, `tryon_jobs` — plus three the migration introduces: `cart_items`,
`wishlist_items`, and `rate_limits` (Task 5 adds the function that uses it). 16 + 3 = **19**.

**Conventions.**
- `id uuid primary key default gen_random_uuid()` on every table. `gen_random_uuid()` is core in
  Postgres 13+; do not `create extension pgcrypto`, which PGlite rejects.
- snake_case columns; `created_at` / `updated_at timestamptz not null default now()`.
- A shared `set_updated_at()` trigger function, attached to every table that Mongoose gave
  `timestamps: true`.
- Enum-like columns are `text` with `CHECK` constraints listing the exact current values — including
  the spaced ones, `'Cash on Delivery'` and `'Bank Transfer'`. Defaults must match the Mongoose
  defaults exactly.
- Preserve every Mongoose default (`country` defaults to `'Pakistan'`, `label` to `'Home'`,
  `is_email_verified` to `true`, `is_active` to `true`, `status` to `'subscribed'`, and so on).

**Embedded-document mapping** — follow the spec's §5.2 table exactly:
`products.images/sizes/care_instructions/gallery` are `text[] not null default '{}'`;
`products.colors` and `products.breakdown` are `jsonb`; `orders.items` and `orders.shipping_address`
are `jsonb not null`; `cart_items` and `wishlist_items` are real tables.

**Relationships.** `cart_items.cart_id` → `carts(id) on delete cascade`;
`cart_items.product_id` → `products(id)`; `wishlist_items` is `(user_id, product_id)` with a unique
pair constraint and `on delete cascade` from users.

**Constraints and indexes** — per spec §5.4: unique on `lower(users.email)`; unique
`products.slug`, `products.sku`, `orders.order_number`, `carts.user_id`; a **partial** unique index
on `newsletter_subscribers.unsubscribe_token where unsubscribe_token is not null`; unique
`newsletter_subscribers.email`; and indexes on `orders.created_at`, `orders.order_status`,
`payments.status`, `payments.order_id`, `audit_logs.action`, `audit_logs.admin_id`,
`products.category`, `products.is_active`, plus `expires_at` on all four token tables.

**Also create** `purge_expired()` — deletes rows past `expires_at` from the four token tables and
returns the number deleted. Include a commented `cron.schedule` call showing the fifteen-minute
schedule, commented because `pg_cron` is unavailable in PGlite.

**Tests.** `test/schema.test.js`: apply the migration to a fresh PGlite and assert — all nineteen
tables exist; `gen_random_uuid()` populates ids; `updated_at` actually advances on update via the
trigger; each CHECK constraint rejects an invalid value and accepts every valid one; the partial
unique index permits multiple NULL `unsubscribe_token` rows but rejects a duplicate non-null one;
`lower(email)` uniqueness rejects `A@B.com` after `a@b.com`; `text[]` and `jsonb` round-trip;
cascade deletes work; `purge_expired()` removes only expired rows.

**Verification.** `npm test` green. Report the table count and the constraint list.

**Out of scope.** `create_order`, `cancel_order`, `check_rate_limit`, `admin_dashboard_stats` — those
ship with their consumers in Tasks 5, 11 and 13.

---

## Task 4: Serialization layer

**Objective.** The single place where database rows become API JSON. This is the keystone of GC1,
GC2 and GC3 — if it is wrong, every endpoint is wrong.

**Read first.** Every `toJSON` transform in `server/models/`, and how each controller shapes its
responses — especially `server/controllers/cartController.js` (`formatCartResponse`),
`server/controllers/authController.js` (the inline `user` object it returns from register/login/
google/facebook/me) and `server/controllers/userController.js` (wishlist).

**Files to create.**
- `lib/serialize.js`

**Requirements.**
- One exported function per entity: `serializeUser`, `serializeAuthUser`, `serializeProduct`,
  `serializeOrder`, `serializeCartItem`, `serializeCart`, `serializePayment`, `serializeAddress`,
  `serializeNewsletterSubscriber`, `serializeAuditLog`, `serializeStory`, `serializeTryOnJob`.
- Every one emits both `_id` and `id` as the same string (GC2).
- snake_case → camelCase for every field (GC3).
- Timestamps serialize as ISO-8601 strings, matching what `JSON.stringify` produced for Mongoose
  `Date` values.
- `serializeUser` strips `password` and never emits `__v`; it exposes the virtual `name` as
  `firstName + ' ' + lastName`, trimmed.
- `serializeAuthUser` reproduces the narrower object the auth controller returns — `id`, `firstName`,
  `lastName`, `name`, `email`, `phone`, `role`, `authProvider`, `isEmailVerified`, plus `createdAt`
  for the `GET /api/auth/me` variant. **Ruling (controller, pre-flight): this object emits `id`
  only and must NOT gain an `_id`.** The current `authController.js` returns a hand-built literal
  with `id: user._id` and no `_id`, and no frontend call site reads `user._id`. This is the one
  documented exemption from GC2 — GC2 binds entities the frontend indexes by `_id` (addresses,
  orders, products, customers, payments, subscribers, audit logs), not the auth user payload.
- `serializeNewsletterSubscriber` strips `unsubscribeToken`.
- `serializeCart` reproduces `formatCartResponse` exactly: the outer `{ id, user, items, subtotal,
  totalCount }` and, per item, all of `id`, `cartItemId`, `productId`, `product`, `name`, `price`,
  `category`, `image`, `size`, `selectedSize`, `color`, `selectedColor`, `quantity`, `subtotal`,
  `stock` — with `image` falling back from `images[0]` to `image` to `''`, and `size` defaulting to
  `'M'`. The nested `product` carries the fields the current `.populate()` selects: `name`, `price`,
  `category`, `image`, `images`, `stock`, `sizes`, `colors`.
- `serializeOrder` keeps `items` and `shippingAddress` as the jsonb arrays/objects they are, and
  supports an optional attached `payment` (the admin order list attaches one).
- Null and undefined inputs return `null`, never throw.

**Tests.** `test/serialize.test.js` — for every function: `_id` and `id` are both present and equal;
camelCase conversion is complete (assert no snake_case key survives, by walking the output);
`password` never appears in user output; `unsubscribeToken` never appears in subscriber output; the
cart shape matches a hand-written expected object field for field; null input returns null.

**Verification.** `npm test` green. In your report, list every function and the keys it emits.

---

## Task 5: Auth, HTTP envelope, and rate limiting

**Objective.** The middleware equivalents, ported behaviour-exact.

**Read first.** `server/utils/jwt.js`, `server/middleware/authMiddleware.js`,
`server/middleware/adminMiddleware.js`, `server/middleware/errorMiddleware.js`,
`server/middleware/rateLimiter.js`, and the `apiLimiter` block in `server/server.js`.

**Files to create.**
- `lib/jwt.js` — verbatim port. Same four functions, same env vars, same dev-fallback secrets (GC5).
- `lib/http.js` — `ok(data, status)`, `fail(message, status)` and an `withErrorHandler(handler)`
  wrapper reproducing `errorMiddleware.errorHandler`: `{ success: false, message }`, plus `stack`
  only when `NODE_ENV === 'development'`. Also a `notFound(path)` helper producing the exact
  `Not Found - <path>` message.
- `lib/auth.js` — `requireAuth(request)` returns `{ user }` or `{ response }`. It reproduces
  `protect` exactly, including the two distinct messages: *"Not authorized, no token provided"* when
  the `Authorization` header is absent or does not start with `Bearer`, and *"Not authorized, token
  failed or expired"* when verification throws. It looks the user up by id, returns *"User not found
  or account deactivated"* with 401 when absent, and attaches the row. `requireAdmin(user)` returns
  the 403 *"Access denied: Admin authorization required"* unless `user.role === 'admin'`.
- `lib/rateLimit.js` — `checkRateLimit(request, config)` calling a `check_rate_limit(p_key, p_max,
  p_window_seconds)` SQL function. Five exported configs matching `server/middleware/rateLimiter.js`
  and the global limiter in `server/server.js`: global 200 per 15 min, login 10 per 15 min, register
  10 per hour, password reset 5 per 15 min, newsletter 15 per 15 min — each with its **exact**
  message string copied from the source. Returns `{ limited: true, response }` carrying status 429
  and the config's message, or `{ limited: false }`. The key is the client IP from
  `x-forwarded-for` (first entry), falling back to `x-real-ip`, then `'unknown'`.
- Append `check_rate_limit` to `supabase/migrations/0001_init.sql` — an atomic upsert-and-increment
  that returns whether the caller is over the limit, resetting the window when
  `window_start + p_window_seconds < now()`.

**Tests.** `test/auth.test.js` — a token minted by `lib/jwt.js` verifies; an expired token produces
the "token failed or expired" message; a missing header produces the "no token provided" message; a
valid token for a deleted user produces "User not found or account deactivated"; `requireAdmin`
passes admins and rejects customers with the exact 403 message.
`test/rateLimit.test.js` — under the limit passes; the request that crosses `max` is limited and
carries the exact message; the window resets after expiry (manipulate `window_start` directly);
different IPs get independent counters.

**Verification.** `npm test` green.

---

## Task 6: Storage, multipart, and email

**Objective.** Replace multer, Cloudinary and the local uploads directory; port the email service.

**Read first.** `server/middleware/uploadMiddleware.js`, `server/utils/cloudinary.js`,
`server/services/emailService.js`, `server/utils/email.js`.

**Files to create.**
- `lib/storage.js` — `uploadPaymentProof(buffer, filename, contentType, orderRef)` and
  `uploadProductImage(...)`, both returning `{ secure_url, public_id }` to match the shape the
  existing controllers consume. `deletePaymentProof(publicId)` mirrors
  `deletePaymentProofFromCloudinary`, including its no-op on ids starting with `local_`.
  `signProofUrl(publicId)` returns a fresh signed URL for the private bucket — per spec §7.4 the
  column stores the storage **path**, and every read signs it anew.
  Driver selected by `ZAHZAN_STORAGE_DRIVER`: `'supabase'` (default) uses `@supabase/supabase-js`;
  `'memory'` is an in-process fake for tests that records uploads and hands back deterministic URLs.
- `lib/multipart.js` — `parseUpload(request, fieldName, kind)` where `kind` is `'image'` or
  `'proof'`. Reads `request.formData()`, pulls the named field, validates and returns
  `{ buffer, filename, contentType }` or throws with the **exact** current multer messages:
  *"Only image files (jpg, jpeg, png, webp) are allowed"* for `'image'`, and *"Invalid file format.
  Only JPG, PNG, WEBP images and PDF documents are allowed."* for `'proof'`. Enforce the same 5 MB
  cap and the same extension-plus-MIME double check the current `fileFilter` functions perform. Also
  returns the other form fields as a plain object, since the current controllers read
  `req.body` alongside `req.file`.
- `lib/email.js` — port `server/services/emailService.js` with its seven exported senders and the
  same Resend-then-Nodemailer fallback. Keep every HTML template byte-identical. Per spec §7.6, the
  fire-and-forget pattern becomes awaited. **AMENDED by controller ruling C13:** `dispatch(promise)`
  AWAITS UNCONDITIONALLY and swallows any rejection with a logged warning, so a failed email can
  never fail the request. The originally-described `ZAHZAN_EMAIL_SYNC` conditional was wrong — it
  left the send detached in production, meaning the serverless function could still freeze before
  delivery, which is the exact bug spec §7.6 requires fixing. That env-var branch no longer exists.
  **Tasks 11-13: simply `await dispatch(...)` — the send is guaranteed complete when it resolves.**

**Tests.** `test/multipart.test.js` — accepts a valid PNG; rejects a `.txt`; rejects a good extension
with a bad MIME; rejects over 5 MB; returns sibling form fields; error messages match verbatim.
`test/storage.test.js` — the memory driver round-trips an upload, returns the `{ secure_url,
public_id }` shape, and `deletePaymentProof('local_x')` is a no-op.
`test/email.test.js` — with no credentials configured, every sender resolves without throwing (the
current code degrades silently); templates contain the expected order number and total.

**Verification.** `npm test` green.

---

## Task 7: Next.js application shell

**Objective.** Replace Vite with Next.js App Router. Components move verbatim; only routing imports
and asset references change.

**Read first.** `src/App.jsx`, `src/main.jsx`, `index.html`, `vite.config.js`, and every file listed
in spec §4.3 as using a react-router API.

**Do.**
1. Create `app/layout.jsx` from `index.html` + `src/main.jsx`: html/body, `globals.css` import,
   `<WishlistProvider><CartProvider>` wrapping children, and the always-mounted `<CartDrawer/>` and
   `<WishlistDrawer/>` after children — matching the order in `src/App.jsx`. Metadata title
   `zahzan-ai-store`, favicon `/favicon.svg`.
2. Create the fifteen page files listed in spec §4.1. Each is a thin `'use client'` module that
   renders the existing page component. `app/admin/page.jsx` and `app/admin/login/page.jsx` both
   render `AdminLogin`.
3. Move `src/components/` → `components/`, `src/context/` → `context/`, `src/data/` → `data/`.
   Move `src/index.css` + `src/App.css` → `app/globals.css`, concatenated in that order.
4. Add `'use client'` as line 1 of every component, context and page module (GC4 — nothing else in
   those files changes).
5. Apply the router swap from spec §4.3 across all fourteen affected files. Wrap any page whose tree
   reads `useSearchParams` in a `<Suspense>` boundary.
   **`components/AdminLayout` stays a plain wrapper component** — do not convert it to
   `app/admin/layout.jsx` (spec §4.3).
6. Move `src/assets/*` → `public/images/` and replace the twenty imports with string literals
   (spec §4.4). Do **not** adopt `next/image`.
7. `next.config.js`, `postcss.config.mjs` with `@tailwindcss/postcss`. Delete `vite.config.js`,
   `index.html`, `src/main.jsx`, `src/App.jsx` and the now-empty `src/` tree. Remove
   `react-router-dom` and the Vite dev-dependencies from `package.json`.
8. `next.config.js` gets a `headers()` block reproducing the `helmet` defaults the old server sent
   (spec §8.5).

**Constraint.** No JSX inside a component may change other than the router-import swaps and the
asset-literal swaps. No Tailwind class may change. If a component seems to need a change, stop and
report it rather than editing it.

**Tests.** `test/shell.test.js` — assert every route in `src/App.jsx`'s original route table has a
corresponding `app/**/page.jsx`; assert no file under `components/`, `context/` or `app/` still
imports from `react-router-dom`; assert no file imports from `../assets` or `src/assets`; assert
every component file that uses a hook begins with `'use client'`.

**Verification.** `npm run build` succeeds. Paste the build output including the route table.
`npm test` green.

**Out of scope.** Any `app/api/**` route — later tasks add those. The build will succeed with pages
whose `fetch('/api/...')` calls 404 at runtime; that is expected at this stage.

---

## Task 8: Route handlers — health and auth

**Objective.** Ten endpoints: `GET /api/health` plus the nine under `/api/auth`.

**Read first.** `server/server.js` (the health handler), `server/controllers/authController.js`,
`server/routes/authRoutes.js`.

**Create** `app/api/health/route.js` and the auth routes under `app/api/auth/`: `register`, `login`,
`google`, `facebook`, `refresh`, `logout`, `forgot-password`, `reset-password`, `me`.

**Requirements.**
- Every handler: `export const runtime = 'nodejs'` (GC6).
- Ported logic must match the controller **statement for statement** in its observable effects —
  every validation, in the same order, with the same message and status. Read the controller and
  work down it.
- `/health` reports a `dbStatus` using the same `{0:'disconnected',1:'connected',2:'connecting',
  3:'disconnecting'}` vocabulary, derived from whether a trivial Postgres ping succeeds.
- Password hashing stays `bcryptjs` with `genSalt(10)`, matching the `User` pre-save hook.
- `register` writes `is_email_verified = true` and `is_active = true`, creates the refresh-token row
  with a 30-day expiry, and returns 201 with the exact success message.
- `login`, `google` and `facebook` reproduce their account-linking and creation branches exactly,
  including the generated fallback email `facebook_<id>@zahzan.com` and the `'Valued'`/`'Client'`
  name defaults.
- `refresh` verifies the JWT, then requires a matching non-revoked, unexpired row.
- `forgot-password` returns the generic response whether or not the account exists, deletes prior
  reset tokens for the user, and creates a 1-hour token.
- `reset-password` marks the token used and revokes all the user's refresh tokens.
- Rate limiters attach exactly as in `authRoutes.js`: `registerLimiter` on register, `loginLimiter`
  on login, `passwordResetLimiter` on both password endpoints.
- Apply GC7: lowercase and trim emails on write.

**Tests.** `test/api/auth.test.js` against PGlite — register then login round-trip; duplicate email
rejected with the exact message; short password rejected; mismatched `confirmPassword` rejected;
login with a wrong password gives 401 and the exact message; a deactivated account gives 403;
`me` with no token, a bad token, and a good token; refresh with a revoked token fails; forgot-password
returns the generic response for an unknown email; reset-password with an expired token fails and
with a valid token succeeds and revokes refresh tokens.

**Golden files (ruling C3, pre-flight).** Read the Task 2 goldens in `tools/golden/` as the
authoritative reference for response **shape and exact message strings**, and assert those in your
tests. Do **not** attempt a whole-body equality assertion against them — the goldens were captured
from Mongo-seeded fixtures and your tests use their own PGlite fixtures, so ids and row counts
legitimately differ. Systematic whole-body diffing is Task 15's job.

**Verification.** `npm test` green. Report which golden files you consulted.

---

## Task 9: Route handlers — products and users

**Objective.** Fifteen endpoints: three under `/api/products`, twelve under `/api/users`.

**Read first.** `server/controllers/productController.js`, `server/controllers/userController.js`,
and the two route files.

**Requirements.**
- `GET /api/products` — the `isActive: true` filter, exact-match case-insensitive `category`
  (the current code anchors the regex: `^category$`), and the three-field `$or` search across
  `name`, `description` and `category`. Sort by `created_at desc`. Response carries `count` and
  `products`.
- `GET /api/products/:id` — UUID first, then slug (lowercased), then SKU (uppercased). Returns the
  product under **both** `product` and `data` keys, as the current code does.
- `POST /api/products` — admin only; mirrors `Product.create(req.body)` including the slug
  auto-generation `pre('validate')` hook (`name` lowercased, non-alphanumerics to hyphens, trimmed of
  leading/trailing hyphens, then `-<sku lowercased>` appended when a SKU is present).
- The twelve user endpoints reproduce `userController.js` exactly — profile read and patch, the
  email-change request and confirmation flow, five address endpoints including the
  single-default invariant, and the three wishlist endpoints whose responses return `wishlist` as an
  **array of id strings** plus, for the GET, a `products` array of full product objects.
- Addresses serialize with `_id` (GC2) — the frontend reads `addr._id` with no fallback.

**Tests.** `test/api/products.test.js` and `test/api/users.test.js` — every filter branch; lookup by
each of the three identifier kinds; a nonexistent id 404s with the exact message; setting a default
address clears the previous default; deleting an address the user does not own is rejected; wishlist
toggle is idempotent in both directions; the wishlist GET returns ids and products consistently.
Compare against Task 2 goldens where they cover the case.

**Verification.** `npm test` green.

---

## Task 10: Route handlers — cart

**Objective.** Five endpoints under `/api/cart`, all authenticated.

**Read first.** `server/controllers/cartController.js` in full — especially `formatCartResponse`
and the duplicate-item merge rule in `addToCart`.

**Requirements.**
- `GET /api/cart` auto-creates the cart row when absent, exactly as today.
- Every response goes through `serializeCart` from Task 4 — no hand-built cart JSON.
- `addToCart` merges into an existing line when product, size and colour all match, otherwise appends;
  reproduce the current matching rule precisely by reading the controller.
- Items whose product row has been deleted are filtered out of responses, as the current
  `items.filter((item) => item.product != null)` does.
- `PATCH` and `DELETE /items/:id` address the `cart_items` row by its own id — this is why
  `cart_items` is a real table (spec §5.2). Preserve the current handling of the optional query
  string the frontend appends (`src/context/CartContext.jsx:144`).
- Stock is **not** decremented here; only checkout touches stock.

**Tests.** `test/api/cart.test.js` — auto-create on first GET; add; add the same variant again and
assert a merge rather than a second line; add a different size and assert a separate line; patch
quantity; patch to an invalid quantity; delete an item; clear; a deleted product disappears from the
response; the `subtotal` and `totalCount` totals are correct; cart of user A is invisible to user B.

**Verification.** `npm test` green.

---

## Task 11: Route handlers — orders

**Objective.** Five endpoints under `/api/orders`, plus the atomic SQL functions checkout needs.

**Read first.** `server/controllers/orderController.js` in full.

**Requirements.**
- Append to `supabase/migrations/0001_init.sql`:
  - `next_order_number()` — produces `ZHZ-YYYYMMDD-XXXX` with a per-day sequence, using an advisory
    lock or a counter table so concurrent callers cannot collide (spec §8.2). The **format is
    unchanged**; only the race is fixed.
  - `create_order(...)` — one plpgsql function performing, atomically: stock validation, order
    insert, optional payment insert, stock decrement, and cart clearing (spec §8.3). It raises with
    the controller's exact messages so the route can map them to the right status codes.
  - `cancel_order(...)` — status-transition check plus stock restoration, atomically.
- The route handler keeps every validation the controller performs **before** the database work:
  the `customerInfo` / `shippingAddress` / `buyNowItem` JSON-string parsing, the customer-field and
  seven-field address validation, the advance-payment branch requiring a method, a transaction
  reference and a proof file, and the `paymentChoice`/`isCOD` derivation.
- Shipping is `subtotal >= 20000 ? 0 : 250`. Prices come from the product row, never the client.
- `paymentMethod` is `'Cash on Delivery'` for COD; `paymentStatus` is `'not_required'` for COD and
  `'submitted'` otherwise.
- On a payment-insert failure the uploaded proof is deleted from storage, mirroring the current
  Cloudinary rollback.
- Emails dispatch through `lib/email.js` after a successful order (GC6/spec §7.6).
- `GET /:id` and `PATCH /:id/cancel` resolve by UUID first, then by `orderNumber` uppercased, and
  enforce the same ownership and admin rules.

**Tests.** `test/api/orders.test.js` — COD order from cart; buy-now order; an advance-payment order
with a proof fixture; insufficient stock rejected with the exact message and **no** partial writes
(assert stock and order count are unchanged); an inactive product rejected; an empty cart rejected;
incomplete address rejected; shipping-cost boundary at exactly 20000; stock decrements by the ordered
quantity; the cart is cleared for a cart checkout but not for buy-now; cancel restores stock; cancel
of an already-shipped order is rejected; cancelling twice is rejected the second time; another user
cannot fetch or cancel the order. Include a concurrency test issuing several `next_order_number()`
calls and asserting all values are distinct.

**Verification.** `npm test` green. Report the atomicity test output specifically.

---

## Task 12: Route handlers — payments, newsletter, and the 501 stubs

**Objective.** Eleven endpoints: four payments, three newsletter, four stubs.

**Read first.** `server/controllers/paymentController.js`, `server/config/paymentMethods.js`,
`server/controllers/newsletterController.js`, `server/controllers/storyController.js`,
`server/controllers/tryOnController.js`.

**Requirements.**
- `GET /api/payments/methods` returns `PAYMENT_METHODS` unchanged. Port
  `server/config/paymentMethods.js` to `lib/paymentMethods.js` **byte-identically** — account
  numbers, IBAN, branch and instruction strings included.
- `POST /api/payments` and the `POST /api/payments/proof` alias share one implementation; they differ
  only in the multipart field name (`proof` vs `proofImage`).
- Preserve the duplicate-transaction-reference guard: a reference already used by a Pending or
  Verified payment on a **different** order is rejected with the exact message. The comparison is
  case-insensitive and the stored value is uppercased.
- The payment amount comes from the order row, never the request.
- `proof_url` stores the storage path; responses expose a freshly signed URL (spec §7.4).
- Newsletter: subscribe is idempotent for an already-subscribed address and re-subscribes an
  unsubscribed one; unsubscribe works by token via both GET and POST. `newsletterLimiter` attaches to
  subscribe.
- The four stubs return **exactly** `{ success: false, message: 'Endpoint not implemented yet' }`
  with status 501 (GC4). Do not implement them.

**Tests.** `test/api/payments.test.js`, `test/api/newsletter.test.js`, `test/api/stubs.test.js` —
methods payload matches the config object; proof submission on someone else's order is 403; on a
cancelled order is rejected; on an already-verified order is rejected; a duplicate reference on
another order is rejected but the **same** order may resubmit; both field names work; subscribe
twice; unsubscribe then resubscribe; all four stubs return 501 with the exact body.

**Verification.** `npm test` green.

---

## Task 13: Route handlers — admin

**Objective.** The twenty-one endpoints under `/api/admin`, plus the dashboard SQL function.

**Read first.** `server/controllers/adminController.js` in full — all 1,102 lines — and
`server/routes/adminRoutes.js` for the middleware order.

**Requirements.**
- `POST /api/admin/auth/login` is public; every other admin route requires auth **and** the admin
  role, in that order, producing 401 before 403.
- Note the quirk in `adminLogin`: it calls `generateToken(user._id)` with no role argument, so the
  token carries the default `'customer'` role. Reproduce this exactly (GC4) — it is existing
  behaviour, and `requireAdmin` re-reads the role from the database row rather than the token.
  Flag it in your report as a pre-existing oddity; do not fix it.
- Append `admin_dashboard_stats()` to the migration, returning one jsonb blob; the route reshapes it
  into the exact nested `stats` structure (spec §6.4). Replicate the `stock <= 3` fetch and the
  JavaScript partition into `lowStockCount` (`stock > 0`) and `outOfStockCount` (`stock === 0`),
  with `lowStockProducts` carrying **all** rows at `stock <= 3`.
- Every list endpoint keeps its pagination contract — `page`, `limit`, `skip` arithmetic and the
  `{ success, total, currentPage, totalPages, <collection> }` envelope. Defaults are `page=1`,
  `limit=10`.
- Search filters translate `$regex` to `ILIKE` with `%` wrapping; the `status` filter is an anchored
  case-insensitive exact match, matching `new RegExp('^status$', 'i')`.
- The order list attaches the latest payment per order under `payment`, as `getAllOrders` does.
- Audit logging via a ported `lib/auditLogger.js` fires on the same actions with the same action
  strings; it swallows its own errors exactly as today.
- Payment verify and reject update both the payment and its order, and send the customer emails the
  current code sends.
- Product delete honours the `?permanent=true` query parameter, soft-deleting otherwise.
- Newsletter export returns the same CSV content type and column order.

**Tests.** `test/api/admin.test.js` — admin login succeeds and a customer is rejected with 403;
every list endpoint paginates, searches and filters correctly; `totalPages` arithmetic is right at a
boundary (e.g. 11 rows at `limit=10`); dashboard totals match hand-computed fixtures including the
low-stock partition; order status update writes an audit log; payment verify flips both records and
is idempotent-safe; product soft delete leaves the row but flips `is_active`, permanent delete
removes it; a customer token is rejected on three different admin routes.

**Verification.** `npm test` green. Report the endpoint count you implemented — it must be 21.

---

## Task 14: Data migration and seed scripts

**Objective.** Move the products and admin users out of MongoDB (spec §9); make fresh environments
reproducible.

**Read first.** `server/scripts/seedAdmin.js`, `server/scripts/seedProducts.js`.

**Files to create.**
- `tools/migrate-products.mjs` — Mongo read-only → Postgres. Maps every field, flattens the four
  arrays to `text[]`, `colors`/`breakdown` to jsonb, preserves `slug`, `sku` and `createdAt`, and
  writes an `old_id → new_id` map to `tools/migration-idmap.json`. Idempotent: re-running updates
  by `slug` rather than inserting duplicates. Supports `--dry-run`.
- `tools/migrate-admins.mjs` — copies admin users **including the bcrypt hash verbatim**, so existing
  admin passwords keep working, plus the `admin_users` metadata row. Idempotent by email.
- `tools/seed-products.mjs`, `tools/seed-admin.mjs` — Postgres equivalents of the two existing seed
  scripts, same data.
- `docs/DATA_MIGRATION.md` — how to run each, in order, with the required environment variables.

**Requirements.** Never write to MongoDB. Print a summary — rows read, inserted, updated, skipped.
Fail loudly on a constraint violation rather than continuing silently.

**Tests.** `test/migrate.test.js` — against PGlite plus a fixture representing Mongo documents (do
not require a live Mongo connection in the test): array and jsonb mapping is correct; re-running is
idempotent; a bcrypt hash survives the copy byte for byte and still verifies with `bcryptjs.compare`;
`--dry-run` writes nothing.

**Verification.** `npm test` green. Then run `tools/migrate-products.mjs --dry-run` against the live
`zahzan_db` (read-only, safe) and paste the summary.

---

## Task 15: Parity verification

**Objective.** Prove the migration preserved behaviour. This is the acceptance gate for the whole
plan (spec §10).

**Do.**
1. Start the Next.js app against a PGlite-backed or user-provided Postgres, seeded to match the
   Task 2 contract fixtures exactly.
2. Run `tools/contract-capture.mjs --base http://localhost:3000 --out tools/golden-next/`.
3. Run `tools/contract-diff.mjs tools/golden tools/golden-next`.
4. Fix every diff. Each one is either a real parity defect or a normalisation gap — classify it, and
   record which in `docs/PARITY_REPORT.md`.
5. Re-run until the diff is empty, or until every remaining diff has a written justification.

**Also verify.**
- A JWT minted by the old Express server authenticates against the new API (spec §10.2). Prove it by
  minting with `server/utils/jwt.js` and calling `GET /api/auth/me` on the Next app.
- `npm run build` succeeds and `npm test` is fully green.

**Deliverable.** `docs/PARITY_REPORT.md` — every endpoint, its diff status, and a justification for
each accepted difference. Plus an honest list of anything that could **not** be verified locally and
needs a real Supabase project.

**Verification.** Paste the final `contract-diff` output in your report. If it is not empty, list
every remaining entry with its classification.
