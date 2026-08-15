# ZAHZAN Migration — Handoff

**Branch:** `migration/nextjs-supabase` → merged to `main`
**Worktree:** `C:/Users/zaeem/Downloads/Zahzan-migration`
**Status:** All 15 tasks complete. API contract parity proven. **Cutover-readiness is NOT** — see §3.

---

## 1. What was built

Your store now runs on Next.js 16 (App Router) + Supabase Postgres, with the frontend frozen.

| | |
|---|---|
| Commits | 40 |
| Files changed | ~315 (~31,000 insertions) |
| Endpoints ported | **67 of 67** |
| Tests | **380 passing** |
| Parity baseline | 104 captured interactions from your original Express app |
| Documented deviations | 2 (C15, C16) + 1 accepted regression (N1 fixed) |

**Key files:**
- `docs/PARITY_REPORT.md` — endpoint-by-endpoint parity evidence and the "could not verify" list
- `docs/DATA_MIGRATION.md` — how to move products + admin users out of MongoDB
- `docs/CONTRACT_CAPTURE.md` — how to re-run the parity verification
- `docs/parity-diff-full.txt` — the genuine 614-line diff output
- `supabase/migrations/0001_init.sql` — 20 tables + all SQL functions
- `tools/golden/` — the 104-file regression oracle (**never edit; it is the baseline**)
- `server/` — your original Express app, retained as the behavioural authority

**Architecture:** data access is direct parameterized SQL via `pg`; `supabase-js` is used for Storage only. This deviates from the original plan's PostgREST sketch — see ruling AR1.

---

## 2. CONNECTING SUPABASE — do this first

### 2.1 Three environment variables

```
SUPABASE_DB_URL            # Postgres connection string — ALL data access
SUPABASE_URL               # project URL — Storage only
SUPABASE_SERVICE_ROLE_KEY  # service role — Storage only. NEVER prefix NEXT_PUBLIC_
```

### 2.2 ⚠️ The connection-string choice that can silently break checkout

Supabase offers **transaction mode (port 6543)** and **session mode / direct (port 5432)**.

**Use session mode or the direct connection. NOT 6543.**

`lib/db.js`'s `tx()` opens a client, issues `BEGIN`, works, then `COMMIT`. Under transaction-mode
pooling each statement can land on a different backend, so `BEGIN` and `COMMIT` may not share a
session and the transaction silently stops being atomic. Your `create_order` function depends on
that atomicity — it validates stock, inserts the order, inserts the payment, decrements stock and
clears the cart as one unit. On 6543 you would get partial checkouts.

### 2.3 Sequence

1. **Apply the schema** — paste `supabase/migrations/0001_init.sql` into the SQL editor and run it.
   That is all 20 tables, constraints, indexes, and the functions `create_order`, `cancel_order`,
   `next_order_number`, `admin_dashboard_stats`, `check_rate_limit`, `purge_expired`.

2. **Create two buckets.** Names are hardcoded in `lib/storage.js` and must match exactly:
   - `product-images` → **public**
   - `payment-proofs` → **PRIVATE**

   Getting the second wrong is serious: the entire signed-URL design assumes it is private. If it is
   public, every stored path becomes a permanent public URL and customer payment receipts are
   world-readable.

3. **Set the database timezone deliberately.** Order numbers are `ZHZ-YYYYMMDD-XXXX` and
   customer-visible. `next_order_number()` computes the date in UTC; your original used the Node
   process's local timezone. If your old host ran at Asia/Karachi, orders placed 00:00–05:00 local
   will now carry the previous day's date. Decide and record it.

4. **Migrate your data** — `docs/DATA_MIGRATION.md`, four steps, dry-run both scripts first.
   Only products and admin users migrate, per your decision. Admin bcrypt hashes are copied verbatim
   so existing passwords keep working.

5. **Re-run the parity verification against the real project** — `docs/CONTRACT_CAPTURE.md`.
   Everything so far was verified against an in-process Postgres. This is what proves the real `pg`
   driver, the pooler, and real Storage behave the same.

### 2.4 Never set these in production

| Variable | If set wrong |
|---|---|
| `ZAHZAN_DB_DRIVER=pglite` | App runs on an empty in-memory database |
| `ZAHZAN_STORAGE_DRIVER=memory` | Every payment proof written to an in-process Map, **silently lost on restart** |

Both default correctly when unset. Neither should ever appear in a production environment.

### 2.5 Also set before enabling email

`FRONTEND_URL` (preferred) or `CLIENT_URL`. `CLIENT_URL` currently carries `http://localhost:5173`
— a faithful carry-over pointing at the dead Vite port — and it feeds password-reset and
email-change link generation.

---

## 3. PRE-DEPLOY GATES — none of these are code defects

**⚠️ G1 — Confirm your edge sets `x-forwarded-for`.** This is the one that can take the API down on
day one. Rate-limit keys fall back to the literal string `unknown` when neither `x-forwarded-for`
nor `x-real-ip` is present. Before the final fix wave that affected 5 auth routes; now **all 67
endpoints** share one `global:unknown` bucket in that situation — meaning every user on every
endpoint gets a 429 after 200 total requests per 15 minutes. Verify your proxy sets the header, or
adjust `getClientIp` in `lib/rateLimit.js`.

**G2 — Provision Supabase and re-run the verification** (§2.3 step 5). The entire production data
path — `pg` driver, pooler, real Storage, RLS — is currently unexecuted.

**G3 — Verify `tx()` under your chosen pooling mode.** See §2.2. `create_order` and `cancel_order`
correctness depends on it.

**G4 — Make the timezone decision.** See §2.3 step 3.

**G5 — Confirm the `payment-proofs` bucket is private** before any real traffic.

**G6 — Decide what happens to `server/`.** It is retained as the behavioural oracle and the only
thing that can regenerate the goldens. The npm scripts that booted it have been removed.

**G7 — `rate_limits` table growth.** `purge_expired()` now clears stale rows, but the `pg_cron`
schedule in the migration is commented out. Enable it, or run the function periodically.

---

## 4. KNOWN DEVIATIONS FROM STRICT PARITY

Three, all deliberate and documented. Everything else was verified byte-identical.

### C15 — product foreign keys now cascade
`cart_items.product_id`, `wishlist_items.product_id`, `story_submissions.product_id` and
`tryon_jobs.product_id` were given `on delete cascade`.

Without it, permanently deleting a product that sits in any cart or wishlist raised a foreign-key
violation — where your old app always returned 200. Your `cartController.js:13` filters out items
whose product vanished, which is direct proof the old app expected this.

| Path | Old | Now |
|---|---|---|
| Admin permanent-delete of a carted product | 200 | 200 — parity restored |
| Cart read afterwards | item silently dropped | item gone — observably identical |
| Wishlist read afterwards | **crashed** (pre-existing bug) | returns 200 — accidental improvement |
| Wishlist toggle with a fake product id | 200 | **500** — divergence, unreachable from your UI |

If you prefer literal parity over integrity, dropping the FKs is the change to make.

### C16 — whitespace-only required fields
`POST /api/orders` with a customer name of only spaces: old app returned **500** (Mongoose
`required` rejecting an empty string after trim); new app returns **201 with a blank name**
(Postgres `not null` is not a content check).

Not fixed because every option is a guess at behaviour no capture contains. **Your decision if you
want it closed:** reject with a 400, or reproduce the old 500.

### N1 — health endpoint under database outage (FIXED, but know the shape)
The rate limiter is database-backed (serverless has no shared memory); your original was in-memory
with no DB dependency. That briefly meant a DB outage made `/api/health` return 500 instead of its
documented `200 {dbStatus:'disconnected'}`. Fixed by failing open on **infrastructure** failure
only — a genuine over-limit still returns 429.

---

## 5. WHAT COULD NOT BE VERIFIED LOCALLY

No Docker, no Supabase CLI, no psql on this machine. Everything was verified against PGlite
(in-process Postgres) and an in-memory storage driver.

- The production `pg` driver path and Supabase's pooler — **never executed**
- Real Supabase Storage, signed URLs against a real bucket, RLS — **never executed**
- The `supabase` storage driver — **zero executed test coverage**; only the memory driver is tested
- Multi-connection concurrency — PGlite is single-connection, so `check_rate_limit`'s atomicity and
  `next_order_number`'s race fix are correct **by construction and by Postgres semantics**, not by
  an executed stress test
- Email delivery — never exercised (consistent with the original baseline)
- `RateLimit-*` / `Retry-After` response headers — your original sent them; the port does not.
  Invisible to the parity diff, which captures body and status only.
- The two golden captures were produced by slightly different versions of the capture script; the
  old stack was never re-captured to measure equivalence

`docs/PARITY_REPORT.md` §8 has the full list.

---

## 6. DECISIONS MADE ON YOUR BEHALF

Full detail with cost-if-wrong is in
`.superpowers/sdd/IMPLEMENTATION_PLAN/progress.md` (kept, not deleted).

**Architecture**
- **AR1** — direct SQL via `pg` instead of the supabase-js query builder. Driver: no Docker meant
  supabase-js route handlers would have been *completely untestable* until you provisioned a cloud
  project — the whole migration would have shipped unverified.
- **AR3** — PGlite as the local test substrate.
- **AR5** — contract capture ran against a separate Mongo database, never your `zahzan_db`.

**Corrections to my own plan** (six defects traced to my instructions rather than the agents' work)
- **C1** table count; **C2** a test that would have read a file the same task deleted;
  **C3** golden files as shape reference rather than equality fixtures;
  **C8/C12** the `_id`/`id` rule — my blanket "always emit both" was factually wrong about your API;
  **C13** `dispatch()` had to await unconditionally; **"15 page files"** was actually 14.
- **C14** — CSP scoped to `/api` only. Applying it to HTML pages would have blocked Next's inline
  hydration scripts and **broken your entire site**, while also being a parity violation: your
  Express server never served the frontend, so no CSP ever reached a page.

**Withdrawn**
- I ruled the test routes should require `NODE_ENV !== 'production'`. **That was wrong** — the
  parity capture itself runs in production mode, so it would have broken verification. The routes
  were deleted instead.

---

## 7. STILL TO DO (your list)

- [ ] G1 — confirm proxy sets `x-forwarded-for` ⚠️ can take the API down on day one
- [ ] G2 — provision Supabase, apply schema, create buckets, re-run verification
- [ ] G3 — verify `tx()` under your pooling mode (use session/direct, not 6543)
- [ ] G4 — set the database timezone deliberately
- [ ] G5 — confirm `payment-proofs` bucket is private
- [ ] G6 — decide the fate of `server/`
- [ ] G7 — enable `pg_cron` for `purge_expired()`
- [ ] Set `FRONTEND_URL` before enabling email
- [ ] Decide on C16 (whitespace-only required fields)
- [ ] Decide whether to restore `RateLimit-*` response headers
- [ ] Two pre-existing bugs in your original code, reproduced faithfully and **not** fixed:
      `logout`'s revoke-all branch is dead code, and `login` 500s instead of 401 for social-only
      accounts. Fix separately if you want them fixed.
