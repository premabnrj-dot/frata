-- =============================================================================
-- PRODUCT VIDEO PV·1 — access (docs/plans/2026-11-10-product-video-pv1.md; tenancy audit 2026-11-10). Hand-written.
-- videos.use is set once, at insert (never updated: a linked product video flipped to 'loop' would be released by the
-- Look's cleanup). product_videos: own shop only, both ways (RLS), its keys never change (only the cover frame and the
-- button's words are updated), and a trigger refuses a video that isn't a product's. No Admin grant: no Admin feature
-- reads it (frata_admin holds nothing on videos either).
-- =============================================================================
grant insert (use) on videos to frata_app;
--> statement-breakpoint
revoke all on product_videos from public, anon, authenticated, service_role, frata_admin;
--> statement-breakpoint
alter table product_videos enable row level security;
--> statement-breakpoint
grant select, insert, delete on product_videos to frata_app;
--> statement-breakpoint
grant update (poster_ms, button) on product_videos to frata_app;
--> statement-breakpoint
create policy tenant_rows on product_videos for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
-- SECURITY INVOKER (the caller's row policy applies to the lookup too): the video must be this shop's, a product's.
create or replace function product_video_is_product() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.videos v where v.tenant_id = new.tenant_id and v.id = new.video_id and v.use = 'product') then
    raise exception 'product_video_is_product' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke execute on function product_video_is_product() from public, anon, authenticated, service_role;
--> statement-breakpoint
create trigger product_videos_is_product before insert or update of video_id, tenant_id on product_videos for each row execute function product_video_is_product();
