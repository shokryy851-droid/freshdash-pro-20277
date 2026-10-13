-- ============================================================
-- FreshDash Pro 2027 — Verification tests
-- SAFE: the whole block ends with RAISE EXCEPTION, so EVERY change
-- (test users, products, orders) is rolled back automatically.
-- The red "error" message you see at the end IS the test report.
-- Run AFTER the migrations, in the NEW project only.
-- ============================================================
do $$
declare
  r        text := '';
  pass     int := 0;
  fail     int := 0;
  u_admin  uuid := gen_random_uuid();
  u_cust   uuid := gen_random_uuid();
  v_cat    uuid;
  v_unit   uuid;
  v_prod   uuid;
  v_custid uuid;
  v_key    uuid := gen_random_uuid();
  v_o1     public.orders;
  v_o2     public.orders;
  v_stock  numeric;
  v_n      int;
  v_pk     uuid := gen_random_uuid();
begin
  -- ---------- Setup as DB owner ----------
  insert into auth.users (id, instance_id, aud, role, email)
  values (u_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-admin@fdp.test'),
         (u_cust,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cust@fdp.test');
  update public.profiles set role = 'admin' where id = u_admin;
  r := r || E'\n[setup] profiles auto-created: ' || (select count(*) from public.profiles where id in (u_admin, u_cust));

  -- ---------- Act as ADMIN through the API role ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.categories (name) values ('خضروات-اختبار') returning id into v_cat;
  insert into public.units (name) values ('كيلو-اختبار') returning id into v_unit;
  insert into public.products (name, category_id, unit_id, price, stock_on_hand)
  values ('طماطم-اختبار', v_cat, v_unit, 1000, 999) returning id into v_prod;

  select stock_on_hand into v_stock from public.products where id = v_prod;
  if v_stock = 0 then pass := pass + 1; r := r || E'\nPASS 01 opening stock forced to 0 on insert';
  else fail := fail + 1; r := r || E'\nFAIL 01 stock on insert = ' || v_stock; end if;

  perform public.adjust_stock(v_prod, 10, 'adjustment', 'opening stock');
  insert into public.customers (name, phone, type) values ('مطعم اختبار', '777000111', 'restaurant')
  returning id into v_custid;

  -- 02 create order
  v_o1 := public.create_order(v_custid, jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 3)), 'cash', v_key);
  select stock_on_hand into v_stock from public.products where id = v_prod;
  if v_stock = 7 and v_o1.total = 3000 then pass := pass + 1; r := r || E'\nPASS 02 order created, server price 3000, stock 10->7';
  else fail := fail + 1; r := r || E'\nFAIL 02 total=' || v_o1.total || ' stock=' || v_stock; end if;

  -- 03 idempotency (double submit)
  v_o2 := public.create_order(v_custid, jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 3)), 'cash', v_key);
  select stock_on_hand into v_stock from public.products where id = v_prod;
  select count(*) into v_n from public.orders where idempotency_key = v_key;
  if v_o2.id = v_o1.id and v_stock = 7 and v_n = 1 then pass := pass + 1; r := r || E'\nPASS 03 duplicate submit returns same order, no double stock';
  else fail := fail + 1; r := r || E'\nFAIL 03 duplicate created or stock changed'; end if;

  -- 04 insufficient stock
  begin
    perform public.create_order(v_custid, jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 100)), 'cash', gen_random_uuid());
    fail := fail + 1; r := r || E'\nFAIL 04 oversell allowed';
  exception when others then
    if sqlerrm like '%insufficient_stock%' then pass := pass + 1; r := r || E'\nPASS 04 oversell blocked';
    else fail := fail + 1; r := r || E'\nFAIL 04 wrong error: ' || sqlerrm; end if;
  end;

  -- 05 direct stock tampering
  begin
    update public.products set stock_on_hand = 999 where id = v_prod;
    fail := fail + 1; r := r || E'\nFAIL 05 direct stock edit allowed';
  exception when others then pass := pass + 1; r := r || E'\nPASS 05 direct stock edit blocked';
  end;

  -- 06 direct order insert (bypassing RPC)
  begin
    insert into public.orders (customer_id, subtotal, idempotency_key) values (v_custid, 1, gen_random_uuid());
    fail := fail + 1; r := r || E'\nFAIL 06 direct order insert allowed';
  exception when others then pass := pass + 1; r := r || E'\nPASS 06 direct order insert blocked (RLS)';
  end;

  -- 07 invalid transition
  begin
    perform public.change_order_status(v_o1.id, 'delivered');
    fail := fail + 1; r := r || E'\nFAIL 07 pending->delivered allowed';
  exception when others then pass := pass + 1; r := r || E'\nPASS 07 invalid transition blocked';
  end;

  -- 08 cancel returns stock exactly once
  perform public.change_order_status(v_o1.id, 'cancelled', 'test');
  perform public.change_order_status(v_o1.id, 'cancelled', 'test again');
  select stock_on_hand into v_stock from public.products where id = v_prod;
  if v_stock = 10 then pass := pass + 1; r := r || E'\nPASS 08 cancel restored stock once (10)';
  else fail := fail + 1; r := r || E'\nFAIL 08 stock after cancel = ' || v_stock; end if;

  -- 09 payment idempotency
  perform public.record_payment(v_custid, 500, 'cash', v_pk);
  perform public.record_payment(v_custid, 500, 'cash', v_pk);
  select count(*) into v_n from public.payments where idempotency_key = v_pk;
  if v_n = 1 then pass := pass + 1; r := r || E'\nPASS 09 duplicate payment prevented';
  else fail := fail + 1; r := r || E'\nFAIL 09 payments = ' || v_n; end if;

  -- 10 ledger immutable
  begin
    delete from public.inventory_movements where product_id = v_prod;
    select count(*) into v_n from public.inventory_movements where product_id = v_prod;
    if v_n > 0 then pass := pass + 1; r := r || E'\nPASS 10 ledger rows not deletable';
    else fail := fail + 1; r := r || E'\nFAIL 10 ledger deleted'; end if;
  exception when others then pass := pass + 1; r := r || E'\nPASS 10 ledger delete rejected';
  end;

  -- ---------- Act as CUSTOMER ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_cust, 'role', 'authenticated')::text, true);

  -- 11 self-escalation
  begin
    update public.profiles set role = 'admin' where id = u_cust;
    fail := fail + 1; r := r || E'\nFAIL 11 customer escalated to admin';
  exception when others then pass := pass + 1; r := r || E'\nPASS 11 self role escalation blocked';
  end;

  -- 12 customer cannot see other customers' orders / payments
  select count(*) into v_n from public.orders;
  select v_n + count(*) into v_n from public.payments;
  if v_n = 0 then pass := pass + 1; r := r || E'\nPASS 12 customer sees no foreign orders/payments';
  else fail := fail + 1; r := r || E'\nFAIL 12 customer sees ' || v_n || ' foreign rows'; end if;

  -- 13 customer cannot order for another customer
  begin
    perform public.create_order(v_custid, jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)), 'cash', gen_random_uuid());
    fail := fail + 1; r := r || E'\nFAIL 13 customer ordered for someone else';
  exception when others then pass := pass + 1; r := r || E'\nPASS 13 cross-customer order blocked';
  end;

  -- 14 audit log hidden from customer
  select count(*) into v_n from public.audit_logs;
  if v_n = 0 then pass := pass + 1; r := r || E'\nPASS 14 audit log hidden from customer';
  else fail := fail + 1; r := r || E'\nFAIL 14 customer sees audit log'; end if;

  raise exception using message =
    E'TEST REPORT (all changes rolled back)\n' ||
    '==> PASSED: ' || pass || ' / FAILED: ' || fail || r;
end $$;
