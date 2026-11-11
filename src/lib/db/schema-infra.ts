// =============================================================================
// FILE: src/lib/db/schema-infra.ts — Admin › Infrastructure's platform tables (plan
// docs/plans/2026-11-11-guardrails-infra-a2.md I·0; access drizzle/0093). No tenant: what vendors billed Frrata, per day,
// and each pull's outcome. Only frata_admin reads and writes them (the hourly cron through src/lib/admin/infra.ts);
// frata_app and the API roles hold nothing.
// =============================================================================

import { sql } from 'drizzle-orm'
import { bigint, boolean, check, date, index, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { at, id } from './schema'

export const INFRA_SOURCES = ['vercel', 'mux'] as const

/** One vendor's usage on one day, per project and service (and subject: a video, for Mux). Cost in integer micro-dollars. */
export const infraUsageDaily = pgTable('infra_usage_daily', {
  source: text('source').notNull(),
  day: date('day').notNull(),
  project: text('project').notNull().default(''),
  service: text('service').notNull(),
  subject: text('subject').notNull().default(''),
  quantity: numeric('quantity', { precision: 24, scale: 6, mode: 'number' }).notNull(),
  unit: text('unit').notNull().default(''),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
  fetchedAt: at('fetched_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.source, t.day, t.project, t.service, t.subject] }),
  check('infra_usage_source', sql`${t.source} in ('vercel', 'mux')`),
])

/** Each pull: when, whether it worked, and why not (a short code, never a vendor's text). */
export const infraPulls = pgTable('infra_pulls', {
  id: id(),
  source: text('source').notNull(),
  at: at('at').notNull().defaultNow(),
  ok: boolean('ok').notNull(),
  why: text('why'),
}, (t) => [
  index('infra_pulls_recent').on(t.source, t.at),
  check('infra_pulls_source', sql`${t.source} in ('vercel', 'mux')`),
  check('infra_pulls_why', sql`${t.why} is null or length(${t.why}) <= 40`),
])
