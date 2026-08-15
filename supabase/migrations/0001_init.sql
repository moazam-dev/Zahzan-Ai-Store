-- 0001_init.sql
-- Task 3: the complete Postgres schema, applied identically to Supabase and
-- to PGlite (test/helpers/db.js applies this same file to a fresh in-memory
-- PGlite instance for every test run -- AR3).
--
-- Nineteen tables: sixteen mirror the Mongoose models in server/models/
-- one-for-one; three are introduced by this migration itself because their
-- Mongo shape (an embedded array, or an in-memory rate limiter) doesn't
-- survive the move to Postgres as-is: cart_items, wishlist_items, and
-- rate_limits (see MIGRATION_PLAN.md sec5.2 and sec7.5).
--
-- Conventions (task-3-brief.md):
--   - id uuid primary key default gen_random_uuid() on every table.
--     gen_random_uuid() is core in Postgres 13+ -- do NOT `create extension
--     pgcrypto`, which PGlite rejects.
--   - snake_case columns; created_at / updated_at timestamptz not null
--     default now() on every table Mongoose gave `timestamps: true`, kept
--     current by the shared set_updated_at() trigger below.
--   - Enum-like columns are `text` + CHECK, not Postgres `enum` types, so
--     the exact current values (including the spaced ones, 'Cash on
--     Delivery' and 'Bank Transfer') stay editable without a type
--     migration. Defaults match the Mongoose defaults exactly.
--
-- Out of scope here (task-3-brief.md): create_order, cancel_order,
-- check_rate_limit, admin_dashboard_stats -- those ship with their
-- consumers in Tasks 5, 11 and 13. Task 5 appends check_rate_limit to the
-- END of this same file (see the note above the rate_limits table).

-- ---------------------------------------------------------------------------
-- Shared trigger: replicates Mongoose's `timestamps: true` updated_at
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. users  (server/models/User.js)
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  password text,
  auth_provider text not null default 'local'
    check (auth_provider in ('local', 'google', 'facebook')),
  google_id text not null default '',
  facebook_id text not null default '',
  phone text not null default '',
  role text not null default 'customer'
    check (role in ('customer', 'admin')),
  is_email_verified boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mongo lowercases email on write; keep lowercasing on write (application
-- layer, GC7-equivalent) AND enforce it here so a case-varied duplicate can
-- never slip in even if the write path ever forgets to lowercase.
create unique index users_email_lower_idx on users (lower(email));

create trigger set_updated_at_users
before update on users
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. products  (server/models/Product.js)
-- ---------------------------------------------------------------------------

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sku text not null,
  description text not null default '',
  quick_description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) check (original_price >= 0),
  category text not null,
  badge text,
  -- Embedded-document mapping (MIGRATION_PLAN.md sec5.2): ordered, never
  -- queried individually -> text[].
  images text[] not null default '{}',
  image text,
  hover_image text,
  -- Fixed-shape {name, hex, image}[], rendered whole -> jsonb.
  colors jsonb not null default '[]'::jsonb,
  color text,
  sizes text[] not null default '{}',
  fabric text,
  work text,
  -- {shirt, trouser, dupatta}, optional subdocument -> jsonb.
  breakdown jsonb,
  model_info text,
  care_instructions text[] not null default '{}',
  gallery text[] not null default '{}',
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_slug_idx on products (slug);
create unique index products_sku_idx on products (sku);
-- Explicitly listed in task-3-brief.md's "Constraints and indexes" section
-- (admin product list filters on both).
create index products_category_idx on products (category);
create index products_is_active_idx on products (is_active);

create trigger set_updated_at_products
before update on products
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. orders  (server/models/Order.js, server/models/OrderItem.js)
-- ---------------------------------------------------------------------------

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  user_id uuid not null references users (id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  -- Deliberate (MIGRATION_PLAN.md sec5.2): immutable price/name snapshots
  -- taken at checkout, never joined or aggregated. jsonb preserves the
  -- exact array shape the UI reads; do not normalise into an order_items
  -- table.
  items jsonb not null,
  -- Already `_id: false` embedded in Mongoose -- a pure snapshot.
  shipping_address jsonb not null,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  total numeric(12, 2) not null check (total >= 0),
  payment_method text not null default 'Cash on Delivery'
    check (payment_method in ('Cash on Delivery', 'JazzCash', 'Easypaisa', 'Bank Transfer')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'submitted', 'verified', 'rejected', 'not_required')),
  order_status text not null default 'Pending'
    check (order_status in ('Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index orders_order_number_idx on orders (order_number);
-- Explicit in task-3-brief.md's index list.
create index orders_created_at_idx on orders (created_at);
create index orders_order_status_idx on orders (order_status);
-- Mongoose had `index: true` on userId -- "my orders" is the single most
-- frequent order query in the app.
create index orders_user_id_idx on orders (user_id);

create trigger set_updated_at_orders
before update on orders
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. carts  (server/models/Cart.js)
-- ---------------------------------------------------------------------------

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index carts_user_id_idx on carts (user_id);

create trigger set_updated_at_carts
before update on carts
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4a. cart_items  (Mongoose: Cart.items[], cartItemSchema -- MUST be a real
-- table: each item's _id is returned as cartItemId and used directly in
-- the URL PATCH/DELETE /api/cart/items/:id, so it needs a stable,
-- addressable PK. cartItemSchema itself had `timestamps: true`.)
-- ---------------------------------------------------------------------------

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1),
  selected_size text not null default 'M',
  selected_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cart_items_cart_id_idx on cart_items (cart_id);

create trigger set_updated_at_cart_items
before update on cart_items
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. payments  (server/models/Payment.js)
-- ---------------------------------------------------------------------------

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id),
  user_id uuid not null references users (id),
  payment_method text not null
    check (payment_method in ('JazzCash', 'Easypaisa', 'Bank Transfer')),
  amount numeric(12, 2) not null check (amount >= 0),
  transaction_reference text not null,
  proof_url text not null,
  proof_public_id text not null default '',
  status text not null default 'Pending'
    check (status in ('Pending', 'Verified', 'Rejected')),
  rejection_reason text not null default '',
  verified_by uuid references users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Both explicit in task-3-brief.md's index list.
create index payments_order_id_idx on payments (order_id);
create index payments_status_idx on payments (status);
-- Mongoose had `index: true` on both.
create index payments_user_id_idx on payments (user_id);
create index payments_transaction_reference_idx on payments (transaction_reference);

create trigger set_updated_at_payments
before update on payments
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. addresses  (server/models/Address.js)
-- ---------------------------------------------------------------------------

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  full_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text not null default '',
  city text not null,
  province text not null,
  postal_code text not null,
  country text not null default 'Pakistan',
  label text not null default 'Home',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index addresses_user_id_idx on addresses (user_id);

create trigger set_updated_at_addresses
before update on addresses
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. refresh_tokens  (server/models/RefreshToken.js) -- one of the four TTL
-- token tables (MIGRATION_PLAN.md sec5.3); Postgres has no TTL index
-- equivalent, so every read must filter `where expires_at > now()` (that
-- filter is the actual security boundary) and purge_expired() below does
-- periodic housekeeping only.
-- ---------------------------------------------------------------------------

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  -- NOT unique: Mongoose only ever declared `index: true` on this field,
  -- unlike the other three token tables below, which declared `unique:
  -- true`. Preserved exactly, not "fixed".
  token text not null,
  device_info text not null default '',
  ip_address text not null default '',
  is_revoked boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index refresh_tokens_user_id_idx on refresh_tokens (user_id);
create index refresh_tokens_token_idx on refresh_tokens (token);
create index refresh_tokens_expires_at_idx on refresh_tokens (expires_at);

create trigger set_updated_at_refresh_tokens
before update on refresh_tokens
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. password_reset_tokens  (server/models/PasswordResetToken.js) -- TTL
-- token table.
-- ---------------------------------------------------------------------------

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  token text not null unique,
  is_used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index password_reset_tokens_user_id_idx on password_reset_tokens (user_id);
create index password_reset_tokens_expires_at_idx on password_reset_tokens (expires_at);

create trigger set_updated_at_password_reset_tokens
before update on password_reset_tokens
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. email_change_tokens  (server/models/EmailChangeToken.js) -- TTL token
-- table.
-- ---------------------------------------------------------------------------

create table email_change_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  new_email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_change_tokens_user_id_idx on email_change_tokens (user_id);
create index email_change_tokens_expires_at_idx on email_change_tokens (expires_at);

create trigger set_updated_at_email_change_tokens
before update on email_change_tokens
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. verification_tokens  (server/models/VerificationToken.js) -- TTL
-- token table.
-- ---------------------------------------------------------------------------

create table verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index verification_tokens_user_id_idx on verification_tokens (user_id);
create index verification_tokens_expires_at_idx on verification_tokens (expires_at);

create trigger set_updated_at_verification_tokens
before update on verification_tokens
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. newsletter_subscribers  (server/models/NewsletterSubscriber.js)
-- ---------------------------------------------------------------------------

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed')),
  source text not null default 'footer',
  unsubscribe_token text,
  user_id uuid references users (id),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index newsletter_subscribers_email_idx on newsletter_subscribers (email);
-- Mongo `unique: true, sparse: true` -> a partial unique index: multiple
-- NULLs are fine, a duplicate non-null value is rejected.
create unique index newsletter_subscribers_unsubscribe_token_idx
  on newsletter_subscribers (unsubscribe_token)
  where unsubscribe_token is not null;
create index newsletter_subscribers_status_idx on newsletter_subscribers (status);
create index newsletter_subscribers_subscribed_at_idx on newsletter_subscribers (subscribed_at);

create trigger set_updated_at_newsletter_subscribers
before update on newsletter_subscribers
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. audit_logs  (server/models/AuditLog.js)
-- ---------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references users (id),
  action text not null,
  entity text not null,
  entity_id text not null default '',
  ip_address text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Both explicit in task-3-brief.md's index list.
create index audit_logs_action_idx on audit_logs (action);
create index audit_logs_admin_id_idx on audit_logs (admin_id);

create trigger set_updated_at_audit_logs
before update on audit_logs
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. admin_users  (server/models/AdminUser.js)
-- ---------------------------------------------------------------------------

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  permissions text[] not null default '{}',
  department text not null default 'Management',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index admin_users_user_id_idx on admin_users (user_id);

create trigger set_updated_at_admin_users
before update on admin_users
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 14. notifications  (server/models/Notification.js)
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_user_id_idx on notifications (user_id);

create trigger set_updated_at_notifications
before update on notifications
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 15. story_submissions  (server/models/StorySubmission.js)
-- ---------------------------------------------------------------------------

create table story_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id),
  name text not null,
  username text not null default '',
  image text not null,
  caption text not null default '',
  rating integer check (rating >= 1 and rating <= 5),
  -- on delete cascade: Task 13 controller ruling. Both stub tables' FKs
  -- to products used to be plain (RESTRICT) references, which would block
  -- DELETE /api/admin/products/:id?permanent=true with a 23503
  -- foreign-key-violation where the old Mongo app always returned 200 --
  -- the same reasoning Ruling C15 already applied to cart_items and
  -- wishlist_items above. Both tables are unreachable today (their own
  -- endpoints are permanent 501 stubs -- GC4, MIGRATION_PLAN.md sec6.2 item
  -- 11), so the practical risk was nil, but the trap was real and latent;
  -- closed here since Task 13 owns the permanent-delete endpoint. Proven by
  -- test/api/admin.test.js's four-way cascade test (story_submissions,
  -- tryon_jobs, cart_items, wishlist_items all referencing one product at
  -- once).
  product_id uuid references products (id) on delete cascade,
  color text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index story_submissions_status_idx on story_submissions (status);

create trigger set_updated_at_story_submissions
before update on story_submissions
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 16. tryon_jobs  (server/models/TryOnJob.js)
-- ---------------------------------------------------------------------------

create table tryon_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  -- on delete cascade: see the identical comment on story_submissions.product_id
  -- above -- same Task 13 controller ruling, same reasoning.
  product_id uuid references products (id) on delete cascade,
  color text not null default '',
  input_image text not null,
  output_image text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  error text not null default '',
  completed_at timestamptz,
  -- Plain nullable field in Mongoose (no TTL index declared on it, unlike
  -- the four dedicated token tables above) -- NOT one of purge_expired()'s
  -- targets.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tryon_jobs_user_id_idx on tryon_jobs (user_id);

create trigger set_updated_at_tryon_jobs
before update on tryon_jobs
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. wishlist_items  (Mongoose: User.wishlist[], a bare ObjectId array with
-- no subdocument schema of its own -> join table (user_id, product_id)
-- with a unique pair constraint, MIGRATION_PLAN.md sec5.2. `created_at` is
-- new here -- Mongoose had no timestamps on individual wishlist entries --
-- added specifically so reads can `order by created_at` to preserve
-- insertion order, per the same spec section. No updated_at/trigger: a
-- wishlist entry is only ever inserted or deleted, never updated in place.)
-- ---------------------------------------------------------------------------

create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index wishlist_items_user_id_idx on wishlist_items (user_id);

-- ---------------------------------------------------------------------------
-- 18. rate_limits  (new: replaces express-rate-limit's in-memory counters,
-- which cannot survive ephemeral, horizontally-scaled serverless functions
-- -- MIGRATION_PLAN.md sec7.5. Shape is exactly what that section
-- specifies: (key, window_start, count). `key` carries its own explicit
-- unique constraint (rather than being the primary key outright) so the
-- table still follows the "id uuid primary key on every table" convention
-- while still giving Task 5's atomic upsert function a clean
-- `ON CONFLICT (key)` target. No created_at/updated_at: this is pure
-- counter state, not an entity with its own lifecycle -- `window_start` is
-- its only meaningful timestamp.
--
-- Task 5 appends `check_rate_limit(p_key, p_max, p_window_seconds)` to the
-- end of this file; it is explicitly out of scope for Task 3.)
-- ---------------------------------------------------------------------------

create table rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- ---------------------------------------------------------------------------
-- purge_expired(): deletes rows past expires_at from the four TTL token
-- tables and returns the total number of rows deleted. Housekeeping only
-- -- see the note on refresh_tokens above: the security boundary is every
-- read filtering `where expires_at > now()`, not this function.
-- ---------------------------------------------------------------------------

create or replace function purge_expired()
returns integer
language plpgsql
as $$
declare
  total_deleted integer := 0;
  batch_deleted integer;
begin
  delete from refresh_tokens where expires_at < now();
  get diagnostics batch_deleted = row_count;
  total_deleted := total_deleted + batch_deleted;

  delete from password_reset_tokens where expires_at < now();
  get diagnostics batch_deleted = row_count;
  total_deleted := total_deleted + batch_deleted;

  delete from email_change_tokens where expires_at < now();
  get diagnostics batch_deleted = row_count;
  total_deleted := total_deleted + batch_deleted;

  delete from verification_tokens where expires_at < now();
  get diagnostics batch_deleted = row_count;
  total_deleted := total_deleted + batch_deleted;

  return total_deleted;
end;
$$;

-- pg_cron is unavailable in PGlite (and not yet provisioned on the target
-- Supabase project either -- no SUPABASE_* credentials exist at the time
-- this migration was written). This is commented out, not executed; the
-- expires_at filter on every read is what actually guarantees correctness,
-- as noted above. Uncomment once pg_cron is available on the real project.
--
-- select cron.schedule('purge-expired', '*/15 * * * *', $$select purge_expired()$$);

-- ---------------------------------------------------------------------------
-- RLS (MIGRATION_PLAN.md sec5.5): enabled on every table, with NO permissive
-- policies. All access goes through Next.js route handlers using the
-- service_role key, which bypasses RLS -- with the "keep our own JWT"
-- decision there is no auth.uid() for a policy to key off, so RLS cannot be
-- the security layer here; the protect/requireAdmin checks in the route
-- handlers are. Enabling RLS with zero policies means a leaked anon key
-- grants nothing at all.
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table payments enable row level security;
alter table addresses enable row level security;
alter table refresh_tokens enable row level security;
alter table password_reset_tokens enable row level security;
alter table email_change_tokens enable row level security;
alter table verification_tokens enable row level security;
alter table newsletter_subscribers enable row level security;
alter table audit_logs enable row level security;
alter table admin_users enable row level security;
alter table notifications enable row level security;
alter table story_submissions enable row level security;
alter table tryon_jobs enable row level security;
alter table wishlist_items enable row level security;
alter table rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- check_rate_limit(p_key, p_max, p_window_seconds): Task 5.
-- server/middleware/rateLimiter.js + the apiLimiter block in
-- server/server.js are express-rate-limit, which is in-memory per Express
-- process -- there is no equivalent that survives ephemeral, horizontally-
-- scaled serverless functions (MIGRATION_PLAN.md sec7.5). Replaced with
-- this table + an atomic upsert-and-increment function.
--
-- Single statement (INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING),
-- so it is atomic under concurrent callers hitting the same key -- no
-- separate read-then-write race window. Returns true when the caller is
-- OVER the limit (the count captured by RETURNING, after this call's own
-- increment, exceeds p_max), false otherwise. When the existing window has
-- expired (window_start + p_window_seconds < now()), the window resets:
-- window_start moves to now() and count restarts at 1 for this call.
-- ---------------------------------------------------------------------------

create or replace function check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case
      when rate_limits.window_start + (p_window_seconds || ' seconds')::interval < now()
        then now()
      else rate_limits.window_start
    end,
    count = case
      when rate_limits.window_start + (p_window_seconds || ' seconds')::interval < now()
        then 1
      else rate_limits.count + 1
    end
  returning count into v_count;

  return v_count > p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task 11 (task-11-brief.md): order_number_counters + next_order_number() /
-- create_order() / cancel_order() -- the atomic checkout path
-- (MIGRATION_PLAN.md sec8.2/sec8.3).
--
-- next_order_number(): the source's generateOrderNumber()
-- (server/controllers/orderController.js) does a read-latest-then-increment
-- with NO lock -- two concurrent checkouts on the same day can both read the
-- same "latest" order and mint the SAME orderNumber, colliding on the
-- orders_order_number_idx unique index. Sanctioned fix (spec sec8.2, not
-- scope creep): a per-day counter table plus a single atomic
-- INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING statement -- the exact
-- same proven pattern check_rate_limit() above already uses for the
-- identical reason (a single statement is inherently race-free; Postgres
-- serializes concurrent INSERT ... ON CONFLICT callers on the same key via
-- the unique index's row lock, no explicit advisory lock needed). The
-- OUTPUT FORMAT is unchanged: ZHZ-YYYYMMDD-XXXX, a 4-digit zero-padded
-- sequence that resets to 1 at midnight (a new day_key starts a new counter
-- row).
-- ---------------------------------------------------------------------------

create table order_number_counters (
  day_key text primary key,
  seq integer not null default 0
);

alter table order_number_counters enable row level security;

create or replace function next_order_number()
returns text
language plpgsql
as $$
declare
  v_day_key text := to_char(now() at time zone 'utc', 'YYYYMMDD');
  v_seq integer;
begin
  insert into order_number_counters (day_key, seq)
  values (v_day_key, 1)
  on conflict (day_key) do update set seq = order_number_counters.seq + 1
  returning seq into v_seq;

  return 'ZHZ-' || v_day_key || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order(...): the source's createOrder does stock validation, the
-- order insert, the optional payment insert, the stock-decrement loop and
-- the cart-clear as separate, unguarded Mongoose calls with no transaction
-- -- a crash or thrown error between any two of them (e.g. after
-- Order.create but before the stock-decrement loop finishes) leaves
-- inventory permanently wrong with no rollback (spec sec8.3). Folding all of
-- it into one plpgsql function makes it atomic for free: a single
-- `select create_order(...)` is exactly one Postgres statement, and Postgres
-- always rolls back every effect of a failed statement -- including
-- everything a function it calls did internally -- automatically. No
-- explicit BEGIN/COMMIT is needed here, and lib/db.js's plain `query()`
-- (autocommit) is sufficient, specifically because the entire operation is
-- one statement from the driver's point of view.
--
-- `select ... for update` on each product row makes that product's stock
-- CHECK and its stock DECREMENT part of one lock hold, closing the classic
-- check-then-decrement race between two concurrent checkouts on the same
-- product: a second overlapping call blocks on the row lock until the
-- first's statement finishes (commits or rolls back), then reads the
-- already-updated stock.
--
-- RAISEs the source's exact validation message strings so the route handler
-- (app/api/orders/route.js) can pattern-match them back to the right HTTP
-- status (404 for "is not available", 400 for "Insufficient stock" / "Your
-- cart is empty") -- anything else it doesn't recognise falls through to
-- that handler's generic `Failed to create order: <message>` 500, matching
-- the source's own outer catch-all exactly.
--
-- p_items: jsonb array of {productId, quantity, selectedSize, selectedColor}
-- -- already resolved by the route handler (the single buyNowItem, or the
-- user's cart_items rows) exactly like the source's itemsToProcess. Price,
-- product name, sku and image are NEVER taken from this input -- they are
-- read from the locked, authoritative products row, matching
-- orderController.js's explicit "NEVER trust client price" comment. Each
-- item's own _id/createdAt/updatedAt/id are minted fresh here, reproducing
-- OrderItem.js's `timestamps: true` + toJSON id-transform behaviour that
-- lib/serialize.js's serializeOrder (a pure jsonb pass-through for `items`)
-- deliberately does not -- see that function's JSDoc.
-- ---------------------------------------------------------------------------

create or replace function create_order(
  p_user_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_items jsonb,
  p_shipping_address jsonb,
  p_is_buy_now boolean,
  p_payment_method text,
  p_payment_status text,
  p_is_cod boolean,
  p_transaction_reference text,
  p_proof_url text,
  p_proof_public_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_product products%rowtype;
  v_qty integer;
  v_selected_size text;
  v_selected_color text;
  v_unit_price numeric(12, 2);
  v_item_total numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_shipping_cost numeric(12, 2);
  v_total numeric(12, 2);
  v_order_items jsonb := '[]'::jsonb;
  v_order_number text;
  v_order_id uuid;
  v_payment_id uuid := null;
  v_now timestamptz := now();
  v_now_iso text;
  v_item_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty. Cannot process order.';
  end if;

  -- Matches Mongoose's Date -> JSON.stringify() output (`.toISOString()`):
  -- always millisecond precision, always Z-suffixed UTC -- see
  -- lib/serialize.js's toIso() header comment for the same requirement.
  v_now_iso := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item ->> 'productId')::uuid for update;

    if not found or v_product.is_active is not true then
      raise exception 'Product "%" is not available.', (v_item ->> 'productId');
    end if;

    v_qty := (v_item ->> 'quantity')::integer;

    if v_qty > v_product.stock then
      raise exception 'Insufficient stock for "%". Available stock is %, but % was requested.',
        v_product.name, v_product.stock, v_qty;
    end if;

    -- selectedSize's 'M' fallback is already applied by the route handler
    -- (pure JS, no DB access needed -- source: `item.selectedSize || 'M'`).
    -- selectedColor's fallback DOES need the product row (source:
    -- `itemReq.selectedColor || product.color || ''`), so it stays here.
    v_selected_size := coalesce(nullif(v_item ->> 'selectedSize', ''), 'M');
    v_selected_color := coalesce(nullif(v_item ->> 'selectedColor', ''), v_product.color, '');
    v_unit_price := v_product.price;
    v_item_total := v_unit_price * v_qty;
    v_subtotal := v_subtotal + v_item_total;
    v_item_id := gen_random_uuid();

    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'productName', v_product.name,
      'sku', coalesce(v_product.sku, ''),
      'image', coalesce(v_product.images[1], v_product.image, ''),
      'color', v_selected_color,
      'size', v_selected_size,
      'quantity', v_qty,
      'unitPrice', v_unit_price,
      'totalPrice', v_item_total,
      '_id', v_item_id,
      'createdAt', v_now_iso,
      'updatedAt', v_now_iso,
      'id', v_item_id
    ));

    update products set stock = stock - v_qty where id = v_product.id;
  end loop;

  -- Shipping: subtotal >= 20000 ? 0 : 250 (orderController.js:227) -- free
  -- AT exactly 20000, not above it.
  v_shipping_cost := case when v_subtotal >= 20000 then 0 else 250 end;
  v_total := v_subtotal + v_shipping_cost;
  v_order_number := next_order_number();

  insert into orders (
    order_number, user_id, customer_name, customer_email, customer_phone,
    items, shipping_address, subtotal, shipping_cost, total,
    payment_method, payment_status, order_status
  ) values (
    v_order_number, p_user_id, p_customer_name, p_customer_email, p_customer_phone,
    v_order_items, p_shipping_address, v_subtotal, v_shipping_cost, v_total,
    p_payment_method, p_payment_status, 'Pending'
  ) returning id into v_order_id;

  if not p_is_cod then
    insert into payments (
      order_id, user_id, payment_method, amount, transaction_reference,
      proof_url, proof_public_id, status
    ) values (
      v_order_id, p_user_id, p_payment_method, v_total, p_transaction_reference,
      p_proof_url, coalesce(p_proof_public_id, ''), 'Pending'
    ) returning id into v_payment_id;
  end if;

  if not p_is_buy_now then
    delete from cart_items where cart_id in (select id from carts where user_id = p_user_id);
  end if;

  return jsonb_build_object('orderId', v_order_id, 'paymentId', v_payment_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_order(...): the source's cancelOrder saves the status change and
-- then restores stock in a second, separate, unguarded loop -- a crash
-- between the two also corrupts inventory (spec sec8.3, same rationale as
-- create_order above). `select ... for update` on the order row makes the
-- status re-check and the status write atomic against a second concurrent
-- cancel call racing on the SAME order: only one of two overlapping cancels
-- can observe "Pending"/"Confirmed" and succeed; the other blocks on the row
-- lock, then sees the now-"Cancelled" row and raises -- the ordinary
-- "cancelling twice" 400 case the source already produces, just made
-- race-safe too.
-- ---------------------------------------------------------------------------

create or replace function cancel_order(p_order_id uuid)
returns orders
language plpgsql
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
begin
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if lower(v_order.order_status) not in ('pending', 'confirmed') then
    raise exception 'Order cannot be cancelled because it is already in "%" status.', v_order.order_status;
  end if;

  update orders set order_status = 'Cancelled' where id = p_order_id;

  for v_item in select * from jsonb_array_elements(v_order.items)
  loop
    if (v_item ? 'productId') and (v_item ->> 'productId') is not null then
      update products set stock = stock + (v_item ->> 'quantity')::integer
      where id = (v_item ->> 'productId')::uuid;
    end if;
  end loop;

  select * into v_order from orders where id = p_order_id;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_dashboard_stats(): Task 13 (task-13-brief.md). Replaces
-- getAdminDashboardStats's THIRTEEN sequential Mongoose queries plus two
-- aggregations with one round trip, returning a single jsonb blob that
-- app/api/admin/dashboard/route.js reshapes into the exact nested `stats`
-- envelope (spec sec6.4) -- this function does NOT itself build that final
-- shape; the JS partition of lowStockProducts into lowStockCount
-- (stock > 0) / outOfStockCount (stock === 0) explicitly stays in the route
-- handler, matching the source's own JS-side `.filter(...)` calls exactly
-- (task-13-brief.md is explicit that this split happens in JS, not SQL).
--
-- Every nested array below is built via `to_jsonb(t)` over a `select <cols>
-- from <table> ...` subquery, so each element lands as a plain object with
-- the SAME snake_case column names a raw table row would have -- directly
-- compatible with lib/serialize.js's row-shaped serializers
-- (serializeOrder, serializeDashboardRecentCustomer,
-- serializeDashboardLowStockProduct), not a bespoke camelCase shape assembled
-- in SQL. recentOrders/recentCustomers/lowStockProducts select exactly the
-- source's own `.select(...)` field lists (getAdminDashboardStats:
-- `.select('firstName lastName email createdAt phone')` for recentCustomers,
-- `.select('name sku price stock image images category')` for
-- lowStockProducts) plus `id` (always present on a Postgres row regardless
-- of a Mongoose select string, matching `_id`'s own always-present
-- behaviour) -- recentOrders selects every column since the source's
-- `Order.find().sort().limit(5)` applies no select at all.
-- ---------------------------------------------------------------------------

create or replace function admin_dashboard_stats()
returns jsonb
language plpgsql
as $$
declare
  v_orders jsonb;
  v_revenue numeric(12, 2);
  v_customers_total integer;
  v_recent_customers jsonb;
  v_total_products integer;
  v_low_stock jsonb;
  v_total_subscribers integer;
  v_payments_pending integer;
  v_payments_verified integer;
  v_payments_rejected integer;
  v_verified_amount numeric(12, 2);
  v_recent_orders jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where order_status = 'Pending'),
    'confirmed', count(*) filter (where order_status = 'Confirmed'),
    'processing', count(*) filter (where order_status = 'Processing'),
    'shipped', count(*) filter (where order_status = 'Shipped'),
    'delivered', count(*) filter (where order_status = 'Delivered'),
    'cancelled', count(*) filter (where order_status = 'Cancelled')
  ) into v_orders
  from orders;

  -- Mirrors the source's Order.aggregate $match orderStatus $ne 'Cancelled'
  -- exactly (not, e.g., "only Delivered" -- every non-cancelled order counts).
  select coalesce(sum(total), 0) into v_revenue
  from orders where order_status <> 'Cancelled';

  select count(*) into v_customers_total from users where role = 'customer';

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_recent_customers
  from (
    select id, first_name, last_name, email, phone, created_at
    from users
    where role = 'customer'
    order by created_at desc
    limit 5
  ) t;

  select count(*) into v_total_products from products where is_active = true;

  -- ALL rows at stock <= 3 (not just the ones the route later buckets as
  -- "low") -- the JS partition into lowStockCount/outOfStockCount happens
  -- against this same full set, per task-13-brief.md.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_low_stock
  from (
    select id, name, sku, price, stock, image, images, category
    from products
    where is_active = true and stock <= 3
  ) t;

  select count(*) into v_total_subscribers
  from newsletter_subscribers where status = 'subscribed';

  select
    count(*) filter (where status = 'Pending'),
    count(*) filter (where status = 'Verified'),
    count(*) filter (where status = 'Rejected')
    into v_payments_pending, v_payments_verified, v_payments_rejected
  from payments;

  select coalesce(sum(amount), 0) into v_verified_amount
  from payments where status = 'Verified';

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_recent_orders
  from (
    select * from orders order by created_at desc limit 5
  ) t;

  return jsonb_build_object(
    'orders', v_orders,
    'revenue', v_revenue,
    'customersTotal', v_customers_total,
    'recentCustomers', v_recent_customers,
    'totalProducts', v_total_products,
    'lowStockProducts', v_low_stock,
    'totalSubscribers', v_total_subscribers,
    'paymentsPending', v_payments_pending,
    'paymentsVerified', v_payments_verified,
    'paymentsRejected', v_payments_rejected,
    'verifiedPaymentAmount', v_verified_amount,
    'recentOrders', v_recent_orders
  );
end;
$$;
