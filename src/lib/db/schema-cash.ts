// =============================================================================
// FILE: src/lib/db/schema-cash.ts — Admin › Cashflow's platform tables (spec docs/specs/2026-11-23-admin-cashflow.md § The data; plan
// docs/plans/2026-11-23-admin-cashflow.md task 3; access in the same migration). No tenant: what Frrata holds and moves. Only frata_admin
// reads and writes them (src/lib/admin/cash.ts, fenced by check:tenant § 10 as the "Cash" family); no other role holds anything. Money is
// integer paise. Whether an entry is planned, and its direction, are derived (a null `happened_on`; the kind's direction in the engine),
// never stored. This file is never re-exported from schema.ts.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, date, foreignKey, index, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core'
import { CASH_KINDS, CASH_MAX } from '@/domains/admin/cash'
import { sqlList } from '@/domains/tenancy/roles'
import { at, id, money } from './schema'

const DAY_MIN = sql.raw(`'2020-01-01'`)
const DAY_MAX = sql.raw(`'2100-12-31'`)
const MAX = sql.raw(String(CASH_MAX))

/** Each place cash sits. */
export const cashAccounts = pgTable('cash_accounts', {
  id: id(),
  name: text('name').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
}, (t) => [
  check('cash_accounts_name', sql`length(btrim(${t.name})) between 1 and 60`),
])

/** What the bank said, with its day. Append-only; the latest by (as_of, created_at, id) is the account's balance. */
export const cashBalances = pgTable('cash_balances', {
  id: id(),
  accountId: uuid('account_id').notNull(),
  asOf: date('as_of', { mode: 'string' }).notNull(),
  /** Signed: an overdraft is real. */
  balancePaise: money('balance_paise').notNull(),
  note: text('note'),
  createdAt: at('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.accountId], foreignColumns: [cashAccounts.id], name: 'cash_balances_account_fk' }).onDelete('restrict'),
  index('cash_balances_latest').on(t.accountId, t.asOf, t.createdAt, t.id),
  check('cash_balances_amount', sql`${t.balancePaise} between -${MAX} and ${MAX}`),
  check('cash_balances_day', sql`${t.asOf} between ${DAY_MIN} and ${DAY_MAX}`),
  check('cash_balances_note', sql`${t.note} is null or length(${t.note}) <= 300`),
])

/** What Billing and Costs do not hold: funding, a grant, a loan, GST paid. Planned = no `happened_on` (and an `expected_on`). */
export const cashEntries = pgTable('cash_entries', {
  id: id(),
  kind: text('kind').notNull(),
  amountPaise: money('amount_paise').notNull(),
  happenedOn: date('happened_on', { mode: 'string' }),
  expectedOn: date('expected_on', { mode: 'string' }),
  accountId: uuid('account_id'),
  note: text('note'),
  createdAt: at('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.accountId], foreignColumns: [cashAccounts.id], name: 'cash_entries_account_fk' }).onDelete('restrict'),
  index('cash_entries_happened').on(t.happenedOn),
  index('cash_entries_planned').on(t.expectedOn).where(sql`${t.happenedOn} is null`),
  check('cash_entries_kind', sql`${t.kind} in (${sql.raw(sqlList(CASH_KINDS))})`),
  check('cash_entries_amount', sql`${t.amountPaise} between 1 and ${MAX}`),
  check('cash_entries_when', sql`(${t.happenedOn} is not null and ${t.expectedOn} is null) or (${t.happenedOn} is null and ${t.expectedOn} is not null)`),
  check('cash_entries_days', sql`(${t.happenedOn} is null or ${t.happenedOn} between ${DAY_MIN} and ${DAY_MAX}) and (${t.expectedOn} is null or ${t.expectedOn} between ${DAY_MIN} and ${DAY_MAX})`),
  check('cash_entries_note', sql`${t.note} is null or length(${t.note}) <= 300`),
])

/** One row, seeded by the migration: the floor to stay above, and the account where Billing and Costs land (the books' figure is its). */
export const cashSettings = pgTable('cash_settings', {
  id: smallint('id').primaryKey().default(1),
  floorPaise: money('floor_paise'),
  mainAccountId: uuid('main_account_id'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.mainAccountId], foreignColumns: [cashAccounts.id], name: 'cash_settings_main_fk' }).onDelete('restrict'),
  check('cash_settings_one', sql`${t.id} = 1`),
  check('cash_settings_floor', sql`${t.floorPaise} is null or ${t.floorPaise} between 0 and ${MAX}`),
])
