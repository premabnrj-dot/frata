CREATE TABLE "infra_pulls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"why" text,
	CONSTRAINT "infra_pulls_source" CHECK ("infra_pulls"."source" in ('vercel', 'mux')),
	CONSTRAINT "infra_pulls_why" CHECK ("infra_pulls"."why" is null or length("infra_pulls"."why") <= 40)
);
--> statement-breakpoint
CREATE TABLE "infra_usage_daily" (
	"source" text NOT NULL,
	"day" date NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"service" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"quantity" numeric(24, 6) NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"cost_micros" bigint NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infra_usage_daily_source_day_project_service_subject_pk" PRIMARY KEY("source","day","project","service","subject"),
	CONSTRAINT "infra_usage_source" CHECK ("infra_usage_daily"."source" in ('vercel', 'mux'))
);
--> statement-breakpoint
CREATE INDEX "infra_pulls_recent" ON "infra_pulls" USING btree ("source","at");