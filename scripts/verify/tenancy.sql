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

-- 8. Support access: active session counts, expired does not; removed staff lose it at once. Since staff passkeys
--    (2026-11-12) a visit counts only with a live passkey step-up on the same browser session.
insert into staff_passkeys (id, user_id, credential_id, public_key, name) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cred-proof-s', 'key-proof-s', 'proof');
insert into staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'proof-hash-s', now() + interval '1 hour');
begin; set local role frata_app;
do $$ declare m jsonb := app_access_for('aaaaaaaa-0000-0000-0000-000000000001'); begin
  if m->>'staffRole' <> 'support' then raise exception 'FAIL: staff role'; end if;
  if jsonb_array_length(m->'memberships') <> 0 then raise exception 'FAIL: a support visit counts without a passkey step-up (%)', m; end if;
  m := app_access_for('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'proof-hash-s');
  if jsonb_array_length(m->'memberships') <> 0 then raise exception 'FAIL: a step-up from another session counts (%)', m; end if;
  m := app_access_for('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'proof-hash-s');
  if m->>'staffConfirmedAt' is null then raise exception 'FAIL: live step-up not seen'; end if;
  if jsonb_array_length(m->'memberships') <> 1 then raise exception 'FAIL: expired session still grants access (%)', m; end if;
  if (m->'memberships'->0->>'tenantId') <> '22222222-2222-2222-2222-222222222222' then raise exception 'FAIL: wrong support tenant'; end if;
  if (m->'memberships'->0->>'supportSessionId') is null then raise exception 'FAIL: support row not marked'; end if;
end $$;
commit;
begin;
delete from platform_staff where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role frata_app;
do $$ begin
  if jsonb_array_length(app_access_for('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'proof-hash-s')->'memberships') <> 0 then raise exception 'FAIL: removed staff keep a live session'; end if;
end $$;
rollback;

-- 9. A member who is also on a support visit gets ONE row, the support one.
begin;
insert into members (tenant_id, user_id, role) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff');
set local role frata_app;
do $$ declare m jsonb := app_access_for('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'proof-hash-s'); begin
  if jsonb_array_length(m->'memberships') <> 1 or (m->'memberships'->0->>'supportSessionId') is null then raise exception 'FAIL: support row not preferred (%)', m; end if;
end $$;
rollback;

-- 9b. Staff passkeys (docs/specs/2026-11-12-staff-passkeys.md). No role holds a privilege on the staff_* tables; only
--     frata_admin executes the app_staff_* definers (frata_app: app_access_for and app_staff_signout; nobody:
--     app_staff_bootstrap); the definers keep people, sessions and purposes apart.
do $$ declare t text; r text; begin
  foreach t in array array['staff_passkeys','staff_enrolment_requests','staff_webauthn_challenges','staff_stepups','staff_passkey_tries','staff_notices'] loop
    foreach r in array array['frata_app','frata_admin','anon','authenticated','service_role'] loop
      if has_table_privilege(r, 'public.' || t, 'select,insert,update,delete') then raise exception 'FAIL: % holds a privilege on %', r, t; end if;
    end loop;
  end loop;
  if has_function_privilege('frata_app', 'public.app_staff_challenge(uuid,uuid,text,text,text)', 'execute') then raise exception 'FAIL: frata_app may start a passkey check'; end if;
  if not has_function_privilege('frata_admin', 'public.app_staff_challenge(uuid,uuid,text,text,text)', 'execute') then raise exception 'FAIL: frata_admin may not start a passkey check'; end if;
  if has_function_privilege('frata_admin', 'public.app_staff_bootstrap(text,text)', 'execute') or has_function_privilege('frata_app', 'public.app_staff_bootstrap(text,text)', 'execute') then raise exception 'FAIL: an app role may bootstrap'; end if;
  if has_function_privilege('frata_admin', 'public.app_staff_notify(text,text,text,text)', 'execute') or has_function_privilege('frata_app', 'public.app_staff_notify(text,text,text,text)', 'execute') then raise exception 'FAIL: an app role may write a staff email'; end if;
  -- Only Admin's role reads or settles the staff security emails; the shops' role can neither read nor silence them.
  if has_function_privilege('frata_app', 'public.app_staff_notices_claim(integer)', 'execute') or not has_function_privilege('frata_admin', 'public.app_staff_notices_claim(integer)', 'execute')
     or has_function_privilege('frata_app', 'public.app_staff_notices_settle(uuid,boolean,text)', 'execute') then raise exception 'FAIL: staff emails claimed by the wrong role'; end if;
end $$;
begin;
insert into platform_staff (user_id, email, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'pk-a@proof.test', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'pk-b@proof.test', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'pk-s@proof.test', 'support');
insert into staff_passkeys (id, user_id, credential_id, public_key, counter, name) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'cred-a', 'key-a', 0, 'A laptop'),
  ('dddddddd-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'cred-b', 'key-b', 5, 'B laptop');
set local role frata_app;
do $$ begin
  begin perform 1 from staff_stepups; raise exception 'FAIL: frata_app reads staff_stepups'; exception when insufficient_privilege then null; end;
end $$;
reset role; set local role frata_admin;
do $$
declare A uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1'; B uuid := 'aaaaaaaa-0000-0000-0000-0000000000a2'; S uuid := 'aaaaaaaa-0000-0000-0000-0000000000a3';
  M uuid := '99999999-9999-9999-9999-999999999999';
  sA uuid := 'eeeeeeee-0000-0000-0000-0000000000a1'; sB uuid := 'eeeeeeee-0000-0000-0000-0000000000a2'; sS uuid := 'eeeeeeee-0000-0000-0000-0000000000a3'; sX uuid := 'eeeeeeee-0000-0000-0000-0000000000ff';
  ch text := repeat('a', 43); k jsonb; e text; l jsonb;
begin
  begin perform 1 from staff_passkeys; raise exception 'FAIL: frata_admin reads staff_passkeys'; exception when insufficient_privilege then null; end;
  -- A merchant's user id is refused.
  begin perform app_staff_challenge(M, sA, 'confirm', null, ch); raise exception 'FAIL: a merchant started a passkey check'; exception when raise_exception then if sqlerrm <> 'not_staff' then raise; end if; end;
  -- A challenge belongs to one person, one session, one purpose, once; the key comes back only for that person's credential.
  perform app_staff_challenge(A, sA, 'confirm', null, ch);
  if app_staff_take_challenge(B, sA, 'confirm', ch, 'cred-a') is not null then raise exception 'FAIL: another person took a challenge'; end if;
  if app_staff_take_challenge(A, sX, 'confirm', ch, 'cred-a') is not null then raise exception 'FAIL: another session took a challenge'; end if;
  if app_staff_take_challenge(A, sA, 'add', ch, 'cred-a') is not null then raise exception 'FAIL: another purpose took a challenge'; end if;
  if app_staff_take_challenge(A, sA, 'confirm', ch, 'cred-b') is not null then raise exception 'FAIL: another person''s key came back'; end if;
  perform app_staff_challenge(A, sA, 'confirm', null, repeat('b', 43));
  k := app_staff_take_challenge(A, sA, 'confirm', repeat('b', 43), 'cred-a');
  if k->>'publicKey' <> 'key-a' then raise exception 'FAIL: own key not returned (%)', k; end if;
  if app_staff_take_challenge(A, sA, 'confirm', repeat('b', 43), 'cred-a') is not null then raise exception 'FAIL: a challenge was used twice'; end if;
  perform app_staff_confirm(A, sA, repeat('b', 43), (k->>'passkeyId')::uuid, 0, 'hash-a');
  begin perform app_staff_confirm(A, sA, repeat('b', 43), (k->>'passkeyId')::uuid, 0, 'hash-a2'); raise exception 'FAIL: confirmed without a challenge'; exception when raise_exception then if sqlerrm <> 'no_challenge' then raise; end if; end;
  -- The counter only rises.
  perform app_staff_challenge(B, sB, 'confirm', null, repeat('c', 43));
  k := app_staff_take_challenge(B, sB, 'confirm', repeat('c', 43), 'cred-b');
  begin perform app_staff_confirm(B, sB, repeat('c', 43), (k->>'passkeyId')::uuid, 5, 'hash-b'); raise exception 'FAIL: a replayed counter was accepted'; exception when raise_exception then if sqlerrm <> 'replay' then raise; end if; end;
  -- Requests: approved only by another admin, freshly checked, with the right code; bound to the asking session.
  perform app_staff_request(S, sS, 'code-s');
  begin perform app_staff_approve(S, sS, null, 'pk-s@proof.test', 'code-s'); raise exception 'FAIL: support approved'; exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end;
  begin perform app_staff_approve(B, sB, 'hash-b', 'pk-s@proof.test', 'code-s'); raise exception 'FAIL: approved without a passkey check'; exception when raise_exception then if sqlerrm <> 'confirm_first' then raise; end if; end;
  perform app_staff_request(A, sA, 'code-a');
  begin perform app_staff_approve(A, sA, 'hash-a', 'pk-a@proof.test', 'code-a'); raise exception 'FAIL: an admin approved their own request'; exception when raise_exception then if sqlerrm <> 'own_request' then raise; end if; end;
  if app_staff_approve(A, sA, 'hash-a', 'pk-s@proof.test', 'wrong') is not null then raise exception 'FAIL: a wrong code was approved'; end if;
  e := app_staff_approve(A, sA, 'hash-a', 'pk-s@proof.test', 'code-s');
  if e is distinct from 'pk-s@proof.test' then raise exception 'FAIL: the right code was not approved (%)', e; end if;
  begin perform app_staff_challenge(S, sX, 'add', null, repeat('d', 43)); raise exception 'FAIL: an approval worked from another session'; exception when raise_exception then if sqlerrm <> 'not_allowed' then raise; end if; end;
  perform app_staff_challenge(S, sS, 'add', null, repeat('e', 43));
  if app_staff_take_challenge(S, sS, 'add', repeat('e', 43), '') is null then raise exception 'FAIL: add challenge not taken'; end if;
  perform app_staff_add_passkey(S, sS, null, 'cred-s', 'key-s', 0, '{}', 'S phone');
  perform app_staff_challenge(A, sA, 'add', 'hash-a', repeat('f', 43));
  perform app_staff_take_challenge(A, sA, 'add', repeat('f', 43), '');
  begin perform app_staff_add_passkey(A, sA, 'hash-a', 'cred-s', 'key-x', 0, '{}', 'dup'); raise exception 'FAIL: a duplicate credential was added'; exception when raise_exception then if sqlerrm <> 'duplicate' then raise; end if; end;
  begin perform app_staff_challenge(S, sS, 'add', null, repeat('g', 43)); raise exception 'FAIL: an approval was used twice'; exception when raise_exception then if sqlerrm <> 'not_allowed' then raise; end if; end;
  -- Wrong codes are counted, not rolled back: the 6th try in 10 minutes is refused.
  perform app_staff_request(B, sB, 'code-b');
  perform app_staff_approve(A, sA, 'hash-a', 'pk-b@proof.test', 'wrong-1');
  perform app_staff_approve(A, sA, 'hash-a', 'pk-b@proof.test', 'wrong-2');
  perform app_staff_approve(A, sA, 'hash-a', 'pk-b@proof.test', 'wrong-3');
  begin perform app_staff_approve(A, sA, 'hash-a', 'pk-b@proof.test', 'code-b'); raise exception 'FAIL: wrong codes were not counted'; exception when raise_exception then if sqlerrm <> 'too_many' then raise; end if; end;
  -- The list never carries a key, a credential id or a counter; support needs a step-up and sees only itself.
  l := app_staff_list(A, sA, 'hash-a');
  if l::text ~ '(publicKey|credential|counter|key-a|cred-a)' then raise exception 'FAIL: the list leaks key material'; end if;
  if jsonb_array_length(l) < 3 then raise exception 'FAIL: admin list short (%)', l; end if;
  begin perform app_staff_list(S, sS, null); raise exception 'FAIL: listed without a step-up'; exception when raise_exception then if sqlerrm <> 'confirm_first' then raise; end if; end;
end $$;
reset role;
do $$ begin
  -- The approval and the added passkey each emailed the person and every admin.
  if (select count(*) from staff_notices where kind = 'request_approved' and about = 'pk-s@proof.test') < 3 then raise exception 'FAIL: approval not emailed to the person and the admins'; end if;
  if not exists (select 1 from staff_notices where kind = 'passkey_added' and about = 'pk-s@proof.test' and to_email = 'pk-a@proof.test') then raise exception 'FAIL: a new passkey not emailed to the admins'; end if;
  if app_staff_live_stepup('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000a1', 'hash-a') is null then raise exception 'FAIL: step-up not made'; end if;
  if app_staff_live_stepup('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000ff', 'hash-a') is not null then raise exception 'FAIL: a step-up counts on another session'; end if;
end $$;
do $$
declare B uuid := 'aaaaaaaa-0000-0000-0000-0000000000a2'; sB uuid := 'eeeeeeee-0000-0000-0000-0000000000a2'; n int; m int;
begin
  -- The owner's break-glass approves only the request whose code is on the person's screen (security re-review F5).
  perform app_staff_request(B, sB, encode(sha256(convert_to('staff-enrol:123456', 'UTF8')), 'hex'));
  begin perform app_staff_bootstrap('pk-b@proof.test', '654321'); raise exception 'FAIL: bootstrap approved without the code'; exception when raise_exception then if sqlerrm <> 'no_request_with_that_code' then raise; end if; end;
  if app_staff_bootstrap('pk-b@proof.test', '123 456') <> 'approved for 10 minutes' then raise exception 'FAIL: bootstrap with the code refused'; end if;
  -- The passkey check names the person's own credentials: ids and transports only, never a key or counter (drizzle/0111).
  if has_function_privilege('frata_app', 'public.app_staff_credentials(uuid)', 'execute') or not has_function_privilege('frata_admin', 'public.app_staff_credentials(uuid)', 'execute') then raise exception 'FAIL: wrong role may list passkey ids'; end if;
  if app_staff_credentials(B)::text ~ '(publicKey|public_key|counter|key-b)' or app_staff_credentials(B)::text !~ 'cred-b' then raise exception 'FAIL: credential list wrong (%)', app_staff_credentials(B); end if;
  if app_staff_credentials('99999999-9999-9999-9999-999999999999') <> '[]'::jsonb then raise exception 'FAIL: a non-staff id listed passkeys'; end if;
  -- A claim holds its rows: a second sender straight after gets none of them (security re-review F4).
  select count(*) into n from app_staff_notices_claim(50);
  select count(*) into m from app_staff_notices_claim(50);
  if n = 0 or m <> 0 then raise exception 'FAIL: a staff email could be claimed twice (% then %)', n, m; end if;
end $$;
-- Removing a staff member ends their step-ups at once.
delete from platform_staff where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
do $$ begin
  if exists (select 1 from staff_stepups where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') then raise exception 'FAIL: removed staff keep a step-up'; end if;
  if app_staff_live_stepup('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000a1', 'hash-a') is not null then raise exception 'FAIL: removed staff still confirmed'; end if;
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

-- Partner passkeys (T1b): § 28's and § 77's partner calls carry a real passkey check. Proof-only helpers in schema `proof`
-- (never in drizzle/, dropped and asserted gone at the end of § 78): `proof.key` inserts ONLY the passkey row; the
-- check itself runs through the real app_partner_pk_challenge / take / confirm as frata_app (`proof.check`).
create schema proof;
grant usage on schema proof to frata_app, frata_admin;
create function proof.sess(p_uid uuid) returns uuid language sql immutable as $$ select (substr(md5('sess' || p_uid::text), 1, 8) || '-' || substr(md5('sess' || p_uid::text), 9, 4) || '-4' || substr(md5('sess' || p_uid::text), 14, 3) || '-8' || substr(md5('sess' || p_uid::text), 18, 3) || '-' || substr(md5('sess' || p_uid::text), 21, 12))::uuid $$;
create function proof.key(p_uid uuid) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
  select null, p_uid, me.email, 'member', 'partner.passkey.add', me.member_id::text, '{"name":"Proof key","via":"proof"}'::jsonb
    from (select x.member_id, (select pm.email from public.partner_members pm where pm.id = x.member_id) as email from public.app_pm_live(p_uid) x) me
   where not exists (select 1 from public.partner_passkeys k where k.partner_member_id = me.member_id);
  -- as a real add: the passkey, and its audit row (an owner who ever had one waits 24 hours to recover, 0129)
  insert into public.partner_passkeys (partner_member_id, user_id, credential_id, public_key, name)
  select me.member_id, p_uid, 'proof-' || me.member_id, 'proof', 'Proof key' from public.app_pm_live(p_uid) me
   where not exists (select 1 from public.partner_passkeys k where k.partner_member_id = me.member_id) $$;
create function proof.check(p_uid uuid) returns text language plpgsql as $$
declare s uuid := proof.sess(p_uid); ch text := 'proofchallenge' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); k jsonb; h text;
begin
  if public.app_partner_pk_state(p_uid, s) is null then return null; end if;
  perform proof.key(p_uid);
  perform public.app_partner_pk_challenge(p_uid, s, 'confirm', null, ch);
  select (public.app_partner_pk_credentials(p_uid)->0->>'id') into h;
  k := public.app_partner_pk_take_challenge(p_uid, s, 'confirm', ch, h);
  h := 'proofhash' || md5(ch);
  perform public.app_partner_pk_confirm(p_uid, s, ch, (k->>'passkeyId')::uuid, 0, h);
  perform set_config('proof.h' || replace(p_uid::text, '-', ''), h, false);
  return h;
end $$;
create function proof.h(p_uid uuid) returns text language sql as $$
  select coalesce(nullif(current_setting('proof.h' || replace(p_uid::text, '-', ''), true), ''), proof.check(p_uid)) $$;
grant execute on all functions in schema proof to frata_app, frata_admin;

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
  begin perform app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000011', proof.sess('aaaaaaaa-0000-0000-0000-000000000011'), proof.h('aaaaaaaa-0000-0000-0000-000000000011'), 'Q shop', 'proof-q', '302001', 2000, 24, 90, 10); raise exception 'FAIL: an applicant made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
end $$;
commit;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000010';
update partners set declined_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000011';
begin; set local role frata_app;
do $$ declare t uuid; n int; inv uuid; m jsonb; begin
  begin perform app_partner_apply('aaaaaaaa-0000-0000-0000-000000000011', 'Quinn again', '', '919845012346', 'Surat', '{}', '', '0', 1); raise exception 'FAIL: a declined application was changed';
  exception when sqlstate 'P0001' then if sqlerrm <> 'decided' then raise; end if; end;
  begin perform app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000011', proof.sess('aaaaaaaa-0000-0000-0000-000000000011'), proof.h('aaaaaaaa-0000-0000-0000-000000000011'), 'Q shop', 'proof-q', '302001', 2000, 24, 90, 10); raise exception 'FAIL: a declined partner made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  t := app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000010', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010'), 'Proof P', 'proof-p', '302001', 2000, 24, 90, 1);
  -- the cap counts stores that have not opened
  begin perform app_partner_create_shop('aaaaaaaa-0000-0000-0000-000000000010', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010'), 'Proof P2', 'proof-p2', '302001', 2000, 24, 90, 1); raise exception 'FAIL: past the cap of unopened stores';
  exception when sqlstate 'P0001' then if sqlerrm <> 'too_many' then raise; end if; end;
  m := app_access_for('aaaaaaaa-0000-0000-0000-000000000010', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), null, proof.h('aaaaaaaa-0000-0000-0000-000000000010'));
  if jsonb_array_length(m->'memberships') <> 1 or m->'memberships'->0->>'role' <> 'partner' then raise exception 'FAIL: partner membership (%)', m; end if;
  if (select count(*) from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000010', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010'))) <> 1 then raise exception 'FAIL: partner clients'; end if;
  if exists (select 1 from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000011', proof.sess('aaaaaaaa-0000-0000-0000-000000000011'), proof.h('aaaaaaaa-0000-0000-0000-000000000011'))) or exists (select 1 from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000013', proof.sess('aaaaaaaa-0000-0000-0000-000000000013'), proof.h('aaaaaaaa-0000-0000-0000-000000000013'))) then raise exception 'FAIL: another person sees P clients'; end if;
  -- links: own shop only
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if exists (select 1 from partner_links) then raise exception 'FAIL: A sees P shop link'; end if;
  if exists (select 1 from app_shop_people() where role = 'partner') then raise exception 'FAIL: A lists P shop people'; end if;
  perform set_config('app.tenant_id', t::text, true);
  if (select count(*) from partner_links) <> 1 or (select share_bps from partner_links) <> 2000 then raise exception 'FAIL: P shop link'; end if;
  perform set_config('app.tenant_id', '', true);
  -- handover: only the linked partner; never to a member's own email; one open owner invite
  begin perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000013', 'x@else.test', proof.sess('aaaaaaaa-0000-0000-0000-000000000013'), proof.h('aaaaaaaa-0000-0000-0000-000000000013')); raise exception 'FAIL: a stranger handed over P shop';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  begin perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'P@Studio.test', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010')); raise exception 'FAIL: partner handed the store to themself';
  exception when sqlstate 'P0001' then if sqlerrm <> 'member_email' then raise; end if; end;
  perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'first@brand.test', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010'));
  inv := app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'Owner@Brand.test', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010'));
  -- sign-in does not claim a handover; it waits for Accept
  if app_claim_invites('aaaaaaaa-0000-0000-0000-000000000012') <> 0 then raise exception 'FAIL: sign-in claimed a handover'; end if;
  if (select count(*) from app_my_handovers('aaaaaaaa-0000-0000-0000-000000000012')) <> 1 then raise exception 'FAIL: owner does not see the handover'; end if;
  if exists (select 1 from app_my_handovers('aaaaaaaa-0000-0000-0000-000000000013')) then raise exception 'FAIL: a stranger sees the handover'; end if;
  begin perform app_accept_handover_v2('aaaaaaaa-0000-0000-0000-000000000013', inv, null, 1::smallint); raise exception 'FAIL: a stranger accepted the handover';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_invite' then raise; end if; end;
  if app_accept_handover_v2('aaaaaaaa-0000-0000-0000-000000000012', inv, null, 1::smallint) <> t then raise exception 'FAIL: accept'; end if;
  begin perform app_handover_invite(t, 'aaaaaaaa-0000-0000-0000-000000000010', 'later@brand.test', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010')); raise exception 'FAIL: handover after an owner exists';
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
  if exists (select 1 from jsonb_array_elements(app_access_for('aaaaaaaa-0000-0000-0000-000000000010', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), null, proof.h('aaaaaaaa-0000-0000-0000-000000000010'))->'memberships') e where e->>'tenantId' = t::text) then raise exception 'FAIL: removed partner keeps access'; end if;
  if exists (select 1 from app_partner_clients('aaaaaaaa-0000-0000-0000-000000000010', proof.sess('aaaaaaaa-0000-0000-0000-000000000010'), proof.h('aaaaaaaa-0000-0000-0000-000000000010')) where slug is not null or owner_email is not null or plan_name is not null) then raise exception 'FAIL: removed partner still sees the shop details'; end if;
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
  if has_function_privilege('anon', 'app_partner_create_shop(uuid, uuid, text, text, text, text, integer, integer, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'app_accept_handover(uuid, uuid)', 'execute')
     or has_function_privilege('service_role', 'app_remove_partner(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'app_shop_people()', 'execute')
     or has_function_privilege('authenticated', 'app_my_partner(uuid)', 'execute')
     or has_function_privilege('frata_admin', 'app_partner_create_shop(uuid, uuid, text, text, text, text, integer, integer, integer, integer)', 'execute') then
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
  if (select count(*) from addon_prices) <> 4 then -- reviews, true_profit, marketplace_export, delivery_zones (0113)
   raise exception 'FAIL: app cannot read add-on prices'; end if;
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
  -- The terms a use keeps (0109: tiers, Buy X get Y, the products covered) are written with it and never changed after.
  begin update order_discounts set target_products = null, tier_mins = null; raise exception 'FAIL: app changed the terms an order kept'; exception when insufficient_privilege then null; end;
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
  if exists (select 1 from orders o where o.discount <> coalesce((select sum(l.line_discount) from order_lines l where l.tenant_id = o.tenant_id and l.order_id = o.id and l.removed_at is null), 0)) then
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
  ('b1110000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '2026-09-30T18:30:00Z', '2026-10-31T18:30:00Z', 100, 9, 9, 0, 118),
  ('b1110000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', '2026-10-31T18:30:00Z', '2026-11-30T18:30:00Z', 0, 0, 0, 0, 0);
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
  -- 0108 (owner, 2026-11-12: a returned item isn't billable): an order's fee comes back as 'outcome' once ever and as
  -- 'return' once per invoice; no other kind; never on B's order.
  insert into frrata_fee_credits (tenant_id, invoice_id, order_id, kind, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'acacacac-0000-0000-0000-0000000b111a', 'return', 857);
  insert into frrata_fee_credits (tenant_id, invoice_id, order_id, kind, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a1', 'acacacac-0000-0000-0000-0000000b111a', 'outcome', 857);
  begin insert into frrata_fee_credits (tenant_id, invoice_id, order_id, kind, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a2', 'acacacac-0000-0000-0000-0000000b111a', 'outcome', 857); raise exception 'FAIL: an outcome credit given twice';
  exception when unique_violation then null; end;
  begin insert into frrata_fee_credits (tenant_id, invoice_id, order_id, kind, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a2', 'acacacac-0000-0000-0000-0000000b111a', 'goodwill', 1); raise exception 'FAIL: a fee credit of another kind';
  exception when check_violation then null; end;
  begin insert into frrata_fee_credits (tenant_id, invoice_id, order_id, kind, fee) values ('11111111-1111-1111-1111-111111111111', 'b1110000-0000-0000-0000-0000000000a2', 'acacacac-0000-0000-0000-0000000b111b', 'return', 857); raise exception 'FAIL: A gave a return credit on a B order';
  exception when foreign_key_violation then null; end;
  delete from frrata_fee_credits where tenant_id = '11111111-1111-1111-1111-111111111111';
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
               unnest(array['app_issue_frrata_invoices(timestamptz,int,bigint,uuid,text,text,text,text,boolean,text,text,boolean)', 'app_record_frrata_payment(uuid,bigint,text,text,uuid)', 'app_issue_frrata_credit_note(uuid,bigint,text,uuid,text,text)']) f
             where has_function_privilege(r, f, 'execute')) then raise exception 'FAIL: a non-Admin role may issue, record or credit'; end if;
  if not has_function_privilege('frata_admin', 'app_issue_frrata_invoices(timestamptz,int,bigint,uuid,text,text,text,text,boolean,text,text,boolean)', 'execute') then raise exception 'FAIL: Admin cannot issue'; end if;
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
  -- Billing R5: a bank mandate (eNACH) is pending until the bank confirms it, whatever the caller says.
  perform app_begin_mandate('cust_proofA', 'order_proofA2', 'emandate', 10000000, '99999999-9999-9999-9999-999999999999');
  select app_complete_mandate('order_proofA2', 'token_A2', true) into ok;
  if not ok then raise exception 'FAIL: A could not complete its own eNACH set-up'; end if;
  if (select mandate_at from billing_accounts) is not null then raise exception 'FAIL: an eNACH mandate counted before the bank confirmed it'; end if;
end $$;
rollback;
do $$ begin
  if (select mandate_token_id from billing_accounts where tenant_id = '22222222-2222-2222-2222-222222222222') is not null then raise exception 'FAIL: B''s mandate was touched'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r,
               unnest(array['app_begin_mandate(text,text,text,bigint,uuid)', 'app_complete_mandate(text,text,boolean)', 'app_billing_due()', 'app_billing_begin_attempt(uuid,int)', 'app_billing_attempt_context(uuid)', 'app_billing_attempt_result(text,text,boolean,text,bigint,text)', 'app_store_billing_event(text,text,jsonb)', 'app_apply_billing_event(uuid)']) f
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
  -- TS1b: the MP4 asked for is recorded once (0103), and only a size Mux makes (0102).
  update videos set mp4 = '720p' where id = a;
  begin update videos set mp4 = '540p' where id = a; raise exception 'FAIL: a video''s MP4 changed'; exception when check_violation then null; end;
  insert into videos (tenant_id, mux_env, created_by) values ('11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999') returning id into a;
  begin update videos set mp4 = 'highest' where id = a; raise exception 'FAIL: an MP4 Mux doesn''t make was stored'; exception when check_violation then null; end;
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

-- 62. Signal S3 (0087): a product's pairings are the shop's own rows, and a pair can never name another shop's product
-- (composite FKs, not an id array); stories stay inside the products policy, with a size backstop.
insert into products (id, tenant_id, handle, title) values ('eeeeeeee-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'a-strap', 'A strap');
insert into products (id, tenant_id, handle, title) values ('eeeeeeee-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'b-strap', 'B strap');
insert into product_pairs (tenant_id, product_id, paired_id) values ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-0000000000b2');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from product_pairs) then raise exception 'FAIL: A sees B pairs'; end if;
  insert into product_pairs (tenant_id, product_id, paired_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000a2');
  begin insert into product_pairs (tenant_id, product_id, paired_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000b2');
    raise exception 'FAIL: A paired a B product'; exception when foreign_key_violation then null; end;
  begin insert into product_pairs (tenant_id, product_id, paired_id) values ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-0000000000b2');
    raise exception 'FAIL: A wrote a B pair'; exception when insufficient_privilege then null; end;
  begin insert into product_pairs (tenant_id, product_id, paired_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a');
    raise exception 'FAIL: a product paired with itself'; exception when check_violation then null; end;
  update products set stories = '[{"title":"x"}]' where id = 'eeeeeeee-0000-0000-0000-00000000000b';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A wrote B stories'; end if;
  begin update products set stories = (select jsonb_agg(jsonb_build_object('title', i)) from generate_series(1, 7) i) where id = 'eeeeeeee-0000-0000-0000-00000000000a';
    raise exception 'FAIL: seven stories stored'; exception when check_violation then null; end;
  begin update products set stories = '{}' where id = 'eeeeeeee-0000-0000-0000-00000000000a';
    raise exception 'FAIL: stories stored as an object'; exception when check_violation then null; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update', 'delete']) p where has_table_privilege(r, 'product_pairs', p))
  then raise exception 'FAIL: another role reads or writes pairs'; end if;
  -- (service_role keeps Supabase's defaults on the older tables — CLAUDE.md: the Data API stays off; the new table revokes it.)
  if exists (select 1 from unnest(array['anon', 'authenticated']) r where has_column_privilege(r, 'products', 'stories', 'select'))
  then raise exception 'FAIL: an API role reads stories'; end if;
  -- Deleting a paired product removes the pair (cascade), never leaves a dangling id.
  delete from products where id = 'eeeeeeee-0000-0000-0000-0000000000b2';
  if exists (select 1 from product_pairs where paired_id = 'eeeeeeee-0000-0000-0000-0000000000b2') then raise exception 'FAIL: a pair outlived its product'; end if;
end $$;

-- 63. EkCode (0088): no role reads the vault; every step needs a server-made flow handle and a fresh proof; a grant
-- redeems once, only at its own shop and host with the right challenge; a save token works once at its own shop; an
-- issue reply never says whether an account exists; the shop's customers, sessions and consents are its own; an order
-- cannot point at another shop's customer; staff get counts, never a name, phone or address.
begin; set local role frata_app;
do $$ declare v record; g record; ph text := 'p1:' || repeat('a', 64); ph2 text := 'p1:' || repeat('b', 64);
  ch text := 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; st text := repeat('s', 43);
begin
  begin perform 1 from ekcode_accounts; raise exception 'FAIL: the app reads EkCode accounts'; exception when insufficient_privilege then null; end;
  begin perform 1 from ekcode_codes; raise exception 'FAIL: the app reads EkCode codes'; exception when insufficient_privilege then null; end;
  begin insert into ekcode_flows (handle_digest, tenant_id, host, state, challenge, arm) values (repeat('9', 64), '11111111-1111-1111-1111-111111111111', 'x.test', st, ch, 'shown');
    raise exception 'FAIL: the app writes a flow directly'; exception when insufficient_privilege then null; end;
  if not app_ekcode_start_flow('11111111-1111-1111-1111-111111111111', 'proof-a.frata.test', repeat('a', 64), st, ch, 'shown') then raise exception 'FAIL: a flow did not start'; end if;
  perform app_ekcode_start_flow('22222222-2222-2222-2222-222222222222', 'proof-b.frata.test', repeat('b', 64), st, ch, 'shown');
  if (select shop_name from app_ekcode_flow_view(repeat('a', 64))) is distinct from 'Proof A' then raise exception 'FAIL: the flow showed another shop'; end if;
  -- A first code: ok, no proof of work; the same reply for a number with or without an account (no account yet here).
  select * into v from app_ekcode_issue_code(repeat('a', 64), array[ph], 'cdcdcdcd-0000-0000-0000-00000000000a', 'p1:' || repeat('c', 64), 'p1:' || repeat('1', 64), 'p1:' || repeat('2', 64), 0::smallint);
  if v.verdict <> 'ok' then raise exception 'FAIL: a first code was refused (%)', v.verdict; end if;
  -- Another flow's handle cannot try this code.
  if (select ok from app_ekcode_verify(repeat('b', 64), 'cdcdcdcd-0000-0000-0000-00000000000a', array['p1:' || repeat('c', 64)], repeat('e', 64))) then raise exception 'FAIL: another flow verified a code'; end if;
  select * into v from app_ekcode_verify(repeat('a', 64), 'cdcdcdcd-0000-0000-0000-00000000000a', array['p1:' || repeat('d', 64)], repeat('e', 64));
  if v.ok or v.tries_left <> 4 then raise exception 'FAIL: a wrong code verified or did not count'; end if;
  select * into v from app_ekcode_verify(repeat('a', 64), 'cdcdcdcd-0000-0000-0000-00000000000a', array['p1:' || repeat('c', 64)], repeat('e', 64));
  if not v.ok or v.has_account then raise exception 'FAIL: the right code did not verify'; end if;
  -- The proof works only with its own flow.
  if app_ekcode_create_account(repeat('b', 64), repeat('e', 64), 'abababab-0000-0000-0000-00000000000a', 'sealed-phone', 'sealed-name', 'ekcode-network@1') then raise exception 'FAIL: a proof used from another flow'; end if;
  if not app_ekcode_create_account(repeat('a', 64), repeat('e', 64), 'abababab-0000-0000-0000-00000000000a', 'sealed-phone', 'sealed-name', 'ekcode-network@1') then raise exception 'FAIL: the account was not made'; end if;
  if exists (select 1 from app_ekcode_grant(repeat('b', 64), repeat('e', 64), null, repeat('f', 64))) then raise exception 'FAIL: a grant from another flow'; end if;
  select * into g from app_ekcode_grant(repeat('a', 64), repeat('e', 64), null, repeat('f', 64));
  if g.host is distinct from 'proof-a.frata.test' or g.state is distinct from st then raise exception 'FAIL: the grant did not return to its own shop'; end if;
  if exists (select 1 from app_ekcode_grant(repeat('a', 64), repeat('e', 64), null, repeat('7', 64))) then raise exception 'FAIL: a proof made two grants'; end if;
  -- Redeem: only shop A, its host, the right challenge; once.
  if exists (select 1 from app_ekcode_redeem(repeat('f', 64), ch, '22222222-2222-2222-2222-222222222222', 'proof-a.frata.test', null)) then raise exception 'FAIL: another shop redeemed the grant'; end if;
  if exists (select 1 from app_ekcode_redeem(repeat('f', 64), ch, '11111111-1111-1111-1111-111111111111', 'evil.test', null)) then raise exception 'FAIL: another host redeemed the grant'; end if;
  if exists (select 1 from app_ekcode_redeem(repeat('f', 64), repeat('x', 43), '11111111-1111-1111-1111-111111111111', 'proof-a.frata.test', null)) then raise exception 'FAIL: a wrong verifier redeemed the grant'; end if;
  select * into v from app_ekcode_redeem(repeat('f', 64), ch, '11111111-1111-1111-1111-111111111111', 'proof-a.frata.test', repeat('5', 64));
  if v.pairwise is null or v.name_sealed <> 'sealed-name' or v.address_id is not null then raise exception 'FAIL: the right redeem failed'; end if;
  if exists (select 1 from app_ekcode_redeem(repeat('f', 64), ch, '11111111-1111-1111-1111-111111111111', 'proof-a.frata.test', null)) then raise exception 'FAIL: a grant redeemed twice'; end if;
  if app_ekcode_save_address(repeat('5', 64), '22222222-2222-2222-2222-222222222222', 'efefefef-0000-0000-0000-00000000000a', 'Home', 'sealed') then raise exception 'FAIL: another shop saved an address'; end if;
  if not app_ekcode_save_address(repeat('5', 64), '11111111-1111-1111-1111-111111111111', 'efefefef-0000-0000-0000-00000000000a', 'Home', 'sealed') then raise exception 'FAIL: the save did not work'; end if;
  if app_ekcode_save_address(repeat('5', 64), '11111111-1111-1111-1111-111111111111', 'efefefef-0000-0000-0000-00000000000b', 'Office', 'sealed') then raise exception 'FAIL: a save token worked twice'; end if;
end $$;
commit;
-- A second shopper's address can never ride on the first one's grant.
begin; set local role frata_app;
do $$ declare v record; g record; ph2 text := 'p1:' || repeat('b', 64); ch text := 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; st text := repeat('s', 43); begin
  perform app_ekcode_start_flow('11111111-1111-1111-1111-111111111111', 'proof-a.frata.test', repeat('c', 64), st, ch, 'shown');
  select * into v from app_ekcode_issue_code(repeat('c', 64), array[ph2], 'cdcdcdcd-0000-0000-0000-00000000000b', 'p1:' || repeat('c', 64), 'p1:' || repeat('3', 64), 'p1:' || repeat('4', 64), 0::smallint);
  select * into v from app_ekcode_verify(repeat('c', 64), 'cdcdcdcd-0000-0000-0000-00000000000b', array['p1:' || repeat('c', 64)], repeat('8', 64));
  perform app_ekcode_create_account(repeat('c', 64), repeat('8', 64), 'abababab-0000-0000-0000-00000000000b', 'p2', 'n2', 'ekcode-network@1');
  if exists (select 1 from app_ekcode_grant(repeat('c', 64), repeat('8', 64), 'efefefef-0000-0000-0000-00000000000a', repeat('6', 64))) then raise exception 'FAIL: a grant carried another shopper''s address'; end if;
end $$;
rollback;
-- A shop's own domain whose DNS check is stale (or another shop's) never starts a flow (security M6).
insert into shop_domains (tenant_id, host, apex, with_www, claimed_by, proved_at, added_at, dns_ok_at) values
  ('11111111-1111-1111-1111-111111111111', 'lapsed.proof-a.test', 'proof-a.test', false, '99999999-9999-9999-9999-999999999999', now() - interval '30 days', now() - interval '30 days', now() - interval '2 days');
begin; set local role frata_app;
do $$ begin
  if app_ekcode_start_flow('11111111-1111-1111-1111-111111111111', 'lapsed.proof-a.test', repeat('d', 64), repeat('s', 43), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'shown')
  then raise exception 'FAIL: a stale own domain started an EkCode flow'; end if;
end $$;
rollback;
delete from shop_domains where host = 'lapsed.proof-a.test';
-- The shop's own shoppers; an order cannot point at another shop's customer; staff read nothing of it.
insert into shop_customers (id, tenant_id, phone, name) values ('cececece-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', '9845012345', 'B shopper');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if exists (select 1 from shop_customers) or exists (select 1 from customer_sessions) or exists (select 1 from customer_consents) then raise exception 'FAIL: A sees B shoppers'; end if;
  begin insert into customer_sessions (tenant_id, customer_id, token_digest, expires_at) values ('11111111-1111-1111-1111-111111111111', 'cececece-0000-0000-0000-00000000000b', repeat('t', 64), now() + interval '1 day');
    raise exception 'FAIL: A opened a session for B''s shopper'; exception when foreign_key_violation then null; end;
  begin update orders set customer_id = 'cececece-0000-0000-0000-00000000000b' where tenant_id = '11111111-1111-1111-1111-111111111111';
    if found then raise exception 'FAIL: an order pointed at another shop''s customer'; end if; exception when foreign_key_violation then null; end;
end $$;
rollback;
do $$ declare v record; begin
  if exists (select 1 from unnest(array['frata_app', 'frata_admin', 'anon', 'authenticated', 'service_role']) r, pg_tables t
             where t.schemaname = 'public' and t.tablename like 'ekcode\_%' and (has_table_privilege(r, t.tablename, 'select') or has_table_privilege(r, t.tablename, 'insert')
               or has_table_privilege(r, t.tablename, 'update') or has_table_privilege(r, t.tablename, 'delete')))
  then raise exception 'FAIL: a role holds a privilege on an EkCode table'; end if;
  if exists (select 1 from unnest(array['frata_admin', 'anon', 'authenticated', 'service_role']) r, unnest(array['shop_customers', 'customer_sessions', 'customer_consents']) t where has_table_privilege(r, t, 'select'))
  then raise exception 'FAIL: another role reads a shop''s shoppers'; end if;
  -- Every EkCode definer: security definer, search_path pinned, never PUBLIC; app ones never to frata_admin, admin ones never to frata_app.
  for v in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'app\_ekcode\_%' or p.proname like 'app\_admin\_ekcode\_%') loop
    if not v.prosecdef or not ('search_path=""' = any(v.proconfig)) then raise exception 'FAIL: % is not a pinned definer', v.proname; end if;
    if has_function_privilege('public', v.oid, 'execute') or has_function_privilege('anon', v.oid, 'execute') or has_function_privilege('authenticated', v.oid, 'execute')
       or has_function_privilege('service_role', v.oid, 'execute')
    then raise exception 'FAIL: % runs for an API role', v.proname; end if;
    if v.proname like 'app\_admin\_%' and has_function_privilege('frata_app', v.oid, 'execute') then raise exception 'FAIL: the app runs %', v.proname; end if;
    if v.proname like 'app\_ekcode\_%' and has_function_privilege('frata_admin', v.oid, 'execute') then raise exception 'FAIL: staff run %', v.proname; end if;
  end loop;
  -- The internal helpers run for no role at all.
  for v in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ekcode\_%' loop
    if exists (select 1 from unnest(array['public', 'anon', 'authenticated', 'service_role', 'frata_app', 'frata_admin']) r where has_function_privilege(r, v.oid, 'execute'))
    then raise exception 'FAIL: the helper % runs for a role', v.proname; end if;
  end loop;
end $$;

-- 64. Product video PV·1 (0089/0090): a link is the shop's own row both ways; it names only the shop's own product
-- (composite FK) and its own video, a product's (trigger, before the FK and the policy: each case is caught by its own
-- code); its keys never change; videos.use is set at insert only; no other role holds anything on it.
insert into videos (id, tenant_id, mux_env, created_by, use) values
  ('dededede-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999', 'product'),
  ('dededede-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999', 'loop'),
  ('dededede-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'prod1', '99999999-9999-9999-9999-999999999999', 'product');
insert into product_videos (tenant_id, product_id, video_id) values ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-00000000000b', 'dededede-0000-0000-0000-0000000000b1');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from product_videos) then raise exception 'FAIL: A reads B product videos'; end if;
  update product_videos set button = 'none'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed a B product video'; end if;
  delete from product_videos; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A deleted a B product video'; end if;
  begin insert into product_videos (tenant_id, product_id, video_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000b', 'dededede-0000-0000-0000-0000000000a1'); raise exception 'FAIL: A linked its video to a B product';
  exception when foreign_key_violation then null; end;
  begin insert into product_videos (tenant_id, product_id, video_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'dededede-0000-0000-0000-0000000000b1'); raise exception 'FAIL: A linked a B video';
  exception when check_violation then null; end;
  begin insert into product_videos (tenant_id, product_id, video_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'dededede-0000-0000-0000-0000000000a2'); raise exception 'FAIL: a loop became a product video';
  exception when check_violation then null; end;
  insert into product_videos (tenant_id, product_id, video_id) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-00000000000a', 'dededede-0000-0000-0000-0000000000a1');
  update product_videos set button = 'wear', poster_ms = 6000; get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL: own cover frame and words not saved'; end if;
  begin update product_videos set video_id = 'dededede-0000-0000-0000-0000000000a2'; raise exception 'FAIL: a link changed its video'; exception when insufficient_privilege then null; end;
  begin update product_videos set product_id = 'eeeeeeee-0000-0000-0000-0000000000a2'; raise exception 'FAIL: a link changed its product'; exception when insufficient_privilege then null; end;
  begin update product_videos set tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: a link moved shop'; exception when insufficient_privilege then null; end;
  begin update videos set use = 'loop' where id = 'dededede-0000-0000-0000-0000000000a1'; raise exception 'FAIL: a video changed its use'; exception when insufficient_privilege then null; end;
  begin insert into videos (tenant_id, mux_env, created_by, use) values ('11111111-1111-1111-1111-111111111111', 'prod1', '99999999-9999-9999-9999-999999999999', 'reel'); raise exception 'FAIL: a video with an unknown use'; exception when check_violation then null; end;
end $$;
rollback;
do $$ begin
  if (select count(*) from pg_constraint where conrelid = 'product_videos'::regclass and contype = 'f' and conname in ('product_videos_product_fk', 'product_videos_video_fk')
      and array_length(conkey, 1) = 2) <> 2 then raise exception 'FAIL: a product video key is not shop-scoped'; end if;
  if not exists (select 1 from pg_policies where tablename = 'product_videos' and policyname = 'tenant_rows' and qual like '%app_current_tenant()%' and with_check like '%app_current_tenant()%')
  then raise exception 'FAIL: product_videos has no shop policy both ways'; end if;
  if not (select relrowsecurity from pg_class where oid = 'product_videos'::regclass) then raise exception 'FAIL: product_videos without RLS'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update']) p where has_any_column_privilege(r, 'product_videos', p))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_table_privilege(r, 'product_videos', 'delete'))
  then raise exception 'FAIL: another role reads or writes product videos'; end if;
  if has_column_privilege('frata_app', 'videos', 'use', 'update') then raise exception 'FAIL: the app may change a video''s use'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r where has_function_privilege(r, 'product_video_is_product()', 'execute'))
  then raise exception 'FAIL: an API role runs the product video trigger'; end if;
end $$;

-- 65. Admin › Infrastructure's Supabase tab (drizzle/0091): admin_db_health() is staff-only and aggregate-only. No API role
-- and not frata_app may run it; it returns only the fixed keys (no session's query, address or app name); query shapes
-- carry no literal (a planted one is absent).
do $$ begin
  if exists (select 1 from unnest(array['public', 'anon', 'authenticated', 'service_role', 'frata_app']) r
             where r <> 'public' and has_function_privilege(r, 'admin_db_health()', 'execute'))
  then raise exception 'FAIL: a non-staff role runs admin_db_health'; end if;
  if not has_function_privilege('frata_admin', 'admin_db_health()', 'execute') then raise exception 'FAIL: Admin cannot read database health'; end if;
end $$;
begin; set local role frata_admin;
do $$ declare h jsonb := admin_db_health(); k text; begin
  for k in select jsonb_object_keys(h) loop
    if k not in ('db_bytes', 'max_connections', 'cache_hit', 'connections', 'outbox_waiting', 'outbox_oldest_s', 'outbox_dead_today', 'webhooks_waiting', 'tables', 'queries')
    then raise exception 'FAIL: admin_db_health returns an unexpected key %', k; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(h->'connections') c where c ?| array['query', 'client_addr', 'application_name'])
  then raise exception 'FAIL: admin_db_health exposes a session''s query or address'; end if;
  if h::text like '%9845012345%' then raise exception 'FAIL: a literal reached admin_db_health'; end if;
end $$;
rollback;

-- 66. Admin › Infrastructure's platform tables (drizzle/0092–0093): what vendors billed Frrata. frata_app and the API
-- roles hold nothing (a shop's code path can never read or forge Frrata's costs); frata_admin reads and writes them.
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_app']) r, unnest(array['infra_usage_daily', 'infra_pulls']) t, unnest(array['select', 'insert', 'update', 'delete']) p
             where has_table_privilege(r, t, p)) then raise exception 'FAIL: a non-staff role reads or writes infra tables'; end if;
  if not (has_table_privilege('frata_admin', 'infra_usage_daily', 'insert') and has_table_privilege('frata_admin', 'infra_pulls', 'select'))
  then raise exception 'FAIL: Admin cannot keep vendor usage'; end if;
  if not (select relrowsecurity from pg_class where oid = 'infra_usage_daily'::regclass) or not (select relrowsecurity from pg_class where oid = 'infra_pulls'::regclass)
  then raise exception 'FAIL: infra tables without RLS'; end if;
end $$;
begin; set local role frata_app;
do $$ begin
  begin perform 1 from infra_usage_daily; raise exception 'FAIL: frata_app read vendor usage'; exception when insufficient_privilege then null; end;
  begin insert into infra_pulls (source, ok) values ('vercel', true); raise exception 'FAIL: frata_app forged a pull'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin; set local role frata_admin;
insert into infra_usage_daily (source, day, service, quantity, cost_micros) values ('vercel', '2026-11-01', 'Fluid Active CPU', 1, 140000);
do $$ begin if (select cost_micros from infra_usage_daily where source = 'vercel' and day = '2026-11-01') <> 140000 then raise exception 'FAIL: Admin cannot read back vendor usage'; end if; end $$;
rollback;

-- 67. Admin › Infrastructure's Mux tab (drizzle/0095): admin_video_usage() is staff-only; it returns no playback id,
-- upload id or URL (only whether the file arrived).
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_app']) r where has_function_privilege(r, 'admin_video_usage(timestamptz)', 'execute'))
  then raise exception 'FAIL: a non-staff role runs admin_video_usage'; end if;
  if not has_function_privilege('frata_admin', 'admin_video_usage(timestamptz)', 'execute') then raise exception 'FAIL: Admin cannot read video usage'; end if;
end $$;
begin; set local role frata_admin;
do $$ declare r jsonb; begin
  for r in select jsonb_array_elements(admin_video_usage(now() - interval '1 year')) loop
    if r ?| array['playback_id', 'upload_id', 'mux_env', 'created_by'] then raise exception 'FAIL: admin_video_usage returns a playback or upload id'; end if;
  end loop;
end $$;
rollback;

-- 68. Email E·0 (0096): every email table is the shop's own both ways; notices and the roll-up are written by definers
-- only; an SES event is routed only by our message id (an unknown id, or a mismatched shop tag, stores nothing); a
-- member's address is readable only for a current member of the shop that is set; the outbox shows no row without a
-- shop set (the drain claims through a definer); no other role holds anything.
insert into email_messages (id, tenant_id, kind, order_id, attempted_at) values ('e1e1e1e1-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'confirmed', 'acacacac-0000-0000-0000-00000000000b', now());
insert into email_suppressions (tenant_id, address_hash, reason) values ('22222222-2222-2222-2222-222222222222', 'e1:' || repeat('b', 64), 'bounce');
insert into shop_emails (tenant_id, kind, subject) values ('22222222-2222-2222-2222-222222222222', 'confirmed', 'B words');
insert into email_shops (tenant_id) values ('22222222-2222-2222-2222-222222222222');
insert into email_daily (day, tenant_id, sent) values (current_date, '22222222-2222-2222-2222-222222222222', 5);
insert into notices (id, tenant_id, type, source_kind, title, required) values ('e2e2e2e2-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'billing', 'admin', 'B notice', true);
insert into notice_reads (tenant_id, notice_id, user_id) values ('22222222-2222-2222-2222-222222222222', 'e2e2e2e2-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into notice_prefs (tenant_id, user_id, type, email) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'product_update', false);
insert into outbox (tenant_id, kind, dedupe_key, payload) values ('22222222-2222-2222-2222-222222222222', 'email.order', 'proof-68', '{}');
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from email_messages) or exists (select 1 from email_suppressions) or exists (select 1 from shop_emails) or exists (select 1 from email_shops)
     or exists (select 1 from email_daily) or exists (select 1 from notices) or exists (select 1 from notice_reads) or exists (select 1 from notice_prefs)
  then raise exception 'FAIL: A reads B email rows'; end if;
  update email_messages set skipped_at = now(); get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed a B message'; end if;
  update shop_emails set subject = 'x'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B words'; end if;
  begin insert into email_messages (id, tenant_id, kind) values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'test'); raise exception 'FAIL: A wrote a B message'; exception when insufficient_privilege then null; end;
  begin insert into email_suppressions (tenant_id, address_hash, reason) values ('22222222-2222-2222-2222-222222222222', 'e1:' || repeat('c', 64), 'bounce'); raise exception 'FAIL: A suppressed for B'; exception when insufficient_privilege then null; end;
  begin insert into notices (tenant_id, type, source_kind, title, required) values ('11111111-1111-1111-1111-111111111111', 'billing', 'admin', 'Forged', true); raise exception 'FAIL: a shop wrote a notice'; exception when insufficient_privilege then null; end;
  begin insert into email_daily (day, tenant_id) values (current_date, '11111111-1111-1111-1111-111111111111'); raise exception 'FAIL: a shop wrote the roll-up'; exception when insufficient_privilege then null; end;
  begin insert into notice_reads (tenant_id, notice_id, user_id) values ('22222222-2222-2222-2222-222222222222', 'e2e2e2e2-0000-0000-0000-00000000000b', gen_random_uuid()); raise exception 'FAIL: A read-marked a B notice'; exception when insufficient_privilege then null; end;
  if exists (select 1 from outbox where dedupe_key = 'proof-68') then raise exception 'FAIL: A reads B outbox'; end if;
  -- An SES event for B's message, tagged as A's: stored nowhere. An unknown id: nothing. B's own tag: applied.
  if public.app_store_ses_event('sns-1', 'e1e1e1e1-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'Delivery', 'p1', null, null, now()) then raise exception 'FAIL: a mismatched shop tag routed an event'; end if;
  if public.app_store_ses_event('sns-2', gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Delivery', 'p1', null, null, now()) then raise exception 'FAIL: an unknown message id stored an event'; end if;
  if not public.app_store_ses_event('sns-3', 'e1e1e1e1-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Bounce', 'p1', 'permanent', 'e1:' || repeat('d', 64), now()) then raise exception 'FAIL: a matching event was refused'; end if;
  -- A member of another shop: no address.
  if public.app_member_email('aaaaaaaa-0000-0000-0000-000000000001', false) is not null then raise exception 'FAIL: A read a B member''s address'; end if;
  if exists (select 1 from public.app_notice_members() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'FAIL: A lists a B member'; end if;
end $$;
rollback;
-- No shop set: the outbox shows nothing; the claim definer still finds due rows (and settles them).
begin; set local role frata_app;
do $$ declare r record; begin
  if exists (select 1 from outbox) then raise exception 'FAIL: the outbox is readable with no shop set'; end if;
  select * into r from public.app_outbox_claim(100) where dedupe_key = 'proof-68';
  if r.id is null then raise exception 'FAIL: the claim definer found nothing'; end if;
  perform public.app_outbox_settle(r.id, 'later', 'test', 5, 8);
  if (select attempts from outbox where id = r.id) <> 0 then raise exception 'FAIL: later spent an attempt'; end if;
end $$;
rollback;
-- Every settle outcome (billing debits go through these): sent; failed (dead only at the last attempt); dead.
do $$ declare a uuid; b uuid; c uuid; d uuid; begin
  insert into outbox (tenant_id, kind, dedupe_key, payload, attempts) values ('22222222-2222-2222-2222-222222222222', 'x', 'settle-a', '{}', 1) returning id into a;
  insert into outbox (tenant_id, kind, dedupe_key, payload, attempts) values ('22222222-2222-2222-2222-222222222222', 'x', 'settle-b', '{}', 7) returning id into b;
  insert into outbox (tenant_id, kind, dedupe_key, payload, attempts) values ('22222222-2222-2222-2222-222222222222', 'x', 'settle-c', '{}', 8) returning id into c;
  insert into outbox (tenant_id, kind, dedupe_key, payload, attempts) values ('22222222-2222-2222-2222-222222222222', 'x', 'settle-d', '{}', 1) returning id into d;
  perform public.app_outbox_settle(a, 'sent', null, 0, 8);
  perform public.app_outbox_settle(b, 'failed', 'e', 0, 8);
  perform public.app_outbox_settle(c, 'failed', 'e', 0, 8);
  perform public.app_outbox_settle(d, 'dead', 'off', 0, 8);
  if (select sent_at is null from outbox where id = a) then raise exception 'FAIL: sent not marked'; end if;
  if (select dead_at is not null from outbox where id = b) then raise exception 'FAIL: dead before the last attempt'; end if;
  if (select dead_at is null from outbox where id = c) then raise exception 'FAIL: not dead at the last attempt'; end if;
  if (select dead_at is null or last_error <> 'off' from outbox where id = d) then raise exception 'FAIL: dead not marked'; end if;
  begin perform public.app_outbox_settle(a, 'nonsense', null, 0, 8); raise exception 'FAIL: an unknown outcome'; exception when invalid_parameter_value then null; end;
  delete from outbox where dedupe_key like 'settle-%';
end $$;
do $$ begin
  if exists (select 1 from unnest(array['email_messages','email_suppressions','shop_emails','email_shops','email_daily','notices','notice_reads','notice_prefs']) t
              where not (select relrowsecurity from pg_class where oid = t::regclass)
                 or not exists (select 1 from pg_policies p where p.tablename = t and p.qual like '%app_current_tenant()%'))
  then raise exception 'FAIL: an email table without RLS or a shop policy'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r,
                    unnest(array['email_messages','email_suppressions','shop_emails','email_shops','email_daily','notices','notice_reads','notice_prefs']) t,
                    unnest(array['select', 'insert', 'update']) p where has_any_column_privilege(r, t, p))
  then raise exception 'FAIL: another role reads or writes an email table'; end if;
  if exists (select 1 from unnest(array['email_messages','email_suppressions','shop_emails','email_shops','email_daily','notices','notice_reads','notice_prefs']) t
              where has_table_privilege('frata_app', t, 'delete'))
  then raise exception 'FAIL: the app deletes email rows'; end if;
  if has_table_privilege('frata_app', 'notices', 'insert') or has_table_privilege('frata_app', 'email_daily', 'insert') then raise exception 'FAIL: the app writes notices or the roll-up'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r,
                    unnest(array['app_outbox_claim(int)', 'app_outbox_settle(uuid, text, text, int, int)', 'app_store_ses_event(text, uuid, uuid, text, text, text, text, timestamptz)',
                                 'app_member_email(uuid, boolean)', 'app_notice_members(uuid)', 'app_email_daily()', 'app_admin_email_health(uuid, int)', 'app_admin_email_queue(uuid)']) f
              where has_function_privilege(r, f, 'execute'))
  then raise exception 'FAIL: an API role runs an email definer'; end if;
  if has_function_privilege('frata_app', 'app_admin_email_health(uuid, int)', 'execute') then raise exception 'FAIL: the app reads every shop''s email health'; end if;
end $$;

-- 69. Email E·1 notices (0097): only definers write a notice and its outbox row; a shop can't run them; Admin's fan-out
-- needs an admin (a support staffer is refused); a support notice comes only from the caller's own open visit.
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_app', 'frata_admin']) r
              where has_function_privilege(r, 'notice_write(uuid, text, text, uuid, text, text, text, boolean, boolean, uuid, uuid)', 'execute'))
  then raise exception 'FAIL: a role writes notices directly'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_app']) r,
                    unnest(array['app_support_notice(uuid, uuid)', 'app_admin_notice_fanout(uuid, text, text, uuid, text, text, text, text, boolean, boolean)', 'app_admin_notice_batches(uuid)']) f
              where has_function_privilege(r, f, 'execute'))
  then raise exception 'FAIL: a shop runs an Admin notice definer'; end if;
end $$;
begin; set local role frata_admin;
do $$ begin
  begin perform public.app_admin_notice_fanout('aaaaaaaa-0000-0000-0000-000000000001', 'all', null, null, 'product_update', 'Hello shops', null, null, false, false);
    raise exception 'FAIL: a support staffer sent to every shop'; exception when sqlstate 'P0001' then null; end;
  begin perform public.app_support_notice(gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FAIL: a support notice without its visit'; exception when sqlstate 'P0001' then null; end;
end $$;
rollback;

-- 70. Shop pages (Theme Studio TS1a, 0099–0100; tenancy-auditor 2026-11-11): own shop only; no delete or edit across
-- shops; tenant, id and template never change; at most 20 pages and
-- one FAQ a shop (B's don't count against A); no API role or frata_admin reaches the table.
begin; set local role frata_app;
do $$ declare n int; pa uuid; pb uuid; i int; begin
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  insert into shop_pages (tenant_id, template, draft) values ('22222222-2222-2222-2222-222222222222', 'faq', '{"handle":"faq","title":"FAQ","fill":{}}') returning id into pb;
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if exists (select 1 from shop_pages where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: A sees B''s pages'; end if;
  begin insert into shop_pages (tenant_id, template, draft) values ('22222222-2222-2222-2222-222222222222', 'about', '{"handle":"x","title":"x","fill":{}}'); raise exception 'FAIL: A wrote a page for B';
  exception when insufficient_privilege then null; end;
  update shop_pages set draft = '{"handle":"faq","title":"Mine","fill":{}}' where id = pb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A edited B''s page'; end if;
  update shop_pages set removed_at = now() where id = pb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A removed B''s page'; end if;
  delete from shop_pages where id = pb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s page'; end if;
  -- A's own FAQ, with B's handle: allowed (handles are per shop); a second FAQ in A is refused; B's doesn't count.
  insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'faq', '{"handle":"faq","title":"FAQ","fill":{}}') returning id into pa;
  begin insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'faq', '{"handle":"faq-2","title":"FAQ","fill":{}}'); raise exception 'FAIL: two FAQs in one shop';
  exception when unique_violation then null; end;
  begin insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'about', '{"handle":"faq","title":"x","fill":{}}'); raise exception 'FAIL: two pages at one address';
  exception when unique_violation then null; end;
  begin insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'about', '{"handle":"Bad Handle","title":"x","fill":{}}'); raise exception 'FAIL: a bad address';
  exception when check_violation then null; end;
  begin insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'contact', '{"handle":"c","title":"x","fill":{}}'); raise exception 'FAIL: a contact page row';
  exception when check_violation then null; end;
  begin update shop_pages set tenant_id = '22222222-2222-2222-2222-222222222222' where id = pa; raise exception 'FAIL: A moved a page to B';
  exception when insufficient_privilege then null; end;
  begin update shop_pages set template = 'about' where id = pa; raise exception 'FAIL: a page changed its template';
  exception when insufficient_privilege then null; end;
  -- a live page can't be deleted outside Publish (the delete policy); once removed at a publish, it can
  update shop_pages set live = draft where id = pa;
  delete from shop_pages where id = pa; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a live page was deleted outside Publish'; end if;
  update shop_pages set live = null where id = pa;
  -- at most 20 pages (A has 1; 19 more fit, the 21st is refused)
  for i in 1..19 loop
    insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'about', jsonb_build_object('handle', 'p' || i, 'title', 'P', 'fill', '{}'::jsonb));
  end loop;
  begin insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'about', '{"handle":"p20","title":"P","fill":{}}'); raise exception 'FAIL: a 21st page';
  exception when check_violation then null; end;
end $$;
rollback;
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from shop_pages) then raise exception 'FAIL: shop pages seen with no shop set'; end if;
  begin insert into shop_pages (tenant_id, template, draft) values ('11111111-1111-1111-1111-111111111111', 'about', '{"handle":"x","title":"x","fill":{}}'); raise exception 'FAIL: a page with no shop set';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update']) p
              where has_any_column_privilege(r, 'shop_pages', p))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_table_privilege(r, 'shop_pages', 'delete'))
  then raise exception 'FAIL: another role reaches shop_pages'; end if;
  if not (select relrowsecurity from pg_class where oid = 'shop_pages'::regclass) then raise exception 'FAIL: shop_pages without RLS'; end if;
  if exists (select 1 from pg_policies where tablename = 'shop_pages' and coalesce(qual, '') not like '%app_current_tenant()%' and coalesce(with_check, '') not like '%app_current_tenant()%')
  then raise exception 'FAIL: a shop_pages policy that doesn''t name the shop'; end if;
  if has_column_privilege('frata_app', 'shop_pages', 'tenant_id', 'update') or has_column_privilege('frata_app', 'shop_pages', 'template', 'update')
     or has_column_privilege('frata_app', 'shop_pages', 'id', 'update') then raise exception 'FAIL: the app changes a page''s shop, id or template'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r where has_function_privilege(r, 'app_shop_pages_cap()', 'execute'))
  then raise exception 'FAIL: an API role runs the pages cap'; end if;
end $$;

-- 71. "Tell me when it's ready" (Apps gallery A1, 0104; tenancy-auditor 2026-11-11): own shop both ways, no update, no
-- other role holds anything; Admin's count is a staff-only definer that frata_app can't run.
insert into app_interest (tenant_id, module, user_id) values ('22222222-2222-2222-2222-222222222222', 'reviews', 'aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  if exists (select 1 from pg_tables where tablename = 'app_interest' and not rowsecurity) then raise exception 'FAIL: app_interest without RLS'; end if;
  if not exists (select 1 from pg_policies where tablename = 'app_interest' and policyname = 'tenant_rows') then raise exception 'FAIL: app_interest without its policy'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r(role)
             where has_table_privilege(r.role, 'app_interest', 'select') or has_table_privilege(r.role, 'app_interest', 'insert') or has_table_privilege(r.role, 'app_interest', 'update'))
  then raise exception 'FAIL: another role holds app_interest'; end if;
  if has_table_privilege('frata_app', 'app_interest', 'update') then raise exception 'FAIL: frata_app may update app_interest'; end if;
  if has_function_privilege('frata_app', 'app_admin_interest(uuid)', 'execute') or has_function_privilege('anon', 'app_admin_interest(uuid)', 'execute')
     or has_function_privilege('authenticated', 'app_admin_interest(uuid)', 'execute') or has_function_privilege('service_role', 'app_admin_interest(uuid)', 'execute')
  then raise exception 'FAIL: app_admin_interest is callable outside Admin'; end if;
  if not has_function_privilege('frata_admin', 'app_admin_interest(uuid)', 'execute') then raise exception 'FAIL: Admin cannot count interest'; end if;
end $$;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from app_interest) then raise exception 'FAIL: A reads B interest'; end if;
  delete from app_interest; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A deleted B interest'; end if;
  begin insert into app_interest (tenant_id, module, user_id) values ('22222222-2222-2222-2222-222222222222', 'ship', gen_random_uuid()); raise exception 'FAIL: A wrote B interest'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin; set local role frata_admin;
do $$ begin
  begin perform * from public.app_admin_interest(gen_random_uuid()); raise exception 'FAIL: a non-staff uid read interest'; exception when sqlstate 'P0001' then null; end;
end $$;
rollback;

-- 72. Delivery Zones (0112–0113): four tables, own shop both ways, no other role; a PIN code row can never name another
-- shop's zone (the key holds the shop, since a foreign key check skips row policies).
insert into delivery_zones (id, tenant_id, position, name, preset, charge, days_min, days_max, cod_on)
  values ('d2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 0, 'B metro', 'metro', 5900, 2, 3, true);
insert into delivery_zone_pins (tenant_id, pin, zone_id) values ('22222222-2222-2222-2222-222222222222', '302', 'd2000000-0000-0000-0000-000000000002');
insert into delivery_rules (tenant_id, pincode, rule) values ('22222222-2222-2222-2222-222222222222', '110094', 'prepaid_only');
insert into shop_holidays (tenant_id, day, name) values ('22222222-2222-2222-2222-222222222222', '2026-12-25', 'Christmas');
do $$ declare t text; begin
  foreach t in array array['delivery_zones', 'delivery_zone_pins', 'delivery_rules', 'shop_holidays'] loop
    if exists (select 1 from pg_tables where tablename = t and not rowsecurity) then raise exception 'FAIL: % without RLS', t; end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'tenant_rows') then raise exception 'FAIL: % without its policy', t; end if;
    if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r(role)
               where has_table_privilege(r.role, t, 'select') or has_table_privilege(r.role, t, 'insert') or has_table_privilege(r.role, t, 'update') or has_table_privilege(r.role, t, 'delete'))
    then raise exception 'FAIL: another role holds %', t; end if;
  end loop;
end $$;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from delivery_zones) or exists (select 1 from delivery_zone_pins) or exists (select 1 from delivery_rules) or exists (select 1 from shop_holidays)
  then raise exception 'FAIL: A reads B delivery'; end if;
  update delivery_zones set charge = 0; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B zones'; end if;
  delete from delivery_rules; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A deleted B rules'; end if;
  begin insert into delivery_rules (tenant_id, pincode, rule) values ('22222222-2222-2222-2222-222222222222', '400070', 'no_delivery'); raise exception 'FAIL: A wrote B rules'; exception when insufficient_privilege then null; end;
  delete from delivery_zone_pins; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A deleted B pins'; end if;
  update shop_holidays set name = 'x'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B holidays'; end if;
  -- A's own row moved to B: refused by the policy's check.
  insert into delivery_rules (tenant_id, pincode, rule) values ('11111111-1111-1111-1111-111111111111', '560001', 'prepaid_only');
  begin update delivery_rules set tenant_id = '22222222-2222-2222-2222-222222222222' where pincode = '560001'; raise exception 'FAIL: A moved a rule to B'; exception when insufficient_privilege then null; end;
  insert into shop_holidays (tenant_id, day, name) values ('11111111-1111-1111-1111-111111111111', '2026-12-31', 'NYE');
  begin update shop_holidays set tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: A moved a holiday to B'; exception when insufficient_privilege then null; end;
  -- A's own pin row naming B's zone: refused by the key, not only the policy.
  begin insert into delivery_zone_pins (tenant_id, pin, zone_id) values ('11111111-1111-1111-1111-111111111111', '110', 'd2000000-0000-0000-0000-000000000002'); raise exception 'FAIL: A pointed at B zone'; exception when foreign_key_violation then null; end;
end $$;
rollback;

-- 73. A3 self-serve add-on trials (0112, 0114–0115): the shop's only writes to tenant_addons are three definers; the shop is
-- the session's, the caller its owner or admin, the price the newest and the one shown; one trial per shop and add-on.
do $$ begin
  if has_function_privilege('frata_admin', 'app_start_addon_trial(uuid, text, uuid)', 'execute') or has_function_privilege('authenticated', 'app_start_addon_trial(uuid, text, uuid)', 'execute')
     or has_function_privilege('anon', 'app_end_addon_trial(uuid, text)', 'execute') or has_function_privilege('service_role', 'app_stop_addon(uuid, text)', 'execute')
     or has_function_privilege('frata_admin', 'app_addon_trial_notices()', 'execute') or has_function_privilege('authenticated', 'app_addon_trial_notices()', 'execute')
  then raise exception 'FAIL: another role runs the trial definers'; end if;
  if has_table_privilege('frata_app', 'tenant_addons', 'insert') or has_table_privilege('frata_app', 'tenant_addons', 'update') then raise exception 'FAIL: frata_app writes add-ons'; end if;
end $$;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare p uuid; e timestamptz; n int; begin
  select id into p from addon_prices where module = 'delivery_zones' order by version desc limit 1;
  -- Not the shop's owner or admin (B's staff member), a stale price, no shop at all: refused.
  begin perform app_start_addon_trial('aaaaaaaa-0000-0000-0000-000000000001', 'delivery_zones', p); raise exception 'FAIL: a stranger started a trial'; exception when sqlstate 'P0001' then null; end;
  begin perform app_start_addon_trial('99999999-9999-9999-9999-999999999999', 'delivery_zones', gen_random_uuid()); raise exception 'FAIL: a price never shown'; exception when sqlstate 'P0001' then null; end;
  e := app_start_addon_trial('99999999-9999-9999-9999-999999999999', 'delivery_zones', p);
  if e < now() + interval '13 days' or e > now() + interval '15 days' then raise exception 'FAIL: trial length %', e - now(); end if;
  select count(*) into n from tenant_addons where module = 'delivery_zones' and by_shop and tenant_id = '11111111-1111-1111-1111-111111111111';
  if n <> 2 then raise exception 'FAIL: a trial writes its trial and its paid row, got %', n; end if;
  if (select starts_at from tenant_addons where addon_price_id = p and by_shop) <> e then raise exception 'FAIL: the paid row starts when the trial ends'; end if;
  -- A second trial: refused, now and after ending it.
  begin perform app_start_addon_trial('99999999-9999-9999-9999-999999999999', 'delivery_zones', p); raise exception 'FAIL: two trials'; exception when sqlstate 'P0001' then null; end;
  if not app_end_addon_trial('99999999-9999-9999-9999-999999999999', 'delivery_zones') then raise exception 'FAIL: End trial'; end if;
  if exists (select 1 from tenant_addons where module = 'delivery_zones' and (ends_at is null or ends_at > starts_at)) then raise exception 'FAIL: End trial left a row live'; end if;
  begin perform app_start_addon_trial('99999999-9999-9999-9999-999999999999', 'delivery_zones', p); raise exception 'FAIL: a trial after a trial'; exception when sqlstate 'P0001' then null; end;
  -- Another shop's rows: never touched (B's Admin trial of reviews stays open).
  perform app_end_addon_trial('99999999-9999-9999-9999-999999999999', 'reviews');
  perform app_stop_addon('99999999-9999-9999-9999-999999999999', 'reviews');
end $$;
rollback;
do $$ begin
  if not exists (select 1 from tenant_addons where tenant_id = '22222222-2222-2222-2222-222222222222' and module = 'reviews' and reason = 'proof') then raise exception 'FAIL: B add-on changed'; end if;
end $$;
-- Stop on a paid add-on (Turn off, security review DZ7 H1): it works to the month's end (IST) and is never billed after.
insert into tenant_addons (tenant_id, module, addon_price_id, starts_at, created_by, reason)
  select '11111111-1111-1111-1111-111111111111', 'delivery_zones', id, now() - interval '40 days', '99999999-9999-9999-9999-999999999999', 'proof stop' from addon_prices where module = 'delivery_zones' limit 1;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare e timestamptz; begin
  e := app_stop_addon('99999999-9999-9999-9999-999999999999', 'delivery_zones');
  if e is null or e <> ((date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata') then raise exception 'FAIL: Stop ends at the month end, got %', e; end if;
  if (select ends_at from tenant_addons where reason = 'proof stop') <> e then raise exception 'FAIL: Stop did not end the paid row'; end if;
end $$;
rollback;
delete from tenant_addons where reason = 'proof stop';
-- A paid row whose price is another add-on's: refused by the key.
do $$ begin
  insert into tenant_addons (tenant_id, module, addon_price_id, created_by) select '22222222-2222-2222-2222-222222222222', 'reviews', id, 'aaaaaaaa-0000-0000-0000-000000000001' from addon_prices where module = 'delivery_zones' limit 1;
  raise exception 'FAIL: a price of another add-on';
exception when foreign_key_violation then null; end $$;

-- 74. Order edits (OE·1, 0117–0118): an edit's record is the shop's own, appended and never changed or removed; a line is
-- taken out (removed_at, replaced_by) and an offer taken off (removed_at), never rewritten: frata_app's update columns
-- on both are exactly these and the money writeReprice sets; no edit, line or replacement points into another shop; one
-- live use of an offer per order; no other role holds any of it.
insert into orders (id, tenant_id, number, payment_method, subtotal, total, placed_at) values
  ('ed0d0000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 9072, 'cod', 100000, 100000, now());
insert into order_lines (id, tenant_id, order_id, title, qty, unit_price, taxable_value) values
  ('ed11ed11-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'A kurta', 1, 100000, 95238),
  ('ed11ed11-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'A kurta L', 1, 100000, 95238),
  ('ed11ed11-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'B kurta', 1, 100000, 95238);
insert into order_events (id, tenant_id, order_id, kind, actor_kind) values
  ('ed1e0e00-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'items_edited', 'system'),
  ('ed1e0e00-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'items_edited', 'system');
insert into order_edits (id, tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify) values
  ('ed170000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'ed1e0e00-0000-0000-0000-00000000000b', 100000, 90000, 0, 0, false);
insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount) values
  ('22222222-2222-2222-2222-222222222222', 'ed170000-0000-0000-0000-00000000000b', 'before', 'ed11ed11-0000-0000-0000-00000000000b', 1, 100000, 0, 0);
insert into order_discounts (id, tenant_id, order_id, discount_id, class, amount, title, style, percent_bps, min_subtotal) values
  ('0d0d0d0d-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'd15c0000-0000-0000-0000-00000000000a', 'order', 5000, 'A sale', 'order_off', 500, 0);
do $$ declare got text; begin
  if exists (select 1 from pg_tables where tablename in ('order_edits', 'order_edit_lines') and not rowsecurity) then raise exception 'FAIL: an order edit table without RLS'; end if;
  if (select count(*) from pg_policies where tablename in ('order_edits', 'order_edit_lines') and policyname = 'tenant_rows' and qual like '%app_current_tenant()%' and with_check like '%app_current_tenant()%') <> 2
  then raise exception 'FAIL: an order edit table without its tenant policy'; end if;
  if exists (select 1 from unnest(array['order_edits', 'order_edit_lines']) t, unnest(array['update', 'delete', 'truncate', 'references', 'trigger']) p where has_table_privilege('frata_app', t, p))
     or exists (select 1 from unnest(array['order_edits', 'order_edit_lines']) t, unnest(array['select', 'insert']) p where not has_table_privilege('frata_app', t, p))
  then raise exception 'FAIL: frata_app holds other than select and insert on an order edit'; end if;
  -- (OE·2, 0121: the exact columns a paid order's edit settles later are check 76's.)
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['order_edits', 'order_edit_lines']) t,
             unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p where has_table_privilege(r, t, p) or has_any_column_privilege(r, t, 'select'))
  then raise exception 'FAIL: another role reaches order edits'; end if;
  -- The exact columns frata_app may update on a sold line and on a kept offer: nothing it may rewrite as sold.
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges
   where grantee = 'frata_app' and table_name = 'order_lines' and privilege_type = 'UPDATE';
  if got is distinct from 'charge_gst,charge_taxable,gst,gst_bps,line_discount,product_discount,removed_at,replaced_by,stock_taken_at,taxable_value'
  then raise exception 'FAIL: frata_app updates order_lines columns %', got; end if;
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges
   where grantee = 'frata_app' and table_name = 'order_discounts' and privilege_type = 'UPDATE';
  if got is distinct from 'removed_at' then raise exception 'FAIL: frata_app updates order_discounts columns %', got; end if;
  -- service_role still holds order_lines from 0017 (which revoked anon and authenticated only): reported 2026-11-12, not
  -- widened here; every other role holds no update on either.
  if exists (select 1 from unnest(array['anon', 'authenticated', 'frata_admin']) r where has_any_column_privilege(r, 'order_lines', 'update'))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_any_column_privilege(r, 'order_discounts', 'update'))
  then raise exception 'FAIL: another role updates order lines or offers'; end if;
  if has_function_privilege('frata_app', 'app_admin_offer_totals(timestamptz)', 'execute') then raise exception 'FAIL: frata_app runs the admin offer totals'; end if;
  -- Readers by product read live lines: the partial index says so, and the old one is gone.
  if not exists (select 1 from pg_indexes where indexname = 'order_lines_product_live' and indexdef like '%removed_at IS NULL%') or exists (select 1 from pg_indexes where indexname = 'order_lines_product')
  then raise exception 'FAIL: order_lines by product is not indexed on live lines only'; end if;
end $$;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; e uuid; begin
  if exists (select 1 from order_edits) or exists (select 1 from order_edit_lines) then raise exception 'FAIL: A reads B order edits'; end if;
  -- A's own edit, on A's order and A's event, with A's lines.
  insert into order_edits (tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify, offers_removed)
    values ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'ed1e0e00-0000-0000-0000-00000000000a', 100000, 95000, 0, 0, true, '{0d0d0d0d-0000-0000-0000-00000000000a}') returning id into e;
  insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount, reason)
    values ('11111111-1111-1111-1111-111111111111', e, 'before', 'ed11ed11-0000-0000-0000-00000000000a', 1, 100000, 0, 0, 'customer_asked');
  -- Never into B: B's order, B's event (on A's order), under B's tenant, B's edit, B's line.
  begin insert into order_edits (tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify)
    values ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000b', 'ed1e0e00-0000-0000-0000-00000000000b', 1, 1, 0, 0, false); raise exception 'FAIL: A edited B''s order';
  exception when foreign_key_violation then null; end;
  begin insert into order_edits (tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify)
    values ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'ed1e0e00-0000-0000-0000-00000000000b', 1, 1, 0, 0, false); raise exception 'FAIL: A''s edit names B''s event';
  exception when foreign_key_violation then null; end;
  begin insert into order_edits (tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify)
    values ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'ed1e0e00-0000-0000-0000-00000000000b', 1, 1, 0, 0, false); raise exception 'FAIL: A wrote an edit under B';
  exception when insufficient_privilege then null; end;
  begin insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount)
    values ('11111111-1111-1111-1111-111111111111', 'ed170000-0000-0000-0000-00000000000b', 'after', 'ed11ed11-0000-0000-0000-00000000000a', 1, 1, 0, 0); raise exception 'FAIL: A added a line to B''s edit';
  exception when foreign_key_violation then null; end;
  begin insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount)
    values ('11111111-1111-1111-1111-111111111111', e, 'after', 'ed11ed11-0000-0000-0000-00000000000b', 1, 1, 0, 0); raise exception 'FAIL: A''s edit names B''s line';
  exception when foreign_key_violation then null; end;
  begin insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount, replaces)
    values ('11111111-1111-1111-1111-111111111111', e, 'after', 'ed11ed11-0000-0000-0000-0000000000a2', 1, 1, 0, 0, 'ed11ed11-0000-0000-0000-00000000000b'); raise exception 'FAIL: A''s line replaces B''s';
  exception when foreign_key_violation then null; end;
  begin insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, variant_id, qty, unit_price, product_discount, line_discount)
    values ('11111111-1111-1111-1111-111111111111', e, 'after', 'ed11ed11-0000-0000-0000-0000000000a2', 'cdcdcdcd-0000-0000-0000-00000000000b', 1, 1, 0, 0); raise exception 'FAIL: A''s edit names B''s variant';
  exception when foreign_key_violation then null; end;
  -- A line holding stock never comes out (its pieces go back first).
  begin update order_lines set stock_taken_at = now(), removed_at = now() where id = 'ed11ed11-0000-0000-0000-0000000000a2'; raise exception 'FAIL: a removed line kept its stock';
  exception when check_violation then null; end;
  begin update order_edits set total_after = 1; raise exception 'FAIL: an edit was changed'; exception when insufficient_privilege then null; end;
  begin delete from order_edit_lines; raise exception 'FAIL: an edit''s lines were deleted'; exception when insufficient_privilege then null; end;
  -- A line is taken out and replaced within its own shop only, and never rewritten as sold.
  update order_lines set removed_at = now(), replaced_by = 'ed11ed11-0000-0000-0000-0000000000a2' where id = 'ed11ed11-0000-0000-0000-00000000000a'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not take out its own line'; end if;
  begin update order_lines set replaced_by = 'ed11ed11-0000-0000-0000-00000000000b' where id = 'ed11ed11-0000-0000-0000-00000000000a'; raise exception 'FAIL: A''s line replaced by B''s';
  exception when foreign_key_violation then null; end;
  begin update order_lines set removed_at = now(), replaced_by = 'ed11ed11-0000-0000-0000-0000000000a2' where id = 'ed11ed11-0000-0000-0000-0000000000a2'; raise exception 'FAIL: a line replaced by itself';
  exception when check_violation then null; end;
  begin update order_lines set replaced_by = 'ed11ed11-0000-0000-0000-00000000000a' where id = 'ed11ed11-0000-0000-0000-0000000000a2'; raise exception 'FAIL: a live line names a replacement';
  exception when check_violation then null; end;
  update order_lines set removed_at = now() where id = 'ed11ed11-0000-0000-0000-00000000000b'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A took out B''s line'; end if;
  begin update order_lines set unit_price = 1 where id = 'ed11ed11-0000-0000-0000-0000000000a2'; raise exception 'FAIL: a sold line''s price was rewritten';
  exception when insufficient_privilege then null; end;
  -- An offer comes off; its amount never changes; one live use per order and offer.
  begin insert into order_discounts (tenant_id, order_id, discount_id, class, amount, title, style, min_subtotal) values ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'd15c0000-0000-0000-0000-00000000000a', 'order', 4000, 'A sale', 'order_off', 0);
    raise exception 'FAIL: two live uses of one offer on one order'; exception when unique_violation then null; end;
  update order_discounts set removed_at = now() where id = '0d0d0d0d-0000-0000-0000-00000000000a'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not take its own offer off'; end if;
  insert into order_discounts (tenant_id, order_id, discount_id, class, amount, title, style, min_subtotal) values ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'd15c0000-0000-0000-0000-00000000000a', 'order', 4000, 'A sale', 'order_off', 0);
  begin update order_discounts set amount = 1; raise exception 'FAIL: app changed a use''s amount'; exception when insufficient_privilege then null; end;
  update order_discounts set removed_at = now() where order_id = 'acacacac-0000-0000-0000-00000000000b'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A took B''s offer off'; end if;
end $$;
rollback;

-- 75. Product import PI·1 (0119; plan docs/plans/2026-11-12-product-import.md § Tasks 5): jobs and rows are the shop's
-- own both ways; a row can never name another shop's job or product (composite keys); the app never deletes either,
-- never moves one to another shop, and never rewrites a job's file, mapping or who started it; one running job a shop;
-- a deleted draft leaves its row with no product; no other role holds anything.
insert into products (id, tenant_id, handle, title) values ('eeeeeeee-0000-0000-0000-0000000000b4', '22222222-2222-2222-2222-222222222222', 'b-imported', 'B imported');
insert into import_jobs (id, tenant_id, file_name, file_hash, source, mapping, chunks, planned, started_by) values
  ('f1f1f1f1-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'b.csv', repeat('b', 64), 'sheet', '{"source":"sheet","headers":[],"fields":[]}', 1, 1, 'aaaaaaaa-0000-0000-0000-000000000001');
insert into import_rows (tenant_id, job_id, n, key, cells, product_id) values
  ('22222222-2222-2222-2222-222222222222', 'f1f1f1f1-0000-0000-0000-00000000000b', 2, 't:b kurta', '{B kurta,999}', 'eeeeeeee-0000-0000-0000-0000000000b4');
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from import_jobs) or exists (select 1 from import_rows) then raise exception 'FAIL: imports seen with no shop set'; end if;
  begin insert into import_jobs (tenant_id, file_name, source, mapping, chunks, planned, started_by) values ('11111111-1111-1111-1111-111111111111', 'x.csv', 'sheet', '{}', 1, 0, gen_random_uuid());
    raise exception 'FAIL: a job with no shop set'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from import_jobs) or exists (select 1 from import_rows) then raise exception 'FAIL: A sees B imports'; end if;
  update import_jobs set finished_at = now() where id = 'f1f1f1f1-0000-0000-0000-00000000000b';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A finished B job'; end if;
  update import_rows set cells = null where job_id = 'f1f1f1f1-0000-0000-0000-00000000000b';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: A changed B rows'; end if;
  begin insert into import_jobs (tenant_id, file_name, source, mapping, chunks, planned, started_by) values ('22222222-2222-2222-2222-222222222222', 'x.csv', 'sheet', '{}', 1, 0, gen_random_uuid());
    raise exception 'FAIL: A wrote a B job'; exception when insufficient_privilege then null; end;
  insert into import_jobs (id, tenant_id, file_name, file_hash, source, mapping, chunks, planned, started_by) values
    ('f1f1f1f1-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'a.csv', repeat('a', 64), 'sheet', '{}', 2, 1, gen_random_uuid());
  begin insert into import_jobs (tenant_id, file_name, source, mapping, chunks, planned, started_by) values ('11111111-1111-1111-1111-111111111111', 'two.csv', 'sheet', '{}', 1, 0, gen_random_uuid());
    raise exception 'FAIL: two running imports in one shop'; exception when unique_violation then null; end;
  insert into import_rows (tenant_id, job_id, n, key, product_id) values ('11111111-1111-1111-1111-111111111111', 'f1f1f1f1-0000-0000-0000-00000000000a', 2, 't:a', 'eeeeeeee-0000-0000-0000-00000000000a');
  begin insert into import_rows (tenant_id, job_id, n, key) values ('11111111-1111-1111-1111-111111111111', 'f1f1f1f1-0000-0000-0000-00000000000b', 3, 't:x');
    raise exception 'FAIL: A wrote a row into B job'; exception when foreign_key_violation then null; end;
  begin insert into import_rows (tenant_id, job_id, n, key, product_id) values ('11111111-1111-1111-1111-111111111111', 'f1f1f1f1-0000-0000-0000-00000000000a', 3, 't:x', 'eeeeeeee-0000-0000-0000-0000000000b4');
    raise exception 'FAIL: an A row named a B product'; exception when foreign_key_violation then null; end;
  begin insert into import_rows (tenant_id, job_id, n, key) values ('22222222-2222-2222-2222-222222222222', 'f1f1f1f1-0000-0000-0000-00000000000b', 3, 't:x');
    raise exception 'FAIL: A wrote a B row'; exception when insufficient_privilege then null; end;
  begin delete from import_jobs where id = 'f1f1f1f1-0000-0000-0000-00000000000a'; raise exception 'FAIL: the app deleted a job'; exception when insufficient_privilege then null; end;
  begin delete from import_rows; raise exception 'FAIL: the app deleted a row'; exception when insufficient_privilege then null; end;
  begin update import_jobs set mapping = '{}' where id = 'f1f1f1f1-0000-0000-0000-00000000000a'; raise exception 'FAIL: the app rewrote a mapping'; exception when insufficient_privilege then null; end;
  begin update import_jobs set tenant_id = '22222222-2222-2222-2222-222222222222' where id = 'f1f1f1f1-0000-0000-0000-00000000000a'; raise exception 'FAIL: the app moved a job'; exception when insufficient_privilege then null; end;
  begin update import_rows set product_id = null; raise exception 'FAIL: the app re-pointed a row'; exception when insufficient_privilege then null; end;
  update import_rows set cells = null where job_id = 'f1f1f1f1-0000-0000-0000-00000000000a';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL: A could not null its own row''s cells'; end if;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update']) p, unnest(array['import_jobs', 'import_rows']) t
             where has_any_column_privilege(r, t, p))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_app']) r, unnest(array['import_jobs', 'import_rows']) t where has_table_privilege(r, t, 'delete') or has_table_privilege(r, t, 'truncate'))
  then raise exception 'FAIL: another role reaches imports, or one deletes them'; end if;
  if exists (select 1 from pg_class where relname in ('import_jobs', 'import_rows') and not relrowsecurity) then raise exception 'FAIL: imports without RLS'; end if;
  -- The exact columns frata_app may update, each table (a new grant must be added here on purpose).
  if (select array_agg(attname::text order by attname) from pg_attribute where attrelid = 'import_jobs'::regclass and attnum > 0 and not attisdropped
        and has_column_privilege('frata_app', attrelid, attnum, 'update'))
     is distinct from array['added', 'drafts_deleted_at', 'file_hash', 'finished_at', 'in_shop', 'left_out', 'next_chunk', 'updated_at']
  then raise exception 'FAIL: frata_app updates other import_jobs columns'; end if;
  if (select array_agg(attname::text order by attname) from pg_attribute where attrelid = 'import_rows'::regclass and attnum > 0 and not attisdropped
        and has_column_privilege('frata_app', attrelid, attnum, 'update'))
     is distinct from array['cells']
  then raise exception 'FAIL: frata_app updates other import_rows columns'; end if;
  if exists (select 1 from pg_policies where tablename in ('import_jobs', 'import_rows') and (coalesce(qual, '') not like '%app_current_tenant()%' or coalesce(with_check, '') not like '%app_current_tenant()%'))
  then raise exception 'FAIL: an import policy that doesn''t name the shop'; end if;
  -- A deleted draft leaves its row, with no product (SET NULL on product_id only: the row keeps its shop).
  delete from products where id = 'eeeeeeee-0000-0000-0000-0000000000b4';
  if not exists (select 1 from import_rows where job_id = 'f1f1f1f1-0000-0000-0000-00000000000b' and product_id is null and tenant_id = '22222222-2222-2222-2222-222222222222')
  then raise exception 'FAIL: a deleted draft took its import row, or its shop'; end if;
  -- SKUs are one in a shop in any case (variants_tenant_sku_upper).
  insert into products (id, tenant_id, handle, title) values ('eeeeeeee-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'a-sku-case', 'A');
  insert into variants (tenant_id, product_id, option_values, price, sku) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-0000000000a3', '{S}', 1, 'KS-CASE-1');
  begin insert into variants (tenant_id, product_id, option_values, price, sku) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-0000000000a3', '{M}', 1, 'ks-case-1');
    raise exception 'FAIL: two SKUs that differ only in case'; exception when unique_violation then null; end;
end $$;

-- 76. Paid-online edits (OE·2, 0120–0121): a refund attempt is the shop's own both ways; it never names another shop's
-- order, edit or attempt, nor an edit of another of the shop's orders; it is never deleted; only its moments, the change
-- that settled it and the fee of a payment refunded in full change, each once; a waiting edit is settled once and only in
-- its own columns; an edit line names a line of its own order only, and its held pieces only go back to 0; the 24-hour
-- reminder notices only the shop's own waiting edit; no other role holds any of it.
insert into order_refunds (id, tenant_id, order_id, edit_id, cause, razorpay_payment_id, amount, not_before) values
  ('7ef00000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'ed170000-0000-0000-0000-00000000000b', 'edit', 'pay_B0000001', 10000, now());
insert into order_events (id, tenant_id, order_id, kind, actor_kind) values
  ('ed1e0e00-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'edit_requested', 'system');
insert into order_edits (id, tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify, asked, created_at) values
  ('ed170000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'ed1e0e00-0000-0000-0000-0000000000b2', 100000, 150000, 0, 0, false, 50000, now() - interval '25 hours');
do $$ declare got text; begin
  if exists (select 1 from pg_tables where tablename = 'order_refunds' and not rowsecurity) then raise exception 'FAIL: order_refunds without RLS'; end if;
  if (select count(*) from pg_policies where tablename = 'order_refunds' and policyname = 'tenant_rows' and qual like '%app_current_tenant()%' and with_check like '%app_current_tenant()%') <> 1
  then raise exception 'FAIL: order_refunds without its tenant policy'; end if;
  if not has_table_privilege('frata_app', 'order_refunds', 'select') or not has_table_privilege('frata_app', 'order_refunds', 'insert')
     or exists (select 1 from unnest(array['update', 'delete', 'truncate', 'references', 'trigger']) p where has_table_privilege('frata_app', 'order_refunds', p))
  then raise exception 'FAIL: frata_app holds other than select, insert and its moments on order_refunds'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
             where has_table_privilege(r, 'order_refunds', p) or has_any_column_privilege(r, 'order_refunds', 'select') or has_any_column_privilege(r, 'order_refunds', 'update'))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['order_edits', 'order_edit_lines']) t where has_any_column_privilege(r, t, 'update'))
  then raise exception 'FAIL: another role reaches refunds or settles an edit'; end if;
  -- The exact columns frata_app may update, each table (a new grant must be added here on purpose).
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges where grantee = 'frata_app' and table_name = 'order_refunds' and privilege_type = 'UPDATE';
  if got is distinct from 'cancelled_at,failed_at,failure,gateway_fee,gateway_tax,processed_at,razorpay_refund_id,sending_at,sent_at,superseded_by' then raise exception 'FAIL: frata_app updates order_refunds columns %', got; end if;
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges where grantee = 'frata_app' and table_name = 'order_edits' and privilege_type = 'UPDATE';
  if got is distinct from 'dropped_at,dropped_reason,gateway_fee,gateway_tax,offers_added,offers_removed,paid_at,razorpay_order_id,razorpay_payment_id' then raise exception 'FAIL: frata_app updates order_edits columns %', got; end if;
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges where grantee = 'frata_app' and table_name = 'order_edit_lines' and privilege_type = 'UPDATE';
  if got is distinct from 'held,order_line_id' then raise exception 'FAIL: frata_app updates order_edit_lines columns %', got; end if;
  -- The reminder: a definer with an empty search path, the shop's app only.
  if not (select prosecdef from pg_proc where proname = 'app_edit_payment_notice') then raise exception 'FAIL: the edit reminder is not a definer'; end if;
  if not has_function_privilege('frata_app', 'public.app_edit_payment_notice(uuid)', 'execute')
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, 'public.app_edit_payment_notice(uuid)', 'execute'))
  then raise exception 'FAIL: the edit reminder runs for the wrong roles'; end if;
  -- The write-once triggers are not definers (they run as the writer, under its policy).
  if exists (select 1 from pg_proc where proname in ('app_refund_moments_once', 'app_edit_settled_once', 'app_edit_line_once') and prosecdef) then raise exception 'FAIL: a write-once trigger is a definer'; end if;
end $$;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; r uuid; e uuid; l uuid; o2 uuid; begin
  if exists (select 1 from order_refunds) then raise exception 'FAIL: A reads B refunds'; end if;
  -- A waiting edit of A's order, a line of A's other order: neither a refund nor an edit line crosses between them.
  insert into order_edits (tenant_id, order_id, event_id, total_before, total_after, shipping_before, shipping_after, notify, asked)
    values ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'ed1e0e00-0000-0000-0000-00000000000a', 100000, 150000, 0, 0, false, 50000) returning id into e;
  insert into orders (id, tenant_id, number, payment_method, subtotal, total, placed_at) values
    ('ed0d0000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 9073, 'cod', 100000, 100000, now());
  insert into order_lines (tenant_id, order_id, title, qty, unit_price, taxable_value) values
    ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-0000000000a2', 'Other order''s kurta', 1, 100000, 95238) returning id into o2;
  insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount, held)
    values ('11111111-1111-1111-1111-111111111111', e, 'after', null, 1, 100000, 0, 0, 1) returning id into l;
  begin update order_edit_lines set order_line_id = 'ed11ed11-0000-0000-0000-00000000000b' where id = l; raise exception 'FAIL: A''s edit line named B''s line';
  exception when foreign_key_violation then null; end;
  begin update order_edit_lines set order_line_id = o2 where id = l; raise exception 'FAIL: an edit line named a line of another order';
  exception when foreign_key_violation then null; end;
  begin insert into order_edit_lines (tenant_id, edit_id, side, order_line_id, qty, unit_price, product_discount, line_discount)
    values ('11111111-1111-1111-1111-111111111111', e, 'before', o2, 1, 100000, 0, 0); raise exception 'FAIL: an edit saw a line of another order';
  exception when foreign_key_violation then null; end;
  begin update order_edit_lines set held = 2 where id = l; raise exception 'FAIL: an edit line held more';
  exception when check_violation then null; end;
  update order_edit_lines set held = 0 where id = l; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not let its held pieces go'; end if;
  update order_edit_lines set order_line_id = 'ed11ed11-0000-0000-0000-00000000000a' where id = l; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not name its own order''s line'; end if;
  begin insert into order_refunds (tenant_id, order_id, edit_id, cause, razorpay_payment_id, amount, not_before) values
    ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-0000000000a2', e, 'edit', 'pay_A0000007', 10000, now()); raise exception 'FAIL: a refund named an edit of another order';
  exception when foreign_key_violation then null; end;
  -- A's own attempt, on A's order.
  insert into order_refunds (tenant_id, order_id, cause, razorpay_payment_id, amount, not_before) values
    ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'old_order', 'pay_A0000001', 10000, now()) returning id into r;
  -- Never into B: B's order, B's edit, B's attempt as the one it retries, under B's tenant.
  begin insert into order_refunds (tenant_id, order_id, cause, razorpay_payment_id, amount, not_before) values
    ('11111111-1111-1111-1111-111111111111', 'acacacac-0000-0000-0000-00000000000b', 'old_order', 'pay_A0000002', 10000, now()); raise exception 'FAIL: A refunded on B''s order';
  exception when foreign_key_violation then null; end;
  begin insert into order_refunds (tenant_id, order_id, edit_id, cause, razorpay_payment_id, amount, not_before) values
    ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'ed170000-0000-0000-0000-00000000000b', 'edit', 'pay_A0000003', 10000, now()); raise exception 'FAIL: A''s refund names B''s edit';
  exception when foreign_key_violation then null; end;
  begin insert into order_refunds (tenant_id, order_id, cause, razorpay_payment_id, amount, not_before, retry_of) values
    ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'old_order', 'pay_A0000004', 10000, now(), '7ef00000-0000-0000-0000-00000000000b'); raise exception 'FAIL: A''s refund retries B''s';
  exception when foreign_key_violation then null; end;
  begin insert into order_refunds (tenant_id, order_id, cause, razorpay_payment_id, amount, not_before) values
    ('22222222-2222-2222-2222-222222222222', 'acacacac-0000-0000-0000-00000000000b', 'old_order', 'pay_A0000005', 10000, now()); raise exception 'FAIL: A wrote a refund under B';
  exception when insufficient_privilege then null; end;
  -- A refund under ₹1, or an edit refund with no edit, is refused.
  begin insert into order_refunds (tenant_id, order_id, cause, razorpay_payment_id, amount, not_before) values
    ('11111111-1111-1111-1111-111111111111', 'ed0d0000-0000-0000-0000-00000000000a', 'edit', 'pay_A0000006', 10000, now()); raise exception 'FAIL: an edit refund with no edit';
  exception when check_violation then null; end;
  -- Only its moments change, each once; its money, payment and order never; never deleted.
  update order_refunds set sending_at = now() where id = r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not claim its own refund'; end if;
  begin update order_refunds set sending_at = now() + interval '1 minute' where id = r; raise exception 'FAIL: a refund was claimed twice';
  exception when check_violation then null; end;
  begin update order_refunds set cancelled_at = now() where id = r; raise exception 'FAIL: a claimed refund was cancelled';
  exception when check_violation then null; end;
  begin update order_refunds set amount = 1 where id = r; raise exception 'FAIL: a refund''s amount was changed'; exception when insufficient_privilege then null; end;
  begin update order_refunds set razorpay_payment_id = 'pay_B0000001' where id = r; raise exception 'FAIL: a refund was moved to another payment'; exception when insufficient_privilege then null; end;
  begin delete from order_refunds where id = r; raise exception 'FAIL: a refund was deleted'; exception when insufficient_privilege then null; end;
  -- Only a failed edit refund is settled by a later change; a fee once written stays.
  begin update order_refunds set superseded_by = e where id = r; raise exception 'FAIL: a refund that is not a failed edit refund was superseded';
  exception when check_violation then null; end;
  update order_refunds set gateway_fee = 236, gateway_tax = 36 where id = r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not record the fee on its own refunded payment'; end if;
  begin update order_refunds set gateway_fee = 1 where id = r; raise exception 'FAIL: a refunded payment''s fee was rewritten';
  exception when check_violation then null; end;
  update order_refunds set failed_at = now(), failure = 'balance' where id = '7ef00000-0000-0000-0000-00000000000b'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A marked B''s refund'; end if;
  -- B's waiting edit: A can't settle it, and the reminder writes nothing for it.
  update order_edits set dropped_at = now(), dropped_reason = 'ship_without' where id = 'ed170000-0000-0000-0000-0000000000b2'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A dropped B''s change'; end if;
  if app_edit_payment_notice('ed170000-0000-0000-0000-0000000000b2') then raise exception 'FAIL: A noticed B''s change'; end if;
  begin update order_edits set asked = 1; raise exception 'FAIL: an edit''s amount asked was changed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin; set local role frata_app;
select set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
do $$ declare n int; begin
  -- B's own reminder, once; the waiting edit settled once.
  if not app_edit_payment_notice('ed170000-0000-0000-0000-0000000000b2') then raise exception 'FAIL: B''s own reminder was not written'; end if;
  if app_edit_payment_notice('ed170000-0000-0000-0000-0000000000b2') then raise exception 'FAIL: the reminder was written twice'; end if;
  if (select count(*) from notices where source_kind = 'edit_payment') <> 1 then raise exception 'FAIL: the reminder is not one notice'; end if;
  update order_edits set dropped_at = now(), dropped_reason = 'ship_without' where id = 'ed170000-0000-0000-0000-0000000000b2'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B could not drop its own change'; end if;
  begin update order_edits set dropped_reason = 'cannot_apply' where id = 'ed170000-0000-0000-0000-0000000000b2'; raise exception 'FAIL: a dropped change was changed';
  exception when check_violation then null; end;
  -- An edit that applied at once never takes offers or a payment later.
  begin update order_edits set offers_removed = '{}' , offers_added = '{0d0d0d0d-0000-0000-0000-00000000000a}' where id = 'ed170000-0000-0000-0000-00000000000b'; raise exception 'FAIL: an applied edit took offers later';
  exception when check_violation then null; end;
  if app_edit_payment_notice('ed170000-0000-0000-0000-0000000000b2') then raise exception 'FAIL: a dropped change was noticed'; end if;
end $$;
rollback;

-- 77. Partner teams T1a (0123–0124; plan docs/plans/2026-11-12-studio-build.md § T1a). O owns partner P, L is invited as a
-- lead, Z owns another partner, B is a brand owner, X anyone else, S an admin and U a support person. Tables: definers only.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000030', 'own@team.test', now()), ('aaaaaaaa-0000-0000-0000-000000000031', 'lead@team.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000032', 'zed@other.test', now()), ('aaaaaaaa-0000-0000-0000-000000000033', 'brand@team.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000034', 'x2@else.test', now()), ('aaaaaaaa-0000-0000-0000-000000000035', 'admin2@frata.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000036', 'help2@frata.test', now()), ('aaaaaaaa-0000-0000-0000-000000000037', 'dee@team.test', now());
insert into platform_staff (user_id, email, role) values ('aaaaaaaa-0000-0000-0000-000000000035', 'admin2@frata.test', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000036', 'help2@frata.test', 'support');
begin; set local role frata_app;
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000030', 'Om', 'Om Studio', '919845012340', 'Pune', '{}', '', '1-4', 1),
       app_partner_apply('aaaaaaaa-0000-0000-0000-000000000032', 'Zed', '', '919845012341', 'Surat', '{}', '', '1-4', 1),
       app_partner_apply('aaaaaaaa-0000-0000-0000-000000000037', 'Dee', '', '919845012342', 'Pune', '{}', '', '1-4', 1);
commit;
update partners set approved_at = now() where user_id in ('aaaaaaaa-0000-0000-0000-000000000030', 'aaaaaaaa-0000-0000-0000-000000000032');
update partners set declined_at = now(), decline_reason = 'proof' where user_id = 'aaaaaaaa-0000-0000-0000-000000000037';
begin; set local role frata_app;
do $$ declare O uuid := 'aaaaaaaa-0000-0000-0000-000000000030'; L uuid := 'aaaaaaaa-0000-0000-0000-000000000031'; Z uuid := 'aaaaaaaa-0000-0000-0000-000000000032';
  B uuid := 'aaaaaaaa-0000-0000-0000-000000000033'; X uuid := 'aaaaaaaa-0000-0000-0000-000000000034';
  D uuid := 'aaaaaaaa-0000-0000-0000-000000000037'; t1 uuid; t2 uuid; tz uuid; tl uuid; inv uuid; inv2 uuid; inv3 uuid; own uuid; h uuid; m jsonb; r jsonb;
begin
  begin perform 1 from partner_members; raise exception 'FAIL: app reads partner_members'; exception when insufficient_privilege then null; end;
  begin perform 1 from partner_assignments; raise exception 'FAIL: app reads partner_assignments'; exception when insufficient_privilege then null; end;
  begin perform admin_end_partner(O, gen_random_uuid(), 'x'); raise exception 'FAIL: app suspends a partner'; exception when insufficient_privilege then null; end;
  perform proof.check(O); perform proof.check(Z); -- each check in its own statement (a STABLE read sees the statement's start)
  t1 := app_partner_create_shop(O, proof.sess(O), proof.h(O), 'Team A', 'proof-team-a', '411001', 2000, 24, 90, 10);
  t2 := app_partner_create_shop(O, proof.sess(O), proof.h(O), 'Team B', 'proof-team-b', '411001', 2000, 24, 90, 10);
  tz := app_partner_create_shop(Z, proof.sess(Z), proof.h(Z), 'Zed shop', 'proof-zed', '395001', 2000, 24, 90, 10);
  select member_id into own from app_my_partner(O);
  if (select member_role from app_my_partner(O)) <> 'owner' or (select count(*) from app_partner_team(O, proof.sess(O), proof.h(O))) <> 1 then raise exception 'FAIL: the founder is the owner member'; end if;
  begin perform app_partner_team(X, proof.sess(X), proof.h(X)); raise exception 'FAIL: a stranger read a team'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  -- invites: owner only, a lead, the partner's own live stores only
  begin perform app_partner_invite(Z, proof.sess(Z), proof.h(Z), 'x@else.test', 'lead', array[t1]); raise exception 'FAIL: another partner invited into P store'; exception when sqlstate 'P0001' then if sqlerrm <> 'bad_store' then raise; end if; end;
  begin perform app_partner_invite(O, proof.sess(O), proof.h(O), 'lead@team.test', 'owner', array[t1]); raise exception 'FAIL: an invite made an owner'; exception when sqlstate 'P0001' then if sqlerrm <> 'bad_role' then raise; end if; end;
  begin perform app_partner_invite(O, proof.sess(O), proof.h(O), 'lead@team.test', 'owner', array[t1]); raise exception 'FAIL: a second owner'; exception when sqlstate 'P0001' then if sqlerrm <> 'bad_role' then raise; end if; end;
  inv := app_partner_invite(O, proof.sess(O), proof.h(O), 'Lead@Team.test', 'lead', array[t1]);
  begin perform app_partner_invite(O, proof.sess(O), proof.h(O), 'lead@team.test', 'lead', '{}'); raise exception 'FAIL: the same email twice'; exception when sqlstate 'P0001' then if sqlerrm <> 'already_invited' then raise; end if; end;
  if (select count(*) from app_partner_my_invites(L)) <> 1 or exists (select 1 from app_partner_my_invites(X)) then raise exception 'FAIL: who sees the invite'; end if;
  -- accept: only the invited, confirmed email; never someone in another partner
  begin perform app_partner_accept(X, inv); raise exception 'FAIL: a stranger accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'no_invite' then raise; end if; end;
  inv2 := app_partner_invite(O, proof.sess(O), proof.h(O), 'zed@other.test', 'lead', '{}');
  if exists (select 1 from app_partner_my_invites(Z)) then raise exception 'FAIL: an invite they can''t accept is listed (sign-in would trap them on /join)'; end if;
  begin perform app_partner_accept(Z, inv2); raise exception 'FAIL: a person joined two partners'; exception when sqlstate 'P0001' then if sqlerrm <> 'own_partner' then raise; end if; end;
  -- a declined applicant can join a team: their own owner row ends at accept
  inv3 := app_partner_invite(O, proof.sess(O), proof.h(O), 'dee@team.test', 'lead', '{}');
  if (select count(*) from app_partner_my_invites(D)) <> 1 then raise exception 'FAIL: a declined applicant can''t see an invite'; end if;
  perform app_partner_accept(D, inv3);
  if (select member_role from app_my_partner(D)) <> 'lead' then raise exception 'FAIL: a declined applicant joined as a lead'; end if;
  perform app_partner_remove_member(O, proof.sess(O), proof.h(O), inv3);
  begin perform app_partner_invite(L, proof.sess(L), proof.h(L), 'x2@else.test', 'lead', '{}'); raise exception 'FAIL: invited before accepting'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  r := app_partner_accept(L, inv);
  m := app_access_for(L);
  if jsonb_array_length(m->'memberships') <> 0 or jsonb_array_length(m->'partnerHeld') <> 1 then raise exception 'FAIL: a lead without a passkey check opens a store (%)', m; end if;
  perform proof.check(L);
  m := app_access_for(L, proof.sess(L), null, proof.h(L));
  if jsonb_array_length(m->'memberships') <> 1 or (m->'memberships'->0->>'tenantId')::uuid <> t1 or m->'memberships'->0->>'role' <> 'partner' then raise exception 'FAIL: the lead works on A only (%)', m; end if;
  if (select count(*) from app_partner_clients(L, proof.sess(L), proof.h(L))) <> 1 or (select count(*) from app_partner_clients(O, proof.sess(O), proof.h(O))) <> 2 then raise exception 'FAIL: clients by role'; end if;
  if (select member_role from app_my_partner(L)) <> 'lead' then raise exception 'FAIL: the lead''s role'; end if;
  if (select phone from app_my_partner(L)) <> '' or (select email from app_my_partner(L)) <> '' then raise exception 'FAIL: a lead reads the owner''s contact details'; end if;
  perform set_config('app.tenant_id', t1::text, true);
  if (select partner_role from app_shop_people() where user_id = L) is distinct from 'lead' then raise exception 'FAIL: People labels the lead'; end if;
  perform set_config('app.tenant_id', '', true);
  -- a lead can't run the team or hand over (until T1b); a lead can make a store, and the owner works on it too
  begin perform app_partner_invite(L, proof.sess(L), proof.h(L), 'x2@else.test', 'lead', '{}'); raise exception 'FAIL: a lead invited'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_remove_member(L, proof.sess(L), proof.h(L), own); raise exception 'FAIL: a lead removed someone'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_assign(L, proof.sess(L), proof.h(L), inv, t2, true); raise exception 'FAIL: a lead assigned'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_handover_invite(t1, L, 'someone@brand.test', proof.sess(L), proof.h(L)); raise exception 'FAIL: a lead handed over'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  tl := app_partner_create_shop(L, proof.sess(L), proof.h(L), 'Lead shop', 'proof-team-l', '411001', 2000, 24, 90, 10);
  if (select count(*) from app_partner_clients(O, proof.sess(O), proof.h(O))) <> 3 or (select count(*) from app_partner_clients(L, proof.sess(L), proof.h(L))) <> 2 then raise exception 'FAIL: a lead''s new store'; end if;
  -- assignment: the owner, the partner's own store, the partner's own person
  begin perform app_partner_assign(O, proof.sess(O), proof.h(O), inv, tz, true); raise exception 'FAIL: assigned another partner''s store'; exception when sqlstate 'P0001' then if sqlerrm <> 'bad_store' then raise; end if; end;
  begin perform app_partner_assign(Z, proof.sess(Z), proof.h(Z), inv, tz, true); raise exception 'FAIL: another partner assigned P''s lead'; exception when sqlstate 'P0001' then if sqlerrm <> 'no_person' then raise; end if; end;
  perform app_partner_assign(O, proof.sess(O), proof.h(O), inv, t2, true);
  if jsonb_array_length(app_access_for(L, proof.sess(L), null, proof.h(L))->'memberships') <> 3 then raise exception 'FAIL: assign'; end if;
  perform app_partner_assign(O, proof.sess(O), proof.h(O), inv, t2, false);
  if jsonb_array_length(app_access_for(L, proof.sess(L), null, proof.h(L))->'memberships') <> 2 then raise exception 'FAIL: unassign'; end if;
  -- a colleague never takes a handover
  h := app_handover_invite(t2, O, 'lead@team.test', proof.sess(O), proof.h(O));
  if exists (select 1 from app_my_handovers(L)) then raise exception 'FAIL: a colleague sees the handover'; end if;
  begin perform app_accept_handover_v2(L, h, null, 1::smallint); raise exception 'FAIL: a colleague took the store'; exception when sqlstate 'P0001' then if sqlerrm <> 'partner_member' then raise; end if; end;
  -- removal: never the owner; a removed lead has nothing
  begin perform app_partner_remove_member(O, proof.sess(O), proof.h(O), own); raise exception 'FAIL: the owner removed'; exception when sqlstate 'P0001' then if sqlerrm <> 'is_owner' then raise; end if; end;
  perform app_partner_remove_member(O, proof.sess(O), proof.h(O), inv);
  if jsonb_array_length(app_access_for(L, proof.sess(L), null, proof.h(L))->'memberships') <> 0 or exists (select 1 from app_my_partner(L)) or exists (select 1 from app_partner_clients(L, proof.sess(L), proof.h(L)))
  then raise exception 'FAIL: a removed lead keeps access'; end if;
  -- the brand unlinks the partner: every partner person's access to that store ends
  inv := app_partner_invite(O, proof.sess(O), proof.h(O), 'x2@else.test', 'lead', array[t1]);
  perform app_partner_accept(X, inv);
  perform proof.check(X);
  inv2 := app_partner_invite(Z, proof.sess(Z), proof.h(Z), 'x2@else.test', 'lead', '{}');
  if exists (select 1 from app_partner_my_invites(X)) then raise exception 'FAIL: a team member is offered another team'; end if;
  begin perform app_partner_accept(X, inv2); raise exception 'FAIL: a person joined two partners'; exception when sqlstate 'P0001' then if sqlerrm <> 'in_team' then raise; end if; end;
  h := app_handover_invite(t1, O, 'brand@team.test', proof.sess(O), proof.h(O));
  perform app_accept_handover_v2(B, h, null, 1::smallint);
  perform app_remove_partner(t1, B);
  if exists (select 1 from jsonb_array_elements(app_access_for(X, proof.sess(X), null, proof.h(X))->'memberships') e where (e->>'tenantId')::uuid = t1)
     or exists (select 1 from jsonb_array_elements(app_access_for(O, proof.sess(O), null, proof.h(O))->'memberships') e where (e->>'tenantId')::uuid = t1)
  then raise exception 'FAIL: unlinking left a partner person in the store'; end if;
  perform set_config('proof.partner_o', (select id::text from app_my_partner(O)), false);
  perform set_config('proof.t2', t2::text, false);
end $$;
commit;
-- suspend: admins only; every partner person's access ends; reinstate gives it back
begin; set local role frata_admin;
do $$ declare O uuid := 'aaaaaaaa-0000-0000-0000-000000000030'; p uuid := current_setting('proof.partner_o')::uuid; n int; begin
  begin perform admin_end_partner('aaaaaaaa-0000-0000-0000-000000000036', p, 'proof'); raise exception 'FAIL: support suspended a partner'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_admin' then raise; end if; end;
  begin perform admin_end_partner('aaaaaaaa-0000-0000-0000-000000000035', p, ''); raise exception 'FAIL: a suspension with no reason'; exception when sqlstate 'P0001' then if sqlerrm <> 'bad_reason' then raise; end if; end;
  n := admin_end_partner('aaaaaaaa-0000-0000-0000-000000000035', p, 'proof');
  if n <> 2 then raise exception 'FAIL: suspension told % shops', n; end if;
  begin update partners set suspended_at = null where id = p; raise exception 'FAIL: Admin writes partners.suspended_at directly'; exception when insufficient_privilege then null; end;
end $$;
commit;
begin; set local role frata_app;
do $$ declare O uuid := 'aaaaaaaa-0000-0000-0000-000000000030'; X uuid := 'aaaaaaaa-0000-0000-0000-000000000034'; begin
  if jsonb_array_length(app_access_for(O, proof.sess(O), null, proof.h(O))->'memberships') <> 0 or jsonb_array_length(app_access_for(X, proof.sess(X), null, proof.h(X))->'memberships') <> 0 then raise exception 'FAIL: a suspended partner keeps access'; end if;
  if (select suspended_at from app_my_partner(O)) is null then raise exception 'FAIL: the workspace can''t tell it is suspended'; end if;
  begin perform app_partner_create_shop(O, proof.sess(O), proof.h(O), 'Late', 'proof-late', '411001', 2000, 24, 90, 10); raise exception 'FAIL: a suspended partner made a store'; exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  -- the brand still sees the paused partner on People, so it can remove it
  perform set_config('app.tenant_id', current_setting('proof.t2'), true);
  if not exists (select 1 from app_shop_people() where user_id = O and role = 'partner' and partner_paused) then raise exception 'FAIL: a paused partner vanished from People'; end if;
  perform set_config('app.tenant_id', '', true);
end $$;
commit;
begin; set local role frata_admin;
select admin_reinstate_partner('aaaaaaaa-0000-0000-0000-000000000035', current_setting('proof.partner_o')::uuid);
commit;
begin; set local role frata_app;
do $$ declare O uuid := 'aaaaaaaa-0000-0000-0000-000000000030'; begin
  if not exists (select 1 from jsonb_array_elements(app_access_for(O, proof.sess(O), null, proof.h(O))->'memberships') e where (e->>'tenantId')::uuid = current_setting('proof.t2')::uuid)
  then raise exception 'FAIL: reinstate did not give the owner back the store'; end if;
  perform set_config('app.tenant_id', current_setting('proof.t2'), true);
  if exists (select 1 from app_shop_people() where partner_paused) then raise exception 'FAIL: a reinstated partner still shows paused'; end if;
end $$;
commit;
do $$ begin
  if not exists (select 1 from notices where tenant_id = current_setting('proof.t2')::uuid and title like 'Frrata reinstated your partner%') then raise exception 'FAIL: the brand is not told of the reinstatement'; end if;
end $$;
-- every partner shop row points at a partner person (the CHECK), and no frata_app policy on the team tables
do $$ begin
  if exists (select 1 from members where (role = 'partner') <> (partner_member_id is not null)) then raise exception 'FAIL: a partner row without its person'; end if;
  if exists (select 1 from pg_policies where tablename in ('partner_members', 'partner_assignments') and 'frata_app' = any(roles)) then raise exception 'FAIL: frata_app policy on team tables'; end if;
end $$;

-- 78. Saved views (Neel N1c, 0125–0126; plan docs/plans/2026-11-13-neel-n1c.md § N1c·2): a view is the shop's own both
-- ways; frata_app reads and adds its own (never deletes: Remove is removed_at) and changes only a name and its moments; no other role holds any of
-- it; names are one a shop in any case (a removed view's name is free again); the AWB index leads with the shop.
insert into saved_views (id, tenant_id, name, tab, query, created_by) values
  ('5a7e0000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Bihar COD', 'to_confirm', 'pay=cod&st=10', '99999999-9999-9999-9999-999999999999');
do $$ declare got text; begin
  if exists (select 1 from pg_tables where tablename = 'saved_views' and not rowsecurity) then raise exception 'FAIL: saved_views without RLS'; end if;
  if (select count(*) from pg_policies where tablename = 'saved_views') <> 1
     or (select count(*) from pg_policies where tablename = 'saved_views' and policyname = 'tenant_rows' and roles = '{frata_app}'
         and qual like '%app_current_tenant()%' and with_check like '%app_current_tenant()%' and qual not like '%is null%') <> 1
  then raise exception 'FAIL: saved_views without its one tenant policy'; end if;
  if not (has_table_privilege('frata_app', 'saved_views', 'select') and has_table_privilege('frata_app', 'saved_views', 'insert'))
     or exists (select 1 from unnest(array['update', 'delete', 'truncate', 'references', 'trigger']) p where has_table_privilege('frata_app', 'saved_views', p))
  then raise exception 'FAIL: frata_app holds other than select, insert and its columns on saved_views'; end if;
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges where grantee = 'frata_app' and table_name = 'saved_views' and privilege_type = 'UPDATE';
  if got is distinct from 'name,removed_at,updated_at' then raise exception 'FAIL: frata_app updates saved_views columns %', got; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
             where has_table_privilege(r, 'saved_views', p) or has_any_column_privilege(r, 'saved_views', 'select') or has_any_column_privilege(r, 'saved_views', 'update'))
  then raise exception 'FAIL: another role reaches saved_views'; end if;
  if exists (select 1 from pg_indexes where tablename in ('saved_views', 'shipments') and indexname in ('saved_views_tenant_name', 'shipments_tracking') and indexdef not like '%(tenant_id,%')
     or (select count(*) from pg_indexes where indexname in ('saved_views_tenant_name', 'shipments_tracking')) <> 2
  then raise exception 'FAIL: a saved-view or tracking index does not lead with the shop'; end if;
  if exists (select 1 from pg_indexes where tablename = 'shipments' and indexdef like '%UNIQUE%' and indexdef like '%(tracking_number)%') then raise exception 'FAIL: a unique on tracking_number alone'; end if;
end $$;
begin; set local role frata_app;
select set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  if exists (select 1 from saved_views) then raise exception 'FAIL: A reads B views'; end if;
  insert into saved_views (tenant_id, name, tab, query, created_by) values ('11111111-1111-1111-1111-111111111111', 'Bihar COD', 'to_confirm', 'pay=cod&st=10', '99999999-9999-9999-9999-999999999999');
  if (select count(*) from saved_views) <> 1 then raise exception 'FAIL: A cannot see its own view'; end if;
  begin insert into saved_views (tenant_id, name, tab, created_by) values ('22222222-2222-2222-2222-222222222222', 'Forged', 'all', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: A wrote a view into B'; exception when insufficient_privilege then null; end;
  update saved_views set name = 'Taken' where id = '5a7e0000-0000-0000-0000-00000000000b'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A renamed B''s view'; end if;
  begin delete from saved_views where id = '5a7e0000-0000-0000-0000-00000000000b'; raise exception 'FAIL: frata_app deletes views';
  exception when insufficient_privilege then null; end;
  begin update saved_views set tenant_id = '22222222-2222-2222-2222-222222222222'; raise exception 'FAIL: A moved a view to B';
  exception when insufficient_privilege then null; end;
  -- one name a shop, any case; a removed view's name is free again
  begin insert into saved_views (tenant_id, name, tab, created_by) values ('11111111-1111-1111-1111-111111111111', 'bihar cod', 'all', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: two views named alike'; exception when unique_violation then null; end;
  update saved_views set removed_at = now() where name = 'Bihar COD';
  insert into saved_views (tenant_id, name, tab, created_by) values ('11111111-1111-1111-1111-111111111111', 'bihar cod', 'all', '99999999-9999-9999-9999-999999999999');
  -- the shape
  begin insert into saved_views (tenant_id, name, tab, created_by) values ('11111111-1111-1111-1111-111111111111', '', 'all', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: an empty name'; exception when check_violation then null; end;
  begin insert into saved_views (tenant_id, name, tab, created_by) values ('11111111-1111-1111-1111-111111111111', repeat('x', 41), 'all', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a 41-character name'; exception when check_violation then null; end;
  begin insert into saved_views (tenant_id, name, tab, query, created_by) values ('11111111-1111-1111-1111-111111111111', 'Long', 'all', repeat('x', 401), '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a 401-character query'; exception when check_violation then null; end;
  begin insert into saved_views (tenant_id, name, tab, created_by) values ('11111111-1111-1111-1111-111111111111', 'Bad tab', 'everything', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a tab that is not a queue tab'; exception when check_violation then null; end;
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '', true);
do $$ begin
  if exists (select 1 from saved_views) then raise exception 'FAIL: views read with no shop set'; end if;
  begin insert into saved_views (tenant_id, name, tab, created_by) values ('11111111-1111-1111-1111-111111111111', 'No shop', 'all', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a view written with no shop set'; exception when insufficient_privilege then null; end;
end $$;
commit;
do $$ begin
  if (select name from saved_views where id = '5a7e0000-0000-0000-0000-00000000000b') is distinct from 'Bihar COD' then raise exception 'FAIL: B''s view changed'; end if;
end $$;

-- 79. Partner passkeys T1b (0128–0129; plan docs/plans/2026-11-12-studio-build.md § T1b, reviews folded in). Q owns
-- Kiln, M is Kiln's lead, Z owns another partner (§ 77), S is an admin and U support. Every row is bound to ONE
-- membership; the tables have no grant; the check is inside every workspace definer and inside app_access_for.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000090', 'q@kiln.test', now()), ('aaaaaaaa-0000-0000-0000-000000000091', 'm@kiln.test', now());
begin; set local role frata_app;
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000090', 'Quila', 'Kiln', '919845012350', 'Pune', '{}', '', '1-4', 1);
commit;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000090';
-- an admin's live staff check (staff passkeys are § 74's; here only the row the admin definers read)
insert into staff_passkeys (user_id, credential_id, public_key, name) values ('aaaaaaaa-0000-0000-0000-000000000035', 'proof-staff-035', 'x', 'Proof');
insert into staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at)
  select 'aaaaaaaa-0000-0000-0000-000000000035', proof.sess('aaaaaaaa-0000-0000-0000-000000000035'), id, 'proof-staff-hash-035', now() + interval '1 hour'
    from staff_passkeys where credential_id = 'proof-staff-035';
do $$ declare r text; f text; begin
  -- no role holds a privilege on the five tables
  foreach f in array array['partner_passkeys','partner_passkey_requests','partner_webauthn_challenges','partner_stepups','partner_passkey_tries'] loop
    foreach r in array array['frata_app','frata_admin','anon','authenticated','service_role'] loop
      if has_table_privilege(r, f, 'select') or has_table_privilege(r, f, 'insert') or has_table_privilege(r, f, 'update') or has_table_privilege(r, f, 'delete') then
        raise exception 'FAIL: % holds a privilege on %', r, f; end if;
    end loop;
  end loop;
  -- EXECUTE: helpers nobody; Admin's to frata_admin only; the partner side to frata_app only
  if has_function_privilege('frata_app', 'app_partner_live_stepup(uuid, uuid, text)', 'execute') or has_function_privilege('frata_app', 'app_partner_need(uuid, uuid, text, boolean)', 'execute')
     or has_function_privilege('frata_app', 'app_partner_try(uuid, uuid, text)', 'execute') or has_function_privilege('frata_app', 'app_partner_notify(uuid, text, text, text, boolean)', 'execute')
     or has_function_privilege('frata_app', 'admin_partner_pk_approve(uuid, uuid, text, uuid, text)', 'execute') or has_function_privilege('frata_admin', 'app_partner_pk_approve(uuid, uuid, text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'app_partner_pk_state(uuid, uuid)', 'execute') or not has_function_privilege('frata_app', 'app_partner_pk_state(uuid, uuid)', 'execute')
     or not has_function_privilege('frata_admin', 'admin_partner_pk_state(uuid, uuid, text, uuid)', 'execute')
     or not has_function_privilege('frata_app', 'app_partner_pk_decline(uuid, uuid, text, uuid)', 'execute') or has_function_privilege('frata_admin', 'app_partner_pk_decline(uuid, uuid, text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'app_partner_pk_decline(uuid, uuid, text, uuid)', 'execute')
     or to_regprocedure('app_partner_pk_request(uuid,uuid,text)') is not null then
    raise exception 'FAIL: the EXECUTE matrix'; end if;
  -- every new function is a definer with an empty search path
  if exists (select 1 from pg_proc p where (p.proname like 'app_partner_pk_%' or p.proname like 'admin_partner_pk_%' or p.proname in ('app_partner_live_stepup','app_partner_need','app_partner_try','app_partner_notify'))
               and (not p.prosecdef or p.proconfig is null or not ('search_path=""' = any(p.proconfig)))) then raise exception 'FAIL: a passkey function is not a fenced definer'; end if;
  -- no way around the check: the old signatures are gone
  if to_regprocedure('app_access_for(uuid,uuid,text)') is not null or to_regprocedure('app_handover_invite(uuid,uuid,text)') is not null
     or to_regprocedure('app_partner_team(uuid)') is not null or to_regprocedure('app_partner_clients(uuid)') is not null
     or to_regprocedure('app_partner_invite(uuid,text,text,uuid[])') is not null or to_regprocedure('app_partner_assign(uuid,uuid,uuid,boolean)') is not null
     or to_regprocedure('app_partner_remove_member(uuid,uuid)') is not null or to_regprocedure('app_partner_create_shop(uuid,text,text,text,integer,integer,integer,integer)') is not null then
    raise exception 'FAIL: an old partner signature survives'; end if;
end $$;
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000090');
select proof.check('aaaaaaaa-0000-0000-0000-000000000032');
do $$ declare Q uuid := 'aaaaaaaa-0000-0000-0000-000000000090'; M uuid := 'aaaaaaaa-0000-0000-0000-000000000091'; Z uuid := 'aaaaaaaa-0000-0000-0000-000000000032';
  t uuid; inv uuid; acc jsonb; r jsonb; e text;
  code text := encode(sha256(convert_to('partner-enrol:482913', 'UTF8')), 'hex'); wrong text := encode(sha256(convert_to('partner-enrol:000000', 'UTF8')), 'hex');
  ch text := 'proofaddchallenge' || md5('add-m') || md5('add-m2');
begin
  t := app_partner_create_shop(Q, proof.sess(Q), proof.h(Q), 'Kiln A', 'proof-kiln-a', '411001', 2000, 24, 90, 10);
  begin perform app_partner_create_shop(Q, proof.sess(Q), 'not-a-check', 'Kiln B', 'proof-kiln-b', '411001', 2000, 24, 90, 10); raise exception 'FAIL: a workspace write without a check';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
  inv := app_partner_invite(Q, proof.sess(Q), proof.h(Q), 'm@kiln.test', 'lead', array[t]);
  perform app_partner_accept(M, inv);
  -- no passkey yet: no store, the store held; a confirm has nothing to use
  acc := app_access_for(M, proof.sess(M), null, null);
  if jsonb_array_length(acc->'memberships') <> 0 or jsonb_array_length(acc->'partnerHeld') <> 1 then raise exception 'FAIL: a lead with no passkey (%)', acc; end if;
  if (app_partner_pk_state(M, proof.sess(M))->>'passkeys')::int <> 0 then raise exception 'FAIL: state'; end if;
  begin perform app_partner_pk_challenge(M, proof.sess(M), 'confirm', null, ch); raise exception 'FAIL: a confirm with no passkey';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_passkey' then raise; end if; end;
  -- the request and who may approve it
  -- declined: the lead's gate says so, approving the declined request does nothing, a new request starts again
  r := app_partner_pk_request(M, proof.sess(M), code, E'Chrome on Android\x07' || repeat('x', 80), 'Pune');
  if (select (x.request->>'device') from app_partner_team(Q, proof.sess(Q), proof.h(Q)) x where x.email = 'm@kiln.test') <> 'Chrome on Android' || repeat('x', 43)
     or (select (x.request->>'city') from app_partner_team(Q, proof.sess(Q), proof.h(Q)) x where x.email = 'm@kiln.test') <> 'Pune' then raise exception 'FAIL: request context not cleaned and capped'; end if;
  begin perform app_partner_pk_decline(M, proof.sess(M), null, (select member_id from app_my_partner(M))); raise exception 'FAIL: a lead declined';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_pk_decline(Z, proof.sess(Z), proof.h(Z), (select member_id from app_my_partner(M))); raise exception 'FAIL: another partner''s owner declined';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_person' then raise; end if; end;
  begin perform app_partner_pk_decline(Q, proof.sess(Q), null, (select member_id from app_my_partner(M))); raise exception 'FAIL: declined without a check';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
  perform app_partner_pk_decline(Q, proof.sess(Q), proof.h(Q), (select member_id from app_my_partner(M)));
  if (app_partner_pk_state(M, proof.sess(M))->'request'->>'declined')::boolean is not true then raise exception 'FAIL: the lead is not told it was declined'; end if;
  if (select x.request from app_partner_team(Q, proof.sess(Q), proof.h(Q)) x where x.email = 'm@kiln.test') is not null then raise exception 'FAIL: a declined request still shows Approve'; end if;
  if app_partner_pk_approve(Q, proof.sess(Q), proof.h(Q), (select member_id from app_my_partner(M)), code) is not null then raise exception 'FAIL: a declined request was approved'; end if;
  begin perform app_partner_pk_decline(Q, proof.sess(Q), proof.h(Q), (select member_id from app_my_partner(M))); raise exception 'FAIL: declined twice';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_request' then raise; end if; end;
  r := app_partner_pk_request(M, proof.sess(M), code, null, null);
  if r->>'opensAt' is not null then raise exception 'FAIL: a lead''s request waits'; end if;
  if (app_partner_pk_state(M, proof.sess(M))->'request'->>'declined')::boolean then raise exception 'FAIL: a new request still reads declined'; end if;
  begin perform app_partner_pk_approve(M, proof.sess(M), null, M, code); raise exception 'FAIL: a lead approved';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_pk_approve(Z, proof.sess(Z), proof.h(Z), (select member_id from app_my_partner(M)), code); raise exception 'FAIL: another partner''s owner approved Kiln''s lead';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_person' then raise; end if; end;
  if app_partner_pk_approve(Q, proof.sess(Q), proof.h(Q), (select member_id from app_my_partner(M)), wrong) is not null then raise exception 'FAIL: a wrong code approved'; end if;
  e := app_partner_pk_approve(Q, proof.sess(Q), proof.h(Q), (select member_id from app_my_partner(M)), code);
  if e is distinct from 'm@kiln.test' then raise exception 'FAIL: the owner approved (%)', e; end if;
  -- the approved request adds ONE passkey on that session, once
  perform app_partner_pk_challenge(M, proof.sess(M), 'add', null, ch);
  if app_partner_pk_take_challenge(M, proof.sess(M), 'add', ch, '') is null then raise exception 'FAIL: take add'; end if;
  perform app_partner_pk_add(M, proof.sess(M), null, 'cred-m-1', 'pk', 0, array['internal'], 'Riya''s phone');
  begin perform app_partner_pk_challenge(M, proof.sess(M), 'add', null, ch || 'x'); raise exception 'FAIL: the request added twice';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_allowed' then raise; end if; end;
  begin perform app_partner_pk_challenge(M, gen_random_uuid(), 'add', null, ch || 'y'); raise exception 'FAIL: another session used the approval';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_allowed' then raise; end if; end;
  -- another person's credential never comes back
  perform app_partner_pk_challenge(M, proof.sess(M), 'confirm', null, ch || 'c');
  if app_partner_pk_take_challenge(M, proof.sess(M), 'confirm', ch || 'c', (app_partner_pk_credentials(Q)->0->>'id')) is not null then raise exception 'FAIL: another person''s key'; end if;
  perform set_config('proof.t79', t::text, false);
end $$;
commit;
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000091');
do $$ declare Q uuid := 'aaaaaaaa-0000-0000-0000-000000000090'; M uuid := 'aaaaaaaa-0000-0000-0000-000000000091'; l jsonb; acc jsonb; k text; begin
  l := app_partner_pk_list(M, proof.sess(M), proof.h(M));
  if jsonb_array_length(l) <> 1 then raise exception 'FAIL: list'; end if;
  foreach k in array array['publicKey','credentialId','counter','public_key','credential_id'] loop
    if l->0 ? k then raise exception 'FAIL: the list carries %', k; end if;
  end loop;
  acc := app_access_for(M, proof.sess(M), null, proof.h(M));
  if jsonb_array_length(acc->'memberships') <> 1 or acc->>'partnerConfirmedAt' is null then raise exception 'FAIL: the lead''s store after the check (%)', acc; end if;
  -- the hash counts only in its own place, for its own person and session
  if jsonb_array_length(app_access_for(M, proof.sess(M), proof.h(M), null)->'memberships') <> 0 or app_access_for(M, proof.sess(M), proof.h(M), null)->>'staffConfirmedAt' is not null then raise exception 'FAIL: a partner hash as a staff hash'; end if;
  if jsonb_array_length(app_access_for(M, gen_random_uuid(), null, proof.h(M))->'memberships') <> 0 then raise exception 'FAIL: another session'; end if;
  if exists (select 1 from jsonb_array_elements(app_access_for(Q, proof.sess(Q), null, proof.h(M))->'memberships') e where (e->>'tenantId')::uuid = current_setting('proof.t79')::uuid) then raise exception 'FAIL: another person''s hash'; end if;
  if jsonb_array_length(app_access_for('aaaaaaaa-0000-0000-0000-000000000033')->'memberships') < 1 then raise exception 'FAIL: a brand owner needs a partner check'; end if;
  -- sign-out ends the check
  perform app_partner_pk_signout(proof.h(M));
  if jsonb_array_length(app_access_for(M, proof.sess(M), null, proof.h(M))->'memberships') <> 0 then raise exception 'FAIL: signed out but in'; end if;
end $$;
commit;
-- another partner's owner, with a fresh check: never Kiln's store, never Kiln's people or their request context
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000032');
do $$ declare Z uuid := 'aaaaaaaa-0000-0000-0000-000000000032'; begin
  begin perform app_handover_invite(current_setting('proof.t79')::uuid, Z, 'brand@kiln.test', proof.sess(Z), proof.h(Z)); raise exception 'FAIL: another partner handed over Kiln''s store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  if exists (select 1 from app_partner_team(Z, proof.sess(Z), proof.h(Z)) x where x.email like '%@kiln.test') then raise exception 'FAIL: another partner sees Kiln''s team'; end if;
end $$;
commit;
-- hand over and approvals want a check in the last 5 minutes
update partner_stepups set created_at = now() - interval '6 minutes' where user_id = 'aaaaaaaa-0000-0000-0000-000000000090';
begin; set local role frata_app;
do $$ declare Q uuid := 'aaaaaaaa-0000-0000-0000-000000000090'; begin
  begin perform app_handover_invite(current_setting('proof.t79')::uuid, Q, 'brand@kiln.test', proof.sess(Q), proof.h(Q)); raise exception 'FAIL: a stale check handed over';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_again' then raise; end if; end;
  begin perform app_partner_remove_member(Q, proof.sess(Q), proof.h(Q), (select member_id from app_partner_team(Q, proof.sess(Q), proof.h(Q)) where email = 'm@kiln.test')); raise exception 'FAIL: a stale check removed someone';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_again' then raise; end if; end;
end $$;
commit;
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000090');
do $$ declare Q uuid := 'aaaaaaaa-0000-0000-0000-000000000090'; mm uuid; r jsonb; begin
  select member_id into mm from app_partner_team(Q, proof.sess(Q), proof.h(Q)) where email = 'm@kiln.test';
  perform set_config('proof.m79', mm::text, false);
  perform app_partner_remove_member(Q, proof.sess(Q), proof.h(Q), mm);
  -- the owner's own recovery through Frrata waits 24 hours (the owner has a passkey)
  r := app_partner_pk_request(Q, proof.sess(Q), encode(sha256(convert_to('partner-enrol:111222', 'UTF8')), 'hex'), 'Safari on iPhone', null);
  if r->>'opensAt' is null then raise exception 'FAIL: an owner''s recovery does not wait'; end if;
end $$;
commit;
do $$ begin
  if exists (select 1 from partner_passkeys where partner_member_id = current_setting('proof.m79')::uuid) or exists (select 1 from partner_stepups where partner_member_id = current_setting('proof.m79')::uuid)
     or exists (select 1 from partner_passkey_requests where partner_member_id = current_setting('proof.m79')::uuid) or exists (select 1 from partner_webauthn_challenges where partner_member_id = current_setting('proof.m79')::uuid) then
    raise exception 'FAIL: removal left passkey rows'; end if;
  if not exists (select 1 from staff_notices where kind = 'partner_request_made' and to_email = 'admin2@frata.test') then raise exception 'FAIL: admins not told of an owner''s request'; end if;
end $$;
begin; set local role frata_admin;
do $$ declare S uuid := 'aaaaaaaa-0000-0000-0000-000000000035'; p uuid; st jsonb; begin
  select id into p from partners where user_id = 'aaaaaaaa-0000-0000-0000-000000000090';
  st := admin_partner_pk_state(S, proof.sess(S), 'proof-staff-hash-035', p);
  if st->'request'->>'opensAt' is null or st ? 'codeHash' or st->'request' ? 'code_hash' or st->>'phone' is null then raise exception 'FAIL: admin state (%)', st; end if;
  begin perform admin_partner_pk_approve('aaaaaaaa-0000-0000-0000-000000000036', proof.sess(S), 'proof-staff-hash-035', p, encode(sha256(convert_to('partner-enrol:111222', 'UTF8')), 'hex')); raise exception 'FAIL: support approved';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_admin' then raise; end if; end;
  if admin_partner_pk_approve(S, proof.sess(S), 'proof-staff-hash-035', p, encode(sha256(convert_to('partner-enrol:111222', 'UTF8')), 'hex')) is not null then raise exception 'FAIL: approved before the wait'; end if;
  -- a lost device: support can't delete an owner's passkeys; an admin can, and the owner's rows all go
  begin perform admin_partner_pk_remove_all('aaaaaaaa-0000-0000-0000-000000000036', proof.sess(S), 'proof-staff-hash-035', p); raise exception 'FAIL: support deleted an owner''s passkeys';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_admin' then raise; end if; end;
  if admin_partner_pk_remove_all(S, proof.sess(S), 'proof-staff-hash-035', p) < 1 then raise exception 'FAIL: the owner had a passkey to delete'; end if;
  if (admin_partner_pk_state(S, proof.sess(S), 'proof-staff-hash-035', p)->>'passkeys')::int <> 0 or admin_partner_pk_state(S, proof.sess(S), 'proof-staff-hash-035', p)->'request' <> 'null'::jsonb then raise exception 'FAIL: the owner''s passkeys or request stayed'; end if;
end $$;
commit;
-- an owner who ever had a passkey still waits 24 hours after Admin deleted every one (security review M1)
begin; set local role frata_app;
do $$ declare Q uuid := 'aaaaaaaa-0000-0000-0000-000000000090'; r jsonb; begin
  r := app_partner_pk_request(Q, proof.sess(Q), encode(sha256(convert_to('partner-enrol:333444', 'UTF8')), 'hex'), null, null);
  if r->>'opensAt' is null then raise exception 'FAIL: deleting every passkey skipped the owner''s 24-hour wait'; end if;
end $$;
commit;
do $$ begin
  if exists (select 1 from partner_passkey_requests where approved_at is not null and (device is not null or city is not null)) then raise exception 'FAIL: a decided request kept its device or city'; end if;
end $$;
-- 82. Builders T1c (0130–0131; plan docs/plans/2026-11-15-t1c-builders.md, reviews folded in). G owns partner Nook with
-- stores n1 and n2; D is a Builder on n1 only; Z owns another partner (§ 77). frata_builder reads named catalogue columns
-- of its shop and nothing else; members.role follows partner_members.role; Builders never get a notice, an owner's email
-- or the partner's terms.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000092', 'g@nook.test', now()), ('aaaaaaaa-0000-0000-0000-000000000093', 'd@nook.test', now());
begin; set local role frata_app;
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000092', 'Gita', 'Nook', '919845012360', 'Pune', '{}', '', '1-4', 1);
commit;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000092';
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000092');
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; D uuid := 'aaaaaaaa-0000-0000-0000-000000000093'; Z uuid := 'aaaaaaaa-0000-0000-0000-000000000032';
  n1 uuid; n2 uuid; inv uuid; me uuid; c record;
begin
  n1 := app_partner_create_shop(G, proof.sess(G), proof.h(G), 'Nook One', 'proof-nook-1', '411001', 2000, 24, 90, 10);
  n2 := app_partner_create_shop(G, proof.sess(G), proof.h(G), 'Nook Two', 'proof-nook-2', '411001', 2000, 24, 90, 10);
  begin perform app_partner_invite(G, proof.sess(G), proof.h(G), 'd@nook.test', 'owner', array[n1]); raise exception 'FAIL: an invite made an owner';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_role' then raise; end if; end;
  inv := app_partner_invite(G, proof.sess(G), proof.h(G), 'd@nook.test', 'builder', array[n1]);
  if (app_partner_accept(D, inv)->>'role') <> 'builder' then raise exception 'FAIL: accept did not say builder'; end if;
  perform proof.check(D);
  me := (select member_id from app_my_partner(D));
  if me is null or (select member_role from app_my_partner(D)) <> 'builder' then raise exception 'FAIL: a Builder has no partner record'; end if;
  -- access: the Builder's row is 'builder', in n1 only
  if (select e->>'role' from jsonb_array_elements(app_access_for(D, proof.sess(D), null, proof.h(D))->'memberships') e where (e->>'tenantId')::uuid = n1) <> 'builder'
     or exists (select 1 from jsonb_array_elements(app_access_for(D, proof.sess(D), null, proof.h(D))->'memberships') e where (e->>'tenantId')::uuid = n2)
  then raise exception 'FAIL: a Builder''s access'; end if;
  -- clients: assigned only, no owner email, invite, plan or terms; has_owner says the stage
  select * into c from app_partner_clients(D, proof.sess(D), proof.h(D)) x;
  if (select count(*) from app_partner_clients(D, proof.sess(D), proof.h(D))) <> 1 or c.tenant_id <> n1 or c.owner_email is not null or c.invite_email is not null
     or c.plan_name is not null or c.share_months is not null or c.notice_days is not null or c.has_owner is not false
  then raise exception 'FAIL: a Builder''s clients (%)', c; end if;
  -- owner question 6: a Lead gets no owner contact details either; the owner still does
  if exists (select 1 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.share_months is null) then raise exception 'FAIL: the owner lost the terms'; end if;
  -- a Builder makes no store, hands over nothing, runs no team
  begin perform app_partner_create_shop(D, proof.sess(D), proof.h(D), 'Nook X', 'proof-nook-x', '411001', 2000, 24, 90, 10); raise exception 'FAIL: a Builder made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  begin perform app_handover_invite(n1, D, 'brand@nook.test', proof.sess(D), proof.h(D)); raise exception 'FAIL: a Builder handed over';
  exception when sqlstate 'P0001' then null; end;
  begin perform app_partner_set_role(D, proof.sess(D), proof.h(D), me, 'lead'); raise exception 'FAIL: a Builder changed its own role';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_set_role(Z, proof.sess(Z), proof.h(Z), me, 'lead'); raise exception 'FAIL: another partner changed a role';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_person' then raise; end if; end;
  begin perform app_partner_set_role(G, proof.sess(G), proof.h(G), me, 'owner'); raise exception 'FAIL: a role of owner';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_role' then raise; end if; end;
  begin perform app_partner_set_role(G, proof.sess(G), proof.h(G), (select member_id from app_my_partner(G)), 'lead'); raise exception 'FAIL: the owner demoted';
  exception when sqlstate 'P0001' then if sqlerrm <> 'no_person' then raise; end if; end;
  begin perform app_partner_set_role(G, proof.sess(G), null, me, 'lead'); raise exception 'FAIL: set role without a check';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
  -- Lead and back: the store row follows, every time
  perform app_partner_set_role(G, proof.sess(G), proof.h(G), me, 'lead');
  if (select e->>'role' from jsonb_array_elements(app_access_for(D, proof.sess(D), null, proof.h(D))->'memberships') e where (e->>'tenantId')::uuid = n1) <> 'partner' then raise exception 'FAIL: Lead row'; end if;
  perform app_partner_set_role(G, proof.sess(G), proof.h(G), me, 'builder');
  if (select e->>'role' from jsonb_array_elements(app_access_for(D, proof.sess(D), null, proof.h(D))->'memberships') e where (e->>'tenantId')::uuid = n1) <> 'builder' then raise exception 'FAIL: Builder row'; end if;
  -- assign n2: the new row is a builder's too
  perform app_partner_assign(G, proof.sess(G), proof.h(G), me, n2, true);
  if (select e->>'role' from jsonb_array_elements(app_access_for(D, proof.sess(D), null, proof.h(D))->'memberships') e where (e->>'tenantId')::uuid = n2) <> 'builder' then raise exception 'FAIL: assign row'; end if;
  perform app_partner_assign(G, proof.sess(G), proof.h(G), me, n2, false);
  -- a Builder's passkeys are the owner's to manage, as a Lead's
  if app_partner_pk_remove_all(G, proof.sess(G), proof.h(G), me) < 1 then raise exception 'FAIL: the owner could not delete a Builder''s passkeys'; end if;
  perform proof.check(D);
  -- the app may not move a role by hand
  begin update members set role = 'partner' where user_id = D; raise exception 'FAIL: frata_app updated members';
  exception when insufficient_privilege then null; end;
  -- notices: never a Builder
  perform set_config('app.tenant_id', n1::text, true);
  if exists (select 1 from app_notice_members() x where x.user_id = D) or app_member_email(D, false) is not null then raise exception 'FAIL: a notice reaches a Builder'; end if;
  perform set_config('proof.nook1', n1::text, false);
  perform set_config('proof.nook2', n2::text, false);
  perform set_config('proof.nookd', D::text, false);
end $$;
commit;
-- a stray write as the table owner still cannot leave a Builder on 'partner' (the trigger derives it)
update members set role = 'partner' where user_id = 'aaaaaaaa-0000-0000-0000-000000000093';
do $$ begin
  if exists (select 1 from members where user_id = 'aaaaaaaa-0000-0000-0000-000000000093' and role <> 'builder') then raise exception 'FAIL: a Builder row on partner'; end if;
  if exists (select 1 from members m join partner_members pm on pm.id = m.partner_member_id
              where m.role <> case when pm.role = 'builder' then 'builder' else 'partner' end) then raise exception 'FAIL: a members row disagrees with its person'; end if;
end $$;
-- catalogue in both stores, with a cost
insert into products (id, tenant_id, handle, title, status) values
  ('eeeeeeee-0000-0000-0000-0000000000c1', current_setting('proof.nook1')::uuid, 'nook-kurta', 'Nook kurta', 'active'),
  ('eeeeeeee-0000-0000-0000-0000000000c2', current_setting('proof.nook2')::uuid, 'nook-saree', 'Nook saree', 'active');
insert into variants (tenant_id, product_id, option_values, price, unit_cost) values
  (current_setting('proof.nook1')::uuid, 'eeeeeeee-0000-0000-0000-0000000000c1', '{M}', 249000, 98000),
  (current_setting('proof.nook2')::uuid, 'eeeeeeee-0000-0000-0000-0000000000c2', '{M}', 349000, 128000);
insert into collections (id, tenant_id, handle, title, kind, rules, match_all) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', current_setting('proof.nook1')::uuid, 'nook-picks', 'Nook picks', 'manual', '[]', 1),
  ('eeeeeeee-0000-0000-0000-0000000000d2', current_setting('proof.nook1')::uuid, 'nook-all', 'Nook all', 'auto', '[{"field":"price_at_least","value":1}]', 1);
insert into collection_products (tenant_id, collection_id, product_id) values
  (current_setting('proof.nook1')::uuid, 'eeeeeeee-0000-0000-0000-0000000000d1', 'eeeeeeee-0000-0000-0000-0000000000c1');
-- as frata_builder: its shop's named columns, nothing else
begin; set local role frata_builder;
select set_config('app.tenant_id', current_setting('proof.nook1'), true), set_config('app.member_role', 'builder', true);
do $$ declare n int; begin
  select count(*) into n from products; if n <> 1 then raise exception 'FAIL: a Builder read % products', n; end if;
  select count(*) into n from variants where price = 249000; if n <> 1 then raise exception 'FAIL: a Builder read no price'; end if;
  begin perform unit_cost from variants; raise exception 'FAIL: a Builder read a cost'; exception when insufficient_privilege then null; end;
  begin perform 1 from variants where unit_cost > 0; raise exception 'FAIL: a Builder filtered on a cost'; exception when insufficient_privilege then null; end;
  begin perform hsn from products; raise exception 'FAIL: a Builder read HSN'; exception when insufficient_privilege then null; end;
  begin perform 1 from orders; raise exception 'FAIL: a Builder read orders'; exception when insufficient_privilege then null; end;
  begin perform 1 from order_lines; raise exception 'FAIL: a Builder read order lines'; exception when insufficient_privilege then null; end;
  -- P1·2 (0155): the store's logo (shop_settings.logo_url) for the brand preview (§ 98); everything else stays shut.
  begin perform legal_name, gstin, support_phone from shop_settings; raise exception 'FAIL: a Builder read settings'; exception when insufficient_privilege then null; end;
  begin perform 1 from members; raise exception 'FAIL: a Builder read members'; exception when insufficient_privilege then null; end;
  begin perform 1 from discounts; raise exception 'FAIL: a Builder read offers'; exception when insufficient_privilege then null; end;
  begin insert into products (tenant_id, handle, title) values (current_setting('proof.nook1')::uuid, 'b', 'B'); raise exception 'FAIL: a Builder wrote';
  exception when insufficient_privilege then null; end;
  begin update products set title = 'x'; raise exception 'FAIL: a Builder updated'; exception when insufficient_privilege then null; end;
  begin perform app_access_for(current_setting('proof.nookd')::uuid, null, null, null); raise exception 'FAIL: a Builder ran a definer';
  exception when insufficient_privilege then null; end;
end $$;
commit;
-- the role without its setting reads nothing (ADR-0015 § 3: an unset role refuses)
begin; set local role frata_builder;
select set_config('app.tenant_id', current_setting('proof.nook1'), true);
do $$ begin if exists (select 1 from products) then raise exception 'FAIL: frata_builder read without app.member_role'; end if; end $$;
commit;
-- the owner's and the store's reads are untouched by the Builder's policies
begin; set local role frata_app;
select set_config('app.tenant_id', current_setting('proof.nook1'), true);
do $$ begin if (select count(*) from products) <> 1 or (select unit_cost from variants limit 1) <> 98000 then raise exception 'FAIL: frata_app lost its catalogue'; end if; end $$;
commit;
-- generic: frata_builder's whole reach is the allow-list (security M3, tenancy audit)
do $$ declare r record; allowed jsonb := '{
  "products": ["id","tenant_id","title","handle","status","publish_at","published_at","updated_at","type_id","options","option_values","tags","taxonomy_category"],
  "product_types": ["id","tenant_id","name"],
  "variants": ["id","tenant_id","product_id","archived_at","stock","price","when_out","ships_by","lead_min_days","lead_max_days","preorder_cap","sku"],
  "product_colours": ["tenant_id","product_id","hex","value","family"],
  "product_images": ["tenant_id","product_id","base","widths","position"],
  "collections": ["id","tenant_id","title","handle","kind","rules","match_all"],
  "collection_products": ["tenant_id","collection_id","product_id"],
  "product_attributes": ["tenant_id","product_id","attribute","values"],
  "brand_tokens": ["tenant_id","logo_mark_url","logo_stacked_url","logo_reversed_url","color_bg","color_panel","color_text","color_muted","color_accent","color_on","color_edge","color_line","color_good","color_warn","color_bad","font_display","font_body","radius","density"],
  "checkout_design": ["tenant_id","header","back_link","policy_rows","trust","heading","thanks"],
  "shop_settings": ["tenant_id","logo_url","dispatch_days","metro_days","rest_days","return_kind","return_days","cod_on","cod_max"]}'; begin
  for r in select c.oid as rel, n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r','v','m','p','f') and n.nspname not in ('pg_catalog','information_schema') loop
    if has_table_privilege('frata_builder', r.rel, 'insert') or has_table_privilege('frata_builder', r.rel, 'update')
       or has_table_privilege('frata_builder', r.rel, 'delete') or has_table_privilege('frata_builder', r.rel, 'truncate')
       or has_table_privilege('frata_builder', r.rel, 'select') then raise exception 'FAIL: frata_builder holds a table privilege on %.%', r.nspname, r.relname; end if;
  end loop;
  for r in select n.nspname, c.relname, a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where a.attnum > 0 and not a.attisdropped and c.relkind in ('r','v','m','p','f') and n.nspname not in ('pg_catalog','information_schema')
              and has_column_privilege('frata_builder', c.oid, a.attnum, 'select') loop
    if r.nspname <> 'public' or not coalesce((allowed->r.relname) ? r.attname, false) then raise exception 'FAIL: frata_builder may read %.%.%', r.nspname, r.relname, r.attname; end if;
  end loop;
  for r in select n.nspname, c.relname, a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where a.attnum > 0 and not a.attisdropped and n.nspname not in ('pg_catalog','information_schema')
              and (has_column_privilege('frata_builder', c.oid, a.attnum, 'insert') or has_column_privilege('frata_builder', c.oid, a.attnum, 'update')) loop
    raise exception 'FAIL: frata_builder may write %.%.%', r.nspname, r.relname, r.attname;
  end loop;
  for r in select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where p.prosecdef and n.nspname <> 'proof' and has_function_privilege('frata_builder', p.oid, 'execute') loop
    raise exception 'FAIL: frata_builder may run the definer %.%', r.nspname, r.proname;
  end loop;
  if has_schema_privilege('frata_builder', 'public', 'create') then raise exception 'FAIL: frata_builder may create in public'; end if;
  if exists (select 1 from pg_class c where c.relkind = 'S' and (has_sequence_privilege('frata_builder', c.oid, 'usage') or has_sequence_privilege('frata_builder', c.oid, 'select')))
  then raise exception 'FAIL: frata_builder holds a sequence'; end if;
  if (select rolsuper or rolbypassrls or rolinherit or rolcreaterole or rolcreatedb from pg_roles where rolname = 'frata_builder')
  then raise exception 'FAIL: frata_builder has a power it must not'; end if;
  if exists (select 1 from pg_auth_members m join pg_roles ro on ro.oid = m.member where ro.rolname = 'frata_builder')
     -- the role's creator may hold ADMIN on it (Supabase, PG16+: a non-superuser postgres that ran create role); nobody else
     or exists (select 1 from pg_auth_members m join pg_roles ro on ro.oid = m.roleid join pg_roles mem on mem.oid = m.member
                 where ro.rolname = 'frata_builder' and not (mem.rolname = 'postgres' and m.admin_option))
  then raise exception 'FAIL: frata_builder is in a role, or a role is in it'; end if;
  if exists (select 1 from pg_policies where 'frata_builder' = any(roles) and policyname not in ('builder_rows','builder_only'))
     or (select count(*) from pg_policies where 'frata_builder' = any(roles)) <> 22
  then raise exception 'FAIL: frata_builder''s policies'; end if;
end $$;
-- Billing rework R2: the system issuer (0139) never issues test invoices, never alongside a staff member, and its
-- audit row has no user (0138).
do $$ begin
  begin perform app_issue_frrata_invoices(date_trunc('month', now()), 0, 0, null, 'X', '29ABCDE1234F1Z5', 'A', '998315', true, 'FRR/', '26-27', true);
    raise exception 'FAIL: a system run issued test invoices';
  exception when check_violation then null; end;
  begin perform app_issue_frrata_invoices(date_trunc('month', now()), 0, 0, '99999999-9999-9999-9999-999999999999', 'X', '29ABCDE1234F1Z5', 'A', '998315', false, 'FRR/', '26-27', true);
    raise exception 'FAIL: a run was both staff and system';
  exception when invalid_parameter_value then null; end;
  begin insert into audit_events (actor_user_id, actor_email, actor_kind, action) values ('99999999-9999-9999-9999-999999999999', null, 'system', 'x');
    raise exception 'FAIL: a system audit row named a user';
  exception when check_violation then null; end;
  begin insert into audit_events (actor_user_id, actor_kind, action) values (null, 'staff', 'x');
    raise exception 'FAIL: a staff audit row had no user';
  exception when check_violation then null; end;
end $$;

-- 85. P2 Clients (0146–0147; plan docs/plans/2026-11-16-p2-clients.md, reviews folded in). G owns partner Nook (§ 82)
-- with stores n1 (opened) and n2; D is a Builder on n1; E is a Lead on n1; Y owns partner Yarn. The partner's own bills
-- are definer-only and reach its owner alone; the share's month follows each link's own window; Frrata roles read no
-- bill. Everything here rolls back.
begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000094', 'e@nook.test', now()), ('aaaaaaaa-0000-0000-0000-000000000095', 'y@yarn.test', now());
set local role frata_app;
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000095', 'Yami', 'Yarn', '919845012361', 'Pune', '{}', '', '1-4', 1);
reset role;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000095';
-- n1 opened in January; one issued, paid Frrata invoice for the previous IST month with a partial credit note
update partner_links set share_starts_at = '2026-01-12' where tenant_id = current_setting('proof.nook1')::uuid and removed_at is null;
do $$ declare m timestamptz := (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month') at time zone 'Asia/Kolkata'; f uuid; f2 uuid;
  n1 uuid := current_setting('proof.nook1')::uuid; n2 uuid := current_setting('proof.nook2')::uuid;
begin
  insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, number, issued_at)
    values (n1, m, m + interval '1 month', 2292000, 206280, 206280, 0, 2704560, 'PROOF85-1', now()) returning id into f;
  insert into frrata_payments (tenant_id, invoice_id, method, amount, captured_at) values (n1, f, 'upi', 2468560, now());
  insert into frrata_credit_notes (tenant_id, invoice_id, number, taxable, cgst, sgst, igst, total, reason, issued_by)
    values (n1, f, 'PROOFCN85-1', 200000, 18000, 18000, 0, 236000, 'proof waiver', 'aaaaaaaa-0000-0000-0000-000000000092');
  -- a test-mode invoice never counts; n2 (never opened) has one too
  insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, number, issued_at)
    values (n2, m, m + interval '1 month', 1000000, 90000, 90000, 0, 1180000, 'PROOF85-2', now()) returning id into f2;
  insert into frrata_payments (tenant_id, invoice_id, method, amount, captured_at) values (n2, f2, 'upi', 1180000, now());
  perform set_config('proof.m85', m::text, true);
end $$;
set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000095');
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; D uuid := current_setting('proof.nookd')::uuid; E uuid := 'aaaaaaaa-0000-0000-0000-000000000094';
  Y uuid := 'aaaaaaaa-0000-0000-0000-000000000095'; n1 uuid := current_setting('proof.nook1')::uuid; n2 uuid := current_setting('proof.nook2')::uuid;
  inv uuid; l1 uuid; l2 uuid; b1 uuid; b2 uuid; r record; n int; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform proof.check(G); perform proof.check(D);
  inv := app_partner_invite(G, proof.sess(G), proof.h(G), 'e@nook.test', 'lead', array[n1]);
  perform app_partner_accept(E, inv); perform proof.check(E);
  select x.link_id into l1 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n1;
  select x.link_id into l2 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n2;
  if l1 is null or l2 is null then raise exception 'FAIL: clients carry no link id'; end if;
  -- the share's month: the owner gets n1's, net of the credit note; nothing for n2 (never opened); Lead and Builder nothing
  select * into r from app_partner_client_shares(G, proof.sess(G), proof.h(G)) x where x.link_id = l1;
  if r.link_id is null or r.share_bps <> 2000 or r.net_taxable <> 2092000 or r.total <> 2704560 or r.paid <> 2468560 or r.credited <> 236000 or not r.has_number
  then raise exception 'FAIL: the owner''s share month (%)', r; end if;
  if exists (select 1 from app_partner_client_shares(G, proof.sess(G), proof.h(G)) x where x.link_id = l2) then raise exception 'FAIL: a store never opened gave a share month'; end if;
  if exists (select 1 from app_partner_client_shares(E, proof.sess(E), proof.h(E))) or exists (select 1 from app_partner_client_shares(D, proof.sess(D), proof.h(D)))
  then raise exception 'FAIL: a Lead or a Builder got share figures'; end if;
  -- new client columns: a Lead sees the invite's day and the owner's join; a Builder neither
  if exists (select 1 from app_partner_clients(D, proof.sess(D), proof.h(D)) x where x.owner_since is not null or x.invite_sent_at is not null)
  then raise exception 'FAIL: a Builder got the owner''s join or the invite''s day'; end if;
  -- writes: the owner only, on the owner's own links and bills, with a live check and sane input
  perform app_partner_deal_set(G, proof.sess(G), proof.h(G), l1, 'retainer', 1200000, today + 3);
  b1 := app_partner_bill_add(G, proof.sess(G), proof.h(G), l1, 'November retainer', 'PT-0412', 1200000, today - 11);
  if (select renews_on from app_partner_bill_summary(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n1) <> today + 3 then raise exception 'FAIL: an earlier bill moved the next bill'; end if;
  b2 := app_partner_bill_add(G, proof.sess(G), proof.h(G), l1, 'December retainer', null, 1200000, today + 3);
  if (select renews_on from app_partner_bill_summary(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n1) <> ((today + 3) + interval '1 month')::date then raise exception 'FAIL: the next bill did not move a month on'; end if;
  begin perform app_partner_deal_set(E, proof.sess(E), proof.h(E), l1, 'project', 100000, null); raise exception 'FAIL: a Lead set billing';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_bill_add(D, proof.sess(D), proof.h(D), l1, 'x', null, 100000, today); raise exception 'FAIL: a Builder recorded a bill';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_bill_paid(E, proof.sess(E), proof.h(E), b1, true); raise exception 'FAIL: a Lead marked a bill paid';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_bill_paid(Y, proof.sess(Y), proof.h(Y), b1, true); raise exception 'FAIL: another partner marked a bill paid';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform app_partner_bill_delete(Y, proof.sess(Y), proof.h(Y), b1); raise exception 'FAIL: another partner deleted a bill';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform app_partner_deal_set(Y, proof.sess(Y), proof.h(Y), l1, 'project', 100000, null); raise exception 'FAIL: another partner set billing on a link';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform app_partner_bill_add(Y, proof.sess(Y), proof.h(Y), l1, 'x', null, 100000, today); raise exception 'FAIL: another partner recorded a bill';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform app_partner_client_bills(Y, proof.sess(Y), proof.h(Y), l1); raise exception 'FAIL: another partner read a client''s bills';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform app_partner_client_bills(E, proof.sess(E), proof.h(E), l1); raise exception 'FAIL: a Lead read the bills';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_bill_add(G, proof.sess(G), null, l1, 'x', null, 100000, today); raise exception 'FAIL: a bill without a check';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
  begin perform app_partner_bill_add(G, proof.sess(G), proof.h(G), l1, 'x', null, 50, today); raise exception 'FAIL: a bill under ₹1';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_input' then raise; end if; end;
  begin perform app_partner_bill_add(G, proof.sess(G), proof.h(G), l1, 'x', 'PT 1', 100000, today); raise exception 'FAIL: a bill number with a space';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_input' then raise; end if; end;
  begin perform app_partner_deal_set(G, proof.sess(G), proof.h(G), l1, 'project', 100000, today); raise exception 'FAIL: a project with a next bill';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_input' then raise; end if; end;
  -- reads: the owner's summary (unpaid only) and the page's bills; nothing for a Lead, a Builder or another partner
  if (select jsonb_array_length(open_bills) from app_partner_bill_summary(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n1) <> 2 then raise exception 'FAIL: the summary''s unpaid bills'; end if;
  if exists (select 1 from app_partner_bill_summary(E, proof.sess(E), proof.h(E))) or exists (select 1 from app_partner_bill_summary(D, proof.sess(D), proof.h(D)))
     or exists (select 1 from app_partner_bill_summary(Y, proof.sess(Y), proof.h(Y))) then raise exception 'FAIL: someone else got the summary'; end if;
  perform app_partner_bill_paid(G, proof.sess(G), proof.h(G), b1, true);
  if (select jsonb_array_length(open_bills) from app_partner_bill_summary(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n1) <> 1 then raise exception 'FAIL: mark paid'; end if;
  perform app_partner_bill_paid(G, proof.sess(G), proof.h(G), b1, false);
  if (select paid_at from app_partner_client_bills(G, proof.sess(G), proof.h(G), l1) x where x.id = b1) is not null then raise exception 'FAIL: mark unpaid'; end if;
  perform app_partner_bill_delete(G, proof.sess(G), proof.h(G), b2);
  if (select count(*) from app_partner_client_bills(G, proof.sess(G), proof.h(G), l1)) <> 1 then raise exception 'FAIL: delete'; end if;
  -- the write counter: 60 a person a minute, failing closed
  for n in 1..60 loop perform app_partner_bill_try(G, proof.sess(G), proof.h(G)); end loop;
  begin perform app_partner_bill_try(G, proof.sess(G), proof.h(G)); raise exception 'FAIL: a 61st bill write in a minute';
  exception when sqlstate 'P0001' then if sqlerrm <> 'too_many' then raise; end if; end;
  -- a lapsed check is refused
  perform set_config('proof.l185', l1::text, true);
end $$;
reset role;
update partner_stepups set expires_at = now() - interval '1 second' where user_id = 'aaaaaaaa-0000-0000-0000-000000000092';
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; begin
  begin perform app_partner_bill_add(G, proof.sess(G), proof.h(G), current_setting('proof.l185')::uuid, 'x', null, 100000, current_date); raise exception 'FAIL: a lapsed check wrote a bill';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
end $$;
-- the app reads no bill table, nor does Frrata Admin or a Builder's login
do $$ begin
  begin perform 1 from partner_client_bills; raise exception 'FAIL: frata_app read partner_client_bills'; exception when insufficient_privilege then null; end;
  begin perform 1 from partner_client_deals; raise exception 'FAIL: frata_app read partner_client_deals'; exception when insufficient_privilege then null; end;
  begin perform 1 from partner_bill_tries; raise exception 'FAIL: frata_app read partner_bill_tries'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- relinked: n2 opened under Nook and left it long ago (its notice ran out before last month); now Yarn's. Nook gets no
-- month for n2, Yarn gets it on its own link.
do $$ declare m timestamptz := current_setting('proof.m85')::timestamptz; yp uuid := (select partner_id from partner_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000095' and role = 'owner');
  n2 uuid := current_setting('proof.nook2')::uuid; begin
  update partner_links set share_starts_at = m - interval '300 days', removed_at = m - interval '200 days' where tenant_id = n2 and removed_at is null;
  insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days, share_starts_at) values (n2, yp, 1500, 24, 90, m - interval '100 days');
end $$;
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; Y uuid := 'aaaaaaaa-0000-0000-0000-000000000095'; r record; begin
  perform proof.check(G);
  if (select count(*) from app_partner_client_shares(G, proof.sess(G), proof.h(G)) x where x.net_taxable = 1000000) <> 0 then raise exception 'FAIL: a store''s old partner saw its new partner''s month'; end if;
  select * into r from app_partner_client_shares(Y, proof.sess(Y), proof.h(Y)) x;
  if r.link_id is null or r.share_bps <> 1500 or r.net_taxable <> 1000000 then raise exception 'FAIL: the new partner''s month on its own terms (%)', r; end if;
  if exists (select 1 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.removed_at is not null and (x.owner_since is not null or x.invite_sent_at is not null))
  then raise exception 'FAIL: a removed link still gives the owner''s join'; end if;
end $$;
reset role;
-- a suspended partner and a removed owner are refused
update partners set suspended_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000095';
set local role frata_app;
do $$ declare Y uuid := 'aaaaaaaa-0000-0000-0000-000000000095'; begin
  begin perform app_partner_bill_try(Y, proof.sess(Y), proof.h(Y)); raise exception 'FAIL: a suspended partner wrote';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  if exists (select 1 from app_partner_client_shares(Y, proof.sess(Y), proof.h(Y))) then raise exception 'FAIL: a suspended partner read its share'; end if;
end $$;
reset role;
update partner_members set removed_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000092';
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; begin
  begin perform app_partner_bill_paid(G, proof.sess(G), 'x', gen_random_uuid(), true); raise exception 'FAIL: a removed owner wrote';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
end $$;
reset role;
rollback;
begin;
do $$ declare r text; f text; begin
  foreach f in array array['app_partner_clients(uuid, uuid, text)', 'app_partner_client_shares(uuid, uuid, text)', 'app_partner_bill_summary(uuid, uuid, text)',
    'app_partner_client_bills(uuid, uuid, text, uuid)', 'app_partner_bill_try(uuid, uuid, text)', 'app_partner_deal_set(uuid, uuid, text, uuid, text, bigint, date)',
    'app_partner_bill_add(uuid, uuid, text, uuid, text, text, bigint, date)', 'app_partner_bill_paid(uuid, uuid, text, uuid, boolean)',
    'app_partner_bill_delete(uuid, uuid, text, uuid)', 'app_partner_bill_owner(uuid, uuid, text, uuid)', 'admin_partner_bill_stats()'] loop
    foreach r in array array['anon', 'authenticated', 'service_role', 'frata_builder'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL: % can run %', r, f; end if;
    end loop;
    if f like 'app_%' and has_function_privilege('frata_admin', f, 'execute') then raise exception 'FAIL: frata_admin can run %', f; end if;
  end loop;
  if has_function_privilege('frata_app', 'app_partner_bill_owner(uuid, uuid, text, uuid)', 'execute') then raise exception 'FAIL: frata_app can run app_partner_bill_owner'; end if;
  if has_function_privilege('frata_app', 'admin_partner_bill_stats()', 'execute') then raise exception 'FAIL: frata_app can run admin_partner_bill_stats'; end if;
  if not has_function_privilege('frata_admin', 'admin_partner_bill_stats()', 'execute') then raise exception 'FAIL: frata_admin cannot count bills'; end if;
  foreach r in array array['frata_app', 'frata_admin', 'frata_builder', 'anon', 'authenticated', 'service_role'] loop
    foreach f in array array['partner_client_bills', 'partner_client_deals', 'partner_bill_tries'] loop
      if has_table_privilege(r, f, 'select') or has_table_privilege(r, f, 'insert') or has_table_privilege(r, f, 'update')
         or has_table_privilege(r, f, 'delete') or has_table_privilege(r, f, 'truncate') then raise exception 'FAIL: % reaches %', r, f; end if;
    end loop;
  end loop;
end $$;
rollback;

-- § 89 · Studio credits (C1, 0163–0164; plan docs/plans/2026-11-22-c1-credits.md with its five reviews of 2026-11-22). G owns
-- partner Nook (§ 82) with stores n1 and n2; D is a Builder on n1; E a Lead on n1; Y owns partner Yarn. Credits, purchases,
-- invoices and budgets reach their own partner's owner alone (a Lead its assigned clients' budgets, a Builder a client's used
-- and budget in Studio's panel); a payment buys only its own attempt, once, at its exact amount; a draw can't name another
-- partner's lot; no Frrata role reads a row. Everything here rolls back.
begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000189', 'e89@nook.test', now()), ('aaaaaaaa-0000-0000-0000-000000000190', 'y89@yarn.test', now());
set local role frata_app;
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000190', 'Yami', 'Yarn', '919845012389', 'Pune', '{}', '', '1-4', 1);
reset role;
-- the rate: typed by Frrata staff in Admin (frata_admin), never the app
set local role frata_admin;
select app_fx_rate_set((now() at time zone 'Asia/Kolkata')::date, 940000);
reset role;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000190';
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; D uuid := current_setting('proof.nookd')::uuid; E uuid := 'aaaaaaaa-0000-0000-0000-000000000189';
  Y uuid := 'aaaaaaaa-0000-0000-0000-000000000190'; n1 uuid := current_setting('proof.nook1')::uuid; inv uuid; l1 uuid; l2 uuid; ly uuid;
  b record; p record; py record; u record; u2 uuid; n int; t text; j jsonb; seat record; v_inv uuid; v_bal int;
begin
  perform proof.check(G); perform proof.check(D); perform proof.check(Y);
  inv := app_partner_invite(G, proof.sess(G), proof.h(G), 'e89@nook.test', 'lead', array[n1]);
  perform app_partner_accept(E, inv); perform proof.check(E);
  select x.link_id into l1 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.tenant_id = n1;
  select x.link_id into l2 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.tenant_id <> n1 limit 1;
  -- no Frrata role reads the ledger
  begin perform 1 from partner_credit_entries; raise exception 'FAIL: app reads the ledger'; exception when insufficient_privilege then null; end;
  begin insert into partner_credit_entries (partner_id, kind, credits, expires_at) values (gen_random_uuid(), 'grant', 20, now()); raise exception 'FAIL: app wrote a lot';
  exception when insufficient_privilege then null; end;
  -- the free 20 at approval, once each (Y approved above; Nook approved in § 82)
  if (app_partner_credits_overview(Y, proof.sess(Y), proof.h(Y), true)->>'balance')::int <> 20 then raise exception 'FAIL: Y has no free 20'; end if;
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), true)->>'balance')::int <> 20 then raise exception 'FAIL: G has no free 20'; end if;
  -- reads: the owner only; a Lead or Builder is refused; a wrong check is refused
  foreach t in array array['lead', 'builder'] loop
    begin perform app_partner_credits_overview(case t when 'lead' then E else D end, proof.sess(case t when 'lead' then E else D end), proof.h(case t when 'lead' then E else D end), false);
      raise exception 'FAIL: a % read the overview', t;
    exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
    begin perform app_partner_credits_payments(case t when 'lead' then E else D end, proof.sess(case t when 'lead' then E else D end), proof.h(case t when 'lead' then E else D end));
      raise exception 'FAIL: a % read payments', t;
    exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
    begin perform app_partner_credits_usage(case t when 'lead' then E else D end, proof.sess(case t when 'lead' then E else D end), proof.h(case t when 'lead' then E else D end), current_date, null, 50, null);
      raise exception 'FAIL: a % read usage', t;
    exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  end loop;
  begin perform app_partner_credits_overview(G, proof.sess(G), 'wrong', false); raise exception 'FAIL: a wrong check read the overview';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
  -- no purchase before invoice details (architecture M10)
  begin perform app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
    raise exception 'FAIL: bought before invoice details';
  exception when sqlstate 'P0001' then if sqlerrm <> 'details_first' then raise; end if; end;
  -- billing details: the owner's; a second partner with the same PAN loses its free credits (owner 2026-11-22), but only
  -- once that PAN has been invoiced for real (security review 2026-11-23: typing another's GSTIN first voids nothing)
  perform app_partner_set_billing(G, proof.sess(G), proof.h(G), 'Nook Studio LLP', '27AAACP1234R1Z5', null, '12 Hill Road, Mumbai', 'bills@nook.test');
  begin perform app_partner_set_billing(E, proof.sess(E), proof.h(E), 'x', null, '27', 'x', null); raise exception 'FAIL: a Lead set billing details';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_set_billing(G, proof.sess(G), proof.h(G), 'x', '27AAACP1234R1Z', null, 'x', null); raise exception 'FAIL: a malformed GSTIN saved';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_gstin' then raise; end if; end;
  perform app_partner_set_billing(Y, proof.sess(Y), proof.h(Y), 'Yarn', '29AAACP1234R1Z1', null, 'Bengaluru', null);
  if (app_partner_credits_overview(Y, proof.sess(Y), proof.h(Y), true)->>'balance')::int <> 20 then raise exception 'FAIL: a PAN never invoiced voided free credits'; end if;
  -- budgets: the owner sets; a Lead reads its assigned clients only; a Builder none; another partner can't name the link
  perform app_partner_set_budget(G, proof.sess(G), proof.h(G), l1, 30);
  begin perform app_partner_set_budget(E, proof.sess(E), proof.h(E), l1, 300); raise exception 'FAIL: a Lead raised a budget';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  begin perform app_partner_set_budget(Y, proof.sess(Y), proof.h(Y), l1, 300); raise exception 'FAIL: another partner set a budget';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' and sqlerrm <> 'not_found' then raise; end if; end;
  if (select count(*) from app_partner_credits_budgets(E, proof.sess(E), proof.h(E))) <> 1
     or exists (select 1 from app_partner_credits_budgets(E, proof.sess(E), proof.h(E)) x where x.link_id <> l1 or x.new_site_budget is not null)
  then raise exception 'FAIL: a Lead''s budgets'; end if;
  begin perform app_partner_credits_budgets(D, proof.sess(D), proof.h(D)); raise exception 'FAIL: a Builder read budgets';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  -- Studio's panel: a Builder gets its client's used and budget, never the balance; not a store it isn't on
  select * into b from app_partner_credits_panel(D, proof.sess(D), proof.h(D), l1, false);
  if b.role <> 'builder' or b.balance is not null or b.budget <> 30 then raise exception 'FAIL: a Builder''s panel (%)', b; end if;
  if l2 is not null then
    begin perform app_partner_credits_panel(D, proof.sess(D), proof.h(D), l2, false); raise exception 'FAIL: a Builder read an unassigned store''s panel';
    exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  end if;
  -- a purchase: an attempt first; a wrong amount is refunded, the right one buys once; a payment never buys twice
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true,
    'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  begin perform app_partner_credit_buy(E, proof.sess(E), proof.h(E), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
    raise exception 'FAIL: a Lead bought credits';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  if not app_pc_purchase_order(p.id, 'order_proof89g0001', false) then raise exception 'FAIL: order not stored'; end if;
  if app_pc_purchase_order(p.id, 'order_proof89g0002', false) then raise exception 'FAIL: an order replaced'; end if;
  if app_pc_apply('order_proof89g0001', 'pay_proof89g0001', true, 999, 'INR', true, null, null) <> 'refund_due' then raise exception 'FAIL: a wrong amount bought credits'; end if;
  if app_pc_apply('order_proof89g0001', 'pay_proof89g0002', true, 235882, 'INR', false, null, null) = 'applied' then raise exception 'FAIL: live money bought a test attempt'; end if;
  if app_pc_apply('order_proof89g0001', 'pay_proof89g0003', true, 235882, 'INR', true, null, null) <> 'applied' then raise exception 'FAIL: the right payment bought nothing'; end if;
  if app_pc_apply('order_proof89g0001', 'pay_proof89g0003', true, 235882, 'INR', true, null, null) <> 'duplicate' then raise exception 'FAIL: a payment applied twice'; end if;
  if app_pc_apply('order_proof89nope1', 'pay_proof89g0004', true, 235882, 'INR', true, null, null) <> 'unknown' then raise exception 'FAIL: an unknown order applied'; end if;
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> 120 then raise exception 'FAIL: G''s balance after a pack'; end if;
  -- a test lot never pays where money is real (security H1)
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), true)->>'balance')::int <> 20 then raise exception 'FAIL: a test lot counted as real money'; end if;
  select * into py from app_partner_credit_buy(Y, proof.sess(Y), proof.h(Y), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true,
    'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(py.id, 'order_proof89y0001', false);
  if app_pc_apply('order_proof89y0001', 'pay_proof89g0003', true, 235882, 'INR', true, null, null) <> 'duplicate' then raise exception 'FAIL: G''s payment bought Y credits'; end if;
  -- invoices: issued once on the test series; another partner can't read it
  select (x->>'invoice_id')::uuid into v_inv from jsonb_array_elements(app_partner_credits_payments(G, proof.sess(G), proof.h(G))->'purchases') x where x->>'id' = p.id::text;
  if v_inv is null or (select i.number from app_partner_invoice(G, proof.sess(G), proof.h(G), v_inv) i) not like 'FRR/T26-27/%' then raise exception 'FAIL: the invoice'; end if;
  begin perform app_partner_invoice(Y, proof.sess(Y), proof.h(Y), v_inv); raise exception 'FAIL: another partner read an invoice';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  -- the door: the link, the assignment, the budget, the balance; the rate stored; settle never above the reserve
  select * into u from app_pc_reserve(D, proof.sess(D), proof.h(D), l1, 'preview', 'home', 19, false);
  if u.reserved <> 19 then raise exception 'FAIL: a Builder''s preview'; end if;
  begin perform app_pc_reserve(G, proof.sess(G), proof.h(G), l1, 'turn', 'page', 19, false); raise exception 'FAIL: past the client''s budget';
  exception when sqlstate 'P0001' then if sqlerrm <> 'budget' then raise; end if; end;
  begin perform app_pc_reserve(Y, proof.sess(Y), proof.h(Y), l1, 'turn', 'page', 1, false); raise exception 'FAIL: another partner reserved on a link';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  if l2 is not null then
    begin perform app_pc_reserve(E, proof.sess(E), proof.h(E), l2, 'turn', 'page', 1, false); raise exception 'FAIL: a Lead reserved on an unassigned store';
    exception when sqlstate 'P0001' then if sqlerrm <> 'not_found' then raise; end if; end;
  end if;
  if app_pc_settle(u.use_id, 1156000) <> 19 then raise exception 'FAIL: a page turn is 19 credits'; end if;
  if app_pc_settle(u.use_id, 1) is not null then raise exception 'FAIL: settled twice'; end if;
  select x.use_id into u2 from app_pc_reserve(G, proof.sess(G), proof.h(G), l1, 'turn', 'edit', 5, false) x;
  if app_pc_settle(u2, 99999999) <> 5 then raise exception 'FAIL: charged above the reserve'; end if;
  select x.use_id into u2 from app_pc_reserve(G, proof.sess(G), proof.h(G), l1, 'turn', 'edit', 4, false) x;
  if not app_pc_return(u2, 'frrata') then raise exception 'FAIL: a return'; end if;
  if app_pc_return(u2, 'frrata') then raise exception 'FAIL: a return twice'; end if;
  if (select x.used from app_partner_credits_budgets(G, proof.sess(G), proof.h(G)) x where x.link_id = l1) <> 24 then raise exception 'FAIL: a client''s used credits'; end if;
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> 96 then raise exception 'FAIL: G''s balance after use'; end if;
  begin perform app_partner_set_budget(G, proof.sess(G), proof.h(G), l1, 10); raise exception 'FAIL: a budget below what is used';
  exception when sqlstate 'P0001' then if sqlerrm <> 'below_used' then raise; end if; end;
  begin perform app_pc_reserve(G, proof.sess(G), proof.h(G), l1, 'turn', 'nonsense', 1, false); raise exception 'FAIL: a use outside the vocabulary';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_input' then raise; end if; end;
  perform set_config('proof.l1_89', l1::text, true); perform set_config('proof.l2_89', coalesce(l2::text, ''), true);
  perform set_config('proof.y89p', py.id::text, true);
  -- the seat: the real check, one live seat, the mandate from the payment; the owner alone changes it
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'seat_start', 150, 'studio', 'upi', 360000, 299900, 0, 0, 53982, true, true,
    'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89s0001', false);
  if app_pc_apply('order_proof89s0001', 'pay_proof89s0001', true, 353882, 'INR', true, null, 'token_proof89s0001') <> 'applied' then raise exception 'FAIL: the seat'; end if;
  begin perform app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'seat_start', 150, 'studio', 'upi', 360000, 299900, 0, 0, 53982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
    raise exception 'FAIL: two live seats';
  exception when sqlstate 'P0001' then if sqlerrm <> 'has_seat' then raise; end if; end;
  begin perform app_partner_seat_change(E, proof.sess(E), proof.h(E), 'cancel', null); raise exception 'FAIL: a Lead cancelled the seat';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_owner' then raise; end if; end;
  perform app_partner_seat_change(G, proof.sess(G), proof.h(G), 'plan', 'plus');
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->'seat'->>'nextPlan') <> 'plus' then raise exception 'FAIL: a plan change at renewal'; end if;
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->'mandate'->>'max')::bigint <> 360000
     or (app_partner_credits_payments(G, proof.sess(G), proof.h(G))::text like '%token_proof89%') then raise exception 'FAIL: the mandate''s facts (or its token was returned)'; end if;
  -- the token's own events find it by token id; a dispute claws back what is left of its lot
  if not app_pc_token_event('token_proof89s0001', 'cancelled') then raise exception 'FAIL: a token event'; end if;
  v_bal := (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int;
  if not app_pc_dispute('pay_proof89s0001') then raise exception 'FAIL: a dispute not recorded'; end if;
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal - 150
  then raise exception 'FAIL: a dispute''s clawback (% before, % after)', v_bal, app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance'; end if;
  -- a refused capture is due a refund, claimed once
  select count(*) into n from app_pc_refunds_due(10) x where x.payment_id = 'pay_proof89g0001';
  if n <> 1 then raise exception 'FAIL: a refund due'; end if;
  select x.id into u2 from app_pc_refunds_due(10) x where x.payment_id = 'pay_proof89g0001';
  if not app_pc_refund_claim(u2) then raise exception 'FAIL: a refund not claimed'; end if;
  if app_pc_refund_claim(u2) then raise exception 'FAIL: a refund claimed twice'; end if;
  -- the emails carry the owner (and a Lead for its client's 80%), never someone else
  if exists (select 1 from app_pc_notices_claim(100, null) x where x.partner_id = G and ('y89@yarn.test' = any (x.owners) or 'y89@yarn.test' = any (x.leads))) then raise exception 'FAIL: Y got G''s email'; end if;
  perform app_pc_refund_done(u2, 'rfnd_proof89');
  if exists (select 1 from app_pc_refunds_due(10) x where x.id = u2) then raise exception 'FAIL: a refund done stays due'; end if;
  -- a failed payment, then a late capture of the same attempt still buys (architecture M7)
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'credits', 20, null, null, null, 40000, 0, 0, 7200, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89c0001', false);
  if app_pc_apply('order_proof89c0001', 'pay_proof89c0001', false, 47200, 'INR', true, 'declined', null) <> 'failed' then raise exception 'FAIL: a declined payment'; end if;
  if app_pc_apply('order_proof89c0002', 'pay_proof89c0002', true, 47200, 'INR', true, null, null) <> 'unknown' then raise exception 'FAIL: an order not ours'; end if;
  if app_pc_apply('order_proof89c0001', 'pay_proof89c0003', true, 47200, 'INR', true, null, null) <> 'applied' then raise exception 'FAIL: a late capture bought nothing'; end if;
  -- a real invoice: the real series, and its GSTIN locked
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, false, false, 'Frrata Pvt Ltd', '08AAACF0000A1Z5', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89l0001', false);
  if app_pc_apply('order_proof89l0001', 'pay_proof89l0001', true, 235882, 'INR', false, null, null) <> 'applied' then raise exception 'FAIL: a live pack'; end if;
  if not exists (select 1 from jsonb_array_elements(app_partner_credits_payments(G, proof.sess(G), proof.h(G))->'purchases') x
                  where x->>'id' = p.id::text and x->>'invoice_number' like 'FRR/26-27/%') then raise exception 'FAIL: a real invoice on the real series'; end if;
  begin perform app_partner_set_billing(G, proof.sess(G), proof.h(G), 'Nook Studio LLP', '27AAACQ1234R1Z5', null, '12 Hill Road, Mumbai', null); raise exception 'FAIL: a GSTIN changed after a real invoice';
  exception when sqlstate 'P0001' then if sqlerrm <> 'gstin_locked' then raise; end if; end;
  -- now the PAN has a real invoice: a second partner under it loses its free 20
  perform app_partner_set_billing(Y, proof.sess(Y), proof.h(Y), 'Yarn', '29AAACP1234R1Z1', null, 'Bengaluru', null);
  if (app_partner_credits_overview(Y, proof.sess(Y), proof.h(Y), true)->>'balance')::int <> 0 then raise exception 'FAIL: a shared PAN kept a second free 20'; end if;
  -- heads that don't follow the place of supply are refused (Frrata in 08, G in 27: IGST only)
  begin perform app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 17991, 17991, 0, false, false, 'Frrata Pvt Ltd', '08AAACF0000A1Z5', 'Jaipur', '998315', 'FRR/', '26-27');
    raise exception 'FAIL: CGST + SGST across states';
  exception when sqlstate 'P0001' then if sqlerrm <> 'bad_input' then raise; end if; end;
  -- more than the balance holds
  if l2 is not null then
    begin perform app_pc_reserve(G, proof.sess(G), proof.h(G), l2, 'turn', 'page', 120, true); raise exception 'FAIL: a reserve above the real balance';
    exception when sqlstate 'P0001' then if sqlerrm <> 'balance' then raise; end if; end;
  end if;
  -- an attempt left unpaid is listed, then closed with nothing taken
  if not exists (select 1 from app_pc_unsettled(interval '-1 minute', 50) x where x.id = current_setting('proof.y89p')::uuid) then raise exception 'FAIL: an unpaid attempt unlisted'; end if;
  if not app_pc_close(current_setting('proof.y89p')::uuid, 'Not paid') then raise exception 'FAIL: closing an unpaid attempt'; end if;
end $$;
reset role;
-- the renewal chain: due seats listed, an attempt and its notice, its order once the email went, a debit claimed once,
-- the plan frozen at notice, the seat's end and its mandate's cancel
do $$ declare g uuid; begin
  select pm.partner_id into g from partner_members pm where pm.user_id = 'aaaaaaaa-0000-0000-0000-000000000092' and pm.role = 'owner';
  update partner_seats set period_end = now() + interval '1 day' where partner_id = g and ended_at is null;
  update partner_billing set mandate_revoked_at = null where partner_id = g;
  perform set_config('proof.g89p', g::text, true);
end $$;
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; gp uuid := current_setting('proof.g89p')::uuid; r record; v uuid; n record; pe timestamptz; seat jsonb;
begin
  select * into r from app_pc_renewals(100, null, null) x where x.partner_id = gp;
  if r.seat_id is null or not r.mandate or r.attempts <> 0 or not r.partner_live then raise exception 'FAIL: a due seat (%)', r; end if;
  v := app_pc_renewal_begin(r.seat_id, r.period_end, 1, now() + interval '25 hours', 'studio', 150, 299900, 0, 0, 53982, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  if v is null then raise exception 'FAIL: a renewal attempt'; end if;
  if app_pc_renewal_begin(r.seat_id, r.period_end, 1, now() + interval '25 hours', 'studio', 150, 299900, 0, 0, 53982, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27') is not null
  then raise exception 'FAIL: two open renewal attempts'; end if;
  if exists (select 1 from app_pc_renewals_notified(50) x where x.id = v) then raise exception 'FAIL: an order before the email went'; end if;
  select * into n from app_pc_notices_claim(100, null) x where x.kind = 'predebit' and x.partner_id = gp;
  if n.id is null or (n.data->>'total')::bigint <> 353882 or n.data->>'mandateRef' <> '0001' or not ('g@nook.test' = any (n.owners) or cardinality(n.owners) = 1)
  then raise exception 'FAIL: the pre-debit notice (%)', n; end if;
  perform app_pc_notice_done(n.id, true, null);
  if not exists (select 1 from app_pc_renewals_notified(50) x where x.id = v) then raise exception 'FAIL: a renewal ready for its order'; end if;
  if not app_pc_purchase_order(v, 'order_proof89r0001', true) then raise exception 'FAIL: a renewal order'; end if;
  if not app_pc_claim(v) then raise exception 'FAIL: a debit claim'; end if;
  if app_pc_claim(v) then raise exception 'FAIL: a debit claimed twice'; end if;
  pe := r.period_end;
  if app_pc_apply('order_proof89r0001', 'pay_proof89r0001', true, 353882, 'INR', true, null, null) <> 'applied' then raise exception 'FAIL: a renewal paid'; end if;
  seat := app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->'seat';
  if seat->>'plan' <> 'studio' or seat->>'nextPlan' <> 'plus' or (seat->>'periodEnd')::timestamptz <> pe + interval '1 month'
  then raise exception 'FAIL: the plan frozen at notice (%)', seat; end if;
  if not app_pc_seat_end(r.seat_id, false) then raise exception 'FAIL: a seat end'; end if;
  if not exists (select 1 from app_pc_token_cancels(10) x where x.partner_id = gp and x.token_id = 'token_proof89s0001') then raise exception 'FAIL: the mandate to cancel'; end if;
  perform app_pc_token_cancelled(gp, 'token_proof89s0001');
  if exists (select 1 from app_pc_token_cancels(10) x where x.partner_id = gp) then raise exception 'FAIL: a cancelled mandate listed again'; end if;
end $$;
reset role;
-- the billing webhook's one inbox routes a partner's payment by OUR order (0165): applied in the server's mode only; a
-- refund Frrata didn't make claws the credits back; a token event finds a partner's mandate by its id
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; p record; ev uuid; v_bal int;
begin
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89w0001', false);
  v_bal := (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int;
  -- a live-mode event for a test attempt buys nothing (its money goes back)
  ev := app_store_billing_event('proof89-w0', 'payment.captured', '{"_test": false, "payload": {"payment": {"entity": {"id": "pay_proof89w0000", "order_id": "order_proof89w0001", "amount": 235882, "currency": "INR", "status": "captured"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal then raise exception 'FAIL: a live-mode event bought test credits'; end if;
  ev := app_store_billing_event('proof89-w1', 'payment.captured', '{"_test": true, "payload": {"payment": {"entity": {"id": "pay_proof89w0001", "order_id": "order_proof89w0001", "amount": 235882, "currency": "INR", "status": "captured"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal + 100 then raise exception 'FAIL: the webhook did not apply a partner''s payment'; end if;
  ev := app_store_billing_event('proof89-w2', 'refund.processed', '{"_test": true, "payload": {"refund": {"entity": {"id": "rfnd_proof89w001", "payment_id": "pay_proof89w0001", "amount": 235882}}, "payment": {"entity": {"id": "pay_proof89w0001"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal then raise exception 'FAIL: a refund Frrata didn''t make kept the credits'; end if;
end $$;
reset role;
update partner_billing set token_id = 'token_proof89w0001', mandate_method = 'upi', mandate_max = 360000, mandate_revoked_at = null where partner_id = current_setting('proof.g89p')::uuid;
-- one token held by both families: a token event decides both, never only the first it finds (tenancy audit 2026-11-23)
update billing_accounts set mandate_token_id = 'token_proof89w0001', mandate_revoked_at = null where tenant_id = '22222222-2222-2222-2222-222222222222';
set local role frata_app;
do $$ declare ev uuid; begin
  ev := app_store_billing_event('proof89-w3', 'token.cancelled', '{"_test": true, "payload": {"token": {"entity": {"id": "token_proof89w0001", "status": "cancelled"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
end $$;
reset role;
do $$ begin
  if (select mandate_revoked_at from partner_billing where partner_id = current_setting('proof.g89p')::uuid) is null then raise exception 'FAIL: a partner''s token event was lost'; end if;
  if (select mandate_revoked_at from billing_accounts where tenant_id = '22222222-2222-2222-2222-222222222222') is null then raise exception 'FAIL: a shared token''s merchant mandate was left'; end if;
end $$;
-- security review 2026-11-23: Frrata's own refund claws nothing back; a dispute through the route does, and what was
-- already spent is owed (drawn from the other lots); a refund that arrives before its capture waits; a merchant's refund
-- passes untouched; an order id merchant billing holds is never a partner's; a failed-then-wrongly-captured payment is refunded
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; gp uuid := current_setting('proof.g89p')::uuid; p record; ev uuid; v_bal int; t text;
begin
  -- Frrata's own refund (its id is ours): the credits stay
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89w0002', false);
  if app_pc_apply('order_proof89w0002', 'pay_proof89w0002', true, 235882, 'INR', true, null, null) <> 'applied' then raise exception 'FAIL: a second pack'; end if;
  perform set_config('proof.w2', p.id::text, true);
end $$;
reset role;
update partner_credit_purchases set refund_gateway_id = 'rfnd_proof89w002' where id = current_setting('proof.w2')::uuid;
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; gp uuid := current_setting('proof.g89p')::uuid; p record; ev uuid; v_bal int; v_after int; t text;
begin
  v_bal := (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int;
  ev := app_store_billing_event('proof89-w4', 'refund.processed', '{"_test": true, "payload": {"refund": {"entity": {"id": "rfnd_proof89w002", "payment_id": "pay_proof89w0002", "amount": 235882}}, "payment": {"entity": {"id": "pay_proof89w0002", "order_id": "order_proof89w0002"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal then raise exception 'FAIL: Frrata''s own refund clawed credits back'; end if;
  -- a merchant's refund (a payment no partner holds) is stored, applied and changes nothing of a partner's
  ev := app_store_billing_event('proof89-w5', 'refund.processed', '{"_test": true, "payload": {"refund": {"entity": {"id": "rfnd_proof89m001", "payment_id": "pay_proof89m0001", "amount": 100}}, "payment": {"entity": {"id": "pay_proof89m0001", "order_id": "order_proof89m0001"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal then raise exception 'FAIL: a merchant refund touched a partner'; end if;
  -- a refund before its capture is applied waits (stays unapplied), then claws back once the capture lands
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89w0003', false);
  ev := app_store_billing_event('proof89-w6', 'refund.processed', '{"_test": true, "payload": {"refund": {"entity": {"id": "rfnd_proof89w003", "payment_id": "pay_proof89w0003", "amount": 235882}}, "payment": {"entity": {"id": "pay_proof89w0003", "order_id": "order_proof89w0003"}}}}'::jsonb);
  t := null;
  begin perform app_apply_billing_event(ev); exception when others then t := sqlerrm; end;
  if t is distinct from 'not_yet' then raise exception 'FAIL: a refund before its capture did not wait (%)', t; end if;
  if app_pc_apply('order_proof89w0003', 'pay_proof89w0003', true, 235882, 'INR', true, null, null) <> 'applied' then raise exception 'FAIL: the late capture'; end if;
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal + 100 then raise exception 'FAIL: the late capture''s credits'; end if;
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal then raise exception 'FAIL: a reordered refund kept the credits'; end if;
  -- a dispute through the route on a pack partly spent: the lot's rest clawed back, the spent part drawn from other lots
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89w0004', false);
  if app_pc_apply('order_proof89w0004', 'pay_proof89w0004', true, 235882, 'INR', true, null, null) <> 'applied' then raise exception 'FAIL: a fourth pack'; end if;
  perform set_config('proof.w4', p.id::text, true);
  perform set_config('proof.w4bal', (v_bal + 100)::text, true);
  -- a failed payment then captured at the wrong amount: the money goes back (security L6)
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform app_pc_purchase_order(p.id, 'order_proof89w0005', false);
  if app_pc_apply('order_proof89w0005', 'pay_proof89w0005', false, 235882, 'INR', true, 'declined', null) <> 'failed' then raise exception 'FAIL: a failed payment'; end if;
  if app_pc_apply('order_proof89w0005', 'pay_proof89w0005', true, 100, 'INR', true, null, null) <> 'refund_due' then raise exception 'FAIL: a wrong capture after a failure kept the money'; end if;
  -- an order id merchant billing holds is never a partner's
  select * into p from app_partner_credit_buy(G, proof.sess(G), proof.h(G), 'pack', 100, null, null, null, 199900, 0, 0, 35982, true, true, 'Frrata', '', 'Jaipur', '998315', 'FRR/', '26-27');
  perform set_config('proof.w6', p.id::text, true);
end $$;
reset role;
-- 60 of the fourth pack's credits spent (a void draw stands in for the uses)
insert into partner_credit_entries (partner_id, kind, credits, lot_id)
  select partner_id, 'void', -60, id from partner_credit_entries where purchase_id = current_setting('proof.w4')::uuid and kind = 'pack';
insert into billing_mandate_setups (tenant_id, gateway_order_id, gateway_customer_id, method, max_amount, created_by)
  values ('22222222-2222-2222-2222-222222222222', 'order_proof89m0006', 'cust_proof89m', 'upi', 1500000, 'aaaaaaaa-0000-0000-0000-000000000092');
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; gp uuid := current_setting('proof.g89p')::uuid; ev uuid; v_bal int; t text;
begin
  v_bal := (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int;
  if v_bal <> current_setting('proof.w4bal')::int - 60 then raise exception 'FAIL: the spent stand-in (%)', v_bal; end if;
  ev := app_store_billing_event('proof89-w7', 'payment.dispute.created', '{"_test": true, "payload": {"payment": {"entity": {"id": "pay_proof89w0004", "order_id": "order_proof89w0004"}}}}'::jsonb);
  perform app_apply_billing_event(ev);
  if (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance')::int <> v_bal - 40 - 60 then raise exception 'FAIL: a dispute left the spent credits (%)', (app_partner_credits_overview(G, proof.sess(G), proof.h(G), false)->>'balance'); end if;
  t := null;
  begin perform app_pc_purchase_order(current_setting('proof.w6')::uuid, 'order_proof89m0006', false); exception when others then t := sqlerrm; end;
  if t is distinct from 'bad_input' then raise exception 'FAIL: a merchant''s order id taken for a partner''s attempt (%)', t; end if;
end $$;
reset role;
do $$ begin
  if app_pc_debt(current_setting('proof.g89p')::uuid, false) <> 0 then raise exception 'FAIL: a covered dispute still owed'; end if;
  if (select sum(-c.credits) from partner_credit_entries c where c.purchase_id = current_setting('proof.w4')::uuid and c.kind = 'clawback') <> 100
  then raise exception 'FAIL: a dispute''s clawback is not the whole purchase'; end if;
end $$;
-- a pre-debit email that failed for good closes its attempt (never a debit without its notice); an open use nobody
-- closed is listed for the hourly return; the invoice's year is the day of issue (architecture review 2026-11-23)
insert into partner_credit_notices (partner_id, kind, purchase_id, dedupe, tries)
  values (current_setting('proof.g89p')::uuid, 'predebit', current_setting('proof.w6')::uuid, 'proof89-predebit-fail', 5);
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; u record; begin
  select * into u from app_pc_reserve(G, proof.sess(G), proof.h(G), current_setting('proof.l1_89')::uuid, 'turn', 'edit', 2, false);
  perform set_config('proof.stale', u.use_id::text, true);
end $$;
reset role;
update partner_credit_uses set created_at = now() - interval '3 hours' where id = current_setting('proof.stale')::uuid;
do $$ declare nid uuid; begin
  select id into nid from partner_credit_notices where dedupe = 'proof89-predebit-fail';
  perform set_config('proof.nfail', nid::text, true);
end $$;
set local role frata_app;
do $$ begin
  perform app_pc_notice_done(current_setting('proof.nfail')::uuid, false, 'suppressed');
  if exists (select 1 from app_pc_unsettled(interval '-1 minute', 200) x where x.id = current_setting('proof.w6')::uuid) then
    raise exception 'FAIL: an attempt whose notice failed for good stays open'; end if;
  if not exists (select 1 from app_pc_stale_uses(interval '2 hours', 200) x where x.id = current_setting('proof.stale')::uuid)
  then raise exception 'FAIL: an open use from 3 hours ago not listed for its return'; end if;
end $$;
reset role;
do $$ declare fy text := to_char((now() at time zone 'Asia/Kolkata') - interval '3 months', 'YY') || '-' || to_char((now() at time zone 'Asia/Kolkata') + interval '9 months', 'YY');
begin
  if (select closed_at from partner_credit_purchases where id = current_setting('proof.w6')::uuid) is null then raise exception 'FAIL: the failed notice''s attempt not closed'; end if;
  if exists (select 1 from partner_invoices i where i.partner_id = current_setting('proof.g89p')::uuid and i.number not like '%' || fy || '/%') then
    raise exception 'FAIL: an invoice outside the year of its issue'; end if;
  -- free credits never pay a debt
  if exists (select 1 from partner_credit_entries c join partner_credit_entries l on l.id = c.lot_id where c.kind = 'clawback' and l.kind = 'grant') then
    raise exception 'FAIL: a debt drawn from free credits'; end if;
end $$;
-- Frrata's GST export sees the real invoice and never a test one
set local role frata_admin;
do $$ begin
  if not exists (select 1 from admin_partner_gst_rows(now() - interval '1 day', now() + interval '1 day') x where x.number like 'FRR/26-27/%' and x.total = 235882)
  then raise exception 'FAIL: a real partner invoice missing from the GST export'; end if;
  if exists (select 1 from admin_partner_gst_rows(now() - interval '1 day', now() + interval '1 day') x where x.number like 'FRR/T%') then raise exception 'FAIL: a test invoice in the GST export'; end if;
end $$;
reset role;
-- credits drawn from a lot that has since ended come back as a new lot for 12 months
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; u record; begin
  select * into u from app_pc_reserve(G, proof.sess(G), proof.h(G), current_setting('proof.l1_89')::uuid, 'turn', 'edit', 2, true);
  perform set_config('proof.u89', u.use_id::text, true);
end $$;
reset role;
update partner_credit_entries l set expires_at = now() - interval '1 second'
 where l.id in (select e.lot_id from partner_credit_entries e where e.use_id = current_setting('proof.u89')::uuid and e.kind = 'reserve');
set local role frata_app;
do $$ begin if not app_pc_return(current_setting('proof.u89')::uuid, 'frrata') then raise exception 'FAIL: a return'; end if; end $$;
reset role;
do $$ begin
  if (select sum(e.credits) from partner_credit_entries e where e.use_id = current_setting('proof.u89')::uuid and e.kind = 'return' and e.expires_at > now() + interval '11 months') <> 2
  then raise exception 'FAIL: credits from an ended lot did not come back for 12 months'; end if;
end $$;
-- a draw can never name another partner's lot (the foreign key carries the partner: tenancy H2)
do $$ declare g uuid; y uuid; lot uuid; begin
  select pm.partner_id into g from partner_members pm where pm.user_id = 'aaaaaaaa-0000-0000-0000-000000000092' and pm.role = 'owner';
  select pm.partner_id into y from partner_members pm where pm.user_id = 'aaaaaaaa-0000-0000-0000-000000000190' and pm.role = 'owner';
  select e.id into lot from partner_credit_entries e where e.partner_id = g and e.kind = 'grant';
  begin insert into partner_credit_entries (partner_id, kind, credits, lot_id) values (y, 'void', -1, lot); raise exception 'FAIL: a draw named another partner''s lot';
  exception when foreign_key_violation then null; end;
  -- no rate, no reserve
  delete from fx_rates;
  perform set_config('proof.g89', g::text, true);
end $$;
set local role frata_app;
do $$ declare G uuid := 'aaaaaaaa-0000-0000-0000-000000000092'; l1 uuid; begin
  select x.link_id into l1 from app_partner_clients(G, proof.sess(G), proof.h(G)) x where x.tenant_id = current_setting('proof.nook1')::uuid;
  begin perform app_pc_reserve(G, proof.sess(G), proof.h(G), l1, 'turn', 'edit', 1, false); raise exception 'FAIL: a reserve without a rate';
  exception when sqlstate 'P0001' then if sqlerrm <> 'rate' then raise; end if; end;
end $$;
reset role;
-- a suspended partner reads and buys nothing
update partners set suspended_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000190';
set local role frata_app;
do $$ declare Y uuid := 'aaaaaaaa-0000-0000-0000-000000000190'; begin
  begin perform app_partner_credits_overview(Y, proof.sess(Y), proof.h(Y), false); raise exception 'FAIL: a suspended partner read credits';
  exception when sqlstate 'P0001' then if sqlerrm not in ('not_owner', 'confirm_first') then raise; end if; end;
end $$;
reset role;
rollback;
begin;
do $$ declare r text; f text; begin
  foreach f in array array[
    'app_partner_credit_try(uuid, uuid, text, text)', 'app_partner_credits_overview(uuid, uuid, text, boolean)',
    'app_partner_credits_usage(uuid, uuid, text, date, uuid, integer, timestamptz)', 'app_partner_credits_budgets(uuid, uuid, text)',
    'app_partner_credits_payments(uuid, uuid, text)', 'app_partner_invoice(uuid, uuid, text, uuid)', 'app_partner_credits_panel(uuid, uuid, text, uuid, boolean)',
    'app_partner_set_budget(uuid, uuid, text, uuid, integer)', 'app_partner_set_site_budget(uuid, uuid, text, integer)',
    'app_partner_set_alerts(uuid, uuid, text, boolean, boolean)', 'app_partner_set_billing(uuid, uuid, text, text, text, text, text, text)',
    'app_partner_credit_buy(uuid, uuid, text, text, integer, text, text, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, text, text, text, text)',
    'app_partner_seat_change(uuid, uuid, text, text, text)', 'app_pc_purchase_ctx(uuid)', 'app_pc_set_customer(uuid, text)',
    'app_pc_purchase_order(uuid, text, boolean)', 'app_pc_claim(uuid)', 'app_pc_apply(text, text, boolean, bigint, text, boolean, text, text)',
    'app_pc_unsettled(interval, integer)', 'app_pc_close(uuid, text)', 'app_pc_renewals(integer, timestamptz, uuid)',
    'app_pc_renewal_begin(uuid, timestamptz, integer, timestamptz, text, integer, bigint, bigint, bigint, bigint, boolean, text, text, text, text, text, text)',
    'app_pc_renewals_notified(integer)', 'app_pc_seat_end(uuid, boolean)', 'app_pc_token_cancels(integer)', 'app_pc_token_cancelled(uuid, text)',
    'app_pc_token_event(text, text)', 'app_pc_refunds_due(integer)', 'app_pc_refund_claim(uuid)', 'app_pc_refund_done(uuid, text)',
    'app_pc_dispute(text)', 'app_pc_notices_claim(integer, uuid[])', 'app_pc_notice_done(uuid, boolean, text)',
    'app_fx_rate_latest()', 'app_pc_reserve(uuid, uuid, text, uuid, text, text, integer, boolean)', 'app_pc_settle(uuid, bigint)', 'app_pc_return(uuid, text)'] loop
    foreach r in array array['anon', 'authenticated', 'service_role', 'frata_builder', 'frata_admin'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL: % can run %', r, f; end if;
    end loop;
    if not has_function_privilege('frata_app', f, 'execute') then raise exception 'FAIL: frata_app cannot run %', f; end if;
  end loop;
  foreach f in array array['app_pc_owner(uuid, uuid, text, boolean, boolean)', 'app_pc_lots(uuid, boolean)', 'app_pc_balance(uuid, boolean)',
    'app_pc_charged(uuid)', 'app_pc_window(uuid)', 'app_pc_link_used(uuid, uuid)', 'app_pc_notice(uuid, text, text, uuid, uuid)',
    'app_pc_on_partner_approved()', 'app_pc_issue(uuid)', 'app_pc_give_back(uuid, integer)',
    'app_pc_debt(uuid, boolean)', 'app_pc_debt_draw(uuid, boolean)'] loop
    foreach r in array array['anon', 'authenticated', 'service_role', 'frata_builder', 'frata_admin', 'frata_app'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL: % can run the internal %', r, f; end if;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_builder', 'frata_app'] loop
    if has_function_privilege(r, 'admin_partner_gst_rows(timestamptz, timestamptz)', 'execute') then raise exception 'FAIL: % can run the GST rows', r; end if;
  end loop;
  if not has_function_privilege('frata_admin', 'admin_partner_gst_rows(timestamptz, timestamptz)', 'execute') then raise exception 'FAIL: frata_admin cannot read the GST rows'; end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_builder', 'frata_app'] loop
    if has_function_privilege(r, 'app_fx_rate_set(date, integer)', 'execute') then raise exception 'FAIL: % can set the rate', r; end if;
  end loop;
  if not has_function_privilege('frata_admin', 'app_fx_rate_set(date, integer)', 'execute') then raise exception 'FAIL: Admin cannot set the rate'; end if;
  foreach r in array array['frata_app', 'frata_admin', 'frata_builder', 'anon', 'authenticated', 'service_role'] loop
    foreach f in array array['partner_billing', 'partner_seats', 'partner_credit_purchases', 'partner_invoices', 'partner_credit_uses',
      'partner_credit_entries', 'partner_client_budgets', 'partner_credit_notices', 'partner_credit_tries', 'fx_rates'] loop
      if has_table_privilege(r, f, 'select') or has_table_privilege(r, f, 'insert') or has_table_privilege(r, f, 'update')
         or has_table_privilege(r, f, 'delete') or has_table_privilege(r, f, 'truncate') then raise exception 'FAIL: % reaches %', r, f; end if;
    end loop;
  end loop;
end $$;
rollback;

-- § 102 · Sign-up without a PIN code (O1, drizzle/0166; plan docs/plans/2026-11-23-o1-signup.md O1·2). v3 keeps every
-- refusal of v1 (§ 17, § 30's retired name) and v2 (§ 49): confirmed email, one shop a person, taken, bad and retired
-- addresses, another person's code, a code twice, a claimed email gets no trial, frozen terms; the new store has no
-- pickup PIN code, its audit no 'pickup', and 'signup_ms' only inside 0..86,400,000. The partner's v2 keeps § 28's
-- applicant, declined and cap refusals, § 77's check and § 82's Builder. Only frata_app runs either.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000201', 'v3a@signup-proof.test', now()), ('aaaaaaaa-0000-0000-0000-000000000202', 'v3b@signup-proof.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000203', 'v3c@signup-proof.test', now()), ('aaaaaaaa-0000-0000-0000-000000000204', 'v3d@signup-proof.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000205', 'p102@kiln.test', now()), ('aaaaaaaa-0000-0000-0000-000000000206', 'q102@kiln.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000207', 'r102@kiln.test', now()), ('aaaaaaaa-0000-0000-0000-000000000208', 'b102@kiln.test', now());
begin;
-- B opened once, so its rename below retires its old name (as § 30).
update shop_settings set published_at = now() where tenant_id = '22222222-2222-2222-2222-222222222222';
update shop_settings set published_at = null where tenant_id = '22222222-2222-2222-2222-222222222222';
set local role frata_app;
do $$ declare t uuid; r record; c uuid; d jsonb; A uuid := 'aaaaaaaa-0000-0000-0000-000000000201'; B uuid := 'aaaaaaaa-0000-0000-0000-000000000202'; begin
  begin perform app_create_shop_v3('aaaaaaaa-0000-0000-0000-000000000003', 'Squat', 'squat-shop', '{}', 'growth', 'h-102-0', 1::smallint, null, null); raise exception 'FAIL: 102 unconfirmed email made a shop';
  exception when raise_exception then if sqlerrm <> 'email_unconfirmed' then raise; end if; end;
  begin perform app_create_shop_v3('aaaaaaaa-0000-0000-0000-000000000002', 'Second', 'second-shop', '{}', 'growth', 'h-102-0', 1::smallint, null, null); raise exception 'FAIL: 102 an owner made a second shop';
  exception when raise_exception then if sqlerrm <> 'has_shop' then raise; end if; end;
  begin perform app_create_shop_v3(A, 'Taken', 'proof-a', '{}', 'growth', 'h-102-a', 1::smallint, null, null); raise exception 'FAIL: 102 a taken address was accepted';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin perform app_create_shop_v3(A, 'Bad', '-bad-', '{}', 'growth', 'h-102-a', 1::smallint, null, null); raise exception 'FAIL: 102 a bad address was accepted';
  exception when raise_exception then if sqlerrm <> 'bad_slug' then raise; end if; end;
  perform app_change_shop_address('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'proof-b102-new');
  if app_name_check('proof-b') <> 'taken' then raise exception 'FAIL: 102 the retired name looked free'; end if;
  begin perform app_create_shop_v3(A, 'Squatter', 'proof-b', '{}', 'growth', 'h-102-a', 1::smallint, null, null); raise exception 'FAIL: 102 sign-up took a retired name';
  exception when raise_exception then if sqlerrm <> 'slug_taken' then raise; end if; end;
  begin perform app_create_shop_v3(A, 'Plan', 'proof-102-plan', '{}', 'gold', 'h-102-a', 1::smallint, null, null); raise exception 'FAIL: 102 an unknown plan';
  exception when raise_exception then if sqlerrm <> 'bad_plan' then raise; end if; end;
  begin perform app_create_shop_v3(A, '   ', 'proof-102-blank', '{}', 'growth', 'h-102-a', 1::smallint, null, null); raise exception 'FAIL: 102 a blank name';
  exception when raise_exception then if sqlerrm <> 'bad_name' then raise; end if; end;
  -- a code: another person cannot spend it; it is spent once
  c := app_signup_code_issue(A, 'phone-hmac-102', 'code-hmac-102', 1::smallint);
  if not app_signup_code_verify(A, c, 'code-hmac-102') then raise exception 'FAIL: 102 the right code did not verify'; end if;
  begin perform app_create_shop_v3(B, 'Proof B102', 'proof-b102', '{}', 'growth', 'h-102-b', 1::smallint, c, null); raise exception 'FAIL: 102 a code spent by another person';
  exception when others then if sqlerrm <> 'bad_code' then raise; end if; end;
  select * into r from app_create_shop_v3(A, '  Proof A102  ', 'proof-a102', array['women','ethnic'], 'growth', 'h-102-a', 1::smallint, c, 41500);
  if not r.trial then raise exception 'FAIL: 102 a first sign-up got no trial'; end if;
  begin perform app_create_shop_v3(A, 'Again', 'proof-a102-again', '{}', 'growth', 'h-102-x', 1::smallint, null, null); raise exception 'FAIL: 102 one person made two shops';
  exception when raise_exception then if sqlerrm <> 'has_shop' then raise; end if; end;
  begin perform app_create_shop_v3(B, 'Proof B102', 'proof-b102', '{}', 'growth', 'h-102-b', 1::smallint, c, null); raise exception 'FAIL: 102 a code used twice';
  exception when others then if sqlerrm <> 'bad_code' then raise; end if; end;
  perform set_config('app.tenant_id', r.tenant_id::text, true);
  if (select name from tenants) <> 'Proof A102' then raise exception 'FAIL: 102 new shop name'; end if;
  if (select count(*) from shop_settings) <> 1 or (select pickup_pincode from shop_settings) is not null then raise exception 'FAIL: 102 the new store has a pickup PIN code'; end if;
  if (select sells from shop_settings) <> array['women','ethnic'] then raise exception 'FAIL: 102 what the store sells'; end if;
  if (select count(*) from tenant_plans) <> 1 then raise exception 'FAIL: 102 new shop plan'; end if;
  select detail into d from audit_events where action = 'shop.created';
  if d ? 'pickup' or (d->>'signup_ms')::int is distinct from 41500 or d->>'plan' <> 'growth' or (d->>'trial')::boolean is not true then raise exception 'FAIL: 102 the audit detail (%)', d; end if;
end $$;
rollback;
begin;
do $$ declare r record; d jsonb; begin
  -- As the definer runs it (superuser here, to check the rows): a claimed email, frozen terms, the clamp.
  insert into trial_claims (kind, key_hmac, key_version, tenant_id) values ('email', 'h-102-taken', 1, '11111111-1111-1111-1111-111111111111');
  select * into r from app_create_shop_v3('aaaaaaaa-0000-0000-0000-000000000203', 'Proof C102', 'proof-c102', '{}', 'launch', 'h-102-taken', 1::smallint, null, -1);
  if r.trial or exists (select 1 from shop_trials where tenant_id = r.tenant_id) then raise exception 'FAIL: 102 a claimed email got a trial'; end if;
  select detail into d from audit_events where tenant_id = r.tenant_id and action = 'shop.created';
  if d ? 'signup_ms' then raise exception 'FAIL: 102 a negative time was kept'; end if;
  select * into r from app_create_shop_v3('aaaaaaaa-0000-0000-0000-000000000204', 'Proof D102', 'proof-d102', '{}', 'growth', 'h-102-new', 1::smallint, null, null);
  if not r.trial or (select days from shop_trials where tenant_id = r.tenant_id) <> (select days from trial_settings) then raise exception 'FAIL: 102 the trial terms were not frozen'; end if;
  if (select trial_ends_at from tenant_plans where tenant_id = r.tenant_id) is null then raise exception 'FAIL: 102 the new shop''s plan row has no trial end'; end if;
  if (select detail from audit_events where tenant_id = r.tenant_id and action = 'shop.created') ? 'signup_ms' then raise exception 'FAIL: 102 a null time was kept'; end if;
  if (select pickup_pincode from shop_settings where tenant_id = r.tenant_id) is not null then raise exception 'FAIL: 102 pickup'; end if;
  -- the clamp's top edge
  delete from members where user_id = 'aaaaaaaa-0000-0000-0000-000000000204';
  select * into r from app_create_shop_v3('aaaaaaaa-0000-0000-0000-000000000204', 'Proof E102', 'proof-e102', '{}', 'growth', 'h-102-e', 1::smallint, null, 86400001);
  if (select detail from audit_events where tenant_id = r.tenant_id and action = 'shop.created') ? 'signup_ms' then raise exception 'FAIL: 102 a time over a day was kept'; end if;
  -- privileges: frata_app only
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder']) ro,
             unnest(array['app_create_shop_v3(uuid,text,text,text[],text,text,smallint,uuid,integer)', 'app_partner_create_shop_v2(uuid,uuid,text,text,text,integer,integer,integer,integer)']) f
             where has_function_privilege(ro, f, 'execute')) then raise exception 'FAIL: 102 another role may create a store'; end if;
  if not has_function_privilege('frata_app', 'app_create_shop_v3(uuid,text,text,text[],text,text,smallint,uuid,integer)', 'execute')
     or not has_function_privilege('frata_app', 'app_partner_create_shop_v2(uuid,uuid,text,text,text,integer,integer,integer,integer)', 'execute') then
    raise exception 'FAIL: 102 the app cannot create a store'; end if;
end $$;
rollback;
-- the partner's v2: P approved (owner), Q an applicant, R declined, D a Builder on P's first store
begin; set local role frata_app;
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000205', 'Pari', 'Kiln 102', '919845012302', 'Pune', '{}', '', '1-4', 1);
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000206', 'Qadir', '', '919845012303', 'Pune', '{}', '', '0', 1);
select app_partner_apply('aaaaaaaa-0000-0000-0000-000000000207', 'Rhea', '', '919845012304', 'Pune', '{}', '', '0', 1);
commit;
update partners set approved_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000205';
update partners set declined_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000207';
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000205');
do $$ declare P uuid := 'aaaaaaaa-0000-0000-0000-000000000205'; Q uuid := 'aaaaaaaa-0000-0000-0000-000000000206'; R uuid := 'aaaaaaaa-0000-0000-0000-000000000207';
  D uuid := 'aaaaaaaa-0000-0000-0000-000000000208'; t uuid; inv uuid;
begin
  begin perform app_partner_create_shop_v2(Q, proof.sess(Q), proof.h(Q), 'Q102', 'proof-q102', 2000, 24, 90, 10); raise exception 'FAIL: 102 an applicant made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  begin perform app_partner_create_shop_v2(R, proof.sess(R), proof.h(R), 'R102', 'proof-r102', 2000, 24, 90, 10); raise exception 'FAIL: 102 a declined partner made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  begin perform app_partner_create_shop_v2(P, proof.sess(P), 'not-a-check', 'P102 X', 'proof-p102-x', 2000, 24, 90, 10); raise exception 'FAIL: 102 a partner store without a check';
  exception when sqlstate 'P0001' then if sqlerrm <> 'confirm_first' then raise; end if; end;
  t := app_partner_create_shop_v2(P, proof.sess(P), proof.h(P), 'Proof P102', 'proof-p102', 2000, 24, 90, 1);
  begin perform app_partner_create_shop_v2(P, proof.sess(P), proof.h(P), 'Proof P102 two', 'proof-p102-two', 2000, 24, 90, 1); raise exception 'FAIL: 102 past the cap of unopened stores';
  exception when sqlstate 'P0001' then if sqlerrm <> 'too_many' then raise; end if; end;
  begin perform app_partner_create_shop_v2(P, proof.sess(P), proof.h(P), 'Taken', 'proof-a', 2000, 24, 90, 10); raise exception 'FAIL: 102 a partner took a taken address';
  exception when sqlstate 'P0001' then if sqlerrm <> 'slug_taken' then raise; end if; end;
  inv := app_partner_invite(P, proof.sess(P), proof.h(P), 'b102@kiln.test', 'builder', array[t]);
  perform app_partner_accept(D, inv);
  perform proof.check(D);
  begin perform app_partner_create_shop_v2(D, proof.sess(D), proof.h(D), 'D102', 'proof-d102-x', 2000, 24, 90, 10); raise exception 'FAIL: 102 a Builder made a store';
  exception when sqlstate 'P0001' then if sqlerrm <> 'not_partner' then raise; end if; end;
  perform set_config('app.tenant_id', t::text, true);
  if (select count(*) from shop_settings) <> 1 or (select pickup_pincode from shop_settings) is not null then raise exception 'FAIL: 102 the partner''s store has a pickup PIN code'; end if;
  if (select count(*) from partner_links) <> 1 then raise exception 'FAIL: 102 the partner''s link'; end if;
  perform set_config('app.tenant_id', '', true);
end $$;
rollback;
-- the store and its audit row, read as the definer wrote them (the app reads audit rows only through its own tenant)
begin; set local role frata_app;
select proof.check('aaaaaaaa-0000-0000-0000-000000000205');
select app_partner_create_shop_v2('aaaaaaaa-0000-0000-0000-000000000205', proof.sess('aaaaaaaa-0000-0000-0000-000000000205'), proof.h('aaaaaaaa-0000-0000-0000-000000000205'), 'Proof P102', 'proof-p102', 2000, 24, 90, 10);
reset role;
do $$ declare d jsonb := (select detail from audit_events a join tenants t on t.id = a.tenant_id where t.slug = 'proof-p102' and a.action = 'shop.created'); begin
  if d is null or d ? 'pickup' or d->>'by' <> 'partner' then raise exception 'FAIL: 102 the partner''s audit detail (%)', d; end if;
end $$;
rollback;

-- the proof-only helpers go, and are gone
drop schema proof cascade;
do $$ begin if to_regnamespace('proof') is not null then raise exception 'FAIL: proof helpers left behind'; end if; end $$;

-- 81. Storefront keys (V1 Storefront API SA0, 0141–0143; ADR-0018; plan docs/plans/2026-11-15-v1-storefront-api.md
-- § SA0·3). A key is its shop's own row both ways; frata_app never changes a hash, kind, shop or maker and never deletes;
-- no other role reaches it. app_storefront_key is the one way from a key to a shop: it returns exactly four columns and
-- derives every stop (deleted, expired, a test key once the store ever opened, a partner's key once that partner's link
-- is gone or it is suspended, a Website not on a live connected domain). A website's address names a live domain of
-- the same shop, its apex or www only; removing that domain clears it.
insert into tenants (id, slug, name) values
  ('c8100000-0000-0000-0000-000000000001', 'proof-c81', 'Proof C81'),
  ('c8100000-0000-0000-0000-000000000002', 'proof-d81', 'Proof D81');
insert into shop_settings (tenant_id, pickup_pincode) values
  ('c8100000-0000-0000-0000-000000000001', '452009'), ('c8100000-0000-0000-0000-000000000002', '110017');
insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values
  ('c8100000-0000-0000-0000-0000000000d1', 'c8100000-0000-0000-0000-000000000001', 'checkout.proof-c81.in', 'proof-c81.in', false, '99999999-9999-9999-9999-999999999999', now(), now()),
  ('c8100000-0000-0000-0000-0000000000d2', 'c8100000-0000-0000-0000-000000000002', 'checkout.proof-d81.in', 'proof-d81.in', false, '99999999-9999-9999-9999-999999999999', now(), now());
insert into partners (id, user_id, email, name, phone, city, brands_now, terms_version, agreed_at, approved_at) values
  ('c8100000-0000-0000-0000-0000000000a1', 'c8100000-0000-0000-0000-0000000000f1', 'p81@proof.test', 'Proof Partner 81', '919876543210', 'Indore', '0', 1, now(), now());
insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values
  ('c8100000-0000-0000-0000-000000000001', 'c8100000-0000-0000-0000-0000000000a1', 2000, 24, 90),
  ('c8100000-0000-0000-0000-000000000002', 'c8100000-0000-0000-0000-0000000000a1', 2000, 24, 90);
update shop_settings set site_origin = 'https://proof-c81.in', site_domain_id = 'c8100000-0000-0000-0000-0000000000d1' where tenant_id = 'c8100000-0000-0000-0000-000000000001';
update shop_settings set site_origin = 'https://www.proof-d81.in', site_domain_id = 'c8100000-0000-0000-0000-0000000000d2' where tenant_id = 'c8100000-0000-0000-0000-000000000002';
insert into storefront_keys (id, tenant_id, kind, name, hash, prefix, partner_id, created_by, expires_at) values
  ('c8100000-0000-0000-0000-00000000000a', 'c8100000-0000-0000-0000-000000000001', 'public', 'Website', repeat('a', 64), 'frs_pub_aaaaaa', null, '99999999-9999-9999-9999-999999999999', null),
  ('c8100000-0000-0000-0000-00000000000b', 'c8100000-0000-0000-0000-000000000001', 'test', 'Preview', repeat('b', 64), 'frs_test_bbbbbb', null, '99999999-9999-9999-9999-999999999999', now() + interval '30 days'),
  ('c8100000-0000-0000-0000-00000000000c', 'c8100000-0000-0000-0000-000000000001', 'public', 'Partner site', repeat('c', 64), 'frs_pub_cccccc', 'c8100000-0000-0000-0000-0000000000a1', 'c8100000-0000-0000-0000-0000000000f1', null),
  ('c8100000-0000-0000-0000-00000000000d', 'c8100000-0000-0000-0000-000000000002', 'public', 'Partner site', repeat('d', 64), 'frs_pub_dddddd', 'c8100000-0000-0000-0000-0000000000a1', 'c8100000-0000-0000-0000-0000000000f1', null),
  ('c8100000-0000-0000-0000-00000000000e', 'c8100000-0000-0000-0000-000000000002', 'test', 'Old preview', repeat('e', 64), 'frs_test_eeeeee', null, '99999999-9999-9999-9999-999999999999', now() - interval '1 minute'),
  ('c8100000-0000-0000-0000-00000000000f', 'c8100000-0000-0000-0000-000000000002', 'test', 'D preview', repeat('f', 64), 'frs_test_ffffff', null, '99999999-9999-9999-9999-999999999999', now() + interval '30 days'),
  ('c8100000-0000-0000-0000-000000000010', 'c8100000-0000-0000-0000-000000000002', 'test', 'Partner preview', repeat('9', 64), 'frs_test_999999', 'c8100000-0000-0000-0000-0000000000a1', 'c8100000-0000-0000-0000-0000000000f1', now() + interval '30 days');
do $$ declare got text; begin
  if exists (select 1 from pg_tables where tablename = 'storefront_keys' and not rowsecurity) then raise exception 'FAIL: storefront_keys without RLS'; end if;
  if (select count(*) from pg_policies where tablename = 'storefront_keys') <> 1
     or (select count(*) from pg_policies where tablename = 'storefront_keys' and policyname = 'tenant_rows' and roles = '{frata_app}'
         and qual like '%app_current_tenant()%' and with_check like '%app_current_tenant()%' and qual not like '%is null%') <> 1
  then raise exception 'FAIL: storefront_keys without its one tenant policy'; end if;
  if not (has_table_privilege('frata_app', 'storefront_keys', 'select') and has_table_privilege('frata_app', 'storefront_keys', 'insert'))
     or exists (select 1 from unnest(array['update', 'delete', 'truncate', 'references', 'trigger']) p where has_table_privilege('frata_app', 'storefront_keys', p))
  then raise exception 'FAIL: frata_app holds other than select, insert and its columns on storefront_keys'; end if;
  select string_agg(column_name, ',' order by column_name) into got from information_schema.column_privileges where grantee = 'frata_app' and table_name = 'storefront_keys' and privilege_type = 'UPDATE';
  if got is distinct from 'last_seen_on,last_seen_version,name,revoked_at,revoked_by' then raise exception 'FAIL: frata_app updates storefront_keys columns %', got; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
             where has_table_privilege(r, 'storefront_keys', p) or has_any_column_privilege(r, 'storefront_keys', 'select') or has_any_column_privilege(r, 'storefront_keys', 'update'))
  then raise exception 'FAIL: another role reaches storefront_keys'; end if;
  if has_column_privilege('frata_admin', 'storefront_keys', 'hash', 'select') then raise exception 'FAIL: frata_admin reads a key hash'; end if;
  -- the definer: four columns, a definer pinned to an empty search_path, frata_app alone may run it
  if pg_get_function_result('app_storefront_key(text)'::regprocedure) is distinct from 'TABLE(key_id uuid, tenant_id uuid, kind text, expires_at timestamp with time zone)'
  then raise exception 'FAIL: app_storefront_key returns %', pg_get_function_result('app_storefront_key(text)'::regprocedure); end if;
  if not (select prosecdef from pg_proc where oid = 'app_storefront_key(text)'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_storefront_key(text)'::regprocedure) is distinct from array['search_path=""']
  then raise exception 'FAIL: app_storefront_key is not a pinned definer'; end if;
  if exists (select 1 from unnest(array['public', 'anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder']) r
             where r <> 'public' and has_function_privilege(r, 'app_storefront_key(text)', 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_storefront_key(text)'::regprocedure and a.grantee = 0)
     or not has_function_privilege('frata_app', 'app_storefront_key(text)', 'execute')
  then raise exception 'FAIL: app_storefront_key runs for a role other than frata_app'; end if;
  if exists (select 1 from pg_proc p, unnest(array['app_site_origin_check', 'app_site_domain_gone', 'app_storefront_key_revoked_once']) f
             where p.proname = f and (has_function_privilege('frata_app', p.oid, 'execute') or has_function_privilege('frata_admin', p.oid, 'execute')))
  then raise exception 'FAIL: a storefront-key trigger function can be called'; end if;
end $$;
-- the boundary sweep: shop ids only, for frata_app alone, inside its window
do $$ begin
  if pg_get_function_result('app_shops_with_boundary(timestamptz, timestamptz, uuid)'::regprocedure) <> 'SETOF uuid' then raise exception 'FAIL: app_shops_with_boundary returns more than ids'; end if;
  if not (select prosecdef from pg_proc where oid = 'app_shops_with_boundary(timestamptz, timestamptz, uuid)'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_shops_with_boundary(timestamptz, timestamptz, uuid)'::regprocedure) is distinct from array['search_path=""']
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, 'app_shops_with_boundary(timestamptz, timestamptz, uuid)', 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_shops_with_boundary(timestamptz, timestamptz, uuid)'::regprocedure and a.grantee = 0)
  then raise exception 'FAIL: app_shops_with_boundary is not a pinned definer for frata_app alone'; end if;
  if pg_get_function_result('app_shops_with_key_stop(timestamptz, timestamptz, uuid)'::regprocedure) <> 'SETOF uuid' then raise exception 'FAIL: app_shops_with_key_stop returns more than ids'; end if;
  if not (select prosecdef from pg_proc where oid = 'app_shops_with_key_stop(timestamptz, timestamptz, uuid)'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_shops_with_key_stop(timestamptz, timestamptz, uuid)'::regprocedure) is distinct from array['search_path=""']
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, 'app_shops_with_key_stop(timestamptz, timestamptz, uuid)', 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_shops_with_key_stop(timestamptz, timestamptz, uuid)'::regprocedure and a.grantee = 0)
     or not has_function_privilege('frata_app', 'app_shops_with_key_stop(timestamptz, timestamptz, uuid)', 'execute')
  then raise exception 'FAIL: app_shops_with_key_stop is not a pinned definer for frata_app alone'; end if;
  if pg_get_function_result('app_shops_with_content_change(timestamptz, timestamptz, uuid)'::regprocedure) <> 'SETOF uuid' then raise exception 'FAIL: app_shops_with_content_change returns more than ids'; end if;
  if not (select prosecdef from pg_proc where oid = 'app_shops_with_content_change(timestamptz, timestamptz, uuid)'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_shops_with_content_change(timestamptz, timestamptz, uuid)'::regprocedure) is distinct from array['search_path=""']
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, 'app_shops_with_content_change(timestamptz, timestamptz, uuid)', 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_shops_with_content_change(timestamptz, timestamptz, uuid)'::regprocedure and a.grantee = 0)
     or not has_function_privilege('frata_app', 'app_shops_with_content_change(timestamptz, timestamptz, uuid)', 'execute')
  then raise exception 'FAIL: app_shops_with_content_change is not a pinned definer for frata_app alone'; end if;
end $$;
begin;
select set_config('app.tenant_id', 'c8100000-0000-0000-0000-000000000001', true);
insert into site_content (tenant_id, kind, key, value, starts_at, updated_at) values
  ('c8100000-0000-0000-0000-000000000001', 'announcement', 'b1', '{"text":"Sale","link":null,"scheme":"paper"}', now() - interval '2 minutes', now() - interval '3 hours');
select set_config('app.tenant_id', 'c8100000-0000-0000-0000-000000000002', true);
insert into site_content (tenant_id, kind, key, value, starts_at, updated_at) values
  ('c8100000-0000-0000-0000-000000000002', 'contact', 'contact', '{"line":"Call us"}', null, now() - interval '3 hours');
commit;
begin; set local role frata_app;
do $$ begin
  if not exists (select 1 from app_shops_with_content_change(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000001') then raise exception 'FAIL: a bar starting in the window was missed'; end if;
  if exists (select 1 from app_shops_with_content_change(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: content saved hours ago was swept'; end if;
  if not exists (select 1 from app_shops_with_content_change(now() - interval '4 hours', now() - interval '2 hours') s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: a save in the window was missed'; end if;
end $$;
commit;
delete from site_content where tenant_id in ('c8100000-0000-0000-0000-000000000001', 'c8100000-0000-0000-0000-000000000002');
insert into products (tenant_id, handle, title, status, publish_at) values ('c8100000-0000-0000-0000-000000000002', 'drop-81', 'Drop', 'active', now() - interval '1 minute');
insert into discounts (tenant_id, title, style, percent_bps, starts_at, ends_at, created_by) values
  ('c8100000-0000-0000-0000-000000000001', 'Starts', 'order_off', 1000, now() - interval '2 minutes', null, '99999999-9999-9999-9999-999999999999');
begin; set local role frata_app;
do $$ begin
  if not exists (select 1 from app_shops_with_boundary(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: a drop in the window was missed'; end if;
  if not exists (select 1 from app_shops_with_boundary(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000001') then raise exception 'FAIL: an offer starting in the window was missed'; end if;
  if exists (select 1 from app_shops_with_boundary(now() - interval '1 hour', now() - interval '30 minutes') s where s = 'c8100000-0000-0000-0000-000000000001') then raise exception 'FAIL: an offer outside the window was swept'; end if;
  if exists (select 1 from app_shops_with_boundary(now() - interval '1 hour', now() - interval '30 minutes') s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: a moment outside the window was swept'; end if;
end $$;
commit;
-- a website's address: the same shop's live domain, its apex or www only
do $$ begin
  begin update shop_settings set site_origin = 'https://proof-d81.in', site_domain_id = 'c8100000-0000-0000-0000-0000000000d2' where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: C named D''s domain'; exception when check_violation then null; end;
  begin update shop_settings set site_origin = 'https://shop.proof-c81.in' where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: a subdomain other than www'; exception when check_violation then null; end;
  begin update shop_settings set site_origin = 'https://evil.in' where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: an origin off its domain'; exception when check_violation then null; end;
  begin update shop_settings set site_origin = 'https://proof-c81.in/x' where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: an origin with a path'; exception when check_violation then null; end;
  begin update shop_settings set site_domain_id = null where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: an origin without its domain'; exception when check_violation then null; end;
end $$;
-- as frata_app, C can't name D's domain, and the refusal says nothing about whether the id exists
begin; set local role frata_app;
select set_config('app.tenant_id', 'c8100000-0000-0000-0000-000000000001', true);
do $$ declare m1 text; m2 text; begin
  begin update shop_settings set site_origin = 'https://proof-d81.in', site_domain_id = 'c8100000-0000-0000-0000-0000000000d2' where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: C named D''s domain as frata_app'; exception when check_violation then get stacked diagnostics m1 = message_text; end;
  begin update shop_settings set site_origin = 'https://proof-d81.in', site_domain_id = gen_random_uuid() where tenant_id = 'c8100000-0000-0000-0000-000000000001';
    raise exception 'FAIL: an unknown domain id'; exception when check_violation or foreign_key_violation then get stacked diagnostics m2 = message_text; end;
  if m1 not like 'site domain not live%' then raise exception 'FAIL: naming D''s domain answered %', m1; end if;
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', 'c8100000-0000-0000-0000-000000000001', true);
do $$ declare n int; begin
  if (select count(*) from storefront_keys) <> 3 or exists (select 1 from storefront_keys where tenant_id <> 'c8100000-0000-0000-0000-000000000001')
  then raise exception 'FAIL: C sees other than its own keys'; end if;
  insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values ('c8100000-0000-0000-0000-000000000001', 'public', 'Second', repeat('1', 64), 'frs_pub_111111', '99999999-9999-9999-9999-999999999999');
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values ('c8100000-0000-0000-0000-000000000002', 'public', 'Forged', repeat('2', 64), 'frs_pub_222222', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: C wrote a key into D'; exception when insufficient_privilege then null; end;
  update storefront_keys set name = 'Taken' where id = 'c8100000-0000-0000-0000-00000000000d'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C renamed D''s key'; end if;
  update storefront_keys set revoked_at = now(), revoked_by = '99999999-9999-9999-9999-999999999999' where id = 'c8100000-0000-0000-0000-00000000000f'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C deleted D''s key'; end if;
  begin update storefront_keys set hash = repeat('9', 64) where id = 'c8100000-0000-0000-0000-00000000000a'; raise exception 'FAIL: frata_app changes a hash'; exception when insufficient_privilege then null; end;
  begin update storefront_keys set kind = 'test' where id = 'c8100000-0000-0000-0000-00000000000a'; raise exception 'FAIL: frata_app changes a kind'; exception when insufficient_privilege then null; end;
  begin update storefront_keys set tenant_id = 'c8100000-0000-0000-0000-000000000002'; raise exception 'FAIL: C moved a key to D'; exception when insufficient_privilege then null; end;
  begin update storefront_keys set partner_id = null; raise exception 'FAIL: frata_app changes a key''s partner'; exception when insufficient_privilege then null; end;
  begin delete from storefront_keys where id = 'c8100000-0000-0000-0000-00000000000a'; raise exception 'FAIL: frata_app deletes keys'; exception when insufficient_privilege then null; end;
  -- deleted once, for good
  update storefront_keys set revoked_at = now(), revoked_by = '99999999-9999-9999-9999-999999999999' where hash = repeat('1', 64);
  begin update storefront_keys set revoked_at = null, revoked_by = null where hash = repeat('1', 64); raise exception 'FAIL: a deleted key came back';
  exception when check_violation then null; end;
  -- the shape
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values ('c8100000-0000-0000-0000-000000000001', 'test', 'No end', repeat('3', 64), 'frs_test_333333', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a test key with no end'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values ('c8100000-0000-0000-0000-000000000001', 'public', 'Bad hash', 'ABC', 'frs_pub_444444', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a hash that is not sha256 hex'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values ('c8100000-0000-0000-0000-000000000001', 'public', repeat('x', 41), repeat('5', 64), 'frs_pub_555555', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a 41-character name'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values ('c8100000-0000-0000-0000-000000000001', 'live', 'Kind', repeat('6', 64), 'frs_pub_666666', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: an unknown kind'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by, expires_at) values ('c8100000-0000-0000-0000-000000000001', 'test', 'Long', repeat('8', 64), 'frs_test_888888', '99999999-9999-9999-9999-999999999999', now() + interval '31 days');
    raise exception 'FAIL: a test key past 30 days'; exception when check_violation then null; end;
end $$;
commit;
begin; set local role frata_app;
select set_config('app.tenant_id', '', true);
do $$ begin
  if exists (select 1 from storefront_keys) then raise exception 'FAIL: keys read with no shop set'; end if;
end $$;
commit;
-- the definer, as frata_app with no shop set (how apiRequest calls it)
create or replace function pg_temp.skey(h text) returns uuid language sql as $$ select tenant_id from app_storefront_key(h) $$;
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('a', 64)) is distinct from 'c8100000-0000-0000-0000-000000000001' then raise exception 'FAIL: C''s live key does not name C'; end if;
  if pg_temp.skey(repeat('b', 64)) is distinct from 'c8100000-0000-0000-0000-000000000001' then raise exception 'FAIL: C''s test key before opening does not answer'; end if;
  if pg_temp.skey(repeat('d', 64)) is distinct from 'c8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: D''s partner key does not name D'; end if;
  if pg_temp.skey(repeat('e', 64)) is not null then raise exception 'FAIL: an expired test key answers'; end if;
  if pg_temp.skey(repeat('1', 64)) is not null then raise exception 'FAIL: a deleted key answers'; end if;
  if pg_temp.skey(repeat('7', 64)) is not null then raise exception 'FAIL: an unknown key answers'; end if;
  if (select count(*) from app_storefront_key(repeat('a', 64))) <> 1 then raise exception 'FAIL: one key, more than one row'; end if;
end $$;
commit;
-- every stop is derived: the store opens, the partner's link ends, the partner is suspended, the domain goes, back to Frrata
insert into members (tenant_id, user_id, role) values ('c8100000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'owner');
update shop_settings set published_at = now() where tenant_id = 'c8100000-0000-0000-0000-000000000001';
update shop_settings set published_at = null where tenant_id = 'c8100000-0000-0000-0000-000000000001';
update partner_links set removed_at = now() where tenant_id = 'c8100000-0000-0000-0000-000000000001' and partner_id = 'c8100000-0000-0000-0000-0000000000a1';
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('b', 64)) is not null then raise exception 'FAIL: a test key answers after the store first opened (closed again since)'; end if;
  if pg_temp.skey(repeat('a', 64)) is null then raise exception 'FAIL: opening stopped a live key'; end if;
  if pg_temp.skey(repeat('f', 64)) is distinct from 'c8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: C opening stopped D''s test key'; end if;
  if pg_temp.skey(repeat('c', 64)) is not null then raise exception 'FAIL: a removed partner''s key answers'; end if;
  if pg_temp.skey(repeat('d', 64)) is null then raise exception 'FAIL: removing the partner from C stopped its key on D'; end if;
  if not exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000001') then raise exception 'FAIL: the sweep missed C''s removed partner'; end if;
  if exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: the sweep purged D for C''s partner'; end if;
  if exists (select 1 from app_shops_with_key_stop(now() - interval '1 hour', now() - interval '30 minutes')) then raise exception 'FAIL: the key sweep reached outside its window'; end if;
end $$;
commit;
update partner_links set removed_at = now() - interval '2 hours' where tenant_id = 'c8100000-0000-0000-0000-000000000001' and partner_id = 'c8100000-0000-0000-0000-0000000000a1';
update partners set suspended_at = now() where id = 'c8100000-0000-0000-0000-0000000000a1';
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('d', 64)) is not null then raise exception 'FAIL: a suspended partner''s key answers'; end if;
  if not exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: the sweep missed a suspended partner''s shop'; end if;
end $$;
commit;
update partners set suspended_at = null where id = 'c8100000-0000-0000-0000-0000000000a1';
update shop_domains set removed_at = now(), removed_reason = 'proof', removed_by = '99999999-9999-9999-9999-999999999999' where id = 'c8100000-0000-0000-0000-0000000000d2';
do $$ begin
  if (select site_origin from shop_settings where tenant_id = 'c8100000-0000-0000-0000-000000000002') is not null then raise exception 'FAIL: a removed domain kept its website address'; end if;
  if (select site_origin from shop_settings where tenant_id = 'c8100000-0000-0000-0000-000000000001') is null then raise exception 'FAIL: D''s domain cleared C''s address'; end if;
end $$;
update shop_settings set site_origin = null, site_domain_id = null where tenant_id = 'c8100000-0000-0000-0000-000000000001';
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('d', 64)) is not null then raise exception 'FAIL: a key answers once its domain is removed'; end if;
  if pg_temp.skey(repeat('a', 64)) is not null then raise exception 'FAIL: a key answers while the store runs on Frrata'; end if;
  if not exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s = 'c8100000-0000-0000-0000-000000000002') then raise exception 'FAIL: the sweep missed a removed domain'; end if;
  -- 0149 (owner, 2026-11-16): with no Website at all (D's domain just went, which clears it), a test key on a store never
  -- opened answers; never on an opened one (C), never a public key, never an expired one.
  if pg_temp.skey(repeat('f', 64)) is distinct from 'c8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: D''s test key does not answer with no Website'; end if;
  if pg_temp.skey(repeat('9', 64)) is distinct from 'c8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: D''s partner test key does not answer with no Website'; end if;
  if pg_temp.skey(repeat('b', 64)) is not null then raise exception 'FAIL: a test key answers with no Website on a store that opened'; end if;
  if pg_temp.skey(repeat('e', 64)) is not null then raise exception 'FAIL: an expired test key answers with no Website'; end if;
end $$;
commit;
-- and every other stop still holds with no Website: the partner suspended, its link ended, the key deleted
update partners set suspended_at = now() where id = 'c8100000-0000-0000-0000-0000000000a1';
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('9', 64)) is not null then raise exception 'FAIL: a suspended partner''s test key answers with no Website'; end if;
  if pg_temp.skey(repeat('f', 64)) is null then raise exception 'FAIL: suspending the partner stopped the store''s own test key'; end if;
end $$;
commit;
update partners set suspended_at = null where id = 'c8100000-0000-0000-0000-0000000000a1';
update partner_links set removed_at = now() where tenant_id = 'c8100000-0000-0000-0000-000000000002' and partner_id = 'c8100000-0000-0000-0000-0000000000a1';
update storefront_keys set revoked_at = now(), revoked_by = '99999999-9999-9999-9999-999999999999' where id = 'c8100000-0000-0000-0000-00000000000f';
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('9', 64)) is not null then raise exception 'FAIL: a test key answers with no Website after its partner''s link ended'; end if;
  if pg_temp.skey(repeat('f', 64)) is not null then raise exception 'FAIL: a deleted test key answers with no Website'; end if;
end $$;
commit;
-- 81 (cont.) · Build keys (Studio plan G·2, 0156–0157; ADR-0018's build-key amendment). A build key's shape follows its
-- purpose (24 hours, a preview's 30 days); before the store ever opened it answers as a test key does; after opening only
-- with a partner, and a partner person's key only while that person is live in the partner, still a member of the store
-- and, for a Lead or a Builder, assigned to it. app_build_key_makers names the caller's own store's makers only;
-- app_delete_ended_build_keys deletes ended build keys (and, since 0162, ended device codes) and nothing else; the maker
-- check itself runs for no role.
insert into tenants (id, slug, name) values
  ('e8100000-0000-0000-0000-000000000001', 'proof-e81', 'Proof E81'),
  ('e8100000-0000-0000-0000-000000000002', 'proof-f81', 'Proof F81');
insert into shop_settings (tenant_id, pickup_pincode) values
  ('e8100000-0000-0000-0000-000000000001', '452009'), ('e8100000-0000-0000-0000-000000000002', '110017');
insert into auth.users (id, email, email_confirmed_at) values
  ('e8100000-0000-0000-0000-0000000000f1', 'owner@studio81.test', now()),
  ('e8100000-0000-0000-0000-0000000000f2', 'lead@studio81.test', now()),
  ('e8100000-0000-0000-0000-0000000000f3', 'builder@studio81.test', now()),
  ('e8100000-0000-0000-0000-0000000000f4', 'gone@studio81.test', now());
insert into partners (id, user_id, email, name, business_name, phone, city, brands_now, terms_version, agreed_at, approved_at) values
  ('e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f1', 'owner@studio81.test', 'Asha Rao', 'Studio 81', '919876543281', 'Indore', '0', 1, now(), now());
insert into partner_members (id, partner_id, user_id, email, role, accepted_at) values
  ('e8100000-0000-0000-0000-0000000000b1', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f1', 'owner@studio81.test', 'owner', now()),
  ('e8100000-0000-0000-0000-0000000000b2', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f2', 'lead@studio81.test', 'lead', now()),
  ('e8100000-0000-0000-0000-0000000000b3', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f3', 'builder@studio81.test', 'builder', now()),
  ('e8100000-0000-0000-0000-0000000000b4', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f4', 'gone@studio81.test', 'lead', now());
insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values
  ('e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-0000000000a1', 2000, 24, 90),
  ('e8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-0000000000a1', 2000, 24, 90);
insert into members (tenant_id, user_id, role, partner_member_id) values
  ('e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-0000000000f1', 'partner', 'e8100000-0000-0000-0000-0000000000b1'),
  ('e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-0000000000f2', 'partner', 'e8100000-0000-0000-0000-0000000000b2'),
  ('e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-0000000000f3', 'builder', 'e8100000-0000-0000-0000-0000000000b3'),
  ('e8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-0000000000f1', 'partner', 'e8100000-0000-0000-0000-0000000000b1'),
  ('e8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-0000000000f2', 'partner', 'e8100000-0000-0000-0000-0000000000b2'),
  ('e8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-0000000000f3', 'builder', 'e8100000-0000-0000-0000-0000000000b3'),
  ('e8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-0000000000f4', 'partner', 'e8100000-0000-0000-0000-0000000000b4'),
  ('e8100000-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', 'owner', null),
  ('e8100000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'owner', null);
insert into partner_assignments (partner_member_id, tenant_id) values
  ('e8100000-0000-0000-0000-0000000000b2', 'e8100000-0000-0000-0000-000000000001'),
  ('e8100000-0000-0000-0000-0000000000b2', 'e8100000-0000-0000-0000-000000000002'),
  ('e8100000-0000-0000-0000-0000000000b3', 'e8100000-0000-0000-0000-000000000001'),
  ('e8100000-0000-0000-0000-0000000000b4', 'e8100000-0000-0000-0000-000000000002');
update tenants set first_opened_at = now() - interval '1 day' where id = 'e8100000-0000-0000-0000-000000000002';
insert into storefront_keys (id, tenant_id, kind, purpose, name, hash, prefix, partner_id, created_by, expires_at) values
  -- E (never opened, no Website): the store's own build key, a Lead's, an unassigned-anywhere Builder's
  ('e8100000-0000-0000-0000-000000000011', 'e8100000-0000-0000-0000-000000000001', 'build', 'session', 'Studio session', repeat('e', 63) || '1', 'frs_build_e81aaa', null, '99999999-9999-9999-9999-999999999999', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000012', 'e8100000-0000-0000-0000-000000000001', 'build', 'developer', 'Lead computer', repeat('e', 63) || '2', 'frs_build_e81bbb', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f2', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000013', 'e8100000-0000-0000-0000-000000000001', 'build', 'preview', 'Preview v1', repeat('e', 63) || '3', 'frs_build_e81ccc', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f3', now() + interval '30 days'),
  -- F (opened): the store's own, the partner's owner's, a Lead's, a Builder's (not assigned to F), a Lead about to leave
  ('e8100000-0000-0000-0000-000000000021', 'e8100000-0000-0000-0000-000000000002', 'build', 'session', 'Own session', repeat('e', 63) || '4', 'frs_build_f81aaa', null, '99999999-9999-9999-9999-999999999999', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000022', 'e8100000-0000-0000-0000-000000000002', 'build', 'session', 'Owner session', repeat('e', 63) || '5', 'frs_build_f81bbb', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f1', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000023', 'e8100000-0000-0000-0000-000000000002', 'build', 'developer', 'Lead computer', repeat('e', 63) || '6', 'frs_build_f81ccc', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f2', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000024', 'e8100000-0000-0000-0000-000000000002', 'build', 'developer', 'Builder computer', repeat('e', 63) || '7', 'frs_build_f81ddd', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f3', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000025', 'e8100000-0000-0000-0000-000000000002', 'build', 'developer', 'Leaving', repeat('e', 63) || '8', 'frs_build_f81eee', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f4', now() + interval '24 hours'),
  ('e8100000-0000-0000-0000-000000000026', 'e8100000-0000-0000-0000-000000000002', 'build', 'session', 'Ended', repeat('e', 63) || '9', 'frs_build_f81fff', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f2', now() + interval '1 hour');
update storefront_keys set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where id = 'e8100000-0000-0000-0000-000000000026';
-- the shape: a purpose on every build key and nowhere else; its end; its prefix
do $$ begin
  begin insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'build', 'No purpose', repeat('d', 63) || '1', 'frs_build_d81aaa', '99999999-9999-9999-9999-999999999999', now() + interval '1 hour');
    raise exception 'FAIL: a build key with no purpose'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'test', 'session', 'Test purpose', repeat('d', 63) || '2', 'frs_test_d81bbb', '99999999-9999-9999-9999-999999999999', now() + interval '1 hour');
    raise exception 'FAIL: a test key with a purpose'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'build', 'session', 'Long session', repeat('d', 63) || '3', 'frs_build_d81ccc', '99999999-9999-9999-9999-999999999999', now() + interval '25 hours');
    raise exception 'FAIL: a session key past 24 hours'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'build', 'preview', 'Long preview', repeat('d', 63) || '4', 'frs_build_d81ddd', '99999999-9999-9999-9999-999999999999', now() + interval '31 days');
    raise exception 'FAIL: a preview key past 30 days'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'build', 'session', 'No end', repeat('d', 63) || '5', 'frs_build_d81eee', '99999999-9999-9999-9999-999999999999', null);
    raise exception 'FAIL: a build key with no end'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'build', 'session', 'Wrong prefix', repeat('d', 63) || '6', 'frs_test_d81fff', '99999999-9999-9999-9999-999999999999', now() + interval '1 hour');
    raise exception 'FAIL: a build key with a test prefix'; exception when check_violation then null; end;
  begin insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values ('e8100000-0000-0000-0000-000000000001', 'build', 'agent', 'Bad purpose', repeat('d', 63) || '7', 'frs_build_d81ggg', '99999999-9999-9999-9999-999999999999', now() + interval '1 hour');
    raise exception 'FAIL: an unknown purpose'; exception when check_violation then null; end;
  if exists (select 1 from pg_proc p, unnest(array['frata_app', 'frata_admin', 'frata_builder', 'anon', 'authenticated', 'service_role']) r
             where p.oid = 'app_build_key_maker_live(uuid, uuid, uuid)'::regprocedure and has_function_privilege(r, p.oid, 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_build_key_maker_live(uuid, uuid, uuid)'::regprocedure and a.grantee = 0)
  then raise exception 'FAIL: the build-key maker check can be called'; end if;
  if pg_get_function_result('app_build_key_makers()'::regprocedure) is distinct from 'TABLE(user_id uuid, email text, partner_name text, live boolean, left_at timestamp with time zone)'
     or not (select prosecdef from pg_proc where oid = 'app_build_key_makers()'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_build_key_makers()'::regprocedure) is distinct from array['search_path=""']
     or not (select prosecdef from pg_proc where oid = 'app_delete_ended_build_keys()'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_delete_ended_build_keys()'::regprocedure) is distinct from array['search_path=""']
  then raise exception 'FAIL: a build-key definer is not pinned or returns more'; end if;
  if exists (select 1 from unnest(array['app_build_key_makers()', 'app_delete_ended_build_keys()']) f, unnest(array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder']) r
             where has_function_privilege(r, f::regprocedure, 'execute'))
     or exists (select 1 from unnest(array['app_build_key_makers()', 'app_delete_ended_build_keys()']) f, pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0)
     or not has_function_privilege('frata_app', 'app_build_key_makers()', 'execute')
     or not has_function_privilege('frata_app', 'app_delete_ended_build_keys()', 'execute')
  then raise exception 'FAIL: a build-key definer runs for a role other than frata_app'; end if;
end $$;
begin; set local role frata_app;
do $$ begin
  -- before opening, as a test key does: the store's own and its assigned partner people's
  if pg_temp.skey(repeat('e', 63) || '1') is distinct from 'e8100000-0000-0000-0000-000000000001' then raise exception 'FAIL: E''s own build key does not answer before opening'; end if;
  if pg_temp.skey(repeat('e', 63) || '2') is distinct from 'e8100000-0000-0000-0000-000000000001' then raise exception 'FAIL: E''s Lead''s build key does not answer'; end if;
  if pg_temp.skey(repeat('e', 63) || '3') is distinct from 'e8100000-0000-0000-0000-000000000001' then raise exception 'FAIL: E''s assigned Builder''s preview key does not answer'; end if;
  if (select kind from app_storefront_key(repeat('e', 63) || '2')) is distinct from 'build' then raise exception 'FAIL: a build key answers as another kind'; end if;
  -- after opening: only a partner's, only while its maker is live, a member and (Lead, Builder) assigned
  if pg_temp.skey(repeat('e', 63) || '4') is not null then raise exception 'FAIL: an opened store''s own build key answers (decision 5: partners only)'; end if;
  if pg_temp.skey(repeat('e', 63) || '5') is distinct from 'e8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: the partner owner''s build key on F does not answer'; end if;
  if pg_temp.skey(repeat('e', 63) || '6') is distinct from 'e8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: an assigned Lead''s build key on F does not answer'; end if;
  if pg_temp.skey(repeat('e', 63) || '7') is not null then raise exception 'FAIL: an unassigned Builder''s build key answers on F'; end if;
  if pg_temp.skey(repeat('e', 63) || '8') is distinct from 'e8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: the leaving Lead''s key does not answer yet'; end if;
  if pg_temp.skey(repeat('e', 63) || '9') is not null then raise exception 'FAIL: an ended build key answers'; end if;
end $$;
commit;
-- the Lead leaves the partner, the other Lead is unassigned from F, the Builder loses its member row on E
update partner_members set removed_at = now(), removed_by = 'e8100000-0000-0000-0000-0000000000f1' where id = 'e8100000-0000-0000-0000-0000000000b4';
delete from partner_assignments where partner_member_id = 'e8100000-0000-0000-0000-0000000000b2' and tenant_id = 'e8100000-0000-0000-0000-000000000002';
delete from members where tenant_id = 'e8100000-0000-0000-0000-000000000001' and user_id = 'e8100000-0000-0000-0000-0000000000f3';
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('e', 63) || '8') is not null then raise exception 'FAIL: a removed Lead''s build key answers'; end if;
  if pg_temp.skey(repeat('e', 63) || '6') is not null then raise exception 'FAIL: an unassigned Lead''s build key answers on F'; end if;
  if pg_temp.skey(repeat('e', 63) || '2') is distinct from 'e8100000-0000-0000-0000-000000000001' then raise exception 'FAIL: unassigning the Lead from F stopped its key on E'; end if;
  if pg_temp.skey(repeat('e', 63) || '3') is not null then raise exception 'FAIL: a Builder''s build key answers once its member row is gone'; end if;
  if pg_temp.skey(repeat('e', 63) || '5') is distinct from 'e8100000-0000-0000-0000-000000000002' then raise exception 'FAIL: the partner owner''s key stopped with its colleagues'' changes'; end if;
end $$;
commit;
-- a build key the store's own people made stops once its maker holds no members row there (tenancy audit 2026-11-22)
insert into storefront_keys (id, tenant_id, kind, purpose, name, hash, prefix, partner_id, created_by, expires_at) values
  ('e8100000-0000-0000-0000-000000000031', 'e8100000-0000-0000-0000-000000000001', 'build', 'session', 'Gone owner', repeat('e', 62) || '10', 'frs_build_e81ddd', null, 'e8100000-0000-0000-0000-0000000000f4', now() + interval '24 hours');
begin; set local role frata_app;
do $$ begin
  if pg_temp.skey(repeat('e', 62) || '10') is not null then raise exception 'FAIL: a build key whose own-store maker is no member answers'; end if;
end $$;
commit;
delete from storefront_keys where id = 'e8100000-0000-0000-0000-000000000031';
-- the makers' list: the caller's own store only, live as the definer says, the leaving date
begin; set local role frata_app;
select set_config('app.tenant_id', 'e8100000-0000-0000-0000-000000000002', true);
do $$ begin
  if (select count(*) from app_build_key_makers()) <> 4 then raise exception 'FAIL: F''s makers are not its four partner people (got %)', (select count(*) from app_build_key_makers()); end if;
  if exists (select 1 from app_build_key_makers() where user_id = '99999999-9999-9999-9999-999999999999') then raise exception 'FAIL: the makers list names a key with no partner'; end if;
  if (select live from app_build_key_makers() where user_id = 'e8100000-0000-0000-0000-0000000000f1') is not true then raise exception 'FAIL: the partner owner reads as gone'; end if;
  if (select live from app_build_key_makers() where user_id = 'e8100000-0000-0000-0000-0000000000f2') is not false then raise exception 'FAIL: the unassigned Lead reads as live on F'; end if;
  if (select left_at from app_build_key_makers() where user_id = 'e8100000-0000-0000-0000-0000000000f4') is null then raise exception 'FAIL: the removed Lead has no leaving date'; end if;
  if (select partner_name from app_build_key_makers() where user_id = 'e8100000-0000-0000-0000-0000000000f1') is distinct from 'Studio 81' then raise exception 'FAIL: the maker''s partner is not named'; end if;
end $$;
select set_config('app.tenant_id', 'c8100000-0000-0000-0000-000000000001', true);
do $$ begin if exists (select 1 from app_build_key_makers()) then raise exception 'FAIL: C reads F''s build-key makers'; end if; end $$;
select set_config('app.tenant_id', '', true);
do $$ begin if exists (select 1 from app_build_key_makers()) then raise exception 'FAIL: the makers list answers with no store set'; end if; end $$;
commit;
-- the daily delete: ended build keys only
begin; set local role frata_app;
do $$ declare n int; begin
  n := app_delete_ended_build_keys();
  if n < 1 then raise exception 'FAIL: the ended build key was not deleted'; end if;
end $$;
commit;
do $$ begin
  if exists (select 1 from storefront_keys where id = 'e8100000-0000-0000-0000-000000000026') then raise exception 'FAIL: an ended build key survived the daily delete'; end if;
  if (select count(*) from storefront_keys where tenant_id in ('e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000002')) <> 8 then raise exception 'FAIL: the daily delete took a live key'; end if;
  if not exists (select 1 from storefront_keys where id = 'c8100000-0000-0000-0000-00000000000e') then raise exception 'FAIL: the daily delete took an ended test key'; end if;
end $$;
-- D0·3 (0158): the opening check counts the caller's own store's keys that still answer before an opening, never
-- another store's, 0 with no store set and 0 once the store ever opened
begin; set local role frata_app;
select set_config('app.tenant_id', 'e8100000-0000-0000-0000-000000000001', true);
do $$ begin
  -- E (never opened): its own build key and the Lead's still answer; the Builder lost its members row above
  if app_store_building_keys() <> 2 then raise exception 'FAIL: E''s building keys are not its two that answer (got %)', app_store_building_keys(); end if;
end $$;
select set_config('app.tenant_id', 'e8100000-0000-0000-0000-000000000002', true);
do $$ begin if app_store_building_keys() <> 0 then raise exception 'FAIL: an opened store counts building keys'; end if; end $$;
select set_config('app.tenant_id', '', true);
do $$ begin if app_store_building_keys() <> 0 then raise exception 'FAIL: the opening check counts with no store set'; end if; end $$;
commit;
do $$ begin
  if not (select prosecdef from pg_proc where oid = 'app_store_building_keys()'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_store_building_keys()'::regprocedure) is distinct from array['search_path=""']
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder']) r where has_function_privilege(r, 'app_store_building_keys()', 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_store_building_keys()'::regprocedure and a.grantee = 0)
     or not has_function_privilege('frata_app', 'app_store_building_keys()', 'execute')
  then raise exception 'FAIL: app_store_building_keys is not a pinned definer for frata_app alone'; end if;
end $$;
-- G·3 (0159–0160, 0162): a device sign-in. No role reaches the table; the definers are pinned and frata_app alone runs
-- them (the two internal helpers run for no role); 0160's store-side peek and approve are gone. A code is looked at and
-- given a key only by a live Partner owner or an assigned Lead of the store's partner, with a passkey challenge made for
-- THAT code, taken once, by that person, the counter rising, and the store under its ceiling; the CLI's poll claims it
-- once; Your computers lists and deletes only the person's own developer keys; an ended code is gone.
do $$ begin
  if exists (select 1 from pg_tables where tablename = 'build_key_device_codes' and not rowsecurity) then raise exception 'FAIL: build_key_device_codes without RLS'; end if;
  if (select count(*) from pg_policies where tablename = 'build_key_device_codes' and policyname = 'definer_only' and permissive = 'RESTRICTIVE' and qual = 'false') <> 1 then raise exception 'FAIL: build_key_device_codes without its definer_only policy'; end if;
  if exists (select 1 from unnest(array['frata_app', 'frata_admin', 'frata_builder', 'anon', 'authenticated', 'service_role']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
             where has_table_privilege(r, 'build_key_device_codes', p))
  then raise exception 'FAIL: a role reaches build_key_device_codes'; end if;
  if exists (select 1 from unnest(array['app_device_code_start(text, text, text, text)', 'app_device_code_look(uuid, uuid, text, text, text)',
               'app_device_code_challenge(uuid, uuid, text, text, text, text, boolean)', 'app_device_code_take(uuid, uuid, text, text, text)',
               'app_device_code_give(uuid, uuid, text, text, text, uuid, bigint)', 'app_device_code_claim(text)', 'app_device_code_unclaim(text)',
               'app_partner_developer_keys(uuid, uuid, text)', 'app_partner_developer_key_delete(uuid, uuid, text, uuid)']) f
             where not (select prosecdef from pg_proc where oid = f::regprocedure)
                or (select proconfig from pg_proc where oid = f::regprocedure) is distinct from array['search_path=""']
                or not has_function_privilege('frata_app', f::regprocedure, 'execute')
                or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder']) r where has_function_privilege(r, f::regprocedure, 'execute'))
                or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = f::regprocedure and a.grantee = 0))
  then raise exception 'FAIL: a device-code definer is not pinned to frata_app alone'; end if;
  if exists (select 1 from unnest(array['app_device_partner_ok(uuid, uuid)', 'app_device_store_full(uuid)']) f, unnest(array['frata_app', 'frata_admin', 'frata_builder', 'anon', 'authenticated', 'service_role']) r
             where has_function_privilege(r, f::regprocedure, 'execute'))
  then raise exception 'FAIL: a role runs a device-code helper'; end if;
  if to_regprocedure('app_device_code_peek(uuid, text)') is not null or to_regprocedure('app_device_code_approve(uuid, text, text)') is not null
     or to_regprocedure('app_device_code_start(text, text, text)') is not null
  then raise exception 'FAIL: 0160''s store-side peek, approve or three-argument start is still there'; end if;
end $$;
-- Each partner person has a passkey and a live check on one session (as the gate makes them); the store's owner has none.
insert into partner_passkeys (id, partner_member_id, user_id, credential_id, public_key, name) values
  ('e8100000-0000-0000-0000-0000000000c1', 'e8100000-0000-0000-0000-0000000000b1', 'e8100000-0000-0000-0000-0000000000f1', 'cred-f1', 'pk-f1', 'Laptop'),
  ('e8100000-0000-0000-0000-0000000000c2', 'e8100000-0000-0000-0000-0000000000b2', 'e8100000-0000-0000-0000-0000000000f2', 'cred-f2', 'pk-f2', 'Laptop'),
  ('e8100000-0000-0000-0000-0000000000c3', 'e8100000-0000-0000-0000-0000000000b3', 'e8100000-0000-0000-0000-0000000000f3', 'cred-f3', 'pk-f3', 'Laptop'),
  ('e8100000-0000-0000-0000-0000000000c4', 'e8100000-0000-0000-0000-0000000000b4', 'e8100000-0000-0000-0000-0000000000f4', 'cred-f4', 'pk-f4', 'Laptop');
insert into partner_stepups (partner_member_id, user_id, session_id, passkey_id, token_hash, expires_at) values
  ('e8100000-0000-0000-0000-0000000000b1', 'e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'e8100000-0000-0000-0000-0000000000c1', 'stepup-f1', now() + interval '1 hour'),
  ('e8100000-0000-0000-0000-0000000000b2', 'e8100000-0000-0000-0000-0000000000f2', 'e8100000-0000-0000-0000-0000000000d2', 'e8100000-0000-0000-0000-0000000000c2', 'stepup-f2', now() + interval '1 hour'),
  ('e8100000-0000-0000-0000-0000000000b3', 'e8100000-0000-0000-0000-0000000000f3', 'e8100000-0000-0000-0000-0000000000d3', 'e8100000-0000-0000-0000-0000000000c3', 'stepup-f3', now() + interval '1 hour'),
  ('e8100000-0000-0000-0000-0000000000b4', 'e8100000-0000-0000-0000-0000000000f4', 'e8100000-0000-0000-0000-0000000000d4', 'e8100000-0000-0000-0000-0000000000c4', 'stepup-f4', now() + interval '1 hour');
insert into storefront_keys (id, tenant_id, kind, purpose, name, hash, prefix, partner_id, created_by, expires_at) values
  ('e8100000-0000-0000-0000-000000000031', 'e8100000-0000-0000-0000-000000000001', 'build', 'developer', 'To delete', repeat('e', 62) || '31', 'frs_build_e81ddd', 'e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f2', now() + interval '24 hours');
begin; set local role frata_app;
do $$ declare c record; j jsonb; n int; s text;
  f1 uuid := 'e8100000-0000-0000-0000-0000000000f1'; f2 uuid := 'e8100000-0000-0000-0000-0000000000f2'; f3 uuid := 'e8100000-0000-0000-0000-0000000000f3'; f4 uuid := 'e8100000-0000-0000-0000-0000000000f4';
  d1 uuid := 'e8100000-0000-0000-0000-0000000000d1'; d2 uuid := 'e8100000-0000-0000-0000-0000000000d2'; d3 uuid := 'e8100000-0000-0000-0000-0000000000d3'; d4 uuid := 'e8100000-0000-0000-0000-0000000000d4';
  net text := repeat('9', 64); code1 text := repeat('b', 63) || '1'; ch text := repeat('Q', 43);
begin
  perform app_device_code_start(repeat('a', 63) || '1', code1, 'proof-e81', net);
  perform app_device_code_start(repeat('a', 63) || '2', repeat('b', 63) || '2', 'proof-e81');
  perform app_device_code_start(repeat('a', 63) || '3', repeat('b', 63) || '3', 'no-such-store', net);
  begin perform app_device_code_start('x', repeat('b', 63) || '4', 'proof-e81'); raise exception 'FAIL: a device hash of another shape'; exception when invalid_parameter_value then null; end;
  begin perform app_device_code_start(repeat('a', 63) || '5', repeat('b', 63) || '5', 'proof-e81', '10.0.0.0/24'); raise exception 'FAIL: a network stored as written'; exception when invalid_parameter_value then null; end;
  begin insert into build_key_device_codes (device_hash, code_hash, store_slug, expires_at) values (repeat('c', 64), repeat('d', 64), 'proof-e81', now() + interval '1 minute');
    raise exception 'FAIL: frata_app wrote a device code'; exception when insufficient_privilege then null; end;
  select * into c from app_device_code_claim(repeat('a', 63) || '1');
  if c.state is distinct from 'pending' then raise exception 'FAIL: an unconfirmed sign-in is not pending'; end if;
  -- who may look: the Partner owner (f1) and an assigned Lead (f2); not a Lead removed from the partner above (f4: their
  -- check ended with them), a Builder (f3), the store's own owner (no partner check at all), or the Partner owner with
  -- someone else's step-up
  begin perform app_device_code_look(f4, d4, 'stepup-f4', code1, net); raise exception 'FAIL: a removed Lead looked at a code';
  exception when raise_exception then if sqlerrm not in ('confirm_first') then raise; end if; end;
  if app_device_code_look(f3, d3, 'stepup-f3', code1, net) is not null then raise exception 'FAIL: a Builder sees a code'; end if;
  begin perform app_device_code_look('99999999-9999-9999-9999-999999999999', d1, 'stepup-f1', code1, net); raise exception 'FAIL: the store''s own owner looked at a code';
  exception when raise_exception then if sqlerrm not in ('confirm_first') then raise; end if; end;
  begin perform app_device_code_look(f1, d2, 'stepup-f2', code1, net); raise exception 'FAIL: a look with another person''s check';
  exception when raise_exception then if sqlerrm not in ('confirm_first') then raise; end if; end;
  j := app_device_code_look(f1, d1, 'stepup-f1', code1, net);
  if j->>'store' is distinct from 'Proof E81' or (j->>'sameNetwork')::boolean is not true or (j->>'full')::boolean or not (j->>'hasPasskey')::boolean
  then raise exception 'FAIL: the Partner owner does not see E, the same network, room and a passkey (got %)', j; end if;
  if (app_device_code_look(f2, d2, 'stepup-f2', code1, repeat('8', 64))->>'sameNetwork')::boolean is not false then raise exception 'FAIL: another network not marked'; end if;
  if app_device_code_look(f2, d2, 'stepup-f2', repeat('b', 63) || '2', net)->>'sameNetwork' is not null then raise exception 'FAIL: a code with no network compared'; end if;
  if app_device_code_look(f1, d1, 'stepup-f1', repeat('b', 63) || '3', net) is not null then raise exception 'FAIL: a code for an unknown store looked at'; end if;
  -- Give key: a challenge for THIS code; a Builder gets none; taken once, only by its asker, only with their own passkey
  begin perform app_device_code_challenge(f3, d3, 'stepup-f3', code1, ch, null, true); raise exception 'FAIL: a Builder got a challenge';
  exception when raise_exception then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform app_device_code_give(f1, d1, 'stepup-f1', code1, ch, 'e8100000-0000-0000-0000-0000000000c1', 1); raise exception 'FAIL: a key given with no challenge';
  exception when raise_exception then if sqlerrm <> 'no_challenge' then raise; end if; end;
  -- (owner, 2026-11-22, MED-1) unticked, a challenge only from the network the code started on: another one, or none at
  -- all, is not_mine; the same network, or "This is my computer" ticked, is a challenge
  begin perform app_device_code_challenge(f1, d1, 'stepup-f1', code1, ch, repeat('8', 64), false); raise exception 'FAIL: a challenge from another network without This is my computer';
  exception when raise_exception then if sqlerrm <> 'not_mine' then raise; end if; end;
  begin perform app_device_code_challenge(f1, d1, 'stepup-f1', code1, ch, null, false); raise exception 'FAIL: a challenge from an unknown network without This is my computer';
  exception when raise_exception then if sqlerrm <> 'not_mine' then raise; end if; end;
  begin perform app_device_code_challenge(f1, d1, 'stepup-f1', repeat('b', 63) || '2', ch, net, false); raise exception 'FAIL: a challenge for a code with no network without This is my computer';
  exception when raise_exception then if sqlerrm <> 'not_mine' then raise; end if; end;
  perform app_device_code_challenge(f1, d1, 'stepup-f1', code1, ch, net, false);
  if app_device_code_take(f2, d2, code1, ch, 'cred-f2') is not null then raise exception 'FAIL: another person took the challenge'; end if;
  if app_device_code_take(f1, d1, code1, repeat('R', 43), 'cred-f1') is not null then raise exception 'FAIL: another challenge taken'; end if;
  if app_device_code_take(f1, d1, code1, ch, 'cred-f2') is not null then raise exception 'FAIL: someone else''s passkey answered the challenge'; end if;
  -- (that try spent the challenge, as a failed check does): ask again
  perform app_device_code_challenge(f1, d1, 'stepup-f1', code1, ch, null, true);
  j := app_device_code_take(f1, d1, code1, ch, 'cred-f1');
  if j->>'passkeyId' is distinct from 'e8100000-0000-0000-0000-0000000000c1' then raise exception 'FAIL: the asker''s own passkey not given back (got %)', j; end if;
  if app_device_code_take(f1, d1, code1, ch, 'cred-f1') is not null then raise exception 'FAIL: a challenge taken twice'; end if;
  begin perform app_device_code_give(f1, d1, 'stepup-f1', code1, ch, 'e8100000-0000-0000-0000-0000000000c2', 1); raise exception 'FAIL: a key given on another person''s passkey';
  exception when raise_exception then if sqlerrm <> 'replay' then raise; end if; end;
  s := app_device_code_give(f1, d1, 'stepup-f1', code1, ch, 'e8100000-0000-0000-0000-0000000000c1', 1);
  if s is distinct from 'Proof E81' then raise exception 'FAIL: the Partner owner did not give E''s key (got %)', s; end if;
  begin perform app_device_code_give(f1, d1, 'stepup-f1', code1, ch, 'e8100000-0000-0000-0000-0000000000c1', 2); raise exception 'FAIL: a code given twice';
  exception when raise_exception then if sqlerrm <> 'no_challenge' then raise; end if; end;
  if app_device_code_look(f1, d1, 'stepup-f1', code1, net) is not null then raise exception 'FAIL: a used code still looked at'; end if;
  -- claimed once, as the person on the store now; a claim given back is claimable once more, while live
  select * into c from app_device_code_claim(repeat('a', 63) || '1');
  if c.state is distinct from 'approved' or c.tenant_id is distinct from 'e8100000-0000-0000-0000-000000000001' or c.user_id is distinct from f1 or c.role is distinct from 'partner'
  then raise exception 'FAIL: the claim is not the confirming person on E'; end if;
  select count(*) into n from app_device_code_claim(repeat('a', 63) || '1');
  if n <> 0 then raise exception 'FAIL: a sign-in claimed twice'; end if;
  perform app_device_code_unclaim(repeat('a', 63) || '1');
  select count(*) into n from app_device_code_claim(repeat('a', 63) || '1');
  if n <> 1 then raise exception 'FAIL: a given-back claim is not claimable again'; end if;
  select count(*) into n from app_device_code_claim(repeat('f', 64));
  if n <> 0 then raise exception 'FAIL: an unknown device answered'; end if;
  -- Your computers: the Lead's own developer keys on stores they still reach (E's two; not F's, unassigned above), not
  -- the Partner owner's view of them; delete only one's own, and never on a store they left (tenancy audit HIGH)
  if jsonb_array_length(app_partner_developer_keys(f2, d2, 'stepup-f2')) <> 2 then raise exception 'FAIL: the Lead does not list just their two developer keys on E (got %)', app_partner_developer_keys(f2, d2, 'stepup-f2'); end if;
  if app_partner_developer_keys(f2, d2, 'stepup-f2')::text like '%Proof F81%' then raise exception 'FAIL: the Lead still sees F''s name after leaving it'; end if;
  if app_partner_developer_key_delete(f2, d2, 'stepup-f2', 'e8100000-0000-0000-0000-000000000023') then raise exception 'FAIL: the Lead deleted a key on a store they left'; end if;
  if jsonb_array_length(app_partner_developer_keys(f1, d1, 'stepup-f1')) <> 0 then raise exception 'FAIL: the Partner owner lists the Lead''s keys'; end if;
  if app_partner_developer_key_delete(f1, d1, 'stepup-f1', 'e8100000-0000-0000-0000-000000000031') then raise exception 'FAIL: the Partner owner deleted the Lead''s key'; end if;
  if not app_partner_developer_key_delete(f2, d2, 'stepup-f2', 'e8100000-0000-0000-0000-000000000031') then raise exception 'FAIL: the Lead could not delete their own key'; end if;
  if app_partner_developer_key_delete(f2, d2, 'stepup-f2', 'e8100000-0000-0000-0000-000000000031') then raise exception 'FAIL: a key deleted twice'; end if;
  if app_partner_developer_key_delete(f2, d2, 'stepup-f2', 'e8100000-0000-0000-0000-000000000011') then raise exception 'FAIL: the Lead deleted the store''s own key'; end if;
end $$;
commit;
do $$ begin
  if (select count(*) from audit_events where tenant_id = 'e8100000-0000-0000-0000-000000000001' and action = 'build_key.device_confirmed' and actor_user_id = 'e8100000-0000-0000-0000-0000000000f1') <> 1
  then raise exception 'FAIL: a confirmed sign-in did not leave exactly one audit row'; end if;
  if (select count(*) from audit_events where tenant_id = 'e8100000-0000-0000-0000-000000000001' and action = 'storefront_key.delete' and target = 'e8100000-0000-0000-0000-000000000031') <> 1
  then raise exception 'FAIL: a deleted computer key did not leave exactly one audit row'; end if;
  if (select revoked_by from storefront_keys where id = 'e8100000-0000-0000-0000-000000000031') is distinct from 'e8100000-0000-0000-0000-0000000000f2' then raise exception 'FAIL: the deleted key is not revoked by its Lead'; end if;
  if (select counter from partner_passkeys where id = 'e8100000-0000-0000-0000-0000000000c1') <> 1 then raise exception 'FAIL: Give key did not raise the passkey''s counter'; end if;
end $$;
-- (tenancy audit MEDIUM) the cases the access rule exists for: the live owner of ANOTHER partner, a Lead of the store's
-- own partner no longer assigned to it (f2 on F), and a person on a live support visit look at nothing, get no
-- challenge, and give no key.
insert into auth.users (id, email, email_confirmed_at) values ('e8100000-0000-0000-0000-0000000000f5', 'owner@other82.test', now());
insert into partners (id, user_id, email, name, business_name, phone, city, brands_now, terms_version, agreed_at, approved_at) values
  ('e8100000-0000-0000-0000-0000000000a2', 'e8100000-0000-0000-0000-0000000000f5', 'owner@other82.test', 'Ravi', 'Other 82', '919876543282', 'Pune', '0', 1, now(), now());
insert into partner_members (id, partner_id, user_id, email, role, accepted_at) values
  ('e8100000-0000-0000-0000-0000000000b5', 'e8100000-0000-0000-0000-0000000000a2', 'e8100000-0000-0000-0000-0000000000f5', 'owner@other82.test', 'owner', now());
insert into partner_passkeys (id, partner_member_id, user_id, credential_id, public_key, name) values
  ('e8100000-0000-0000-0000-0000000000c5', 'e8100000-0000-0000-0000-0000000000b5', 'e8100000-0000-0000-0000-0000000000f5', 'cred-f5', 'pk-f5', 'Laptop');
insert into partner_stepups (partner_member_id, user_id, session_id, passkey_id, token_hash, expires_at) values
  ('e8100000-0000-0000-0000-0000000000b5', 'e8100000-0000-0000-0000-0000000000f5', 'e8100000-0000-0000-0000-0000000000d5', 'e8100000-0000-0000-0000-0000000000c5', 'stepup-f5', now() + interval '1 hour');
begin; set local role frata_app;
do $$ declare codeE text := repeat('b', 63) || '7'; codeF text := repeat('b', 63) || '8'; begin
  perform app_device_code_start(repeat('a', 63) || '7', codeE, 'proof-e81');
  perform app_device_code_start(repeat('a', 63) || '8', codeF, 'proof-f81');
  if app_device_code_look('e8100000-0000-0000-0000-0000000000f5', 'e8100000-0000-0000-0000-0000000000d5', 'stepup-f5', codeE, null) is not null then raise exception 'FAIL: another partner''s owner looked at E''s code'; end if;
  begin perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f5', 'e8100000-0000-0000-0000-0000000000d5', 'stepup-f5', codeE, repeat('W', 43), null, true); raise exception 'FAIL: another partner''s owner got a challenge for E';
  exception when raise_exception then if sqlerrm <> 'not_found' then raise; end if; end;
  if app_device_code_look('e8100000-0000-0000-0000-0000000000f2', 'e8100000-0000-0000-0000-0000000000d2', 'stepup-f2', codeF, null) is not null then raise exception 'FAIL: a Lead unassigned from F looked at F''s code'; end if;
  begin perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f2', 'e8100000-0000-0000-0000-0000000000d2', 'stepup-f2', codeF, repeat('W', 43), null, true); raise exception 'FAIL: an unassigned Lead got a challenge for F';
  exception when raise_exception then if sqlerrm <> 'not_found' then raise; end if; end;
end $$;
commit;
-- (security LOW-4) with passkeys switched off, Give key still needs a passkey made for that code: no passkey stays
-- no_passkey, no challenge stays no_challenge. And a code given before a support visit mints nothing at the poll.
insert into platform_switches (key, until, set_by, reason) values ('passkeys_off', now() + interval '1 hour', 'proof', 'proof § 81');
update partner_passkeys set partner_member_id = 'e8100000-0000-0000-0000-0000000000b1' where id = 'e8100000-0000-0000-0000-0000000000c2';
begin; set local role frata_app;
do $$ declare code9 text := repeat('b', 63) || '9'; ch text := repeat('X', 43); begin
  perform app_device_code_start(repeat('a', 63) || '9', code9, 'proof-e81');
  begin perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f2', 'e8100000-0000-0000-0000-0000000000d2', 'stepup-f2', code9, ch, null, true); raise exception 'FAIL: passkeys off gave a challenge to a person with no passkey';
  exception when raise_exception then if sqlerrm <> 'no_passkey' then raise; end if; end;
  begin perform app_device_code_give('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', code9, ch, 'e8100000-0000-0000-0000-0000000000c1', 20); raise exception 'FAIL: passkeys off gave a key with no challenge';
  exception when raise_exception then if sqlerrm <> 'no_challenge' then raise; end if; end;
  perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', code9, ch, null, true);
  perform app_device_code_take('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', code9, ch, 'cred-f1');
  if app_device_code_give('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', code9, ch, 'e8100000-0000-0000-0000-0000000000c1', 20) is distinct from 'Proof E81'
  then raise exception 'FAIL: the Partner owner could not give a key with passkeys off'; end if;
end $$;
commit;
update partner_passkeys set partner_member_id = 'e8100000-0000-0000-0000-0000000000b2' where id = 'e8100000-0000-0000-0000-0000000000c2';
delete from platform_switches where key = 'passkeys_off';
insert into support_sessions (id, tenant_id, staff_user_id, staff_email, reason, expires_at) values
  ('e8100000-0000-0000-0000-0000000000e9', 'e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-0000000000f1', 'owner@studio81.test', 'setup_help', now() + interval '1 hour');
begin; set local role frata_app;
do $$ begin
  if app_device_code_look('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', repeat('b', 63) || '7', null) is not null then raise exception 'FAIL: a person on a support visit looked at a code'; end if;
  begin perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', repeat('b', 63) || '7', repeat('W', 43), null, true); raise exception 'FAIL: a person on a support visit got a challenge';
  exception when raise_exception then if sqlerrm <> 'not_found' then raise; end if; end;
  if (select count(*) from app_device_code_claim(repeat('a', 63) || '9')) <> 0 then raise exception 'FAIL: a code given before a support visit minted at the poll'; end if;
end $$;
commit;
delete from support_sessions where id = 'e8100000-0000-0000-0000-0000000000e9';
-- The ceiling: at 50 live build keys the dialog says so and Give key refuses, even with a passkey check
insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at)
  select 'e8100000-0000-0000-0000-000000000001', 'build', 'session', 'Filler', md5('e81f' || g) || md5(g || 'e81f'), 'frs_build_e81fff', '99999999-9999-9999-9999-999999999999', now() + interval '1 hour' from generate_series(1, 50) g;
begin; set local role frata_app;
do $$ declare code2 text := repeat('b', 63) || '2'; ch text := repeat('S', 43); begin
  if not (app_device_code_look('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', code2, null)->>'full')::boolean
  then raise exception 'FAIL: a store at its ceiling not shown full'; end if;
  perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', code2, ch, null, true);
  perform app_device_code_take('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', code2, ch, 'cred-f1');
  begin perform app_device_code_give('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', code2, ch, 'e8100000-0000-0000-0000-0000000000c1', 30);
    raise exception 'FAIL: a key given past the ceiling';
  exception when raise_exception then if sqlerrm <> 'full' then raise; end if; end;
end $$;
commit;
delete from storefront_keys where tenant_id = 'e8100000-0000-0000-0000-000000000001' and name = 'Filler';
update build_key_device_codes set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where device_hash = repeat('a', 63) || '2';
begin; set local role frata_app;
do $$ declare n int; begin
  if app_device_code_look('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', repeat('b', 63) || '2', null) is not null then raise exception 'FAIL: an ended code looked at'; end if;
  select count(*) into n from app_device_code_claim(repeat('a', 63) || '2');
  if n <> 0 then raise exception 'FAIL: an ended sign-in answered'; end if;
end $$;
commit;
-- (0162, impact review) the refusals that guard a mint: no passkey at all; the person's own passkey whose counter does
-- not rise; a challenge older than 5 minutes at take, or taken more than 2 minutes before give. Then the daily delete
-- takes the ended code (its network and challenge with it) and keeps a live one.
update partner_passkeys set partner_member_id = 'e8100000-0000-0000-0000-0000000000b1' where id = 'e8100000-0000-0000-0000-0000000000c2';
begin; set local role frata_app;
do $$ declare code4 text := repeat('b', 63) || '6'; ch text := repeat('T', 43);
  f1 uuid := 'e8100000-0000-0000-0000-0000000000f1'; d1 uuid := 'e8100000-0000-0000-0000-0000000000d1';
  f2 uuid := 'e8100000-0000-0000-0000-0000000000f2'; d2 uuid := 'e8100000-0000-0000-0000-0000000000d2'; begin
  perform app_device_code_start(repeat('a', 63) || '6', code4, 'proof-e81');
  if (app_device_code_look(f2, d2, 'stepup-f2', code4, null)->>'hasPasskey')::boolean then raise exception 'FAIL: a person with no passkey shown one'; end if;
  begin perform app_device_code_challenge(f2, d2, 'stepup-f2', code4, ch, null, true); raise exception 'FAIL: a challenge for a person with no passkey';
  exception when raise_exception then if sqlerrm <> 'no_passkey' then raise; end if; end;
  perform app_device_code_challenge(f1, d1, 'stepup-f1', code4, ch, null, true);
  perform app_device_code_take(f1, d1, code4, ch, 'cred-f1');
  begin perform app_device_code_give(f1, d1, 'stepup-f1', code4, ch, 'e8100000-0000-0000-0000-0000000000c1', 1); raise exception 'FAIL: a counter that did not rise gave a key';
  exception when raise_exception then if sqlerrm <> 'replay' then raise; end if; end;
end $$;
commit;
update partner_passkeys set partner_member_id = 'e8100000-0000-0000-0000-0000000000b2' where id = 'e8100000-0000-0000-0000-0000000000c2';
begin; set local role frata_app;
do $$ begin perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', repeat('b', 63) || '6', repeat('U', 43), null, true); end $$;
commit;
update build_key_device_codes set challenge_at = now() - interval '6 minutes' where device_hash = repeat('a', 63) || '6';
begin; set local role frata_app;
do $$ begin
  if app_device_code_take('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', repeat('b', 63) || '6', repeat('U', 43), 'cred-f1') is not null
  then raise exception 'FAIL: a challenge older than 5 minutes taken'; end if;
  perform app_device_code_challenge('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', repeat('b', 63) || '6', repeat('V', 43), null, true);
  perform app_device_code_take('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', repeat('b', 63) || '6', repeat('V', 43), 'cred-f1');
end $$;
commit;
update build_key_device_codes set challenge_used_at = now() - interval '3 minutes' where device_hash = repeat('a', 63) || '6';
begin; set local role frata_app;
do $$ declare n int; begin
  begin perform app_device_code_give('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000d1', 'stepup-f1', repeat('b', 63) || '6', repeat('V', 43), 'e8100000-0000-0000-0000-0000000000c1', 9);
    raise exception 'FAIL: a challenge taken more than 2 minutes ago gave a key';
  exception when raise_exception then if sqlerrm <> 'no_challenge' then raise; end if; end;
  perform app_delete_ended_build_keys();
end $$;
commit;
do $$ begin
  if exists (select 1 from build_key_device_codes where device_hash = repeat('a', 63) || '2') then raise exception 'FAIL: the daily delete kept an ended device code'; end if;
  if not exists (select 1 from build_key_device_codes where device_hash = repeat('a', 63) || '6') then raise exception 'FAIL: the daily delete took a live device code'; end if;
end $$;
-- the two readers that list keys leave build keys out: Admin's API page (E has build keys only, no Website) and the
-- Accept screen's list
do $$ begin
  if exists (select 1 from admin_storefront_api_shops() where tenant_id = 'e8100000-0000-0000-0000-000000000001') then raise exception 'FAIL: Admin lists a store for its build keys'; end if;
  if pg_get_functiondef('app_my_handover_keys(uuid)'::regprocedure) not like '%k.kind <> ''build''%' then raise exception 'FAIL: the Accept screen lists build keys'; end if;
  if has_function_privilege('frata_app', 'admin_storefront_api_shops()', 'execute') or not has_function_privilege('frata_admin', 'admin_storefront_api_shops()', 'execute')
     or has_function_privilege('frata_admin', 'app_my_handover_keys(uuid)', 'execute') or not has_function_privilege('frata_app', 'app_my_handover_keys(uuid)', 'execute')
  then raise exception 'FAIL: a re-defined key listing lost its grants'; end if;
end $$;

-- 80. Store content (V1 content, 0133–0136; plan docs/plans/2026-11-15-v1-content.md; tenancy-auditor 2026-11-15): a
-- store's bars, menus and Contact line are its own both ways; tenant, kind and key never change; at most 3 bars a store
-- (B's don't count, and B is refused before any lock); no store set reads nothing and writes nothing; no API role or
-- frata_admin reaches the table or runs its functions; the move copies each store's own live look into its own rows.
begin; set local role frata_app;
do $$ declare n int; ca uuid; cb uuid; i int; begin
  -- The cap trigger refuses another store's insert first, so the policy's own with check is asserted directly.
  if not exists (select 1 from pg_policies where tablename = 'site_content' and policyname = 'tenant_rows' and qual like '%app_current_tenant()%' and with_check like '%app_current_tenant()%')
    then raise exception 'FAIL: site_content''s policy does not hold both ways'; end if;
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  insert into site_content (tenant_id, kind, key, value) values ('22222222-2222-2222-2222-222222222222', 'contact', 'contact', '{"line":"B"}') returning id into cb;
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if exists (select 1 from site_content where tenant_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: A sees B''s content'; end if;
  begin insert into site_content (tenant_id, kind, key, value) values ('22222222-2222-2222-2222-222222222222', 'menu', 'main', '[]'); raise exception 'FAIL: A wrote content for B';
  exception when insufficient_privilege then null; end;
  begin insert into site_content (tenant_id, kind, key, value) values ('22222222-2222-2222-2222-222222222222', 'announcement', 'x', '{}'); raise exception 'FAIL: A wrote a bar for B';
  exception when insufficient_privilege then null; end;
  update site_content set value = '{"line":"A"}' where id = cb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A edited B''s content'; end if;
  delete from site_content where id = cb; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s content'; end if;
  insert into site_content (tenant_id, kind, key, value) values ('11111111-1111-1111-1111-111111111111', 'contact', 'contact', '{"line":"A"}') returning id into ca;
  begin update site_content set tenant_id = '22222222-2222-2222-2222-222222222222' where id = ca; raise exception 'FAIL: A moved content to B';
  exception when insufficient_privilege then null; end;
  begin update site_content set kind = 'menu' where id = ca; raise exception 'FAIL: a row changed its kind';
  exception when insufficient_privilege then null; end;
  begin update site_content set key = 'other' where id = ca; raise exception 'FAIL: a row changed its key';
  exception when insufficient_privilege then null; end;
  begin insert into site_content (tenant_id, kind, key, value) values ('11111111-1111-1111-1111-111111111111', 'menu', 'side', '[]'); raise exception 'FAIL: a menu that is not main, footer or tabs';
  exception when check_violation then null; end;
  begin insert into site_content (tenant_id, kind, key, value, starts_at) values ('11111111-1111-1111-1111-111111111111', 'menu', 'main', '[]', now()); raise exception 'FAIL: a dated menu';
  exception when check_violation then null; end;
  begin insert into site_content (tenant_id, kind, key, value, starts_at, ends_at) values ('11111111-1111-1111-1111-111111111111', 'announcement', 'a0', '{}', now(), now() - interval '1 hour'); raise exception 'FAIL: a bar that ends before it starts';
  exception when check_violation then null; end;
  -- at most 3 bars not deleted; a deleted one doesn't count, but bringing it back does
  for i in 1..3 loop insert into site_content (tenant_id, kind, key, value) values ('11111111-1111-1111-1111-111111111111', 'announcement', 'a' || i, '{}'); end loop;
  begin insert into site_content (tenant_id, kind, key, value) values ('11111111-1111-1111-1111-111111111111', 'announcement', 'a4', '{}'); raise exception 'FAIL: a 4th bar';
  exception when check_violation then null; end;
  update site_content set deleted_at = now() where tenant_id = '11111111-1111-1111-1111-111111111111' and key = 'a1';
  insert into site_content (tenant_id, kind, key, value) values ('11111111-1111-1111-1111-111111111111', 'announcement', 'a4', '{}');
  begin update site_content set deleted_at = null where tenant_id = '11111111-1111-1111-1111-111111111111' and key = 'a1'; raise exception 'FAIL: a deleted bar came back past 3';
  exception when check_violation then null; end;
end $$;
rollback;
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from site_content) then raise exception 'FAIL: content seen with no store set'; end if;
  begin insert into site_content (tenant_id, kind, key, value) values ('11111111-1111-1111-1111-111111111111', 'contact', 'contact', '{"line":"x"}'); raise exception 'FAIL: content with no store set';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ begin
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r, unnest(array['select', 'insert', 'update']) p
              where has_any_column_privilege(r, 'site_content', p))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_table_privilege(r, 'site_content', 'delete'))
  then raise exception 'FAIL: an API role or frata_admin reaches site_content'; end if;
  if exists (select 1 from unnest(array['tenant_id', 'id', 'kind', 'key', 'created_at']) c where has_column_privilege('frata_app', 'site_content', c, 'update'))
  then raise exception 'FAIL: frata_app can update a fixed column of site_content'; end if;
  if exists (select 1 from pg_proc where proname in ('app_site_content_cap') and (prosecdef or proconfig is null or not ('search_path=""' = any (proconfig))))
  then raise exception 'FAIL: a content function is a definer or has no fixed search_path'; end if;
  if exists (select 1 from pg_proc p, unnest(array['public', 'anon', 'authenticated', 'service_role', 'frata_app', 'frata_admin']) r
              where p.proname in ('app_site_content_cap') and r <> 'public' and has_function_privilege(r, p.oid, 'execute'))
  then raise exception 'FAIL: a role may run a content function'; end if;
end $$;
-- The move (0135) ran in production 2026-11-15 and twice more; app_move_content() was dropped in 0153 with its proof.

-- 80b. A partner's save told to the owner (V1 content follow-up, 0137; owner 2026-11-15): the line goes to the saver's
-- own store only, only for a partner's save on a store with an owner, once per place an hour; no store set writes
-- nothing; the API roles can't run it.
begin;
insert into tenants (id, slug, name) values ('33333333-3333-3333-3333-3333333380b0', 'proof-80b-no-owner', 'Proof no owner');
with p as (insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
    values ('a0000000-0000-0000-0000-00000000c0a1', 'proof-partner@example.in', 'Proof', 'Proof Studio', '919845000000', 'Jaipur', '{}', '', '1-4', 1, now(), now()) returning id),
  pm as (insert into partner_members (partner_id, user_id, email, role, accepted_at) select p.id, u.id, u.email, 'owner', now() from p,
    (values ('a0000000-0000-0000-0000-00000000c0a1'::uuid, 'proof-partner@example.in')) u(id, email) returning id, user_id)
insert into members (tenant_id, user_id, role, partner_member_id)
  select t, pm.user_id, 'partner', pm.id from pm, (values ('11111111-1111-1111-1111-111111111111'::uuid), ('22222222-2222-2222-2222-222222222222'::uuid),
    ('33333333-3333-3333-3333-3333333380b0'::uuid)) x(t);
set local role frata_app;
do $$ declare ca uuid; cb uuid; cc uuid; co uuid; c2 uuid; pb uuid; n int; begin
  -- A store with no owner yet (a partner building it): its partner's save tells no one.
  perform set_config('app.tenant_id', '33333333-3333-3333-3333-3333333380b0', true);
  insert into site_content (tenant_id, kind, key, value, updated_by) values ('33333333-3333-3333-3333-3333333380b0', 'menu', 'footer', '[]', 'a0000000-0000-0000-0000-00000000c0a1') returning id into cc;
  if app_content_partner_notice('site_content', cc, 'changed') then raise exception 'FAIL: a store with no owner got a partner notice'; end if;
  perform set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
  insert into site_content (tenant_id, kind, key, value, updated_by) values ('22222222-2222-2222-2222-222222222222', 'menu', 'footer', '[]', 'a0000000-0000-0000-0000-00000000c0a1') returning id into cb;
  insert into shop_pages (tenant_id, template, draft, updated_by) values ('22222222-2222-2222-2222-222222222222', 'faq', '{"title":"Q","handle":"faq","fill":{},"hidden":true}', 'a0000000-0000-0000-0000-00000000c0a1') returning id into pb;
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  if app_content_partner_notice('site_content', cb, 'changed') then raise exception 'FAIL: A wrote a notice from B''s row'; end if;
  if app_content_partner_notice('shop_pages', pb, 'changed') then raise exception 'FAIL: A wrote a notice from B''s page'; end if;
  insert into site_content (tenant_id, kind, key, value, updated_by) values ('11111111-1111-1111-1111-111111111111', 'menu', 'footer', '[]', 'a0000000-0000-0000-0000-00000000c0a1') returning id into ca;
  if not app_content_partner_notice('site_content', ca, 'changed') then raise exception 'FAIL: a partner''s save on a store with an owner wrote no notice'; end if;
  if app_content_partner_notice('site_content', ca, 'changed') then raise exception 'FAIL: a second save within the hour wrote a second notice'; end if;
  insert into site_content (tenant_id, kind, key, value, updated_by) values ('11111111-1111-1111-1111-111111111111', 'menu', 'main', '[]', 'a0000000-0000-0000-0000-00000000c0a1') returning id into c2;
  if app_content_partner_notice('site_content', c2, 'added') then raise exception 'FAIL: a partner''s second place within the hour wrote a second notice (one per partner an hour)'; end if;
  select count(*) into n from notices where tenant_id = '11111111-1111-1111-1111-111111111111' and source_kind = 'content' and source_id = ca;
  if n <> 1 then raise exception 'FAIL: % partner notices for one place, not 1', n; end if;
  if not exists (select 1 from notices where source_id = ca and title = 'Your partner changed the footer menu' and href = '/console/content?tab=menus' and type = 'needs_you' and not required and by = 'a0000000-0000-0000-0000-00000000c0a1')
    then raise exception 'FAIL: the partner notice is not worded from its place'; end if;
  insert into site_content (tenant_id, kind, key, value, updated_by) values ('11111111-1111-1111-1111-111111111111', 'contact', 'contact', '{"line":"x"}', '99999999-9999-9999-9999-999999999999') returning id into co;
  if app_content_partner_notice('site_content', co, 'changed') then raise exception 'FAIL: the owner''s own save wrote a notice'; end if;
  if exists (select 1 from notices where tenant_id = '22222222-2222-2222-2222-222222222222' and source_kind = 'content' and source_id is not null) then raise exception 'FAIL: B got a partner notice'; end if;
  if exists (select 1 from notices where source_id = pb) then raise exception 'FAIL: B''s page made a notice'; end if;
  perform set_config('app.tenant_id', '', true);
  if app_content_partner_notice('site_content', ca, 'changed') then raise exception 'FAIL: no store set wrote a notice'; end if;
end $$;
rollback;
begin;
do $$ declare r text; begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder'] loop
    if has_function_privilege(r, 'app_content_partner_notice(text, uuid, text)', 'execute') then raise exception 'FAIL: % can run app_content_partner_notice', r; end if;
  end loop;
end $$;
rollback;

-- 84. Admin N4 (0144–0145; plan docs/plans/2026-11-15-neel-n4-admin.md, reviews folded in): the waiting-passkeys read and
-- the refund writer are definers with a fixed search_path that only frata_admin may run; support is refused by both; the
-- refund columns are all or none; nobody but the definer writes frrata_payments.
do $$ begin
  if exists (select 1 from pg_proc where proname in ('admin_waiting_passkeys', 'app_record_frrata_refund') and (not prosecdef or proconfig is null or not ('search_path=""' = any (proconfig))))
  then raise exception 'FAIL: an N4 function is not a definer with a fixed search_path'; end if;
  if exists (select 1 from pg_proc p, unnest(array['anon', 'authenticated', 'service_role', 'frata_app']) r
              where p.proname in ('admin_waiting_passkeys', 'app_record_frrata_refund') and has_function_privilege(r, p.oid, 'execute'))
  then raise exception 'FAIL: a role other than frata_admin may run an N4 function'; end if;
  if not has_function_privilege('frata_admin', 'admin_waiting_passkeys(uuid)', 'execute') or not has_function_privilege('frata_admin', 'app_record_frrata_refund(uuid, text, date, uuid)', 'execute')
  then raise exception 'FAIL: frata_admin cannot run an N4 function'; end if;
  if exists (select 1 from unnest(array['frata_admin', 'frata_app', 'anon', 'authenticated', 'service_role']) r, unnest(array['insert', 'update']) pr
              where has_any_column_privilege(r, 'frrata_payments', pr))
  then raise exception 'FAIL: a role writes frrata_payments directly'; end if;
end $$;
begin;
do $$ declare got boolean; begin
  insert into platform_staff (user_id, email, role) values ('84848484-8383-8383-8383-838383838383', 'support84@frrata.test', 'support');
  got := false; begin perform * from admin_waiting_passkeys('84848484-8383-8383-8383-838383838383'); exception when others then got := true; end;
  if not got then raise exception 'FAIL: support read the waiting passkeys'; end if;
  got := false; begin perform app_record_frrata_refund(gen_random_uuid(), 'UTR83', current_date, '84848484-8383-8383-8383-838383838383'); exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: support recorded a refund'; end if;
  if not exists (select 1 from pg_constraint where conname = 'frrata_payments_refund_whole') then raise exception 'FAIL: the refund columns can be half set'; end if;
end $$;
rollback;
-- The refund's refusals (impact review on the diff): a test invoice, nothing over-paid, a day outside the last 90 or
-- before the payment arrived; the right one records the over-paid amount once.
begin;
set local session_replication_role = replica;
do $$ declare got boolean; t uuid := gen_random_uuid(); live uuid := gen_random_uuid(); test uuid := gen_random_uuid();
  p_ok uuid := gen_random_uuid(); p_test uuid := gen_random_uuid(); p_zero uuid := gen_random_uuid(); m uuid := '84848484-0000-8383-8383-838383838383'; n bigint;
begin
  insert into platform_staff (user_id, email, role) values (m, 'master84@frrata.test', 'admin');
  insert into frrata_invoices (id, tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, test_mode) values
    (live, t, '2024-01-01', '2024-02-01', 100, 0, 0, 0, 100, false), (test, t, '2024-02-01', '2024-03-01', 100, 0, 0, 0, 100, true);
  insert into frrata_payments (id, tenant_id, invoice_id, method, amount, captured_at, over_paid) values
    (p_ok, t, live, 'upi', 150, now() - interval '2 days', 50), (p_test, t, test, 'upi', 150, now() - interval '2 days', 50), (p_zero, t, live, 'upi', 100, now() - interval '2 days', 0);
  got := false; begin perform app_record_frrata_refund(p_test, 'UTR83A', current_date, m); exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: a test invoice was refunded by hand'; end if;
  got := false; begin perform app_record_frrata_refund(p_zero, 'UTR83B', current_date, m); exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: a refund was recorded with nothing over-paid'; end if;
  got := false; begin perform app_record_frrata_refund(p_ok, 'UTR83C', current_date - 92, m); exception when invalid_parameter_value then got := true; end;
  if not got then raise exception 'FAIL: a refund sent over 90 days ago was recorded'; end if;
  got := false; begin perform app_record_frrata_refund(p_ok, 'UTR83D', current_date + 2, m); exception when invalid_parameter_value then got := true; end;
  if not got then raise exception 'FAIL: a refund sent tomorrow was recorded'; end if;
  got := false; begin perform app_record_frrata_refund(p_ok, 'UTR83E', current_date - 5, m); exception when invalid_parameter_value then got := true; end;
  if not got then raise exception 'FAIL: a refund sent before the payment arrived was recorded'; end if;
  n := app_record_frrata_refund(p_ok, ' utr83f ', current_date, m);
  if n <> 50 or (select refund_utr from frrata_payments where id = p_ok) <> 'UTR83F' then raise exception 'FAIL: the refund is not the over-paid amount under its reference'; end if;
  got := false; begin perform app_record_frrata_refund(p_ok, 'UTR83G', current_date, m); exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: a payment was refunded twice'; end if;
end $$;
rollback;

-- 86. Storefront API SA1b (0148; plan docs/plans/2026-11-16-sa1b.md; tenancy audit 2026-11-16 folded in). The sweeps
-- page by shop id (the two-argument versions gone; a null cursor is the first page) and find a reinstated partner's
-- shops; the domain-gone sweep is ids only; the Accept screen's key list is the invitee's own, built over
-- app_my_handovers, names and prefixes only; Frrata Admin's view is counts and dates for frata_admin alone, its listed
-- count visibility()'s own rule.
insert into tenants (id, slug, name) values
  ('c8400000-0000-0000-0000-000000000001', 'proof-c84', 'Proof C84'),
  ('c8400000-0000-0000-0000-000000000002', 'proof-d84', 'Proof D84');
insert into shop_settings (tenant_id, pickup_pincode) values
  ('c8400000-0000-0000-0000-000000000001', '452009'), ('c8400000-0000-0000-0000-000000000002', '110017');
insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values
  ('c8400000-0000-0000-0000-0000000000d1', 'c8400000-0000-0000-0000-000000000001', 'checkout.proof-c84.in', 'proof-c84.in', false, '99999999-9999-9999-9999-999999999999', now(), now()),
  ('c8400000-0000-0000-0000-0000000000d2', 'c8400000-0000-0000-0000-000000000002', 'checkout.proof-d84.in', 'proof-d84.in', false, '99999999-9999-9999-9999-999999999999', now(), now());
update shop_settings set site_origin = 'https://proof-c84.in', site_domain_id = 'c8400000-0000-0000-0000-0000000000d1' where tenant_id = 'c8400000-0000-0000-0000-000000000001';
update shop_settings set site_origin = 'https://proof-d84.in', site_domain_id = 'c8400000-0000-0000-0000-0000000000d2' where tenant_id = 'c8400000-0000-0000-0000-000000000002';
insert into auth.users (id, email, email_confirmed_at) values
  ('c8400000-0000-0000-0000-0000000000e1', 'owner@proof-c84.test', now()),
  ('c8400000-0000-0000-0000-0000000000e2', 'unconfirmed@proof-c84.test', null),
  ('c8400000-0000-0000-0000-0000000000e3', 'dev@studio84.test', now()),
  ('c8400000-0000-0000-0000-0000000000e4', 'staffer@proof-c84.test', now()),
  ('c8400000-0000-0000-0000-0000000000e5', 'owner@proof-d84.test', now());
insert into partners (id, user_id, email, name, business_name, phone, city, brands_now, terms_version, agreed_at, approved_at) values
  ('c8400000-0000-0000-0000-0000000000a1', 'c8400000-0000-0000-0000-0000000000e3', 'dev@studio84.test', 'Studio 84', 'Studio 84', '919876543284', 'Indore', '0', 1, now(), now());
insert into partner_members (partner_id, user_id, email, role, accepted_at) values
  ('c8400000-0000-0000-0000-0000000000a1', 'c8400000-0000-0000-0000-0000000000e3', 'dev@studio84.test', 'owner', now());
insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values
  ('c8400000-0000-0000-0000-000000000001', 'c8400000-0000-0000-0000-0000000000a1', 2000, 24, 90),
  ('c8400000-0000-0000-0000-000000000002', 'c8400000-0000-0000-0000-0000000000a1', 2000, 24, 90);
insert into invites (id, tenant_id, email, role, created_by) values
  ('c8400000-0000-0000-0000-0000000000b1', 'c8400000-0000-0000-0000-000000000001', 'owner@proof-c84.test', 'owner', 'c8400000-0000-0000-0000-0000000000e3'),
  ('c8400000-0000-0000-0000-0000000000b2', 'c8400000-0000-0000-0000-000000000001', 'unconfirmed@proof-c84.test', 'owner', 'c8400000-0000-0000-0000-0000000000e3'),
  ('c8400000-0000-0000-0000-0000000000b3', 'c8400000-0000-0000-0000-000000000001', 'dev@studio84.test', 'owner', 'c8400000-0000-0000-0000-0000000000e3'),
  ('c8400000-0000-0000-0000-0000000000b4', 'c8400000-0000-0000-0000-000000000001', 'staffer@proof-c84.test', 'staff', 'c8400000-0000-0000-0000-0000000000e3'),
  ('c8400000-0000-0000-0000-0000000000b5', 'c8400000-0000-0000-0000-000000000002', 'owner@proof-d84.test', 'owner', 'c8400000-0000-0000-0000-0000000000e3');
insert into storefront_keys (id, tenant_id, kind, name, hash, prefix, partner_id, created_by, expires_at, revoked_at, revoked_by, last_seen_on, last_seen_version) values
  ('c8400000-0000-0000-0000-00000000000a', 'c8400000-0000-0000-0000-000000000001', 'public', 'Website', repeat('1', 63) || 'a', 'frs_pub_c84aaa', 'c8400000-0000-0000-0000-0000000000a1', 'c8400000-0000-0000-0000-0000000000e3', null, null, null, current_date, '2026-12'),
  ('c8400000-0000-0000-0000-00000000000b', 'c8400000-0000-0000-0000-000000000001', 'test', 'Preview', repeat('1', 63) || 'b', 'frs_test_c84bbb', 'c8400000-0000-0000-0000-0000000000a1', 'c8400000-0000-0000-0000-0000000000e3', now() + interval '30 days', null, null, null, null),
  ('c8400000-0000-0000-0000-00000000000c', 'c8400000-0000-0000-0000-000000000001', 'public', 'Old', repeat('1', 63) || 'c', 'frs_pub_c84ccc', null, '99999999-9999-9999-9999-999999999999', null, now(), '99999999-9999-9999-9999-999999999999', null, null),
  ('c8400000-0000-0000-0000-00000000000d', 'c8400000-0000-0000-0000-000000000002', 'public', 'D site', repeat('1', 63) || 'd', 'frs_pub_d84ddd', null, '99999999-9999-9999-9999-999999999999', null, null, null, null, null),
  ('c8400000-0000-0000-0000-00000000000e', 'c8400000-0000-0000-0000-000000000002', 'public', 'D second', repeat('1', 63) || 'e', 'frs_pub_d84eee', null, '99999999-9999-9999-9999-999999999999', null, null, null, null, null);
insert into products (tenant_id, handle, title, status, publish_at) values
  ('c8400000-0000-0000-0000-000000000001', 'l84-active', 'A', 'active', null),
  ('c8400000-0000-0000-0000-000000000001', 'l84-past', 'B', 'active', now() - interval '1 day'),
  ('c8400000-0000-0000-0000-000000000001', 'l84-later', 'C', 'active', now() + interval '1 day'),
  ('c8400000-0000-0000-0000-000000000001', 'l84-draft', 'D', 'draft', null),
  ('c8400000-0000-0000-0000-000000000001', 'l84-unlisted', 'E', 'unlisted', null),
  ('c8400000-0000-0000-0000-000000000001', 'l84-archived', 'F', 'archived', null),
  ('c8400000-0000-0000-0000-000000000002', 'l84-d', 'G', 'active', null);
-- the shapes: one function per sweep name, paged, ids only, frata_app alone; the two new definers pinned
do $$ declare f text; begin
  foreach f in array array['app_shops_with_boundary', 'app_shops_with_key_stop', 'app_shops_with_content_change', 'app_shops_with_domain_gone'] loop
    if (select count(*) from pg_proc where proname = f) <> 1 then raise exception 'FAIL: % has more than one version (the two-argument one must be gone)', f; end if;
    if pg_get_function_result((f || '(timestamptz, timestamptz, uuid)')::regprocedure) <> 'SETOF uuid' then raise exception 'FAIL: % returns more than ids', f; end if;
    if pg_get_function_arguments((f || '(timestamptz, timestamptz, uuid)')::regprocedure) not like '%p_after uuid DEFAULT NULL%' then raise exception 'FAIL: % has no default cursor (a release would break the running deployment)', f; end if;
    if not (select prosecdef from pg_proc where oid = (f || '(timestamptz, timestamptz, uuid)')::regprocedure)
       or (select proconfig from pg_proc where oid = (f || '(timestamptz, timestamptz, uuid)')::regprocedure) is distinct from array['search_path=""']
       or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin']) r where has_function_privilege(r, (f || '(timestamptz, timestamptz, uuid)'), 'execute'))
       or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = (f || '(timestamptz, timestamptz, uuid)')::regprocedure and a.grantee = 0)
       or not has_function_privilege('frata_app', (f || '(timestamptz, timestamptz, uuid)'), 'execute')
    then raise exception 'FAIL: % is not a pinned definer for frata_app alone', f; end if;
  end loop;
  if pg_get_function_result('app_my_handover_keys(uuid)'::regprocedure) is distinct from 'TABLE(invite_id uuid, site_host text, name text, kind text, prefix text)'
  then raise exception 'FAIL: app_my_handover_keys returns %', pg_get_function_result('app_my_handover_keys(uuid)'::regprocedure); end if;
  if not (select prosecdef from pg_proc where oid = 'app_my_handover_keys(uuid)'::regprocedure)
     or (select proconfig from pg_proc where oid = 'app_my_handover_keys(uuid)'::regprocedure) is distinct from array['search_path=""']
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder']) r where has_function_privilege(r, 'app_my_handover_keys(uuid)', 'execute'))
     or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = 'app_my_handover_keys(uuid)'::regprocedure and a.grantee = 0)
     or not has_function_privilege('frata_app', 'app_my_handover_keys(uuid)', 'execute')
  then raise exception 'FAIL: app_my_handover_keys is not a pinned definer for frata_app alone'; end if;
  if pg_get_function_result('admin_storefront_api_shops()'::regprocedure) is distinct from
     'TABLE(tenant_id uuid, name text, slug text, site_host text, main_host text, published boolean, opened_at timestamp with time zone, live_keys integer, test_keys integer, last_read date, last_version text, partner text)'
  then raise exception 'FAIL: admin_storefront_api_shops returns %', pg_get_function_result('admin_storefront_api_shops()'::regprocedure); end if;
  foreach f in array array['admin_storefront_api_shops()', 'admin_storefront_api_listed(uuid)'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure)
       or (select proconfig from pg_proc where oid = f::regprocedure) is distinct from array['search_path=""']
       or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'frata_app', 'frata_builder']) r where has_function_privilege(r, f, 'execute'))
       or exists (select 1 from pg_proc, aclexplode(proacl) a where oid = f::regprocedure and a.grantee = 0)
       or not has_function_privilege('frata_admin', f, 'execute')
    then raise exception 'FAIL: % is not a pinned definer for frata_admin alone', f; end if;
  end loop;
  if pg_get_function_result('admin_storefront_api_shops()'::regprocedure) ~ '(hash|prefix|key_name)' then raise exception 'FAIL: Admin reads key material'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'audit_events_partner_reinstated') then raise exception 'FAIL: the reinstatement index is missing'; end if;
  if has_table_privilege('frata_app', 'audit_events', 'update') or has_table_privilege('frata_app', 'audit_events', 'delete') then raise exception 'FAIL: audit_events grants changed'; end if;
end $$;
-- the Accept screen's key list: the invitee's own live store invite, its live keys, names and prefixes only
begin; set local role frata_app;
do $$ declare n int; begin
  select count(*) into n from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1');
  if n <> 2 then raise exception 'FAIL: the invitee sees % keys, not C''s live and test key', n; end if;
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1') where invite_id <> 'c8400000-0000-0000-0000-0000000000b1' or prefix like 'frs_pub_d84%' or name = 'Old')
  then raise exception 'FAIL: C''s invitee sees another invite, D''s keys or a deleted key'; end if;
  if (select site_host from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1') limit 1) <> 'proof-c84.in' then raise exception 'FAIL: the site host'; end if;
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e2')) then raise exception 'FAIL: an unconfirmed email sees keys'; end if;
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e3')) then raise exception 'FAIL: a person in the partner''s team sees the keys'; end if;
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e4')) then raise exception 'FAIL: a staff invite sees the keys'; end if;
  if exists (select 1 from app_my_handover_keys(gen_random_uuid())) then raise exception 'FAIL: a stranger sees keys'; end if;
  if (select count(*) from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e5')) <> 2 or exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e5') where prefix like 'frs_%c84%')
  then raise exception 'FAIL: D''s invitee sees other than D''s keys'; end if;
end $$;
commit;
-- 0149: with no Website the invitee still sees the store's keys (a test key answers then), with no site host
update shop_settings set site_origin = null, site_domain_id = null where tenant_id = 'c8400000-0000-0000-0000-000000000001';
begin; set local role frata_app;
do $$ begin
  if (select count(*) from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1')) <> 2
     or exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1') where site_host is not null)
  then raise exception 'FAIL: with no Website the invitee does not see C''s keys'; end if;
end $$;
commit;
update shop_settings set site_origin = 'https://proof-c84.in', site_domain_id = 'c8400000-0000-0000-0000-0000000000d1' where tenant_id = 'c8400000-0000-0000-0000-000000000001';
update invites set revoked_at = now() where id = 'c8400000-0000-0000-0000-0000000000b5';
update tenants set first_opened_at = now() where id = 'c8400000-0000-0000-0000-000000000001';
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e5')) then raise exception 'FAIL: a revoked invite sees keys'; end if;
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1') where kind = 'test') then raise exception 'FAIL: a test key listed after the store first opened'; end if;
end $$;
commit;
insert into members (tenant_id, user_id, role) values ('c8400000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'owner');
begin; set local role frata_app;
do $$ begin
  if exists (select 1 from app_my_handover_keys('c8400000-0000-0000-0000-0000000000e1')) then raise exception 'FAIL: keys listed for a store that already has an owner'; end if;
end $$;
commit;
delete from members where tenant_id = 'c8400000-0000-0000-0000-000000000001';
update tenants set first_opened_at = null where id = 'c8400000-0000-0000-0000-000000000001';
-- Frrata Admin: counts and dates, each store its own; listed is visibility()'s rule (active, not scheduled)
begin; set local role frata_admin;
do $$ declare c record; d record; begin
  select * into c from admin_storefront_api_shops() where tenant_id = 'c8400000-0000-0000-0000-000000000001';
  select * into d from admin_storefront_api_shops() where tenant_id = 'c8400000-0000-0000-0000-000000000002';
  if c.live_keys <> 1 or c.test_keys <> 1 or c.last_read <> current_date or c.last_version <> '2026-12' or c.site_host <> 'proof-c84.in' or c.partner <> 'Studio 84'
  then raise exception 'FAIL: C''s row is % (a deleted key counted, or another store''s)', row_to_json(c); end if;
  if d.live_keys <> 2 or d.test_keys <> 0 or d.last_read is not null then raise exception 'FAIL: D''s row is %', row_to_json(d); end if;
  if admin_storefront_api_listed('c8400000-0000-0000-0000-000000000001') <> 2 then raise exception 'FAIL: listed is not active-and-not-scheduled (%)', admin_storefront_api_listed('c8400000-0000-0000-0000-000000000001'); end if;
  if admin_storefront_api_listed('c8400000-0000-0000-0000-000000000002') <> 1 then raise exception 'FAIL: D''s listed count'; end if;
end $$;
commit;
-- a partner reinstated: its shops with a live partner key are swept, in the window only; no key, no sweep
insert into audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, detail, at) values
  ('c8400000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'admin@frata.test', 'staff', 'shop.partner_reinstated', '{"partner":"Studio 84"}', now() - interval '1 minute'),
  ('c8400000-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', 'admin@frata.test', 'staff', 'shop.partner_reinstated', '{"partner":"Studio 84"}', now() - interval '1 minute'),
  (null, '99999999-9999-9999-9999-999999999999', 'admin@frata.test', 'staff', 'shop.partner_reinstated', '{"partner":"Studio 84"}', now() - interval '1 minute');
begin; set local role frata_app;
do $$ begin
  if not exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s = 'c8400000-0000-0000-0000-000000000001') then raise exception 'FAIL: a reinstated partner''s shop was not swept'; end if;
  if exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s = 'c8400000-0000-0000-0000-000000000002') then raise exception 'FAIL: a shop with no partner key was swept for a reinstatement'; end if;
  if exists (select 1 from app_shops_with_key_stop(now() - interval '6 minutes', now()) s where s is null) then raise exception 'FAIL: a null shop from an audit row with no tenant'; end if;
  if exists (select 1 from app_shops_with_key_stop(now() - interval '1 hour', now() - interval '30 minutes') s where s in ('c8400000-0000-0000-0000-000000000001', 'c8400000-0000-0000-0000-000000000002')) then raise exception 'FAIL: a reinstatement outside the window was swept'; end if;
end $$;
commit;
-- a domain gone: its shop's id, in the window only
update shop_domains set removed_at = now(), removed_reason = 'proof', removed_by = '99999999-9999-9999-9999-999999999999' where id = 'c8400000-0000-0000-0000-0000000000d2';
begin; set local role frata_app;
do $$ begin
  if not exists (select 1 from app_shops_with_domain_gone(now() - interval '6 minutes', now()) s where s = 'c8400000-0000-0000-0000-000000000002') then raise exception 'FAIL: a domain gone was not swept'; end if;
  if exists (select 1 from app_shops_with_domain_gone(now() - interval '6 minutes', now()) s where s = 'c8400000-0000-0000-0000-000000000001') then raise exception 'FAIL: a shop that kept its domain was swept'; end if;
  if exists (select 1 from app_shops_with_domain_gone(now() - interval '1 hour', now() - interval '30 minutes')) then raise exception 'FAIL: the domain sweep reached outside its window'; end if;
end $$;
commit;
-- paging: 601 shops with a moment in the window are two pages, no repeats, each id after the cursor; null is page one
begin;
insert into tenants (id, slug, name) select ('c8410000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'proof-p84-' || i, 'P' || i from generate_series(1, 601) i;
insert into products (tenant_id, handle, title, status, publish_at) select ('c8410000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'p', 'P', 'active', now() - interval '1 minute' from generate_series(1, 601) i;
set local role frata_app;
do $$ declare a uuid[]; b uuid[]; z uuid[]; last uuid; begin
  select array_agg(s) into a from app_shops_with_boundary(now() - interval '6 minutes', now()) s;
  select array_agg(s) into z from app_shops_with_boundary(now() - interval '6 minutes', now(), null) s;
  if a is distinct from z then raise exception 'FAIL: a null cursor is not the first page'; end if;
  if cardinality(a) <> 500 then raise exception 'FAIL: the first page holds %, not 500', cardinality(a); end if;
  last := a[500];
  select array_agg(s) into b from app_shops_with_boundary(now() - interval '6 minutes', now(), last) s;
  if exists (select 1 from unnest(b) x where x <= last) then raise exception 'FAIL: the second page repeats or goes back'; end if;
  if (select count(distinct x) from unnest(a || b) x where x::text like 'c8410000%') <> 601 then raise exception 'FAIL: two pages miss shops'; end if;
end $$;
rollback;
-- 87. Owner-only settings after handover (partner publishing PP1, 0150; docs/specs/2026-11-16-partner-publishing.md
-- § PP1 plan, tasks 2 and 4). Ask the owner: only the store's own live partner (never its owner, staff, a removed link or
-- another store's partner), only on a store with an owner, at most one line a page an India day, no store set writes
-- nothing; the line names no words, its page by its fixed address, its asker in `by`; app_notice_members gives it to
-- owners and Managers only; frata_app still can't insert a notice; only frata_app runs the definer. Then the race the
-- saves close: a save holds the store's row FOR SHARE, which a handover's FOR UPDATE waits on, and the other way round.
begin;
insert into tenants (id, slug, name) values
  ('c8700000-0000-0000-0000-000000000001', 'proof-87-p', 'Proof 87 P'), ('c8700000-0000-0000-0000-000000000002', 'proof-87-q', 'Proof 87 Q (no owner)'),
  ('c8700000-0000-0000-0000-000000000003', 'proof-87-z', 'Proof 87 Z'), ('c8700000-0000-0000-0000-000000000004', 'proof-87-w', 'Proof 87 W (link removed)');
with p as (insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
    values ('a8700000-0000-0000-0000-0000000000a1', 'proof-87@example.in', 'Pia87', 'Studio 87', '919845000087', 'Jaipur', '{}', '', '1-4', 1, now(), now()) returning id)
insert into partner_members (partner_id, user_id, email, role, accepted_at) select p.id, 'a8700000-0000-0000-0000-0000000000a1', 'proof-87@example.in', 'owner', now() from p;
insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days, removed_at)
  select t.id, pa.id, 2000, 24, 90, case when t.id = 'c8700000-0000-0000-0000-000000000004'::uuid then now() end
    from partners pa, (values ('c8700000-0000-0000-0000-000000000001'::uuid), ('c8700000-0000-0000-0000-000000000002'::uuid), ('c8700000-0000-0000-0000-000000000004'::uuid)) t(id)
   where pa.user_id = 'a8700000-0000-0000-0000-0000000000a1';
insert into members (tenant_id, user_id, role, partner_member_id)
  select t.id, pm.user_id, 'partner', pm.id from partner_members pm,
    (values ('c8700000-0000-0000-0000-000000000001'::uuid), ('c8700000-0000-0000-0000-000000000002'::uuid), ('c8700000-0000-0000-0000-000000000004'::uuid)) t(id)
   where pm.user_id = 'a8700000-0000-0000-0000-0000000000a1';
insert into members (tenant_id, user_id, role) values
  ('c8700000-0000-0000-0000-000000000001', 'a8700000-0000-0000-0000-0000000000b1', 'owner'), ('c8700000-0000-0000-0000-000000000001', 'a8700000-0000-0000-0000-0000000000b2', 'admin'),
  ('c8700000-0000-0000-0000-000000000001', 'a8700000-0000-0000-0000-0000000000b3', 'staff'), ('c8700000-0000-0000-0000-000000000003', 'a8700000-0000-0000-0000-0000000000b1', 'owner'),
  ('c8700000-0000-0000-0000-000000000004', 'a8700000-0000-0000-0000-0000000000b1', 'owner');
set local role frata_app;
do $$ declare pia constant uuid := 'a8700000-0000-0000-0000-0000000000a1'; n int; ask uuid; begin
  if app_ask_owner(pia, 'contact') then raise exception 'FAIL: an ask with no store set'; end if;
  perform set_config('app.tenant_id', 'c8700000-0000-0000-0000-000000000001', true);
  if app_ask_owner('a8700000-0000-0000-0000-0000000000b1', 'contact') then raise exception 'FAIL: the owner asked the owner'; end if;
  if app_ask_owner('a8700000-0000-0000-0000-0000000000b3', 'contact') then raise exception 'FAIL: staff asked the owner'; end if;
  if app_ask_owner(pia, 'store') or app_ask_owner(pia, null) or app_ask_owner(null, 'contact') then raise exception 'FAIL: an ask about a page that is not locked'; end if;
  if not app_ask_owner(pia, 'contact') then raise exception 'FAIL: the store''s partner could not ask its owner'; end if;
  if app_ask_owner(pia, 'contact') then raise exception 'FAIL: a second ask the same India day wrote a second line'; end if;
  if not app_ask_owner(pia, 'policies') then raise exception 'FAIL: another page''s ask was refused'; end if;
  select count(*) into n from notices where source_kind = 'ask_owner';
  if n <> 2 then raise exception 'FAIL: % ask lines, not 2', n; end if;
  if exists (select 1 from notices where source_kind = 'ask_owner' and (title is not null or body is not null or by <> pia or type <> 'needs_you' or required
             or href not in ('/console/settings/contact', '/console/settings/policies'))) then raise exception 'FAIL: an ask line carries words or the wrong page, asker or type'; end if;
  select id into ask from notices where source_kind = 'ask_owner' and href = '/console/settings/contact';
  if (select array_agg(user_id::text order by user_id) from app_notice_members(ask)) is distinct from array['a8700000-0000-0000-0000-0000000000b1', 'a8700000-0000-0000-0000-0000000000b2']
    then raise exception 'FAIL: an ask reaches % (owners and Managers only)', (select array_agg(role) from app_notice_members(ask)); end if;
  if (select count(*) from app_notice_members(null)) <> 4 or (select count(*) from app_notice_members()) <> 4 then raise exception 'FAIL: other notices no longer reach staff and the partner'; end if;
  if exists (select 1 from outbox where kind = 'email.notice' and payload->>'noticeId' = ask::text and next_attempt_at < now() + interval '9 minutes')
     or not exists (select 1 from outbox where kind = 'email.notice' and payload->>'noticeId' = ask::text) then raise exception 'FAIL: the ask is not emailed after the 10 minutes'; end if;
  begin insert into notices (tenant_id, type, source_kind, href) values ('c8700000-0000-0000-0000-000000000001', 'needs_you', 'ask_owner', '/console/settings/contact');
    raise exception 'FAIL: frata_app inserted a notice itself'; exception when insufficient_privilege then null; end;
  -- Another store: its partner is someone else (none), so this partner can't ask there; its notices hold nothing of P's.
  perform set_config('app.tenant_id', 'c8700000-0000-0000-0000-000000000003', true);
  if app_ask_owner(pia, 'contact') then raise exception 'FAIL: a partner asked the owner of a store it is not the partner of'; end if;
  if exists (select 1 from notices) then raise exception 'FAIL: Z sees or got an ask'; end if;
  perform set_config('app.tenant_id', 'c8700000-0000-0000-0000-000000000002', true);
  if app_ask_owner(pia, 'contact') then raise exception 'FAIL: an ask on a store with no owner'; end if;
  perform set_config('app.tenant_id', 'c8700000-0000-0000-0000-000000000004', true);
  if app_ask_owner(pia, 'contact') then raise exception 'FAIL: an ask through a removed link'; end if;
end $$;
reset role;
-- Yesterday's (India) ask doesn't stop today's; the same day's does.
update notices set created_at = date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' - interval '1 second'
 where tenant_id = 'c8700000-0000-0000-0000-000000000001' and href = '/console/settings/contact';
set local role frata_app;
do $$ begin
  perform set_config('app.tenant_id', 'c8700000-0000-0000-0000-000000000001', true);
  if not app_ask_owner('a8700000-0000-0000-0000-0000000000a1', 'contact') then raise exception 'FAIL: yesterday''s ask stopped today''s'; end if;
end $$;
rollback;
do $$ declare r text; begin
  if exists (select 1 from pg_proc where proname in ('app_ask_owner', 'app_notice_members') and (not prosecdef or proconfig is null or not ('search_path=""' = any (proconfig))))
    then raise exception 'FAIL: an owner-only definer is not a definer with an empty search_path'; end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder'] loop
    if has_function_privilege(r, 'app_ask_owner(uuid, text)', 'execute') then raise exception 'FAIL: % can run app_ask_owner', r; end if;
    if has_function_privilege(r, 'app_notice_members(uuid)', 'execute') then raise exception 'FAIL: % can run app_notice_members', r; end if;
  end loop;
  if exists (select 1 from information_schema.routine_privileges where routine_name in ('app_ask_owner', 'app_notice_members') and grantee = 'PUBLIC')
    then raise exception 'FAIL: PUBLIC can run an owner-only definer'; end if;
  if not has_function_privilege('frata_app', 'app_ask_owner(uuid, text)', 'execute') or not has_function_privilege('frata_app', 'app_notice_members(uuid)', 'execute')
    then raise exception 'FAIL: frata_app can''t run the owner-only definers'; end if;
  if has_table_privilege('frata_app', 'notices', 'insert') then raise exception 'FAIL: frata_app holds insert on notices'; end if;
  -- The saves' lock: frata_app may take FOR SHARE on its store's row (update on tenants (name)), and accepting a handover
  -- holds that row FOR UPDATE before it adds the owner.
  if not has_any_column_privilege('frata_app', 'tenants', 'update') then raise exception 'FAIL: frata_app can''t hold its store''s row'; end if;
  if (select prosrc from pg_proc where proname = 'app_accept_handover_v2') !~ 'from public\.tenants t where t\.id = v_tenant for update'
    then raise exception 'FAIL: accepting a handover no longer holds the store''s row'; end if;
end $$;
-- The race itself, on two connections (dblink, a contrib module): a handover in flight holds the row, so a save's share
-- lock waits (here: times out) and, once it commits, the save sees the owner; a save in flight makes the handover wait.
do $$ begin
  if not exists (select 1 from pg_available_extensions where name = 'dblink') then raise exception 'FAIL: 87 needs dblink for the two-connection race proof'; end if;
end $$;
select exists (select 1 from pg_available_extensions where name = 'dblink') as has_dblink \gset
\if :has_dblink
create extension if not exists dblink;
insert into tenants (id, slug, name) values ('c8700000-0000-0000-0000-000000000005', 'proof-87-r', 'Proof 87 R (race)');
insert into members (tenant_id, user_id, role) values ('c8700000-0000-0000-0000-000000000005', 'a8700000-0000-0000-0000-0000000000b2', 'admin');
select dblink_connect('race87', format('dbname=%s host=%s port=%s user=%s', current_database(), split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_user)) is not null as connected \gset
begin;
-- This connection is the handover: the row held, the owner added, not yet committed.
select 1 from tenants where id = 'c8700000-0000-0000-0000-000000000005' for update;
insert into members (tenant_id, user_id, role) values ('c8700000-0000-0000-0000-000000000005', 'a8700000-0000-0000-0000-0000000000b1', 'owner');
do $$ declare r text; begin
  perform dblink_exec('race87', 'begin');
  perform dblink_exec('race87', 'set local role frata_app');
  perform dblink_exec('race87', $q$set local app.tenant_id = 'c8700000-0000-0000-0000-000000000005'$q$);
  perform dblink_exec('race87', $q$set local lock_timeout = '300ms'$q$);
  perform x from dblink('race87', $q$select 1 from tenants where id = 'c8700000-0000-0000-0000-000000000005' for key share$q$, false) as t(x int);
  r := dblink_error_message('race87');
  if r !~ 'lock timeout' then raise exception 'FAIL: a save took the store''s row while a handover held it (%)', r; end if;
  perform dblink_exec('race87', 'rollback');
end $$;
commit;
do $$ declare owners int; begin
  perform dblink_exec('race87', 'begin');
  perform dblink_exec('race87', 'set local role frata_app');
  perform dblink_exec('race87', $q$set local app.tenant_id = 'c8700000-0000-0000-0000-000000000005'$q$);
  select n into owners from dblink('race87', $q$with held as (select id from tenants where id = 'c8700000-0000-0000-0000-000000000005' for key share)
    select (select count(*)::int from members where role = 'owner') from held$q$) as t(n int);
  if owners is distinct from 1 then raise exception 'FAIL: the save after the handover saw % owners', owners; end if;
  -- That save still holds its share lock: a handover now waits for it.
  begin
    set local lock_timeout = '300ms';
    perform 1 from tenants where id = 'c8700000-0000-0000-0000-000000000005' for update;
    raise exception 'FAIL: a handover took the store''s row while a save held it';
  exception when lock_not_available then null; end;
  perform dblink_exec('race87', 'rollback');
end $$;
select dblink_disconnect('race87') is not null as disconnected \gset
delete from members where tenant_id = 'c8700000-0000-0000-0000-000000000005';
delete from tenants where id = 'c8700000-0000-0000-0000-000000000005';
\else
do $$ begin raise exception 'FAIL: dblink is not installed, so § 87''s race proof cannot run'; end $$;
\endif
-- § 88 · The passkeys-off switch (drizzle/0151, owner 2026-11-16; security review H1, M1, M2). Off by default; on, getting
-- in counts as checked only for people who already qualify (staff; a live partner person, Builders included), never
-- for anyone else; managing passkeys still needs a real check; at most 7 days; every change audited; it ends by itself;
-- and no role can read the switch or call its readers.
reset role;
do $$ declare staff uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; outsider uuid := gen_random_uuid(); p uuid; s uuid := gen_random_uuid(); a jsonb; n int; fn text;
begin
  delete from public.platform_switches;
  select pm.user_id into p from public.partner_members pm where pm.user_id is not null and exists (select 1 from public.app_pm_live(pm.user_id)) limit 1;
  if p is null then raise exception 'FAIL: 88 needs a live partner person'; end if;
  -- Off: nothing changes.
  if (public.app_access_for(staff, s, null, null)->>'staffConfirmedAt') is not null then raise exception 'FAIL: 88 staff confirmed with the switch off'; end if;
  if (public.app_access_for(p, s, null, null)->>'partnerConfirmedAt') is not null then raise exception 'FAIL: 88 partner confirmed with the switch off'; end if;
  begin perform public.app_partner_need(p, s, '', false); raise exception 'FAIL: 88 the workspace let a partner in with the switch off';
  exception when others then if sqlerrm <> 'confirm_first' then raise; end if; end;
  -- On: getting in counts as checked for staff and live partner people only.
  select count(*) into n from public.audit_events where action = 'platform.passkeys_off';
  insert into public.platform_switches (key, until, set_by, reason) values ('passkeys_off', now() + interval '1 hour', 'proof', 'proof');
  if (select count(*) from public.audit_events where action = 'platform.passkeys_off') <> n + 1 then raise exception 'FAIL: 88 turning the switch on left no audit row'; end if;
  if (public.app_access_for(staff, s, null, null)->>'staffConfirmedAt') is null then raise exception 'FAIL: 88 staff not confirmed with the switch on'; end if;
  a := public.app_access_for(p, s, null, null);
  if (a->>'partnerConfirmedAt') is null then raise exception 'FAIL: 88 partner not confirmed with the switch on'; end if;
  if jsonb_array_length(a->'partnerHeld') <> 0 then raise exception 'FAIL: 88 a partner store still held with the switch on'; end if;
  perform public.app_partner_need(p, s, '', true);
  a := public.app_access_for(outsider, s, null, null);
  if (a->>'staffConfirmedAt') is not null or (a->>'partnerConfirmedAt') is not null or (a->>'staffRole') is not null
    then raise exception 'FAIL: 88 the switch covered someone who is neither staff nor a partner'; end if;
  begin perform public.app_partner_need(outsider, s, '', false); raise exception 'FAIL: 88 the switch let an outsider through app_partner_need';
  exception when others then if sqlerrm <> 'confirm_first' then raise; end if; end;
  -- On: managing passkeys still needs a real check (H1): the real helpers ignore the switch, and every passkey definer
  -- calls the real partner check.
  if public.app_staff_live_stepup(staff, s, '') is not null or public.app_partner_live_stepup(p, s, '') is not null
    then raise exception 'FAIL: 88 the switch reached the real passkey check'; end if;
  begin perform public.app_partner_need_real(p, s, '', false); raise exception 'FAIL: 88 the real partner check passed on the switch';
  exception when others then if sqlerrm <> 'confirm_first' then raise; end if; end;
  foreach fn in array array['app_partner_pk_approve', 'app_partner_pk_decline', 'app_partner_pk_list', 'app_partner_pk_remove', 'app_partner_pk_remove_all', 'app_handover_invite'] loop
    if (select prosrc from pg_proc where proname = fn) !~ 'app_partner_need_real\(' or (select prosrc from pg_proc where proname = fn) ~ 'app_partner_need\('
      then raise exception 'FAIL: 88 % no longer asks for a real passkey', fn; end if;
  end loop;
  foreach fn in array array['app_staff_challenge', 'app_staff_add_passkey', 'app_staff_approve', 'app_staff_remove_passkey', 'app_staff_list',
                            'admin_partner_pk_approve', 'admin_partner_pk_remove_all', 'app_partner_pk_challenge', 'app_partner_pk_add'] loop
    if (select prosrc from pg_proc where proname = fn) ~ 'app_passkeys_off|app_partner_need\(' then raise exception 'FAIL: 88 % follows the switch', fn; end if;
  end loop;
  -- At most 30 days (owner 2026-11-16; was 7), counted from the database's own now (a hand-set start can't stretch it),
  -- and it ends by itself.
  begin update public.platform_switches set until = now() + interval '31 days'; raise exception 'FAIL: 88 a switch was set for more than 30 days';
  exception when check_violation then null; end;
  begin update public.platform_switches set created_at = now() + interval '55 days', until = now() + interval '60 days';
    raise exception 'FAIL: 88 a hand-set start stretched the switch';
  exception when check_violation then null; end;
  update public.platform_switches set until = now() - interval '1 second';
  if (public.app_access_for(staff, s, null, null)->>'staffConfirmedAt') is not null or (public.app_access_for(p, s, null, null)->>'partnerConfirmedAt') is not null
    then raise exception 'FAIL: 88 the switch outlived its until'; end if;
  select count(*) into n from public.audit_events where action = 'platform.passkeys_on';
  delete from public.platform_switches;
  if (select count(*) from public.audit_events where action = 'platform.passkeys_on') <> n + 1 then raise exception 'FAIL: 88 taking the switch off left no audit row'; end if;
  if has_table_privilege('frata_app', 'public.platform_switches', 'select') or has_table_privilege('frata_admin', 'public.platform_switches', 'select')
     or has_table_privilege('frata_builder', 'public.platform_switches', 'select') or has_table_privilege('frata_app', 'public.platform_switches', 'insert')
    then raise exception 'FAIL: 88 a role can read or write the switch'; end if;
  foreach fn in array array['app_passkeys_off()', 'app_partner_need_real(uuid, uuid, text, boolean)', 'app_platform_switch_audit()'] loop
    if has_function_privilege('frata_app', 'public.' || fn, 'execute') or has_function_privilege('anon', 'public.' || fn, 'execute')
      then raise exception 'FAIL: 88 a role can call %', fn; end if;
  end loop;
end $$;
-- § 98 · One brand record (one-address plan P1·2, drizzle/0155; spec § 5). Each store reads and writes only its own
-- brand_tokens, brand_seasons and brand_proposals; a logo file outside the store's own brand folder is refused, in
-- brand_tokens and in shop_settings.logo_url; a Builder reads the live record's named columns only (never `previous`, a
-- proposal or a season) and shop_settings' five; one open proposal a store, decided once; the owner's line is written
-- for this store's open proposal only, once, and reaches owners and Managers only; no API role and no frata_admin grant.
begin;
insert into tenants (id, slug, name) values
  ('c9800000-0000-0000-0000-000000000001', 'proof-98-a', 'Proof 98 A'), ('c9800000-0000-0000-0000-000000000002', 'proof-98-b', 'Proof 98 B');
insert into shop_settings (tenant_id) values ('c9800000-0000-0000-0000-000000000001'), ('c9800000-0000-0000-0000-000000000002');
insert into members (tenant_id, user_id, role) values
  ('c9800000-0000-0000-0000-000000000001', 'a9800000-0000-0000-0000-0000000000b1', 'owner'), ('c9800000-0000-0000-0000-000000000001', 'a9800000-0000-0000-0000-0000000000b2', 'admin'),
  ('c9800000-0000-0000-0000-000000000001', 'a9800000-0000-0000-0000-0000000000b3', 'staff');
insert into brand_tokens (tenant_id, color_bg, color_panel, color_text, color_muted, color_accent, color_on, color_edge, color_line, color_good, color_warn, color_bad,
    font_display, font_body, radius, density, previous)
  select t, '#FBF7F1', '#F2EADF', '#221A14', '#665A4E', '#8C1D2C', '#FBF7F1', '#9A8B7A', '#DDD0BE', '#2F6B3B', '#8A5300', '#A3261B', 'tiro', 'mukta', 4, 'standard', '{"x":1}'
    from (values ('c9800000-0000-0000-0000-000000000001'::uuid), ('c9800000-0000-0000-0000-000000000002'::uuid)) v(t);
insert into brand_seasons (tenant_id, name, starts_at, color_accent, color_on) values ('c9800000-0000-0000-0000-000000000002', 'Diwali', now(), '#7A1F2B', '#FFFFFF');
insert into brand_proposals (id, tenant_id, record, summary, base_version, proposed_by) values
  ('d9800000-0000-0000-0000-0000000000b0', 'c9800000-0000-0000-0000-000000000002', '{}', '1 font.', 1, 'a9800000-0000-0000-0000-0000000000a1');
set local role frata_app;
do $$ declare a constant uuid := 'c9800000-0000-0000-0000-000000000001'; b constant uuid := 'c9800000-0000-0000-0000-000000000002';
  own constant text := 'https://x.public.blob.vercel-storage.com/tenants/c9800000-0000-0000-0000-000000000001/brand/';
  theirs constant text := 'https://x.public.blob.vercel-storage.com/tenants/c9800000-0000-0000-0000-000000000002/brand/'; n int; p uuid; nid uuid;
begin
  if exists (select 1 from brand_tokens) or exists (select 1 from brand_seasons) or exists (select 1 from brand_proposals) then raise exception 'FAIL: 98 a brand row with no store set'; end if;
  perform set_config('app.tenant_id', a::text, true);
  select count(*) into n from brand_tokens; if n <> 1 then raise exception 'FAIL: 98 A sees % brand records', n; end if;
  if exists (select 1 from brand_seasons) or exists (select 1 from brand_proposals) then raise exception 'FAIL: 98 A sees B''s season or proposal'; end if;
  update brand_tokens set color_accent = '#000000' where tenant_id = b; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: 98 A changed B''s record'; end if;
  begin insert into brand_seasons (tenant_id, name, starts_at, color_accent, color_on) values (b, 'x', now(), '#000000', '#FFFFFF');
    raise exception 'FAIL: 98 A wrote a season into B'; exception when insufficient_privilege then null; end;
  begin insert into brand_proposals (tenant_id, record, summary, base_version, proposed_by) values (b, '{}', 'x', 1, gen_random_uuid());
    raise exception 'FAIL: 98 A wrote a proposal into B'; exception when insufficient_privilege then null; end;
  begin update brand_tokens set tenant_id = b where tenant_id = a; raise exception 'FAIL: 98 a record moved stores'; exception when insufficient_privilege then null; end;
  -- The store's own folder only, for every logo file and for logo_url.
  update brand_tokens set logo_mark_url = own || repeat('a', 64) || '.svg', logo_stacked_url = own || '00000000-0000-0000-0000-000000000009-400.webp' where tenant_id = a;
  begin update brand_tokens set logo_mark_url = theirs || repeat('a', 64) || '.svg' where tenant_id = a; raise exception 'FAIL: 98 a mark from B''s folder'; exception when check_violation then null; end;
  begin update brand_tokens set logo_reversed_url = own || '../x.svg' where tenant_id = a; raise exception 'FAIL: 98 a dot segment'; exception when check_violation then null; end;
  begin update brand_tokens set logo_reversed_url = own || repeat('a', 64) || '.svg?x' where tenant_id = a; raise exception 'FAIL: 98 a query string'; exception when check_violation then null; end;
  begin update brand_tokens set logo_reversed_url = 'http://x.public.blob.vercel-storage.com/tenants/c9800000-0000-0000-0000-000000000001/brand/' || repeat('a', 64) || '.svg' where tenant_id = a;
    raise exception 'FAIL: 98 a plain http logo'; exception when check_violation then null; end;
  update shop_settings set logo_url = own || '00000000-0000-0000-0000-000000000009-400.webp' where tenant_id = a;
  begin update shop_settings set logo_url = theirs || '00000000-0000-0000-0000-000000000009-400.webp' where tenant_id = a; raise exception 'FAIL: 98 logo_url from B''s folder'; exception when check_violation then null; end;
  begin update shop_settings set logo_url = 'https://evil.example/logo.png' where tenant_id = a; raise exception 'FAIL: 98 logo_url off our store'; exception when check_violation then null; end;
  begin update shop_settings set logo_url = 'https://evil.example/tenants/c9800000-0000-0000-0000-000000000001/brand/' || repeat('a', 64) || '.svg' where tenant_id = a;
    raise exception 'FAIL: 98 the store''s own path on another host'; exception when check_violation then null; end;
  begin update brand_tokens set logo_mark_url = 'https://evil.example/tenants/c9800000-0000-0000-0000-000000000001/brand/' || repeat('a', 64) || '.svg' where tenant_id = a;
    raise exception 'FAIL: 98 a mark on another host'; exception when check_violation then null; end;
  -- 0155 (orders.invoice_logo): an invoice may freeze the store's own PNG rendition (documents/<sha256>.png), never another store's.
  insert into orders (tenant_id, number, payment_method, placed_at, invoice_logo)
    values (a, 98001, 'cod', now(), replace(own, '/brand/', '/documents/') || repeat('b', 64) || '.png');
  begin insert into orders (tenant_id, number, payment_method, placed_at, invoice_logo)
      values (a, 98002, 'cod', now(), replace(theirs, '/brand/', '/documents/') || repeat('b', 64) || '.png');
    raise exception 'FAIL: 98 an invoice froze B''s rendition'; exception when check_violation then null; end;
  begin update brand_tokens set color_text = '#abcdef' where tenant_id = a; raise exception 'FAIL: 98 a lower-case hex'; exception when check_violation then null; end;
  begin update brand_tokens set font_display = 'comic' where tenant_id = a; raise exception 'FAIL: 98 a font off the list'; exception when check_violation then null; end;
  begin update brand_tokens set radius = 2 where tenant_id = a; raise exception 'FAIL: 98 a corner off the steps'; exception when check_violation then null; end;
  -- One open proposal a store; a decision is made once.
  insert into brand_proposals (tenant_id, record, summary, base_version, proposed_by) values (a, '{}', '4 logo files and 2 fonts.', 1, 'a9800000-0000-0000-0000-0000000000a1') returning id into p;
  begin insert into brand_proposals (tenant_id, record, summary, base_version, proposed_by) values (a, '{}', '1 font.', 1, 'a9800000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL: 98 two open proposals'; exception when unique_violation then null; end;
  begin insert into brand_proposals (tenant_id, record, summary, base_version, proposed_by, decided_at, decision, decided_by)
      values (a, '{}', 'x', 1, gen_random_uuid(), now(), 'approved', gen_random_uuid()); raise exception 'FAIL: 98 a proposal born decided';
  exception when check_violation then null; end;
  -- The owner's line: once, for this store's open proposal; never for B's; reaching owners and Managers only.
  if app_brand_notice('d9800000-0000-0000-0000-0000000000b0') is not null then raise exception 'FAIL: 98 A wrote a line for B''s proposal'; end if;
  nid := app_brand_notice(p);
  if nid is null then raise exception 'FAIL: 98 no line for an open proposal'; end if;
  if app_brand_notice(p) is not null then raise exception 'FAIL: 98 a second line for one proposal'; end if;
  if exists (select 1 from notices where id = nid and (type <> 'needs_you' or source_kind <> 'brand' or source_id <> p or title is not null or body is not null
             or href <> '/console/brand' or by <> 'a9800000-0000-0000-0000-0000000000a1' or required)) then raise exception 'FAIL: 98 the line carries words or the wrong source'; end if;
  if (select array_agg(role order by role) from app_notice_members(nid)) is distinct from array['admin', 'owner'] then raise exception 'FAIL: 98 a brand line reaches %', (select array_agg(role) from app_notice_members(nid)); end if;
  update brand_proposals set decided_at = now(), decision = 'approved', decided_by = 'a9800000-0000-0000-0000-0000000000b1' where id = p;
  if app_brand_notice(p) is not null then raise exception 'FAIL: 98 a line for a decided proposal'; end if;
  begin update brand_proposals set decision = 'declined' where id = p; raise exception 'FAIL: 98 a decision changed'; exception when check_violation then null; end;
  begin update brand_proposals set record = '{"x":2}' where id = p; raise exception 'FAIL: 98 frata_app rewrote a proposal'; exception when insufficient_privilege then null; end;
  begin delete from brand_tokens; raise exception 'FAIL: 98 frata_app deleted a record'; exception when insufficient_privilege then null; end;
  perform set_config('app.tenant_id', b::text, true);
  if (select count(*) from brand_seasons) <> 1 or (select count(*) from brand_proposals) <> 1 then raise exception 'FAIL: 98 B lost its own rows'; end if;
  if exists (select 1 from notices where source_kind = 'brand') then raise exception 'FAIL: 98 B sees A''s line'; end if;
end $$;
reset role;
-- The Builder: named columns of its store's live record, only with its role set.
set local role frata_builder;
do $$ declare n int; begin
  perform set_config('app.tenant_id', 'c9800000-0000-0000-0000-000000000001', true);
  select count(*) into n from (select tenant_id, color_accent, font_display, logo_mark_url from brand_tokens) x;
  if n <> 0 then raise exception 'FAIL: 98 a Builder read with no role set'; end if;
  perform set_config('app.member_role', 'builder', true);
  select count(*) into n from (select tenant_id, color_accent, font_display, radius, density, logo_mark_url from brand_tokens) x;
  if n <> 1 then raise exception 'FAIL: 98 the Builder sees % records', n; end if;
  select count(*) into n from (select tenant_id, logo_url from shop_settings) x;
  if n <> 1 then raise exception 'FAIL: 98 the Builder sees % settings rows', n; end if;
  begin perform previous from brand_tokens; raise exception 'FAIL: 98 the Builder read previous'; exception when insufficient_privilege then null; end;
  begin perform updated_by from brand_tokens; raise exception 'FAIL: 98 the Builder read updated_by'; exception when insufficient_privilege then null; end;
  begin perform 1 from brand_proposals; raise exception 'FAIL: 98 the Builder read a proposal'; exception when insufficient_privilege then null; end;
  begin perform 1 from brand_seasons; raise exception 'FAIL: 98 the Builder read a season'; exception when insufficient_privilege then null; end;
  begin perform legal_name from shop_settings; raise exception 'FAIL: 98 the Builder read the legal name'; exception when insufficient_privilege then null; end;
  begin perform doc_logo from shop_settings; raise exception 'FAIL: 98 the Builder read the logo for paper'; exception when insufficient_privilege then null; end;
  begin update brand_tokens set color_accent = '#000000'; raise exception 'FAIL: 98 the Builder wrote'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ declare r text; t text; begin
  foreach t in array array['brand_tokens', 'brand_seasons', 'brand_proposals'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'FAIL: 98 % has no RLS', t; end if;
    foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin'] loop
      if has_table_privilege(r, 'public.' || t, 'select') or has_table_privilege(r, 'public.' || t, 'insert') or has_table_privilege(r, 'public.' || t, 'update')
         or has_table_privilege(r, 'public.' || t, 'delete') or has_any_column_privilege(r, 'public.' || t, 'select')
        then raise exception 'FAIL: 98 % holds a grant on %', r, t; end if;
    end loop;
    if exists (select 1 from pg_policies where tablename = t and roles @> array['frata_app']::name[] and (qual ~ 'is null' or with_check ~ 'is null'))
      then raise exception 'FAIL: 98 % has a null-store branch', t; end if;
  end loop;
  if has_table_privilege('frata_app', 'brand_tokens', 'delete') or has_table_privilege('frata_app', 'brand_proposals', 'delete') then raise exception 'FAIL: 98 frata_app may delete a record or a proposal'; end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder'] loop
    if has_function_privilege(r, 'app_brand_notice(uuid)', 'execute') then raise exception 'FAIL: 98 % can run app_brand_notice', r; end if;
  end loop;
  if exists (select 1 from pg_proc where proname = 'app_brand_notice' and (not prosecdef or not ('search_path=""' = any (proconfig))))
    then raise exception 'FAIL: 98 app_brand_notice is not a definer with an empty search_path'; end if;
end $$;
-- § 99 · Checkout design (one-address plan P2·1, drizzle/0161; spec § 3). Each store reads and writes only its own
-- checkout_design; the closed sets and the lines' lengths hold; a Builder reads the live design's named columns only
-- (never `previous` or `updated_by`); a checkout change waits beside a brand change (one open of each kind a store),
-- and the owner's line for it points at the Checkout tab; no API role and no frata_admin grant; frata_app never deletes.
begin;
insert into tenants (id, slug, name) values
  ('c9900000-0000-0000-0000-000000000001', 'proof-99-a', 'Proof 99 A'), ('c9900000-0000-0000-0000-000000000002', 'proof-99-b', 'Proof 99 B');
insert into shop_settings (tenant_id) values ('c9900000-0000-0000-0000-000000000001'), ('c9900000-0000-0000-0000-000000000002');
insert into members (tenant_id, user_id, role) values
  ('c9900000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-0000000000b1', 'owner'), ('c9900000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-0000000000b2', 'staff');
insert into checkout_design (tenant_id, header, back_link, policy_rows, trust, heading, thanks, previous) values
  ('c9900000-0000-0000-0000-000000000001', 'left', true, 1, array['delivery','returns','cod','secure'], 'Almost yours', 'For the days you will keep.', '{"x":1}'),
  ('c9900000-0000-0000-0000-000000000002', 'centre', false, 2, array['gst'], 'B heading', '', null);
set local role frata_app;
do $$ declare a constant uuid := 'c9900000-0000-0000-0000-000000000001'; b constant uuid := 'c9900000-0000-0000-0000-000000000002'; n int; p uuid; q uuid; nid uuid;
begin
  if exists (select 1 from checkout_design) then raise exception 'FAIL: 99 a design with no store set'; end if;
  perform set_config('app.tenant_id', a::text, true);
  select count(*) into n from checkout_design; if n <> 1 then raise exception 'FAIL: 99 A sees % designs', n; end if;
  update checkout_design set heading = 'x' where tenant_id = b; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: 99 A changed B''s design'; end if;
  begin insert into checkout_design (tenant_id) values (b); raise exception 'FAIL: 99 A wrote a design into B'; exception when insufficient_privilege then null; end;
  begin update checkout_design set tenant_id = b where tenant_id = a; raise exception 'FAIL: 99 a design moved stores'; exception when insufficient_privilege then null; end;
  begin delete from checkout_design; raise exception 'FAIL: 99 frata_app deleted a design'; exception when insufficient_privilege then null; end;
  -- The closed sets and the lengths.
  begin update checkout_design set header = 'right' where tenant_id = a; raise exception 'FAIL: 99 a header off the set'; exception when check_violation then null; end;
  begin update checkout_design set policy_rows = 3 where tenant_id = a; raise exception 'FAIL: 99 three rows'; exception when check_violation then null; end;
  begin update checkout_design set trust = array['delivery','returns','cod','secure','gst'] where tenant_id = a; raise exception 'FAIL: 99 five trust blocks'; exception when check_violation then null; end;
  begin update checkout_design set trust = array['tweets'] where tenant_id = a; raise exception 'FAIL: 99 a block off the set'; exception when check_violation then null; end;
  begin update checkout_design set trust = array['cod', null] where tenant_id = a; raise exception 'FAIL: 99 a null block'; exception when check_violation then null; end;
  begin update checkout_design set heading = repeat('a', 25) where tenant_id = a; raise exception 'FAIL: 99 a heading over 24'; exception when check_violation then null; end;
  begin update checkout_design set thanks = repeat('a', 121) where tenant_id = a; raise exception 'FAIL: 99 a thank-you line over 120'; exception when check_violation then null; end;
  update checkout_design set heading = repeat('a', 24), thanks = repeat('b', 120), trust = '{}' where tenant_id = a;
  -- A checkout change waits beside a brand change: one open of each kind.
  insert into brand_proposals (tenant_id, record, summary, base_version, proposed_by) values (a, '{}', '1 font.', 1, 'a9900000-0000-0000-0000-0000000000a1') returning id into p;
  insert into brand_proposals (tenant_id, kind, record, summary, base_version, proposed_by) values (a, 'checkout', '{}', 'The checkout heading.', 1, 'a9900000-0000-0000-0000-0000000000a1') returning id into q;
  begin insert into brand_proposals (tenant_id, kind, record, summary, base_version, proposed_by) values (a, 'checkout', '{}', 'x', 1, gen_random_uuid());
    raise exception 'FAIL: 99 two open checkout changes'; exception when unique_violation then null; end;
  begin update brand_proposals set kind = 'brand' where id = q; raise exception 'FAIL: 99 a change changed kind'; exception when insufficient_privilege then null; end;
  begin insert into brand_proposals (tenant_id, kind, record, summary, base_version, proposed_by) values (a, 'footer', '{}', 'x', 1, gen_random_uuid());
    raise exception 'FAIL: 99 a change of no known kind'; exception when check_violation then null; end;
  if (select kind from brand_proposals where id = p) <> 'brand' then raise exception 'FAIL: 99 a brand change lost its kind'; end if;
  nid := app_brand_notice(q);
  if nid is null or not exists (select 1 from notices where id = nid and href = '/console/brand/checkout' and source_kind = 'brand' and source_id = q)
    then raise exception 'FAIL: 99 the checkout line points elsewhere'; end if;
  nid := app_brand_notice(p);
  if nid is null or not exists (select 1 from notices where id = nid and href = '/console/brand') then raise exception 'FAIL: 99 the brand line moved'; end if;
  if (select array_agg(role order by role) from app_notice_members(nid)) is distinct from array['owner'] then raise exception 'FAIL: 99 a design line reaches %', (select array_agg(role) from app_notice_members(nid)); end if;
  perform set_config('app.tenant_id', b::text, true);
  if (select heading from checkout_design) <> 'B heading' then raise exception 'FAIL: 99 B lost its own design'; end if;
  if exists (select 1 from brand_proposals) then raise exception 'FAIL: 99 B sees A''s changes'; end if;
end $$;
reset role;
-- The Builder: named columns of its store's live design, only with its role set.
set local role frata_builder;
do $$ declare n int; begin
  perform set_config('app.tenant_id', 'c9900000-0000-0000-0000-000000000001', true);
  select count(*) into n from (select tenant_id, header, back_link, policy_rows, trust, heading, thanks from checkout_design) x;
  if n <> 0 then raise exception 'FAIL: 99 a Builder read with no role set'; end if;
  perform set_config('app.member_role', 'builder', true);
  select count(*) into n from (select tenant_id, header, back_link, policy_rows, trust, heading, thanks from checkout_design) x;
  if n <> 1 then raise exception 'FAIL: 99 the Builder sees % designs', n; end if;
  begin perform previous from checkout_design; raise exception 'FAIL: 99 the Builder read previous'; exception when insufficient_privilege then null; end;
  begin perform updated_by from checkout_design; raise exception 'FAIL: 99 the Builder read updated_by'; exception when insufficient_privilege then null; end;
  begin update checkout_design set heading = 'x'; raise exception 'FAIL: 99 the Builder wrote'; exception when insufficient_privilege then null; end;
  select count(*) into n from (select dispatch_days, metro_days, rest_days, return_kind, return_days, cod_on, cod_max from shop_settings) x;
  if n <> 1 then raise exception 'FAIL: 99 the Builder can''t read the trust facts'; end if;
  begin perform gstin from shop_settings; raise exception 'FAIL: 99 the Builder read the GSTIN'; exception when insufficient_privilege then null; end;
  begin perform cod_charge from shop_settings; raise exception 'FAIL: 99 the Builder read a setting past the trust facts'; exception when insufficient_privilege then null; end;
end $$;
rollback;
do $$ declare r text; begin
  if not (select relrowsecurity from pg_class where oid = 'public.checkout_design'::regclass) then raise exception 'FAIL: 99 checkout_design has no RLS'; end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin'] loop
    if has_table_privilege(r, 'public.checkout_design', 'select') or has_table_privilege(r, 'public.checkout_design', 'insert') or has_table_privilege(r, 'public.checkout_design', 'update')
       or has_table_privilege(r, 'public.checkout_design', 'delete') or has_any_column_privilege(r, 'public.checkout_design', 'select')
      then raise exception 'FAIL: 99 % holds a grant on checkout_design', r; end if;
  end loop;
  if exists (select 1 from pg_policies where tablename = 'checkout_design' and roles @> array['frata_app']::name[] and (qual ~ 'is null' or with_check ~ 'is null'))
    then raise exception 'FAIL: 99 checkout_design has a null-store branch'; end if;
  if has_table_privilege('frata_app', 'checkout_design', 'delete') then raise exception 'FAIL: 99 frata_app may delete a design'; end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'frata_admin', 'frata_builder'] loop
    if has_function_privilege(r, 'app_brand_notice(uuid)', 'execute') then raise exception 'FAIL: 99 % can run app_brand_notice', r; end if;
  end loop;
  if exists (select 1 from pg_proc where proname = 'app_brand_notice' and (not prosecdef or not ('search_path=""' = any (proconfig))))
    then raise exception 'FAIL: 99 app_brand_notice is not a definer with an empty search_path'; end if;
end $$;
-- § 101 · EkCode on by default (drizzle/0154; docs/specs/2026-11-16-ekcode-default-on.md E3). The SQL mirror of
-- `switchedOnNow` agrees with it on every case (no row, closed only, closed then open, each with and without the
-- default); Admin's list shows an open store that never chose and leaves out one that turned it off and one not open;
-- the reach count agrees; and only frata_admin calls the definers, nobody calls the predicate. Everything here is
-- undone at the end (the block raises its own marker to roll back).
reset role;
do $$ declare a uuid := '11111111-1111-1111-1111-111111111111'; b uuid := '22222222-2222-2222-2222-222222222222'; st uuid := gen_random_uuid();
  who uuid := gen_random_uuid(); fn text; r record; n bigint; t0 timestamptz; m int;
begin
  begin
    insert into public.platform_staff (user_id, email, role) values (st, 'proof101@frata.test', 'support');
    delete from public.tenant_modules where tenant_id in (a, b) and module = 'ekcode';
    update public.tenants set first_opened_at = coalesce(first_opened_at, now()) where id in (a, b);
    -- The truth table, one case at a time (the TS rule: on = open || (defaultOn && !touched)).
    if not exists (select 1 from public.app_module_on_tenants('ekcode', true) o where o.tenant_id = a) then raise exception 'FAIL: 101 no row with the default did not read on'; end if;
    if exists (select 1 from public.app_module_on_tenants('ekcode', false) o where o.tenant_id = a) then raise exception 'FAIL: 101 no row without the default read on'; end if;
    insert into public.tenant_modules (tenant_id, module, enabled_at, enabled_by, disabled_at, disabled_by) values (b, 'ekcode', now(), who, now(), who);
    if exists (select 1 from public.app_module_on_tenants('ekcode', true) o where o.tenant_id = b) or exists (select 1 from public.app_module_on_tenants('ekcode', false) o where o.tenant_id = b) then raise exception 'FAIL: 101 a store that turned it off read on'; end if;
    -- Admin's list: the store that never chose is in it, the one that turned it off is not; without the default, neither.
    if not exists (select 1 from public.app_admin_ekcode_shops(st, 7, true) x where x.tenant_id = a) then raise exception 'FAIL: 101 Admin left out a store on by default'; end if;
    if exists (select 1 from public.app_admin_ekcode_shops(st, 7, true) x where x.tenant_id = b) then raise exception 'FAIL: 101 Admin listed a store that turned EkCode off'; end if;
    if exists (select 1 from public.app_admin_ekcode_shops(st, 7, false) x where x.tenant_id in (a, b)) then raise exception 'FAIL: 101 Admin listed a store with no open row and no default'; end if;
    select * into r from public.app_admin_ekcode_reach(st, true);
    select count(*) into n from public.tenants t where t.first_opened_at is not null and t.id in (select o.tenant_id from public.app_module_on_tenants('ekcode', true) o);
    if r.offering <> n or r.opened < r.offering then raise exception 'FAIL: 101 the reach count disagrees with the rule (% vs %)', r.offering, n; end if;
    -- The busiest hour is a rolling 60 minutes, as the limit counts it: four codes before :00 and one after read 5, not
    -- 4; under 5 it is not shown at all (tenancy S1).
    create temp table c101 as select * from public.ekcode_codes order by created_at desc limit 1;
    if not exists (select 1 from c101) then raise exception 'FAIL: 101 needs an EkCode code from the vault proof to copy'; end if;
    t0 := date_trunc('hour', now() - interval '3 days');
    select * into r from public.app_admin_ekcode_reach(st, true);
    if r.busiest_hour is not null or r.busiest_at is not null then raise exception 'FAIL: 101 a busiest hour under 5 codes was shown'; end if;
    foreach m in array array[-20, -15, -10, -5, 5] loop
      update c101 set id = gen_random_uuid(), created_at = t0 + make_interval(mins => m), wamid = null, proof_digest = null;
      insert into public.ekcode_codes select * from c101;
    end loop;
    select * into r from public.app_admin_ekcode_reach(st, true);
    -- Counted by the minute: the window ends with the minute of the last code (t0 + 5 min → t0 + 6 min).
    if r.busiest_hour is distinct from 5 or r.busiest_at is distinct from t0 + interval '6 minutes' then raise exception 'FAIL: 101 the busiest hour is not a rolling 60 minutes (% at %)', r.busiest_hour, r.busiest_at; end if;
    -- On again after off: an open row beside the closed one reads on, default or not.
    insert into public.tenant_modules (tenant_id, module, enabled_by) values (b, 'ekcode', who);
    if not exists (select 1 from public.app_module_on_tenants('ekcode', true) o where o.tenant_id = b) or not exists (select 1 from public.app_module_on_tenants('ekcode', false) o where o.tenant_id = b) then raise exception 'FAIL: 101 on again after off did not read on'; end if;
    if not exists (select 1 from public.app_admin_ekcode_shops(st, 7, true) x where x.tenant_id = b) then raise exception 'FAIL: 101 Admin left out a store turned on again'; end if;
    -- A store that has not opened is never listed, on or not.
    update public.tenants set first_opened_at = null where id = a;
    if exists (select 1 from public.app_admin_ekcode_shops(st, 7, true) x where x.tenant_id = a) then raise exception 'FAIL: 101 Admin listed a store that has not opened'; end if;
    -- As frata_admin itself (the definer runs the revoked helper as its owner): the whole chain works for the one role.
    set local role frata_admin;
    perform 1 from public.app_admin_ekcode_shops(st, 7, true); perform 1 from public.app_admin_ekcode_reach(st, true);
    begin perform 1 from public.app_module_on_tenants('ekcode', true); raise exception 'FAIL: 101 frata_admin called app_module_on_tenants';
    exception when insufficient_privilege then null; end;
    reset role;
    -- Staff only.
    begin perform 1 from public.app_admin_ekcode_shops(gen_random_uuid(), 7, true); raise exception 'FAIL: 101 a non-staff id read the list';
    exception when others then if sqlerrm <> 'not_staff' then raise; end if; end;
    begin perform 1 from public.app_admin_ekcode_reach(gen_random_uuid(), true); raise exception 'FAIL: 101 a non-staff id read the reach';
    exception when others then if sqlerrm <> 'not_staff' then raise; end if; end;
    raise exception 'ok-101';
  exception when others then if sqlerrm <> 'ok-101' then raise; end if;
  end;
  -- Grants: only frata_admin calls the definers; the predicate is no role's; the old signature is gone.
  foreach fn in array array['app_admin_ekcode_shops(uuid, int, boolean)', 'app_admin_ekcode_reach(uuid, boolean)'] loop
    if not has_function_privilege('frata_admin', 'public.' || fn, 'execute') then raise exception 'FAIL: 101 frata_admin cannot call %', fn; end if;
    if has_function_privilege('frata_app', 'public.' || fn, 'execute') or has_function_privilege('frata_builder', 'public.' || fn, 'execute')
       or has_function_privilege('anon', 'public.' || fn, 'execute') or has_function_privilege('authenticated', 'public.' || fn, 'execute')
       or has_function_privilege('service_role', 'public.' || fn, 'execute') then raise exception 'FAIL: 101 a role other than frata_admin can call %', fn; end if;
    if not coalesce((select 'search_path=""' = any(p.proconfig) from pg_proc p where p.oid = ('public.' || fn)::regprocedure), false)
      then raise exception 'FAIL: 101 % lost its empty search_path', fn; end if;
  end loop;
  foreach fn in array array['frata_app', 'frata_admin', 'frata_builder', 'anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(fn, 'public.app_module_on_tenants(text, boolean)', 'execute') then raise exception 'FAIL: 101 % can call app_module_on_tenants', fn; end if;
  end loop;
  if to_regprocedure('public.app_admin_ekcode_shops(uuid, int)') is not null then raise exception 'FAIL: 101 the old two-argument list is still there'; end if;
end $$;
-- § 101 (cont.) · The turn-off write: frata_app records its own store's choice as one closed row (both stamps, one
-- person) and cannot write one for another store; rolled back.
begin; set local role frata_app;
do $$ declare who uuid := '99999999-9999-9999-9999-999999999999'; begin
  perform set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
  insert into tenant_modules (tenant_id, module, enabled_at, enabled_by, disabled_at, disabled_by) values ('11111111-1111-1111-1111-111111111111', 'ekcode', now(), who, now(), who);
  begin insert into tenant_modules (tenant_id, module, enabled_at, enabled_by, disabled_at, disabled_by) values ('22222222-2222-2222-2222-222222222222', 'ekcode', now(), who, now(), who);
    raise exception 'FAIL: 101 A wrote a closed EkCode row for B';
  exception when insufficient_privilege then null; end;
  begin insert into tenant_modules (tenant_id, module, enabled_at, enabled_by, disabled_at) values ('11111111-1111-1111-1111-111111111111', 'ekcode', now(), who, now());
    raise exception 'FAIL: 101 a closed row with no one who closed it';
  exception when check_violation then null; end;
end $$;
rollback;
\echo 'tenancy proof — all checks passed (through § 102)'
