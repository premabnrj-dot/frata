// =============================================================================
// FILE: src/lib/db/schema-costs.ts — Admin › Costs' platform tables (spec docs/specs/2026-11-23-admin-costs.md § The data;
// plan docs/plans/2026-11-23-admin-costs.md tasks 2–3; access in the same migration, drizzle/0172). No tenant: what Frrata
// pays. Only frata_admin reads and writes them (src/lib/admin/costs.ts, fenced by check:tenant § 10); frata_app, the API
// roles and frata_builder hold nothing. Amounts are paise (INR) or micro-dollars (USD); due dates, next due, overdue and
// burn are derived (src/domains/admin/costs.ts), never stored. A one-time cost has its anchor on the paid date and its one
// payment settles that date (the writer keeps it to one: markPaid refuses non-repeating costs). Undoing that payment ends the
// cost on its paid date, so the entry is kept as removed, never an orphan.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { AMOUNT_MAX, COST_CADENCES, COST_CATEGORIES, COST_CURRENCIES, COST_KINDS, COST_SOURCES } from '@/domains/admin/costs'
import { sqlList } from '@/domains/tenancy/roles'
import { at, id, money } from './schema'

const list = (xs: readonly string[]) => sql.raw(sqlList(xs))
const DAY_MIN = sql.raw(`'2020-01-01'`)
const DAY_MAX = sql.raw(`'2100-12-31'`)
/** The spec's ceilings: ₹1 crore in paise, $50,000 in micro-dollars (src/domains/admin/costs.ts AMOUNT_MAX). */
const INR_MAX = AMOUNT_MAX.INR, USD_MAX = AMOUNT_MAX.USD

/** What Frrata pays for: a repeating cost (with its cadence and next due anchor) or a one-time one. */
export const costItems = pgTable('cost_items', {
  id: id(),
  name: text('name').notNull(),
  vendor: text('vendor'),
  category: text('category').notNull(),
  kind: text('kind').notNull(),
  cadence: text('cadence'),
  amount: money('amount').notNull(),
  currency: text('currency').notNull(),
  varies: boolean('varies').notNull().default(false),
  anchorOn: date('anchor_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }),
  note: text('note'),
  /** Where a repeating dollar cost takes its figure from (COST_SOURCES); null is typed by hand. */
  source: text('source'),
  createdAt: at('created_at').notNull().defaultNow(),
}, (t) => [
  index('cost_items_live').on(t.kind, t.endsOn),
  check('cost_items_kind', sql`${t.kind} in (${list(COST_KINDS)})`),
  check('cost_items_cadence', sql`${t.cadence} is null or ${t.cadence} in (${list(COST_CADENCES)})`),
  check('cost_items_kind_cadence', sql`(${t.kind} = 'recurring') = (${t.cadence} is not null)`),
  check('cost_items_currency', sql`${t.currency} in (${list(COST_CURRENCIES)})`),
  check('cost_items_category', sql`${t.category} in (${list(COST_CATEGORIES)})`),
  check('cost_items_amount', sql`(${t.currency} = 'INR' and ${t.amount} between 1 and ${sql.raw(String(INR_MAX))}) or (${t.currency} = 'USD' and ${t.amount} between 1 and ${sql.raw(String(USD_MAX))})`),
  check('cost_items_name', sql`length(btrim(${t.name})) between 1 and 80`),
  check('cost_items_vendor', sql`${t.vendor} is null or length(${t.vendor}) <= 80`),
  check('cost_items_note', sql`${t.note} is null or length(${t.note}) <= 300`),
  check('cost_items_days', sql`${t.anchorOn} between ${DAY_MIN} and ${DAY_MAX} and (${t.endsOn} is null or ${t.endsOn} between ${DAY_MIN} and ${DAY_MAX})`),
  check('cost_items_source', sql`${t.source} is null or (${t.source} in (${list(COST_SOURCES)}) and ${t.kind} = 'recurring' and ${t.currency} = 'USD')`),
  check('cost_items_once', sql`${t.kind} <> 'one_time' or not ${t.varies}`),
])

/** Each time a cost was paid. `period_for` is the due date it settles; unique per item, so paying twice is one row. */
export const costPayments = pgTable('cost_payments', {
  id: id(),
  itemId: uuid('item_id').notNull(),
  periodFor: date('period_for', { mode: 'string' }).notNull(),
  paidOn: date('paid_on', { mode: 'string' }).notNull(),
  amount: money('amount').notNull(),
  currency: text('currency').notNull(),
  /** What left the account, in paise: the card statement's figure for a dollar bill. */
  inrPaise: money('inr_paise').notNull(),
  gstPaise: money('gst_paise'),
  note: text('note'),
  createdAt: at('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.itemId], foreignColumns: [costItems.id], name: 'cost_payments_item_fk' }).onDelete('restrict'),
  uniqueIndex('cost_payments_period').on(t.itemId, t.periodFor),
  index('cost_payments_paid').on(t.paidOn, t.id),
  check('cost_payments_currency', sql`${t.currency} in (${list(COST_CURRENCIES)})`),
  check('cost_payments_amount', sql`((${t.currency} = 'INR' and ${t.amount} between 1 and ${sql.raw(String(INR_MAX))}) or (${t.currency} = 'USD' and ${t.amount} between 1 and ${sql.raw(String(USD_MAX))})) and ${t.inrPaise} between 1 and ${sql.raw(String(INR_MAX))}`),
  check('cost_payments_inr', sql`${t.currency} <> 'INR' or ${t.inrPaise} = ${t.amount}`),
  check('cost_payments_gst', sql`${t.gstPaise} is null or ${t.gstPaise} between 0 and ${t.inrPaise}`),
  check('cost_payments_days', sql`${t.paidOn} between ${DAY_MIN} and ${DAY_MAX} and ${t.periodFor} between ${DAY_MIN} and ${DAY_MAX}`),
  check('cost_payments_note', sql`${t.note} is null or length(${t.note}) <= 300`),
])
