CREATE TABLE "browser_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"browser" text DEFAULT '' NOT NULL,
	"in_app" text DEFAULT '' NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"ordered_visitors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "browser_daily_tenant_id_day_device_browser_in_app_pk" PRIMARY KEY("tenant_id","day","device","browser","in_app")
);
--> statement-breakpoint
CREATE TABLE "city_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"ordered_visitors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "city_daily_tenant_id_day_city_pk" PRIMARY KEY("tenant_id","day","city")
);
--> statement-breakpoint
CREATE TABLE "product_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"product_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"adds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_daily_tenant_id_day_product_id_pk" PRIMARY KEY("tenant_id","day","product_id")
);
--> statement-breakpoint
CREATE TABLE "source_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"us" text DEFAULT '' NOT NULL,
	"um" text DEFAULT '' NOT NULL,
	"uc" text DEFAULT '' NOT NULL,
	"rh" text DEFAULT '' NOT NULL,
	"cc" text DEFAULT '' NOT NULL,
	"gads" boolean DEFAULT false NOT NULL,
	"srs" boolean DEFAULT false NOT NULL,
	"fb" boolean DEFAULT false NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"ordered_visitors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "source_daily_tenant_id_day_us_um_uc_rh_cc_gads_srs_fb_pk" PRIMARY KEY("tenant_id","day","us","um","uc","rh","cc","gads","srs","fb")
);
--> statement-breakpoint
CREATE TABLE "traffic_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"product_visitors" integer DEFAULT 0 NOT NULL,
	"bag_visitors" integer DEFAULT 0 NOT NULL,
	"checkout_visitors" integer DEFAULT 0 NOT NULL,
	"ordered_visitors" integer DEFAULT 0 NOT NULL,
	"phone" integer DEFAULT 0 NOT NULL,
	"computer" integer DEFAULT 0 NOT NULL,
	"tablet" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "traffic_daily_tenant_id_day_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
CREATE TABLE "vitals_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"product_id" uuid NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"buckets" integer[] NOT NULL,
	CONSTRAINT "vitals_daily_tenant_id_day_metric_product_id_pk" PRIMARY KEY("tenant_id","day","metric","product_id")
);
--> statement-breakpoint
CREATE INDEX "browser_daily_day" ON "browser_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "city_daily_day" ON "city_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "product_daily_day" ON "product_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "source_daily_day" ON "source_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "traffic_daily_day" ON "traffic_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "vitals_daily_day" ON "vitals_daily" USING btree ("day");