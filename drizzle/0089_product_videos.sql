CREATE TABLE "product_videos" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"poster_ms" integer DEFAULT 1000 NOT NULL,
	"button" text DEFAULT 'model' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_videos_tenant_id_product_id_pk" PRIMARY KEY("tenant_id","product_id"),
	CONSTRAINT "product_videos_video" UNIQUE("tenant_id","video_id"),
	CONSTRAINT "product_videos_poster" CHECK ("product_videos"."poster_ms" between 0 and 60000),
	CONSTRAINT "product_videos_button" CHECK ("product_videos"."button" in ('model', 'wear', 'none'))
);
--> statement-breakpoint
ALTER TABLE "module_pauses" DROP CONSTRAINT "module_pauses_module";--> statement-breakpoint
ALTER TABLE "tenant_modules" DROP CONSTRAINT "tenant_modules_module";--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "use" text DEFAULT 'loop' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_video_fk" FOREIGN KEY ("tenant_id","video_id") REFERENCES "public"."videos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_pauses" ADD CONSTRAINT "module_pauses_module" CHECK ("module_pauses"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode','product_video'));--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_module" CHECK ("tenant_modules"."module" in ('communication','rto_shield','ship','true_profit','reviews','marketplace_export','size_fit','cart_flows','gst','ekcode','product_video'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_use" CHECK ("videos"."use" in ('loop', 'product'));