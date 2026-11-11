-- =============================================================================
-- ADMIN › INFRASTRUCTURE, the Mux tab (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·1; architecture review MINOR:
-- raw facts out, live/cap derived in TypeScript by videoState and PRODUCT_VIDEO_CAPS, never restated in SQL). Hand-written.
-- frata_admin holds nothing on videos (drizzle/0090); this definer hands Admin one row per video for the month's
-- picture: the shop's name and plan, the video's use, length and state times, and the product's title. No playback
-- id, upload id or URL, nothing a shopper wrote. EXECUTE to frata_admin only (ADR-0007 amendment, recorded in the plan).
-- =============================================================================
create or replace function admin_video_usage(since timestamptz) returns jsonb
language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(v order by v.created_at), '[]'::jsonb) from (
    select vi.asset_id, vi.tenant_id, t.name as shop, pl.code as plan, (tp.trial_ends_at > now()) as on_trial, vi.use, vi.duration_ms,
           vi.created_at, vi.upload_id is not null as uploaded, vi.ready_at, vi.mp4_ready_at, vi.errored_at, vi.error, vi.removed_at,
           p.title as product
    from public.videos vi
    join public.tenants t on t.id = vi.tenant_id
    left join lateral (select x.plan_version_id, x.trial_ends_at from public.tenant_plans x
                       where x.tenant_id = vi.tenant_id and x.starts_at <= now() order by x.starts_at desc limit 1) tp on true
    left join public.plan_versions pv on pv.id = tp.plan_version_id
    left join public.plans pl on pl.id = pv.plan_id
    left join public.product_videos pvd on pvd.tenant_id = vi.tenant_id and pvd.video_id = vi.id
    left join public.products p on p.tenant_id = pvd.tenant_id and p.id = pvd.product_id
    where vi.removed_at is null or vi.removed_at >= since or vi.created_at >= since
    limit 5000) v
$$;
--> statement-breakpoint
revoke execute on function admin_video_usage(timestamptz) from public, anon, authenticated, service_role, frata_app;
--> statement-breakpoint
grant execute on function admin_video_usage(timestamptz) to frata_admin;
