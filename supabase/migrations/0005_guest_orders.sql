-- 0005_guest_orders.sql
--
-- Guest checkout
-- (docs/superpowers/specs/2026-08-20-guest-checkout-design.md).
--
-- Placing an order no longer requires an account. The email address collected
-- on the order form -- compulsory whether or not the customer is signed in --
-- becomes the identity an order is stored against and the channel every order
-- update is sent through.
--
-- Three changes, all additive or relaxing. Nothing is dropped, no data is
-- rewritten, and every order that exists today keeps its user_id and behaves
-- exactly as it did.

-- ---------------------------------------------------------------------------
-- 1. A guest order has no account
-- ---------------------------------------------------------------------------
--
-- `user_id is null` IS the definition of a guest order -- there is deliberately
-- no separate flag and no separate table, because a second source of truth for
-- "is this a guest order" is a second thing that can disagree.
--
-- The FOREIGN KEY is deliberately kept: a NULL passes a foreign key check, so
-- relaxing NOT NULL costs nothing in referential integrity. Any non-null
-- user_id is still guaranteed to be a real user.

alter table orders
  alter column user_id drop not null;

-- Same, for a guest who pays by bank transfer / JazzCash / Easypaisa. The
-- payment row belongs to the ORDER; the user is now optional context on it.
alter table payments
  alter column user_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. Order history is now looked up by email as well as by user
-- ---------------------------------------------------------------------------
--
-- The customer-facing order list matches:
--
--   where user_id = $1
--      or (user_id is null and lower(customer_email) = lower($2))
--
-- so a guest order appears in an account's history as soon as an account
-- exists with that email -- whether the account was created afterwards, or
-- already existed and the customer happened to check out signed out. Nothing
-- is ever rewritten; the link is a query, not a migration.
--
-- The index is on `lower(customer_email)` rather than the raw column because
-- that is exactly the expression the query uses; an index on the plain column
-- would not be usable and every account page load would sequentially scan
-- `orders`. `orders_user_id_idx` from 0001 still serves the first half of the
-- OR.

create index if not exists orders_customer_email_idx
  on orders (lower(customer_email));
