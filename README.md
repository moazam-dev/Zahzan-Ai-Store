# ZAHZAN Store

ZAHZAN's storefront and admin panel: a luxury fashion e-commerce app with
product browsing, cart/wishlist, checkout with manual payment-proof
verification, an admin back office (orders/payments/products/customers/
newsletter/audit logs), and email notifications.

This is the **Next.js + Supabase (Postgres)** port of the original Express +
MongoDB application. The migration's binding rule was strict behavioural
parity: same routes, same JSON response shapes, same status codes, same
message strings — only the stack changed. See `docs/PARITY_REPORT.md` for the
full evidence trail, and `MIGRATION_PLAN.md` / `docs/IMPLEMENTATION_PLAN.md`
for the plan and rulings that got it there.

## Stack

- **Framework:** Next.js 16 (App Router), plain JavaScript.
- **Database:** Postgres, reached via direct parameterized SQL (`lib/db.js`)
  — not the `supabase-js` query builder. Production talks to Supabase's
  Postgres through the `pg` driver (`SUPABASE_DB_URL`); local
  tests/verification run against `@electric-sql/pglite`, an in-process WASM
  Postgres, selected via `ZAHZAN_DB_DRIVER=pglite`.
- **Storage:** Supabase Storage for product images and payment-proof
  uploads (`@supabase/supabase-js`, storage only), via `lib/storage.js`. A
  local in-process fake (`ZAHZAN_STORAGE_DRIVER=memory`) exists for tests
  only.
- **Auth:** JWT (`jsonwebtoken` + `bcryptjs`), byte-compatible with the
  original Express app's tokens (`lib/jwt.js`).
- **Email:** Resend, falling back to SMTP (`nodemailer`), falling back to a
  dev-log no-op when neither is configured (`lib/email.js`).

## Running it

1. Copy `.env.example` to `.env` and fill in real values. Read the comments
   on `ZAHZAN_DB_DRIVER` and `ZAHZAN_STORAGE_DRIVER` carefully before setting
   either in a real environment — both have a "silently drops data on
   restart" failure mode if misconfigured.
2. Install dependencies: `npm install`.
3. Apply the database schema in `supabase/migrations/0001_init.sql` to your
   Supabase project (SQL editor or your preferred migration runner).
4. Start the dev server: `npm run dev`.
5. Production build: `npm run build`, then `npm start`.

## Testing

```
npm test          # vitest run — full suite, once
npm run test:watch
```

Tests run against a PGlite in-memory Postgres instance (schema applied fresh
per test file) — no real Supabase project or network access is required.
`npm run build` additionally validates the whole route table compiles.

## `server/` — kept as the behavioural oracle, not a live service

The original Express + MongoDB application still lives under `server/`. It
is intentionally **not** wired into any `npm` script here (no `server` /
`server:dev`) — it is retained purely as a reference implementation to diff
new behaviour against, not something meant to run alongside this app. If you
need to run it standalone for comparison, `cd server && npm install && npm
start` (it has its own `package.json` and expects its own MongoDB + `.env`).

## Further reading

- [`docs/PARITY_REPORT.md`](./docs/PARITY_REPORT.md) — the final acceptance
  gate: endpoint-by-endpoint parity evidence against the original API,
  known accepted deviations, and what was never verified against a real
  Supabase project.
- [`docs/DATA_MIGRATION.md`](./docs/DATA_MIGRATION.md) — how to move data
  from the original MongoDB database into Postgres.
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — the
  binding global constraints and architecture rulings this migration was
  built against.
- [`docs/CONTRACT_CAPTURE.md`](./docs/CONTRACT_CAPTURE.md) — how the
  golden HTTP-contract baseline (`tools/golden/`) was captured and how to
  re-diff against it.
