# ZAHZAN — Migration Plan: Vite/React + Express/MongoDB → Next.js + Supabase

**Goal:** change the stack, change nothing else. Every pixel, every API path, every JSON key, every
error string, and every localStorage key stays byte-identical. The frontend components are treated as
frozen artefacts; the backend is re-hosted, not redesigned.

**Decisions locked before planning:**

| Decision | Choice |
| --- | --- |
| Auth | Keep the existing hand-rolled JWT + bcrypt. Supabase is Postgres + Storage only. No GoTrue, no RLS-as-security-layer. |
| Data migration | Products + admin users only. Orders, customers, carts, payments start clean. |
| File storage | Supabase Storage. Replaces multer + local `uploads/` + Cloudinary. |
| Routing | Real Next.js App Router file routes. Components move verbatim. |

---

## 1. What exists today (measured, not assumed)

**Frontend** — 39 files, ~10,700 LOC.

- Vite 8 + React 19 + react-router-dom 7 + Tailwind v4 (via `@tailwindcss/vite`).
- 9 routes: `/`, `/shop`, `/product/:id`, `/collections`, `/account`, and 7 `/admin/*` routes.
- Two React contexts (`CartContext`, `WishlistContext`) wrap the whole app.
- **All server access is raw `fetch` against a hardcoded `const API_BASE = '/api'`** — declared
  identically in 17 separate files. There is no API client module. Vite's dev proxy forwards
  `/api` → `localhost:5000`.
- Auth is `localStorage.getItem('zahzan_token')` + `Authorization: Bearer <token>`, with
  `zahzan_refresh_token` alongside. 50 call sites.
- 20 static asset imports from `src/assets/`, consumed as bare strings in `<img src={logo}>`.

**Backend** — 67 endpoints across 10 routers, ~4,200 LOC of controllers/middleware/utils, 16 Mongoose models.

Live surface (`server/routes/*.js`):

| Router | Endpoints | Notes |
| --- | --- | --- |
| `/api/auth` | 9 | register, login, google, facebook, refresh, logout, forgot/reset-password, me |
| `/api/users` | 12 | profile, email-change, 5 address endpoints, 3 wishlist endpoints |
| `/api/products` | 3 | list, get-by-id-or-slug-or-sku, admin create |
| `/api/cart` | 5 | all protected |
| `/api/orders` | 5 | POST is multipart (optional payment proof) |
| `/api/payments` | 4 | includes a `/proof` back-compat alias using field name `proofImage` |
| `/api/newsletter` | 3 | subscribe, unsubscribe by token (GET + POST) |
| `/api/admin` | 21 | login, dashboard, orders, payments, customers, products, newsletter, audit-logs |
| `/api/try-on` | 2 | **hardcoded 501 stubs** |
| `/api/stories` | 2 | **hardcoded 501 stubs** |
| `/api/health` | 1 | reports mongoose `readyState` |

Models actually exercised by runtime code: `User`, `Product`, `Order`, `Cart`, `Payment`,
`Address`, `RefreshToken`, `PasswordResetToken`, `EmailChangeToken`, `NewsletterSubscriber`,
`AuditLog`. Dead or seed-only: `AdminUser` (seed script only), `Notification`, `VerificationToken`,
`OrderItem` (used only as an embedded sub-schema), `StorySubmission`, `TryOnJob` (both behind 501s).

---

## 2. The parity contract

This is the acceptance criterion for the whole project. A change is a **defect** if it alters any of:

1. **Path, method, and status code** of any of the 67 endpoints.
2. **Response JSON, key for key**, including the envelope (`success`, `message`, `count`, `total`,
   `currentPage`, `totalPages`) and the *human-readable error strings* — the UI renders
   `data.message` directly in ~40 places.
3. **Both `_id` and `id` on every entity.** See §6.1 — this is the single most likely thing to break.
4. **camelCase field names** (`createdAt`, `orderNumber`, `paymentStatus`, `isActive`, `firstName`, …).
5. **JWT payload and secret handling** — `{ id, role }` signed with `JWT_SECRET`, so tokens issued
   by the old server keep validating.
6. **localStorage keys** `zahzan_token` and `zahzan_refresh_token`.
7. **Rendered DOM** — no component JSX or Tailwind class may change except the router-import swaps
   in §4.3.

---

## 3. Phase 0 — Build the regression oracle *(do this first, before touching anything)*

You already have 13 integration scripts in `server/scripts/test*.js`. They assert behaviour but
don't capture it. Convert them into a golden-snapshot harness.

**0.1** Write `tools/contract-capture.mjs`: a script that walks a scripted user journey against the
**current** Express server and writes every request/response pair to `tools/golden/<name>.json`.
The journey must cover, at minimum:

- register → login → refresh → me → logout
- forgot-password → reset-password
- products list (unfiltered, `?category=`, `?search=`) and get by `_id`, by `slug`, by `sku`
- cart: get (auto-create), add, add-duplicate, patch qty, delete item, clear
- wishlist: get, toggle on, toggle off, delete
- addresses: create, patch, set-default, delete, list
- order: COD create, advance-payment create with file, list, get by id, get by orderNumber, cancel
- payment: methods, submit proof, submit via `/proof` alias, get by order
- newsletter: subscribe, duplicate subscribe, unsubscribe by token
- admin: login, me, dashboard, each list endpoint with pagination + search + status filter,
  order status update, payment verify, payment reject, product CRUD, product soft/permanent delete,
  customer status toggle, newsletter export, audit logs
- every auth-failure path: no token, bad token, customer token on admin route (401/403 bodies)
- both 501 stubs

**0.2** Normalise volatile fields (ids, timestamps, tokens) into placeholders so snapshots diff cleanly.

**0.3** Point the same script at the Next.js app via a `BASE_URL` env var. Phase 6 is "run it and get
a zero diff."

> Without this, "nothing changed" is an opinion. With it, it's a test.

---

## 4. Phase 1 — Next.js shell

### 4.1 Scaffold

Create the Next app **in place** so git history is preserved:

```
app/
  layout.jsx            <- replaces index.html + main.jsx; hosts <WishlistProvider><CartProvider>
                           and the always-mounted <CartDrawer/> <WishlistDrawer/>
  globals.css           <- src/index.css + src/App.css
  page.jsx              <- Home
  shop/page.jsx
  product/[id]/page.jsx
  collections/page.jsx
  account/page.jsx
  admin/page.jsx        <- AdminLogin (the `/admin` route)
  admin/login/page.jsx  <- AdminLogin
  admin/dashboard/page.jsx
  admin/orders/page.jsx
  admin/payments/page.jsx
  admin/products/page.jsx
  admin/customers/page.jsx
  admin/newsletter/page.jsx
  admin/audit-logs/page.jsx
  api/**/route.js       <- Phase 3
components/             <- moved from src/components, unchanged
context/                <- moved from src/context
lib/                    <- new server-side shared modules
public/images/…         <- src/assets moved here (see 4.4)
```

- Tailwind v4 moves from the Vite plugin to `@tailwindcss/postcss` + `postcss.config.mjs`.
  The `@import "tailwindcss"` line in `index.css` and every utility class stay as they are.
- Keep plain JavaScript + `.jsx`. Do not introduce TypeScript — it is scope creep and a diff amplifier.
- Delete `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx` only at the very end of the phase.

### 4.2 `'use client'`

Every page and every component in this app uses hooks, context, or browser APIs. Add `'use client'`
as line 1 to all of them. Do **not** attempt to convert anything to a Server Component in this
project — that would change data-fetching timing and therefore behaviour. Server rendering benefits
are a follow-up project, not part of a stack swap.

### 4.3 React Router → Next navigation

39 call sites across 14 files. This is the *only* sanctioned edit to component code.

| react-router-dom | next |
| --- | --- |
| `import { Link } from 'react-router-dom'` | `import Link from 'next/link'` |
| `<Link to="/shop">` | `<Link href="/shop">` |
| `useNavigate()` → `navigate('/x')` | `useRouter()` from `next/navigation` → `router.push('/x')` |
| `navigate(-1)` | `router.back()` |
| `useParams()` | `useParams()` from `next/navigation` |
| `useLocation()` | `usePathname()` / `useSearchParams()` |
| `<BrowserRouter><Routes><Route>` | deleted — replaced by the file tree |

Two traps:
- `useSearchParams` in Next requires the consuming component to sit inside a `<Suspense>` boundary
  during static rendering. Wrap the affected page bodies.
- `AdminLayout.jsx` is a wrapper component the admin pages import, **not** a route layout. Leave it
  exactly as it is — do not convert it to `app/admin/layout.jsx`, because it renders conditionally
  based on an auth check and moving it changes mount order.

### 4.4 Static assets — **a real breaking change**

In Vite, `import logo from '../assets/logo.png'` yields a **string**. In Next it yields a
`StaticImageData` **object**, so the existing `<img src={logo}>` renders `[object Object]`.

Move `src/assets/*` → `public/images/` and replace the 20 imports with string literals:

```js
// before
import logo from '../assets/logo.png'
// after
const logo = '/images/logo.png'
```

This keeps all 37 `src={...}` JSX expressions untouched. Do **not** switch to `next/image` — it
changes the emitted DOM (wrapper spans, `srcset`, lazy behaviour) and would violate the parity contract.

---

## 5. Phase 2 — Supabase schema

`supabase/migrations/0001_init.sql`. 18 tables.

### 5.1 Direct 1:1 tables

`users`, `products`, `orders`, `carts`, `payments`, `addresses`, `refresh_tokens`,
`password_reset_tokens`, `email_change_tokens`, `newsletter_subscribers`, `audit_logs`,
`admin_users`, `notifications`, `verification_tokens`, `story_submissions`, `tryon_jobs`.

Conventions:

- **Primary keys:** `id uuid primary key default gen_random_uuid()`. Mongo ObjectIds become UUIDs;
  the serializer emits the same UUID string as both `_id` and `id`, so the frontend never notices.
- **Columns:** snake_case in Postgres, camelCase in JSON. The mapping lives in exactly one place
  (`lib/serialize.js`, §7.3) rather than being spread across 40 route files.
- **Enums:** use `text` + `CHECK` constraints, *not* Postgres `enum` types. The values are
  user-visible strings with spaces (`'Cash on Delivery'`, `'Bank Transfer'`) and `CHECK` keeps them
  editable without a type migration.
- **Timestamps:** `created_at`/`updated_at timestamptz default now()`, plus a shared
  `set_updated_at()` trigger to replicate Mongoose's `timestamps: true`.

### 5.2 Embedded documents — the decisions

| Mongo | Postgres | Why |
| --- | --- | --- |
| `Product.images[]`, `sizes[]`, `careInstructions[]`, `gallery[]` | `text[]` | Ordered, never queried individually. |
| `Product.colors[]` (`{name,hex,image}`) | `jsonb` | Fixed shape, rendered whole. |
| `Product.breakdown` (`{shirt,trouser,dupatta}`) | `jsonb` | Same. |
| `Order.items[]` | `jsonb` | **Deliberate.** These are immutable price/name snapshots taken at checkout, never joined or aggregated. jsonb preserves the exact array shape the UI reads, with zero reassembly. Do not normalise into `order_items` — you'd gain nothing and risk field drift. |
| `Order.shippingAddress` | `jsonb` | Already `_id: false` embedded; a pure snapshot. |
| `Cart.items[]` | **table `cart_items`** | **Must** be a real table: each item's `_id` is returned as `cartItemId` and used in the URL `PATCH/DELETE /api/cart/items/:id`. It needs a stable, addressable PK. |
| `User.wishlist[]` (ObjectId array) | **table `wishlist_items`** | Join table `(user_id, product_id)` with a unique pair constraint. Read back ordered by `created_at` to preserve insertion order. |

### 5.3 TTL indexes

Four collections use Mongo's `expiresAt` TTL index (`refresh_tokens`, `password_reset_tokens`,
`email_change_tokens`, `verification_tokens`). Postgres has no equivalent. Replicate with:

1. Every read filters `where expires_at > now()` — this is what actually guarantees correctness.
2. A `pg_cron` job (`select cron.schedule('purge-expired','*/15 * * * *', $$ ... $$)`) deletes
   expired rows — this is only housekeeping.

Do not rely on cron alone; the filter is the security boundary.

### 5.4 Constraints and indexes to carry over

- `users.email` unique — Mongo lowercases on write, so keep lowercasing on write **and** add a
  `unique index on lower(email)`.
- `products.slug` unique, `products.sku` unique (uppercased on write).
- `orders.order_number` unique.
- `carts.user_id` unique.
- `newsletter_subscribers.email` unique; `unsubscribe_token` unique **sparse** → in Postgres,
  `create unique index … on newsletter_subscribers (unsubscribe_token) where unsubscribe_token is not null`.
- Index every field the admin list endpoints filter or sort on: `orders.created_at`,
  `orders.order_status`, `payments.status`, `audit_logs.action`, `audit_logs.admin_id`,
  `products.category`, `products.is_active`.

### 5.5 RLS

Enable RLS on every table and add **no permissive policies**. All access goes through Next.js route
handlers using the `service_role` key, which bypasses RLS. This is deliberate: with the "keep our own
JWT" decision, Supabase has no `auth.uid()` to key policies off, so RLS cannot be the security layer —
the `protect`/`requireAdmin` checks in the route handlers are. Enabling RLS with zero policies means a
leaked `anon` key grants nothing.

**The `service_role` key must never be exposed to the browser.** It is server-only, never prefixed
`NEXT_PUBLIC_`, and never imported into a `'use client'` file.

---

## 6. Phase 3 — Port the 67 endpoints

One `route.js` per path (~40 files, since e.g. `/api/cart/route.js` exports both `GET` and `DELETE`).

### 6.1 The `_id` requirement — read this twice

The frontend reads `_id` in 43 places. Most use the defensive `x._id || x.id`, **but these do not**:

- `src/pages/Account.jsx:1162, 1192, 1200` — `addr._id` (address list keys, set-default, delete)
- `src/pages/admin/AdminCustomers.jsx:294, 313` — `addr._id`, `ord._id`
- `src/pages/admin/AdminCustomers.jsx:116, 118` — strict `c._id === cust._id` comparison

If addresses come back without `_id`, the customer's saved-address list silently breaks and the
delete/set-default buttons fire with `undefined`. **Every serialized entity must carry `_id` and `id`
set to the same string.** Assert this in the Phase 0 contract tests.

### 6.2 Port order (dependency-first)

1. `lib/` foundations (§7) — nothing works without these.
2. `/api/health` — smallest possible end-to-end proof that Next ↔ Supabase is wired.
3. `/api/auth/*` (9) — unblocks everything protected.
4. `/api/products/*` (3) — read-only, easy, and it's what Shop/Product/nav depend on.
5. `/api/users/*` (12).
6. `/api/cart/*` (5).
7. `/api/orders/*` (5) — depends on products, cart, payments, storage, email.
8. `/api/payments/*` (4).
9. `/api/newsletter/*` (3).
10. `/api/admin/*` (21) — the biggest chunk; depends on everything above.
11. `/api/try-on/*`, `/api/stories/*` (4) — port as literal 501 stubs. **Do not implement them.**
    They are 501 today; they must be 501 tomorrow.

### 6.3 Query translation

| Mongoose | Supabase / Postgres |
| --- | --- |
| `Model.find(filter).sort().skip().limit()` | `.select().match().order().range(from, to)` |
| `countDocuments(q)` | `.select('*', { count: 'exact', head: true })` |
| `$regex` case-insensitive | `.ilike('col', '%term%')` |
| `$or: [{a},{b}]` | `.or('a.ilike.%t%,b.ilike.%t%')` |
| `$inc: { stock: -n }` | RPC (see §8.3) — **not** read-then-write |
| `.populate('items.product')` | `.select('*, product:products(*)')` on `cart_items` |
| `Order.aggregate([$match,$group,$sum])` | a `sum()` via RPC or a small SQL view |
| `findById` where the id may be a slug/SKU/orderNumber | branch on a UUID regex first, then fall back — mirrors the existing `mongoose.Types.ObjectId.isValid(id)` branch exactly |

### 6.4 Admin dashboard

`getAdminDashboardStats` issues 13 sequential queries plus two aggregations. Replace with **one**
Postgres function `admin_dashboard_stats()` returning a single jsonb blob, then reshape it in the
route handler into the exact nested `stats: { orders, revenue, customers, inventory, payments,
newsletter, recentOrders }` structure the dashboard reads. One round trip instead of 15.

Note `lowStockCount`/`outOfStockCount` are computed in JS from a `stock <= 3` fetch — replicate that
logic verbatim (`stock > 0` vs `stock === 0`), including the fact that `lowStockProducts` returns
*all* items with `stock <= 3` while the two counts partition them.

---

## 7. Phase 4 — Shared server modules (`lib/`)

### 7.1 `lib/supabase.js`
Server-only client using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Single module-scope instance.

### 7.2 `lib/auth.js`
Direct ports of `authMiddleware.protect` and `adminMiddleware.requireAdmin`, reshaped as functions
that return `{ user }` or a ready-made `NextResponse`. Keep `utils/jwt.js` verbatim — same
`jsonwebtoken`, same secrets, same `{ id, role }` payload, same fallback dev secrets. Existing
tokens must keep working.

Preserve the quirk that `protect` returns *"Not authorized, no token provided"* vs *"Not authorized,
token failed or expired"* — these strings surface in the UI.

### 7.3 `lib/serialize.js`
One exported function per entity (`serializeProduct`, `serializeOrder`, …). Each one:
snake_case → camelCase, adds `_id` **and** `id`, drops `password`, formats timestamps as ISO strings.
This is where the parity contract is enforced; nothing else should hand-build response objects.

Mirror the existing Mongoose `toJSON` transforms exactly — including that `User` strips `password`
and `__v`, that `NewsletterSubscriber` strips `unsubscribeToken`, and that `User` exposes a virtual
`name` = `firstName + ' ' + lastName`.

### 7.4 `lib/storage.js`
Two buckets:
- `product-images` — public.
- `payment-proofs` — **private**, read via short-lived signed URLs.

Replaces `utils/cloudinary.js`. Keep the same public API shape (`{ secure_url, public_id }`) so the
call sites in `orderController` and `paymentController` port with near-zero edits. Keep the same
validation: jpg/jpeg/png/webp for general uploads; jpg/jpeg/png/webp/**pdf** for payment proofs;
5 MB cap; same rejection messages.

**Signed-URL caveat:** `payments.proof_url` currently stores a permanently public Cloudinary URL that
the admin UI renders directly. With a private bucket, store the *storage path* in the column and
have every admin read generate a fresh signed URL into the `proofUrl` field of the response. If you
store a signed URL in the column, admin proof images will 403 once it expires.

### 7.5 `lib/rateLimit.js` — **express-rate-limit cannot survive**

It is in-memory per-process. Serverless functions are ephemeral and horizontally scaled, so the
counters would reset constantly and the limits would be decorative. Replace with a `rate_limits`
table `(key text, window_start timestamptz, count int)` and an atomic
`check_rate_limit(key, max, window_seconds)` Postgres function.

Keep all five configurations byte-identical: global 200/15min on `/api/*`, login 10/15min,
register 10/1h, password-reset 5/15min, newsletter 15/15min — **including the exact `message`
strings**, which the UI displays.

Rate-limit key = client IP from the `x-forwarded-for` header (Express's `req.ip` equivalent).

### 7.6 `lib/email.js`
`services/emailService.js` ports essentially unchanged — Resend and Nodemailer both work in Node
route handlers. Two adjustments:

- The current code fires emails without awaiting (`sendAdminNewOrderEmail(order)` with a detached
  `.catch()`). **On serverless this is a bug**: the function may freeze before the request completes.
  Use `waitUntil()` (Vercel) or `await` the sends. Awaiting adds latency but is correct; the
  user-visible response is unchanged either way.
- Ensure the route handlers that send email run on the Node.js runtime, not Edge.

### 7.7 `lib/multipart.js`
Replaces multer. Next route handlers give you `await request.formData()`; pull the `File`, validate
extension + MIME + size against the same rules, and hand a `Buffer` to `lib/storage.js`. No temp
files, no `uploads/` directory, no `fs`.

Field names must match exactly: `proof` on `POST /api/orders` and `POST /api/payments`,
`proofImage` on the `POST /api/payments/proof` alias, `image` on stories, `inputImage` on try-on.

---

## 8. Known behavioural hazards

These are places where a naive port is either broken or silently different. Decide on each **before** coding.

### 8.1 Upload body size — the one real platform blocker

Payment proofs allow 5 MB. Vercel serverless functions cap request bodies at **4.5 MB**. A 5 MB
receipt PDF that works today would fail after migration.

Options, in order of preference:
- **(a)** Deploy the app somewhere without the cap (Railway, Fly, a container). Zero code change,
  full parity. *Recommended if parity is genuinely absolute.*
- **(b)** Browser uploads straight to Supabase Storage via a signed upload URL, then POST the
  resulting path as JSON. Correct and scalable, but it **changes `SubmitPaymentModal.jsx` and
  `CheckoutModal.jsx`** — a frontend change, which violates the freeze.
- **(c)** Accept a 4.5 MB effective cap. Cheapest, and probably invisible in practice (phone
  screenshots are typically well under 1 MB) — but it *is* a behaviour change.

### 8.2 Order-number race

`generateOrderNumber()` does read-latest-then-increment with no lock. Two concurrent checkouts can
generate the same `ZHZ-YYYYMMDD-0001` and one will fail on the unique index. This is already a latent
bug; serverless concurrency makes it likelier. Fix with a Postgres function using an advisory lock or
a per-day counter table. The output format is unchanged, so this is invisible to the frontend.

### 8.3 Checkout is not atomic

`createOrder` performs: validate stock → insert order → insert payment → loop `$inc` stock → clear
cart, with no transaction. A mid-flight failure leaves the database inconsistent. Port it into a
single `create_order(...)` plpgsql function so it's all-or-nothing. On the happy path the response is
identical; on the failure path it's strictly better. Same for `cancelOrder`'s stock restoration.

### 8.4 Two endpoints the frontend calls that don't exist

- `src/pages/Account.jsx:77` → `GET /api/auth/verify-email?token=…`
- `src/pages/Account.jsx:355` → `POST /api/auth/change-password`

Neither is in `authRoutes.js`. They 404 today, which means **"Change Password" in the account page is
a broken feature right now.** Under a strict freeze, the correct port is to leave them 404. Flagging
it because you may not know it's broken — fixing it is a separate, deliberate decision, not something
the migration should smuggle in.

### 8.5 Things that simply disappear (correctly)

- **CORS** — same-origin now. Delete the `cors` config.
- **`helmet`** — re-express as `headers()` in `next.config.js` if you want the same headers; note the
  current config sets `crossOriginResourcePolicy: 'cross-origin'` specifically to let the browser
  load `/uploads/*` images, which no longer exist.
- **`/uploads` static serving** — replaced by Supabase Storage URLs.
- **`connectDB` / mongoose connection pooling** — Supabase's client is stateless HTTP; use
  Supavisor/transaction-mode pooling if you ever add direct Postgres access.
- **`GET /api/health`** reports mongoose `readyState` (`'connected'`, etc.). Replicate the exact
  response shape with a trivial Supabase ping mapped onto the same `{0,1,2,3}` vocabulary.

### 8.6 Case sensitivity

Mongo's `email` fields use `lowercase: true` and SKU uses `uppercase: true` — these are *write-time*
transforms applied by Mongoose. Postgres will not do this for you. Apply the transforms explicitly in
the route handlers, or you'll get duplicate accounts differing only by case.

---

## 9. Phase 5 — Data migration (products + admin users)

Scope is small by design.

**9.1** `tools/migrate-products.mjs` — connect to Mongo (read-only) and Supabase (service role).
For each product: map fields, flatten `images`/`sizes`/`careInstructions`/`gallery` to `text[]`,
`colors`/`breakdown` to jsonb, preserve `slug`, `sku`, `createdAt`. Generate a fresh UUID and keep an
`old_id → new_id` map in a JSON file for spot-checking.

**9.2** `tools/migrate-admins.mjs` — copy admin `users` rows including the **bcrypt hash verbatim**.
Because we kept `bcryptjs`, existing admin passwords keep working with no reset. Copy the
`admin_users` metadata row too.

**9.3** Product image files: if any live in the old `uploads/` folder rather than Cloudinary, upload
them to the `product-images` bucket and rewrite the URLs. Cloudinary-hosted URLs can be left alone —
they're absolute and will keep resolving.

**9.4** Re-point `server/scripts/seedProducts.js` and `seedAdmin.js` at Supabase so fresh
environments can be provisioned. These become `tools/seed-*.mjs`.

**9.5** Verify: row counts match, every `slug`/`sku` is unique, no null in a `NOT NULL` column, and a
spot-check of 5 products renders identically on `/shop` and `/product/[id]`.

---

## 10. Phase 6 — Verification

1. **Contract diff.** Run the Phase 0 harness against Next.js. Target: zero diff across all 67
   endpoints. Every diff is either a bug to fix or a consciously accepted change to be recorded here.
2. **Auth continuity.** A `zahzan_token` minted by the old Express server must authenticate against
   the new API unchanged.
3. **Visual diff.** Screenshot all 9 routes at desktop and mobile widths, before and after. Pixel diff.
4. **Manual journeys**, because these span state the contract tests can't fully model:
   - guest → browse → add to cart → register mid-checkout → COD order → view in Account → cancel
   - advance payment with a real file → admin verifies → customer sees `Verified` + gets the email
   - admin: product create → edit → toggle status → soft delete → permanent delete
   - wishlist toggle persisting across logout/login
   - newsletter subscribe → unsubscribe link from the email
5. **Load-bearing edge cases:** empty cart checkout, out-of-stock at checkout, duplicate transaction
   reference, expired reset token, customer JWT hitting an admin route.

**Do not begin Phase 7 until §10.1 is a zero diff.**

---

## 11. Phase 7 — Cutover

1. Deploy Next.js to staging with a Supabase staging project. Run §10 end to end.
2. Provision the production Supabase project; run migrations; run the Phase 5 scripts.
3. Deploy. Point DNS.
4. Keep the Express server running but **unreferenced** for 7 days as a rollback path. Keep the Mongo
   cluster for 30 days.
5. Then delete `server/`, drop `express`/`mongoose`/`multer`/`cors`/`helmet`/`express-rate-limit`/
   `cloudinary` from dependencies, and remove the Mongo connection strings from every environment.

**Rollback trigger:** any parity defect in checkout, payment, or auth. Revert DNS; Mongo still holds
the last-known-good state because the two databases are never written to concurrently.

---

## 12. Environment variables

```
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, never NEXT_PUBLIC_
NEXT_PUBLIC_SUPABASE_URL=           # only if the browser ever talks to Storage directly
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# unchanged from today
JWT_SECRET=
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=30d
CLIENT_URL=
RESEND_API_KEY=
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# dropped
# MONGODB_URI, PORT, CLOUDINARY_*
```

---

## 13. Sequencing and effort

| Phase | Work | Depends on |
| --- | --- | --- |
| 0 | Contract capture harness | — |
| 1 | Next shell, routing swap, assets | — (parallel with 0) |
| 2 | Supabase schema + migrations | — (parallel with 0) |
| 3a | `lib/` foundations | 2 |
| 3b | auth + products endpoints | 3a |
| 3c | users, cart, orders, payments, newsletter | 3b |
| 3d | admin (21 endpoints) | 3c |
| 4 | Storage + email + rate limiting | 3a |
| 5 | Product/admin data migration | 2 |
| 6 | Verification | all |
| 7 | Cutover | 6 green |

Phases 0, 1, and 2 are independent and can run concurrently. Phase 3 is the long pole; the admin
router alone is a third of the endpoint count and 1,100 lines of controller.

---

## 14. Explicitly out of scope

Tempting, adjacent, and all of them break the freeze. Each is a separate project *after* parity is proven:

- Server Components / SSR / SEO metadata
- Supabase Auth, OAuth providers, or RLS-as-authorization
- Realtime subscriptions (e.g. live admin order feed)
- TypeScript
- Implementing try-on or stories (currently 501)
- Fixing the broken `change-password` endpoint (§8.4)
- Any UI, copy, or Tailwind change
- Consolidating the 17 duplicated `const API_BASE = '/api'` declarations
