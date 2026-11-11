DROP INDEX "browser_daily_day";--> statement-breakpoint
DROP INDEX "city_daily_day";--> statement-breakpoint
DROP INDEX "product_daily_day";--> statement-breakpoint
DROP INDEX "source_daily_day";--> statement-breakpoint
DROP INDEX "traffic_daily_day";--> statement-breakpoint
DROP INDEX "vitals_daily_day";--> statement-breakpoint
CREATE INDEX "browser_daily_day" ON "browser_daily" USING brin ("day");--> statement-breakpoint
CREATE INDEX "city_daily_day" ON "city_daily" USING brin ("day");--> statement-breakpoint
CREATE INDEX "product_daily_day" ON "product_daily" USING brin ("day");--> statement-breakpoint
CREATE INDEX "source_daily_day" ON "source_daily" USING brin ("day");--> statement-breakpoint
CREATE INDEX "traffic_daily_day" ON "traffic_daily" USING brin ("day");--> statement-breakpoint
CREATE INDEX "vitals_daily_day" ON "vitals_daily" USING brin ("day");