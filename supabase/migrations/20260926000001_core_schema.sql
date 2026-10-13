-- ============================================================
-- FreshDash Pro 2027 — Migration 0001: Core schema
-- Target: NEW Supabase project ONLY (ahzvrhkepzujjaakubha)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.app_role as enum
  ('super_admin','admin','manager','sales','warehouse','driver','viewer','customer');
create type public.customer_type as enum
  ('restaurant','hotel','buffet','cafe','shop','other');
create type public.order_status as enum
  ('pending','confirmed','preparing','ready','out_for_delivery','delivered','cancelled','failed');
create type public.payment_method as enum ('cash','credit','ewallet','bank_transfer');
create type public.movement_type as enum
  ('purchase','sale','return','adjustment','damage','transfer');
create type public.delivery_status as enum
  ('unassigned','assigned','picked_up','delivered','failed');

-- ---------- Shared triggers ----------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.tg_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'immutable_record' using errcode = '42501'; end $$;

-- ---------- Profiles (1:1 with auth.users) ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text unique check (phone ~ '^\+?[0-9]{7,15}$'),
  role        public.app_role not null default 'customer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Role helpers (SECURITY DEFINER so RLS on profiles does not recurse)
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = any(roles), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(array['super_admin','admin','manager','sales','warehouse','driver','viewer']::public.app_role[])
$$;

-- Auto-create profile on sign-up (always 'customer'; elevation only by admin)
create or replace function public.tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- Block self role / active-flag escalation
create or replace function public.tg_protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Direct DB owner session (SQL editor / migrations): needed to bootstrap the first super_admin.
  -- API sessions always run as session_user 'authenticator', so this cannot be reached from the app.
  if auth.uid() is null and session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.has_role(array['super_admin','admin']::public.app_role[]) then
    raise exception 'insufficient_privilege: role change not allowed' using errcode = '42501';
  end if;
  if new.role = 'super_admin' and old.role <> 'super_admin'
     and not public.has_role(array['super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege: only super_admin can grant super_admin' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.tg_protect_profile_privileges();

-- ---------- Catalog ----------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 60),
  icon        text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger categories_updated before update on public.categories
  for each row execute function public.tg_set_updated_at();

create table public.units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 30),
  created_at  timestamptz not null default now()
);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  description    text check (char_length(description) <= 1000),
  category_id    uuid not null references public.categories(id) on delete restrict,
  unit_id        uuid not null references public.units(id) on delete restrict,
  pack_label     text check (char_length(pack_label) <= 40),
  price          numeric(12,2) not null check (price >= 0),
  image_path     text,
  track_stock    boolean not null default true,
  stock_on_hand  numeric(12,3) not null default 0,   -- maintained ONLY by movement trigger
  low_stock_at   numeric(12,3) not null default 0 check (low_stock_at >= 0),
  is_visible     boolean not null default true,
  deleted_at     timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint stock_non_negative check (not track_stock or stock_on_hand >= 0)
);
create index products_category_idx on public.products(category_id) where deleted_at is null;
create index products_visible_idx  on public.products(is_visible)  where deleted_at is null;
create index products_unit_idx     on public.products(unit_id);
create trigger products_updated before update on public.products
  for each row execute function public.tg_set_updated_at();

-- ---------- Parties ----------
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid unique references public.profiles(id) on delete set null,
  name          text not null check (char_length(name) between 1 and 120),
  phone         text not null unique check (phone ~ '^\+?[0-9]{7,15}$'),
  type          public.customer_type not null default 'restaurant',
  address       text check (char_length(address) <= 300),
  credit_limit  numeric(12,2) not null default 0 check (credit_limit >= 0),
  notes         text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger customers_updated before update on public.customers
  for each row execute function public.tg_set_updated_at();

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  phone       text check (phone ~ '^\+?[0-9]{7,15}$'),
  type        text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger suppliers_updated before update on public.suppliers
  for each row execute function public.tg_set_updated_at();

-- ---------- Purchases ----------
create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid not null references public.suppliers(id) on delete restrict,
  total            numeric(14,2) not null default 0 check (total >= 0),
  notes            text,
  idempotency_key  uuid not null unique,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index purchases_supplier_idx on public.purchases(supplier_id, created_at desc);

create table public.purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references public.purchases(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete restrict,
  quantity     numeric(12,3) not null check (quantity > 0),
  unit_cost    numeric(12,2) not null check (unit_cost >= 0),
  line_total   numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  unique (purchase_id, product_id)
);
create index purchase_items_product_idx on public.purchase_items(product_id);

create table public.supplier_payments (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid not null references public.suppliers(id) on delete restrict,
  amount           numeric(12,2) not null check (amount > 0),
  method           public.payment_method not null default 'cash',
  reference        text,
  idempotency_key  uuid not null unique,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index supplier_payments_supplier_idx on public.supplier_payments(supplier_id, created_at desc);

-- ---------- Orders ----------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          bigint generated always as identity unique,
  customer_id       uuid not null references public.customers(id) on delete restrict,
  status            public.order_status not null default 'pending',
  subtotal          numeric(14,2) not null check (subtotal >= 0),
  discount          numeric(14,2) not null default 0 check (discount >= 0),
  total             numeric(14,2) generated always as (subtotal - discount) stored,
  payment_method    public.payment_method not null default 'cash',
  delivery_address  text check (char_length(delivery_address) <= 300),
  scheduled_for     date,
  notes             text check (char_length(notes) <= 1000),
  cancel_reason     text,
  idempotency_key   uuid not null unique,
  created_by        uuid references public.profiles(id),
  updated_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint discount_le_subtotal check (discount <= subtotal)
);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index orders_status_idx   on public.orders(status, created_at desc);
create index orders_created_idx  on public.orders(created_at desc);
create trigger orders_updated before update on public.orders
  for each row execute function public.tg_set_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete restrict,
  product_name  text not null,
  unit_name     text not null,
  quantity      numeric(12,3) not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  line_total    numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  unique (order_id, product_id)
);
create index order_items_product_idx on public.order_items(product_id);

create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  note         text,
  changed_by   uuid references public.profiles(id),
  changed_at   timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history(order_id, changed_at);

-- ---------- Inventory (append-only ledger) ----------
create table public.inventory_movements (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references public.products(id) on delete restrict,
  type        public.movement_type not null,
  quantity    numeric(12,3) not null check (quantity <> 0),  -- signed
  ref_type    text check (ref_type in ('order','purchase','manual')),
  ref_id      uuid,
  reason      text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create unique index inventory_movements_ref_uq
  on public.inventory_movements(ref_type, ref_id, product_id, type)
  where ref_id is not null;
create index inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);

create or replace function public.tg_apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.products
     set stock_on_hand = stock_on_hand + new.quantity
   where id = new.product_id;   -- stock_non_negative CHECK aborts the whole tx if < 0
  return new;
end $$;
create trigger inventory_movements_apply after insert on public.inventory_movements
  for each row execute function public.tg_apply_inventory_movement();
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
  for each row execute function public.tg_immutable();

-- ---------- Payments / Delivery / Expenses ----------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete restrict,
  order_id         uuid references public.orders(id) on delete restrict,
  amount           numeric(12,2) not null check (amount > 0),
  method           public.payment_method not null,
  reference        text check (char_length(reference) <= 100),
  idempotency_key  uuid not null unique,
  received_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index payments_customer_idx on public.payments(customer_id, created_at desc);
create index payments_order_idx    on public.payments(order_id);

create table public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders(id) on delete cascade,
  driver_id     uuid references public.profiles(id),
  status        public.delivery_status not null default 'unassigned',
  assigned_at   timestamptz,
  delivered_at  timestamptz,
  failure_note  text,
  updated_at    timestamptz not null default now()
);
create index deliveries_driver_idx on public.deliveries(driver_id, status);
create trigger deliveries_updated before update on public.deliveries
  for each row execute function public.tg_set_updated_at();

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  description  text not null check (char_length(description) between 1 and 200),
  category     text not null default 'general',
  amount       numeric(12,2) not null check (amount > 0),
  spent_on     date not null default current_date,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index expenses_spent_idx on public.expenses(spent_on desc);

-- ---------- Notifications / Audit / Settings ----------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text,
  entity_type   text,
  entity_id     uuid,
  dedupe_key    text,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications(recipient_id) where read_at is null;

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx  on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.tg_immutable();

create table public.settings (
  key         text primary key check (key ~ '^[a-z_]{2,50}$'),
  value       jsonb not null,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

-- ---------- Read model: customer balances (operational, NOT accounting) ----------
create view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
       coalesce(o.billed, 0)                        as total_billed,
       coalesce(p.paid, 0)                          as total_paid,
       coalesce(o.billed, 0) - coalesce(p.paid, 0)  as outstanding
from public.customers c
left join (select customer_id, sum(total) as billed from public.orders
           where status not in ('cancelled','failed') group by customer_id) o on o.customer_id = c.id
left join (select customer_id, sum(amount) as paid from public.payments
           group by customer_id) p on p.customer_id = c.id;
