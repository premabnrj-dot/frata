CREATE TABLE "review_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"base" text NOT NULL,
	"widths" integer[] NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_photos_base" CHECK ("review_photos"."base" like ('https://%/tenants/' || "review_photos"."tenant_id"::text || '/reviews/%'))
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reports_reason" CHECK ("review_reports"."reason" in ('abuse','not_about_product','personal_data','spam','unlawful','fake'))
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"token_nonce" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"fail_code" text,
	CONSTRAINT "review_requests_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "review_requests_nonce" CHECK ("review_requests"."token_nonce" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "review_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"ask_after_days" smallint DEFAULT 5 NOT NULL,
	"remind_after_days" smallint DEFAULT 3 NOT NULL,
	"review_type" text DEFAULT 'both' NOT NULL,
	"max_photos" smallint DEFAULT 5 NOT NULL,
	"fit_question" boolean DEFAULT true NOT NULL,
	"approve_each" boolean DEFAULT false NOT NULL,
	"widget_on" boolean DEFAULT true NOT NULL,
	"card_stars" boolean DEFAULT true NOT NULL,
	"name_default" text DEFAULT 'initial' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_settings_ask" CHECK ("review_settings"."ask_after_days" in (1,3,5,7,10,14)),
	CONSTRAINT "review_settings_remind" CHECK ("review_settings"."remind_after_days" in (0,3,5)),
	CONSTRAINT "review_settings_type" CHECK ("review_settings"."review_type" in ('both','text','photo')),
	CONSTRAINT "review_settings_photos" CHECK ("review_settings"."max_photos" between 1 and 5),
	CONSTRAINT "review_settings_name" CHECK ("review_settings"."name_default" in ('initial','first','anon'))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid,
	"order_line_id" uuid,
	"product_id" uuid NOT NULL,
	"source" text DEFAULT 'request' NOT NULL,
	"rating" smallint NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"fit" text,
	"size" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"held_at" timestamp with time zone,
	"held_reason" text,
	"approved_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"edited_at" timestamp with time zone,
	"author_deleted_at" timestamp with time zone,
	"reply" text DEFAULT '' NOT NULL,
	"replied_at" timestamp with time zone,
	CONSTRAINT "reviews_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "reviews_rating" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_source" CHECK ("reviews"."source" in ('request','import')),
	CONSTRAINT "reviews_request_source" CHECK (("reviews"."source" = 'request') = ("reviews"."request_id" is not null)),
	CONSTRAINT "reviews_fit" CHECK ("reviews"."fit" is null or "reviews"."fit" in ('small','true','large')),
	CONSTRAINT "reviews_text" CHECK (length("reviews"."title") <= 100 and length("reviews"."body") <= 2000 and length("reviews"."reply") <= 1000 and length("reviews"."display_name") between 1 and 60),
	CONSTRAINT "reviews_held_reason" CHECK (("reviews"."held_at" is null) = ("reviews"."held_reason" is null)),
	CONSTRAINT "reviews_hidden_reason" CHECK (("reviews"."hidden_at" is null) = ("reviews"."hidden_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "wa_opt_outs" (
	"tenant_id" uuid NOT NULL,
	"phone_hmac" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_opt_outs_tenant_id_phone_hmac_pk" PRIMARY KEY("tenant_id","phone_hmac")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wa_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wa_opt_in_notice" text;--> statement-breakpoint
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."reviews"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."reviews"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_settings" ADD CONSTRAINT "review_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_request_fk" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."review_requests"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_opt_outs" ADD CONSTRAINT "wa_opt_outs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_photos_tenant_base" ON "review_photos" USING btree ("tenant_id","base");--> statement-breakpoint
CREATE INDEX "review_photos_review" ON "review_photos" USING btree ("tenant_id","review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_reports_once" ON "review_reports" USING btree ("tenant_id","review_id","ip_hash");--> statement-breakpoint
CREATE INDEX "review_reports_review" ON "review_reports" USING btree ("tenant_id","review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_tenant_order" ON "review_requests" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_tenant_token" ON "review_requests" USING btree ("tenant_id","token_hash");--> statement-breakpoint
CREATE INDEX "review_requests_remind" ON "review_requests" USING btree ("tenant_id","sent_at") WHERE "review_requests"."reminded_at" is null and "review_requests"."sent_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_tenant_line" ON "reviews" USING btree ("tenant_id","order_line_id");--> statement-breakpoint
CREATE INDEX "reviews_product_list" ON "reviews" USING btree ("tenant_id","product_id","created_at" DESC NULLS LAST) WHERE "reviews"."hidden_at" is null and "reviews"."author_deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_held" ON "reviews" USING btree ("tenant_id","created_at") WHERE "reviews"."held_at" is not null and "reviews"."approved_at" is null and "reviews"."hidden_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_hidden" ON "reviews" USING btree ("tenant_id","hidden_at") WHERE "reviews"."hidden_at" is not null;--> statement-breakpoint
-- A review outlives its order's erasure, unlinked: set null on order_line_id only (a plain set null would null
-- tenant_id). PG 15+ column list. Composite, so a review can never point at another shop's line (tenancy audit R1).
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE SET NULL ("order_line_id");--> statement-breakpoint
-- Access (ADR-0002). Every table: tenant rows only, for frata_app; nothing for anon, authenticated or frata_admin.
revoke all on review_requests, reviews, review_photos, review_reports, review_settings, wa_opt_outs from anon, authenticated;--> statement-breakpoint
alter table review_requests enable row level security;--> statement-breakpoint
alter table reviews enable row level security;--> statement-breakpoint
alter table review_photos enable row level security;--> statement-breakpoint
alter table review_reports enable row level security;--> statement-breakpoint
alter table review_settings enable row level security;--> statement-breakpoint
alter table wa_opt_outs enable row level security;--> statement-breakpoint
-- Requests are never deleted by the app (they go with their order); reviews, photos and reports are, by the 180-day purge.
grant select, insert, update on review_requests to frata_app;--> statement-breakpoint
grant select, insert, update, delete on reviews, review_photos, review_reports to frata_app;--> statement-breakpoint
grant select, insert, update on review_settings to frata_app;--> statement-breakpoint
-- A Stop is never undone by the app: select and insert only.
grant select, insert on wa_opt_outs to frata_app;--> statement-breakpoint
create policy tenant_rows on review_requests for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on reviews for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on review_photos for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on review_reports for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on review_settings for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());--> statement-breakpoint
create policy tenant_rows on wa_opt_outs for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
