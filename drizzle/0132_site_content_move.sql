-- =============================================================================
-- V1 CONTENT — THE MOVE OUT OF THE LOOK (plan docs/plans/2026-11-15-v1-content.md § The move; reviews 2026-11-15).
-- Hand-written.
--
-- Copies each store's bar, menus and Contact line from its LIVE look into site_content, and lets its pages save live:
--   - The live look is the newest publish of each theme version, newest first, minus WITHDRAWN versions (recalled ones
--     stay live): `publishCandidates` + `liveOf` (src/lib/themes/look.ts, src/domains/themes/release.ts), restated
--     here and held to them by site-content-move.int.test.ts. A store that never published a look (a partner building
--     it before handover cannot publish) is copied from its open draft: there is nothing live to differ from.
--   - Values are copied VERBATIM (the store's tolerant read decides at render; the strict rule applies at the next
--     save). `menus.<k>` null or absent → no row (the store's default from its collections); [] → an empty menu.
--     The Contact line only when it has words. A value over 32 kB is skipped and named in the notice.
--   - Production is reached only through the Supabase API, so this runs as the migration's owner (no row policy):
--     every statement names `tenant_id = t`, and `app.tenant_id` is set per store so the cap trigger sees that store.
--   - Re-runnable and reconciling: the orchestrator runs `select app_move_content()` again once the new deployment is
--     Ready and 24 hours later. A row a person saved (`updated_by` set) is never touched; a moved row nobody saved is
--     refreshed from the live look, and a moved bar leaves when the live look turned it off. A later migration drops the function.
--   - Pages: a live page's words become its draft (`draft := live`, shown); a never-published page is hidden; `previous`
--     is cleared (no stale Undo). The publish tie is cut in the next migration (a short lock of its own).
--   - One Inbox notice per store, once, only when something moved or was left behind, naming places, never words.
-- =============================================================================
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
      if (draft->'menus') is distinct from (layer->'menus') then lost := lost || 'menus'::text; end if;
      if (draft->'settings'->'announcement') is distinct from (layer->'settings'->'announcement') then lost := lost || 'the bar'::text; end if;
      if (draft->'contact') is distinct from (layer->'contact') then lost := lost || 'the Contact line'::text; end if;
    end if;

    -- Pages save live from now on: a live page's words are its draft; a page never published is hidden.
    if exists (select 1 from public.shop_pages p where p.tenant_id = t and p.live is not null and p.removed_at is null
        and ((p.draft - 'hidden' - 'removed') is distinct from p.live or coalesce((p.draft->>'hidden')::boolean, false) or p.draft ? 'removed')) then
      lost := lost || 'page words'::text;
    end if;
    update public.shop_pages p set draft = p.live || '{"hidden": false}'::jsonb, previous = null
      where p.tenant_id = t and p.live is not null and p.removed_at is null and p.draft is distinct from (p.live || '{"hidden": false}'::jsonb);
    update public.shop_pages p set draft = (p.draft - 'removed') || '{"hidden": true}'::jsonb, previous = null
      where p.tenant_id = t and p.live is null and p.removed_at is null and p.draft is distinct from ((p.draft - 'removed') || '{"hidden": true}'::jsonb);

    if (moved > 0 or cardinality(lost) > 0 or cardinality(skipped) > 0)
        and not exists (select 1 from public.notices n where n.tenant_id = t and n.source_kind = 'content') then
      body := case when cardinality(lost) > 0 then 'Unpublished changes to ' || array_to_string(lost, ', ') || ' were not moved.' else '' end;
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
--> statement-breakpoint
select app_move_content();
