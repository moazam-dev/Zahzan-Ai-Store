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

### MongoDB safety: defence in depth

Two independent layers protect `zahzan_db`, and they guarantee different
things:

1. **The code**: neither script contains a mutating Mongo call anywhere,
   including in error handlers, and both use the raw `mongodb` driver
   (never Mongoose), so there is no ODM `.save()` path that could
   accidentally fire. Both also open their `MongoClient` with
   `readPreference: 'secondaryPreferred'`, which routes reads toward a
   secondary when the source is a replica set. **Be clear about what this
   is**: it is a read-routing hint, not a write barrier — it has no effect
   at all against a single-node standalone (the default local
   `mongodb://localhost:27017` dev setup has no secondary), and nothing
   stops a determined mutating call from reaching the primary regardless of
   this setting. **Warning if this is ever pointed at a real replica set**:
   `secondaryPreferred` can serve reads from a lagging secondary, so a
   migration run immediately after a write to the primary could read
   stale/missing data — harmless here only because the source is a
   single-node standalone with no replication lag to be exposed to.
2. **The credential (recommended)**: the guarantee that actually matters is
   running these scripts with a MongoDB user that holds only the `read`
   role on `zahzan_db` (not `readWrite`), via `MONGO_MIGRATION_URI`. With a
   read-only credential, a bug that somehow introduced a write would fail
   with a permissions error instead of silently succeeding — turning "we
   reviewed the code carefully" into "the database itself refuses." This
   costs one `db.createUser(...)` / connection-string change and is the
   single highest-leverage safety measure available for this task.

## Order of operations

Run these in order. Each is idempotent — re-running is always safe.

### 1. Migrate real data out of MongoDB (production/real-data path)

```bash
# Step 1 (recommended first): preview the PRODUCT migration -- reads Mongo,
# maps every document, writes NOTHING to Postgres (not even inside a
# rolled-back transaction). Safe to run against the live zahzan_db at any
# time.
node tools/migrate-products.mjs --dry-run

# Step 2 (recommended, NOT optional in practice): preview the ADMIN
# migration the same way, BEFORE running it for real. This is the
# higher-stakes of the two migrations -- a mis-mapped admin document can
# lock the user out of their own admin panel, with no undo once the real
# run has committed. Skipping this step to save a minute is how that
# happens.
node tools/migrate-admins.mjs --dry-run

# Step 3: real product migration.
node tools/migrate-products.mjs

# Step 4: real admin migration. Only run this after step 2's dry-run
# summary looks right.
node tools/migrate-admins.mjs
```

Required environment variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `MONGO_MIGRATION_URI` (or `MONGODB_URI`) | both `migrate-*` scripts | Source Mongo connection string. Defaults to `mongodb://localhost:27017/zahzan_db` if unset. |
| `SUPABASE_DB_URL` | both `migrate-*` scripts (skipped entirely in `--dry-run`, which never opens a Postgres connection) | Target Postgres connection string, read by `lib/db.js`'s `pg` driver. |

Optional flags:

- `--dry-run` (**both** `migrate-products.mjs` and `migrate-admins.mjs`) —
  maps and counts every Mongo document, but performs zero Postgres writes.
  Use this first against real data to confirm the script understands its
  shape before touching Postgres — see the "Order of operations" steps
  above, which show both dry runs happening before either real run.
- `--mongo-uri <uri>` — overrides the source Mongo connection string on
  either script.

**`migrate-products.mjs`** copies every document in Mongo's `products`
collection into the Postgres `products` table (`supabase/migrations/
0001_init.sql`). Maps every field; flattens `images`, `sizes`,
`careInstructions` and `gallery` to `text[]`; maps `colors` and
`breakdown` to `jsonb`; preserves `slug`, `sku` and `createdAt` from the
source document. Idempotent by `slug` (`insert ... on conflict (slug) do
update`) — re-running updates existing rows instead of duplicating them. A
real run's writes are wrapped in a single Postgres transaction
(`lib/db.js`'s `tx()`), so a constraint violation partway through a
multi-document run rolls back every row from that run rather than leaving
a partial catalogue. Applies GC7 (`sku` uppercased on write; Mongoose did
this automatically, Postgres does not). Writes `tools/migration-idmap.json`:

```json
{ "products": { "<old Mongo _id hex>": "<new Postgres uuid>", "...": "..." } }
```

**`migrate-admins.mjs`** copies every Mongo `users` document with
`role: 'admin'` into the Postgres `users` table, plus its matching
`adminusers` metadata document into `admin_users`. The bcrypt password
hash is copied **verbatim, never re-hashed** — this is what keeps existing
admin logins working with no password reset. Idempotent by email
(`insert ... on conflict (lower(email)) do update`, matching the
`users_email_lower_idx` unique index Task 3 created). A real run's writes
— both the `users` and `admin_users` rows, across every admin document —
are wrapped in a single Postgres transaction (`lib/db.js`'s `tx()`), so a
constraint violation partway through leaves the admin tables exactly as
they were before the run started, rather than some admins migrated and
others not. Applies GC7 (`email` lowercased and trimmed on write).

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
