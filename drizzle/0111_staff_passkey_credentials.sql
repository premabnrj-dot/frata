-- Staff passkeys, fix found on the first production sign-up (2026-11-12): a passkey check asked the browser for "any
-- passkey of this site", so a passkey left on the device by an earlier, unrecorded try could answer and be refused
-- ("Not confirmed"). The check now names the person's own credentials (allowCredentials). Credential ids are not secret
-- (a browser sends them in the clear); this returns only ids and transports, never a key or counter, and only frata_admin
-- (the server, for the signed-in staff member) may call it.
create or replace function app_staff_credentials(p_uid uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.credential_id, 'transports', to_jsonb(k.transports)) order by k.created_at), '[]'::jsonb)
    from public.staff_passkeys k join public.platform_staff ps on ps.user_id = k.user_id
   where k.user_id = p_uid
$$;--> statement-breakpoint
revoke all on function app_staff_credentials(uuid) from public, anon, authenticated, service_role, frata_app, frata_admin;--> statement-breakpoint
grant execute on function app_staff_credentials(uuid) to frata_admin;
