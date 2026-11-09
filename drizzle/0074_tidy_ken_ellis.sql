CREATE TABLE "gst_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" text,
	"actor" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"ended_at" timestamp with time zone,
	CONSTRAINT "gst_attempts_kind" CHECK ("gst_attempts"."kind" in ('connect','verify','push','file')),
	CONSTRAINT "gst_attempts_outcome" CHECK ("gst_attempts"."outcome" in ('pending','ok','failed')),
	CONSTRAINT "gst_attempts_error" CHECK ("gst_attempts"."error" is null or length("gst_attempts"."error") <= 200)
);
--> statement-breakpoint
CREATE TABLE "gst_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gstin" text NOT NULL,
	"username" text NOT NULL,
	"token_enc" text,
	"expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_by" uuid NOT NULL,
	CONSTRAINT "gst_connections_gstin" CHECK ("gst_connections"."gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$'),
	CONSTRAINT "gst_connections_username" CHECK (length("gst_connections"."username") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "gst_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gstin" text NOT NULL,
	"period" text NOT NULL,
	"ours" jsonb NOT NULL,
	"portal" jsonb,
	"push_ref" text,
	"pushed_at" timestamp with time zone NOT NULL,
	"pushed_by" uuid NOT NULL,
	"filed_at" timestamp with time zone,
	"filed_by" uuid,
	"arn" text,
	CONSTRAINT "gst_filings_period_key" CHECK ("gst_filings"."period" ~ '^[0-9]{4}-([0-9]{2}|Q[1-4])$'),
	CONSTRAINT "gst_filings_filed" CHECK (("gst_filings"."filed_at" is null) = ("gst_filings"."arn" is null) and ("gst_filings"."filed_at" is null) = ("gst_filings"."filed_by" is null))
);
--> statement-breakpoint
ALTER TABLE "gst_attempts" ADD CONSTRAINT "gst_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_connections" ADD CONSTRAINT "gst_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_filings" ADD CONSTRAINT "gst_filings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gst_attempts_shop" ON "gst_attempts" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gst_connections_shop" ON "gst_connections" USING btree ("tenant_id","gstin");--> statement-breakpoint
CREATE UNIQUE INDEX "gst_filings_period" ON "gst_filings" USING btree ("tenant_id","gstin","period");--> statement-breakpoint
-- GST filing (GST app G2): each table the shop's own (ADR-0002); a filed period is final; an attempt changes only its outcome, once.
revoke all on gst_connections, gst_filings, gst_attempts from anon, authenticated, service_role;
alter table gst_connections enable row level security;
alter table gst_filings enable row level security;
alter table gst_attempts enable row level security;
grant select, insert, update, delete on gst_connections to frata_app;
grant select, insert, update on gst_filings to frata_app;
grant select, insert on gst_attempts to frata_app;
grant update (outcome, error, ended_at) on gst_attempts to frata_app;
create policy tenant_rows on gst_connections for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
create policy tenant_rows on gst_filings for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
create policy tenant_rows on gst_attempts for all to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
create or replace function gst_filing_final() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' or old.filed_at is not null then raise exception 'gst_filing_final' using errcode = 'check_violation'; end if;
  if new.tenant_id <> old.tenant_id or new.gstin <> old.gstin or new.period <> old.period then raise exception 'gst_filing_final' using errcode = 'check_violation'; end if;
  return new;
end $$;
create trigger gst_filings_final before update or delete on gst_filings for each row execute function gst_filing_final();
create or replace function gst_attempt_once() returns trigger language plpgsql as $$
begin
  if old.outcome <> 'pending' or new.outcome = 'pending' then raise exception 'gst_attempt_once' using errcode = 'check_violation'; end if;
  return new;
end $$;
create trigger gst_attempts_once before update on gst_attempts for each row execute function gst_attempt_once();
revoke all on function gst_filing_final(), gst_attempt_once() from public, anon, authenticated, service_role;
