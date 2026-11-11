import { boolean, date, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'

// =============================================================================
// FILE: src/lib/db/analytics-schema.ts — the ANALYTICS database's rollups (A·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md
// A2·1). A separate Postgres (its own Supabase project), migrated from drizzle-analytics/ by drizzle.analytics.config.ts.
// Not named schema*.ts on purpose: the main database's config and gates read those.
//
// What lives there, and who may touch it (drizzle-analytics/0002):
//   events (partitioned by IST day, partitions in the ungranted schema `ev`) — frata_app may INSERT, through
//     ingest_events(); nobody reads it but the fold;
//   visitor_days, visitor_salts, fold_state — definers only;
//   the rollups below — frata_app may SELECT its own shop's rows (RLS, tenant first in every key).
// Each rollup keeps the RAW source inputs (utm, referrer host, click-id flags, creator code), classified on read by
// sourceOfInputs, never a stored channel (frata-architecture § Attribution). '' means absent: keys cannot be null.
// A "visit" is a visitor-day (the hash's salt changes every IST day, so visitor-days add across days).
// =============================================================================

const day = () => date('day', { mode: 'string' }).notNull()
const tenant = () => uuid('tenant_id').notNull()
const count = (name: string) => integer(name).notNull().default(0)
const key = (name: string) => text(name).notNull().default('')
// Every rollup is rebuilt a day at a time (analytics_rollup), so each has an index on day besides its tenant-first key.

/** One shop-day: visits and the funnel (each step counts visitors who reached it), and devices. */
export const trafficDaily = pgTable('traffic_daily', {
  tenantId: tenant(), day: day(),
  visitors: count('visitors'), views: count('views'),
  productVisitors: count('product_visitors'), bagVisitors: count('bag_visitors'),
  checkoutVisitors: count('checkout_visitors'), orderedVisitors: count('ordered_visitors'),
  phone: count('phone'), computer: count('computer'), tablet: count('tablet'),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day] }), index('traffic_daily_day').on(t.day)])

/** Visits by the landing's raw source inputs (top 200 a shop-day; the rest is one row with rh = '*'). */
export const sourceDaily = pgTable('source_daily', {
  tenantId: tenant(), day: day(),
  us: key('us'), um: key('um'), uc: key('uc'), rh: key('rh'), cc: key('cc'),
  gads: boolean('gads').notNull().default(false), srs: boolean('srs').notNull().default(false), fb: boolean('fb').notNull().default(false),
  visitors: count('visitors'), orderedVisitors: count('ordered_visitors'),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.us, t.um, t.uc, t.rh, t.cc, t.gads, t.srs, t.fb] }), index('source_daily_day').on(t.day)])

/** Visits by device, browser and in-app browser ('' when not in an app). */
export const browserDaily = pgTable('browser_daily', {
  tenantId: tenant(), day: day(),
  device: key('device'), browser: key('browser'), inApp: key('in_app'),
  visitors: count('visitors'), orderedVisitors: count('ordered_visitors'),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.device, t.browser, t.inApp] }), index('browser_daily_day').on(t.day)])

/** Visits by city from the network (top 50 a shop-day; the rest is city ''). */
export const cityDaily = pgTable('city_daily', {
  tenantId: tenant(), day: day(), city: key('city'),
  visitors: count('visitors'), orderedVisitors: count('ordered_visitors'),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.city] }), index('city_daily_day').on(t.day)])

/** Product page views and adds to bag (events, so they add across the day's slices). Ids are joined to the shop's own
 * products on read; an id it doesn't have is "other" (a beacon can be forged). */
export const productDaily = pgTable('product_daily', {
  tenantId: tenant(), day: day(), productId: uuid('product_id').notNull(),
  views: count('views'), adds: count('adds'),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.productId] }), index('product_daily_day').on(t.day)])

/** Phones' Web Vitals: a 64-bucket log histogram per metric (bucket i holds values v with floor(ln(v+1)/ln 1.2) = i;
 * ms for lcp and inp, cls × 1000), for all pages (product_id = the nil uuid) and per product page. */
export const vitalsDaily = pgTable('vitals_daily', {
  tenantId: tenant(), day: day(), metric: text('metric').notNull(), productId: uuid('product_id').notNull(),
  n: count('n'), buckets: integer('buckets').array().notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.metric, t.productId] }), index('vitals_daily_day').on(t.day)])
