-- V1 content follow-up (owner, 2026-11-15: a partner member manages Content after handover; plan
-- docs/plans/2026-11-15-v1-content.md § Follow-up). A partner's save tells the owner in the Inbox: one needs_you line
-- per place an hour, worded from the place's name (never the content), emailed after 10 minutes if unread.
-- Everything is read from the rows: the store from app_current_tenant() (never an argument), the saver from the row's
-- own updated_by, whether that person is the store's partner and whether the store has an owner from members. Called
-- by Console › Content's actions inside the save's transaction; returns whether it wrote.
create or replace function app_content_partner_notice(p_table text, p_id uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); v_by uuid; v_place text; v_tab text;
begin
  if t is null then return false; end if;
  if p_table = 'site_content' then
    select c.updated_by,
           case c.kind when 'announcement' then 'an announcement bar' when 'contact' then 'the Contact line'
             else case c.key when 'main' then 'the main menu' when 'footer' then 'the footer menu' else 'the phone tabs' end end,
           case c.kind when 'announcement' then 'announcement' when 'menu' then 'menus' else 'contact' end
      into v_by, v_place, v_tab from public.site_content c where c.tenant_id = t and c.id = p_id;
  elsif p_table = 'shop_pages' then
    select p.updated_by, case p.template when 'faq' then 'the FAQ' else 'a page' end, case p.template when 'faq' then 'faq' else 'pages' end
      into v_by, v_place, v_tab from public.shop_pages p where p.tenant_id = t and p.id = p_id;
  else
    return false;
  end if;
  if v_by is null then return false; end if;
  if not exists (select 1 from public.members m where m.tenant_id = t and m.user_id = v_by and m.role = 'partner') then return false; end if;
  if not exists (select 1 from public.members m where m.tenant_id = t and m.role = 'owner') then return false; end if;
  -- One line per place an hour: a partner's run of saves is one line, not thirty.
  if exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'content' and n.source_id = p_id
             and n.created_at > now() - interval '1 hour') then return false; end if;
  perform public.notice_write(t, 'needs_you', 'content', p_id, 'Your partner changed ' || v_place, 'See it in Content.',
    '/console/content?tab=' || v_tab, false, true, null, null);
  return true;
end $$;
--> statement-breakpoint
revoke all on function app_content_partner_notice(text, uuid) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_content_partner_notice(text, uuid) to frata_app;
