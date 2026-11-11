-- Theme Studio TS1b (owner 2026-11-11: loops play 720p). The app records which MP4 it asked Mux for (videos.mp4, 0101),
-- in the same transaction as the outbox row that asks (ADR-0006); set once, like the ids Mux hands back.
grant update (mp4) on videos to frata_app;
--> statement-breakpoint
create or replace function video_ids_once() returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.upload_id is not null and new.upload_id is distinct from old.upload_id)
     or (old.asset_id is not null and new.asset_id is distinct from old.asset_id)
     or (old.playback_id is not null and new.playback_id is distinct from old.playback_id)
     or (old.removed_at is not null and new.removed_at is distinct from old.removed_at)
     or (old.mp4 is not null and new.mp4 is distinct from old.mp4)
  then raise exception 'video_ids_once' using errcode = 'check_violation'; end if;
  return new;
end $$;
