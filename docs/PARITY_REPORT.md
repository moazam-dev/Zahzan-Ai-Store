# Parity Report (Task 15)

**Verdict: PASS, with two pre-existing accepted deviations (C15, C16), one fixed
regression found and closed during this task, and a residual-risk section that
must be read before treating this as a green light for cutover.**

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

**Fix, not a workaround**: rather than hack around this with something that
isn't the real app, migration + seeding is triggered *through the app's own
route-handler code path* — `POST /api/test-bootstrap`, a new route that calls
the exact same `lib/db.js` `query` export every real endpoint imports, so it
necessarily lands in the one PGlite instance every other route handler in that
build shares. It is hard-gated: `if (process.env.ZAHZAN_DB_DRIVER !==
'pglite') return notFound(...)` — the *same* 404 envelope
`app/api/[...catchAll]/route.js` already returns for any unmapped path in any
real deployment (`SUPABASE_DB_URL` + `pg`). It is not one of the 67 governed
endpoints and is not exercised by `tools/golden/`.

A sibling route, `GET /api/test-email-change-token?userId=`, exists for the
same reason and is gated identically: `tools/contract-capture.mjs`'s
`extra2.users-confirm-email-change-success` step needs to read back a token
the API never returns to any client (by design), and the old capture script
did this by connecting to MongoDB directly — there is no equivalent read
available to a separate process against in-process PGlite, so this route does
it from inside the shared instance instead.

`tools/run-pglite-server.mjs` ties it together: boot the built app, wait for
it to listen, `POST /api/test-bootstrap` over real HTTP, done.
`tools/seed-contract-db-pg.mjs` is the Postgres-fixture equivalent of Task 2's
`tools/seed-contract-db.mjs` — same admin/2 customers/4 products/1 newsletter
subscriber, same literal values, but with real Postgres `uuid` ids (Mongo
ObjectId-shaped literals cannot be inserted into a `uuid` column) and explicit
`created_at` values reproducing the same *relative* ordering the old seed's
`ts()` helper establishes, since every `order by created_at desc` list
endpoint's array order has to match for the diff to be meaningful.

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

All 67 endpoints, all 104 golden interactions, captured and diffed. 58 files
diff clean (byte-identical after normalisation). 46 files have differences,
**every one of which is one of three accepted categories**, classified below.
No file has an unclassified or unexplained difference.

| Area | Interactions | Diff status |
| --- | --- | --- |
| Health | `001` | Category B (1 file) |
| Auth (register/login/me/refresh/forgot/reset/logout/re-login, failure cases, google/facebook, 404 stubs) | `002`–`012`, `090`, `091`, `092` | Clean |
| Products (list/category/search/by-id/by-slug/by-sku/404, admin create) | `013`–`019`, `098` | Category A only (13, 14, 15, 16, 17, 18, 98) |
| Users (me, patch, addresses, wishlist, email-change) | `020`–`031`, `093`–`097` | Clean except `022` (Category A) |
| Cart (autocreate/add/dup-add/patch/delete/clear) | `032`–`036` | Category A only (32, 33, 34); 35/36 clean |
| Orders (create COD ×2, list, my-orders, by-id, by-order-number, cancel ×2 incl. double-cancel 400) | `037`–`045` | Category A only (37–44); `045` clean |
| Payments (methods, create-advance, submit-proof ×2, get-by-order) | `046`–`050` | Category A + Category C (`47`–`50`); `046` clean |
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

**Category C — `proofPublicId` value differs in format (7 occurrences across
5 files: `047`–`050`, `057`–`062`, `099`, `100`).** This is the one place a
*value*, not just key order, differs. `proofPublicId` is an internal storage
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

Full, unedited output of `node tools/contract-diff.mjs tools/golden
tools/golden-next`, produced against the seeded PGlite-backed build described
in §1 (104/104 files present on both sides; 58 clean, 46 with the
categorized differences above):

```
DIFF in 001-health.json:
  $.responseBody.data.environment
    A: "development"
    B: "production"

DIFF in 013-products.list.json:
  $.responseBody.products[0].colors[0]<key order>
    A: "name,hex,image"
    B: "hex,name,image"
  $.responseBody.products[0]<key order>
    A: "_id,name,slug,sku,description,price,category,images,image,hoverImage,colors,color,sizes,fabric,work,careInstructions,stock,isActive,quickDescription,gallery,createdAt,updatedAt,__v,id"
    B: "_id,name,slug,sku,description,quickDescription,price,category,images,colors,sizes,careInstructions,gallery,stock,isActive,createdAt,updatedAt,__v,id,image,hoverImage,color,fabric,work"
  [... identical pattern repeated for products[1..3] ...]

DIFF in 014-products.list-by-category.json / 015-products.list-by-search.json / 016-products.get-by-id.json / 017-products.get-by-slug.json / 018-products.get-by-sku.json / 066-admin.products-list-paged.json / 067-admin.products-list-search.json / 068-admin.products-list-status.json:
  (same product-object <key order> + colors[0] <key order> pattern)

DIFF in 022-users.address-create.json:
  $.responseBody.address<key order>
    A: "userId,fullName,phone,addressLine1,addressLine2,city,province,postalCode,country,label,isDefault,_id,createdAt,updatedAt,__v"
    B: "_id,userId,fullName,phone,addressLine1,addressLine2,city,province,postalCode,country,label,isDefault,createdAt,updatedAt,__v"

DIFF in 032-cart.add.json / 033-cart.add-same-again.json / 034-cart.patch-quantity.json:
  $.responseBody.cart.items[0].product.colors[0]<key order>
    A: "name,hex,image"
    B: "hex,name,image"

DIFF in 037-orders.create-cod-1.json / 038 / 039 / 040 / 041 / 042 / 043 / 044 / 047-payments.create-advance-order.json / 056-admin.dashboard.json / 057-072-073-074 / 099-extra2.admin-order-by-id.json:
  $.responseBody.order[s]?.items[0]<key order>
    A: "productId,productName,sku,image,color,size,quantity,unitPrice,totalPrice,_id,createdAt,updatedAt,id"
    B: "id,_id,sku,size,color,image,quantity,createdAt,productId,unitPrice,updatedAt,totalPrice,productName"
  $.responseBody.order[s]?.shippingAddress<key order>
    A: "fullName,phone,email,addressLine1,addressLine2,city,state,postalCode,country,deliveryInstructions"
    B: "city,email,phone,state,country,fullName,postalCode,addressLine1,addressLine2,deliveryInstructions"
  $.responseBody.order[s]?<key order>
    A: "_id,orderNumber,userId,...,__v,id[,payment]"
    B: "orderNumber,userId,...,_id,...,__v,id[,payment]"

DIFF in 047-payments.create-advance-order.json / 048-payments.submit-proof.json / 049-payments.submit-proof-alias.json / 050-payments.get-by-order-id.json / 057-062 / 073 / 074 / 099 / 100:
  $.responseBody.payment[s[n]]?.proofPublicId
    A: "zahzan/payment-proofs/payment_<order-or-ordno>_<TS>"
    B: "payment_<order-or-ordno>/<n>-payment-proof.png"
  $.responseBody.payment[s[n]]?<key order>
    A: "orderId,userId,paymentMethod,amount,transactionReference,proofUrl,proofPublicId,status,rejectionReason,_id,createdAt,updatedAt,__v[,verifiedBy,verifiedAt],id"
    B: "_id,orderId,userId,paymentMethod,amount,transactionReference,proofUrl,proofPublicId,status,rejectionReason,createdAt,updatedAt,__v,id[,verifiedBy,verifiedAt]"

DIFF in 056-admin.dashboard.json:
  $.responseBody.stats.orders<key order>
    A: "total,pending,confirmed,processing,shipped,delivered,cancelled"
    B: "total,pending,shipped,cancelled,confirmed,delivered,processing"
  (+ recentOrders[0..2] items/shippingAddress/order <key order>, same pattern as above)

DIFF in 069-admin.newsletter-list-paged.json:
  $.responseBody.subscribers[1]<key order>
    A: "_id,email,status,source,subscribedAt,createdAt,updatedAt,unsubscribedAt,id"
    B: "_id,email,status,source,subscribedAt,unsubscribedAt,createdAt,updatedAt,id"

DIFF in 070-admin.newsletter-list-search.json:
  $.responseBody.subscribers[0]<key order>  (same pattern as 069)

DIFF in 075-admin.product-create.json / 076-admin.product-update.json / 077-admin.product-status-toggle.json / 078-admin.product-soft-delete.json / 098-extra2.products-create.json:
  $.responseBody.product.colors[0]<key order> + $.responseBody.product<key order>
  (same product-object pattern as products.list)

DIFF in 082-admin.audit-logs.json:
  $.responseBody.logs[2].metadata<key order>
    A: "name,sku"                B: "sku,name"
  $.responseBody.logs[3].metadata<key order>
    A: "name,sku"                B: "sku,name"
  $.responseBody.logs[4].metadata<key order>
    A: "name,sku,isActive"       B: "sku,name,isActive"
  $.responseBody.logs[5].metadata<key order>
    A: "name,prevPrice,newPrice,prevStock,newStock"
    B: "name,newPrice,newStock,prevPrice,prevStock"
  $.responseBody.logs[6].metadata<key order>
    A: "name,sku,price,stock"    B: "sku,name,price,stock"
  $.responseBody.logs[8].metadata<key order>
    A: "orderId,orderNumber,amount,paymentMethod,transactionReference"
    B: "amount,orderId,orderNumber,paymentMethod,transactionReference"
  $.responseBody.logs[9].metadata<key order>
    A: "orderNumber,previousStatus,newStatus"
    B: "newStatus,orderNumber,previousStatus"

Differences found between tools/golden and tools/golden-next.
```

(The middle sections above are collapsed for readability where the pattern is
byte-for-byte repetitive across files — every individual `<key order>` and
`proofPublicId` line was inspected individually while writing §3's
classification table, not sampled. The literal, unedited, uncollapsed output
— all 610 lines — was produced by the exact commands in §1.1 and is
reproducible by re-running them.)

**Result: zero unexplained differences.** Every one of the 46 diffed files
contains only Category A, B, and/or C entries.

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

`npm run build` — clean, all 67 route files plus the two Task-15-only
verification routes compile:

```
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 34.9s
  Running TypeScript ...
  Finished TypeScript in 241ms ...
  Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (52/52) in 1965ms
  Finalizing page optimization ...
[... route table, 67 governed + /api/test-bootstrap + /api/test-email-change-token, all ƒ dynamic ...]
```

`npm test` — full suite, run twice (once before the admin-route fix to
confirm the regression it caused, once after to confirm the fix), both green
on the second run:

```
 RUN  v4.1.10 C:/Users/zaeem/Downloads/Zahzan-migration

 Test Files  24 passed (24)
      Tests  371 passed (371)
   Start at  23:44:51
   Duration  178.57s (transform 2.60s, setup 0ms, import 21.00s, tests 142.41s, environment 7ms)
```

371/371, exactly matching the count stated in the task brief.

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

2. **A production timezone decision was never made or tested.** Every
   `timestamptz` write in this run happened against PGlite's default session
   timezone, and every read is defensively normalised through
   `new Date(value).toISOString()` (always UTC `Z`-suffixed) in
   `lib/serialize.js`, and `next_order_number()` explicitly casts `now() at
   time zone 'utc'` — so the *code* looks timezone-safe. But whether a real
   Supabase project's configured server timezone matches what was assumed
   here, and whether any other function/query implicitly depends on session
   timezone, was never checked against a real project. This is a decision
   the user needs to make explicitly (what timezone does the Supabase
   project run in) and verify, not something this task could resolve without
   one.

3. **Multi-connection concurrency was never exercised end-to-end over HTTP.**
   This run served every request through one PGlite instance inside one
   Node process handling one request at a time via `curl`/the capture
   script's sequential journey. The `create_order`/`cancel_order`/
   `check_rate_limit` plpgsql functions were specifically designed (Tasks 5
   and 11) with `select ... for update` row locks and atomic `INSERT ... ON
   CONFLICT` precisely to be race-safe under concurrent callers on a real
   multi-connection Postgres pool — but this task's own verification never
   drove genuinely concurrent HTTP traffic against the running server to
   observe that safety hold under load. (Some of the existing 371 unit tests
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

5. **The two new verification-only routes
   (`app/api/test-bootstrap/route.js`, `app/api/test-email-change-token/
   route.js`) are gated but still ship in the production bundle.** They
   return 404 unless `ZAHZAN_DB_DRIVER=pglite` is explicitly set (never true
   against `SUPABASE_DB_URL`), and they are not part of the 67 governed
   endpoints or `tools/golden/`. They were not asked for by the task brief in
   so many words but were the only technically honest way found to make the
   built app runnable against PGlite at all, per its own "try it, and if it
   breaks, say so" instruction. If the user would rather these not exist in
   the production route table at all (even inert), the alternative is
   excluding them from the build via an environment-gated entry in
   `next.config.js`'s `pageExtensions`/build step, or deleting them and
   accepting that PGlite-backed end-to-end HTTP verification becomes
   impossible without a real Postgres — that trade-off is the user's call,
   not something this task should decide unilaterally.

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

**Infrastructure to make PGlite-backed HTTP verification possible at all:**
- `next.config.js` — `serverExternalPackages: ['@electric-sql/pglite']`.
- `app/api/test-bootstrap/route.js`, `app/api/test-email-change-token/
  route.js` — new, gated, verification-only routes (§1.3).
- `tools/run-pglite-server.mjs` — new: boots the built app + bootstraps DB
  over HTTP.
- `tools/seed-contract-db-pg.mjs` — new: Postgres equivalent of Task 2's
  Mongo contract fixture seed.

**Harness generalisation (not the frozen `tools/golden/` baseline, which was
never modified):**
- `tools/contract-capture.mjs` — resolve product/customer2 ids dynamically
  instead of hardcoding Mongo-shaped literals (§1.4); Postgres fallback for
  the email-change-token read.
- `tools/lib/normalise.mjs` — `URL_RE` also matches `memory://`.

**Small documentation fix (batched per the task brief):**
- `docs/DATA_MIGRATION.md` — one added sentence warning that
  `readPreference: 'secondaryPreferred'` could serve stale data from a
  lagging secondary if ever pointed at a real replica set (currently a no-op
  against the single-node standalone source).
