-- ============================================================
-- FreshDash Pro 2027 — Migration 0003: dashboard metrics RPC + product image storage
-- ============================================================

-- Operational dashboard (server-side aggregation; the browser never sums thousands of rows)
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Aden')) at time zone 'Asia/Aden';
begin
  if not public.has_role(array['super_admin','admin','manager','sales','warehouse','viewer']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders where created_at >= v_day_start),
    'sales_today', (select coalesce(sum(total), 0) from public.orders
                     where created_at >= v_day_start and status not in ('cancelled','failed')),
    'pending', (select count(*) from public.orders where status = 'pending'),
    'in_progress', (select count(*) from public.orders where status in ('confirmed','preparing','ready')),
    'out_for_delivery', (select count(*) from public.orders where status = 'out_for_delivery'),
    'delivered_today', (select count(*) from public.orders where status = 'delivered' and updated_at >= v_day_start),
    'collected_today', (select coalesce(sum(amount), 0) from public.payments where created_at >= v_day_start),
    'outstanding', (select coalesce(sum(outstanding), 0) from public.customer_balances where outstanding > 0),
    'low_stock', (select count(*) from public.products
                   where track_stock and deleted_at is null and stock_on_hand <= low_stock_at),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.product_name, 'qty', t.qty) order by t.qty desc)
        from (select oi.product_name, sum(oi.quantity) as qty
                from public.order_items oi join public.orders o on o.id = oi.order_id
               where o.created_at >= now() - interval '30 days' and o.status not in ('cancelled','failed')
               group by oi.product_name order by qty desc limit 5) t), '[]'::jsonb),
    'top_customers', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'total', t.total) order by t.total desc)
        from (select c.name, sum(o.total) as total
                from public.orders o join public.customers c on c.id = o.customer_id
               where o.created_at >= now() - interval '30 days' and o.status not in ('cancelled','failed')
               group by c.name order by total desc limit 5) t), '[]'::jsonb)
  );
end $$;
revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;

-- Product images: public read (CDN), only catalog managers may write; 2 MB, images only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
              and (storage.foldername(name))[1] = 'products'
              and public.has_role(array['super_admin','admin','manager']::public.app_role[]));
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(array['super_admin','admin','manager']::public.app_role[]))
  with check (bucket_id = 'product-images' and public.has_role(array['super_admin','admin','manager']::public.app_role[]));
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(array['super_admin','admin','manager']::public.app_role[]));
