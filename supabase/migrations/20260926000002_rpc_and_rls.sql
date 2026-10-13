-- ============================================================
-- FreshDash Pro 2027 — Migration 0002: Business commands (RPC) + RLS
-- All financial / inventory writes go through these functions.
-- The browser NEVER inserts into orders, order_items, payments,
-- inventory_movements, purchases directly (no INSERT policies exist).
-- ============================================================

-- ---------- Guard: stock_on_hand is writable only by the movement trigger ----------
create or replace function public.tg_guard_stock_column()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.stock_on_hand := 0;                         -- opening stock = an 'adjustment' movement
  elsif new.stock_on_hand is distinct from old.stock_on_hand
        and coalesce(current_setting('fdp.stock_write', true), 'off') <> 'on' then
    raise exception 'stock_on_hand is ledger-controlled' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger products_guard_stock before insert or update on public.products
  for each row execute function public.tg_guard_stock_column();

create or replace function public.tg_apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('fdp.stock_write', 'on', true);
  update public.products set stock_on_hand = stock_on_hand + new.quantity
   where id = new.product_id;
  perform set_config('fdp.stock_write', 'off', true);
  return new;
end $$;

-- ---------- Internal helpers (not exposed) ----------
create or replace function public._audit(p_action text, p_entity text, p_entity_id text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function public._notify_roles(
  p_roles public.app_role[], p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, dedupe_key)
  select p.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_dedupe
    from public.profiles p where p.is_active and p.role = any(p_roles)
  on conflict (recipient_id, dedupe_key) do nothing;
$$;

revoke all on function public._audit(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public._notify_roles(public.app_role[], text, text, text, text, uuid, text) from public, anon, authenticated;

-- ============================================================
-- COMMAND: create_order  (atomic, idempotent, server-priced)
-- p_items: [{"product_id": "<uuid>", "quantity": 2.5}, ...]
-- ============================================================
create or replace function public.create_order(
  p_customer_id      uuid,
  p_items            jsonb,
  p_payment_method   public.payment_method,
  p_idempotency_key  uuid,
  p_delivery_address text default null,
  p_notes            text default null,
  p_scheduled_for    date default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_role     public.app_role := public.my_role();
  v_order    public.orders;
  v_subtotal numeric(14,2) := 0;
  v_ids      uuid[];
  v_line     record;
begin
  if v_role is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;

  -- Replay of an already-processed request → return the original result
  select * into v_order from public.orders where idempotency_key = p_idempotency_key;
  if found then return v_order; end if;

  if v_role = 'customer' then
    if not exists (select 1 from public.customers c
                   where c.id = p_customer_id and c.profile_id = auth.uid() and c.is_active) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif not public.has_role(array['super_admin','admin','manager','sales']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and is_active) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  -- Normalise lines (merge duplicate products), validate quantities
  create temporary table if not exists _fdp_lines (product_id uuid primary key, quantity numeric(12,3)) on commit drop;
  truncate pg_temp._fdp_lines;
  insert into pg_temp._fdp_lines (product_id, quantity)
  select (e->>'product_id')::uuid, sum((e->>'quantity')::numeric)
    from jsonb_array_elements(p_items) e
   group by 1;
  if exists (select 1 from pg_temp._fdp_lines where quantity is null or quantity <= 0 or quantity > 100000) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  -- Lock products in deterministic order (deadlock-safe), then validate
  select array_agg(product_id order by product_id) into v_ids from pg_temp._fdp_lines;
  perform 1 from public.products where id = any(v_ids) order by id for update;

  if (select count(*) from public.products p
       where p.id = any(v_ids) and p.deleted_at is null and p.is_visible) <> cardinality(v_ids) then
    raise exception 'product_unavailable' using errcode = 'P0002';
  end if;

  if exists (select 1 from pg_temp._fdp_lines l join public.products p on p.id = l.product_id
              where p.track_stock and p.stock_on_hand < l.quantity) then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  select coalesce(sum(round(l.quantity * p.price, 2)), 0) into v_subtotal
    from pg_temp._fdp_lines l join public.products p on p.id = l.product_id;

  insert into public.orders (customer_id, subtotal, payment_method, delivery_address,
                             scheduled_for, notes, idempotency_key, created_by, updated_by)
  values (p_customer_id, v_subtotal, p_payment_method, left(p_delivery_address, 300),
          p_scheduled_for, left(p_notes, 1000), p_idempotency_key, auth.uid(), auth.uid())
  on conflict (idempotency_key) do nothing
  returning * into v_order;

  if v_order.id is null then      -- lost a concurrent race on the same key
    select * into v_order from public.orders where idempotency_key = p_idempotency_key;
    return v_order;
  end if;

  for v_line in
    select l.product_id, l.quantity, p.name, p.price, p.track_stock, u.name as unit_name
      from pg_temp._fdp_lines l
      join public.products p on p.id = l.product_id
      join public.units u on u.id = p.unit_id
  loop
    insert into public.order_items (order_id, product_id, product_name, unit_name, quantity, unit_price)
    values (v_order.id, v_line.product_id, v_line.name, v_line.unit_name, v_line.quantity, v_line.price);

    if v_line.track_stock then
      insert into public.inventory_movements (product_id, type, quantity, ref_type, ref_id, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, 'order', v_order.id, auth.uid());
    end if;
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order.id, null, 'pending', auth.uid());
  insert into public.deliveries (order_id) values (v_order.id);

  perform public._audit('order.create', 'order', v_order.id::text,
                        jsonb_build_object('order_no', v_order.order_no, 'total', v_order.total));
  perform public._notify_roles(array['super_admin','admin','manager','sales']::public.app_role[],
          'order.new', 'طلب جديد #' || v_order.order_no, null, 'order', v_order.id,
          'order.new:' || v_order.id);
  return v_order;
end $$;

-- ============================================================
-- COMMAND: change_order_status (validated state machine)
-- ============================================================
create or replace function public.change_order_status(
  p_order_id uuid, p_to public.order_status, p_note text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_role  public.app_role := public.my_role();
  v_order public.orders;
  v_ok    boolean;
begin
  if v_role is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.status = p_to then return v_order; end if;       -- idempotent no-op

  v_ok := (v_order.status::text, p_to::text) in (
    ('pending','confirmed'), ('pending','cancelled'),
    ('confirmed','preparing'), ('confirmed','cancelled'),
    ('preparing','ready'), ('preparing','cancelled'),
    ('ready','out_for_delivery'), ('ready','cancelled'),
    ('out_for_delivery','delivered'), ('out_for_delivery','failed'));
  if not v_ok then
    raise exception 'invalid_transition % -> %', v_order.status, p_to using errcode = '22023';
  end if;

  -- Who may perform which transition
  if v_role in ('super_admin','admin','manager','sales') then
    null;
  elsif v_role = 'warehouse' and p_to in ('preparing','ready') then
    null;
  elsif v_role = 'driver' and p_to in ('out_for_delivery','delivered','failed')
        and exists (select 1 from public.deliveries d where d.order_id = p_order_id and d.driver_id = auth.uid()) then
    null;
  elsif v_role = 'customer' and p_to = 'cancelled' and v_order.status = 'pending'
        and exists (select 1 from public.customers c where c.id = v_order.customer_id and c.profile_id = auth.uid()) then
    null;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_to = 'cancelled' then
    -- Return reserved stock exactly once (unique ref index blocks doubles)
    insert into public.inventory_movements (product_id, type, quantity, ref_type, ref_id, reason, created_by)
    select m.product_id, 'return', -m.quantity, 'order', p_order_id, 'order cancelled', auth.uid()
      from public.inventory_movements m
     where m.ref_type = 'order' and m.ref_id = p_order_id and m.type = 'sale'
    on conflict do nothing;
  end if;

  update public.orders
     set status = p_to, updated_by = auth.uid(),
         cancel_reason = case when p_to = 'cancelled' then left(p_note, 500) else cancel_reason end
   where id = p_order_id
  returning * into v_order;

  update public.deliveries
     set status = case p_to when 'out_for_delivery' then 'picked_up'::public.delivery_status
                            when 'delivered' then 'delivered'::public.delivery_status
                            when 'failed' then 'failed'::public.delivery_status
                            else status end,
         delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
         failure_note = case when p_to = 'failed' then left(p_note, 500) else failure_note end
   where order_id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  select p_order_id, h.to_status, p_to, left(p_note, 500), auth.uid()
    from (select to_status from public.order_status_history
           where order_id = p_order_id order by changed_at desc, id desc limit 1) h;

  perform public._audit('order.status', 'order', p_order_id::text, jsonb_build_object('to', p_to, 'note', p_note));

  -- Notify the customer's login (if any)
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id, dedupe_key)
  select c.profile_id, 'order.status', 'تحديث الطلب #' || v_order.order_no, 'order', p_order_id,
         'order.status:' || p_order_id || ':' || p_to
    from public.customers c where c.id = v_order.customer_id and c.profile_id is not null
  on conflict (recipient_id, dedupe_key) do nothing;

  return v_order;
end $$;

-- ============================================================
-- COMMAND: assign_delivery
-- ============================================================
create or replace function public.assign_delivery(p_order_id uuid, p_driver_id uuid)
returns public.deliveries
language plpgsql security definer set search_path = '' as $$
declare v_row public.deliveries;
begin
  if not public.has_role(array['super_admin','admin','manager','sales']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver' and is_active) then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;
  update public.deliveries
     set driver_id = p_driver_id, status = 'assigned', assigned_at = now()
   where order_id = p_order_id and status in ('unassigned','assigned')
  returning * into v_row;
  if not found then raise exception 'delivery_not_assignable' using errcode = '22023'; end if;

  perform public._audit('delivery.assign', 'order', p_order_id::text, jsonb_build_object('driver', p_driver_id));
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id, dedupe_key)
  values (p_driver_id, 'delivery.assigned', 'تم إسناد توصيل لك', 'order', p_order_id,
          'delivery.assigned:' || p_order_id || ':' || p_driver_id)
  on conflict (recipient_id, dedupe_key) do nothing;
  return v_row;
end $$;

-- ============================================================
-- COMMAND: record_payment (idempotent)
-- ============================================================
create or replace function public.record_payment(
  p_customer_id uuid, p_amount numeric, p_method public.payment_method,
  p_idempotency_key uuid, p_order_id uuid default null, p_reference text default null)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare v_row public.payments;
begin
  if not public.has_role(array['super_admin','admin','manager','sales','driver']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_order_id is not null and not exists
     (select 1 from public.orders where id = p_order_id and customer_id = p_customer_id) then
    raise exception 'order_customer_mismatch' using errcode = '22023';
  end if;

  insert into public.payments (customer_id, order_id, amount, method, reference, idempotency_key, received_by)
  values (p_customer_id, p_order_id, round(p_amount, 2), p_method, left(p_reference, 100), p_idempotency_key, auth.uid())
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.payments where idempotency_key = p_idempotency_key;
    return v_row;
  end if;

  perform public._audit('payment.record', 'payment', v_row.id::text,
                        jsonb_build_object('customer', p_customer_id, 'amount', v_row.amount));
  return v_row;
end $$;

-- ============================================================
-- COMMAND: adjust_stock (manual adjustment / damage / opening stock)
-- ============================================================
create or replace function public.adjust_stock(
  p_product_id uuid, p_quantity numeric, p_type public.movement_type, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_type not in ('adjustment','damage') then raise exception 'invalid_type' using errcode = '22023'; end if;
  if p_type = 'damage' and p_quantity >= 0 then raise exception 'damage_must_be_negative' using errcode = '22023'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;

  perform 1 from public.products where id = p_product_id for update;
  insert into public.inventory_movements (product_id, type, quantity, ref_type, reason, created_by)
  values (p_product_id, p_type, p_quantity, 'manual', left(p_reason, 300), auth.uid());

  perform public._audit('inventory.' || p_type, 'product', p_product_id::text,
                        jsonb_build_object('qty', p_quantity, 'reason', p_reason));
end $$;

-- ============================================================
-- COMMAND: create_purchase (stock in, idempotent)
-- ============================================================
create or replace function public.create_purchase(
  p_supplier_id uuid, p_items jsonb, p_idempotency_key uuid, p_notes text default null)
returns public.purchases
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.purchases;
begin
  if not public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.purchases where idempotency_key = p_idempotency_key;
  if found then return v_row; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  insert into public.purchases (supplier_id, notes, idempotency_key, created_by)
  values (p_supplier_id, left(p_notes, 1000), p_idempotency_key, auth.uid())
  on conflict (idempotency_key) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.purchases where idempotency_key = p_idempotency_key;
    return v_row;
  end if;

  insert into public.purchase_items (purchase_id, product_id, quantity, unit_cost)
  select v_row.id, (e->>'product_id')::uuid, sum((e->>'quantity')::numeric), max((e->>'unit_cost')::numeric)
    from jsonb_array_elements(p_items) e group by 2;

  insert into public.inventory_movements (product_id, type, quantity, ref_type, ref_id, created_by)
  select pi.product_id, 'purchase', pi.quantity, 'purchase', v_row.id, auth.uid()
    from public.purchase_items pi join public.products p on p.id = pi.product_id
   where pi.purchase_id = v_row.id and p.track_stock;

  update public.purchases
     set total = (select coalesce(sum(line_total), 0) from public.purchase_items where purchase_id = v_row.id)
   where id = v_row.id
  returning * into v_row;

  perform public._audit('purchase.create', 'purchase', v_row.id::text, jsonb_build_object('total', v_row.total));
  return v_row;
end $$;

-- ---------- Function privileges ----------
revoke all on function public.create_order(uuid, jsonb, public.payment_method, uuid, text, text, date) from public, anon;
revoke all on function public.change_order_status(uuid, public.order_status, text) from public, anon;
revoke all on function public.assign_delivery(uuid, uuid) from public, anon;
revoke all on function public.record_payment(uuid, numeric, public.payment_method, uuid, uuid, text) from public, anon;
revoke all on function public.adjust_stock(uuid, numeric, public.movement_type, text) from public, anon;
revoke all on function public.create_purchase(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, public.payment_method, uuid, text, text, date) to authenticated;
grant execute on function public.change_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.assign_delivery(uuid, uuid) to authenticated;
grant execute on function public.record_payment(uuid, numeric, public.payment_method, uuid, uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, public.movement_type, text) to authenticated;
grant execute on function public.create_purchase(uuid, jsonb, uuid, text) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY — enabled on every table, deny by default
-- ============================================================
alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.units                enable row level security;
alter table public.products             enable row level security;
alter table public.customers            enable row level security;
alter table public.suppliers            enable row level security;
alter table public.purchases            enable row level security;
alter table public.purchase_items       enable row level security;
alter table public.supplier_payments    enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.inventory_movements  enable row level security;
alter table public.payments             enable row level security;
alter table public.deliveries           enable row level security;
alter table public.expenses             enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.settings             enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.has_role(array['super_admin','admin']::public.app_role[]))
  with check (id = (select auth.uid()) or public.has_role(array['super_admin','admin']::public.app_role[]));

-- catalog: public read (guest browsing), managers write, no hard delete
create policy categories_read on public.categories for select to anon, authenticated
  using (is_active or public.is_staff());
create policy categories_insert on public.categories for insert to authenticated
  with check (public.has_role(array['super_admin','admin','manager']::public.app_role[]));
create policy categories_update on public.categories for update to authenticated
  using (public.has_role(array['super_admin','admin','manager']::public.app_role[]))
  with check (public.has_role(array['super_admin','admin','manager']::public.app_role[]));
create policy units_read on public.units for select to anon, authenticated using (true);
create policy units_write on public.units for insert to authenticated
  with check (public.has_role(array['super_admin','admin','manager']::public.app_role[]));
create policy products_read on public.products for select to anon, authenticated
  using ((is_visible and deleted_at is null) or public.is_staff());
create policy products_insert on public.products for insert to authenticated
  with check (public.has_role(array['super_admin','admin','manager']::public.app_role[]));
create policy products_update on public.products for update to authenticated
  using (public.has_role(array['super_admin','admin','manager']::public.app_role[]))
  with check (public.has_role(array['super_admin','admin','manager']::public.app_role[]));

-- customers
create policy customers_read on public.customers for select to authenticated
  using (public.is_staff() or profile_id = (select auth.uid()));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_role(array['super_admin','admin','manager','sales']::public.app_role[]));
create policy customers_update on public.customers for update to authenticated
  using (public.has_role(array['super_admin','admin','manager','sales']::public.app_role[]))
  with check (public.has_role(array['super_admin','admin','manager','sales']::public.app_role[]));

-- suppliers & purchasing (writes via RPC except supplier master data)
create policy suppliers_read on public.suppliers for select to authenticated
  using (public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]))
  with check (public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]));
create policy purchases_read on public.purchases for select to authenticated
  using (public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]));
create policy purchase_items_read on public.purchase_items for select to authenticated
  using (public.has_role(array['super_admin','admin','manager','warehouse']::public.app_role[]));
create policy supplier_payments_read on public.supplier_payments for select to authenticated
  using (public.has_role(array['super_admin','admin','manager']::public.app_role[]));

-- orders: office staff see all; drivers see assigned; customers see own. NO write policies.
create policy orders_read on public.orders for select to authenticated using (
  public.has_role(array['super_admin','admin','manager','sales','warehouse','viewer']::public.app_role[])
  or exists (select 1 from public.deliveries d where d.order_id = orders.id and d.driver_id = (select auth.uid()))
  or exists (select 1 from public.customers c where c.id = orders.customer_id and c.profile_id = (select auth.uid())));
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy order_status_history_read on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

-- inventory ledger
create policy inventory_movements_read on public.inventory_movements for select to authenticated
  using (public.has_role(array['super_admin','admin','manager','warehouse','viewer']::public.app_role[]));

-- payments
create policy payments_read on public.payments for select to authenticated using (
  public.has_role(array['super_admin','admin','manager','sales','viewer']::public.app_role[])
  or received_by = (select auth.uid())
  or exists (select 1 from public.customers c where c.id = payments.customer_id and c.profile_id = (select auth.uid())));

-- deliveries
create policy deliveries_read on public.deliveries for select to authenticated using (
  public.has_role(array['super_admin','admin','manager','sales','warehouse','viewer']::public.app_role[])
  or driver_id = (select auth.uid()));

-- expenses
create policy expenses_read on public.expenses for select to authenticated
  using (public.has_role(array['super_admin','admin','manager','viewer']::public.app_role[]));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_role(array['super_admin','admin','manager']::public.app_role[]) and created_by = (select auth.uid()));

-- notifications: own only; may only toggle read_at
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- audit logs: admins read, nobody writes directly
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (public.has_role(array['super_admin','admin']::public.app_role[]));

-- settings
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_insert on public.settings for insert to authenticated
  with check (public.has_role(array['super_admin','admin']::public.app_role[]));
create policy settings_update on public.settings for update to authenticated
  using (public.has_role(array['super_admin','admin']::public.app_role[]))
  with check (public.has_role(array['super_admin','admin']::public.app_role[]));

-- ---------- Realtime: targeted tables only (no full-state polling) ----------
alter publication supabase_realtime add table public.orders, public.notifications, public.deliveries;
