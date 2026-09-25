-- 0004_product_details.sql
--
-- Product Management Expansion
-- (docs/superpowers/specs/2026-08-20-product-management-expansion-design.md).
--
-- Makes the customer Product Page fully database-driven. Almost everything the
-- page shows already had a column in 0001_init.sql (fabric, work, colors,
-- breakdown, model_info, care_instructions, ...) and was simply never editable
-- from the admin panel, so this migration adds only what genuinely did not
-- exist:
--
--   1. products.size_stock   -- per-size inventory, replacing the single
--                               product-level `stock` as the authority when
--                               it is populated.
--   2. products.model_height -- structured input behind the page's existing
--   3. products.model_size      single "Model Height: X | Model wears: Y" line.
--   4. products.fit_note     -- the sentence that used to be hardcoded in
--                               views/Product.jsx.
--
-- plus the two order RPCs, which must now move per-size inventory as well as
-- the product-level total.
--
-- Additive and idempotent: safe on a live database, safe to run twice, and it
-- neither drops nor rewrites any existing product data.
--
-- IMPORTANT -- `stock` is NOT dropped. It is retained as the maintained TOTAL
-- (sum of size_stock's values whenever size_stock is non-empty) precisely so
-- that every existing consumer of it keeps working untouched: cart-add
-- validation (app/api/cart/items/route.js), admin_dashboard_stats()'s
-- low-stock/out-of-stock partition, the admin product list column, and the
-- product page's SOLD OUT / LOW STOCK indicator. A product whose size_stock is
-- still `{}` is "not size-tracked" and behaves EXACTLY as it did before this
-- migration, at every one of those call sites. That is what makes this
-- migration safe to apply before any product has per-size numbers entered.

-- ---------------------------------------------------------------------------
-- 1. Per-size inventory
-- ---------------------------------------------------------------------------

alter table products
  add column if not exists size_stock jsonb not null default '{}'::jsonb;

-- A CHECK constraint cannot contain a subquery, so the per-key validation is
-- pushed into an immutable helper. `immutable` is honest here: the result
-- depends only on the argument -- no table access, no settings, no clock.
--
-- Valid shapes: a json OBJECT whose every value is a non-negative integer.
-- `{}` is valid and means "this product is not size-tracked".
create or replace function is_valid_size_stock(p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_entry record;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;

  for v_entry in select key, value from jsonb_each(p_value)
  loop
    -- Size keys are user-entered labels ('S', 'XL', '38'); only emptiness is
    -- rejected, not their content.
    if btrim(v_entry.key) = '' then
      return false;
    end if;

    if jsonb_typeof(v_entry.value) <> 'number' then
      return false;
    end if;

    -- Non-negative whole numbers only. 3.5 units of stock is not a thing, and
    -- negative stock is the exact corruption the order RPC below must never
    -- be able to produce.
    if (v_entry.value)::numeric < 0 then
      return false;
    end if;

    if (v_entry.value)::numeric <> trunc((v_entry.value)::numeric) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- `not valid` is deliberate: it enforces the constraint on every future INSERT
-- and UPDATE without scanning (and potentially failing on) rows that already
-- exist. Every existing row has the `{}` default and therefore passes anyway,
-- but this keeps the migration non-blocking on a large live table.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_size_stock_valid'
  ) then
    alter table products
      add constraint products_size_stock_valid
      check (is_valid_size_stock(size_stock)) not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Model details
-- ---------------------------------------------------------------------------
--
-- The page renders ONE line -- "Model Height: 5'8" | Model wears: S" -- from
-- model_info. These two columns are the structured admin inputs behind it;
-- the API layer composes model_info from them on every admin write, so the
-- rendered line and every existing consumer of model_info are unchanged.
-- model_info is not dropped and not made generated: products migrated from the
-- old stack may carry a model_info that was never composed from these parts.

alter table products
  add column if not exists model_height text;

alter table products
  add column if not exists model_size text;

-- ---------------------------------------------------------------------------
-- 3. Fit note
-- ---------------------------------------------------------------------------
--
-- views/Product.jsx used to hardcode "Relaxed fluid fit tailored for standard
-- Pakistani sizing." beneath the model line. It is product copy, not a UI
-- label, so it becomes a column. Nullable: a product with no fit note renders
-- the (empty) paragraph, keeping the section's structure identical.

alter table products
  add column if not exists fit_note text;

-- ---------------------------------------------------------------------------
-- 4. create_order() -- per-size stock check and decrement
-- ---------------------------------------------------------------------------
--
-- Replaces the 0001_init.sql definition. The ONLY behavioural change is inside
-- the per-item loop; the signature, the order/payment/cart writes, the
-- shipping-cost rule, the item snapshot shape and every RAISE message string
-- are byte-identical to 0001, because app/api/orders/route.js pattern-matches
-- those strings back to HTTP status codes.
--
-- The `select ... for update` row lock is unchanged and is what makes this
-- safe: the size check and the size decrement happen inside one lock hold on
-- the product row, so two concurrent checkouts for the last unit of size M
-- cannot both pass the check. The second blocks until the first's statement
-- finishes, then re-reads the already-decremented size_stock.
--
-- Behaviour by product:
--   size_stock = '{}'                  -> product-level check only (as before)
--   size_stock has the requested size  -> that size's count is authoritative;
--                                         both it and `stock` are decremented
--   size_stock set but lacks the size  -> that size is not sold; rejected with
--                                         the SAME "Insufficient stock" string
--                                         shape, reporting 0 available

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
  v_size_tracked boolean;
  v_size_available integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty. Cannot process order.';
  end if;

  v_now_iso := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item ->> 'productId')::uuid for update;

    if not found or v_product.is_active is not true then
      raise exception 'Product "%" is not available.', (v_item ->> 'productId');
    end if;

    v_qty := (v_item ->> 'quantity')::integer;

    -- Reject a non-positive quantity outright. The old code would have
    -- silently INCREASED stock on a negative quantity (`stock - (-2)`); the
    -- route handler's own validation never let one through, but the RPC is
    -- the last line of defence for inventory integrity and should not depend
    -- on that.
    if v_qty is null or v_qty <= 0 then
      raise exception 'Insufficient stock for "%". Available stock is %, but % was requested.',
        v_product.name, coalesce(v_product.stock, 0), coalesce(v_qty, 0);
    end if;

    v_selected_size := coalesce(nullif(v_item ->> 'selectedSize', ''), 'M');
    v_selected_color := coalesce(nullif(v_item ->> 'selectedColor', ''), v_product.color, '');

    v_size_tracked := v_product.size_stock is not null
                      and jsonb_typeof(v_product.size_stock) = 'object'
                      and v_product.size_stock <> '{}'::jsonb;

    if v_size_tracked then
      v_size_available := coalesce((v_product.size_stock ->> v_selected_size)::integer, 0);

      if v_qty > v_size_available then
        raise exception 'Insufficient stock for "%". Available stock is %, but % was requested.',
          v_product.name, v_size_available, v_qty;
      end if;
    else
      if v_qty > v_product.stock then
        raise exception 'Insufficient stock for "%". Available stock is %, but % was requested.',
          v_product.name, v_product.stock, v_qty;
      end if;
    end if;

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

    if v_size_tracked then
      -- Both move together. `stock` is the maintained total, so letting the
      -- two drift apart would silently corrupt every consumer still reading
      -- `stock` (cart validation, dashboard stats, the availability dot).
      -- greatest(..., 0) guards `stock` only: the size count is already
      -- proven >= v_qty by the check above, but a product whose `stock` was
      -- out of sync BEFORE this migration must not be pushed negative and
      -- trip the table's own `stock >= 0` CHECK mid-checkout.
      update products
        set size_stock = jsonb_set(
              size_stock,
              array[v_selected_size],
              to_jsonb(v_size_available - v_qty)
            ),
            stock = greatest(stock - v_qty, 0)
      where id = v_product.id;
    else
      update products set stock = stock - v_qty where id = v_product.id;
    end if;
  end loop;

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
-- 5. cancel_order() -- mirror the restock
-- ---------------------------------------------------------------------------
--
-- Replaces the 0001_init.sql definition. Unchanged except that the restock
-- loop now puts the units back on the size they were taken from, mirroring
-- create_order's decrement exactly.
--
-- The size is read from the order item's OWN `size` snapshot, not from
-- anything the caller supplies, so cancelling always returns stock to the size
-- that was actually sold even if the product's size list has since changed.
--
-- Only a product that is CURRENTLY size-tracked gets its size_stock touched.
-- If an admin has since cleared size_stock back to `{}`, the restock falls
-- back to the product-level total -- it must not resurrect a per-size map the
-- admin deliberately emptied.

create or replace function cancel_order(p_order_id uuid)
returns orders
language plpgsql
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_size text;
  v_size_stock jsonb;
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
      v_product_id := (v_item ->> 'productId')::uuid;
      v_qty := (v_item ->> 'quantity')::integer;
      v_size := nullif(v_item ->> 'size', '');

      select size_stock into v_size_stock from products where id = v_product_id for update;

      if found
         and v_size is not null
         and v_size_stock is not null
         and jsonb_typeof(v_size_stock) = 'object'
         and v_size_stock <> '{}'::jsonb
      then
        update products
          set size_stock = jsonb_set(
                size_stock,
                array[v_size],
                to_jsonb(coalesce((size_stock ->> v_size)::integer, 0) + v_qty)
              ),
              stock = stock + v_qty
        where id = v_product_id;
      else
        update products set stock = stock + v_qty where id = v_product_id;
      end if;
    end if;
  end loop;

  select * into v_order from orders where id = p_order_id;
  return v_order;
end;
$$;
