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
insert into orders (tenant_id, number, payment_method, net_revenue, placed_at) values
  ('11111111-1111-1111-1111-111111111111', 1, 'cod', 100000, now()),
  ('22222222-2222-2222-2222-222222222222', 1, 'prepaid', 50000, now());

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
    insert into orders (tenant_id, number, payment_method, net_revenue, placed_at)
      values ('22222222-2222-2222-2222-222222222222', 9, 'cod', 1, now());
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

\echo 'tenancy proof — all 18 checks passed'
