# Data migration and seed scripts (Task 14)

Moves the ZAHZAN catalogue and admin account out of MongoDB (`zahzan_db`)
into Postgres (Supabase), and provides Postgres-native seed scripts for
fresh/dev environments. Scope is deliberately narrow, per the user's
decision recorded in `MIGRATION_PLAN.md`: **only products and admin users
migrate.** Orders, customers, carts and payments start clean in the new
system — they are not migrated by anything in this document.

All four scripts live in `tools/` and print a summary (`rows read,
inserted, updated, skipped`) on completion. All fail loudly (non-zero exit
code, error printed) on any constraint violation or unexpected shape,
rather than continuing silently.

## The single most important rule

`tools/migrate-products.mjs` and `tools/migrate-admins.mjs` open MongoDB
**strictly read-only**. Each issues only `.find({}).toArray()` calls
against `zahzan_db` and never an insert/update/delete/admin command. This
is the user's real, irreplaceable development data — treat any script that
writes to Mongo as a failure regardless of what else it does correctly.

## Order of operations

Run these in order. Each is idempotent — re-running is always safe.

### 1. Migrate real data out of MongoDB (production/real-data path)

```bash
# Preview only -- reads Mongo, maps every document, writes NOTHING to
# Postgres (not even inside a rolled-back transaction). Safe to run
# against the live zahzan_db at any time.
node tools/migrate-products.mjs --dry-run

# Real run.
node tools/migrate-products.mjs

node tools/migrate-admins.mjs
```

Required environment variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `MONGO_MIGRATION_URI` (or `MONGODB_URI`) | both `migrate-*` scripts | Source Mongo connection string. Defaults to `mongodb://localhost:27017/zahzan_db` if unset. |
| `SUPABASE_DB_URL` | both `migrate-*` scripts (skipped entirely in `--dry-run`, which never opens a Postgres connection) | Target Postgres connection string, read by `lib/db.js`'s `pg` driver. |

Optional flags:

- `--dry-run` (`migrate-products.mjs` only) — maps and counts every Mongo
  document, but performs zero Postgres writes. Use this first against real
  data to confirm the script understands its shape before touching
  Postgres.
- `--mongo-uri <uri>` — overrides the source Mongo connection string on
  either script.

**`migrate-products.mjs`** copies every document in Mongo's `products`
collection into the Postgres `products` table (`supabase/migrations/
0001_init.sql`). Maps every field; flattens `images`, `sizes`,
`careInstructions` and `gallery` to `text[]`; maps `colors` and
`breakdown` to `jsonb`; preserves `slug`, `sku` and `createdAt` from the
source document. Idempotent by `slug` (`insert ... on conflict (slug) do
update`) — re-running updates existing rows instead of duplicating them.
Applies GC7 (`sku` uppercased on write; Mongoose did this automatically,
Postgres does not). Writes `tools/migration-idmap.json`:

```json
{ "products": { "<old Mongo _id hex>": "<new Postgres uuid>", "...": "..." } }
```

**`migrate-admins.mjs`** copies every Mongo `users` document with
`role: 'admin'` into the Postgres `users` table, plus its matching
`adminusers` metadata document into `admin_users`. The bcrypt password
hash is copied **verbatim, never re-hashed** — this is what keeps existing
admin logins working with no password reset. Idempotent by email
(`insert ... on conflict (lower(email)) do update`, matching the
`users_email_lower_idx` unique index Task 3 created). Applies GC7 (`email`
lowercased and trimmed on write).

### 2. Seed a fresh/dev environment (no real data involved)

Use these instead of the migrate scripts when standing up a new
environment that has no real MongoDB data to carry over — a local dev
database, a CI database, a fresh Supabase project. They are Postgres
equivalents of `server/scripts/seedProducts.js` and
`server/scripts/seedAdmin.js`, with the same literal data and the same
behaviour (`seed-products.mjs` wipes and reseeds all 6 products
unconditionally, exactly like the source's `deleteMany({})` +
`insertMany(...)`; `seed-admin.mjs` creates-if-missing / promotes-role-if-
present, exactly like the source).

```bash
node tools/seed-products.mjs
node tools/seed-admin.mjs
```

Required/optional environment variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_DB_URL` | both `seed-*` scripts | Target Postgres connection string. |
| `ADMIN_EMAIL` | `seed-admin.mjs` | Defaults to `admin@zahzan.com`. |
| `ADMIN_PASSWORD` | `seed-admin.mjs` | Defaults to `AdminZahzan2026!`. Hashed with `bcrypt` (10 rounds) before insert, matching the source's Mongoose pre-save hook. |

`seed-products.mjs` does **not** take `--dry-run` — unlike the migrate
scripts, it is meant to run only against fresh/dev/test databases that
have no real data at risk.

### Testing against PGlite

`ZAHZAN_DB_DRIVER=pglite` selects the in-process PGlite driver instead of
`pg` in `lib/db.js`, for anyone who wants to run these scripts by hand
against a throwaway in-memory database rather than a real Supabase
instance. `test/migrate.test.js` exercises the same underlying
`migrateProducts` / `migrateAdmins` functions directly against PGlite with
fixture documents, and needs no live Mongo or Postgres connection at all.
