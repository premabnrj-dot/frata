-- =============================================================================
-- 1S SETTINGS ACCESS (docs/plans/2026-11-06-phase-1-first-sale.md). Hand-written.
-- =============================================================================

revoke all on shop_policies from anon, authenticated;
--> statement-breakpoint
alter table shop_policies enable row level security;
--> statement-breakpoint
grant select, insert, update, delete on shop_policies to frata_app;
--> statement-breakpoint
create policy tenant_rows on shop_policies for all to frata_app
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- A shop's address (its slug) changes only here: by an owner or admin of that
-- shop, before it is published (after, Frata support moves it in Admin, until
-- retired addresses redirect — plan § Shape). The tenant comes from
-- requireMember and is re-checked against members; the uid from getUser().
create or replace function app_change_shop_address(p_tenant uuid, p_uid uuid, p_slug text)
  returns void
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_old text;
  v_email text;
begin
  if not exists (select 1 from public.members m where m.tenant_id = p_tenant and m.user_id = p_uid and m.role in ('owner','admin')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shop_settings s where s.tenant_id = p_tenant and s.published_at is not null) then
    raise exception 'published' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or p_slug ~ '--' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select t.slug into v_old from public.tenants t where t.id = p_tenant for update;
  if v_old = p_slug then return; end if;
  if exists (select 1 from public.tenants t where t.slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  update public.tenants set slug = p_slug where id = p_tenant;
  select u.email into v_email from auth.users u where u.id = p_uid;
  insert into public.audit_events (tenant_id, actor_user_id, actor_email, actor_kind, action, target, detail)
    values (p_tenant, p_uid, v_email, 'member', 'shop.address_changed', p_slug, jsonb_build_object('from', v_old));
end;
$$;
--> statement-breakpoint
revoke all on function app_change_shop_address(uuid, uuid, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function app_change_shop_address(uuid, uuid, text) to frata_app;
