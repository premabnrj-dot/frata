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

-- 13. No app_* function is callable by public, anon, authenticated or service_role; neither app role bypasses RLS.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'app\_%' loop
    if has_function_privilege('anon', f.sig, 'execute') or has_function_privilege('authenticated', f.sig, 'execute')
       or has_function_privilege('public', f.sig, 'execute') or has_function_privilege('service_role', f.sig, 'execute') then
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

-- 18. Every definer function in public pins an empty search_path (any name: tenancy audit 2026-11-08).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
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
-- Shop addresses D·1 (0067/0068): after the first opening, two renames; the old names stay the shop's (retired, redirecting)
-- and no other shop can take them, by any creator; a close doesn't reset the count; a freeze refuses; Frrata's rename
-- retires without a redirect; the app reads only its own names.
update shop_settings set published_at = now() where tenant_id = '22222222-2222-2222-2222-222222222222';
update shop_settings set published_at = null where tenant_id = '22222222-2222-2222-2222-222222222222';
-- A confirmed person with no shop yet, so the sign-up proof below reaches the name check (not "email_unconfirmed").
insert into auth.users (id, email, email_confirmed_at) values ('aaaaaaaa-0000-0000-0000-000000000009', 'newcomer@proof.test', now());
set local role frata_app;
do $$ declare r record; begin
  perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-two');
  perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-three');
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-four'); raise exception 'FAIL: a third rename after opening';
  exception when raise_exception then if sqlerrm <> 'no_renames_left' then raise; end if; end;
  select * into r from app_shop_for_name('proof-b-two');
  if r.id <> '22222222-2222-2222-2222-222222222222' or not r.retired or r.retired_by_frrata or r.current_name <> 'proof-b-three' then raise exception 'FAIL: an old name must stay the shop''s and redirect'; end if;
  if app_name_check('proof-b-two') <> 'taken' then raise exception 'FAIL: a retired name looked free'; end if;
  begin perform app_change_shop_address('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'proof-b-two'); raise exception 'FAIL: A took B''s retired name';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin perform app_create_shop('aaaaaaaa-0000-0000-0000-000000000009', 'Squatter', 'proof-b-two', '110001', '{}'); raise exception 'FAIL: sign-up took a retired name';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin insert into shop_names (name, tenant_id) values ('proof-a-steal', '11111111-1111-1111-1111-111111111111'); raise exception 'FAIL: app writes a name';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
begin;
-- Every creator goes through the trigger: a direct insert of a retired name fails as "slug_taken".
insert into shop_names (name, tenant_id, retired_at) values ('proof-held', '22222222-2222-2222-2222-222222222222', now());
do $$ begin
  begin insert into tenants (slug, name) values ('proof-held', 'Taker'); raise exception 'FAIL: a new shop took a retired name';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin update tenants set slug = 'proof-unrecorded' where id = '11111111-1111-1111-1111-111111111111'; raise exception 'FAIL: a slug moved outside the rename definers';
  exception when raise_exception then if sqlerrm <> 'rename_through_definer' then raise; end if; end;
end $$;
update tenants set address_frozen_at = now() where id = '22222222-2222-2222-2222-222222222222';
set local role frata_app;
do $$ begin
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-frozen'); raise exception 'FAIL: a frozen shop renamed itself';
  exception when raise_exception then if sqlerrm <> 'frozen' then raise; end if; end;
end $$;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if exists (select 1 from shop_names where tenant_id = '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: B reads A''s names'; end if;
  if not exists (select 1 from shop_names where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: B can''t read its own names'; end if;
end $$;
rollback;
begin;
insert into platform_staff (user_id, email, role) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'staff@proof.test', 'admin') on conflict do nothing;
set local role frata_admin;
do $$ declare r record; begin
  perform app_admin_rename_shop('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'proof-b-renamed', 'Copies another brand');
  select n.retired_by_frrata as by_frrata into r from shop_names n where n.name = 'proof-b';
  if not r.by_frrata then raise exception 'FAIL: Frrata''s rename must not redirect'; end if;
  begin update tenants set slug = 'admin-direct' where id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: Admin wrote a slug directly';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
begin;
-- Shop addresses D1·7 (0069): Admin's address writes are for the admin role only (support is refused in SQL); a freeze
-- goes through its definer (no direct write); a release frees only a retired name, never a shop's current one.
insert into platform_staff (user_id, email, role) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'staff@proof.test', 'admin'), ('aaaaaaaa-0000-0000-0000-0000000000fe', 'support@proof.test', 'support') on conflict do nothing;
do $$ declare f text; begin
  foreach f in array array['app_admin_rename_shop(uuid,uuid,text,text)', 'app_admin_freeze_address(uuid,uuid,boolean,text)', 'app_admin_release_name(uuid,text,text)',
                           'app_admin_block_name(uuid,text,text,text)', 'app_admin_unblock_name(uuid,text,text)'] loop
    if has_function_privilege('frata_app', f, 'execute') or has_function_privilege('service_role', f, 'execute') then raise exception 'FAIL: % is callable outside Admin', f; end if;
    if not has_function_privilege('frata_admin', f, 'execute') then raise exception 'FAIL: Admin cannot call %', f; end if;
  end loop;
end $$;
insert into shop_names (name, tenant_id, retired_at) values ('proof-b-old', '22222222-2222-2222-2222-222222222222', now());
set local role frata_admin;
do $$ begin
  begin perform app_admin_rename_shop('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-0000000000fe', 'proof-b-support', 'Support tried'); raise exception 'FAIL: support renamed a shop';
  exception when raise_exception then if sqlerrm <> 'not_staff' then raise; end if; end;
  begin perform app_admin_freeze_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-0000000000fe', true, 'Support tried'); raise exception 'FAIL: support froze a shop';
  exception when raise_exception then if sqlerrm <> 'not_staff' then raise; end if; end;
  begin perform app_admin_release_name('aaaaaaaa-0000-0000-0000-0000000000fe', 'proof-b-old', 'Support tried'); raise exception 'FAIL: support released a name';
  exception when raise_exception then if sqlerrm <> 'not_staff' then raise; end if; end;
  begin update tenants set address_frozen_at = now() where id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: Admin froze a shop without its definer';
  exception when insufficient_privilege then null; end;
  begin perform app_admin_block_name('aaaaaaaa-0000-0000-0000-0000000000fe', 'proof-brand', 'protected', 'Support tried'); raise exception 'FAIL: support blocked a name';
  exception when raise_exception then if sqlerrm <> 'not_staff' then raise; end if; end;
  begin insert into blocked_names (name, kind, reason) values ('proof-direct', 'protected', 'Direct'); raise exception 'FAIL: Admin blocked a name without its definer';
  exception when insufficient_privilege then null; end;
  if not app_admin_block_name('aaaaaaaa-0000-0000-0000-0000000000ff', 'proof-brand', 'protected', 'Trademark') then raise exception 'FAIL: block did not add'; end if;
  if app_name_check('proof-brand') <> 'taken' then raise exception 'FAIL: a blocked name looked free'; end if;
  if not app_admin_unblock_name('aaaaaaaa-0000-0000-0000-0000000000ff', 'proof-brand', 'Licence') then raise exception 'FAIL: unblock did not remove'; end if;
  begin perform app_admin_release_name('aaaaaaaa-0000-0000-0000-0000000000ff', 'proof-b', 'Current name'); raise exception 'FAIL: a current name was released';
  exception when raise_exception then if sqlerrm <> 'not_retired' then raise; end if; end;
  perform app_admin_freeze_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-0000000000ff', true, 'Phishing report');
  if (select address_frozen_at from tenants where id = '22222222-2222-2222-2222-222222222222') is null then raise exception 'FAIL: the freeze did not hold'; end if;
  if app_admin_release_name('aaaaaaaa-0000-0000-0000-0000000000ff', 'proof-b-old', 'Owner asked') <> '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: release must name the shop that held it'; end if;
  if app_name_check('proof-b-old') <> 'ok' then raise exception 'FAIL: a released name stayed taken'; end if;
  if (select count(*) from audit_events where action in ('shop.address_frozen', 'shop.name_released') and tenant_id = '22222222-2222-2222-2222-222222222222') <> 2
     or (select count(*) from audit_events where action in ('name.blocked', 'name.unblocked') and target = 'proof-brand') <> 2 then raise exception 'FAIL: Admin''s address writes must be audited'; end if;
end $$;
rollback;

begin;
-- Own domains D2·2 (0082/0083): a shop reads only its own domain rows and writes none; one live shop per apex (www and
-- subdomains included); the database makes every token and none repeats; nothing happens before a row's own proof; a
-- parked row is a removed one; Frrata's, Vercel's and www hosts are refused; Admin writes nothing directly.
insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values
  ('11111111-1111-1111-1111-111111111111', 'proof-a.in', 'proof-a.in', true, '99999999-9999-9999-9999-999999999999'),
  ('22222222-2222-2222-2222-222222222222', 'proof-a.in', 'proof-a.in', true, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('22222222-2222-2222-2222-222222222222', 'shop.proof-a.in', 'proof-a.in', false, 'aaaaaaaa-0000-0000-0000-000000000002');
update shop_domains set proved_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111';
do $$ declare t text; begin
  if (select count(distinct token) from shop_domains) <> 3 or exists (select 1 from shop_domains where token !~ '^[0-9a-f]{32}$') then raise exception 'FAIL: tokens must be the database''s, 128-bit and distinct'; end if;
  select token into t from shop_domains where tenant_id = '11111111-1111-1111-1111-111111111111';
  begin update shop_domains set token = t where host = 'shop.proof-a.in'; raise exception 'FAIL: B copied A''s token';
  exception when unique_violation then null; end;
  begin update shop_domains set proved_at = now() where tenant_id = '22222222-2222-2222-2222-222222222222' and host = 'proof-a.in'; raise exception 'FAIL: two shops hold one host live';
  exception when unique_violation then null; end;
  begin update shop_domains set proved_at = now() where host = 'shop.proof-a.in'; raise exception 'FAIL: a second shop went live under the same apex';
  exception when unique_violation then null; end;
  begin insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values ('22222222-2222-2222-2222-222222222222', 'www.proof-b.in', 'proof-b.in', false, 'aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FAIL: a www host was claimed on its own';
  exception when check_violation then null; end;
  begin insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values ('22222222-2222-2222-2222-222222222222', 'shop.frrata.co.in', 'frrata.co.in', false, 'aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FAIL: a Frrata host was claimed';
  exception when check_violation then null; end;
  begin insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values ('22222222-2222-2222-2222-222222222222', 'x.vercel.app', 'x.vercel.app', false, 'aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FAIL: a vercel.app host was claimed';
  exception when check_violation then null; end;
  begin insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values ('22222222-2222-2222-2222-222222222222', 'other.in', 'proof-b.in', false, 'aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FAIL: a host outside its apex';
  exception when check_violation then null; end;
  begin update shop_domains set cert_ok_at = now() where host = 'shop.proof-a.in'; raise exception 'FAIL: a certificate before the row''s own proof';
  exception when check_violation then null; end;
  begin update shop_domains set parked_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111'; raise exception 'FAIL: parked but not removed';
  exception when check_violation then null; end;
  begin update shop_domains set main_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111'; raise exception 'FAIL: main without a certificate';
  exception when check_violation then null; end;
  insert into shop_domains (tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values ('11111111-1111-1111-1111-111111111111', 'proof-a2.in', 'proof-a2.in', true, '99999999-9999-9999-9999-999999999999', now(), now());
  update shop_domains set cert_ok_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111';
  begin update shop_domains set main_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111'; raise exception 'FAIL: two main domains for one shop';
  exception when unique_violation then null; end;
end $$;
set local role frata_admin;
do $$ begin
  begin update shop_domains set removed_at = now(), removed_reason = 'x'; raise exception 'FAIL: Admin writes a domain directly';
  exception when insufficient_privilege then null; end;
  begin insert into tenant_domains (host, tenant_id) values ('proof-old.in', '11111111-1111-1111-1111-111111111111'); raise exception 'FAIL: Admin still adds to tenant_domains';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if exists (select 1 from shop_domains where tenant_id = '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: B reads A''s domains'; end if;
  if not exists (select 1 from shop_domains where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: B can''t read its own domains'; end if;
  begin update shop_domains set proved_at = now(); raise exception 'FAIL: the app writes a domain';
  exception when insufficient_privilege then null; end;
  begin delete from shop_domains; raise exception 'FAIL: the app deletes a domain';
  exception when insufficient_privilege then null; end;
  begin insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values ('22222222-2222-2222-2222-222222222222', 'proof-c.in', 'proof-c.in', false, 'aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FAIL: the app claims a domain directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon', 'shop_domains', 'select') or has_table_privilege('authenticated', 'shop_domains', 'select') or has_table_privilege('service_role', 'shop_domains', 'select') then raise exception 'FAIL: an API role reads shop_domains'; end if;
end $$;
rollback;

begin;
-- Own domains D2·6 (0084): claims are the shop's, owners and admins only, capped; a check writes only its own shop's
-- row (B's id under A matches nothing); a proof is this row's own token seen by both resolvers; a live apex moves only
-- when its token is gone (a main one after 72 h), both tokens seen is a dispute; main needs proof, certificate, the
-- project and — on live payments — Razorpay's approval; only a proved row on our project serves.
set local role frata_app;
do $$ declare a uuid; a2 uuid; b uuid; ta text; tb text; r record; begin
  begin perform app_claim_domain('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-x.in', 'proof-x.in', true, 47); raise exception 'FAIL: B''s owner claimed for A';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  select c.id, c.token into a, ta from app_claim_domain('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'proof-x.in', 'proof-x.in', true, 47) c;
  select c.id into a2 from app_claim_domain('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'proof-x.in', 'proof-x.in', true, 47) c;
  if a2 <> a then raise exception 'FAIL: a second Continue made a second claim'; end if;
  select c.id, c.token into b, tb from app_claim_domain('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-x.in', 'proof-x.in', true, 47) c;
  begin perform app_claim_domain('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-y.in', 'proof-y.in', true, 5); raise exception 'FAIL: the project''s room was ignored';
  exception when raise_exception then if sqlerrm <> 'capacity' then raise; end if; end;
  perform app_claim_domain('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'shop.proof-y.in', 'proof-y.in', false, 47);
  begin perform app_claim_domain('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'www2.proof-y.in', 'proof-y.in', false, 47); raise exception 'FAIL: a second host of the same apex';
  exception when raise_exception then if sqlerrm <> 'same_apex' then raise; end if; end;
  begin perform app_claim_domain('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-z.in', 'proof-z.in', true, 47); raise exception 'FAIL: more than 4 hosts';
  exception when raise_exception then if sqlerrm <> 'four_hosts' then raise; end if; end;

  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if exists (select 1 from app_domain_lease(b)) then raise exception 'FAIL: A leased B''s row'; end if;
  if (select x.state from app_domain_record(b, array['frrata-verify=' || tb], array['frrata-verify=' || tb], 'yes', 'yes', 'yes', 47) x) <> 'gone' then raise exception 'FAIL: A wrote B''s row'; end if;
  if not exists (select 1 from app_domain_lease(a)) then raise exception 'FAIL: A can''t lease its own row'; end if;
  if exists (select 1 from app_domain_lease(a)) then raise exception 'FAIL: two leases within 10 s'; end if;
  select * into r from app_domain_record(a, array['frrata-verify=' || tb], array['frrata-verify=' || tb], 'no', 'no', 'no', 47);
  if r.state <> 'waiting' then raise exception 'FAIL: another row''s token proved A (%)', r.state; end if;
  select * into r from app_domain_record(a, array['frrata-verify=' || ta], array['frrata-verify=' || ta], 'no', 'no', 'no', 47);
  if r.state <> 'waiting' or not r.add_now then raise exception 'FAIL: A''s own token must prove it and ask for the add (% %)', r.state, r.add_now; end if;
  if exists (select 1 from app_shop_for_domain('proof-x.in')) then raise exception 'FAIL: a domain served before it was on our project'; end if;
  perform app_domain_added(a, true, null);
  select * into r from app_domain_record(a, array['frrata-verify=' || ta], array['frrata-verify=' || ta], 'yes', 'yes', 'yes', 47);
  if r.state <> 'connected' then raise exception 'FAIL: A should be connected (%)', r.state; end if;
  if (select s.id from app_shop_for_domain('proof-x.in') s) <> '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: the lookup must serve A'; end if;

  -- B shows both tokens: a dispute, nothing moves.
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  select * into r from app_domain_record(b, array['frrata-verify=' || tb, 'frrata-verify=' || ta], array['frrata-verify=' || tb, 'frrata-verify=' || ta], 'yes', 'yes', 'yes', 47);
  if r.state <> 'dispute' then raise exception 'FAIL: both tokens must be a dispute (%)', r.state; end if;
end $$;
reset role;
-- A's domain is main; A takes live payments: B must wait 72 h, and A's Make main needed Razorpay's approval.
insert into payment_keys (tenant_id, key_id, key_secret_enc, webhook_secret_enc, webhook_key, mode, webhook_seen_at) values
  ('11111111-1111-1111-1111-111111111111', 'rzp_live_proofproof', 'x', 'x', 'k_proof_a', 'live', now()) on conflict do nothing;
set local role frata_app;
do $$ declare a uuid; b uuid; tb text; r record; begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  select d.id into a from shop_domains d where d.tenant_id = '11111111-1111-1111-1111-111111111111' and d.host = 'proof-x.in';
  begin perform app_make_domain_main('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', a); raise exception 'FAIL: main on live payments without Razorpay''s approval';
  exception when raise_exception then if sqlerrm <> 'razorpay' then raise; end if; end;
  begin perform app_domain_razorpay_ok('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', a, true); raise exception 'FAIL: another shop''s owner ticked Razorpay';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  perform app_domain_razorpay_ok('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', a, true);
  perform app_make_domain_main('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', a);
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  select d.id, d.token into b, tb from shop_domains d where d.tenant_id = '22222222-2222-2222-2222-222222222222' and d.host = 'proof-x.in';
  select * into r from app_domain_record(b, array['frrata-verify=' || tb], array['frrata-verify=' || tb], 'yes', 'yes', 'yes', 47);
  if r.state <> 'held' then raise exception 'FAIL: a main domain must wait 72 h (%)', r.state; end if;
end $$;
reset role;
update shop_domains set contest_at = now() - interval '73 hours', checked_at = null where tenant_id = '22222222-2222-2222-2222-222222222222' and host = 'proof-x.in';
set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ declare b uuid; tb text; r record; begin
  select d.id, d.token into b, tb from shop_domains d where d.tenant_id = '22222222-2222-2222-2222-222222222222' and d.host = 'proof-x.in';
  -- A main domain still waits after 72 h: it moves only by Admin until its owner can be told.
  select * into r from app_domain_record(b, array['frrata-verify=' || tb], array['frrata-verify=' || tb], 'yes', 'yes', 'yes', 47);
  if r.state <> 'held' then raise exception 'FAIL: a main domain moved by itself (%)', r.state; end if;
end $$;
reset role;
update shop_domains set main_at = null where tenant_id = '11111111-1111-1111-1111-111111111111' and host = 'proof-x.in';
set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ declare b uuid; tb text; ta text; r record; begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  select d.token into ta from shop_domains d where d.tenant_id = '11111111-1111-1111-1111-111111111111' and d.host = 'proof-x.in';
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  select d.id, d.token into b, tb from shop_domains d where d.tenant_id = '22222222-2222-2222-2222-222222222222' and d.host = 'proof-x.in';
  if ta is null then raise exception 'FAIL: the proof could not read A''s token'; end if;
  -- One resolver still shows A's token: no move.
  select * into r from app_domain_record(b, array['frrata-verify=' || tb], array['frrata-verify=' || tb, 'frrata-verify=' || ta], 'yes', 'yes', 'yes', 47);
  if r.state <> 'dispute' then raise exception 'FAIL: one resolver with the old token must hold the move (%)', r.state; end if;
  -- The project is full: the proof waits, nothing is added.
  select * into r from app_domain_record(b, array['frrata-verify=' || tb], array['frrata-verify=' || tb], 'yes', 'yes', 'yes', 1);
  if r.state <> 'paused' or r.add_now then raise exception 'FAIL: a full project must pause the proof (% %)', r.state, r.add_now; end if;
  select * into r from app_domain_record(b, array['frrata-verify=' || tb], array['frrata-verify=' || tb], 'yes', 'yes', 'yes', 47);
  if r.state <> 'connected' or r.add_now then raise exception 'FAIL: B takes the domain already on our project (% %)', r.state, r.add_now; end if;
  if (select s.id from app_shop_for_domain('proof-x.in') s) <> '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: the moved domain must serve B'; end if;
end $$;
reset role;
do $$ begin
  if (select removed_reason from shop_domains where tenant_id = '11111111-1111-1111-1111-111111111111' and host = 'proof-x.in') <> 'moved'
     or (select main_at from shop_domains where tenant_id = '11111111-1111-1111-1111-111111111111' and host = 'proof-x.in') is not null then raise exception 'FAIL: A''s row must leave as moved, no longer main'; end if;
  if has_function_privilege('anon', 'app_claim_domain(uuid,uuid,text,text,boolean,int)', 'execute') or has_function_privilege('frata_admin', 'app_claim_domain(uuid,uuid,text,text,boolean,int)', 'execute') then raise exception 'FAIL: claim callable outside the app'; end if;
end $$;
rollback;

begin;
-- Own domains D2·7/D2·8 (0084): a removed host on Vercel parks; 3 days pointing away (or 30 days parked) and it comes
-- off — unless another shop holds that apex live (then it stays, and only the row lets go); the due list is ids only.
insert into shop_domains (tenant_id, host, apex, with_www, claimed_by, proved_at, added_at, dns_ok_at, cert_ok_at) values
  ('11111111-1111-1111-1111-111111111111', 'proof-park.in', 'proof-park.in', true, '99999999-9999-9999-9999-999999999999', now(), now(), now(), now());
set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare a uuid; r record; begin
  select d.id into a from shop_domains d where d.host = 'proof-park.in';
  perform app_remove_domain('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', a);
  if (select parked_at from shop_domains where id = a) is null then raise exception 'FAIL: a removed host on Vercel must park'; end if;
  if not exists (select 1 from app_domains_due(50) x where x.id = a and x.parked) then raise exception 'FAIL: a parked row must be due'; end if;
  if not exists (select 1 from app_parked_lease(a)) then raise exception 'FAIL: the parked lease'; end if;
  if app_parked_record(a, 'no') then raise exception 'FAIL: removed on the first day away'; end if;
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  if app_parked_record(a, 'no') or exists (select 1 from app_domain_remove_due(a)) then raise exception 'FAIL: B reached A''s parked row'; end if;
end $$;
reset role;
update shop_domains set away_since = now() - interval '4 days' where host = 'proof-park.in';
set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare a uuid; r record; begin
  select d.id into a from shop_domains d where d.host = 'proof-park.in';
  if not app_parked_record(a, 'no') then raise exception 'FAIL: 3 days away must come off'; end if;
  select * into r from app_domain_remove_due(a);
  if r.host <> 'proof-park.in' or r.www <> 'www.proof-park.in' or r.keep_host or r.keep_www then raise exception 'FAIL: remove_due (% % % %)', r.host, r.www, r.keep_host, r.keep_www; end if;
  perform app_domain_unparked(a);
  if (select parked_at from shop_domains where id = a) is not null then raise exception 'FAIL: unparked'; end if;
end $$;
rollback;

begin;
-- Own domains D2·11 (0084): Admin disconnects and settles held claims — admin role only, a reason, audited; support is refused.
insert into platform_staff (user_id, email, role) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'staff@proof.test', 'admin'), ('aaaaaaaa-0000-0000-0000-0000000000fe', 'support@proof.test', 'support') on conflict do nothing;
insert into shop_domains (tenant_id, host, apex, with_www, claimed_by, proved_at, added_at, dns_ok_at, cert_ok_at, main_at) values
  ('11111111-1111-1111-1111-111111111111', 'proof-adm.in', 'proof-adm.in', true, '99999999-9999-9999-9999-999999999999', now(), now(), now(), now(), now());
insert into shop_domains (tenant_id, host, apex, with_www, claimed_by, contest_at) values
  ('22222222-2222-2222-2222-222222222222', 'proof-adm.in', 'proof-adm.in', true, 'aaaaaaaa-0000-0000-0000-000000000002', now());
set local role frata_admin;
do $$ declare a uuid; b uuid; begin
  select id into a from shop_domains where tenant_id = '11111111-1111-1111-1111-111111111111' and host = 'proof-adm.in';
  select id into b from shop_domains where tenant_id = '22222222-2222-2222-2222-222222222222' and host = 'proof-adm.in';
  begin perform app_admin_settle_domain('aaaaaaaa-0000-0000-0000-0000000000fe', b, true, 'Support tried'); raise exception 'FAIL: support settled a claim';
  exception when raise_exception then if sqlerrm <> 'not_staff' then raise; end if; end;
  begin perform app_admin_disconnect_domain('aaaaaaaa-0000-0000-0000-0000000000ff', a, 'x'); raise exception 'FAIL: no reason';
  exception when raise_exception then if sqlerrm <> 'reason' then raise; end if; end;
  perform app_admin_settle_domain('aaaaaaaa-0000-0000-0000-0000000000ff', b, true, 'Trademark holder proved it');
  if (select removed_reason from shop_domains where id = a) <> 'moved' or (select proved_at from shop_domains where id = b) is null then raise exception 'FAIL: settle must move A''s domain to B'; end if;
  if (select count(*) from audit_events where action in ('domain.moved_away', 'domain.moved_here') and target = 'proof-adm.in') <> 2 then raise exception 'FAIL: both shops'' audit rows'; end if;
  perform app_admin_disconnect_domain('aaaaaaaa-0000-0000-0000-0000000000ff', b, 'Phishing report');
  if (select removed_reason from shop_domains where id = b) <> 'frrata' then raise exception 'FAIL: disconnect'; end if;
  if has_function_privilege('frata_app', 'app_admin_disconnect_domain(uuid,uuid,text)', 'execute') then raise exception 'FAIL: the app can disconnect'; end if;
end $$;
rollback;

begin;
-- Shop addresses D1·8 + D1·9 (0085/0086): a shop on live payments adds a name beside its current one (taken for
-- everyone, serving, never redirecting), makes it main through the rename, or lets it go; one added name at a time;
-- "Razorpay approved it" is per name, owners and admins only.
update shop_settings set published_at = now() where tenant_id = '22222222-2222-2222-2222-222222222222';
set local role frata_app;
do $$ declare r record; begin
  begin perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'proof-b-next'); raise exception 'FAIL: staff added a name';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-next');
  select * into r from app_shop_for_name('proof-b-next');
  if r.id <> '22222222-2222-2222-2222-222222222222' or r.retired or r.current_name = 'proof-b-next' then raise exception 'FAIL: an added name must serve beside the current one'; end if;
  if app_name_check('proof-b-next') <> 'taken' then raise exception 'FAIL: an added name looked free'; end if;
  begin perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-other'); raise exception 'FAIL: two added names';
  exception when raise_exception then if sqlerrm <> 'one_added' then raise; end if; end;
  begin perform app_change_shop_address('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'proof-b-next'); raise exception 'FAIL: A took B''s added name';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin perform app_name_razorpay_ok('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999', 'proof-b-next', true); raise exception 'FAIL: A''s owner ticked B''s name';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  perform app_name_razorpay_ok('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-next', true);
  perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-next');
  select * into r from app_shop_for_name('proof-b');
  if not r.retired or r.current_name <> 'proof-b-next' then raise exception 'FAIL: making the added name main must retire the old one'; end if;
  perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-third');
  if app_drop_added_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002') <> 'proof-b-third' then raise exception 'FAIL: drop'; end if;
  if app_name_check('proof-b-third') <> 'ok' then raise exception 'FAIL: a dropped added name must be free'; end if;
end $$;
reset role;
do $$ begin
  if (select razorpay_ok_at from shop_names where name = 'proof-b-next') is null or (select added_at from shop_names where name = 'proof-b-next') is not null then raise exception 'FAIL: the tick stays with the name; added_at clears when it becomes main'; end if;
  if has_function_privilege('anon', 'app_add_shop_name(uuid,uuid,text)', 'execute') then raise exception 'FAIL: anon adds names'; end if;
  if has_function_privilege('anon', 'app_drop_added_name(uuid,uuid)', 'execute') or has_function_privilege('anon', 'app_name_razorpay_ok(uuid,uuid,text,boolean)', 'execute')
     or has_function_privilege('anon', 'app_let_go_added_names()', 'execute') then raise exception 'FAIL: anon reaches a name definer'; end if;
  if has_function_privilege('frata_app', 'app_let_go_names(uuid,text,boolean)', 'execute') or has_function_privilege('frata_admin', 'app_let_go_names(uuid,text,boolean)', 'execute') then
    raise exception 'FAIL: the internal let-go is callable'; end if;
end $$;
-- The review's cases (2026-11-09): another shop's owner, a staff member, an old name added back, the 14 days, the
-- live-payments rule on the server, the way back from a main domain, and Frrata's takedown.
update tenants set first_opened_at = coalesce(first_opened_at, now()) where id = '22222222-2222-2222-2222-222222222222';
insert into platform_staff (user_id, email, role) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'staff@proof.test', 'admin') on conflict do nothing;
set local role frata_app;
do $$ declare r record; n int; begin
  perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-four');
  begin perform app_drop_added_name('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A''s owner dropped B''s name';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_name_razorpay_ok('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'proof-b-four', true); raise exception 'FAIL: A ticked B''s name in its own shop';
  exception when raise_exception then if sqlerrm <> 'no_name' then raise; end if; end;
  begin perform app_name_razorpay_ok('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'proof-b-four', true); raise exception 'FAIL: staff ticked a name';
  exception when raise_exception then if sqlerrm <> 'not_owner' then raise; end if; end;
  perform app_drop_added_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002');
  -- An old name of the shop added back serves directly; let go again, it redirects again (never free for others).
  perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b');
  select * into r from app_shop_for_name('proof-b');
  if r.retired then raise exception 'FAIL: an old name added back must serve'; end if;
  if app_drop_added_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002') <> 'proof-b' then raise exception 'FAIL: drop the old name'; end if;
  select * into r from app_shop_for_name('proof-b');
  if r.id is null or not r.retired then raise exception 'FAIL: an old name let go must redirect again'; end if;
  begin perform app_add_shop_name('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'proof-b'); raise exception 'FAIL: A added B''s old name';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-exp');
end $$;
reset role;
update shop_names set added_at = now() - interval '15 days', created_at = now() - interval '15 days' where name = 'proof-b-exp';
insert into payment_keys (tenant_id, key_id, key_secret_enc, webhook_secret_enc, webhook_key, mode, webhook_seen_at) values
  ('22222222-2222-2222-2222-222222222222', 'rzp_live_proofprfb', 'x', 'x', 'k_proof_b', 'live', now()) on conflict do nothing;
set local role frata_app;
do $$ declare r record; n int; begin
  select count(*) into n from app_shop_for_name('proof-b-exp');
  if n <> 0 then raise exception 'FAIL: an added name past 14 days must serve nothing'; end if;
  begin perform app_name_razorpay_ok('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-exp', true); raise exception 'FAIL: ticked an expired name';
  exception when raise_exception then if sqlerrm <> 'no_name' then raise; end if; end;
  if not exists (select 1 from app_let_go_added_names() x where x = 'proof-b-exp') then raise exception 'FAIL: the sweep'; end if;
  if app_name_check('proof-b-exp') <> 'ok' then raise exception 'FAIL: an expired added name must be free again'; end if;
  -- Live payments: the rename lands only on a name Razorpay approved.
  perform app_add_shop_name('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-live');
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-live'); raise exception 'FAIL: live rename to an unapproved name';
  exception when raise_exception then if sqlerrm <> 'needs_razorpay' then raise; end if; end;
  begin perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b-oneshot'); raise exception 'FAIL: live one-step rename';
  exception when raise_exception then if sqlerrm <> 'needs_razorpay' then raise; end if; end;
end $$;
reset role;
set local role frata_admin;
do $$ begin
  perform app_admin_block_name('aaaaaaaa-0000-0000-0000-0000000000ff', 'proof-b-live', 'protected', 'Copies another brand');
end $$;
reset role;
do $$ begin
  if exists (select 1 from shop_names where name = 'proof-b-live') then raise exception 'FAIL: blocking must take the added name down'; end if;
  if not exists (select 1 from audit_events where tenant_id = '22222222-2222-2222-2222-222222222222' and action = 'shop.name_taken_down' and target = 'proof-b-live') then raise exception 'FAIL: takedown audit'; end if;
end $$;
-- The way back from a main domain: on live payments, only to an approved name.
update shop_names set razorpay_ok_at = null, razorpay_ok_by = null where tenant_id = '22222222-2222-2222-2222-222222222222';
insert into shop_domains (tenant_id, host, apex, with_www, claimed_by, proved_at, added_at, dns_ok_at, cert_ok_at, main_at, razorpay_ok_at, razorpay_ok_by)
  values ('22222222-2222-2222-2222-222222222222', 'proofb-back.in', 'proofb-back.in', false, 'aaaaaaaa-0000-0000-0000-000000000002', now(), now(), now(), now(), now(), now(), 'aaaaaaaa-0000-0000-0000-000000000002');
set local role frata_app;
do $$ begin
  begin perform app_unmake_domain_main('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FAIL: back to an unapproved name on live payments';
  exception when raise_exception then if sqlerrm <> 'razorpay' then raise; end if; end;
end $$;
reset role;
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
insert into collection_handle_history (tenant_id, handle, collection_id) values ('22222222-2222-2222-2222-222222222222', 'old-festive', 'ffffffff-0000-0000-0000-00000000000b');
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
  -- Collection addresses (S2·2): B's unseen, never pointed at B's collection, append-only.
  if exists (select 1 from collection_handle_history) then raise exception 'FAIL: A sees B old collection addresses'; end if;
  begin insert into collection_handle_history (tenant_id, handle, collection_id) values ('11111111-1111-1111-1111-111111111111', 'old-festive', 'ffffffff-0000-0000-0000-00000000000b'); raise exception 'FAIL: A pointed an address at B collection';
  exception when foreign_key_violation then null; end;
  begin insert into collection_handle_history (tenant_id, handle, collection_id) values ('22222222-2222-2222-2222-222222222222', 'sneaky', 'ffffffff-0000-0000-0000-00000000000b'); raise exception 'FAIL: A wrote B address history';
  exception when insufficient_privilege then null; end;
  begin update collection_handle_history set handle = 'x'; raise exception 'FAIL: app re-pointed an old collection address'; exception when insufficient_privilege then null; end;
  begin delete from collection_handle_history; raise exception 'FAIL: app deleted an old collection address'; exception when insufficient_privilege then null; end;
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
    or has_table_privilege('frata_admin', 'collection_products', 'select') or has_table_privilege('frata_admin', 'product_handle_history', 'select')
    or has_table_privilege('frata_admin', 'collection_handle_history', 'select') then raise exception 'FAIL: admin reads the product model directly'; end if;
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

-- 23. Platform tables inside a tenant: B's webhook events and outbox rows are invisible to A. With no tenant set the
--     sweep learns WHICH shops have events (app_pending_event_shops, C1 audit 2026-11-07) and never reads a WhatsApp row.
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
  if exists (select 1 from webhook_events where provider = 'whatsapp') then raise exception 'FAIL: WhatsApp events readable with no shop set'; end if;
  if not exists (select 1 from app_pending_event_shops('razorpay') x where x = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: the platform sweep cannot find shops with events'; end if;
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


-- 25. Order history and notes (1D): none with no tenant; A reads and appends only A's; nobody edits or removes one.
insert into order_events (tenant_id, order_id, kind, actor_kind) select tenant_id, id, 'confirmed', 'system' from orders where tenant_id = '22222222-2222-2222-2222-222222222222';
insert into order_notes (tenant_id, order_id, body, author_user_id, author_email) select tenant_id, id, 'B note', '99999999-9999-9999-9999-999999999999', 'b@b.in' from orders where tenant_id = '22222222-2222-2222-2222-222222222222';
begin; set local role frata_app;
do $$ begin
  if (select count(*) from order_events) + (select count(*) from order_notes) <> 0 then raise exception 'FAIL: order history visible with no tenant set'; end if;
end $$;
rollback;
select id as b_order from orders where tenant_id = '22222222-2222-2222-2222-222222222222' limit 1 \gset
select id as b_event from order_events where tenant_id = '22222222-2222-2222-2222-222222222222' limit 1 \gset
insert into order_lines (tenant_id, order_id, title, qty, unit_price, taxable_value) select tenant_id, id, 'Kurta', 1, 100000, 95238 from orders where number = 1;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
select set_config('proof.b_order', :'b_order', true), set_config('proof.b_event', :'b_event', true);
do $$ declare a_order uuid; a_event uuid; b_order uuid := current_setting('proof.b_order')::uuid; b_event uuid := current_setting('proof.b_event')::uuid; n int; begin
  select id into a_order from orders limit 1;
  if exists (select 1 from order_events) or exists (select 1 from order_notes) then raise exception 'FAIL: A reads B order history or notes'; end if;
  insert into order_events (tenant_id, order_id, kind, actor_kind, actor_user_id, actor_email) values ('11111111-1111-1111-1111-111111111111', a_order, 'held', 'member', '99999999-9999-9999-9999-999999999999', 'a@a.in') returning id into a_event;
  insert into order_notes (tenant_id, order_id, body, author_user_id, author_email) values ('11111111-1111-1111-1111-111111111111', a_order, 'call after 6', '99999999-9999-9999-9999-999999999999', 'a@a.in');
  begin insert into order_events (tenant_id, order_id, kind, actor_kind, actor_user_id, actor_email) values ('22222222-2222-2222-2222-222222222222', a_order, 'held', 'member', '99999999-9999-9999-9999-999999999999', 'a@a.in'); raise exception 'FAIL: A wrote history under B';
  exception when insufficient_privilege then null; end;
  begin insert into order_notes (tenant_id, order_id, body, author_user_id, author_email) values ('11111111-1111-1111-1111-111111111111', b_order, 'x', '99999999-9999-9999-9999-999999999999', 'a@a.in'); raise exception 'FAIL: A noted B''s order';
  exception when foreign_key_violation then null; end;
  begin insert into order_events (tenant_id, order_id, kind, actor_kind, undoes) values ('11111111-1111-1111-1111-111111111111', a_order, 'undone', 'system', b_event); raise exception 'FAIL: A undid B''s event';
  exception when foreign_key_violation then null; end;
  begin insert into order_events (tenant_id, order_id, kind, actor_kind) values ('11111111-1111-1111-1111-111111111111', a_order, 'held', 'member'); raise exception 'FAIL: a member event without the member';
  exception when check_violation then null; end;
  begin update order_notes set body = 'changed'; raise exception 'FAIL: a note was edited';
  exception when insufficient_privilege then null; end;
  begin delete from order_events; raise exception 'FAIL: history was deleted';
  exception when insufficient_privilege then null; end;
  begin delete from orders; raise exception 'FAIL: the app deleted an order';
  exception when insufficient_privilege then null; end;
  begin update order_lines set qty = 2; raise exception 'FAIL: a sold line was changed';
  exception when insufficient_privilege then null; end;
  update order_lines set stock_taken_at = now(), charge_taxable = 0, charge_gst = 0; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not stamp its own line (% rows)', n; end if;
end $$;
rollback;
do $$ begin
  if has_table_privilege('frata_admin', 'order_events', 'select') or has_table_privilege('frata_admin', 'order_notes', 'select') then raise exception 'FAIL: Frata staff can read order history or notes'; end if;
  if has_table_privilege('anon', 'order_notes', 'select') or has_table_privilege('authenticated', 'order_events', 'select') then raise exception 'FAIL: API roles can read order history'; end if;
  if to_regprocedure('public.app_backfill_0019()') is not null then raise exception 'FAIL: the one-off 0019 backfill is still there (0024 drops it)'; end if;
  if has_table_privilege('service_role', 'order_events', 'select') or has_table_privilege('service_role', 'order_notes', 'select') then raise exception 'FAIL: service_role reaches order history'; end if;
end $$;

-- 26. Invoice numbers (1D): per shop, set with packing, never changed; A cannot pack B's order.
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  update orders set packed_at = now(), invoice_number = 'PA/26-27/00001';
  begin update orders set invoice_number = 'PA/26-27/00002'; raise exception 'FAIL: an issued invoice number changed';
  exception when check_violation then null; end;
  begin update orders set invoice_number = null, packed_at = null; raise exception 'FAIL: an issued invoice number was removed';
  exception when check_violation then null; end;
  begin update orders set packed_at = now() where invoice_number is null; get diagnostics n = row_count;
    if n > 0 then raise exception 'FAIL: packed without an invoice number'; end if;
  exception when check_violation then null; end;
  update orders set packed_at = now(), invoice_number = 'X' where tenant_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A packed B''s order'; end if;
end $$;
rollback;
do $$ begin
  -- The same number in two shops is fine; twice in one shop is not.
  update orders set packed_at = now(), invoice_number = 'SAME/26-27/0001' where id in (select distinct on (tenant_id) id from orders order by tenant_id, id);
  if (select count(distinct tenant_id) from orders where invoice_number = 'SAME/26-27/0001') <> 2 then raise exception 'FAIL: two shops cannot use the same invoice number'; end if;
  begin
    insert into orders (tenant_id, number, payment_method, placed_at, packed_at, invoice_number) values ('11111111-1111-1111-1111-111111111111', 2, 'cod', now(), now(), 'SAME/26-27/0001');
    raise exception 'FAIL: one shop issued an invoice number twice';
  exception when unique_violation then null; end;
  raise exception 'rollback' using errcode = 'P0001';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'rollback' then raise; end if;
end $$;

-- 27. The erasure job's list (1D): shop ids only, for the app alone; it never returns order data.
insert into orders (tenant_id, number, payment_method, placed_at) values ('22222222-2222-2222-2222-222222222222', 77, 'prepaid', now() - interval '100 days');
begin; set local role frata_app;
do $$ begin
  if not exists (select 1 from app_shops_to_erase(now() - interval '90 days') t where t = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: the erasure list misses a shop'; end if;
  if (select count(*) from orders) <> 0 then raise exception 'FAIL: the job reads orders with no shop set'; end if;
end $$;
rollback;
do $$ begin
  if has_function_privilege('anon', 'app_shops_to_erase(timestamptz)', 'execute') or has_function_privilege('authenticated', 'app_shops_to_erase(timestamptz)', 'execute')
     or has_function_privilege('service_role', 'app_shops_to_erase(timestamptz)', 'execute') then raise exception 'FAIL: API roles can list shops to erase'; end if;
  if (select pg_get_function_result('app_shops_to_erase(timestamptz)'::regprocedure)) <> 'SETOF uuid' then raise exception 'FAIL: the erasure list returns more than ids'; end if;
end $$;

-- 28. Partners (docs/specs/2026-11-07-partner-foundations.md, review findings in the plan).
-- P approved partner, Q applicant, O the brand's owner, X anyone else.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000010', 'p@studio.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'q@studio.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'owner@brand.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'x@else.test', now());
begin; set local role frata_app;
do $$ declare t uuid; t2 uuid; n int; inv uuid; m jsonb; begin
  -- the app cannot read or write partners, nor write a link
  begin perform 1 from partners; raise exception 'FAIL: app reads partners'; exception when insufficient_privilege then null; end;
  begin insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 1, 1, 1); raise exception 'FAIL: app wrote a link'; exception when insufficient_privilege then null; end;
  -- apply: both apply; nobody is approved yet, so nobody can make a store
  perform app_partner_apply('aaaaaaaa-0000-0000-0000-000000000010', 'Pia', 'Pia Studio', '919845012345', 'Jaipur', '{setup,design}', '', '1-4', 1);
  perform app_partner_apply('aaaaaaaa-0000-0000-0000-000000000011', 'Quinn', '', '919845012346', 'Surat', '{}', '', '0', 1);
  begin perform app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000011', 'Q shop', 'proof-q', '302001', 2000, 24, 90, 10); raise exception 'FAIL: an applicant made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
end $$;
commit;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000010';
update partners set declined_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000011';
begin; set local role frata_app;
do $$ declare t uuid; n int; inv uuid; m jsonb; begin
  begin perform app_partner_apply('aaaaaaaa-0000-0000-0000-000000000011', 'Quinn again', '', '919845012346', 'Surat', '{}', '', '0', 1); raise exception 'FAIL: a declined application was changed';
  exception when sqlstate 'P0001' then if sqlerrm <> 'decided' then raise; end if; end;
  begin perform app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000011', 'Q shop', 'proof-q', '302001', 2000, 24, 90, 10); raise exception 'FAIL: a declined partner made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  t := app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000010', 'Proof P', 'proof-p', '302001', 2000, 24, 90, 1);
  -- the cap counts stores that have not opened
  begin perform app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000010', 'Proof P2', 'proof-p2', '302001', 2000, 24, 90, 1); raise exception 'FAIL: past the cap of unopened stores';
  exception when sqlstate 'P0001' then if sqlerrm <> 'too_many' then raise; end if; end;
  m := app_access_for('aaaaaaaa-0000-0000-0000-000000000010');
  if jsonb_array_length(m->'memberships') <> 1 or m->'memberships'->0->>'role' <> 'partner' then raise exception 'FAIL: partner membership (%)', m; end if;
  if (select count(*) from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000010')) <> 1 then raise exception 'FAIL: partner clients'; end if;
  if exists (select 1 from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000011')) or exists (select 1 from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000013')) then raise exception 'FAIL: another person sees P clients'; end if;
  -- links: own shop only
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if exists (select 1 from partner_links) then raise exception 'FAIL: A sees P shop link'; end if;
  if exists (select 1 from app_shop_people() where role = 'partner') then raise exception 'FAIL: A lists P shop people'; end if;
  perform set_config('app.tenant_id', t::text, true);
  if (select count(*) from partner_links) <> 1 or (select share_bps from partner_links) <> 2000 then raise exception 'FAIL: P shop link'; end if;
  perform set_config('app.tenant_id', '', true);
  -- handover: only the linked partner; never to a member's own email; one open owner invite
  begin perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000013', 'x@else.test'); raise exception 'FAIL: a stranger handed over P shop';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  begin perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'P@Studio.test'); raise exception 'FAIL: partner handed the store to themself';
  exception when sqlstate 'P0001' then if sqlerrm <> 'member_email' then raise; end if; end;
  perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'first@brand.test');
  inv := app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'Owner@Brand.test');
  -- sign-in does not claim a handover; it waits for Accept
  if app_claim_invites('aaaaaaaa-0000-0000-0000-000000000012') <> 0 then raise exception 'FAIL: sign-in claimed a handover'; end if;
  if (select count(*) from app_my_handovers('aaaaaaaa-0000-0000-0000-000000000012')) <> 1 then raise exception 'FAIL: owner does not see the handover'; end if;
  if exists (select 1 from app_my_handovers('aaaaaaaa-0000-0000-0000-000000000013')) then raise exception 'FAIL: a stranger sees the handover'; end if;
  begin perform app_accept_handover_v2('aaaaaaaa-0000-0000-0000-000000000013', inv, null, 1::smallint); raise exception 'FAIL: a stranger accepted the handover';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_invite' then raise; end if; end;
  if app_accept_handover_v2('aaaaaaaa-0000-0000-0000-000000000012', inv, null, 1::smallint) <> t then raise exception 'FAIL: accept'; end if;
  begin perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'later@brand.test'); raise exception 'FAIL: handover after an owner exists';
  exception when sqlstate 'P0001' then if sqlerrm <> 'has_owner' then raise; end if; end;
  -- People: the shop's own, the partner named
  perform set_config('app.tenant_id', t::text, true);
  if (select count(*) from app_shop_people()) <> 2 or (select partner_name from app_shop_people() where role = 'partner') <> 'Pia Studio' then raise exception 'FAIL: P shop people'; end if;
  perform set_config('app.tenant_id', '', true);
  -- removal: never by the partner; by the owner it ends the link, the membership and the partner's invites
  begin perform app_remove_partner(t, 'aaaaaaaa-0000-0000-0000-000000000010'); raise exception 'FAIL: the partner removed themself as owner';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_remove_partner('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000012'); raise exception 'FAIL: an owner removed a partner from another shop';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  perform app_remove_partner(t, 'aaaaaaaa-0000-0000-0000-000000000012');
  if exists (select 1 from jsonb_array_elements(app_access_for('aaaaaaaa-0000-0000-0000-000000000010')->'memberships') e where e->>'tenantId' = t::text) then raise exception 'FAIL: removed partner keeps access'; end if;
  if exists (select 1 from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000010') where slug is not null or owner_email is not null or plan_name is not null) then raise exception 'FAIL: removed partner still sees the shop details'; end if;
end $$;
commit;
-- the window starts at the FIRST opening and never restarts
do $$ declare t uuid := (select id from tenants where slug = 'proof-p'); s timestamptz; begin
  insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    select t, id, 2000, 24, 90 from partners where user_id = 'aaaaaaaa-0000-0000-0000-000000000010';
  update shop_settings set published_at = now() - interval '1 day' where tenant_id = t;
  select share_starts_at into s from partner_links where tenant_id = t and removed_at is null;
  if s is null then raise exception 'FAIL: opening did not start the share'; end if;
  update shop_settings set published_at = null where tenant_id = t;
  update shop_settings set published_at = now() where tenant_id = t;
  if (select share_starts_at from partner_links where tenant_id = t and removed_at is null) <> s then raise exception 'FAIL: reopening restarted the share'; end if;
  begin insert into members (tenant_id, user_id, role) values (t, 'aaaaaaaa-0000-0000-0000-000000000013', 'boss'); raise exception 'FAIL: an unknown role';
  exception when check_violation then null; end;
  begin insert into invites (tenant_id, email, role, created_by) values (t, 'y@else.test', 'partner', 'aaaaaaaa-0000-0000-0000-000000000012'); raise exception 'FAIL: a partner was invited';
  exception when check_violation then null; end;
  if has_function_privilege('anon', 'app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'app_accept_handover(uuid, uuid)', 'execute')
     or has_function_privilege('service_role', 'app_remove_partner(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'app_shop_people()', 'execute')
     or has_function_privilege('authenticated', 'app_my_partner(uuid)', 'execute')
     or has_function_privilege('frata_admin', 'app_partner_create_shop(uuid, text, text, text, integer, integer, integer, integer)', 'execute') then
    raise exception 'FAIL: a partner function is callable by the wrong role'; end if;
  if has_table_privilege('authenticated', 'partners', 'select') or has_table_privilege('anon', 'partner_links', 'select') or has_table_privilege('service_role', 'partners', 'select')
     or has_table_privilege('frata_app', 'partners', 'select') then raise exception 'FAIL: partners readable by the wrong role'; end if;
end $$;

-- 29. Modules (docs/specs/2026-11-07-modules-foundation.md; tenancy review in docs/plans/2026-11-07-m2.md).
begin; set local role frata_app;
do $$ declare n int; begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  -- A switches its own module on, once; a second open switch fails; A cannot switch B's on
  insert into tenant_modules (tenant_id, module, enabled_by) values ('11111111-1111-1111-1111-111111111111', 'communication', '99999999-9999-9999-9999-999999999999');
  begin insert into tenant_modules (tenant_id, module, enabled_by) values ('11111111-1111-1111-1111-111111111111', 'communication', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: two open switches';
  exception when unique_violation then null; end;
  begin insert into tenant_modules (tenant_id, module, enabled_by) values ('22222222-2222-2222-2222-222222222222', 'communication', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A switched on a module for B';
  exception when insufficient_privilege then null; end;
  begin insert into tenant_modules (tenant_id, module, enabled_by) values ('11111111-1111-1111-1111-111111111111', 'payments_magic', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: an unknown module';
  exception when check_violation then null; end;
  begin update tenant_modules set module = 'reviews'; raise exception 'FAIL: app changed which module a switch is';
  exception when insufficient_privilege then null; end;
  begin delete from tenant_modules; raise exception 'FAIL: app deleted switch history';
  exception when insufficient_privilege then null; end;
  -- no self-granted add-on or trial; no price or pause written by the app
  begin insert into tenant_addons (tenant_id, module, trial_ends_at, created_by) values ('11111111-1111-1111-1111-111111111111', 'reviews', now() + interval '30 days', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: app gave itself a trial';
  exception when insufficient_privilege then null; end;
  begin insert into addon_prices (module, version, monthly_price) values ('reviews', 99, 0); raise exception 'FAIL: app set a price';
  exception when insufficient_privilege then null; end;
  begin insert into module_pauses (module, paused_by, reason) values ('communication', '99999999-9999-9999-9999-999999999999', 'x'); raise exception 'FAIL: app paused a module';
  exception when insufficient_privilege then null; end;
  if (select count(*) from addon_prices) <> 3 then raise exception 'FAIL: app cannot read add-on prices'; end if;
end $$;
commit;
-- Frata admin grants a trial to B; A cannot see it; admin may only end it
begin; set local role frata_admin;
do $$ begin
  insert into tenant_addons (tenant_id, module, trial_ends_at, created_by, reason) values ('22222222-2222-2222-2222-222222222222', 'reviews', now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001', 'proof');
  begin update tenant_addons set module = 'true_profit'; raise exception 'FAIL: admin changed a granted add-on';
  exception when insufficient_privilege then null; end;
  update tenant_addons set ends_at = now() + interval '1 day' where reason = 'proof';
  begin delete from tenant_addons; raise exception 'FAIL: admin deleted an add-on';
  exception when insufficient_privilege then null; end;
  begin insert into tenant_addons (tenant_id, module, created_by) values ('22222222-2222-2222-2222-222222222222', 'reviews', 'aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'FAIL: an add-on neither paid nor trial';
  exception when check_violation then null; end;
  begin insert into tenant_addons (tenant_id, module, trial_ends_at, created_by) values ('22222222-2222-2222-2222-222222222222', 'communication', now(), 'aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'FAIL: a core module as an add-on';
  exception when check_violation then null; end;
  insert into module_pauses (module, paused_by, reason) values ('reviews', 'aaaaaaaa-0000-0000-0000-000000000001', 'proof');
  begin insert into module_pauses (module, paused_by, reason) values ('reviews', 'aaaaaaaa-0000-0000-0000-000000000001', 'twice'); raise exception 'FAIL: two open pauses';
  exception when unique_violation then null; end;
  update module_pauses set resumed_at = now(), resumed_by = 'aaaaaaaa-0000-0000-0000-000000000001' where reason = 'proof';
  if not found then raise exception 'FAIL: admin cannot resume a pause'; end if;
  insert into module_pauses (module, paused_by, reason) values ('reviews', 'aaaaaaaa-0000-0000-0000-000000000001', 'proof again');
  begin delete from module_pauses; raise exception 'FAIL: admin deleted pause history';
  exception when insufficient_privilege then null; end;
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from tenant_addons) then raise exception 'FAIL: A sees B add-ons'; end if;
  if not exists (select 1 from module_pauses where module = 'reviews') then raise exception 'FAIL: app cannot read pauses'; end if;
  begin perform reason from module_pauses; raise exception 'FAIL: a shop reads staff pause reasons';
  exception when insufficient_privilege then null; end;
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ declare n int; begin
  if (select count(*) from tenant_addons) <> 1 then raise exception 'FAIL: B cannot see its add-on'; end if;
  if exists (select 1 from tenant_modules) then raise exception 'FAIL: B sees A switches'; end if;
  update tenant_modules set disabled_at = now(), disabled_by = '99999999-9999-9999-9999-999999999999' where tenant_id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B switched off A''s module'; end if;
  insert into tenant_modules (tenant_id, module, enabled_by) values ('22222222-2222-2222-2222-222222222222', 'ship', '99999999-9999-9999-9999-999999999999');
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from tenant_modules where tenant_id <> '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: A sees B switches'; end if;
  if not exists (select 1 from tenant_modules where module = 'communication' and disabled_at is null) then raise exception 'FAIL: A''s switch was closed by B'; end if;
end $$;
commit;
do $$ begin
  if has_table_privilege('anon', 'tenant_modules', 'select') or has_table_privilege('authenticated', 'tenant_addons', 'select')
     or has_table_privilege('service_role', 'addon_prices', 'select') or has_table_privilege('service_role', 'module_pauses', 'insert') then
    raise exception 'FAIL: API roles reach module tables'; end if;
end $$;

-- 30. WhatsApp connections (docs/specs/2026-11-07-communication.md; tenancy review in docs/plans/2026-11-07-m2.md).
begin; set local role frata_app;
do $$ declare n int; begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
    values ('11111111-1111-1111-1111-111111111111', '100000000001', '200000000001', '+91 90000 00001', false, 'v1.x.y', '99999999-9999-9999-9999-999999999999');
  -- one open number per shop; A cannot connect for B; a crafted id never lands
  begin insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
    values ('11111111-1111-1111-1111-111111111111', '100000000009', '200000000009', '+91 9', false, 't', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: two open numbers for one shop';
  exception when unique_violation then null; end;
  begin insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
    values ('22222222-2222-2222-2222-222222222222', '100000000002', '200000000002', '+91 2', false, 't', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A connected a number for B';
  exception when insufficient_privilege then null; end;
  begin insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
    values ('11111111-1111-1111-1111-111111111111', '1 or 1=1', '200000000003', '+91 3', false, 't', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: a crafted Meta id';
  exception when check_violation then null; end;
  begin update wa_connections set tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: app moved a number to another shop';
  exception when insufficient_privilege then null; end;
  begin update wa_connections set phone_number_id = '200000000099'; raise exception 'FAIL: app changed which number a row is';
  exception when insufficient_privilege then null; end;
  begin delete from wa_connections; raise exception 'FAIL: app deleted a connection';
  exception when insufficient_privilege then null; end;
  -- a disconnect without deleting the token fails
  begin update wa_connections set disconnected_at = now(), disconnected_by = '99999999-9999-9999-9999-999999999999'; raise exception 'FAIL: disconnected but kept the token';
  exception when check_violation then null; end;
end $$;
commit;
-- B cannot see A's number, and cannot claim it (the number is open on A)
begin; set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ declare n int; begin
  if exists (select 1 from wa_connections) then raise exception 'FAIL: B sees A''s WhatsApp'; end if;
  update wa_connections set token_enc = 'stolen'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed A''s token'; end if;
  begin insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
    values ('22222222-2222-2222-2222-222222222222', '100000000002', '200000000001', '+91 1', false, 't', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: B claimed A''s open number';
  exception when unique_violation then null; end;
  begin insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
    values ('22222222-2222-2222-2222-222222222222', '100000000001', '200000000002', '+91 1', false, 't', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: B claimed A''s open account';
  exception when unique_violation then null; end;
end $$;
commit;
-- Routing: open rows only, digits only, tenant id only; a closed A plus an open B routes to B
begin; set local role frata_app;
do $$ begin
  if app_tenant_for_wa('200000000001') is distinct from '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: number does not route to A'; end if;
  if app_tenant_for_waba('100000000001') is distinct from '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: account does not route to A'; end if;
  if app_tenant_for_wa('200000000001 or true') is not null or app_tenant_for_wa('') is not null then raise exception 'FAIL: a crafted id routed'; end if;
  if app_tenant_for_wa('299999999999') is not null then raise exception 'FAIL: an unknown number routed'; end if;
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
update wa_connections set disconnected_at = now(), disconnected_by = '99999999-9999-9999-9999-999999999999', token_enc = null;
commit;
begin; set local role frata_app;
do $$ begin
  if app_tenant_for_wa('200000000001') is not null then raise exception 'FAIL: a closed number still routes'; end if;
end $$;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
insert into wa_connections (tenant_id, waba_id, phone_number_id, display_phone, coexistence, token_enc, connected_by)
  values ('22222222-2222-2222-2222-222222222222', '100000000001', '200000000001', '+91 90000 00001', true, 'v1.b.b', '99999999-9999-9999-9999-999999999999');
commit;
begin; set local role frata_app;
do $$ begin
  if app_tenant_for_wa('200000000001') is distinct from '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: the reconnected number does not route to B'; end if;
end $$;
commit;
-- WhatsApp items: stored only by the definer, for the open connection's shop; nothing readable before a shop is set
begin; set local role frata_app;
do $$ declare t uuid; n int; begin
  t := app_store_wa_event('number', '200000000001', '200000000001:message:wamid.P1abcdef', '{"field":"messages"}');
  if t is distinct from '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: the item did not land on the open shop'; end if;
  if app_store_wa_event('number', '200000000001', '200000000001:message:wamid.P1abcdef', '{}') is not null then raise exception 'FAIL: a retry stored twice'; end if;
  if app_store_wa_event('number', '299999999999', 'x:message:wamid.P2abcdef', '{}') is not null then raise exception 'FAIL: an item for no shop was stored'; end if;
  if app_store_wa_event('number', '200000000001', 'x'' or 1=1', '{}') is not null then raise exception 'FAIL: a crafted key was stored'; end if;
  if (select count(*) from webhook_events where provider = 'whatsapp') <> 0 then raise exception 'FAIL: WhatsApp events readable before a shop is set'; end if;
  update webhook_events set processed_at = now(); get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: events changeable before a shop is set'; end if;
  begin insert into webhook_events (provider, event_key, tenant_id, payload) values ('whatsapp', 'whatsapp:forged', '11111111-1111-1111-1111-111111111111', '{}'); raise exception 'FAIL: a WhatsApp item stored around the definer';
  exception when insufficient_privilege then null; end;
  if not exists (select 1 from app_pending_event_shops('whatsapp') x where x = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: the sweep cannot find pending shops'; end if;
  -- Razorpay's receiver stores inside the shop its key names (drizzle/0043), a retry collapsing to one row.
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:proof30:payment.captured:pay_9', '22222222-2222-2222-2222-222222222222', '{}') on conflict (event_key) do nothing;
  insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:proof30:payment.captured:pay_9', '22222222-2222-2222-2222-222222222222', '{}') on conflict (event_key) do nothing;
  if (select count(*) from webhook_events where event_key = 'razorpay:proof30:payment.captured:pay_9') <> 1 then raise exception 'FAIL: a Razorpay retry stored twice'; end if;
  perform set_config('app.tenant_id', '', true);
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from webhook_events where provider = 'whatsapp') then raise exception 'FAIL: A reads B''s WhatsApp items'; end if;
end $$;
commit;
do $$ begin
  if has_table_privilege('frata_admin', 'wa_connections', 'select') then raise exception 'FAIL: staff read a shop''s WhatsApp'; end if;
  if has_table_privilege('anon', 'wa_connections', 'select') or has_table_privilege('authenticated', 'wa_connections', 'select') or has_table_privilege('service_role', 'wa_connections', 'select') then
    raise exception 'FAIL: API roles reach wa_connections'; end if;
  if has_function_privilege('anon', 'app_tenant_for_wa(text)', 'execute') or has_function_privilege('authenticated', 'app_tenant_for_waba(text)', 'execute') or has_function_privilege('frata_admin', 'app_tenant_for_wa(text)', 'execute') then
    raise exception 'FAIL: the WhatsApp routing reaches other roles'; end if;
end $$;

-- 31. Offers (docs/specs/2026-11-08-coupons.md; tenancy review in docs/plans/2026-11-08-offers.md).
insert into discounts (id, tenant_id, title, style, percent_bps, starts_at, created_by) values
  ('d15c0000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'B sale', 'order_off', 1000, now(), '99999999-9999-9999-9999-999999999999');
insert into discount_codes (id, tenant_id, discount_id, code) values
  ('c0de0000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'd15c0000-0000-0000-0000-00000000000b', 'SALE10');
insert into order_discounts (tenant_id, order_id, discount_id, code_id, class, amount, title, style, percent_bps, min_subtotal) values
  ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'd15c0000-0000-0000-0000-00000000000b', 'c0de0000-0000-0000-0000-00000000000b', 'order', 10000, 'B sale', 'order_off', 1000, 0);
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from discounts) or exists (select 1 from discount_codes) or exists (select 1 from order_discounts) then raise exception 'FAIL: A sees B offers, codes or uses'; end if;
  if exists (select 1 from price_history where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: A sees B price history'; end if;
  if exists (select 1 from discount_codes where upper(code) = 'SALE10') then raise exception 'FAIL: B code found under A'; end if;
  update discounts set percent_bps = 9000; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B offer'; end if;
  begin insert into discounts (tenant_id, title, style, percent_bps, starts_at, created_by) values ('22222222-2222-2222-2222-222222222222', 'x', 'order_off', 1000, now(), '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A made an offer in B';
  exception when insufficient_privilege then null; end;
  -- A's own offer; the same code as B's is fine (unique per shop only); a case-different duplicate in A is not.
  insert into discounts (id, tenant_id, title, style, percent_bps, starts_at, created_by) values ('d15c0000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'A sale', 'order_off', 500, now(), '99999999-9999-9999-9999-999999999999');
  insert into discount_codes (id, tenant_id, discount_id, code) values ('c0de0000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'd15c0000-0000-0000-0000-00000000000a', 'SALE10');
  begin insert into discount_codes (tenant_id, discount_id, code) values ('11111111-1111-1111-1111-111111111111', 'd15c0000-0000-0000-0000-00000000000a', 'sale10'); raise exception 'FAIL: a case-different duplicate code';
  exception when unique_violation then null; end;
  -- A cannot attach a code to B's offer, nor point a use at B's order, offer or code.
  begin insert into discount_codes (tenant_id, discount_id, code) values ('11111111-1111-1111-1111-111111111111', 'd15c0000-0000-0000-0000-00000000000b', 'GRAB1'); raise exception 'FAIL: A attached a code to B offer';
  exception when foreign_key_violation then null; end;
  begin insert into order_discounts (tenant_id, order_id, discount_id, class, amount, title, style, min_subtotal) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000b', 'd15c0000-0000-0000-0000-00000000000a', 'order', 1, 'x', 'order_off', 0); raise exception 'FAIL: A use on B order';
  exception when foreign_key_violation then null; end;
  begin insert into order_discounts (tenant_id, order_id, discount_id, class, amount, title, style, min_subtotal) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000a', 'd15c0000-0000-0000-0000-00000000000b', 'order', 1, 'x', 'order_off', 0); raise exception 'FAIL: A use of B offer';
  exception when foreign_key_violation then null; end;
  begin insert into order_discounts (tenant_id, order_id, discount_id, code_id, class, amount, title, style, min_subtotal) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000a', 'd15c0000-0000-0000-0000-00000000000a', 'c0de0000-0000-0000-0000-00000000000b', 'order', 1, 'x', 'order_off', 0); raise exception 'FAIL: A use with B code';
  exception when foreign_key_violation then null; end;
  -- Nobody deletes; uses, codes and price history are never changed; tenant_id never moves.
  begin delete from discounts; raise exception 'FAIL: app deleted an offer'; exception when insufficient_privilege then null; end;
  begin update discount_codes set code = 'NEW1'; raise exception 'FAIL: app changed a code'; exception when insufficient_privilege then null; end;
  begin update order_discounts set amount = 1; raise exception 'FAIL: app changed a use'; exception when insufficient_privilege then null; end;
  begin update price_history set price = 1; raise exception 'FAIL: app changed price history'; exception when insufficient_privilege then null; end;
  begin update discounts set tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: app moved an offer'; exception when insufficient_privilege then null; end;
  -- The price trigger, as the app: A's price change writes one row for A; A cannot write history for B.
  update variants set price = 120000 where id = 'cdcdcdcd-0000-0000-0000-00000000000a';
  if (select count(*) from price_history where variant_id = 'cdcdcdcd-0000-0000-0000-00000000000a' and price = 120000) <> 1 then raise exception 'FAIL: the price change was not recorded'; end if;
  update variants set price = 120000 where id = 'cdcdcdcd-0000-0000-0000-00000000000a';
  if (select count(*) from price_history where variant_id = 'cdcdcdcd-0000-0000-0000-00000000000a' and price = 120000) <> 1 then raise exception 'FAIL: an unchanged price was recorded'; end if;
  update variants set price = 1 where id = 'cdcdcdcd-0000-0000-0000-00000000000b'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A repriced B'; end if;
  begin insert into price_history (tenant_id, variant_id, price) values ('22222222-2222-2222-2222-222222222222', 'cdcdcdcd-0000-0000-0000-00000000000b', 1); raise exception 'FAIL: A wrote B price history';
  exception when insufficient_privilege then null; end;
end $$;
commit;
do $$ begin
  if (select count(*) from price_history where variant_id = 'cdcdcdcd-0000-0000-0000-00000000000b' and price = 1) <> 0 then raise exception 'FAIL: B price history moved under A'; end if;
  if exists (select 1 from variants v where not exists (select 1 from price_history h where h.tenant_id = v.tenant_id and h.variant_id = v.id)) then raise exception 'FAIL: a variant has no price history'; end if;
  -- Table-level only: from O·4 Admin reads named columns of discounts (pinned in check 36).
  if has_table_privilege('frata_admin', 'discounts', 'select') or has_table_privilege('frata_admin', 'discount_codes', 'select') or has_table_privilege('frata_admin', 'order_discounts', 'select') or has_table_privilege('frata_admin', 'price_history', 'select') then
    raise exception 'FAIL: staff read whole offer tables'; end if;
  if has_table_privilege('anon', 'discounts', 'select') or has_table_privilege('authenticated', 'discount_codes', 'select') or has_table_privilege('service_role', 'order_discounts', 'select') or has_table_privilege('service_role', 'price_history', 'select') or has_table_privilege('service_role', 'discounts', 'select') then
    raise exception 'FAIL: API roles reach offers'; end if;
  if has_function_privilege('anon', 'app_record_price()', 'execute') or has_function_privilege('authenticated', 'app_record_price()', 'execute') then raise exception 'FAIL: API roles run the price trigger'; end if;
end $$;
-- An order's discount is the sum of its lines' (a snapshot kept honest).
do $$ begin
  if exists (select 1 from orders o where o.discount <> coalesce((select sum(l.line_discount) from order_lines l where l.tenant_id = o.tenant_id and l.order_id = o.id), 0)) then
    raise exception 'FAIL: an order''s discount is not the sum of its lines'''; end if;
end $$;

-- 32. Shop looks (themes T1; docs/specs/2026-11-08-themes.md, plan § Review findings).
begin; set local role frata_app;
do $$ declare n int; ra uuid; rb uuid; begin
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by)
    values ('22222222-2222-2222-2222-222222222222', 'bazaar', '1.0.0', 'sindoor', '{}', '99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999') returning id into rb;
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if exists (select 1 from shop_theme_revisions where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: A sees B''s looks'; end if;
  insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by)
    values ('11111111-1111-1111-1111-111111111111', 'editorial', '1.0.0', 'haldi', '{}', '99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999') returning id into ra;
  begin insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by)
    values ('22222222-2222-2222-2222-222222222222', 'editorial', '1.0.0', 'haldi', '{}', '99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A wrote a look for B';
  exception when insufficient_privilege then null; end;
  begin insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by)
    values ('11111111-1111-1111-1111-111111111111', 'liquid', '1.0.0', 'x', '{}', '99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: an unknown theme';
  exception when check_violation then null; end;
  update shop_theme_revisions set settings = '{"x":1}' where id = rb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A edited B''s look'; end if;
  delete from shop_theme_revisions where id = rb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s look'; end if;
  begin update shop_theme_revisions set tenant_id = '22222222-2222-2222-2222-222222222222' where id = ra; raise exception 'FAIL: A moved a look to B';
  exception when insufficient_privilege then null; end;
  begin update shop_theme_revisions set theme_key = 'bazaar' where id = ra; raise exception 'FAIL: app changed a revision''s theme';
  exception when insufficient_privilege then null; end;
  -- a publish of B's revision fails, whichever tenant it names
  begin insert into shop_theme_publishes (tenant_id, revision_id, published_by) values ('11111111-1111-1111-1111-111111111111', rb, '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A published B''s look';
  exception when foreign_key_violation then null; end;
  begin insert into shop_theme_publishes (tenant_id, revision_id, published_by) values ('22222222-2222-2222-2222-222222222222', rb, '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A published for B';
  exception when insufficient_privilege then null; end;
  -- a draft saves; once published it is frozen and can't be deleted; publishes are append-only
  update shop_theme_revisions set settings = '{"home":[]}', version = version + 1 where id = ra; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: a draft could not be saved'; end if;
  insert into shop_theme_publishes (tenant_id, revision_id, published_by) values ('11111111-1111-1111-1111-111111111111', ra, '99999999-9999-9999-9999-999999999999');
  begin update shop_theme_revisions set settings = '{}' where id = ra; raise exception 'FAIL: a published look changed';
  exception when check_violation then null; end;
  begin delete from shop_theme_revisions where id = ra; raise exception 'FAIL: a published look was deleted';
  exception when check_violation then null; end;
  begin update shop_theme_publishes set published_at = now(); raise exception 'FAIL: a publish was rewritten';
  exception when insufficient_privilege then null; end;
  begin delete from shop_theme_publishes; raise exception 'FAIL: a publish was deleted';
  exception when insufficient_privilege then null; end;
end $$;
commit;
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from shop_theme_revisions) or exists (select 1 from shop_theme_publishes) then raise exception 'FAIL: looks readable with no shop set'; end if;
end $$;
commit;
do $$ begin
  if has_table_privilege('frata_admin', 'shop_theme_revisions', 'select') or has_table_privilege('frata_admin', 'shop_theme_publishes', 'select') then
    raise exception 'FAIL: staff read a shop''s looks in T1'; end if;
  if has_table_privilege('anon', 'shop_theme_revisions', 'select') or has_table_privilege('authenticated', 'shop_theme_publishes', 'select')
     or has_table_privilege('service_role', 'shop_theme_revisions', 'select') then raise exception 'FAIL: API roles reach shop looks'; end if;
end $$;

-- 33. Back in stock (themes T2): the database alone keeps sold_out_at / restocked_at; A can't move B's stock.
insert into variants (id, tenant_id, product_id, option_values, price, stock, when_out, ships_by) values
  ('cdcdcdcd-0000-0000-0000-00000000003a', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', '{XL}', 100000, 1, 'stop', null),
  ('cdcdcdcd-0000-0000-0000-00000000003c', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', '{XXL}', 100000, 1, 'preorder', '2027-01-15'),
  ('cdcdcdcd-0000-0000-0000-00000000003b', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', '{XL}', 100000, 0, 'stop', null);
begin; set local role frata_app;
do $$ declare n int; r record; begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  update variants set stock = 5 where id = 'cdcdcdcd-0000-0000-0000-00000000003b'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A moved B''s stock'; end if;
  update variants set restocked_at = now(), sold_out_at = now() where id = 'cdcdcdcd-0000-0000-0000-00000000003a';
  select * into r from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003a';
  if r.restocked_at is not null or r.sold_out_at is not null then raise exception 'FAIL: the app wrote the stock times'; end if;
  update variants set stock = 0 where id in ('cdcdcdcd-0000-0000-0000-00000000003a', 'cdcdcdcd-0000-0000-0000-00000000003c');
  if (select sold_out_at from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003a') is null then raise exception 'FAIL: selling out was not recorded'; end if;
  update variants set stock = 1 where id = 'cdcdcdcd-0000-0000-0000-00000000003a';
  if (select restocked_at from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003a') is not null then raise exception 'FAIL: back within minutes counted as back in stock'; end if;
  update variants set stock = 0 where id = 'cdcdcdcd-0000-0000-0000-00000000003a';
  -- Forging on the other paths: an insert, and an update that also moves stock.
  insert into variants (id, tenant_id, product_id, option_values, price, stock, sold_out_at, restocked_at) values
    ('cdcdcdcd-0000-0000-0000-00000000003d', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', '{3XL}', 100000, 0, now() - interval '9 days', now());
  if (select sold_out_at is not null or restocked_at is not null from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003d') then raise exception 'FAIL: an insert wrote the stock times'; end if;
  update variants set stock = 2, restocked_at = now(), sold_out_at = now() - interval '9 days' where id = 'cdcdcdcd-0000-0000-0000-00000000003d';
  if (select sold_out_at is not null or restocked_at is not null from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003d') then raise exception 'FAIL: an update with stock wrote the stock times'; end if;
end $$;
commit;
-- A day passes (as the owner, past the trigger).
alter table variants disable trigger variants_stock_times;
update variants set sold_out_at = now() - interval '2 days' where id in ('cdcdcdcd-0000-0000-0000-00000000003a', 'cdcdcdcd-0000-0000-0000-00000000003c');
alter table variants enable trigger variants_stock_times;
begin; set local role frata_app;
do $$ begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  update variants set stock = 4 where id in ('cdcdcdcd-0000-0000-0000-00000000003a', 'cdcdcdcd-0000-0000-0000-00000000003c');
  if (select restocked_at from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003a') is null then raise exception 'FAIL: back after a day not recorded'; end if;
  -- A product save that leaves stock alone keeps the time it came back.
  update variants set price = price + 100 where id = 'cdcdcdcd-0000-0000-0000-00000000003a';
  if (select restocked_at from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003a') is null then raise exception 'FAIL: a save without a stock change lost back-in-stock'; end if;
  if (select restocked_at from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003c') is not null then raise exception 'FAIL: a pre-order variant came "back"'; end if;
end $$;
commit;
do $$ begin
  if (select prosecdef from pg_proc where proname = 'app_variant_stock_times') then raise exception 'FAIL: the stock-times trigger is a definer'; end if;
  if (select tgenabled from pg_trigger where tgname = 'variants_stock_times') <> 'O' then raise exception 'FAIL: the stock-times trigger is off'; end if;
  if has_function_privilege('anon', 'app_variant_stock_times()', 'execute') or has_function_privilege('authenticated', 'app_variant_stock_times()', 'execute') then raise exception 'FAIL: API roles run the stock-times trigger'; end if;
  if (select restocked_at from variants where id = 'cdcdcdcd-0000-0000-0000-00000000003b') is not null then raise exception 'FAIL: B''s variant changed'; end if;
end $$;

-- 34. Theme versions (themes T3): shops read when, never who or why; a stage is one shop's; decisions are final;
--     the baseline can't be pulled; Admin counts looks by column, never reading a shop's settings.
insert into theme_versions (id, theme_key, version) values ('7e7e7e7e-0000-0000-0000-00000000000a', 'editorial', '9.9.9');
insert into theme_version_stages (tenant_id, version_id, staged_by) values ('22222222-2222-2222-2222-222222222222', '7e7e7e7e-0000-0000-0000-00000000000a', '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
do $$ begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  perform id, theme_key, version, released_at, recalled_at, withdrawn_at from theme_versions;
  begin perform released_by from theme_versions; raise exception 'FAIL: a shop reads who released a theme';
  exception when insufficient_privilege then null; end;
  begin perform recalled_reason from theme_versions; raise exception 'FAIL: a shop reads why a theme was recalled';
  exception when insufficient_privilege then null; end;
  begin insert into theme_versions (theme_key, version) values ('bazaar', '9.9.9'); raise exception 'FAIL: a shop added a theme version';
  exception when insufficient_privilege then null; end;
  begin update theme_versions set released_at = now(); raise exception 'FAIL: a shop released a theme';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from theme_version_stages) then raise exception 'FAIL: A sees B''s staged versions'; end if;
  begin insert into theme_version_stages (tenant_id, version_id, staged_by) values ('11111111-1111-1111-1111-111111111111', '7e7e7e7e-0000-0000-0000-00000000000a', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: a shop staged itself';
  exception when insufficient_privilege then null; end;
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  if not exists (select 1 from theme_version_stages) then raise exception 'FAIL: B can''t see its own stage'; end if;
  begin perform staged_by from theme_version_stages; raise exception 'FAIL: a shop reads which staff member staged it';
  exception when insufficient_privilege then null; end;
  begin delete from theme_version_stages; raise exception 'FAIL: a shop unstaged itself';
  exception when insufficient_privilege then null; end;
end $$;
commit;
begin; set local role frata_admin;
do $$ begin
  update theme_versions set released_at = now(), released_by = '99999999-9999-9999-9999-999999999999' where id = '7e7e7e7e-0000-0000-0000-00000000000a';
  begin update theme_versions set released_at = null where id = '7e7e7e7e-0000-0000-0000-00000000000a'; raise exception 'FAIL: a release was undone';
  exception when check_violation then null; end;
  begin update theme_versions set recalled_at = now(), recalled_by = '99999999-9999-9999-9999-999999999999', recalled_reason = 'x' where id = '7e7e7e7e-0000-0000-0000-00000000000a'; raise exception 'FAIL: a recall without a reason';
  exception when check_violation then null; end;
  begin update theme_versions set withdrawn_at = now(), withdrawn_by = '99999999-9999-9999-9999-999999999999', withdrawn_reason = 'a problem' where theme_key = 'classic' and version = '1.0.0'; raise exception 'FAIL: the baseline look was withdrawn';
  exception when check_violation then null; end;
  begin update theme_versions set theme_key = 'bazaar' where id = '7e7e7e7e-0000-0000-0000-00000000000a'; raise exception 'FAIL: Admin renamed a version';
  exception when insufficient_privilege then null; end;
  perform id, tenant_id, revision_id, published_at from shop_theme_publishes;
  perform id, tenant_id, theme_key, theme_version from shop_theme_revisions;
  begin perform settings from shop_theme_revisions; raise exception 'FAIL: staff read a shop''s look content';
  exception when insufficient_privilege then null; end;
  begin perform published_by_email from shop_theme_publishes; raise exception 'FAIL: staff read who published a shop''s look';
  exception when insufficient_privilege then null; end;
  begin perform created_by_email from shop_theme_revisions; raise exception 'FAIL: staff read who made a shop''s look';
  exception when insufficient_privilege then null; end;
end $$;
commit;
do $$ begin
  if has_table_privilege('anon', 'theme_versions', 'select') or has_table_privilege('authenticated', 'theme_version_stages', 'select') or has_table_privilege('service_role', 'theme_versions', 'select') then raise exception 'FAIL: API roles reach theme versions'; end if;
  if (select count(*) from theme_versions where released_at is not null) < 6 then raise exception 'FAIL: the build''s versions were not recorded as released'; end if;
end $$;
delete from theme_version_stages where version_id = '7e7e7e7e-0000-0000-0000-00000000000a';
delete from theme_versions where id = '7e7e7e7e-0000-0000-0000-00000000000a';


-- 35. Offers O·2 (docs/plans/2026-11-08-offers-o2.md): targets and tiers are the shop's own; a gift link clears only itself.
insert into discount_targets (tenant_id, discount_id, product_id) values ('22222222-2222-2222-2222-222222222222', 'd15c0000-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b');
insert into discount_tiers (tenant_id, discount_id, min_subtotal, percent_bps) values ('22222222-2222-2222-2222-222222222222', 'd15c0000-0000-0000-0000-00000000000b', 100000, 500);
insert into variants (id, tenant_id, product_id, option_values, price) values ('cdcdcdcd-0000-0000-0000-0000000000a9', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', '{GIFT}', 49900);
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from discount_targets) or exists (select 1 from discount_tiers) then raise exception 'FAIL: A sees B targets or tiers'; end if;
  delete from discount_targets; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A removed B targets'; end if;
  delete from discount_tiers; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A removed B tiers'; end if;
  begin insert into discount_targets (tenant_id, discount_id, product_id) values ('11111111-1111-1111-1111-111111111111', 'd15c0000-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000b'); raise exception 'FAIL: A targeted B product';
  exception when foreign_key_violation then null; end;
  begin insert into discount_tiers (tenant_id, discount_id, min_subtotal, percent_bps) values ('11111111-1111-1111-1111-111111111111', 'd15c0000-0000-0000-0000-00000000000b', 1, 1); raise exception 'FAIL: A added a tier to B offer';
  exception when foreign_key_violation then null; end;
  begin update discount_targets set product_id = null; raise exception 'FAIL: app updated a target'; exception when insufficient_privilege then null; end;
  -- A's own gift offer: a gift from B's variants is refused; its own variant is fine.
  begin insert into discounts (tenant_id, title, style, gift_variant_id, min_subtotal, starts_at, created_by) values ('11111111-1111-1111-1111-111111111111', 'Gift', 'free_gift', 'cdcdcdcd-0000-0000-0000-00000000000b', 0, now(), '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A gift from B variant';
  exception when foreign_key_violation then null; end;
  insert into discounts (id, tenant_id, title, style, gift_variant_id, min_subtotal, starts_at, created_by) values ('d15c0000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Gift', 'free_gift', 'cdcdcdcd-0000-0000-0000-0000000000a9', 0, now(), '99999999-9999-9999-9999-999999999999');
end $$;
commit;
do $$ begin
  if has_table_privilege('frata_admin', 'discount_targets', 'select') or has_table_privilege('frata_admin', 'discount_tiers', 'select') or has_table_privilege('service_role', 'discount_targets', 'select') or has_table_privilege('anon', 'discount_tiers', 'select') then
    raise exception 'FAIL: staff or API roles reach targets or tiers'; end if;
end $$;
-- Deleting the gift variant clears the gift only (tenant_id stays), as the owner would see it.
delete from variants where id = 'cdcdcdcd-0000-0000-0000-0000000000a9';
do $$ begin
  if (select gift_variant_id from discounts where id = 'd15c0000-0000-0000-0000-0000000000a2') is not null then raise exception 'FAIL: gift link kept a deleted variant'; end if;
  if (select tenant_id from discounts where id = 'd15c0000-0000-0000-0000-0000000000a2') is distinct from '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: the gift link moved the offer'; end if;
end $$;

-- 36. Offers O·4 (docs/plans/2026-11-08-offers-o3-o4.md): Admin reads a shop's offers by the named columns only, sets
-- only stopped_*, and a stop changes exactly the one row; the shop cannot clear it; platform totals are aggregates.
begin; set local role frata_admin;
do $$ declare n int; begin
  if (select count(*) from discounts where id in ('d15c0000-0000-0000-0000-00000000000a', 'd15c0000-0000-0000-0000-00000000000b')) <> 2 then raise exception 'FAIL: admin cannot see offers to stop them'; end if;
  perform id, tenant_id, title, style, starts_at, ends_at, started_at, paused_at, ended_at, stopped_at, stop_reason from discounts;
  begin perform budget from discounts; raise exception 'FAIL: admin reads an offer budget'; exception when insufficient_privilege then null; end;
  begin perform percent_bps from discounts; raise exception 'FAIL: admin reads an offer term'; exception when insufficient_privilege then null; end;
  begin perform 1 from order_discounts; raise exception 'FAIL: admin reads offer uses'; exception when insufficient_privilege then null; end;
  begin perform 1 from discount_codes; raise exception 'FAIL: admin reads codes'; exception when insufficient_privilege then null; end;
  begin update discounts set title = 'x' where id = 'd15c0000-0000-0000-0000-00000000000b'; raise exception 'FAIL: admin changed an offer term'; exception when insufficient_privilege then null; end;
  begin update discounts set ended_at = now() where id = 'd15c0000-0000-0000-0000-00000000000b'; raise exception 'FAIL: admin ended an offer'; exception when insufficient_privilege then null; end;
  update discounts set stopped_at = now(), stopped_by = '99999999-9999-9999-9999-999999999999', stop_reason = 'Proof stop'
   where id = 'd15c0000-0000-0000-0000-00000000000b' and ended_at is null and stopped_at is null;
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL: a stop changed % rows', n; end if;
  begin update discounts set stopped_at = now() where id = 'd15c0000-0000-0000-0000-00000000000a'; raise exception 'FAIL: a stop without who and why';
  exception when check_violation then null; end;
  perform * from app_admin_offer_totals(now() - interval '100 years');
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if (select stop_reason from discounts where id = 'd15c0000-0000-0000-0000-00000000000b') is distinct from 'Proof stop' then raise exception 'FAIL: the shop does not see why its offer stopped'; end if;
  begin update discounts set stopped_at = null, stopped_by = null, stop_reason = null where id = 'd15c0000-0000-0000-0000-00000000000b'; raise exception 'FAIL: the shop cleared a stop';
  exception when insufficient_privilege then null; end;
end $$;
commit;
do $$ begin
  if (select stopped_at from discounts where id = 'd15c0000-0000-0000-0000-00000000000a') is not null then raise exception 'FAIL: a stop reached another offer'; end if;
  -- frata_admin's reach on discounts, pinned column by column (a later grant of a term, limit or budget fails here).
  if (select string_agg(column_name, ',' order by column_name) from information_schema.column_privileges where grantee = 'frata_admin' and table_name = 'discounts' and privilege_type = 'SELECT')
     <> 'ended_at,ends_at,id,paused_at,started_at,starts_at,stop_reason,stopped_at,style,tenant_id,title' then raise exception 'FAIL: admin reads more of an offer than planned'; end if;
  if (select string_agg(column_name, ',' order by column_name) from information_schema.column_privileges where grantee = 'frata_admin' and table_name = 'discounts' and privilege_type = 'UPDATE')
     <> 'stop_reason,stopped_at,stopped_by' then raise exception 'FAIL: admin may change more of an offer than its stop'; end if;
  if has_table_privilege('frata_admin', 'discounts', 'insert') or has_table_privilege('frata_admin', 'discounts', 'delete') or has_table_privilege('frata_admin', 'discounts', 'truncate')
     or has_any_column_privilege('frata_admin', 'discount_targets', 'select') or has_any_column_privilege('frata_admin', 'discount_tiers', 'select')
     or has_any_column_privilege('frata_admin', 'price_history', 'select') or has_any_column_privilege('frata_admin', 'order_discounts', 'select')
     or has_any_column_privilege('frata_admin', 'discount_codes', 'select') then raise exception 'FAIL: admin reaches offer rows beyond its grant'; end if;
  -- The totals' numbers, not only their shape: B's one order using an offer (check 31), ₹100 given; nothing for A.
  if (select (orders, given)::text from app_admin_offer_totals(now() - interval '100 years') where tenant_id = '22222222-2222-2222-2222-222222222222') is distinct from '(1,10000)'
     or exists (select 1 from app_admin_offer_totals(now() - interval '100 years') where tenant_id = '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: offer totals count the wrong orders'; end if;
  if pg_get_function_result('app_admin_offer_totals(timestamptz)'::regprocedure) <> 'TABLE(tenant_id uuid, orders bigint, given bigint)' then raise exception 'FAIL: offer totals return more than aggregates'; end if;
  if has_function_privilege('frata_app', 'app_admin_offer_totals(timestamptz)', 'execute') or has_function_privilege('anon', 'app_admin_offer_totals(timestamptz)', 'execute') or has_function_privilege('authenticated', 'app_admin_offer_totals(timestamptz)', 'execute')
     or has_function_privilege('service_role', 'app_admin_offer_totals(timestamptz)', 'execute') then raise exception 'FAIL: a non-admin role reads offer totals'; end if;
  if (select count(*) from app_admin_offer_totals(now() - interval '100 years')) <> (select count(distinct tenant_id) from app_admin_offer_totals(now() - interval '100 years')) then raise exception 'FAIL: offer totals not one row per shop'; end if;
  if has_column_privilege('frata_app', 'discounts', 'stopped_at', 'update') or has_column_privilege('frata_app', 'discounts', 'stop_reason', 'update') then raise exception 'FAIL: the shop may set a stop'; end if;
end $$;
update discounts set stopped_at = null, stopped_by = null, stop_reason = null where id = 'd15c0000-0000-0000-0000-00000000000b';

-- 37. Security review 2026-11-08 (drizzle/0043): with no shop set, frata_app reads and writes NO webhook row (any
--     provider); a processed Razorpay event keeps no shopper field; no public function is executable by service_role.
insert into webhook_events (provider, event_key, tenant_id, payload, processed_at) values ('razorpay', 'razorpay:b:payment.captured:pay_37', '22222222-2222-2222-2222-222222222222',
  '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_37","order_id":"order_37","amount":100,"email":"s@x.in","contact":"9829043210","vpa":"s@upi"}}}}', null);
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from webhook_events) then raise exception 'FAIL: a webhook row is readable with no shop set'; end if;
  begin insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:noshop', '22222222-2222-2222-2222-222222222222', '{}'); raise exception 'FAIL: a webhook row stored with no shop set';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
-- Inside shop A: B's events stay unreadable, and nothing is stored for B (the Razorpay receiver now relies on this).
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from webhook_events where event_key = 'razorpay:b:payment.captured:pay_37') then raise exception 'FAIL: A reads B''s webhook row'; end if;
  begin insert into webhook_events (provider, event_key, tenant_id, payload) values ('razorpay', 'razorpay:a-for-b-37', '22222222-2222-2222-2222-222222222222', '{}'); raise exception 'FAIL: A stored a webhook row for B';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
-- The trim of processed Razorpay payloads (the same statement drizzle/0043 ran over existing rows) keeps no shopper field.
update webhook_events set processed_at = now() where event_key = 'razorpay:b:payment.captured:pay_37';
update webhook_events e set payload = jsonb_strip_nulls(jsonb_build_object(
    'event', e.payload -> 'event',
    'payload', case when e.payload #> '{payload,payment,entity}' is null then null else jsonb_build_object('payment', jsonb_build_object('entity',
      (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(e.payload #> '{payload,payment,entity}') as f(k, v)
        where k in ('id', 'order_id', 'amount', 'currency', 'status', 'method', 'fee', 'tax')))) end))
  where e.provider = 'razorpay' and e.processed_at is not null and e.event_key = 'razorpay:b:payment.captured:pay_37';
do $$ declare p jsonb; begin
  select payload into p from webhook_events where event_key = 'razorpay:b:payment.captured:pay_37';
  if p::text ~ '(email|contact|vpa|9829043210)' then raise exception 'FAIL: a processed event keeps shopper fields: %', p; end if;
  if p #>> '{payload,payment,entity,order_id}' is distinct from 'order_37' or (p #>> '{payload,payment,entity,amount}')::int <> 100 then raise exception 'FAIL: the trim lost what reconciliation reads: %', p; end if;
end $$;
do $$
declare f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    select string_agg(p.oid::regprocedure::text, ', ') into f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('service_role', p.oid, 'execute');
    if f is not null then raise exception 'FAIL: service_role may execute %', f; end if;
  end if;
end $$;

-- 38. Ship S·0 (docs/specs/2026-11-08-ship.md): shipments are the shop's own; one open per order; the app never deletes
-- one or moves it to another order; staff and the API roles see none.
insert into shipments (id, tenant_id, order_id, provider, courier_name) values ('5a1b0000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'self', 'B courier');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from shipments) then raise exception 'FAIL: A sees B shipments'; end if;
  update shipments set courier_name = 'x'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed a B shipment'; end if;
  begin insert into shipments (tenant_id, order_id, provider) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000b', 'self'); raise exception 'FAIL: A shipped a B order';
  exception when foreign_key_violation then null; end;
  begin insert into shipments (tenant_id, order_id, provider) values ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'self'); raise exception 'FAIL: A made a shipment in B';
  exception when insufficient_privilege then null; end;
  -- A's own: one open shipment per order; never deleted; never moved to another order.
  insert into orders (id, tenant_id, number, payment_method, placed_at) values ('acacacac-0000-0000-0000-0000000005a1', '11111111-1111-1111-1111-111111111111', 9101, 'cod', now());
  insert into shipments (id, tenant_id, order_id, provider) values ('5a1b0000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000005a1', 'self');
  begin insert into shipments (tenant_id, order_id, provider) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000005a1', 'self'); raise exception 'FAIL: two open shipments for one order';
  exception when unique_violation then null; end;
  begin delete from shipments; raise exception 'FAIL: the app deleted a shipment'; exception when insufficient_privilege then null; end;
  begin update shipments set order_id = order_id; raise exception 'FAIL: the app moved a shipment'; exception when insufficient_privilege then null; end;
  update shipments set ended_at = now(), ended_reason = 'undone' where id = '5a1b0000-0000-0000-0000-00000000000a';
  insert into shipments (tenant_id, order_id, provider) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000005a1', 'self'); -- an ended one leaves room
end $$;
rollback;
do $$ begin
  -- Any privilege at all, table or column level (tenancy audit 2026-11-08: select alone missed a column grant).
  if exists (select 1 from unnest(array['frata_admin', 'anon', 'authenticated', 'service_role']) r
             where has_any_column_privilege(r, 'shipments', 'select, insert, update, references')
                or has_table_privilege(r, 'shipments', 'select, insert, update, delete, truncate, references, trigger'))
  then raise exception 'FAIL: staff or API roles reach shipments'; end if;
end $$;

-- 39. Billing B0 (docs/plans/2026-11-08-billing.md § Review findings 6, 8–11): a shop sees only its own invoices and
-- billing details; it drafts only while unissued and never numbers, issues or deletes an invoice; billing details are
-- the detail columns only; an issued invoice, its lines, fees and credits are final for every role; composite keys
-- keep a row in its own shop; platform_counters and the gateway columns reach no app role.
insert into orders (id, tenant_id, number, payment_method, placed_at) values ('acacacac-0000-0000-0000-0000000b111a', '11111111-1111-1111-1111-111111111111', 9201, 'cod', now()), ('acacacac-0000-0000-0000-0000000b111b', '22222222-2222-2222-2222-222222222222', 9201, 'cod', now());
insert into frrata_invoices (id, tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total) values
  ('b1110000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', '2026-10-31T18:30:00Z', '2026-11-30T18:30:00Z', 100, 9, 9, 0, 118),
  ('b1110000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '2026-09-30T18:30:00Z', '2026-10-31T18:30:00Z', 100, 9, 9, 0, 118);
insert into billing_accounts (tenant_id, legal_name, gateway_customer_id) values ('22222222-2222-2222-2222-222222222222', 'B Pvt Ltd', 'cust_b');
insert into frrata_invoice_fees (tenant_id, invoice_id, order_id, billable_at, base, fee_bps, fee) values ('22222222-2222-2222-2222-222222222222', 'b1110000-0000-0000-0000-00000000000b', 'acacacac-0000-0000-0000-0000000b111b', now(), 85714, 200, 1714);
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from frrata_invoices where tenant_id <> '11111111-1111-1111-1111-111111111111') or exists (select 1 from billing_accounts) then raise exception 'FAIL: A sees B billing'; end if;
  update frrata_invoices set total = 0 where tenant_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed a B invoice'; end if;
  begin insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total) values ('22222222-2222-2222-2222-222222222222', now(), now() + interval '1 day', 0, 0, 0, 0, 0); raise exception 'FAIL: A drafted in B';
  exception when insufficient_privilege then null; end;
  -- A line on a B invoice from A: the composite key refuses it.
  begin insert into frrata_invoice_lines (tenant_id, invoice_id, position, kind, description, period_start, period_end, quantity, taxable) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-00000000000b', 1, 'plan', 'x', now(), now(), 1, 0); raise exception 'FAIL: A wrote a line on a B invoice';
  exception when foreign_key_violation then null; end;
  begin insert into frrata_invoice_fees (tenant_id, invoice_id, order_id, billable_at, base, fee_bps, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'acacacac-0000-0000-0000-0000000b111b', now(), 1, 200, 0); raise exception 'FAIL: A billed a B order';
  exception when foreign_key_violation or unique_violation then null; end;
  -- A credit naming B's billed order, from A: the composite key refuses it (it would block B's own credit).
  begin insert into frrata_fee_credits (tenant_id, invoice_id, order_id, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'acacacac-0000-0000-0000-0000000b111b', 1714); raise exception 'FAIL: A credited a B order';
  exception when foreign_key_violation then null; end;
  -- A's own draft: lines and fees in, the totals redrafted; never numbered, issued or deleted by the app.
  insert into frrata_invoice_lines (tenant_id, invoice_id, position, kind, description, period_start, period_end, quantity, taxable) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 1, 'plan', 'Launch', now(), now(), 1, 100);
  insert into frrata_invoice_fees (tenant_id, invoice_id, order_id, billable_at, base, fee_bps, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'acacacac-0000-0000-0000-0000000b111a', now(), 85714, 200, 1714);
  begin insert into frrata_invoice_fees (tenant_id, invoice_id, order_id, billable_at, base, fee_bps, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'acacacac-0000-0000-0000-0000000b111a', now(), 85714, 200, 1714); raise exception 'FAIL: an order billed twice';
  exception when unique_violation then null; end;
  update frrata_invoices set total = 118, drafted_at = now() where id = 'b1110000-0000-0000-0000-0000000000a1';
  begin update frrata_invoices set number = 'FRR/26-27/1' where id = 'b1110000-0000-0000-0000-0000000000a1'; raise exception 'FAIL: the app numbered an invoice';
  exception when insufficient_privilege then null; end;
  begin update frrata_invoices set issued_at = now() where id = 'b1110000-0000-0000-0000-0000000000a1'; raise exception 'FAIL: the app issued an invoice';
  exception when insufficient_privilege then null; end;
  begin delete from frrata_invoices; raise exception 'FAIL: the app deleted an invoice'; exception when insufficient_privilege then null; end;
  -- Billing details: the detail columns only.
  insert into billing_accounts (tenant_id, legal_name, gstin, state_code) values ('11111111-1111-1111-1111-111111111111', 'A Pvt Ltd', '08ABCDE1234F1Z5', '08');
  update billing_accounts set email = 'a@x.test';
  begin update billing_accounts set mandate_token_id = 'x'; raise exception 'FAIL: the app set a mandate'; exception when insufficient_privilege then null; end;
  begin perform gateway_customer_id from billing_accounts; raise exception 'FAIL: the app read a gateway id'; exception when insufficient_privilege then null; end;
end $$;
commit;
-- Issue A's invoice as the owner (the B2 definer's job), then: final for the app and for the owner alike.
update frrata_invoices set number = 'FRR/26-27/000001', issued_at = now() where id = 'b1110000-0000-0000-0000-0000000000a1';
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  update frrata_invoices set drafted_at = now() where id = 'b1110000-0000-0000-0000-0000000000a1'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: the app changed an issued invoice'; end if;
  begin delete from frrata_invoice_lines; raise exception 'FAIL: a line of an issued invoice deleted'; exception when check_violation then null; end;
  begin delete from frrata_invoice_fees; raise exception 'FAIL: a fee of an issued invoice deleted'; exception when check_violation then null; end;
  begin insert into frrata_invoice_lines (tenant_id, invoice_id, position, kind, description, period_start, period_end, quantity, taxable) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 2, 'fee', 'x', now(), now(), 1, 1); raise exception 'FAIL: a line added to an issued invoice';
  exception when check_violation then null; end;
end $$;
rollback;
do $$ begin
  begin update frrata_invoices set drafted_at = now(), buyer_name = 'x' where id = 'b1110000-0000-0000-0000-0000000000a1'; raise exception 'FAIL: an issued invoice changed';
  exception when check_violation then null; end;
  begin delete from frrata_invoices where id = 'b1110000-0000-0000-0000-0000000000a1'; raise exception 'FAIL: an issued invoice deleted';
  exception when check_violation then null; end;
  begin update frrata_invoice_fees set invoice_id = 'b1110000-0000-0000-0000-00000000000b', tenant_id = '22222222-2222-2222-2222-222222222222' where order_id = 'acacacac-0000-0000-0000-0000000b111a'; raise exception 'FAIL: a fee moved off an issued invoice';
  exception when check_violation then null; end;
  begin truncate frrata_invoices cascade; raise exception 'FAIL: invoices truncated'; exception when check_violation then null; end;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['app_shops_to_bill(timestamptz)', 'frrata_invoice_frozen()', 'frrata_invoice_child_frozen()']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: a role may execute a billing function'; end if;
  if exists (select 1 from unnest(array['frata_app', 'frata_admin', 'anon', 'authenticated', 'service_role']) r
             where has_any_column_privilege(r, 'platform_counters', 'select, insert, update, references') or has_table_privilege(r, 'platform_counters', 'select, insert, update, delete, truncate, references, trigger'))
  then raise exception 'FAIL: a role reaches platform_counters'; end if;
  if has_column_privilege('frata_app', 'billing_accounts', 'mandate_token_id', 'select') or has_column_privilege('frata_admin', 'billing_accounts', 'mandate_token_id', 'select')
     or has_column_privilege('frata_app', 'billing_accounts', 'gateway_customer_id', 'select') or has_column_privilege('frata_app', 'billing_accounts', 'mandate_revoked_at', 'update')
  then raise exception 'FAIL: the gateway columns reach an app role'; end if;
  if exists (select 1 from unnest(array['billing_accounts', 'frrata_invoices', 'frrata_invoice_lines', 'frrata_invoice_fees', 'frrata_fee_credits']) t, unnest(array['anon', 'authenticated', 'service_role']) r
             where has_any_column_privilege(r, t, 'select, insert, update, references') or has_table_privilege(r, t, 'select, insert, update, delete, truncate, references, trigger'))
  then raise exception 'FAIL: API roles reach billing'; end if;
  if has_table_privilege('frata_admin', 'frrata_invoices', 'insert, update, delete') or has_any_column_privilege('frata_admin', 'frrata_invoices', 'insert, update')
  then raise exception 'FAIL: frata_admin writes invoices directly (only the issue definer may)'; end if;
end $$;

-- 40. Documents D2 (docs/plans/2026-11-08-documents-pdf.md): a shop's logo for paper, and the logo an invoice froze
-- at packing, can only be a file in that shop's own documents folder; never another shop's.
insert into shop_settings (tenant_id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  update shop_settings set doc_logo = 'https://abc.public.blob.vercel-storage.com/tenants/11111111-1111-1111-1111-111111111111/documents/aaaaaaaa-0000-0000-0000-000000000001.png';
  begin update shop_settings set doc_logo = 'https://abc.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/documents/aaaaaaaa-0000-0000-0000-000000000001.png'; raise exception 'FAIL: A took B''s logo';
  exception when check_violation then null; end;
  begin update shop_settings set doc_logo = 'https://evil.test/tenants/11111111-1111-1111-1111-111111111111/documents/aaaaaaaa-0000-0000-0000-000000000001.png'; raise exception 'FAIL: a logo from another host';
  exception when check_violation then null; end;
  begin update orders set invoice_logo = 'https://abc.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/documents/aaaaaaaa-0000-0000-0000-000000000001.png'; raise exception 'FAIL: an invoice froze B''s logo';
  exception when check_violation then null; end;
end $$;
rollback;

-- 41. Credit notes (Documents D3): the shop's own; issued (insert) only, never changed or deleted by anyone; another
-- shop's order cannot be credited; staff and the API roles see none.
insert into orders (id, tenant_id, number, payment_method, placed_at) values ('acacacac-0000-0000-0000-0000000c0e0a', '11111111-1111-1111-1111-111111111111', 9301, 'cod', now()), ('acacacac-0000-0000-0000-0000000c0e0b', '22222222-2222-2222-2222-222222222222', 9301, 'cod', now());
insert into credit_notes (tenant_id, order_id, number, against_invoice, reason, taxable, cgst, sgst, igst, total, issued_by) values ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-0000000c0e0b', 'B/26-27/C0001', 'B/26-27/00001', 'cancelled', 100, 9, 9, 0, 118, '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from credit_notes) then raise exception 'FAIL: A sees B credit notes'; end if;
  begin insert into credit_notes (tenant_id, order_id, number, against_invoice, reason, taxable, cgst, sgst, igst, total, issued_by) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000c0e0b', 'A/26-27/C0001', 'x', 'cancelled', 0, 0, 0, 0, 0, '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A credited a B order';
  exception when foreign_key_violation then null; end;
  begin insert into credit_notes (tenant_id, order_id, number, against_invoice, reason, taxable, cgst, sgst, igst, total, issued_by) values ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-0000000c0e0b', 'B/26-27/C0002', 'x', 'cancelled', 0, 0, 0, 0, 0, '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A wrote a credit note in B';
  exception when insufficient_privilege then null; end;
  insert into credit_notes (tenant_id, order_id, number, against_invoice, reason, taxable, cgst, sgst, igst, total, issued_by) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000c0e0a', 'A/26-27/C0001', 'A/26-27/00001', 'came_back', 100, 9, 9, 0, 118, '99999999-9999-9999-9999-999999999999');
  -- GST phase 2 (0071): several notes per order are allowed (part returns, discounts); a number never twice.
  begin insert into credit_notes (tenant_id, order_id, number, against_invoice, reason, taxable, cgst, sgst, igst, total, issued_by) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000c0e0a', 'A/26-27/C0001', 'A/26-27/00001', 'came_back', 100, 9, 9, 0, 118, '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: one credit note number twice';
  exception when unique_violation then null; end;
  -- A goodwill note carries no GST.
  begin insert into credit_notes (tenant_id, order_id, number, against_invoice, reason, kind, taxable, cgst, sgst, igst, total, issued_by) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-0000000c0e0a', 'A/26-27/G0001', 'A/26-27/00001', 'goodwill', 'goodwill', 100, 9, 9, 0, 118, '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: a goodwill note with GST';
  exception when check_violation then null; end;
  -- credit_note_lines: A sees and writes its own only; never B's order line or B's note.
  if exists (select 1 from credit_note_lines) then raise exception 'FAIL: A sees B credit note lines'; end if;
  begin insert into credit_note_lines (tenant_id, credit_note_id, order_line_id, qty, taxable, gst, gst_bps) select '22222222-2222-2222-2222-222222222222', gen_random_uuid(), gen_random_uuid(), 1, 0, 0, 0; raise exception 'FAIL: A wrote B credit note lines';
  exception when insufficient_privilege then null; end;
  begin update credit_note_lines set qty = qty; exception when insufficient_privilege then null; end;
  begin update credit_notes set total = total; raise exception 'FAIL: the app changed a credit note'; exception when insufficient_privilege then null; end;
  begin delete from credit_notes; raise exception 'FAIL: the app deleted a credit note'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  begin update credit_notes set number = number; raise exception 'FAIL: a credit note changed'; exception when check_violation then null; end;
  begin delete from credit_notes; raise exception 'FAIL: a credit note deleted'; exception when check_violation then null; end;
  -- Refused by the final trigger, or (since 0071) by credit_note_lines' foreign key before it: either way never emptied.
  begin truncate credit_notes; raise exception 'FAIL: credit notes truncated'; exception when check_violation or feature_not_supported then null; end;
  if exists (select 1 from unnest(array['frata_admin', 'anon', 'authenticated', 'service_role']) r
             where has_any_column_privilege(r, 'credit_notes', 'select, insert, update, references') or has_table_privilege(r, 'credit_notes', 'select, insert, update, delete, truncate, references, trigger'))
  then raise exception 'FAIL: staff or API roles reach credit notes'; end if;
end $$;

-- 42. Billing B2 (docs/plans/2026-11-08-billing.md § Review findings 6, 11, 17): payments and Frrata's credit notes are
-- the shop's own to read; nobody writes them directly (only the three Admin definers, which frata_admin alone may run);
-- a credit note is final for every role.
insert into frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at) values ('22222222-2222-2222-2222-222222222222', 'b1110000-0000-0000-0000-00000000000b', 'bank_transfer', 100, 'PROOFUTRB1', now());
insert into frrata_credit_notes (tenant_id, invoice_id, number, taxable, cgst, sgst, igst, total, reason, issued_by) values ('22222222-2222-2222-2222-222222222222', 'b1110000-0000-0000-0000-00000000000b', 'PROOF/C00001', 100, 9, 9, 0, 118, 'proof', '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from frrata_payments) or exists (select 1 from frrata_credit_notes) then raise exception 'FAIL: A sees B payments or credit notes'; end if;
  begin insert into frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'upi', 1, 'PROOFUTRA1', now()); raise exception 'FAIL: the app recorded a payment';
  exception when insufficient_privilege then null; end;
  begin insert into frrata_credit_notes (tenant_id, invoice_id, number, taxable, cgst, sgst, igst, total, reason, issued_by) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'X/C1', 1, 0, 0, 0, 1, 'xyz', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: the app issued a credit note';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  begin update frrata_credit_notes set reason = 'changed' where number = 'PROOF/C00001'; raise exception 'FAIL: a Frrata credit note changed';
  exception when check_violation then null; end;
  if exists (select 1 from unnest(array['frata_app', 'anon', 'authenticated', 'service_role']) r,
               unnest(array['app_issue_frrata_invoices(timestamptz,int,bigint,uuid,text,text,text,text,boolean,text,text)', 'app_record_frrata_payment(uuid,bigint,text,text,uuid)', 'app_issue_frrata_credit_note(uuid,bigint,text,uuid,text,text)']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: a non-Admin role may issue, record or credit'; end if;
  if not has_function_privilege('frata_admin', 'app_issue_frrata_invoices(timestamptz,int,bigint,uuid,text,text,text,text,boolean,text,text)', 'execute') then raise exception 'FAIL: Admin cannot issue'; end if;
  if has_table_privilege('frata_admin', 'frrata_payments', 'insert, update, delete') or has_table_privilege('frata_admin', 'frrata_credit_notes', 'insert, update, delete')
     or has_table_privilege('frata_app', 'frrata_payments', 'insert, update, delete')
  then raise exception 'FAIL: a role writes payments or credit notes directly'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['frrata_payments', 'frrata_credit_notes']) t
             where has_any_column_privilege(r, t, 'select, insert, update, references') or has_table_privilege(r, t, 'select, insert, update, delete')) then raise exception 'FAIL: API roles reach B2 tables'; end if;
end $$;

-- 43. Billing B3 (plan findings 10, 12, 14): an autopay set-up completes only against THIS shop's pending row; the
-- gateway's ids never reach frata_app; billing_events has no app grant; notices and set-ups are the shop's own.
insert into billing_mandate_setups (tenant_id, gateway_order_id, gateway_customer_id, method, max_amount, created_by) values ('22222222-2222-2222-2222-222222222222', 'order_proofB1', 'cust_proofB', 'upi', 1500000, '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare ok boolean; begin
  if exists (select 1 from billing_mandate_setups) then raise exception 'FAIL: A sees B autopay set-ups'; end if;
  -- B's pending order, completed from A: refused, and B's mandate untouched.
  select app_complete_mandate('order_proofB1', 'token_stolen') into ok;
  if ok then raise exception 'FAIL: A completed B''s autopay'; end if;
  begin perform 1 from billing_events; raise exception 'FAIL: the app reads billing_events'; exception when insufficient_privilege then null; end;
  begin insert into billing_events (event_id, type, payload) values ('x', 'y', '{}'); raise exception 'FAIL: the app writes billing_events'; exception when insufficient_privilege then null; end;
  begin perform gateway_order_id from billing_mandate_setups; raise exception 'FAIL: the app reads a gateway order id'; exception when insufficient_privilege then null; end;
  -- A's own set-up starts and completes.
  perform app_begin_mandate('cust_proofA', 'order_proofA1', 'upi', 1500000, '99999999-9999-9999-9999-999999999999');
  select app_complete_mandate('order_proofA1', 'token_A') into ok;
  if not ok then raise exception 'FAIL: A could not complete its own autopay'; end if;
  if (select mandate_method from billing_accounts) is distinct from 'upi' then raise exception 'FAIL: A cannot see its own autopay status'; end if;
end $$;
rollback;
do $$ begin
  if (select mandate_token_id from billing_accounts where tenant_id = '22222222-2222-2222-2222-222222222222') is not null then raise exception 'FAIL: B''s mandate was touched'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r,
               unnest(array['app_begin_mandate(text,text,text,bigint,uuid)', 'app_complete_mandate(text,text)', 'app_billing_due()', 'app_billing_begin_attempt(uuid,int)', 'app_billing_attempt_context(uuid)', 'app_billing_attempt_result(text,text,boolean,text)', 'app_store_billing_event(text,text,jsonb)', 'app_apply_billing_event(uuid)']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: an API role may run a billing B3 function'; end if;
  if exists (select 1 from unnest(array['frata_app', 'frata_admin', 'anon', 'authenticated', 'service_role']) r where has_table_privilege(r, 'billing_events', 'select, insert, update, delete'))
  then raise exception 'FAIL: a role reaches billing_events directly'; end if;
end $$;

-- 44. Billing B4: a shop changes only its own plan, as its owner or an admin; never a price agreed with Frrata, never a
-- change Frrata scheduled; cancelling touches only its own; Admin never writes a row as the shop.
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by, reason, by_shop)
  select '22222222-2222-2222-2222-222222222222', v.id, now() + interval '40 days', 'aaaaaaaa-0000-0000-0000-000000000001', 'Changed by the shop', true
  from plan_versions v join plans p on p.id = v.plan_id where p.code = 'scale' order by v.version desc limit 1;
begin; set local role frata_app;
do $$ begin
  perform set_config('app.tenant_id', '', true);
  begin perform app_change_plan('growth', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: a plan changed with no shop set'; exception when insufficient_privilege then null; end;
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  -- B's staff member, acting in A: refused.
  begin perform app_change_plan('growth', 'aaaaaaaa-0000-0000-0000-000000000005'); raise exception 'FAIL: a non-member changed A''s plan'; exception when insufficient_privilege then null; end;
  -- A's owner upgrades (now), then schedules a downgrade, then cancels it.
  perform app_change_plan('growth', '99999999-9999-9999-9999-999999999999');
  if not exists (select 1 from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and by_shop and starts_at <= now()) then raise exception 'FAIL: A''s upgrade was not written'; end if;
  perform app_change_plan('launch', '99999999-9999-9999-9999-999999999999');
  if not exists (select 1 from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and by_shop and starts_at > now()) then raise exception 'FAIL: A''s downgrade was not scheduled'; end if;
  if not app_cancel_plan_change('99999999-9999-9999-9999-999999999999') then raise exception 'FAIL: A could not cancel its change'; end if;
  if exists (select 1 from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and starts_at > now()) then raise exception 'FAIL: A''s change was not cancelled'; end if;
  if (select count(*) from audit_events where tenant_id = '11111111-1111-1111-1111-111111111111' and action in ('billing.plan.change', 'billing.plan.cancel')) <> 3 then raise exception 'FAIL: a plan change was not audited'; end if;
  begin insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by) select '11111111-1111-1111-1111-111111111111', id, now(), '99999999-9999-9999-9999-999999999999' from plan_versions limit 1; raise exception 'FAIL: the app writes tenant_plans'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if (select count(*) from tenant_plans where tenant_id = '22222222-2222-2222-2222-222222222222' and by_shop and starts_at > now()) <> 1 then raise exception 'FAIL: A touched B''s scheduled change'; end if;
end $$;
-- Admin never writes a row as the shop.
begin; set local role frata_admin;
do $$ begin
  begin insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by, by_shop) select '11111111-1111-1111-1111-111111111111', id, now() + interval '50 days', 'aaaaaaaa-0000-0000-0000-000000000001', true from plan_versions limit 1;
    raise exception 'FAIL: Admin wrote a row as the shop'; exception when insufficient_privilege then null; end;
end $$;
rollback;
-- A change Frrata scheduled, and a price agreed with Frrata: both refused.
begin;
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by, reason)
  select '11111111-1111-1111-1111-111111111111', v.id, now() + interval '20 days', 'aaaaaaaa-0000-0000-0000-000000000001', 'Agreed on a call'
  from plan_versions v join plans p on p.id = v.plan_id where p.code = 'growth' order by v.version desc limit 1;
set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  begin perform app_change_plan('scale', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: the shop replaced Frrata''s scheduled change'; exception when check_violation then null; end;
  if app_cancel_plan_change('99999999-9999-9999-9999-999999999999') then raise exception 'FAIL: the shop cancelled Frrata''s scheduled change'; end if;
end $$;
rollback;
begin;
update tenant_plans set custom_monthly_price = 100000, reason = 'Agreed' where tenant_id = '11111111-1111-1111-1111-111111111111';
set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  begin perform app_change_plan('scale', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: the shop changed a price agreed with Frrata'; exception when check_violation then null; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['app_change_plan(text,uuid)', 'app_cancel_plan_change(uuid)']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: another role may change a shop''s plan'; end if;
  if has_function_privilege('frata_app', 'app_admin_clear_shop_plan_change(uuid)', 'execute') then raise exception 'FAIL: the app clears plan changes'; end if;
end $$;

-- 45. Trials TR0: the trial's terms and claims. A shop reads only its own trial; the platform terms carry no who or why;
-- no app role reads a claim, writes a trial, or runs the one writer of the trial end (T2, T8, R4).
insert into shop_trials (tenant_id, days, open_window_days, signed_up_at) values
  ('11111111-1111-1111-1111-111111111111', 30, 15, now() - interval '1 day'), ('22222222-2222-2222-2222-222222222222', 30, 15, now() - interval '1 day');
select app_trial_recompute('11111111-1111-1111-1111-111111111111'), app_trial_recompute('22222222-2222-2222-2222-222222222222');
insert into trial_claims (kind, key_hmac, key_version, tenant_id) values ('email', 'proof-hmac', 1, '22222222-2222-2222-2222-222222222222');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if (select count(*) from shop_trials) <> 1 or exists (select 1 from shop_trials where tenant_id <> '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: A sees another shop''s trial'; end if;
  if (select days from trial_settings) is null then raise exception 'FAIL: the app cannot read the trial terms'; end if;
  begin perform reason from trial_settings; raise exception 'FAIL: the app reads why the terms changed'; exception when insufficient_privilege then null; end;
  begin perform 1 from trial_claims; raise exception 'FAIL: the app reads trial claims'; exception when insufficient_privilege then null; end;
  begin update shop_trials set extended_at = now(); raise exception 'FAIL: the app writes a trial'; exception when insufficient_privilege then null; end;
  begin update trial_settings set days = 45; raise exception 'FAIL: the app writes the trial terms'; exception when insufficient_privilege then null; end;
  begin perform app_trial_recompute('22222222-2222-2222-2222-222222222222'); raise exception 'FAIL: the app runs the trial-end writer'; exception when insufficient_privilege then null; end;
  begin perform app_admin_extend_trial('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'proof'); raise exception 'FAIL: the app runs an Admin trial definer'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['frata_app', 'frata_admin', 'anon', 'authenticated', 'service_role']) r, unnest(array['app_trial_recompute(uuid)', 'app_trial_ends_at(uuid)', 'app_trial_clock_starts()', 'app_tenant_plans_trial_sync()']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: a role may run the trial-end writer directly'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_app']) r where has_function_privilege(r, 'app_admin_set_trial_settings(uuid,int,int,text)', 'execute'))
  then raise exception 'FAIL: a non-Admin role may set the trial terms'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['trial_settings', 'shop_trials', 'trial_claims']) t
             where has_table_privilege(r, t, 'select, insert, update, delete')) then raise exception 'FAIL: API roles reach the trial tables'; end if;
end $$;

-- 46. The clock starts once, at the FIRST time the website goes live; closing and reopening never restarts it (T4).
update shop_settings set published_at = null where tenant_id = '11111111-1111-1111-1111-111111111111';
update shop_settings set published_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111';
do $$ declare first timestamptz; e timestamptz; begin
  select started_at into first from shop_trials where tenant_id = '11111111-1111-1111-1111-111111111111';
  if first is null then raise exception 'FAIL: going live did not start the trial'; end if;
  e := app_trial_ends_at('11111111-1111-1111-1111-111111111111');
  if exists (select 1 from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and starts_at < e and trial_ends_at is distinct from e) then raise exception 'FAIL: a plan row missed the trial end'; end if;
  update shop_settings set published_at = null where tenant_id = '11111111-1111-1111-1111-111111111111';
  perform pg_sleep(0.01);
  update shop_settings set published_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111';
  if (select started_at from shop_trials where tenant_id = '11111111-1111-1111-1111-111111111111') <> first then raise exception 'FAIL: reopening restarted the trial'; end if;
end $$;

-- 47. The extension is the shop's owner or admin MEMBER only, once, in the last 10 days (T3); an upgrade during a
-- trial waits for its end and moves with it (A1, R4).
update shop_trials set signed_up_at = now() - interval '40 days', started_at = now() - interval '25 days' where tenant_id = '11111111-1111-1111-1111-111111111111';
select app_trial_recompute('11111111-1111-1111-1111-111111111111');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare e1 timestamptz; e2 timestamptz; w timestamptz; begin
  -- B's staff member (a support visit reports as owner; the members table does not) is refused.
  begin perform app_trial_extend('aaaaaaaa-0000-0000-0000-000000000005'); raise exception 'FAIL: a non-member extended A''s trial'; exception when insufficient_privilege then null; end;
  select trial_ends_at into e1 from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and starts_at <= now() order by starts_at desc limit 1;
  perform app_change_plan('growth', '99999999-9999-9999-9999-999999999999');
  select starts_at into w from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and waits_for_trial;
  if w is distinct from e1 then raise exception 'FAIL: the upgrade does not wait for the trial end'; end if;
  e2 := app_trial_extend('99999999-9999-9999-9999-999999999999');
  if e2 <> e1 + interval '7 days' then raise exception 'FAIL: the extension is not 7 days'; end if;
  if (select starts_at from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and waits_for_trial) <> e2 then raise exception 'FAIL: the waiting upgrade did not move with the extension'; end if;
  if exists (select 1 from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and waits_for_trial and trial_ends_at is not null) then raise exception 'FAIL: the waiting upgrade carries a trial'; end if;
  begin perform app_trial_extend('99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: a second extension'; exception when check_violation then null; end;
end $$;
rollback;
-- 47b. Security review TR0: Admin never writes a waiting upgrade; a scheduled downgrade carries the trial end (T5);
-- no extension once a waiting upgrade has started; frata_admin cannot run the shop's extension or the writer.
begin; set local role frata_admin;
do $$ begin
  begin insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by, waits_for_trial) select '11111111-1111-1111-1111-111111111111', id, now(), 'aaaaaaaa-0000-0000-0000-000000000001', true from plan_versions limit 1;
    raise exception 'FAIL: Admin wrote a waiting upgrade'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if has_function_privilege('frata_admin', 'app_trial_extend(uuid)', 'execute') then raise exception 'FAIL: Admin runs the shop''s extension'; end if;
end $$;
begin;
-- A downgrade scheduled inside the trial carries the trial's end; a downgrade after it carries none.
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by, reason, by_shop)
  select '11111111-1111-1111-1111-111111111111', v.id, now() + interval '2 days', '99999999-9999-9999-9999-999999999999', 'Changed by the shop', true from plan_versions v join plans p on p.id = v.plan_id where p.code = 'scale' order by v.version desc limit 1;
do $$ declare e timestamptz := app_trial_ends_at('11111111-1111-1111-1111-111111111111'); begin
  if (select trial_ends_at from tenant_plans where tenant_id = '11111111-1111-1111-1111-111111111111' and starts_at > now()) is distinct from e then raise exception 'FAIL: a scheduled row missed the trial end'; end if;
end $$;
rollback;
begin;
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by, reason, by_shop, waits_for_trial)
  select '11111111-1111-1111-1111-111111111111', v.id, now() - interval '1 minute', '99999999-9999-9999-9999-999999999999', 'Changed by the shop', true, true from plan_versions v join plans p on p.id = v.plan_id where p.code = 'growth' order by v.version desc limit 1;
set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  begin perform app_trial_extend('99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: extended after the new plan started'; exception when check_violation then null; end;
end $$;
rollback;

-- 49. Trials TR1·5: a trial at sign-up. No app role reads a sign-up code; the shop is made on the chosen plan with a
-- trial (terms frozen) and an email claim; a second sign-up with a claimed email gets no trial; a code that is not this
-- person's, or not verified, is refused (R3); a code verifies once and at most 5 tries count.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000040', 'first@trial-proof.test', now()), ('aaaaaaaa-0000-0000-0000-000000000041', 'again@trial-proof.test', now());
begin; set local role frata_app;
do $$ declare r record; c uuid; begin
  begin perform 1 from signup_codes; raise exception 'FAIL: the app reads sign-up codes'; exception when insufficient_privilege then null; end;
  c := app_signup_code_issue('aaaaaaaa-0000-0000-0000-000000000040', 'phone-hmac-1', 'code-hmac-1', 1::smallint);
  if app_signup_code_verify('aaaaaaaa-0000-0000-0000-000000000041', c, 'code-hmac-1') then raise exception 'FAIL: another person verified a code'; end if;
  if app_signup_code_verify('aaaaaaaa-0000-0000-0000-000000000040', c, 'wrong') then raise exception 'FAIL: a wrong code verified'; end if;
  if not app_signup_code_verify('aaaaaaaa-0000-0000-0000-000000000040', c, 'code-hmac-1') then raise exception 'FAIL: the right code did not verify'; end if;
  -- Another person cannot spend this code.
  begin perform app_create_shop_v2('aaaaaaaa-0000-0000-0000-000000000041', 'Proof Two', 'proof-two', '452009', '{}', 'growth', 'email-hmac-2', 1::smallint, c);
    raise exception 'FAIL: a code spent by another person'; exception when others then if sqlerrm <> 'bad_code' then raise; end if; end;
  select * into r from app_create_shop_v2('aaaaaaaa-0000-0000-0000-000000000040', 'Proof One', 'proof-one', '452009', '{}', 'growth', 'email-hmac-1', 1::smallint, c);
  if not r.trial then raise exception 'FAIL: a first sign-up got no trial'; end if;
  begin perform app_create_shop_v2('aaaaaaaa-0000-0000-0000-000000000041', 'Proof Two', 'proof-two', '452009', '{}', 'growth', 'email-hmac-2', 1::smallint, c);
    raise exception 'FAIL: a code used twice'; exception when others then if sqlerrm <> 'bad_code' then raise; end if; end;
end $$;
rollback;
begin;
do $$ declare r record; begin
  -- As the definer runs it (superuser here, to check the rows): the claimed email gets the plan without a trial.
  insert into trial_claims (kind, key_hmac, key_version, tenant_id) values ('email', 'email-hmac-taken', 1, '11111111-1111-1111-1111-111111111111');
  select * into r from app_create_shop_v2('aaaaaaaa-0000-0000-0000-000000000041', 'Proof Two', 'proof-two', '452009', '{}', 'launch', 'email-hmac-taken', 1::smallint, null);
  if r.trial or exists (select 1 from shop_trials where tenant_id = r.tenant_id) then raise exception 'FAIL: a claimed email got a trial'; end if;
  select * into r from app_create_shop_v2('aaaaaaaa-0000-0000-0000-000000000040', 'Proof One', 'proof-one', '452009', '{}', 'growth', 'email-hmac-new', 1::smallint, null);
  if not r.trial or (select days from shop_trials where tenant_id = r.tenant_id) <> (select days from trial_settings) then raise exception 'FAIL: the trial terms were not frozen'; end if;
  if (select trial_ends_at from tenant_plans where tenant_id = r.tenant_id) is null then raise exception 'FAIL: the new shop''s plan row has no trial end'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) ro, unnest(array['app_create_shop_v2(uuid,text,text,text,text[],text,text,smallint,uuid)', 'app_signup_code_issue(uuid,text,text,smallint)', 'app_signup_code_verify(uuid,uuid,text)']) f
             where has_function_privilege(ro, f, 'execute')) then raise exception 'FAIL: another role may sign up or issue codes'; end if;
end $$;
rollback;

-- 50. Trials TR1·10: a shop with no owner is never billed (R1); only the app runs the handover with its claim.
insert into tenants (id, slug, name) values ('33333333-3333-3333-3333-333333333333', 'proof-ownerless', 'Proof Ownerless');
insert into tenant_plans (tenant_id, plan_version_id, starts_at, created_by) select '33333333-3333-3333-3333-333333333333', pv.id, now() - interval '40 days', 'aaaaaaaa-0000-0000-0000-000000000001' from plan_versions pv join plans p on p.id = pv.plan_id where p.code = 'launch' and pv.version = 1;
do $$ begin
  if exists (select 1 from app_shops_to_bill(now()) t where t = '33333333-3333-3333-3333-333333333333') then raise exception 'FAIL: a shop with no owner is billed'; end if;
  if not exists (select 1 from app_shops_to_bill(now()) t where t = '11111111-1111-1111-1111-111111111111') then raise exception 'FAIL: an owned shop is not billed'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, 'app_accept_handover_v2(uuid,uuid,text,smallint)', 'execute'))
  then raise exception 'FAIL: another role may accept a handover'; end if;
  -- A partner-built shop goes live only once a brand owns it (owner, 2026-11-08).
  insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days)
    select '33333333-3333-3333-3333-333333333333', id, 2000, 24, 90 from partners where user_id = 'aaaaaaaa-0000-0000-0000-000000000010';
  insert into shop_settings (tenant_id, pickup_pincode) values ('33333333-3333-3333-3333-333333333333', '302001') on conflict do nothing;
  begin update shop_settings set published_at = now() where tenant_id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL: a partner shop went live with no owner'; exception when check_violation then null; end;
  -- Its trial ran from creation: a partner shop made by app_partner_create_shop has started_at set.
  if exists (select 1 from shop_trials st join partner_links l on l.tenant_id = st.tenant_id where st.started_at is null) then
    raise exception 'FAIL: a partner shop''s trial waits for going live'; end if;
  -- The 0023 handover skips the trial claim: no role may run it any more.
  if has_function_privilege('frata_app', 'app_accept_handover(uuid,uuid)', 'execute') then raise exception 'FAIL: the app may still accept a handover without its claim'; end if;
end $$;

-- 51. GST filing (GST app G2, 0074): connections, filings and attempts are the shop's own; a filed period is final for
-- everyone; an attempt changes its outcome once, and the app may change nothing else on it.
insert into gst_filings (tenant_id, gstin, period, ours, pushed_at, pushed_by) values ('22222222-2222-2222-2222-222222222222', '27AAAAA0000A1Z5', '2026-10', '{}', now(), '99999999-9999-9999-9999-999999999999');
insert into gst_connections (tenant_id, gstin, username, connected_by) values ('22222222-2222-2222-2222-222222222222', '27AAAAA0000A1Z5', 'shopb', '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare a uuid; begin
  if exists (select 1 from gst_filings) or exists (select 1 from gst_connections) or exists (select 1 from gst_attempts) then raise exception 'FAIL: A sees B GST filing rows'; end if;
  begin insert into gst_filings (tenant_id, gstin, period, ours, pushed_at, pushed_by) values ('22222222-2222-2222-2222-222222222222', '27AAAAA0000A1Z5', '2026-11', '{}', now(), '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A wrote a B filing';
  exception when insufficient_privilege then null; end;
  insert into gst_filings (tenant_id, gstin, period, ours, pushed_at, pushed_by) values ('11111111-1111-1111-1111-111111111111', '23AAAAA0000A1Z5', '2026-10', '{}', now(), '99999999-9999-9999-9999-999999999999');
  update gst_filings set portal = '{}', filed_at = now(), filed_by = '99999999-9999-9999-9999-999999999999', arn = 'AA2310260000001';
  begin update gst_filings set arn = 'x'; raise exception 'FAIL: a filed period changed'; exception when check_violation then null; end;
  begin delete from gst_filings; raise exception 'FAIL: the app deleted a filing'; exception when insufficient_privilege then null; end;
  insert into gst_attempts (tenant_id, kind, actor) values ('11111111-1111-1111-1111-111111111111', 'push', '99999999-9999-9999-9999-999999999999') returning id into a;
  update gst_attempts set outcome = 'ok', ended_at = now() where id = a;
  begin update gst_attempts set outcome = 'failed' where id = a; raise exception 'FAIL: an attempt''s outcome changed twice'; exception when check_violation then null; end;
  begin update gst_attempts set kind = 'file' where id = a; raise exception 'FAIL: the app changed an attempt''s kind'; exception when insufficient_privilege then null; end;
  begin delete from gst_attempts; raise exception 'FAIL: the app deleted an attempt'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  -- Even the owner of the table can't change or delete a filed period (the trigger, not only the grant).
  update gst_filings set filed_at = now(), filed_by = pushed_by, arn = 'AA2710260000001' where tenant_id = '22222222-2222-2222-2222-222222222222';
  begin update gst_filings set arn = 'x' where tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: a filed period changed'; exception when check_violation then null; end;
  begin delete from gst_filings where tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: a filed period deleted'; exception when check_violation then null; end;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['gst_connections', 'gst_filings', 'gst_attempts']) t where has_table_privilege(r, t, 'select'))
  then raise exception 'FAIL: an API role reads GST filing rows'; end if;
end $$;

-- 52. The Accountant (0072): only an owner or admin of THIS shop invites, lists or revokes an accountant; the role is
-- fixed; remove takes accountants only; no API role or staff runs the definers.
insert into members (tenant_id, user_id, role) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000052', 'staff');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare i uuid; begin
  begin perform app_invite_accountant('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000052', 'ca@example.in'); raise exception 'FAIL: staff invited an accountant';
  exception when others then if sqlerrm <> 'not_manager' then raise; end if; end;
  begin perform app_invite_accountant('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999', 'ca@example.in'); raise exception 'FAIL: invited into another shop';
  exception when others then if sqlerrm <> 'wrong_shop' then raise; end if; end;
  i := app_invite_accountant('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'ca@example.in');
  if (select count(*) from app_accountant_invites('99999999-9999-9999-9999-999999999999')) <> 1 then raise exception 'FAIL: the owner does not see the invite'; end if;
  if exists (select 1 from app_accountant_invites('aaaaaaaa-0000-0000-0000-000000000052')) then raise exception 'FAIL: staff sees accountant invites'; end if;
  begin perform app_remove_accountant('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'aaaaaaaa-0000-0000-0000-000000000052'); raise exception 'FAIL: remove took a staff member';
  exception when others then if sqlerrm <> 'no_accountant' then raise; end if; end;
  begin perform app_revoke_accountant_invite('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000052', i); raise exception 'FAIL: staff revoked an invite';
  exception when others then if sqlerrm <> 'not_manager' then raise; end if; end;
  perform app_revoke_accountant_invite('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', i);
  begin perform app_revoke_accountant_invite('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', i); raise exception 'FAIL: an invite revoked twice';
  exception when others then if sqlerrm <> 'no_invite' then raise; end if; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r,
             unnest(array['app_invite_accountant(uuid,uuid,text)', 'app_remove_accountant(uuid,uuid,uuid)', 'app_accountant_invites(uuid)', 'app_revoke_accountant_invite(uuid,uuid,uuid)']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: another role runs the accountant definers'; end if;
end $$;

-- 54. Reviews (0079): requests, reviews, photos, reports, settings and opt-outs are the shop's own; a row can never
-- point at another shop's order, line, product or review; a photo lives in its own shop's folder; a Stop is never
-- undone by the app; staff (frata_admin) read none of it.
insert into review_requests (id, tenant_id, order_id, token_nonce, token_hash) values
  ('bcbcbcbc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', repeat('b', 32), 'th-b');
insert into reviews (id, tenant_id, request_id, order_line_id, product_id, rating, display_name)
  select 'bdbdbdbd-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'bcbcbcbc-0000-0000-0000-00000000000b', l.id, 'eeeeeeee-0000-0000-0000-00000000000b', 5, 'Priya S.'
    from order_lines l where l.tenant_id = '22222222-2222-2222-2222-222222222222' and l.order_id = 'acacacac-0000-0000-0000-00000000000b';
insert into review_photos (tenant_id, review_id, base, widths, width, height) values
  ('22222222-2222-2222-2222-222222222222', 'bdbdbdbd-0000-0000-0000-00000000000b', 'https://s.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/reviews/bcbcbcbc-0000-0000-0000-00000000000b/0f0f0f0f-0000-0000-0000-000000000001', '{400}', 400, 500);
insert into review_reports (tenant_id, review_id, reason, ip_hash) values ('22222222-2222-2222-2222-222222222222', 'bdbdbdbd-0000-0000-0000-00000000000b', 'spam', 'iph-b');
insert into review_settings (tenant_id) values ('22222222-2222-2222-2222-222222222222');
insert into wa_opt_outs (tenant_id, phone_hmac) values ('22222222-2222-2222-2222-222222222222', 'ph-b');
select set_config('proof.b_line', (select order_line_id::text from reviews where id = 'bdbdbdbd-0000-0000-0000-00000000000b'), false);
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from review_requests) or exists (select 1 from reviews) or exists (select 1 from review_photos) or exists (select 1 from review_reports)
     or exists (select 1 from review_settings) or exists (select 1 from wa_opt_outs) then raise exception 'FAIL: A sees B review rows'; end if;
  update reviews set hidden_at = now(), hidden_reason = 'spam'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A hid B review'; end if;
  delete from reviews; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A deleted B review'; end if;
  begin insert into review_requests (tenant_id, order_id, token_nonce, token_hash) values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000b', repeat('a', 32), 'th-a');
    raise exception 'FAIL: A asked about B order'; exception when foreign_key_violation then null; end;
  begin insert into reviews (tenant_id, product_id, source, rating, display_name) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', 'import', 1, 'X');
    raise exception 'FAIL: A reviewed B product'; exception when foreign_key_violation then null; end;
  begin insert into reviews (tenant_id, order_line_id, product_id, source, rating, display_name) values
    ('11111111-1111-1111-1111-111111111111', current_setting('proof.b_line')::uuid, 'eeeeeeee-0000-0000-0000-00000000000a', 'import', 1, 'X');
    raise exception 'FAIL: A reviewed B order line'; exception when foreign_key_violation then null; end;
  begin insert into reviews (tenant_id, order_line_id, product_id, source, rating, display_name) values
    ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'eeeeeeee-0000-0000-0000-00000000000a', 'import', 1, 'X');
    raise exception 'FAIL: a review points at a line that is not this shop''s'; exception when foreign_key_violation then null; end;
  begin insert into review_photos (tenant_id, review_id, base, widths, width, height) values
    ('11111111-1111-1111-1111-111111111111', 'bdbdbdbd-0000-0000-0000-00000000000b', 'https://s.public.blob.vercel-storage.com/tenants/11111111-1111-1111-1111-111111111111/reviews/bcbcbcbc-0000-0000-0000-00000000000a/0f0f0f0f-0000-0000-0000-000000000004', '{400}', 1, 1);
    raise exception 'FAIL: A photo on B review'; exception when foreign_key_violation then null; end;
  insert into reviews (id, tenant_id, product_id, source, rating, display_name) values ('bdbdbdbd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'import', 4, 'Asha K.');
  begin insert into review_photos (tenant_id, review_id, base, widths, width, height) values
    ('11111111-1111-1111-1111-111111111111', 'bdbdbdbd-0000-0000-0000-00000000000a', 'https://s.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/reviews/bcbcbcbc-0000-0000-0000-00000000000a/0f0f0f0f-0000-0000-0000-000000000005', '{400}', 1, 1);
    raise exception 'FAIL: A photo stored in B folder'; exception when check_violation then null; end;
  -- Anchored: a second /tenants/ segment, a foreign host and a stray suffix are all refused (tenancy audit R1).
  begin insert into review_photos (tenant_id, review_id, base, widths, width, height) values ('11111111-1111-1111-1111-111111111111', 'bdbdbdbd-0000-0000-0000-00000000000a',
    'https://s.public.blob.vercel-storage.com/tenants/22222222-2222-2222-2222-222222222222/reviews/x/p#/tenants/11111111-1111-1111-1111-111111111111/reviews/', '{400}', 1, 1);
    raise exception 'FAIL: a photo path smuggled into B folder'; exception when check_violation then null; end;
  begin insert into review_photos (tenant_id, review_id, base, widths, width, height) values ('11111111-1111-1111-1111-111111111111', 'bdbdbdbd-0000-0000-0000-00000000000a',
    'https://evil.example/tenants/11111111-1111-1111-1111-111111111111/reviews/bcbcbcbc-0000-0000-0000-00000000000a/0f0f0f0f-0000-0000-0000-000000000002', '{400}', 1, 1);
    raise exception 'FAIL: a photo on a foreign host'; exception when check_violation then null; end;
  begin insert into review_photos (tenant_id, review_id, base, widths, width, height) values ('11111111-1111-1111-1111-111111111111', 'bdbdbdbd-0000-0000-0000-00000000000a',
    'https://sxpublicxblobxvercel-storagexcom/tenants/11111111-1111-1111-1111-111111111111/reviews/bcbcbcbc-0000-0000-0000-00000000000a/0f0f0f0f-0000-0000-0000-000000000006', '{400}', 1, 1);
    raise exception 'FAIL: the host pattern''s dots match any character'; exception when check_violation then null; end;
  insert into review_photos (tenant_id, review_id, base, widths, width, height) values ('11111111-1111-1111-1111-111111111111', 'bdbdbdbd-0000-0000-0000-00000000000a',
    'https://s.public.blob.vercel-storage.com/tenants/11111111-1111-1111-1111-111111111111/reviews/bcbcbcbc-0000-0000-0000-00000000000a/0f0f0f0f-0000-0000-0000-000000000003', '{400}', 1, 1);
  begin insert into reviews (tenant_id, request_id, product_id, rating, display_name) values ('11111111-1111-1111-1111-111111111111', 'bcbcbcbc-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000a', 3, 'X');
    raise exception 'FAIL: A review on B request'; exception when foreign_key_violation then null; end;
  begin insert into wa_opt_outs (tenant_id, phone_hmac) values ('22222222-2222-2222-2222-222222222222', 'ph-x'); raise exception 'FAIL: A wrote B opt-outs';
  exception when insufficient_privilege then null; end;
  insert into wa_opt_outs (tenant_id, phone_hmac) values ('11111111-1111-1111-1111-111111111111', 'ph-a');
  begin delete from wa_opt_outs; raise exception 'FAIL: the app undid a Stop'; exception when insufficient_privilege then null; end;
  begin delete from review_requests; raise exception 'FAIL: the app deleted a request'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r,
             unnest(array['review_requests', 'reviews', 'review_photos', 'review_reports', 'review_settings', 'wa_opt_outs']) t,
             unnest(array['select', 'insert', 'update', 'delete']) p
             where has_table_privilege(r, t, p)) then raise exception 'FAIL: another role reads or writes reviews'; end if;
end $$;
-- A deleted line unlinks its review and keeps its shop (set null on order_line_id only).
do $$ begin
  delete from order_lines where id = current_setting('proof.b_line')::uuid;
  if (select tenant_id from reviews where id = 'bdbdbdbd-0000-0000-0000-00000000000b') <> '22222222-2222-2222-2222-222222222222'
     or (select order_line_id from reviews where id = 'bdbdbdbd-0000-0000-0000-00000000000b') is not null then raise exception 'FAIL: set null touched tenant_id or kept the line'; end if;
end $$;

-- 55. Videos (V1, 0081): the shop's own rows; the app never deletes one or changes its shop, environment or ids once
-- set; Mux's events reach a shop only through the definer, with our row id AND the row's upload id from the same
-- environment (or, for a rendition, an asset id already on the row); the stored payload is five fields.
insert into videos (id, tenant_id, mux_env, upload_id, created_by) values
  ('dededede-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'prod1', 'upB1', '99999999-9999-9999-9999-999999999999');
insert into videos (id, tenant_id, mux_env, created_by) values
  ('dededede-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-222222222222', 'prod1', '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare a uuid; n int; begin
  if exists (select 1 from videos) then raise exception 'FAIL: A sees B videos'; end if;
  begin insert into videos (tenant_id, mux_env, created_by) values ('22222222-2222-2222-2222-222222222222', 'prod1', '99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: A wrote a B video';
  exception when insufficient_privilege then null; end;
  update videos set removed_at = now() where id = 'dededede-0000-0000-0000-00000000000b';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A removed a B video'; end if;
  -- Mux's ids never arrive with the row: only shop, environment and member are inserted (audit H1).
  begin insert into videos (tenant_id, mux_env, created_by, asset_id) values ('11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999', 'asForged'); raise exception 'FAIL: a row was inserted with an asset id';
  exception when insufficient_privilege then null; end;
  begin insert into videos (tenant_id, mux_env, created_by, created_at) values ('11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999', '2000-01-01'); raise exception 'FAIL: a row was back-dated';
  exception when insufficient_privilege then null; end;
  insert into videos (tenant_id, mux_env, created_by) values ('11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999') returning id into a;
  update videos set upload_id = 'upA1' where id = a;
  begin update videos set upload_id = 'upA2' where id = a; raise exception 'FAIL: an upload id changed'; exception when check_violation then null; end;
  begin update videos set tenant_id = '22222222-2222-2222-2222-222222222222' where id = a; raise exception 'FAIL: a video moved shop'; exception when insufficient_privilege then null; end;
  begin update videos set mux_env = 'dev1' where id = a; raise exception 'FAIL: a video changed environment'; exception when insufficient_privilege then null; end;
  begin update videos set id = gen_random_uuid() where id = a; raise exception 'FAIL: a video changed id'; exception when insufficient_privilege then null; end;
  begin update videos set created_by = gen_random_uuid() where id = a; raise exception 'FAIL: a video changed member'; exception when insufficient_privilege then null; end;
  begin update videos set created_at = '2000-01-01' where id = a; raise exception 'FAIL: a video was back-dated'; exception when insufficient_privilege then null; end;
  update videos set asset_id = 'asA1', playback_id = 'pbA1', removed_at = now() where id = a;
  begin update videos set asset_id = 'asA2' where id = a; raise exception 'FAIL: an asset id changed'; exception when check_violation then null; end;
  begin update videos set playback_id = 'pbA2' where id = a; raise exception 'FAIL: a playback id changed'; exception when check_violation then null; end;
  begin update videos set removed_at = null where id = a; raise exception 'FAIL: a removed video came back'; exception when check_violation then null; end;
  begin delete from videos; raise exception 'FAIL: the app deleted a video'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin; set local role frata_app;
do $$ declare t uuid; begin
  -- No shop set: the definer routes; the caller never names a shop.
  if app_store_mux_event('prod1', 'ev-1', 'video.asset.ready', 'dededede-0000-0000-0000-00000000000b', 'upX', 'asB1', 'ready') is not null then raise exception 'FAIL: a wrong upload id reached a shop'; end if;
  if app_store_mux_event('dev1', 'ev-2', 'video.asset.ready', 'dededede-0000-0000-0000-00000000000b', 'upB1', 'asB1', 'ready') is not null then raise exception 'FAIL: another environment reached a shop'; end if;
  if app_store_mux_event('prod1', 'ev-3', 'video.upload.created', 'dededede-0000-0000-0000-00000000000b', 'upB1', null, 'waiting') is not null then raise exception 'FAIL: an unlisted event type was stored'; end if;
  if app_store_mux_event('prod1', 'ev-4', 'video.asset.ready', null, 'upB1', 'asB1', 'ready') is not null then raise exception 'FAIL: an event with no row id was routed'; end if;
  if app_store_mux_event('prod1', 'ev-5', 'video.asset.static_rendition.ready', null, null, 'asB1', 'ready') is not null then raise exception 'FAIL: a rendition reached a row with no asset id'; end if;
  t := app_store_mux_event('prod1', 'ev-6', 'video.asset.ready', 'dededede-0000-0000-0000-00000000000b', 'upB1', 'asB1', 'ready');
  if t is distinct from '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: a right event did not reach its shop'; end if;
  if app_store_mux_event('prod1', 'ev-6', 'video.asset.ready', 'dededede-0000-0000-0000-00000000000b', 'upB1', 'asB1', 'ready') is not null then raise exception 'FAIL: a retry was stored twice'; end if;
  -- A pending row whose upload id is unknown takes it once; then a different one is refused.
  if app_store_mux_event('prod1', 'ev-7', 'video.upload.asset_created', 'dededede-0000-0000-0000-00000000000c', 'upC1', 'asC1', 'asset_created') is distinct from '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: a pending row did not take its upload id'; end if;
  if app_store_mux_event('prod1', 'ev-8', 'video.upload.asset_created', 'dededede-0000-0000-0000-00000000000c', 'upC2', 'asC2', 'asset_created') is not null then raise exception 'FAIL: a second upload id reached a row'; end if;
  if exists (select 1 from webhook_events where provider = 'mux') then raise exception 'FAIL: the app reads Mux events with no shop set'; end if;
end $$;
rollback;
do $$ begin
  update videos set asset_id = 'asB1' where id = 'dededede-0000-0000-0000-00000000000b';
end $$;
begin; set local role frata_app;
do $$ begin
  if app_store_mux_event('dev1', 'ev-10', 'video.asset.static_rendition.ready', null, null, 'asB1', 'ready') is not null then raise exception 'FAIL: a rendition from another environment reached a row'; end if;
  if app_store_mux_event('prod1', 'ev-9', 'video.asset.static_rendition.ready', null, null, 'asB1', 'ready') is distinct from '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: a rendition did not reach its row'; end if;
end $$;
commit;
do $$ begin
  if (select array_agg(k order by k) from webhook_events e, jsonb_object_keys(e.payload) k where e.event_key = 'mux:prod1:ev-9') is distinct from array['asset_id', 'status', 'type', 'upload_id', 'video']
  then raise exception 'FAIL: a Mux event stored more than its five fields'; end if;
  if (select payload->>'video' from webhook_events where event_key = 'mux:prod1:ev-9') is distinct from 'dededede-0000-0000-0000-00000000000b' then raise exception 'FAIL: a rendition event lost its row'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update']) p where has_any_column_privilege(r, 'videos', p))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_table_privilege(r, 'videos', 'delete'))
  then raise exception 'FAIL: another role reads or writes videos'; end if;
  if has_table_privilege('frata_app', 'videos', 'delete') then raise exception 'FAIL: the app may delete a video'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, 'app_store_mux_event(text, text, text, uuid, text, text, text)', 'execute'))
  then raise exception 'FAIL: an API role runs the Mux definer'; end if;
end $$;

\echo 'tenancy proof — all 61 checks passed'
