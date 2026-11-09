CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mux_env" text NOT NULL,
	"upload_id" text,
	"asset_id" text,
	"playback_id" text,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"ready_at" timestamp with time zone,
	"mp4_ready_at" timestamp with time zone,
	"errored_at" timestamp with time zone,
	"error" text,
	"removed_at" timestamp with time zone,
	CONSTRAINT "videos_upload_id_unique" UNIQUE("upload_id"),
	CONSTRAINT "videos_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "videos_env" CHECK ("videos"."mux_env" ~ '^[A-Za-z0-9_-]{1,40}$'),
	CONSTRAINT "videos_ids" CHECK (("videos"."upload_id" is null or "videos"."upload_id" ~ '^[A-Za-z0-9]{1,128}$') and ("videos"."asset_id" is null or "videos"."asset_id" ~ '^[A-Za-z0-9]{1,128}$') and ("videos"."playback_id" is null or "videos"."playback_id" ~ '^[A-Za-z0-9]{1,64}$')),
	CONSTRAINT "videos_error" CHECK (("videos"."errored_at" is null) = ("videos"."error" is null) and ("videos"."error" is null or length("videos"."error") <= 40)),
	CONSTRAINT "videos_size" CHECK (("videos"."width" is null or "videos"."width" between 1 and 8192) and ("videos"."height" is null or "videos"."height" between 1 and 8192) and ("videos"."duration_ms" is null or "videos"."duration_ms" between 0 and 43200000)),
	CONSTRAINT "videos_playable" CHECK ("videos"."mp4_ready_at" is null or ("videos"."ready_at" is not null and "videos"."playback_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_shop" ON "videos" USING btree ("tenant_id","created_at");--> statement-breakpoint
-- V1 video (docs/plans/2026-11-09-video-v1.md): the shop's own rows (ADR-0002). The app inserts and updates named
-- columns only, never deletes (the upload caps count every row); ids, once set, never change (trigger).
revoke all on videos from anon, authenticated, service_role;
--> statement-breakpoint
alter table videos enable row level security;
--> statement-breakpoint
grant select, insert on videos to frata_app;
--> statement-breakpoint
grant update (upload_id, asset_id, playback_id, duration_ms, width, height, ready_at, mp4_ready_at, errored_at, error, removed_at) on videos to frata_app;
--> statement-breakpoint
create policy tenant_rows on videos for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
--> statement-breakpoint
create or replace function video_ids_once() returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.upload_id is not null and new.upload_id is distinct from old.upload_id)
     or (old.asset_id is not null and new.asset_id is distinct from old.asset_id)
     or (old.playback_id is not null and new.playback_id is distinct from old.playback_id)
     or (old.removed_at is not null and new.removed_at is distinct from old.removed_at)
  then raise exception 'video_ids_once' using errcode = 'check_violation'; end if;
  return new;
end $$;
--> statement-breakpoint
create trigger videos_ids_once before update on videos for each row execute function video_ids_once();
--> statement-breakpoint
-- Mux's webhook is routed by the definer, never by a tenant the caller names (security review 2026-11-09, finding 3):
-- the event must carry OUR row id (passthrough) AND the row's upload id, from the same Mux environment; a pending row
-- whose upload id is still unknown (a crash after Mux answered) takes it from the event once; a rendition event, which
-- names only its asset, reaches a row whose asset id is already set. Only known event types;
-- the payload stored is the five fields the processor needs, never the upload URL. Returns the shop, or null.
create or replace function app_store_mux_event(p_env text, p_event_id text, p_type text, p_video uuid, p_upload_id text, p_asset_id text, p_status text) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare t uuid; known text; inserted uuid;
begin
  if p_env !~ '^[A-Za-z0-9_-]{1,40}$' or p_event_id !~ '^[A-Za-z0-9-]{1,64}$'
     or (p_upload_id is not null and p_upload_id !~ '^[A-Za-z0-9]{1,128}$')
     or (p_asset_id is not null and p_asset_id !~ '^[A-Za-z0-9]{1,128}$')
     or (p_status is not null and p_status !~ '^[a-z_]{1,30}$')
     or p_type not in ('video.upload.asset_created', 'video.upload.cancelled', 'video.upload.errored',
                       'video.asset.created', 'video.asset.ready', 'video.asset.errored', 'video.asset.deleted',
                       'video.asset.static_rendition.ready', 'video.asset.static_rendition.errored', 'video.asset.static_rendition.skipped')
  then return null; end if;
  if p_video is not null and p_upload_id is not null then
    -- Upload and asset events: our row id and the row's upload id, both.
    select v.tenant_id, v.upload_id into t, known from public.videos v where v.id = p_video and v.mux_env = p_env;
    if t is null or (known is not null and known <> p_upload_id) then return null; end if;
    if known is null then update public.videos set upload_id = p_upload_id where id = p_video and upload_id is null; end if;
  elsif p_type like 'video.asset.static_rendition.%' and p_asset_id is not null then
    -- A rendition names only its asset: routed only to a row whose asset id our processor already set from Mux.
    select v.tenant_id, v.id into t, p_video from public.videos v where v.asset_id = p_asset_id and v.mux_env = p_env;
    if t is null then return null; end if;
  else
    return null;
  end if;
  insert into public.webhook_events (provider, event_key, tenant_id, payload)
    values ('mux', 'mux:' || p_env || ':' || p_event_id, t,
            jsonb_build_object('type', p_type, 'video', p_video, 'upload_id', p_upload_id, 'asset_id', p_asset_id, 'status', p_status))
    on conflict (event_key) do nothing returning tenant_id into inserted;
  return inserted;
end $$;
--> statement-breakpoint
revoke all on function video_ids_once(), app_store_mux_event(text, text, text, uuid, text, text, text) from public, anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function app_store_mux_event(text, text, text, uuid, text, text, text) to frata_app;
