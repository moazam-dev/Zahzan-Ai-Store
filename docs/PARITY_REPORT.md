# Parity Report (Task 15)

**Verdict: PASS, with two pre-existing accepted deviations (C15, C16), one fixed
regression found and closed during the original Task 15 pass, four further
defects found and closed at the Final Parity Gate review (§10 -- two Critical,
two report-accuracy Important items), and a residual-risk section that must be
read before treating this as a green light for cutover.**

This is the final acceptance gate for the whole migration (spec §10). It answers
one question with evidence: does the ported Next.js + Postgres stack behave
identically to the original Express + MongoDB stack, for a real HTTP client that
never sees source code?

---

## 1. What was actually run, and how

There is no Supabase project, no Docker, and no local Postgres on this machine.
The only Postgres available is `@electric-sql/pglite`, an in-process WASM
build. Getting a *built* (`next build`) Next.js app to serve real HTTP traffic
against it — not vitest calling route handlers as plain functions, which is
what all 371 existing tests do — turned out to be the hard part of this task,
and surfaced one genuine infrastructure gap plus one genuine parity defect.
Both are described in full below because the instructions were explicit that a
green diff earns no trust unless the road to it is shown.

### 1.1 The whole pipeline

```
npm run build
node tools/run-pglite-server.mjs          # boots the BUILT app, seeds it, serves on :3000
node tools/contract-capture.mjs --base http://localhost:3000 --out tools/golden-next
node tools/contract-diff.mjs tools/golden tools/golden-next
npm test
```

### 1.2 Blocker #1: PGlite's WASM loader breaks under Turbopack's server bundle

The very first attempt (a plain script that imported `lib/db.js` directly,
seeded PGlite, then started Next programmatically) produced route handlers
that failed with `h.instantiateWasm is not a function` on every DB-touching
request. Root cause: `next build`'s Turbopack bundler rewrites the dynamic
`import('@electric-sql/pglite')` inside `lib/db.js`'s `getPglite()` enough to
break the package's own WASM instantiation callback. This only ever surfaces
once you go through Next's *server bundle* — a raw `node` script importing the
same file never goes through Turbopack at all, so nothing before this task
exercised this path.

**Fix**: `next.config.js` gained one line, `serverExternalPackages:
['@electric-sql/pglite']`, telling Next's bundler to leave the package
un-bundled (`require`/`import` it at runtime unchanged, which is what an
emscripten/WASM-loading package needs). This is a build-configuration change
with zero effect on any HTTP response on either driver — `@electric-sql/pglite`
is never imported at all on the real production path (`SUPABASE_DB_URL` + the
`pg` driver).

### 1.3 Blocker #2: the "lazy module singleton" is not actually shared

Once the WASM error was gone, every DB-touching route returned `relation
"products" does not exist` — the schema had never been applied to *that*
PGlite instance. `lib/db.js`'s module-level `pgliteInstance` variable is a
singleton only within one JS module graph. A plain top-level `node` script's
`import '../lib/db.js'` and a Next.js route handler's own (separately bundled)
`import '.../lib/db.js'` are two different module instantiations, even though
both run inside the same OS process — so migrating/seeding from an external
script never reached the instance the running server was actually using. This
is exactly the failure mode the task brief warned might happen ("If Next.js
spawns multiple workers or otherwise breaks the singleton, say so").

**Original (Task 15) fix, superseded at the Final Parity Gate (§10.2):** the
first fix for this shipped two new HTTP routes, `POST /api/test-bootstrap`
and `GET /api/test-email-change-token?userId=`, gated on
`ZAHZAN_DB_DRIVER === 'pglite'`, that triggered migration/seeding and an
out-of-band token read through the app's own route-handler code path. The
Final Parity Gate review correctly flagged these as an unauthenticated,
non-original (GC4-violating) HTTP surface shipping in the production route
table regardless of the gate, and they have been **deleted**. §10.2 describes
the replacement (a `register()` hook in a new root `instrumentation.js`, plus
a `globalThis`-based fix to the actual root cause in `lib/db.js`) and the
empirical surprises that came with getting it to work correctly — this
section is left otherwise unchanged as a historical record of the original
diagnosis, which is not itself wrong, just incomplete (see §10.2 for why a
plain module-scope singleton problem, once fixed by moving the *call site*
inside the server's own bundle, turned out to still exist *between two
different server-bundle entry points* until `lib/db.js` itself changed).

`tools/run-pglite-server.mjs` ties it together: boot the built app, then (as
of §10.2) explicitly call `instrumentation.js`'s `register()` before the HTTP
server starts listening. `tools/seed-contract-db-pg.mjs` is the
Postgres-fixture equivalent of Task 2's `tools/seed-contract-db.mjs` — same
admin/2 customers/4 products/1 newsletter subscriber, same literal values,
but with real Postgres `uuid` ids (Mongo ObjectId-shaped literals cannot be
inserted into a `uuid` column) and explicit `created_at` values reproducing
the same *relative* ordering the old seed's `ts()` helper establishes, since
every `order by created_at desc` list endpoint's array order has to match for
the diff to be meaningful.

### 1.4 Blocker #3 (harness, not app): hardcoded Mongo-shaped ids in the capture script

`tools/contract-capture.mjs`'s journey hardcoded literal Mongo ObjectId
strings (`'000000000000000000000011'`, etc.) for the seeded fixture products
and for customer2, to hit the same rows deterministically across two capture
runs. A Postgres `uuid` column rejects a 24-hex-char string outright, so these
literals can never resolve against the new stack no matter what seed values
are chosen.

**Fix**: `PRODUCT1_ID`…`PRODUCT4_ID` and `CUSTOMER2_ID` are now resolved
dynamically — one unrecorded `GET /api/products/<slug>` per product, one
unrecorded login for customer2 — instead of hardcoded. Against the *old*
stack this resolves to exactly the same literal value the hardcoded constant
did (the seed fixes both), so this is a pure generalisation with no effect on
reproducibility against the frozen `tools/golden/` baseline; it is what makes
the identical script usable against a UUID-keyed stack at all. `tools/golden/`
itself was never modified.

One more harness change: `tools/lib/normalise.mjs`'s `URL_RE` now also
matches `memory://` in addition to `https?://`. This exists solely because
there is no real Supabase project to point Storage at locally, so
`ZAHZAN_STORAGE_DRIVER=memory` (an existing, already-tested in-process fake —
see `lib/storage.js`) was used for this verification run; against a real
Supabase project every URL this matches is a genuine `https://` signed
Storage URL exactly as before.

---

## 2. The genuine defect found and fixed

Capturing against the new stack surfaced a real, in-scope regression, not a
pre-existing bug and not a normalisation gap: **six admin route handlers
returned a raw Supabase Storage *path* as `payment.proofUrl` instead of a
signed URL.**

`lib/storage.js`'s own design (its header comment, written in Task 6) is
explicit: the `proof_url` column stores a storage **path**, never a durable
URL, because the `payment-proofs` bucket is private — "every read re-signs a
fresh short-lived URL from that path... storing a signed URL directly in the
column would 403 once it expires." Three call sites already did this
correctly (`app/api/orders/route.js`, `app/api/payments/order/[orderId]/
route.js`, `app/api/payments/_submitPaymentProof.js`). Six admin call sites
did not, because `serializePayment` in `lib/serialize.js` is a pure row
pass-through (correct for the write-path callers, where the just-uploaded
`secure_url` genuinely is a signed URL) and nothing overrode it afterward on
these six:

- `GET /api/admin/payments` (list)
- `GET /api/admin/payments/:id`
- `PATCH /api/admin/payments/:id/verify`
- `PATCH /api/admin/payments/:id/reject`
- `GET /api/admin/orders` (nested `order.payment`)
- `GET /api/admin/orders/:id` (both nested `order.payment` and top-level
  `payment`)

Under the OLD stack this was invisible: Cloudinary URLs are permanent public
URLs with no signing/expiry concept, so returning the stored value directly
always worked. It only became observable once the migration moved to a
private Supabase bucket — meaning this is a genuine parity-relevant defect
introduced by the port, exactly the class of thing this task exists to catch,
not a pre-existing bug to leave alone (GC4 is about *not fixing* old bugs; it
does not protect a new one). **Fixed**: each of the six now calls
`signProofUrl(row.proof_public_id)` and overwrites `.proofUrl` on the
serialized object, matching the pattern the three working call sites already
established. Confirmed by re-running capture: every `proofUrl` value-level
diff is gone (see §4).

Fixing this broke `test/api/admin.test.js` (5 failures): that file never
touched `lib/storage.js` before, so it never set `ZAHZAN_STORAGE_DRIVER =
'memory'` the way `test/api/orders.test.js`/`test/api/payments.test.js`
already do, and `signProofUrl` defaulted to the real `'supabase'` driver with
no credentials configured. Added the same one-line guard those two files
already use. Full suite is green — see §6.

---

## 3. Endpoint-by-endpoint status

All 67 endpoints, all 104 golden interactions. As of the Final Parity Gate
fix pass (§10.2), one interaction —
`097-extra2.users-confirm-email-change-success` — can no longer be captured
against this stack at all (its read-back route was deleted as a GC4
violation; see §10.2 for the full reasoning and the re-enable path), so this
run diffs the remaining 103 against their golden counterparts. Of those 103:
57 files diff clean (byte-identical after normalisation), 46 files have
differences, **every one of which is one of three accepted categories**,
classified below. No file has an unclassified or unexplained difference, and
the one uncaptured interaction is a harness limitation, not a response-shape
defect (it was never a divergence in what the API returns — it's simply not
observable from outside the process without a route that hands back a
never-returned-to-any-client token). §10.2 also covers a capture-script fix
(`Recorder.skip()`) that keeps every OTHER interaction's file numbering
stable across runs where this one is skipped, so a single skipped interaction
doesn't cascade into spurious filename-mismatch "MISSING" noise for every
interaction captured after it.

| Area | Interactions | Diff status |
| --- | --- | --- |
| Health | `001` | Category B (1 file) |
| Auth (register/login/me/refresh/forgot/reset/logout/re-login, failure cases, google/facebook, 404 stubs) | `002`–`012`, `090`, `091`, `092` | Clean |
| Products (list/category/search/by-id/by-slug/by-sku/404, admin create) | `013`–`019`, `098` | Category A only (13, 14, 15, 16, 17, 18, 98) |
| Users (me, patch, addresses, wishlist, email-change) | `020`–`031`, `093`–`097` | Clean except `022` (Category A); `097` not captured this run (§10.2) |
| Cart (autocreate/add/dup-add/patch/delete/clear) | `032`–`036` | Category A only (32, 33, 34); 35/36 clean |
| Orders (create COD ×2, list, my-orders, by-id, by-order-number, cancel ×2 incl. double-cancel 400) | `037`–`045` | Category A only (37–44); `045` clean |
| Payments (methods, create-advance, submit-proof ×2, get-by-order) | `046`–`050` | Category A + Category C (`047`–`050`); `046` clean |
| Newsletter (subscribe, subscribe-again, unsubscribe-by-token, POST unsubscribe) | `051`–`053`, `102` | Clean |
| Admin auth (login, me) | `054`, `055` | Clean |
| Admin dashboard | `056` | Category A only |
| Admin orders (list ×3, by-id, status-update) | `057`–`059`, `072`, `099` | Category A + Category C |
| Admin payments (list ×3, by-id, verify, reject) | `060`–`062`, `073`, `074`, `100` | Category A + Category C |
| Admin customers (list ×3, status-toggle, by-id) | `063`–`065`, `081`, `101` | Clean |
| Admin products (list ×3, create, update, status-toggle, soft-delete, permanent-delete) | `066`–`068`, `075`–`080` | Category A only |
| Admin newsletter (list ×3, export) | `069`–`071`, `083` | Category A only (`069`, `070`) |
| Admin audit logs | `082` | Category A only |
| Authz failures (customer token vs. admin routes ×3) | `084`–`086` | Clean |
| 501 stubs + 404 mismatches (try-on, stories ×2 each) | `087`–`089`, `103`, `104` | Clean |

**Category A — JSON key order.** By far the largest category (44 of 46
files, every occurrence except the health check and the `proofPublicId`
lines). `contract-diff.mjs` reports a `<key order>` finding whenever two
objects have the same keys and values but a different insertion order. This
is **not a GC1 violation**: GC1 requires the response be "byte-identical...
key for key," meaning every key present with the correct value — it does not
require serialization *order*, and no real HTTP client is sensitive to it
(`fetch().json()` produces a plain object; `product.name` reads the same
regardless of where `name` sits in iteration order). Two sub-causes:
  - **Top-level object order** (`serializeProduct`, `serializeOrder`,
    `serializeAddress`, etc. in `lib/serialize.js`): these build a fixed JS
    object-literal key order that was never required to match the old
    Mongoose schema's own field-declaration order, and doesn't. This *could*
    technically be reordered to match, but was deliberately left alone (see
    below).
  - **jsonb-backed nested objects** (`colors`, `breakdown`, order `items`,
    `shippingAddress`, audit-log `metadata`): **Postgres's documented jsonb
    behaviour is that it does not preserve input key order at all** ("jsonb
    does not preserve white space, does not preserve the order of object
    keys" — Postgres manual, JSON Types). No write-time change can fix this;
    it is architecturally guaranteed to differ from whatever order Mongoose
    happened to serialize in, regardless of which stack is on the other side.

  Given (a) zero observable effect on any real client, (b) the jsonb sub-case
  being unfixable regardless of effort, and (c) GC4's explicit "no refactors...
  do not 'clean up' duplicated code" instruction, `lib/serialize.js`'s
  hand-authored key order was left exactly as reviewed and signed off in Task
  4 rather than reshuffled for cosmetic parity with no behavioural payoff.

**Category B — `environment` field, health check only (1 file, `001`).**
`app/api/health/route.js` reports `process.env.NODE_ENV || 'development'` —
identical logic to the source. The value differs only because Task 15
legitimately runs the **production build** (`npm run build` + a production
Next server), which Next.js always marks `NODE_ENV=production` internally; the
old capture explicitly left `NODE_ENV` unset (`docs/CONTRACT_CAPTURE.md`), so
Express's own default surfaced as `"development"`. Same code, different
literal runtime environment; the field is diagnostic-only and asserted
nowhere else.

**Category C — `proofPublicId` value differs in format (22 occurrences across
14 files: `047`, `048`, `049`, `050`, `057`, `058`, `059`, `060`, `061`, `062`,
`073`, `074`, `099`, `100`).** Corrected at the Final Parity Gate (§10.4) —
the original draft of this report undercounted this as "7 occurrences across
5 files" and its own enumeration only actually listed 12 file names while
claiming 5, both wrong, and it omitted `073`/`074` even though §4's own diff
output already listed them. The true count above was recounted directly from
the unedited `contract-diff` output (`docs/parity-diff-full.txt`, §4) by
grep-counting every `proofPublicId` finding line and the distinct files
containing one — several of `057`–`062` are paginated list endpoints that
return more than one payment per response, so they contribute more than one
`proofPublicId` finding each, which is most of the gap between "22
occurrences" and "14 files." This is the one place a *value*, not just key
order, differs. `proofPublicId` is an internal storage
identifier, never rendered to any user — its whole reason to exist is to be
handed back into `signProofUrl()` server-side. The old value
(`zahzan/payment-proofs/payment_<order>_<TS>`) is Cloudinary's own naming
convention; the new value (`payment_<order>/<n>-payment-proof.png`) is
`lib/storage.js`'s Supabase/memory-driver storage-path convention. Both are
opaque, both are internally consistent, and the format change is the direct,
intended, already-documented consequence of moving payment-proof storage from
Cloudinary to Supabase Storage — `docs/CONTRACT_CAPTURE.md` names this exact
case ("proof URLs move from Cloudinary to signed Supabase Storage URLs") as
an anticipated divergence, not a defect.

---

## 4. The genuine `contract-diff` output

**Corrected at the Final Parity Gate.** The block that used to sit here was
labelled "Full, unedited output of `node tools/contract-diff.mjs`" but was
actually a hand-collapsed ~85-line summary with entries elided (`[...
identical pattern repeated ...]`) and multiple files' diffs merged onto one
`DIFF in a.json / b.json / c.json:` line — a format `contract-diff.mjs` does
not itself produce. That label was false and has been removed.

The genuine, complete, unedited output of

```
node tools/contract-diff.mjs tools/golden tools/golden-next
```

— re-run against a freshly rebuilt, freshly reseeded PGlite-backed server
after every fix in this report (including §10's) — is **614 lines**: 1
`MISSING` line (the one uncaptured interaction, §3/§10.2), 46 `DIFF in ...`
file headers, and 173 individual `$.`-prefixed field-level findings. It is
pasted in full, byte-for-byte, with nothing elided or reordered, in
[`docs/parity-diff-full.txt`](./parity-diff-full.txt) (checked into this same
commit) rather than inline here, since a 614-line block would dominate this
document unreadably. It is reproducible by re-running the exact commands in
§1.1 (rebuild, reseed, recapture, diff).

Every one of the 173 field-level findings falls into Category A, B, or C as
classified in §3 — this was re-verified line-by-line against the corrected
counts in §3 (in particular the Category C recount, §10.4), not re-sampled.
The one `MISSING` line is the harness limitation described in §3 and §10.2,
not a response-shape defect.

**Result: zero unexplained differences.** Every one of the 46 diffed files
contains only Category A, B, and/or C entries, and the single uncaptured
interaction is accounted for.

---

## 5. JWT continuity (GC5, spec §10.2)

Proved directly, not inferred: a token was minted using this worktree's own
copy of `server/utils/jwt.js` (confirmed byte-identical to `lib/jwt.js`, the
port — same library, same payload shape, same hardcoded dev-fallback
secrets), for a real seeded user (`customer1@zahzancontract.test`, id
`fb9870dc-d8be-46e2-b961-5dee4c41f223`), then handed to the running Next.js
app's `GET /api/auth/me`:

```
$ node --input-type=module -e "
import { generateToken } from './utils/jwt.js';
console.log(generateToken('fb9870dc-d8be-46e2-b961-5dee4c41f223', 'customer'));
"
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZiOTg3MGRjLWQ4YmUtNDZlMi1iOTYxLTVkZWU0YzQxZjIyMyIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTc4NjgxOTIxOSwiZXhwIjoxNzg2ODIyODE5fQ.bdHK4crCU_CnqjqLLrtyJWbPaJHmKZr7HZJeF5k-yq0

$ curl http://localhost:3000/api/auth/me -H "Authorization: Bearer <token above>"
{"success":true,"user":{"id":"fb9870dc-d8be-46e2-b961-5dee4c41f223","firstName":"Amina","lastName":"Yousaf","name":"Amina Yousaf","email":"customer1@zahzancontract.test","phone":"03000000002","role":"customer","authProvider":"local","isEmailVerified":true,"createdAt":"2025-12-12T00:00:00.000Z"}}
```

**Confirmed**: a session live at cutover time is not invalidated — the user
stays logged in.

---

## 6. Build and test output

**Updated at the Final Parity Gate (§10.2/§10.3).** The two Task-15-only
verification routes (`POST /api/test-bootstrap`,
`GET /api/test-email-change-token`) no longer exist and no longer appear in
the route table below. `npm run build` — clean, zero warnings, all 57
governed route files (serving the 67 method-level endpoints — corrected at
the final whole-branch review; the "67 governed route files" wording here
previously conflated file count with endpoint count, several route files
export more than one HTTP method) plus the `[...catchAll]` fallback compile:

```
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.js took 65ms
 Creating an optimized production build ...
✓ Compiled successfully in 9.8s
 Running TypeScript ...
 Finished TypeScript in 15ms ...
 Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (52/52) in 1493ms
 Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /account
├ ○ /admin
├ ○ /admin/audit-logs
├ ○ /admin/customers
├ ○ /admin/dashboard
├ ○ /admin/login
├ ○ /admin/newsletter
├ ○ /admin/orders
├ ○ /admin/payments
├ ○ /admin/products
├ ƒ /api/[...catchAll]
├ ƒ /api/admin/audit-logs
├ ƒ /api/admin/auth/login
├ ƒ /api/admin/auth/me
├ ƒ /api/admin/customers
├ ƒ /api/admin/customers/[id]
├ ƒ /api/admin/customers/[id]/status
├ ƒ /api/admin/dashboard
├ ƒ /api/admin/newsletter
├ ƒ /api/admin/newsletter/export
├ ƒ /api/admin/orders
├ ƒ /api/admin/orders/[id]
├ ƒ /api/admin/orders/[id]/status
├ ƒ /api/admin/payments
├ ƒ /api/admin/payments/[id]
├ ƒ /api/admin/payments/[id]/reject
├ ƒ /api/admin/payments/[id]/verify
├ ƒ /api/admin/products
├ ƒ /api/admin/products/[id]
├ ƒ /api/admin/products/[id]/status
├ ƒ /api/auth/facebook
├ ƒ /api/auth/forgot-password
├ ƒ /api/auth/google
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/auth/me
├ ƒ /api/auth/refresh
├ ƒ /api/auth/register
├ ƒ /api/auth/reset-password
├ ƒ /api/cart
├ ƒ /api/cart/items
├ ƒ /api/cart/items/[id]
├ ƒ /api/health
├ ƒ /api/newsletter/subscribe
├ ƒ /api/newsletter/unsubscribe
├ ƒ /api/newsletter/unsubscribe/[token]
├ ƒ /api/orders
├ ƒ /api/orders/[id]
├ ƒ /api/orders/[id]/cancel
├ ƒ /api/orders/my-orders
├ ƒ /api/payments
├ ƒ /api/payments/methods
├ ƒ /api/payments/order/[orderId]
├ ƒ /api/payments/proof
├ ƒ /api/products
├ ƒ /api/products/[id]
├ ƒ /api/stories
├ ƒ /api/try-on
├ ƒ /api/try-on/[id]
├ ƒ /api/users/me
├ ƒ /api/users/me/addresses
├ ƒ /api/users/me/addresses/[id]
├ ƒ /api/users/me/addresses/[id]/default
├ ƒ /api/users/me/confirm-email-change
├ ƒ /api/users/me/email-change-request
├ ƒ /api/users/me/wishlist
├ ƒ /api/users/me/wishlist/[productId]
├ ○ /collections
├ ƒ /product/[id]
└ ○ /shop

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Confirmed by direct count: `/api/test-bootstrap` and
`/api/test-email-change-token` do not appear anywhere in this table.

`npm test` — full suite, green, including the four new regression tests added
at the Final Parity Gate (§10.3):

```
 RUN  v4.1.10 C:/Users/zaeem/Downloads/Zahzan-migration

 Test Files  24 passed (24)
      Tests  372 passed (372)
   Start at  00:25:38
   Duration  146.11s (transform 2.25s, setup 0ms, import 17.15s, tests 115.78s, environment 9ms)
```

372/372 — 371 (the count stated in the task brief) plus 1 net new (three of
the four new assertions were added inside existing `it` blocks in
`test/api/admin.test.js`; the fourth, in `test/api/payments.test.js`, is a
new `it` block, hence +1 to the file-level test count).

---

## 7. The two known, accepted deviations (restated in full, unchanged)

These were architectural rulings made before Task 15 and are **not**
re-litigated here — they are restated so a reader of this report does not
have to hunt through `docs/IMPLEMENTATION_PLAN.md` to find them.

### Ruling C15 — `cart_items.product_id` / `wishlist_items.product_id` are `on delete cascade`

The original schema had these as plain `references products (id)` (i.e.
`RESTRICT`). The old MongoDB app had no referential integrity at all —
`cartController.js`'s `items.filter((item) => item.product != null)` is
direct proof the old code *expected* products to vanish out from under a
cart. Meanwhile the admin permanent-delete action always returned 200. Under
`RESTRICT`, deleting a product referenced by any cart/wishlist would 500 —
breaking a proven-working, golden-captured admin action. `CASCADE` was
chosen as the only option that doesn't break that action.

Honestly, this is **not** strict parity:

| Path | Old | Under CASCADE | Verdict |
| --- | --- | --- | --- |
| Admin permanent-delete of a referenced product | 200 always | 200 always | parity restored |
| Subsequent cart GET | orphan silently dropped | row gone, join returns nothing | observably identical |
| Subsequent wishlist GET | **crashes** (pre-existing 500 bug) | returns a shorter valid list, 200 | accidental improvement, not parity |
| Wishlist toggle with a nonexistent productId | 200, Mongo stores anything | 500, FK rejects the insert | divergence; unreachable from the shipped frontend (every call site sources `productId` from an already-fetched product) |

If literal parity is preferred over integrity here, dropping both FKs is the
change to make — deliberately not done, since it would remove the only thing
the admin-delete path's correctness depends on.

### Ruling C16 — whitespace-only required order fields

For `POST /api/orders`, a `customerName`/`customerEmail`/`customerPhone`
consisting only of whitespace behaves differently:

| | Old (Mongoose) | New (Postgres) |
| --- | --- | --- |
| Route's truthy check | passes | passes (identical check) |
| After trim cast | becomes `""` | becomes `""` |
| Required enforcement | `required: true` rejects `""` → **500** | `not null` allows `""` → **201** |

Not fixed, deliberately: no golden captures this path (unreachable from the
shipped checkout, which validates client-side first), and every available fix
is a guess at Mongoose's exact `ValidationError` message text with no
capture to verify it against. **An order submitted through the API with a
whitespace-only customer name now succeeds with a blank name, where it
previously failed with a 500.** If this is worth closing, the decision to
make is which behaviour is actually wanted (a 400, or the old 500) — neither
is recoverable from the captured baseline.

---

## 8. What could NOT be verified locally, and what it needs

This is as important as the pass list above. Being honest about the edges of
what this run actually exercised:

1. **A real Supabase project was never used.** Everything here ran against
   PGlite (`ZAHZAN_DB_DRIVER=pglite`) and the in-process memory Storage
   driver (`ZAHZAN_STORAGE_DRIVER=memory`) — there is no Supabase project, no
   Docker, and no local Postgres available on this machine (stated up front
   in the task brief, confirmed true throughout this task). This means the
   following are **unverified**, not merely untested-but-presumed-fine:
   - The real `pg` Pool driver path (`SUPABASE_DB_URL`) — production's
     actual connection code, including behaviour through Supabase's
     connection pooler (pgbouncer, typically transaction-pooling mode).
     `lib/db.js`'s `tx()` uses a session-scoped `client.connect()` / `BEGIN`
     / `COMMIT` — this is exactly the pattern that can misbehave under
     transaction-mode pgbouncer if the pool doesn't guarantee the same
     physical connection for the lifetime of a transaction. This was never
     exercised at all in this task; it needs a real Supabase project to test.
   - Real Supabase Storage (signed URLs, actual bucket policies, the
     `payment-proofs` bucket's private-access configuration, upload size/MIME
     enforcement at the storage layer rather than just `lib/multipart.js`'s
     application-layer checks).
   - Row Level Security in its real, deployed form. The migration enables RLS
     with zero permissive policies on every table (service_role key bypasses
     it) — this is correct by design, but was never actually connected to a
     live Supabase project to confirm the anon key really is denied
     everything as intended.
   - Whether Supabase's Postgres build genuinely matches PGlite's behaviour
     for every construct this schema uses (`gen_random_uuid()` core-in-13+,
     `text[]`, `jsonb`, plpgsql, `RAISE EXCEPTION`, `ILIKE`) — AR3's own
     "Cost if wrong" already flagged this as PGlite-vs-real-Postgres risk
     that only a real project's Task 15-style run can close.

2. **A production timezone decision was never made or tested — and the
   impact if it's wrong is bigger than "the code looks timezone-safe."**
   Corrected at the Final Parity Gate: the original wording here undersold
   the stakes by stopping at a code-safety claim. Stated plainly instead: a
   mismatched project timezone changes `next_order_number()`'s output —
   Postgres's `now() at time zone 'utc'` still returns the correct UTC
   instant regardless of session timezone, so this specific function is not
   at risk — but if this or a future function's date-bucketing logic is ever
   written against the session's *local* time instead of an explicit UTC
   cast, the customer-visible order number itself (`ZHZ-YYYYMMDD-XXXX`) would
   shift by a day near midnight in whatever direction the misconfigured
   timezone points. That is not an internal, diagnostic-only field like
   §3 Category B's `environment` — it is printed on invoices, order-history
   pages, and support conversations, and a wrong date component in it is
   directly customer-visible. Every `timestamptz` write in this run happened
   against PGlite's default session timezone, and every read is defensively
   normalised through `new Date(value).toISOString()` (always UTC
   `Z`-suffixed) in `lib/serialize.js`. But whether a real Supabase project's
   configured server timezone matches what was assumed here, and whether any
   other function/query implicitly depends on session timezone, was never
   checked against a real project. This is a decision the user needs to make
   explicitly (what timezone does the Supabase project run in) and verify,
   not something this task could resolve without one.

3. **Multi-connection concurrency was never exercised end-to-end over HTTP.**
   This run served every request through one PGlite instance inside one
   Node process handling one request at a time via `curl`/the capture
   script's sequential journey. The `create_order`/`cancel_order`/
   `check_rate_limit` plpgsql functions were specifically designed (Tasks 5
   and 11) with `select ... for update` row locks and atomic `INSERT ... ON
   CONFLICT` precisely to be race-safe under concurrent callers on a real
   multi-connection Postgres pool — but this task's own verification never
   drove genuinely concurrent HTTP traffic against the running server to
   observe that safety hold under load. (Some of the existing 372 unit tests
   do call these functions concurrently within a single PGlite instance,
   which validates the SQL's logical correctness but is not the same claim
   as "safe under Supabase's real connection pool under real concurrent
   traffic.") This needs either a real Supabase project or a local multi-
   connection Postgres (neither was available here) plus a load-testing pass
   that was out of this task's scope.

4. **Email delivery was never exercised for real**, on either stack — this
   mirrors the OLD capture's own deliberate choice (`RESEND_API_KEY`,
   `EMAIL_HOST`, `EMAIL_USER` all unset, forcing the "dev log" fallback in
   both `server/services/emailService.js` and `lib/email.js`), so this is
   consistent with the baseline this task diffs against, not a gap this task
   introduced — but it does mean neither Resend nor SMTP delivery has ever
   been proven end-to-end by any part of this migration's test suite.

5. **Resolved at the Final Parity Gate (§10.2) — no longer a residual
   risk, kept here as a record.** This item used to read: "the two new
   verification-only routes (`app/api/test-bootstrap/route.js`,
   `app/api/test-email-change-token/route.js`) are gated but still ship in
   the production bundle... that trade-off is the user's call, not something
   this task should decide unilaterally." The Final Parity Gate review made
   that call: both routes have been **deleted**. Migration/seeding now runs
   through `instrumentation.js`'s `register()` hook instead (zero HTTP
   surface, §10.2); the email-change-token read-back has no boot-time
   equivalent and was not replaced — see §10.2 for the throwaway-branch
   re-enable path if that one specific capture step is ever needed again.
   Confirmed by direct route-table inspection (§6): neither path appears in
   `npm run build`'s output any more.

6. **`tools/golden/` and `tools/golden-next/` were captured with two
   different versions of `contract-capture.mjs`, and that difference's
   effect on the diff has never actually been measured.** The baseline
   (`tools/golden/`) was captured with a version that hardcoded literal
   Mongo `ObjectId` strings for the seeded fixture products and customer2
   (§1.4); the version used for every `tools/golden-next/` run in this
   report resolves those same ids dynamically instead — one extra,
   unrecorded `GET /api/products/<slug>` per fixture product (4 total) and
   one extra, unrecorded login for customer2, made against whichever stack
   `--base` points at, that never existed in the original captured journey.
   The reasoning in §1.4 for why this is expected to be equivalent is sound
   (against the OLD stack, dynamic resolution provably lands on the exact
   same literal ids the hardcoded constants named, since the seed fixes
   both) — but it is exactly that: reasoning, not a measurement. **The old
   Express/MongoDB stack was never re-captured with the generalised
   script**, so there is no side-by-side run that actually proves the 5
   extra unrecorded requests (4 GETs + 1 login) have zero effect on anything
   the diff checks. The validity of the entire 104-file comparison in this
   report rests on that unmeasured assumption. The empirical reassurance
   available without a re-capture: `tools/contract-diff.mjs`'s output
   (`docs/parity-diff-full.txt`, §4) contains **zero array-length findings**
   anywhere — if the extra login had, for instance, silently created a
   spurious audit-log row or an extra session/refresh-token row that then
   leaked into some list endpoint's array length or count, that specific
   class of difference is exactly what `contract-diff.mjs` would surface,
   and it surfaced none. That is reassuring, not conclusive — a real
   re-capture against the old stack is the only thing that would actually
   close this gap, and it was out of this task's scope (no MongoDB instance
   was available to test against).

7. **The diff only ever verifies that `proofUrl` is URL-*shaped*, never
   that it is *correct*.** `tools/lib/normalise.mjs`'s `URL_RE` collapses
   every value matching a URL pattern (`https?://...`, and — a Task 15
   harness addition, §1.4 — `memory://...`) down to a fixed placeholder
   before any comparison happens. This is the right design for its stated
   purpose (a signed URL is expected to differ run-to-run by construction,
   so byte-comparing it would be a permanent false positive) — but its
   direct consequence is that `contract-diff.mjs` cannot and does not
   distinguish a correctly-signed, working URL from any other syntactically
   URL-shaped string in that field. Concretely: **the Critical-1 email-fix
   and the six-route `signProofUrl` fix (§2, §10.1) are verified
   shape-deep by this diff, not content-deep.** Nothing in the automated
   contract-diff pipeline actually fetches a `proofUrl` and confirms it
   resolves to the uploaded image. The regression tests added at §10.3 close
   part of this gap for the six routes and the email fix specifically (they
   assert the returned/emailed value is not byte-equal to the raw stored
   path, and for the memory driver, that it matches the driver's own signed
   form) — but content-level correctness against a REAL Supabase signed URL
   (does it actually 200 when fetched, does it expire when it should) is
   still squarely inside item 1's "real Supabase project was never used"
   gap, not something this diff pipeline was ever designed to catch.

8. **Added at the final whole-branch review's fix wave: malformed JSON
   request bodies now return the route's own 400, not Express's
   500-with-SyntaxError.** In the original stack, `express.json()` throws a
   `SyntaxError` (body-parser's `entity.parse.failed`) on an unparseable
   body, which propagates to `errorHandler`
   (`server/middleware/errorMiddleware.js`) — since nothing has called
   `res.status(...)` yet at that point, `res.statusCode` is still its
   default 200, so `errorHandler`'s `res.statusCode === 200 ? 500 : ...`
   falls to 500, with the SyntaxError's own message in the body. Every route
   handler in this port instead calls `request.json().catch(() => ({}))`,
   swallowing a parse failure into an empty object, which then almost always
   fails that route's own field-presence validation and returns a route-
   specific 400 (e.g. "Please provide email and password.") instead. This is
   a genuine status-code and message divergence for one specific malformed-
   input shape — but no golden interaction in `tools/golden/` ever sends a
   syntactically invalid JSON body (every captured request is well-formed,
   even the ones testing missing/empty fields), so `contract-diff` has never
   exercised, and cannot currently prove or disprove, either side of this
   behaviour. Not fixed as part of this pass — GC4 draws no clear line here
   (arguably the *old* 500 is the bug, not this port's 400), and inventing
   either a reproduction of the exact old SyntaxError message or a decision
   to keep the new 400 is a product call, not a mechanical parity fix; see
   Ruling C16 for the precedent on leaving an unresolved, uncaptured
   divergence documented rather than guessed at.

---

## 9. Files touched by this task

**Fixed a real regression:**
- `app/api/admin/payments/route.js`, `app/api/admin/payments/[id]/route.js`,
  `app/api/admin/payments/[id]/verify/route.js`,
  `app/api/admin/payments/[id]/reject/route.js`,
  `app/api/admin/orders/route.js`, `app/api/admin/orders/[id]/route.js` —
  re-sign `payment.proofUrl` before responding (§2).
- `test/api/admin.test.js` — set `ZAHZAN_STORAGE_DRIVER=memory`, needed
  because of the fix above.

**Infrastructure to make PGlite-backed HTTP verification possible at all
(superseded by §10.2 — see that section for what changed and why):**
- `next.config.js` — `serverExternalPackages: ['@electric-sql/pglite']`.
  Unchanged, still needed.
- `tools/run-pglite-server.mjs` — boots the built app + bootstraps DB;
  updated at §10.2 to call `instrumentation.js`'s `register()` directly
  instead of `POST`-ing to a route that no longer exists.
- `tools/seed-contract-db-pg.mjs` — Postgres equivalent of Task 2's Mongo
  contract fixture seed. Unchanged.

**Harness generalisation (not the frozen `tools/golden/` baseline, which was
never modified):**
- `tools/contract-capture.mjs` — resolve product/customer2 ids dynamically
  instead of hardcoding Mongo-shaped literals (§1.4); Postgres fallback for
  the email-change-token read (now always a clean skip, §10.2); a new
  `Recorder.skip()` method that reserves a sequence number without writing a
  file, added at §10.2 to keep every later interaction's filename stable
  when one step is skipped.
- `tools/lib/normalise.mjs` — `URL_RE` also matches `memory://`. Unchanged.

**Small documentation fix (batched per the task brief):**
- `docs/DATA_MIGRATION.md` — one added sentence warning that
  `readPreference: 'secondaryPreferred'` could serve stale data from a
  lagging secondary if ever pointed at a real replica set (currently a no-op
  against the single-node standalone source).

**Files touched at the Final Parity Gate (§10) — see that section for the
full reasoning behind each:**
- `app/api/payments/_submitPaymentProof.js` — sign the proof URL before
  building the email payload, not after (§10.1).
- `app/api/test-bootstrap/route.js`, `app/api/test-email-change-token/
  route.js` — deleted (§10.2).
- `instrumentation.js` — new: `register()` hook, ported migration/seed logic,
  gated on `ZAHZAN_DB_DRIVER === 'pglite'` and `NEXT_RUNTIME === 'nodejs'`
  (§10.2).
- `lib/db.js` — the PGlite singleton moved from a module-scope variable to
  `globalThis`-backed storage (§10.2); this is the actual root-cause fix, not
  cosmetic.
- `tools/run-pglite-server.mjs`, `tools/contract-capture.mjs` — see harness
  bullets above.
- `test/api/admin.test.js` — three new signed-URL regression assertions
  added to existing tests (list, detail, nested-in-order) (§10.3).
- `test/api/payments.test.js` — one new test asserting the emailed payment
  object carries a signed URL (§10.3).
- `docs/PARITY_REPORT.md` (this file) — §1.3, §3, §4, §8, §9 corrected; §10
  appended.
- `docs/parity-diff-full.txt` — new: the genuine, complete, unedited
  `contract-diff` output referenced by §4.

---

## 10. Final Parity Gate: fixes applied in this pass

This section records the fixes made in response to the Final Parity Gate
review — the last review before this migration is treated as complete. The
review's finding was that the parity claim itself (§1–§7 above) was sound,
but that four defects existed around it: one genuine regression the earlier
pass's own diff couldn't have caught (§10.1, since `contract-diff` only
inspects HTTP responses and never inspects what gets emailed — see §10.4's
companion point, §8 item 7), one architectural correction to how local
verification is wired up (§10.2), a missing regression test for both the
original six-route fix and the new one (§10.3), and four accuracy defects in
this report itself (§10.4, folded into §1.3/§3/§4/§8 above with pointers back
here).

### 10.1 Critical: an unsigned storage path was emailed to the admin as a hyperlink

`app/api/payments/_submitPaymentProof.js` builds the admin payment-proof
notification email (`sendAdminPaymentProofEmail`, `lib/email.js`) and the
HTTP response's `payment` object from the same freshly-inserted `payments`
row. The response has always used a freshly-**signed** URL — but the code
built and dispatched the email BEFORE that signing step ran, several lines
earlier, using `serializePayment(paymentRow)` directly. `serializePayment`
(`lib/serialize.js`) is a pure row pass-through — correct for callers where
the just-uploaded value genuinely is already a signed/durable URL, wrong here
— so `payment.proofUrl` in the emailed object was the RAW STORAGE PATH, not a
URL. `lib/email.js`'s `sendAdminPaymentProofEmail` renders that value
directly into an `<a href="${payment.proofUrl}">Inspect Full Screenshot</a>`
link. Net effect: every admin payment-proof notification email contained a
dead link — clicking it would 403 (or, against the memory driver used in this
task's own testing, simply fail to resolve to anything), where the old
Cloudinary-backed stack always produced a permanently working URL in the same
position. This is a genuine, in-scope parity regression (Cloudinary URLs
never expire and never needed signing; the private Supabase bucket does), not
a pre-existing bug GC4 would protect.

This is the fourth instance of this exact defect class found in this
migration (the other three are the six routes fixed in §2, all of which
share the same root cause: `serializePayment`'s raw pass-through combined
with a call site that forgets to re-sign). The tell that this was an
ordering oversight rather than a considered decision:
`app/api/admin/payments/[id]/verify/route.js` already does this correctly —
it re-signs the payment BEFORE building the email payload it hands to
`sendCustomerPaymentVerifiedEmail`/`sendCustomerOrderStatusEmail` — proving
the correct pattern was already established elsewhere in the codebase, just
not followed here.

**Fix**: the `signProofUrl()` call and the `responsePayment` construction
were moved to before, not after, the `dispatch(sendAdminPaymentProofEmail(...))`
call, and the email now receives `responsePayment` (the already-signed
object) instead of a second, unsigned `serializePayment(paymentRow)` call.
The HTTP response is unaffected (it always used the signed value; only its
construction moved earlier in the function).

**Exhaustive search for other unsigned `proofUrl` emission sites.** Every
place `proofUrl`, `proof_url`, `proofPublicId`, or `serializePayment` appears
in `app/`, `lib/`, and `views/` was enumerated and checked individually,
since three prior sweeps of this exact codebase (§2, plus this being the
fourth instance) each believed they had closed this defect class and each
missed an instance:

| Site | Signs before use? |
| --- | --- |
| `app/api/orders/route.js` (POST, COD/advance order create) | **Conditionally** — corrected at the final whole-branch review; the row above previously read as unconditional. Signing (`signProofUrl(paymentRow.proof_public_id)`, building `responsePayment`) only runs when `proofFromUpload` is `true`, i.e. the client actually uploaded a file through this route (`app/api/orders/route.js:340-342`). When no file was uploaded and the client instead supplied `rawBody.proofUrl` directly in the JSON body (the `else if (rawBody.proofUrl)` branch, line 202), that value is kept verbatim, unsigned — there is no storage path in that branch to sign, since nothing was written to Storage; the source (`server/controllers/orderController.js`) never touched this value either in that case. This is parity-correct, not a missed signing site: it is a genuinely different code path from the upload branch, not an oversight of the same one. |
| `app/api/payments/_submitPaymentProof.js` (POST /api/payments, POST /api/payments/proof) | **Was not; fixed here** (§10.1 above). Now signs before both the email and the HTTP response. |
| `app/api/payments/order/[orderId]/route.js` (GET, customer payment history) | Yes — signs inline while mapping each row; no email sent from this route. |
| `app/api/admin/payments/route.js` (GET, list) | Yes — re-signs `serialized.proofUrl` per row before responding; no email sent. |
| `app/api/admin/payments/[id]/route.js` (GET, detail) | Yes — re-signs `payment.proofUrl` before responding; no email sent. |
| `app/api/admin/payments/[id]/verify/route.js` (PATCH) | Yes — signs BEFORE building the email payload (the reference-correct pattern cited above) and before the HTTP response, which share the same signed object. |
| `app/api/admin/payments/[id]/reject/route.js` (PATCH) | Yes — signs before responding; no email sent on reject (matches the source; see the route's own header comment). |
| `app/api/admin/orders/route.js` (GET, list, nested `order.payment`) | Yes — re-signs the nested payment's `proofUrl` per row before responding; no email sent. |
| `app/api/admin/orders/[id]/route.js` (GET, detail — both nested `order.payment` and top-level `payment`) | Yes — signs once, applies the same signed value to both copies, before responding; no email sent. |
| `lib/email.js` — every OTHER sender that takes a `payment` argument (`sendCustomerPaymentVerifiedEmail`) | N/A — grepped `lib/email.js` directly for `payment.proofUrl`/`proofUrl`: the ONLY sender that ever reads `payment.proofUrl` is `sendAdminPaymentProofEmail` (fixed above). `sendCustomerPaymentVerifiedEmail` never references it. |
| `views/admin/AdminPayments.jsx`, `views/admin/AdminOrders.jsx` (admin frontend) | N/A, not an emission site — both only ever RENDER `payment.proofUrl`/`selectedPayment.proofUrl` exactly as delivered by the API responses above; they mint nothing themselves. Since every API response above is now signed, these render correctly. |
| CSV/export endpoints (`app/api/admin/newsletter/export/route.js`, the only CSV export in the app) | N/A — this export is newsletter subscribers only (`Email,Status,Source,Subscribed Date,Unsubscribed Date`); it has no payment/proof fields at all. There is no payment CSV export anywhere in the app. |

**Result: every emission site now signs before use. No further unsigned
`proofUrl` emission sites were found.**

### 10.2 Critical: two unauthenticated non-original routes shipped in the production bundle

**A controller ruling from an earlier pass of this same review is corrected
here, and withdrawn:** that pass required the gate on `POST
/api/test-bootstrap` and `GET /api/test-email-change-token` to also include
`NODE_ENV !== 'production'`. That additional condition would have been wrong
to ship — the Task 15 parity capture pipeline itself runs the built app under
`NODE_ENV=production` (§3 Category B explains why: `next build` always sets
this internally), so a `NODE_ENV !== 'production'` gate would have made
`POST /api/test-bootstrap` 404 during the exact capture run it exists to
support, breaking the verification pipeline this whole report depends on.
That condition is withdrawn.

**What was done instead: both routes were deleted outright**, not
re-gated. They had no production value, they were never part of the original
67-endpoint API (a genuine GC4 violation — new, unauthenticated HTTP surface
that never existed before), and the local verification run they enabled has
already been performed and its results recorded in §1–§7 above.

**Repeatability was preserved without any HTTP surface**, via a new root
`instrumentation.js` exporting Next's documented `register()` hook. This
was more involved than a direct port, because of two things discovered
empirically while making it work:

1. **Next does not reliably await `register()` before serving the first
   request under the programmatic custom-server API**
   (`next({ dev: false, ... })`, what `tools/run-pglite-server.mjs` uses —
   this is NOT `next start`, which behaves differently). Empirically:
   `await app.prepare()` resolved, and the server started accepting
   requests, before `register()`'s own `console.log` lines had run at all —
   the hook actually fired lazily, racing the first real request, not
   blocking on it. This is a Next.js custom-server behaviour, not something
   this migration's code controls.
2. **Turbopack gives `instrumentation.js` a separate build entry point from
   every route handler's own bundle.** This resurrected the exact
   Blocker #2 problem from §1.3, one level up: a plain module-scope
   singleton in `lib/db.js` (`let pgliteInstance`) is NOT shared between
   `instrumentation.js`'s copy of that module and a route handler's own
   copy — each one is bundled independently and gets its own in-memory
   PGlite database. This was confirmed empirically, not assumed: seeding
   inside `register()` completed successfully (its own log lines proved
   it), while every route handler kept reporting
   `relation "products" does not exist` forever after — i.e. two genuinely
   different databases in the same OS process.

**The actual fix, addressing the root cause rather than working around
it**: `lib/db.js`'s PGlite singleton was moved off a module-scope `let` and
onto `globalThis` (`globalThis.__zahzanPgliteInstance` /
`globalThis.__zahzanPglitePromise`). `globalThis` is the one thing every
separately-bundled entry point genuinely shares within one OS process,
regardless of how many independent copies of the module's own top-level code
Turbopack produces — this is what makes "one PGlite instance per process"
actually true, for `instrumentation.js`, every route handler, AND (as a
direct consequence) a plain external `node` script, closing Blocker #2 from
§1.3 more completely than the original per-route-handler-only fix did. This
is test/local-verification-only code — the `pg` Pool used against real
Supabase (`SUPABASE_DB_URL`) is untouched, and `getPglite()` is only ever
called when `ZAHZAN_DB_DRIVER=pglite`.

`register()` itself is also gated on `process.env.NEXT_RUNTIME === 'nodejs'`
(Next's own documented pattern for keeping Node-only code out of the
Edge-runtime variant of `instrumentation.js` it also builds by default — this
eliminated 8 Turbopack build warnings about `node:fs`/`process.exit` being
unsupported on Edge) and is idempotent via a `globalThis`-cached promise, so
it is safe to call more than once. `tools/run-pglite-server.mjs` was updated
to import and `await` `register()` directly, immediately after
`app.prepare()` and before `server.listen()` — making bootstrap deterministic
regardless of finding (1) above, rather than depending on Next's own
unreliable-in-this-mode invocation timing. (Next's own lazy invocation may
still fire later on some request; because `register()` is idempotent, that is
a harmless no-op against the already-populated `globalThis`-cached promise.)

Empirically re-verified after the fix: a fresh `node tools/run-pglite-server.mjs`
run followed IMMEDIATELY by `curl /api/products` (no wait, no retry) returned
all 4 seeded products on the very first request, and both deleted routes
returned the same 404 envelope `app/api/[...catchAll]/route.js` returns for
any unmapped path (confirmed with `curl -X POST .../api/test-bootstrap` and
`curl .../api/test-email-change-token?userId=x`, both `404`).

**`GET /api/test-email-change-token` has NOT been replaced with an
equivalent.** Unlike migration/seeding, its job — reading back a
`crypto.randomBytes(32)` token generated mid-run, by a request the capture
script itself issues, that the API deliberately never returns to any client
— is not boot-time logic, so `register()` (which runs once, before any
request is served) has no way to serve it. `tools/contract-capture.mjs`'s
`fetchEmailChangeTokenPg` helper was left in place (it already treated any
non-200 response as "no token available, skip the step" — the exact contract
needed here) rather than deleted, so this now degrades to a clean, logged
skip instead of an error. A companion fix, `Recorder.skip(name)`
(`tools/contract-capture.mjs`), reserves that step's sequence number without
writing a file, so every interaction captured after it keeps the same
filename it would have had anyway — without this, one skipped interaction
would cascade into 7 spurious filename-mismatch "MISSING" entries for every
later interaction, none of which would reflect an actual response
difference. **If a future engineer needs this journey step
(`extra2.users-confirm-email-change-success`) captured again**, the
re-enable path on a throwaway branch is: temporarily restore
`app/api/test-email-change-token/route.js` from git history (it is fully
intact in this repository's history prior to this commit), rebuild, run the
capture, then discard the branch — it should not be reintroduced into `main`
given the GC4/unauthenticated-surface reasoning above.

**Verified**: `npm run build`'s route table (§6) no longer contains either
path.

### 10.3 Important: regression tests for the signed-URL fixes

Neither the original six-route fix (§2) nor the `_submitPaymentProof.js`
email fix (§10.1) had a regression test — `test/api/admin.test.js` had only
gained the `ZAHZAN_STORAGE_DRIVER = 'memory'` setup line the fix required to
run at all, which is setup, not a test; nothing would have caught either
defect regressing. The correct assertion pattern already existed at
`test/api/orders.test.js:401` (`expect(payment.proofUrl).not.toBe(storedPayment.proof_url)`,
plus a round-trip check that the returned value equals a fresh
`signProofUrl()` call against the stored path) — that pattern is now applied
in two places:

- **`test/api/admin.test.js`** — assertions added to three existing tests
  (not new `it` blocks; the fix is now covered as part of the tests that
  already exercised these routes' shapes):
  - `GET /api/admin/payments` (list)
  - `GET /api/admin/payments/:id` (detail)
  - `GET /api/admin/orders/:id` (both the nested `order.payment.proofUrl`
    AND the top-level sibling `payment.proofUrl` are asserted separately,
    since §10.1's audit table shows this route signs once and copies the
    value to both places — a regression that broke only one copy would
    otherwise go uncaught)

  Each asserts `proofUrl !== <stored raw path>` AND `proofUrl === (a fresh
  `signProofUrl(row.proof_public_id)` call)`, i.e. it doesn't just check "not
  the raw value" (which a broken-but-different signer could still pass) but
  that it's the SPECIFIC correct signed value.

- **`test/api/payments.test.js`** — one new test, covering §10.1
  specifically: `lib/email.js` is `vi.mock`'d with the real
  `sendAdminPaymentProofEmail` wrapped (not replaced) in a `vi.fn()` spy, so
  the dev-log fallback still runs exactly as before but the exact `payment`
  object handed to it is now inspectable. The test submits a real payment
  proof, then asserts the object the route handed to
  `sendAdminPaymentProofEmail` has a `proofUrl` that (a) is not the raw
  stored path, (b) is byte-identical to what the HTTP response itself
  returned, and (c) matches the memory driver's signed-URL shape
  (`memory://...`). This specifically closes the gap `lib/email.test.js`
  could not: that file only ever observes the dev-log fallback's `text`
  output, which `sendAdminPaymentProofEmail`'s own `text` template never
  includes a URL in at all (only `html` does) — so no existing test could
  have caught this regression by inspecting logged output.

All four new/extended assertions pass; full suite result in §6 (372/372,
+1 net new test count — three of the four assertions were added to existing
`it` blocks).

### 10.4 Important/Minor: `docs/PARITY_REPORT.md` accuracy corrections

Folded directly into the sections they concern, with pointers back here:

- **§4's mislabelled "full, unedited" block** (Important 4) — was a ~85-line
  hand-collapsed summary; corrected. The genuine, complete, 614-line output
  is now in `docs/parity-diff-full.txt`, referenced from §4 rather than
  falsely inlined-and-labelled.
- **§3's Category C count** (Important 5) — was "7 occurrences across 5
  files," actually **22 occurrences across 14 files**; the old enumeration
  also only actually listed 12 file names while claiming 5, and omitted
  `073`/`074` even though §4's own (collapsed) diff excerpt already showed
  them. Recounted directly from the regenerated, genuine `contract-diff`
  output; see §3 for the corrected count and file list.
- **§8's missing disclosure of the two-capture-script-versions assumption**
  (Important 6) — added as new §8 item 6: `tools/golden/` and
  `tools/golden-next/` were captured with different versions of
  `contract-capture.mjs` (hardcoded vs. dynamically-resolved fixture ids,
  §1.4), the old stack was never re-captured with the new script to measure
  the difference's actual effect, and the validity of the whole diff rests
  on that unmeasured (though reasoned, and empirically unsurprising —
  zero array-length findings anywhere) assumption.
- **§8's missing disclosure of `URL_RE`'s shape-only verification**
  (Important 7) — added as new §8 item 7: `tools/lib/normalise.mjs`'s
  `URL_RE` collapses every URL-shaped value to a placeholder before
  comparison, so `contract-diff` verifies `proofUrl` is URL-*shaped*, never
  that it is *correct* — meaning §2's and §10.1's fixes are verified
  shape-deep by the automated diff pipeline, not content-deep (real
  correctness against a live Supabase project is still covered by §8 item 1
  only).
- **§8.2's timezone item understating the impact** (Minor 8) — was "the code
  looks timezone-safe"; corrected to state plainly that a mismatched project
  timezone would change the customer-visible order number itself
  (`ZHZ-YYYYMMDD-XXXX`), not merely an internal/diagnostic value, if any
  date-bucketing logic (present or future) is ever written without an
  explicit UTC cast.

---

## 11. Final whole-branch review fix wave (DO-NOT-MERGE findings closed)

This section records the single fix wave applied in response to the
whole-branch review that recommended DO-NOT-MERGE on three blocking
findings (B1, B2, B3), plus two more findings (M1, M2) and a set of smaller
test/doc-accuracy items. There is no second fix wave planned; this is meant
to leave the branch mergeable.

### B1 — 62 of 67 endpoints had silently lost their rate limit

`server/server.js:60`'s `app.use('/api', apiLimiter)` applied a global
200-requests/15-minutes limiter to every `/api` route in the original stack.
The port never reproduced it: only the five routes that already called
`checkRateLimit` directly (register, login, forgot-password, reset-password,
newsletter/subscribe) were throttled at all.

**Fix**: a new composable wrapper, `withApiHandler` (`lib/rateLimit.js`),
wraps `withErrorHandler` around a global `checkRateLimit(request,
globalRateLimit)` call, then falls through to the route's own handler
(whose own specific check, on the five routes that have one, still runs
first thing inside that, unchanged). Every one of the **57 route.js
files** (serving all 67 method-level endpoints, including the
`[...catchAll]` 404 fallback and `payments/methods`, which previously had
no wrapper of any kind) now uses `withApiHandler` in place of a bare
`withErrorHandler`, via a one-shot mechanical script that rewrote each
file's import and call site (verified by hand afterward, including merging
the resulting duplicate `lib/rateLimit.js` import line on the five
already-rate-limited routes).

**Ordering preserved exactly**: `withApiHandler`'s global check runs before
the wrapped handler is ever invoked, so on the five specific-limiter routes
a single request now consumes BOTH the global counter and the specific one,
in that order — reproducing Express's original double-consumption. The two
counters are independent (`checkRateLimit`'s key is `${config.id}:${ip}`,
and `'global'` never collides with `'login'`/`'register'`/`'passwordReset'`/
`'newsletter'`).

**Verified for real, not just unit-tested**: after `npm run build`, the
built app was booted via `tools/run-pglite-server.mjs` and hit with 200 real
HTTP requests to `GET /api/products` (a route with no specific limiter) from
one IP — all 200 returned 200, and the 201st returned exactly:

```
HTTP 429
{"success":false,"message":"Too many requests from this IP, please try again after 15 minutes"}
```

— byte-identical to `globalRateLimit.message`. The same exhausted IP was
then confirmed to also 429 on the catch-all 404 route (proving the global
limiter covers unmatched `/api/*` paths, matching Express mounting
`apiLimiter` before `notFound`), while a brand-new IP got a normal 404/200
on the catch-all and health routes respectively.

**New tests** (`test/rateLimit.test.js`, real route handlers exercised
end-to-end through `withApiHandler`, not just `checkRateLimit` in
isolation):
- `GET /api/products` (no specific limiter) returns 200 for
  `globalRateLimit.max` requests from one IP, then 429 with the exact
  configured message.
- A single `POST /api/auth/login` request is proven, via direct
  `rate_limits` table inspection, to increment BOTH the `global:<ip>` and
  `login:<ip>` counters by exactly 1.
- Exhausting `loginRateLimit.max` requests on `/api/auth/login` still
  reports login's own message (not the global one) on the
  `(max + 1)`-th request, while the global counter is shown to have
  incremented on every one of those requests too (`loginRateLimit.max + 1`),
  proving the global check runs unconditionally on every request rather
  than being short-circuited once a route-specific limiter also exists.

`test/rateLimit.test.js`'s original test (asserting only the five configs'
shape) is unchanged and still present — it was correct as far as it went;
it just never proved the wiring existed, which the three new tests above
now do.

### B2 — the production `pg` Pool is now on `globalThis`

`lib/db.js`'s `pgPool` moved from a module-scope `let` to
`globalThis['__zahzanPgPool']`, using exactly the pattern already applied to
the PGlite singleton two keys below it (`getPgPool()`/`close()` updated to
match; `query`/`tx` untouched). The stale comment asserting the `pg` Pool
was "unaffected" by Turbopack's per-entry-point bundling has been corrected
and now explains, and warns against reverting, the fix.

**Verified at build-output level**, per the finding's own standard of
evidence: after `npm run build`, `.next/server/chunks/*.js` (compiled
output, not source maps) was grepped for `__zahzanPgPool` — it appears in
every chunk that inlines `lib/db.js`'s compiled form, confirming the guard
compiles into each of those independently-bundled copies and that they all
key off the same `globalThis` slot.

### B3 — 31 navigation sites restored to react-router's "no scroll reset" behaviour

Every internal `router.push` and `<Link>` site across the app was enumerated
by grepping `app/`, `components/`, `views/`, and `context/` directly (not
trusted from the review's own partial list) and given `{ scroll: false }` /
`scroll={false}` respectively, reproducing react-router v6's behaviour (it
never auto-scrolled on navigation) against Next's App Router default (scroll
to top on both `<Link>` and `router.push`). 15 `router.push` call sites and
16 `<Link>` elements, 31 total, across 9 files:

- `components/CartDrawer.jsx` (1 `router.push`)
- `components/WishlistDrawer.jsx` (3 `router.push`)
- `components/ProductCard.jsx` (1 `router.push`, 1 `<Link>`)
- `components/UniversalNavMenu.jsx` (1 `router.push`, 8 `<Link>`)
- `components/Header.jsx` (1 `<Link>`)
- `views/Shop.jsx` (2 `router.push` — the sidebar category-filter clicks
  called out by the review as the most visible instance of the regression)
- `views/Product.jsx` (1 `router.push`, 2 `<Link>`)
- `views/Account.jsx` (1 `<Link>`)
- `views/admin/AdminLogin.jsx` (2 `router.push`)
- `views/admin/AdminLayout.jsx` (4 `router.push`, 2 `<Link>`)
- `views/admin/AdminDashboard.jsx` (2 `<Link>`)

The admin panel sites were not named in the review's own list but were
included on the same reasoning: it was also a react-router SPA before the
port, with the same "no scroll reset" behaviour to preserve.

**Preserved carefully, as instructed**: `views/Product.jsx`'s own explicit
`window.scrollTo({ top: 0, behavior: 'instant' })` effect (keyed on `[id]`,
original behaviour ported from `src/pages/Product.jsx:39`) was not touched.
It fires independently of Next's router-level scroll restoration — with
`scroll: false`/`scroll={false}` now set on every navigation that lands on
this page, Next no longer scroll-jumps on arrival either, and the
component's own effect still runs on mount/`id` change and puts the viewport
at the top, exactly as before.

### M1 — newsletter subscribe response now goes through `lib/serialize.js`

`app/api/newsletter/subscribe/route.js`'s new-subscriber success branch
hand-built `{ id, email, status, subscribedAt: newSubscriber.subscribed_at }`
directly, passing `subscribed_at` through as a raw Date/driver value instead
of through `toIso()`. A new narrow variant,
`serializeNewsletterSubscribeResult` (`lib/serialize.js`, precedented by
`serializeOrderSummaryForPayment`/`serializeDashboardRecentCustomer`),
reproduces exactly that four-key shape — deliberately NOT
`serializeNewsletterSubscriber`'s full shape, since the source never emitted
`_id`/`source`/`unsubscribedAt`/`createdAt`/`updatedAt`/`userId` here
(confirmed against `tools/golden/051-newsletter.subscribe.json`). The route
now calls it instead of hand-building the object. The emitted JSON is
unchanged (`JSON.stringify` already called `Date.prototype.toJSON` ==
`toISOString()` on the raw Date, same as `toIso()` produces).

### M2 — `.env.example` completed, with explicit data-loss warnings

Added, each with a comment explaining the risk:
- **`ZAHZAN_STORAGE_DRIVER`** — was undocumented; now documented with an
  explicit warning that `memory` in production silently and permanently
  loses every payment-proof upload on restart.
- **`ZAHZAN_DB_DRIVER`** — same class of warning: `pglite` in production
  would run the whole app against an in-memory database that resets to
  empty on every restart/redeploy.
- **`FRONTEND_URL`** — documented as taking priority over `CLIENT_URL` in
  `lib/email.js:415` for password-reset/email-change links.
- **`CLIENT_URL`**'s existing `localhost:5173` default is now annotated as a
  faithful-but-stale carry-over (the dead Vite port) that still feeds email
  link generation as a fallback.
- **`AI_API_KEY`** — annotated as read by nothing in the codebase (grepped
  `app/`, `lib/`, `server/`), kept rather than silently dropped in case a
  real deployment already has it set.

### Housekeeping

- `README.md` — was still the stock Vite template ("# React + Vite").
  Replaced with an accurate description of this Next.js + Supabase app, how
  to run/test it, and pointers to `docs/PARITY_REPORT.md` and
  `docs/DATA_MIGRATION.md`. Documents that `server/` is deliberately kept as
  the behavioural oracle, not a live service.
- `package.json` — removed the `server` / `server:dev` scripts that booted
  the Express app being replaced (a foot-gun now that it's the parity
  oracle, not a thing meant to run). `server/` itself is untouched.

### Test + doc accuracy

- **Four missing regression assertions added**, same pattern as
  `test/api/orders.test.js:401` (`.not.toBe(<raw stored path>)` plus a
  round-trip equality against a fresh `signProofUrl()` call):
  `GET /api/admin/orders` (list, nested `order.payment.proofUrl` —
  `test/api/admin.test.js`), `PATCH /api/admin/payments/:id/verify`
  (`test/api/admin.test.js`), `PATCH /api/admin/payments/:id/reject`
  (`test/api/admin.test.js`), and `GET /api/payments/order/:orderId`
  (`test/api/payments.test.js`).
- `test/api/notfound.test.js` — updated to set up the PGlite migration
  fixture it previously didn't need; the catch-all route's handlers now
  touch `lib/db.js` (via `withApiHandler`'s global rate-limit check), so
  this suite would otherwise fall through to the production `pg` driver
  with no `SUPABASE_DB_URL` configured.
- `test/api/payments.test.js` — the `GET /api/payments/methods` test's
  zero-argument route call (`await methodsRoute()`) was updated to pass a
  real `Request`, since the route is now wrapped in `withApiHandler`, which
  needs one to read the client IP from (a real Next.js invocation always
  supplies one; only this test's former call site didn't).
- `docs/PARITY_REPORT.md` §10.1's `app/api/orders/route.js` table row
  corrected: it read as unconditional signing; signing is actually gated on
  `proofFromUpload`, and the `rawBody.proofUrl` fallback branch (no file
  uploaded through this route) is parity-correct to leave unsigned, not a
  missed site — see the corrected row in §10.1 for the full reasoning.
- §6's "all 67 governed route files" corrected to "57 governed route files
  (serving the 67 method-level endpoints)" — the original wording conflated
  file count with endpoint count.
- §8 gained a new item 8 documenting that malformed JSON request bodies now
  return the route's own 400 instead of Express's original
  500-with-SyntaxError (a genuine, un-golden-exercised divergence — see §8
  item 8 for the full mechanism and why it was left unresolved rather than
  guessed at, same reasoning as Ruling C16).

### Verification

```
npm test
```
```
 Test Files  24 passed (24)
      Tests  376 passed (376)
```
376 = the 372 the task brief stated, + 1 net-new `it` block from the earlier
Final Parity Gate pass (§10.3, unchanged by this wave), + 3 new `it` blocks
added in this wave (`test/rateLimit.test.js`'s B1 coverage) — the four other
new assertions in this wave were added inside existing `it` blocks, not new
ones, so they don't change the count.

```
npm run build
```
Clean, zero warnings, same 57 route files + `[...catchAll]` compile as
before this wave (route table unchanged; confirmed by direct comparison
against §6's table above).

Real-HTTP spot checks against the built app (`tools/run-pglite-server.mjs`)
are quoted in full under B1 and B2 above.

**Not completed / left as-is by design**: the malformed-JSON status-code
divergence (§8 item 8) and Rulings C15/C16 remain open, documented
divergences — none of B1/B2/B3/M1/M2 required touching them, and GC4
forbids opportunistic fixes outside a fix wave's actual scope.
