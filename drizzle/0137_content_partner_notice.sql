-- V1 content follow-up (owner, 2026-11-15: a partner member manages Content after handover; plan
-- docs/plans/2026-11-15-v1-content.md § Follow-up). A partner's save tells the owner in the Inbox: one needs_you line
-- per partner an hour, worded from the place's name (never the content), emailed after 10 minutes if unread.
-- Everything is read from the rows: the store from app_current_tenant() (never an argument), the saver from the row's
-- own updated_by, whether that person is the store's partner and whether the store has an owner from members. What
-- the save did is a fixed verb (added, changed, ended, deleted; anything else reads "changed"). Called by Console ›
-- Content's actions inside the save's transaction; returns whether it wrote.
create or replace function app_content_partner_notice(p_table text, p_id uuid, p_verb text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid := public.app_current_tenant(); v_by uuid; v_place text; v_tab text;
  v_verb text := case when p_verb in ('added', 'changed', 'ended', 'deleted') then p_verb else 'changed' end;
begin
  if t is null then return false; end if;
  if p_table = 'site_content' then
    select c.updated_by,
           case c.kind when 'announcement' then 'an announcement bar' when 'contact' then 'the Contact line'
             else case c.key when 'main' then 'the main menu' when 'footer' then 'the footer menu' when 'tabs' then 'the phone tabs' else 'a menu' end end,
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
  -- One line per partner an hour, whatever they touch (security review MED-1: adding and deleting bars makes new rows,
  -- so a per-row limit let a partner fill the Inbox). The line names the first place; Activity has every save.
  if exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'content' and n.by = v_by
             and n.created_at > now() - interval '1 hour') then return false; end if;
  perform public.notice_write(t, 'needs_you', 'content', p_id, 'Your partner ' || v_verb || ' ' || v_place, 'See it in Content.',
    '/console/content?tab=' || v_tab, false, true, null, v_by);
  return true;
end $$;
--> statement-breakpoint
revoke all on function app_content_partner_notice(text, uuid, text) from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
grant execute on function app_content_partner_notice(text, uuid, text) to frata_app;
--> statement-breakpoint
-- The move's own notice is the one with no source row: a partner's line (which names its row) must not stop the move's
-- re-run from telling the store what it couldn't move (security review LOW-7). The function is 0135's, that one check
-- narrowed; nothing else changes.
create or replace function app_move_content() returns void
  language plpgsql volatile security invoker set search_path = '' as $$
declare
  t uuid; rev uuid; layer jsonb; draft jsonb; ann jsonb; v jsonb; m text; moved int; lost text[]; skipped text[];
  body text;
  names constant jsonb := '{"main":"Main menu","footer":"Footer menu","tabs":"Phone tabs"}';
begin
  for t in select id from public.tenants order by id loop
    perform set_config('app.tenant_id', t::text, true);
    moved := 0; lost := '{}'; skipped := '{}'; layer := null; draft := null;

    select c.revision_id into rev from (
      select distinct on (r.theme_key, r.theme_version) p.id as publish_id, p.revision_id, r.theme_key, r.theme_version, p.published_at
      from public.shop_theme_publishes p
      join public.shop_theme_revisions r on r.tenant_id = p.tenant_id and r.id = p.revision_id
      where p.tenant_id = t
      order by r.theme_key, r.theme_version, p.published_at desc, p.id desc
    ) c
    where not exists (select 1 from public.theme_versions tv where tv.theme_key = c.theme_key and tv.version = c.theme_version and tv.withdrawn_at is not null)
    order by c.published_at desc, c.publish_id desc limit 1;

    select r.settings into draft from public.shop_theme_revisions r
      where r.tenant_id = t and not exists (select 1 from public.shop_theme_publishes p where p.tenant_id = t and p.revision_id = r.id)
      order by r.created_at desc limit 1;

    if rev is not null then
      select r.settings into layer from public.shop_theme_revisions r where r.tenant_id = t and r.id = rev;
    else
      layer := draft; draft := null;
    end if;

    if layer is not null then
      -- The bar (one entry, no dates; its colour kept).
      ann := layer->'settings'->'announcement';
      if jsonb_typeof(ann) = 'object' and length(btrim(coalesce(ann->>'text', ''))) > 0 then
        v := jsonb_build_object('text', ann->'text', 'link', coalesce(ann->'link', 'null'::jsonb), 'scheme', coalesce(ann->'scheme', '"paper"'::jsonb));
        if octet_length(v::text) <= 32768 then
          insert into public.site_content (tenant_id, kind, key, value) values (t, 'announcement', 'moved', v)
            on conflict (tenant_id, kind, key) do update set value = excluded.value, updated_at = now()
            where public.site_content.updated_by is null and public.site_content.value is distinct from excluded.value;
          moved := moved + 1;
        else skipped := skipped || 'Announcement'; end if;
      end if;
      -- Menus, one row each.
      foreach m in array array['main', 'footer', 'tabs'] loop
        v := layer->'menus'->m;
        if jsonb_typeof(v) = 'array' then
          if octet_length(v::text) <= 32768 then
            insert into public.site_content (tenant_id, kind, key, value) values (t, 'menu', m, v)
              on conflict (tenant_id, kind, key) do update set value = excluded.value, updated_at = now()
              where public.site_content.updated_by is null and public.site_content.value is distinct from excluded.value;
            moved := moved + 1;
          else skipped := skipped || (names->>m); end if;
        end if;
      end loop;
      -- The Contact line.
      v := layer->'contact';
      if jsonb_typeof(v) = 'object' and length(btrim(coalesce(v->>'line', ''))) > 0 then
        insert into public.site_content (tenant_id, kind, key, value) values (t, 'contact', 'contact', jsonb_build_object('line', v->'line'))
          on conflict (tenant_id, kind, key) do update set value = excluded.value, updated_at = now()
          where public.site_content.updated_by is null and public.site_content.value is distinct from excluded.value;
        moved := moved + 1;
      end if;
    end if;
    -- A moved bar nobody saved leaves when the live look turned the bar off (old code writes an explicit null). An
    -- absent part is never a removal: looks saved by the new code carry no bar, menus or Contact line at all.
    if layer is not null and (layer->'settings') ? 'announcement' and jsonb_typeof(layer->'settings'->'announcement') = 'null' then
      delete from public.site_content c where c.tenant_id = t and c.kind = 'announcement' and c.key = 'moved' and c.updated_by is null;
    end if;

    -- What the open draft had that was not live (it stays in the draft; Content shows what shoppers see).
    if draft is not null then
      if (draft->'menus') is distinct from (layer->'menus') then lost := lost || 'menu'::text; end if;
      if (draft->'settings'->'announcement') is distinct from (layer->'settings'->'announcement') then lost := lost || 'bar'::text; end if;
      if (draft->'contact') is distinct from (layer->'contact') then lost := lost || 'Contact line'::text; end if;
    end if;

    -- Pages save live from now on: a live page's words are its draft; a page never published is hidden.
    if exists (select 1 from public.shop_pages p where p.tenant_id = t and p.live is not null and p.removed_at is null
        and ((p.draft - 'hidden' - 'removed') is distinct from p.live or coalesce((p.draft->>'hidden')::boolean, false) or p.draft ? 'removed')) then
      lost := lost || 'page'::text;
    end if;
    update public.shop_pages p set draft = p.live || '{"hidden": false}'::jsonb, previous = null
      where p.tenant_id = t and p.live is not null and p.removed_at is null and p.draft is distinct from (p.live || '{"hidden": false}'::jsonb);
    update public.shop_pages p set draft = (p.draft - 'removed') || '{"hidden": true}'::jsonb, previous = null
      where p.tenant_id = t and p.live is null and p.removed_at is null and p.draft is distinct from ((p.draft - 'removed') || '{"hidden": true}'::jsonb);

    if (moved > 0 or cardinality(lost) > 0 or cardinality(skipped) > 0)
        and not exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'content' and n.source_id is null) then
      -- "Unpublished menu changes were not moved." / "Unpublished menu, bar and page changes were not moved."
      body := case when cardinality(lost) = 0 then ''
        when cardinality(lost) = 1 then 'Unpublished ' || lost[1] || ' changes were not moved.'
        else 'Unpublished ' || array_to_string(lost[1:cardinality(lost) - 1], ', ') || ' and ' || lost[cardinality(lost)] || ' changes were not moved.' end;
      if cardinality(skipped) > 0 then
        body := btrim(body || ' Too long to move: ' || array_to_string(skipped, ', ') || '.');
      end if;
      perform public.notice_write(t, 'needs_you', 'content', null, 'Your menus, bars and Contact line are now in Content',
        nullif(left(body, 1000), ''), '/console/content', false, false, null, null);
    end if;
  end loop;
  perform set_config('app.tenant_id', '', true);
end $$;
--> statement-breakpoint
revoke all on function app_move_content() from public, anon, authenticated, service_role, frata_app, frata_admin;
