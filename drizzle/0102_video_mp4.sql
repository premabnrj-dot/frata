ALTER TABLE "videos" ADD COLUMN "mp4" text;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_mp4" CHECK ("videos"."mp4" is null or "videos"."mp4" ~ '^(720|540|480|360|270)p$');