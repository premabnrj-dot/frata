-- =============================================================================
-- THE TENANT ISOLATION PROOF (ADR-0002). Run by scripts/verify/tenancy.sh on a
-- real Postgres after every migration; CI runs it on each push. Every block
-- raises if isolation is broken. Runs as a superuser and becomes frata_app.
-- =============================================================================
\set ON_ERROR_STOP on

insert into tenants (id, slug, name) values
  ('11111111-1111-1111-1111-111111111111', 'proof-a', 'Proof A'),
  ('22222222-2222-2222-2222-222222222222', 'proof-b', 'Proof B');
insert into tenant_domains (host, tenant_id) values ('proof-a.frata.test', '11111111-1111-1111-1111-111111111111');
insert into members (tenant_id, user_id, role) values ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'owner');
insert into orders (tenant_id, number, payment_method, subtotal, total, placed_at, paid_at) values
  ('11111111-1111-1111-1111-111111111111', 1, 'cod', 100000, 100000, now(), null),
  ('22222222-2222-2222-2222-222222222222', 1, 'prepaid', 50000, 50000, now(), now());

-- 1. No tenant set: nothing.
begin; set local role frata_app;
do $$ begin
  if (select count(*) from orders) <> 0 then raise exception 'FAIL: rows visible with no tenant set'; end if;
end $$;
commit;

-- 2. Tenant A sees only A.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if (select count(*) from orders) <> 1 then raise exception 'FAIL: tenant A sees % orders', (select count(*) from orders); end if;
  if exists (select 1 from orders where tenant_id <> '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: tenant A sees another tenant'; end if;
  if (select count(*) from tenants) <> 1 then raise exception 'FAIL: tenant A sees other tenants rows'; end if;
end $$;
commit;

-- 3. The setting ends with the transaction.
begin; set local role frata_app;
do $$ begin
  if current_setting('app.tenant_id', true) is not null and current_setting('app.tenant_id', true) <> '' then
    raise exception 'FAIL: tenant setting leaked past its transaction'; end if;
end $$;
commit;

-- 4. Tenant A cannot write into B.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  begin
    insert into orders (tenant_id, number, payment_method, subtotal, total, placed_at)
      values ('22222222-2222-2222-2222-222222222222', 9, 'cod', 1, 1, now());
    raise exception 'FAIL: tenant A wrote an order into tenant B';
  exception when insufficient_privilege then null; -- RLS violation: expected
  end;
  begin
    insert into outbox (tenant_id, kind, dedupe_key, payload) values ('22222222-2222-2222-2222-222222222222', 'x', 'proof', '{}');
    raise exception 'FAIL: tenant A queued a message for tenant B';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- 5. The pre-tenant lookups answer only their question.
begin; set local role frata_app;
do $$ begin
  if (select name from app_tenant_for_host('PROOF-A.frata.test')) <> 'Proof A' then raise exception 'FAIL: host lookup'; end if;
  if jsonb_array_length(app_access_for('99999999-9999-9999-9999-999999999999')->'memberships') <> 1 then raise exception 'FAIL: access lookup'; end if;
end $$;
commit;

-- 6. Supabase's API roles get nothing.
do $$ begin
  if has_table_privilege('authenticated', 'orders', 'select') or has_table_privilege('anon', 'orders', 'select') then
    raise exception 'FAIL: an API role can read orders'; end if;
end $$;

-- 7. The app role cannot bypass RLS.
do $$ begin
  if (select rolbypassrls from pg_roles where rolname = 'frata_app') then raise exception 'FAIL: frata_app has BYPASSRLS'; end if;
end $$;

-- ── Phase A (ADR-0007) ────────────────────────────────────────────────────────
-- Fixtures: a staffer S (support), a non-staff user N, confirmed and unconfirmed emails.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'staff@frata.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'owner@proof-b.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'squatter@proof-b.test', null);
insert into platform_staff (user_id, email, role) values ('aaaaaaaa-0000-0000-0000-000000000001', 'staff@frata.test', 'support');
insert into support_sessions (id, tenant_id, staff_user_id, staff_email, reason, expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff@frata.test', 'setup_help', now() + interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff@frata.test', 'setup_help', now() - interval '1 minute');
insert into invites (tenant_id, email, role, created_by) values
  ('22222222-2222-2222-2222-222222222222', 'owner@proof-b.test', 'owner', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'squatter@proof-b.test', 'owner', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into invites (tenant_id, email, role, created_by, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'owner@proof-b.test', 'owner', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day');
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by)
  select t.id, pv.id, now(), 'aaaaaaaa-0000-0000-0000-000000000001'
  from (values ('11111111-1111-1111-1111-111111111111'::uuid), ('22222222-2222-2222-2222-222222222222'::uuid)) t(id)
  cross join plan_versions pv join plans p on p.id = pv.plan_id where p.code = 'launch' and pv.version = 1;
insert into audit_events (tenant_id, actor_user_id, actor_kind, action) values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff', 'proof');

-- 8. Support access: active session counts, expired does not; removed staff lose it at once.
begin; set local role frata_app;
do $$ declare m jsonb := app_access_for('aaaaaaaa-0000-0000-0000-000000000001'); begin
  if m->>'staffRole' <> 'support' then raise exception 'FAIL: staff role'; end if;
  if jsonb_array_length(m->'memberships') <> 1 then raise exception 'FAIL: expired session still grants access (%)', m; end if;
  if (m->'memberships'->0->>'tenantId') <> '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: wrong support tenant'; end if;
  if (m->'memberships'->0->>'supportSessionId') is null then raise exception 'FAIL: support row not marked'; end if;
end $$;
commit;
begin;
delete from platform_staff where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role frata_app;
do $$ begin
  if jsonb_array_length(app_access_for('aaaaaaaa-0000-0000-0000-000000000001')->'memberships') <> 0 then raise exception 'FAIL: removed staff keep a live session'; end if;
end $$;
rollback;

-- 9. A member who is also on a support visit gets ONE row, the support one.
begin;
insert into members (tenant_id, user_id, role) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff');
set local role frata_app;
do $$ declare m jsonb := app_access_for('aaaaaaaa-0000-0000-0000-000000000001'); begin
  if jsonb_array_length(m->'memberships') <> 1 or (m->'memberships'->0->>'supportSessionId') is null then raise exception 'FAIL: support row not preferred (%)', m; end if;
end $$;
rollback;

-- 10. Invites: confirmed email claims its own invite only; unconfirmed and expired claim nothing.
begin; set local role frata_app;
do $$ begin
  if app_claim_invites('aaaaaaaa-0000-0000-0000-000000000003') <> 0 then raise exception 'FAIL: unconfirmed email claimed an invite'; end if;
  if app_claim_invites('aaaaaaaa-0000-0000-0000-000000000002') <> 1 then raise exception 'FAIL: confirmed owner did not claim exactly one (expired one must not count)'; end if;
  if app_claim_invites('aaaaaaaa-0000-0000-0000-000000000002') <> 0 then raise exception 'FAIL: an invite was claimed twice'; end if;
end $$;
commit;

-- 11. frata_app on the new tables: only its own tenant, and append-only audit.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from support_sessions where tenant_id <> '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: other tenant support sessions visible'; end if;
  if exists (select 1 from tenant_plans where tenant_id <> '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: other tenant plans visible'; end if;
  if exists (select 1 from audit_events where tenant_id is distinct from '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: other tenant audit visible'; end if;
  begin perform 1 from platform_staff; raise exception 'FAIL: frata_app reads platform_staff'; exception when insufficient_privilege then null; end;
  begin perform 1 from invites; raise exception 'FAIL: frata_app reads invites'; exception when insufficient_privilege then null; end;
  begin insert into members (tenant_id, user_id, role) values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'owner'); raise exception 'FAIL: frata_app adds a member'; exception when insufficient_privilege then null; end;
  begin update audit_events set action = 'x'; raise exception 'FAIL: frata_app rewrites audit'; exception when insufficient_privilege then null; end;
  begin delete from audit_events; raise exception 'FAIL: frata_app deletes audit'; exception when insufficient_privilege then null; end;
  begin update support_sessions set expires_at = now() + interval '1 year'; raise exception 'FAIL: frata_app extends a session'; exception when insufficient_privilege then null; end;
  begin delete from tenants; raise exception 'FAIL: frata_app deletes a tenant'; exception when insufficient_privilege then null; end;
  begin insert into audit_events (tenant_id, actor_user_id, actor_kind, action) values ('22222222-2222-2222-2222-222222222222', gen_random_uuid(), 'member', 'x'); raise exception 'FAIL: audit written into another tenant'; exception when insufficient_privilege then null; end;
end $$;
commit;

-- 12. frata_admin: reads every tenant; no orders rows, outbox or webhooks; history is append-only.
begin; set local role frata_admin;
do $$ begin
  if (select count(*) from tenants where slug like 'proof-%') <> 2 then raise exception 'FAIL: admin cannot see all tenants'; end if;
  if (select count(*) from app_admin_order_counts(now() - interval '1 day')) < 2 then raise exception 'FAIL: admin order counts'; end if;
  begin perform 1 from orders; raise exception 'FAIL: admin reads order rows'; exception when insufficient_privilege then null; end;
  begin perform 1 from outbox; raise exception 'FAIL: admin reads outbox'; exception when insufficient_privilege then null; end;
  begin perform 1 from webhook_events; raise exception 'FAIL: admin reads webhooks'; exception when insufficient_privilege then null; end;
  begin delete from tenants; raise exception 'FAIL: admin deletes a tenant'; exception when insufficient_privilege then null; end;
  begin delete from audit_events; raise exception 'FAIL: admin deletes audit'; exception when insufficient_privilege then null; end;
  begin update plan_versions set fee_bps = 0; raise exception 'FAIL: admin rewrites a plan version'; exception when insufficient_privilege then null; end;
  begin update tenant_plans set starts_at = now(); raise exception 'FAIL: admin rewrites plan history'; exception when insufficient_privilege then null; end;
  begin update support_sessions set expires_at = now() + interval '1 year'; raise exception 'FAIL: admin extends a session'; exception when insufficient_privilege then null; end;
  begin perform app_access_for(gen_random_uuid()); raise exception 'FAIL: admin calls app_access_for'; exception when insufficient_privilege then null; end;
end $$;
commit;

-- 13. No app_* function is callable by public, anon or authenticated; neither app role bypasses RLS.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'app\_%' loop
    if has_function_privilege('anon', f.sig, 'execute') or has_function_privilege('authenticated', f.sig, 'execute')
       or has_function_privilege('public', f.sig, 'execute') then
      raise exception 'FAIL: % is callable by an API role', f.sig;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname in ('frata_app','frata_admin') and rolbypassrls) then raise exception 'FAIL: an app role bypasses RLS'; end if;
end $$;

-- ── Phase 1 (docs/plans/2026-11-06-phase-1-first-sale.md) ─────────────────────
insert into auth.users (id, email, email_confirmed_at) values ('aaaaaaaa-0000-0000-0000-000000000004', 'maker@proof-c.test', now());
insert into shop_settings (tenant_id, pickup_pincode) values
  ('11111111-1111-1111-1111-111111111111', '452009'), ('22222222-2222-2222-2222-222222222222', '110017');
insert into tenant_counters (tenant_id, kind, next) values ('22222222-2222-2222-2222-222222222222', 'order', 41);
insert into pincodes (pincode, city, district, state) values ('452009', 'Indore', 'Indore', 'Madhya Pradesh');

-- 14. Settings and counters: own tenant only; settings are created, never inserted by the app.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if (select count(*) from shop_settings) <> 1 then raise exception 'FAIL: tenant A sees % settings rows', (select count(*) from shop_settings); end if;
  update shop_settings set cod_charge = 1 where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: tenant A edited B settings'; end if;
  if exists (select 1 from tenant_counters) then raise exception 'FAIL: tenant A sees B counters'; end if;
  begin insert into tenant_counters (tenant_id, kind) values ('22222222-2222-2222-2222-222222222222', 'invoice'); raise exception 'FAIL: tenant A wrote B counter'; exception when insufficient_privilege then null; end;
  update tenant_counters set next = 1 where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: tenant A reset B counter'; end if;
  begin insert into shop_settings (tenant_id) values ('11111111-1111-1111-1111-111111111111'); raise exception 'FAIL: app inserts settings'; exception when insufficient_privilege then null; end;
end $$;
commit;

-- 15. Shops and hosts: the app renames its own shop and nothing else; never makes a host or a shop.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  update tenants set name = 'Proof A renamed' where id = '11111111-1111-1111-1111-111111111111'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: app cannot rename its own shop'; end if;
  begin update tenants set slug = 'stolen'; raise exception 'FAIL: app changes a slug'; exception when insufficient_privilege then null; end;
  begin update tenants set is_internal = true; raise exception 'FAIL: app marks itself internal'; exception when insufficient_privilege then null; end;
  begin insert into tenants (slug, name) values ('x-shop', 'X'); raise exception 'FAIL: app creates a tenant'; exception when insufficient_privilege then null; end;
  begin insert into tenant_domains (host, tenant_id) values ('squat.frata.test', '11111111-1111-1111-1111-111111111111'); raise exception 'FAIL: app adds a host'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- 16. Reference and platform tables: pincodes read-only, rate limits writable, both tenant-free.
begin; set local role frata_app;
do $$ begin
  if (select city from pincodes where pincode = '452009') <> 'Indore' then raise exception 'FAIL: pincode read'; end if;
  begin insert into pincodes values ('110001', 'x', 'x', 'x'); raise exception 'FAIL: app writes pincodes'; exception when insufficient_privilege then null; end;
  insert into rate_limits (key, window_start, n) values ('proof', now(), 1);
  if (select id from app_tenant_for_slug('PROOF-A')) <> '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: slug lookup'; end if;
  if app_slug_available('proof-a') or not app_slug_available('proof-zz') then raise exception 'FAIL: slug availability'; end if;
end $$;
rollback;

-- 17. app_create_shop: confirmed email only, one shop a person, taken or bad addresses add nothing.
begin; set local role frata_app;
do $$ declare t uuid; begin
  begin perform app_create_shop('aaaaaaaa-0000-0000-0000-000000000003', 'Squat', 'squat-shop', '452009', '{}'); raise exception 'FAIL: unconfirmed email made a shop';
  exception when raise_exception then if sqlerrm <> 'email_unconfirmed' then raise; end if; end;
  begin perform app_create_shop('aaaaaaaa-0000-0000-0000-000000000002', 'Second', 'second-shop', '452009', '{}'); raise exception 'FAIL: an owner made a second shop';
  exception when raise_exception then if sqlerrm <> 'has_shop' then raise; end if; end;
  begin perform app_create_shop('aaaaaaaa-0000-0000-0000-000000000004', 'Taken', 'proof-a', '452009', '{}'); raise exception 'FAIL: a taken address was accepted';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin perform app_create_shop('aaaaaaaa-0000-0000-0000-000000000004', 'Bad', '-bad-', '452009', '{}'); raise exception 'FAIL: a bad address was accepted';
  exception when raise_exception then if sqlerrm <> 'bad_slug' then raise; end if; end;
  t := app_create_shop('aaaaaaaa-0000-0000-0000-000000000004', '  Proof C  ', 'proof-c', '452009', array['women','ethnic']);
  begin perform app_create_shop('aaaaaaaa-0000-0000-0000-000000000004', 'Again', 'proof-d', '452009', '{}'); raise exception 'FAIL: one person made two shops';
  exception when raise_exception then if sqlerrm <> 'has_shop' then raise; end if; end;
  perform set_config('app.tenant_id', t::text, true);
  if (select name from tenants) <> 'Proof C' then raise exception 'FAIL: new shop name'; end if;
  if (select pickup_pincode from shop_settings) <> '452009' then raise exception 'FAIL: new shop settings'; end if;
  if (select count(*) from tenant_plans) <> 1 then raise exception 'FAIL: new shop plan'; end if;
  if (select count(*) from audit_events where action = 'shop.created') <> 1 then raise exception 'FAIL: new shop audit'; end if;
end $$;
rollback;
do $$ begin
  if exists (select 1 from members where user_id = 'aaaaaaaa-0000-0000-0000-000000000004') then raise exception 'FAIL: a refused or rolled-back creation left a member'; end if;
end $$;

-- 18. Every app_* definer function pins an empty search_path.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'app\_%' and p.prosecdef loop
    if not coalesce('search_path=""' = any(f.proconfig) or 'search_path=' = any(f.proconfig), false) then
      raise exception 'FAIL: % has search_path %', f.sig, f.proconfig;
    end if;
  end loop;
end $$;

-- 19. shop_policies: own tenant only. Shop address: an owner of THAT shop, before publishing.
insert into auth.users (id, email, email_confirmed_at) values ('aaaaaaaa-0000-0000-0000-000000000005', 'staff@proof-b.test', now());
insert into members (tenant_id, user_id, role) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000005', 'staff');
insert into shop_policies (tenant_id, kind, body, updated_by) values ('22222222-2222-2222-2222-222222222222', 'returns', 'B text', 'aaaaaaaa-0000-0000-0000-000000000002');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from shop_policies) then raise exception 'FAIL: tenant A sees B policies'; end if;
  begin insert into shop_policies (tenant_id, kind, body, updated_by) values ('22222222-2222-2222-2222-222222222222', 'terms', 'x', gen_random_uuid()); raise exception 'FAIL: A wrote B policy'; exception when insufficient_privilege then null; end;
  update shop_policies set body = 'stolen' where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A rewrote B policy'; end if;
  delete from shop_policies where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B policy'; end if;
  -- 0002 owns B (claimed its invite in 10); 9999… owns A.
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999', 'stolen-b'); raise exception 'FAIL: an owner of A moved B';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000005', 'staff-move'); raise exception 'FAIL: a staff member moved the shop';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-a'); raise exception 'FAIL: moved onto a taken address';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-new');
  if (select id from app_tenant_for_slug('proof-b-new')) <> '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: address change'; end if;
end $$;
rollback;
begin;
update shop_settings set published_at = now() where tenant_id = '22222222-2222-2222-2222-222222222222';
set local role frata_app;
do $$ begin
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-late'); raise exception 'FAIL: a published shop moved itself';
  exception when raise_exception then if sqlerrm <> 'published' then raise; end if; end;
end $$;
rollback;

-- 20. Catalogue: own shop only, and a child row can never point at another shop's product.
insert into product_types (id, tenant_id, name, size_chart) values
  ('dddddddd-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Kurta', '{"columns":[],"rows":[],"howToMeasure":""}');
insert into products (id, tenant_id, handle, title, type_id) values
  ('eeeeeeee-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'a-kurta', 'A kurta', null),
  ('eeeeeeee-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'b-kurta', 'B kurta', 'dddddddd-0000-0000-0000-00000000000b');
insert into variants (tenant_id, product_id, option_values, price, unit_cost) values
  ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', '{M}', 249000, 98000);
insert into product_images (tenant_id, product_id, base, widths, width, height) values
  ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'https://s.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/products/b', '{400}', 1, 1);
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if (select count(*) from products) <> 1 or exists (select 1 from variants) or exists (select 1 from product_types) then raise exception 'FAIL: tenant A sees B catalogue'; end if;
  update variants set price = 1 where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A repriced B'; end if;
  if exists (select 1 from product_images) then raise exception 'FAIL: A sees B photos'; end if;
  update product_images set base = 'x' where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B photo'; end if;
  delete from product_images where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B photo'; end if;
  delete from variants where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B variant'; end if;
  delete from products where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B product'; end if;
  -- Probing B's sizes: the SAME values B has must fail as a foreign key, not as a duplicate (which would leak them).
  begin insert into variants (tenant_id, product_id, option_values, price) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', '{M}', 1); raise exception 'FAIL: A attached B size';
  exception when foreign_key_violation then null; end;
  -- A's own variant pointing at B's product: the composite key refuses it, RLS or not.
  begin insert into variants (tenant_id, product_id, price) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', 1); raise exception 'FAIL: A attached a variant to B product';
  exception when foreign_key_violation then null; end;
  begin insert into product_images (tenant_id, product_id, base, widths, width, height) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', 'x', '{400}', 1, 1); raise exception 'FAIL: A attached a photo to B product';
  exception when foreign_key_violation then null; end;
  begin update products set type_id = 'dddddddd-0000-0000-0000-00000000000b' where id = 'eeeeeeee-0000-0000-0000-00000000000a'; raise exception 'FAIL: A used B size chart';
  exception when foreign_key_violation then null; end;
  begin insert into products (tenant_id, handle, title) values ('22222222-2222-2222-2222-222222222222', 'x', 'X'); raise exception 'FAIL: A made a product in B'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if has_table_privilege('frata_admin', 'variants', 'select') or has_table_privilege('frata_admin', 'products', 'select') then raise exception 'FAIL: admin reads the catalogue directly'; end if;
end $$;

-- 21. Product model: colours, attributes, collections, handle history — own shop only; history append-only.
insert into collections (id, tenant_id, handle, title, kind) values ('ffffffff-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'festive', 'Festive', 'manual');
insert into collection_products (tenant_id, collection_id, product_id) values ('22222222-2222-2222-2222-222222222222', 'ffffffff-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b');
insert into product_colours (tenant_id, product_id, value, family) values ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'Indigo', '2');
insert into product_handle_history (tenant_id, handle, product_id) values ('22222222-2222-2222-2222-222222222222', 'old-b', 'eeeeeeee-0000-0000-0000-00000000000b');
insert into product_attributes (tenant_id, product_id, attribute, values) values ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'fabric', '{frata:chanderi}');
insert into product_images (id, tenant_id, product_id, base, widths, width, height) values
  ('abababab-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'https://s.public.blob.vercel-storage.com/tenants/11111111-1111-1111-1111-111111111111/products/a', '{400}', 1, 1),
  ('abababab-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'https://s.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/products/b2', '{400}', 1, 1);
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from collections) or exists (select 1 from collection_products) or exists (select 1 from product_colours) or exists (select 1 from product_handle_history) then raise exception 'FAIL: A sees B product model rows'; end if;
  begin insert into collection_products (tenant_id, collection_id, product_id) values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000a'); raise exception 'FAIL: A added to B collection';
  exception when foreign_key_violation then null; end;
  begin insert into product_colours (tenant_id, product_id, value) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', 'Red'); raise exception 'FAIL: A coloured B product';
  exception when foreign_key_violation then null; end;
  begin insert into product_handle_history (tenant_id, handle, product_id) values ('11111111-1111-1111-1111-111111111111', 'old-b', 'eeeeeeee-0000-0000-0000-00000000000b'); raise exception 'FAIL: A pointed a handle at B product';
  exception when foreign_key_violation then null; end;
  insert into product_handle_history (tenant_id, handle, product_id) values ('11111111-1111-1111-1111-111111111111', 'old-a', 'eeeeeeee-0000-0000-0000-00000000000a');
  begin update product_handle_history set product_id = 'eeeeeeee-0000-0000-0000-00000000000a'; raise exception 'FAIL: app re-pointed an old address'; exception when insufficient_privilege then null; end;
  begin delete from product_handle_history; raise exception 'FAIL: app deleted an old address'; exception when insufficient_privilege then null; end;
  update collections set title = 'x'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A renamed B collection'; end if;
  if exists (select 1 from product_attributes) then raise exception 'FAIL: A sees B details'; end if;
  update product_attributes set values = '{x}'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B details'; end if;
  begin insert into product_attributes (tenant_id, product_id, attribute, values) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', 'fabric', '{x}'); raise exception 'FAIL: A gave B product details';
  exception when foreign_key_violation then null; end;
  -- A swatch crop from another shop's photo: refused by the composite key.
  begin insert into product_colours (tenant_id, product_id, value, crop_image_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'Rust',
    'abababab-0000-0000-0000-00000000000b'); raise exception 'FAIL: A cropped B photo';
  exception when foreign_key_violation then null; end;
  -- Removing a photo used as a swatch clears only the crop; the colour keeps its shop.
  insert into product_colours (tenant_id, product_id, value, crop_image_id, crop) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'Indigo', 'abababab-0000-0000-0000-00000000000a', '{"x":0.5,"y":0.5,"r":0.1}');
  delete from product_images where id = 'abababab-0000-0000-0000-00000000000a';
  if (select crop_image_id from product_colours where value = 'Indigo') is not null then raise exception 'FAIL: crop survived its photo'; end if;
end $$;
rollback;
do $$ begin
  if has_table_privilege('frata_admin', 'collections', 'select') or has_table_privilege('frata_admin', 'product_colours', 'select') or has_table_privilege('frata_admin', 'product_attributes', 'select')
    or has_table_privilege('frata_admin', 'collection_products', 'select') or has_table_privilege('frata_admin', 'product_handle_history', 'select') then raise exception 'FAIL: admin reads the product model directly'; end if;
end $$;

-- 22. Checkout: orders, lines and payment keys — own shop only; a link token from B finds nothing under A; keys unreadable to staff.
insert into variants (id, tenant_id, product_id, option_values, price) values
  ('cdcdcdcd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', '{S}', 100000),
  ('cdcdcdcd-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', '{L}', 100000);
insert into orders (id, tenant_id, number, payment_method, subtotal, total, placed_at, token_hash, idempotency_key, razorpay_order_id, phone) values
  ('acacacac-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 9001, 'cod', 100000, 100000, now(), 'hash-b', 'key-1', 'order_B1', '9829043210');
insert into order_lines (tenant_id, order_id, variant_id, title, qty, unit_price, taxable_value, unit_cost) values
  ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'cdcdcdcd-0000-0000-0000-00000000000b', 'B kurta', 1, 100000, 95238, 40000);
insert into payment_keys (tenant_id, key_id, key_secret_enc, webhook_secret_enc, webhook_key, mode) values
  ('22222222-2222-2222-2222-222222222222', 'rzp_test_abcdef123456', 'enc-secret', 'enc-webhook', 'k_' || repeat('b', 32), 'test');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from orders where tenant_id <> '11111111-1111-1111-1111-111111111111') or exists (select 1 from order_lines) or exists (select 1 from payment_keys) then raise exception 'FAIL: A sees B orders, lines or keys'; end if;
  if exists (select 1 from orders where token_hash = 'hash-b') then raise exception 'FAIL: B order link opens under A'; end if;
  update payment_keys set key_id = 'rzp_live_stolen00' ; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B keys'; end if;
  update orders set paid_at = now() where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A marked B order paid'; end if;
  -- The same idempotency key and Razorpay order id in A: allowed (unique per shop only, so nothing about B leaks).
  insert into orders (id, tenant_id, number, payment_method, subtotal, total, placed_at, idempotency_key, razorpay_order_id) values
    ('acacacac-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 9001, 'cod', 100000, 100000, now(), 'key-1', 'order_B1');
  begin insert into orders (tenant_id, number, payment_method, placed_at, idempotency_key) values ('11111111-1111-1111-1111-111111111111', 9002, 'cod', now(), 'key-1'); raise exception 'FAIL: one key made two orders';
  exception when unique_violation then null; end;
  -- A line in A's order pointing at B's variant: the composite key refuses it.
  begin insert into order_lines (tenant_id, order_id, variant_id, title, qty, unit_price, taxable_value) values
    ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-00000000000b', 'x', 1, 1, 1); raise exception 'FAIL: A sold B variant';
  exception when foreign_key_violation then null; end;
  begin insert into order_lines (tenant_id, order_id, title, qty, unit_price, taxable_value) values
    ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000b', 'x', 1, 1, 1); raise exception 'FAIL: A added a line to B order';
  exception when foreign_key_violation then null; end;
  begin update order_lines set qty = 2; raise exception 'FAIL: app edited a sold line'; exception when insufficient_privilege then null; end;
  -- The total is its parts.
  begin insert into orders (tenant_id, number, payment_method, placed_at, subtotal, shipping, total) values ('11111111-1111-1111-1111-111111111111', 9003, 'cod', now(), 100000, 7900, 100000); raise exception 'FAIL: a total that is not its parts';
  exception when check_violation then null; end;
end $$;
rollback;
do $$ declare t uuid; e text; begin
  -- The webhook lookup: B's key gives B and its webhook secret only; a random key nothing; nobody but frata_app may call it.
  select tenant_id, webhook_secret_enc into t, e from app_payment_webhook_for('k_' || repeat('b', 32));
  if t <> '22222222-2222-2222-2222-222222222222' or e <> 'enc-webhook' then raise exception 'FAIL: webhook key did not find its shop'; end if;
  if exists (select 1 from app_payment_webhook_for('k_' || repeat('c', 32))) or exists (select 1 from app_payment_webhook_for('x')) then raise exception 'FAIL: a random key found a shop'; end if;
  if has_function_privilege('anon', 'app_payment_webhook_for(text)', 'execute') or has_function_privilege('authenticated', 'app_payment_webhook_for(text)', 'execute') then raise exception 'FAIL: anon can look up webhook keys'; end if;
  if has_table_privilege('frata_admin', 'payment_keys', 'select') or has_table_privilege('frata_admin', 'order_lines', 'select') then raise exception 'FAIL: staff read keys or costs directly'; end if;
end $$;

-- 23. Platform tables inside a tenant: B's webhook events and outbox rows are invisible to A; with no tenant set the sweep sees all.
insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:b:payment.captured:pay_1', '22222222-2222-2222-2222-222222222222', '{"phone":"9829043210"}');
insert into outbox (tenant_id, kind, dedupe_key, payload) values ('22222222-2222-2222-2222-222222222222', 'test.kind', 'b-1', '{}');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from webhook_events where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: A reads B webhook payloads'; end if;
  if exists (select 1 from outbox where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: A reads B outbox'; end if;
end $$;
rollback;
begin; set local role frata_app;
do $$ begin
  if not exists (select 1 from webhook_events where event_key = 'razorpay:b:payment.captured:pay_1') then raise exception 'FAIL: the platform sweep cannot see events'; end if;
end $$;
rollback;

-- 24. Inside a shop's transaction, webhook events and outbox rows stay in that shop (no insert for B, no move to B).
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  begin insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:fake-for-b', '22222222-2222-2222-2222-222222222222', '{}'); raise exception 'FAIL: A wrote a webhook event for B';
  exception when insufficient_privilege then null; end;
  insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:a-own', '11111111-1111-1111-1111-111111111111', '{}');
  begin update webhook_events set tenant_id = '22222222-2222-2222-2222-222222222222' where event_key = 'razorpay:a-own'; raise exception 'FAIL: A moved a webhook event to B';
  exception when insufficient_privilege then null; end;
  insert into outbox (tenant_id, kind, dedupe_key, payload) values ('11111111-1111-1111-1111-111111111111', 'test.kind', 'a-own', '{}');
  begin update outbox set tenant_id = '22222222-2222-2222-2222-222222222222' where dedupe_key = 'a-own'; raise exception 'FAIL: A moved an outbox row to B';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

\echo 'tenancy proof — all 24 checks passed'
