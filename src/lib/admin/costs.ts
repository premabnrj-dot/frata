import 'server-only'
import { cache } from 'react'
import { and, asc, desc, eq, gte, or, sql } from 'drizzle-orm'
import {
  anchorMayMove, billMonthOf, daysBetween, dueState, fyRange, isDueDate, isLive, LOOKBACK_MONTHS, MAX_LIVE_COSTS, monthEnded, monthMicros, type Cadence, type CostCategory, type CostCurrency,
  type CostItem, type CostSource, type CostItemInput, type PaidInput, type PaymentRow, dueRows,
} from '@/domains/admin/costs'
import { dueCostsByMonth, unpaidCostsToMonthEnd } from '@/domains/admin/cash'
import { FX_RATE_BAND_E4 } from '@/domains/studio/credits'
import type { TodayItem } from '@/domains/admin/today'
import { addMonths, monthKey } from '@/domains/time/month'
import { dayMonthIN } from '@/lib/format-date'
import { formatInr, formatUsd } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { MicroUsd } from '@/domains/money/usd'
import { ADMIN_ONLY, confirmedRecently, type StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { costItems, costPayments } from '@/lib/db/schema-costs'
import { errName } from '@/lib/log'
import { auditStaff } from './audit'
import { usageRows } from './infra'

// =============================================================================
// FILE: src/lib/admin/costs.ts — ADMIN › COSTS' reads and writes (spec docs/specs/2026-11-23-admin-costs.md; plan
// docs/plans/2026-11-23-admin-costs.md task 4). frata_admin only, through adminDb(); these two tables are imported
// nowhere else (check:tenant § 10). Support staff share the frata_admin connection, so EVERY export here checks ADMIN_ONLY
// itself (as billing.ts does), whatever the page did.
// Reads are plain statements, never a transaction. A write is ONE transaction that calls only `tx.*` and `auditStaff(tx)`;
// the dollar rate is read before it opens. Each write's audit row names the item id, never a name or a note, and carries
// the names of changed fields (an Undo also keeps the figures it deleted).
// =============================================================================

const adminOnly = (staff: StaffOk) => { if (!(ADMIN_ONLY as readonly string[]).includes(staff.role)) throw new Error('costs is ADMIN_ONLY') }

export type CostError = 'not_found' | 'already_paid' | 'not_due' | 'locked' | 'confirm_first' | 'bad_input' | 'too_many' | 'unknown'
export type CostResult<T = object> = ({ ok: true } & T) | { ok: false; error: CostError }

/** A payment this old needs a fresh passkey check to undo (a mistake just made stays one tap). */
export const UNDO_FREE_MS = 10 * 60_000
const MAX_BACKDATE_DAYS = 45

const toItem = (r: typeof costItems.$inferSelect): CostItem => ({
  id: r.id, source: r.source as CostSource | null, name: r.name, vendor: r.vendor, kind: r.kind as CostItem['kind'], cadence: r.cadence as Cadence | null, amount: r.amount,
  currency: r.currency as CostCurrency, varies: r.varies, anchorOn: r.anchorOn, endsOn: r.endsOn, category: r.category, note: r.note,
})

/** A payment row with its currency as the closed type the CHECK guarantees. */
const toPay = <T extends { currency: string }>(r: T) => ({ ...r, currency: r.currency as CostCurrency })

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type CostsData = {
  items: CostItem[]
  payments: PaymentRow[]
  /** The latest typed USD/INR rate (rupees × 10,000) and the day it was set; null before the first. */
  rate: { day: string; rateE4: number } | null
}

/** The shared due set (cached per request by the day, so the layout's Today source and the page read it once): every item, the payments that matter (periods since the lookback for what is due, paid in this or last
 *  month for what was spent, and a one-time cost's own payment), and the rate. Three plain statements, in parallel. A dues
 *  walk starts at the item's anchor, never before, and Add refuses an anchor over 45 days back, so no created-at bound is needed. */
export async function costsData(staff: StaffOk, today: string): Promise<CostsData> {
  adminOnly(staff)
  return loadCosts(today)
}

const loadCosts = cache(async (today: string): Promise<CostsData> => {
  const db = adminDb()
  const back = addMonths(new Date(`${today}T00:00:00Z`), -LOOKBACK_MONTHS).toISOString().slice(0, 10)
  const monthsBack = `${monthKey(today, -1)}-01` // the 1st of last month
  const [items, pays, rate] = await Promise.all([
    db.select().from(costItems).orderBy(asc(costItems.name)),
    db.select({
      id: costPayments.id, itemId: costPayments.itemId, periodFor: costPayments.periodFor, paidOn: costPayments.paidOn, amount: costPayments.amount,
      currency: costPayments.currency, inrPaise: costPayments.inrPaise, gstPaise: costPayments.gstPaise, createdAt: costPayments.createdAt, category: costItems.category,
    }).from(costPayments).innerJoin(costItems, eq(costItems.id, costPayments.itemId))
      .where(or(gte(costPayments.periodFor, back), gte(costPayments.paidOn, monthsBack), eq(costItems.kind, 'one_time'))).orderBy(desc(costPayments.paidOn), desc(costPayments.id)),
    db.execute<{ day: string; rate_e4: number }>(sql`select day::text as day, rate_e4 from admin_fx_rate_latest()`),
  ])
  const r = rate[0]
  return { items: items.map(toItem), payments: pays.map(toPay), rate: r ? { day: r.day, rateE4: Number(r.rate_e4) } : null }
})

/** One cost and all its payments, for the side panel. */
export async function costPanel(staff: StaffOk, id: string): Promise<{ item: CostItem; payments: PaymentRow[] } | null> {
  adminOnly(staff)
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const db = adminDb()
  const [[item], pays] = await Promise.all([
    db.select().from(costItems).where(eq(costItems.id, id)),
    db.select({
      id: costPayments.id, itemId: costPayments.itemId, periodFor: costPayments.periodFor, paidOn: costPayments.paidOn, amount: costPayments.amount,
      currency: costPayments.currency, inrPaise: costPayments.inrPaise, gstPaise: costPayments.gstPaise, createdAt: costPayments.createdAt, category: costItems.category,
    }).from(costPayments).innerJoin(costItems, eq(costItems.id, costPayments.itemId)).where(eq(costPayments.itemId, id))
      .orderBy(desc(costPayments.paidOn), desc(costPayments.id)),
  ])
  return item ? { item: toItem(item), payments: pays.map(toPay) } : null
}

export type PaymentsPage = { rows: (PaymentRow & { name: string; vendor: string | null })[]; next: { paidOn: string; id: string } | null }

/** Payments newest first, 50 a page, by keyset on (paid_on, id); `from`/`to` are inclusive IST days (a month or a
 *  financial year). One row past the page says there is more. */
export async function paymentsPage(staff: StaffOk, q: { from: string; to: string; after?: { paidOn: string; id: string } | null }): Promise<PaymentsPage> {
  adminOnly(staff)
  const keyset = q.after ? sql`(${costPayments.paidOn}, ${costPayments.id}) < (${q.after.paidOn}::date, ${q.after.id}::uuid)` : undefined
  const rows = await adminDb().select({
    id: costPayments.id, itemId: costPayments.itemId, periodFor: costPayments.periodFor, paidOn: costPayments.paidOn, amount: costPayments.amount,
    currency: costPayments.currency, inrPaise: costPayments.inrPaise, gstPaise: costPayments.gstPaise, createdAt: costPayments.createdAt,
    category: costItems.category, name: costItems.name, vendor: costItems.vendor,
  }).from(costPayments).innerJoin(costItems, eq(costItems.id, costPayments.itemId))
    .where(and(gte(costPayments.paidOn, q.from), sql`${costPayments.paidOn} <= ${q.to}::date`, keyset))
    .orderBy(desc(costPayments.paidOn), desc(costPayments.id)).limit(51)
  const page = rows.slice(0, 50), more = rows[50]
  const last = page[page.length - 1]
  return { rows: page.map(toPay), next: more && last ? { paidOn: last.paidOn, id: last.id } : null }
}

export const EXPORT_ROW_CAP = 5_000

/** Every payment of one financial year, oldest first, for the CA's CSV (capped). */
export async function paymentsForYear(staff: StaffOk, startYear: number): Promise<PaymentsPage['rows']> {
  adminOnly(staff)
  const { from, to } = fyRange(startYear)
  const rows = await adminDb().select({
    id: costPayments.id, itemId: costPayments.itemId, periodFor: costPayments.periodFor, paidOn: costPayments.paidOn, amount: costPayments.amount,
    currency: costPayments.currency, inrPaise: costPayments.inrPaise, gstPaise: costPayments.gstPaise, createdAt: costPayments.createdAt,
    category: costItems.category, name: costItems.name, vendor: costItems.vendor,
  }).from(costPayments).innerJoin(costItems, eq(costItems.id, costPayments.itemId))
    .where(and(gte(costPayments.paidOn, from), sql`${costPayments.paidOn} <= ${to}::date`))
    .orderBy(asc(costPayments.paidOn), asc(costPayments.id)).limit(EXPORT_ROW_CAP)
  return rows.map(toPay)
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The rupees typed for a dollar bill must sit in the rate band: a slip of a decimal point never gets in. */
const rateOk = (amount: number, inrPaise: number) => {
  const e4 = (inrPaise * 1e8) / amount
  return e4 >= FX_RATE_BAND_E4[0] && e4 <= FX_RATE_BAND_E4[1]
}

const failed = (e: unknown): { ok: false; error: CostError } => {
  console.error('[costs]', errName(e))
  const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code
  return { ok: false, error: code === '23514' || code === '22007' || code === '22008' || code === '23502' ? 'bad_input' : 'unknown' }
}

const refuse = (error: CostError): { ok: false; error: CostError } => ({ ok: false, error })

/** Adds a cost. A one-time cost is saved with its payment in the same transaction (its anchor is the paid day). */
export async function addCost(staff: StaffOk, input: CostItemInput, today: string): Promise<CostResult<{ id: string }>> {
  adminOnly(staff)
  if (input.kind === 'recurring' && daysBetween(input.anchorOn, today) > MAX_BACKDATE_DAYS) return refuse('bad_input')
  if (input.kind === 'one_time' && input.paidOn > today) return refuse('bad_input')
  if (input.kind === 'one_time' && !payOk(input.currency, input.amount, input.inrPaise)) return refuse('bad_input')
  try {
    return await adminDb().transaction(async (tx): Promise<CostResult<{ id: string }>> => {
      // The cap is counted without a lock: two adds at the same instant could both pass. At a handful of staff, accepted.
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(costItems).where(sql`${costItems.kind} = 'recurring' and (${costItems.endsOn} is null or ${costItems.endsOn} >= ${today}::date)`)
      if (input.kind === 'recurring' && n >= MAX_LIVE_COSTS) return refuse('too_many')
      const once = input.kind === 'one_time'
      const [row] = await tx.insert(costItems).values({
        name: input.name, vendor: input.vendor ?? null, category: input.category, kind: input.kind, cadence: once ? null : input.cadence,
        amount: input.amount, currency: input.currency, varies: once ? false : input.varies, anchorOn: once ? input.paidOn : input.anchorOn, note: input.note ?? null,
      }).returning({ id: costItems.id })
      if (!row) return refuse('unknown')
      if (once) {
        await tx.insert(costPayments).values({
          itemId: row.id, periodFor: input.paidOn, paidOn: input.paidOn, amount: input.amount, currency: input.currency,
          inrPaise: input.currency === 'INR' ? input.amount : input.inrPaise!, gstPaise: input.gstPaise ?? null, note: null,
        })
      }
      await auditStaff(tx, staff, { action: 'costs.item.add', target: row.id, detail: { kind: input.kind, category: input.category, currency: input.currency } })
      return { ok: true, id: row.id }
    })
  } catch (e) { return failed(e) }
}

const payOk = (currency: CostCurrency, amount: number, inrPaise: number | undefined) =>
  currency === 'INR' ? true : typeof inrPaise === 'number' && inrPaise > 0 && rateOk(amount, inrPaise)

/** Marks one due date of a repeating cost paid. `periodFor` must be a real, unpaid due date of the cost. */
export async function markPaid(staff: StaffOk, itemId: string, input: PaidInput, today: string): Promise<CostResult<{ paymentId: string }>> {
  adminOnly(staff)
  if (input.paidOn > today) return refuse('bad_input')
  try {
    return await adminDb().transaction(async (tx): Promise<CostResult<{ paymentId: string }>> => {
      const [row] = await tx.select().from(costItems).where(eq(costItems.id, itemId))
      if (!row) return refuse('not_found')
      const item = toItem(row)
      if (item.kind !== 'recurring') return refuse('not_due')
      if (!isDueDate(item, input.periodFor)) return refuse('not_due')
      if (!payOk(item.currency, input.amount, input.inrPaise)) return refuse('bad_input')
      const inr = item.currency === 'INR' ? input.amount : input.inrPaise!
      const [paid] = await tx.insert(costPayments).values({
        itemId, periodFor: input.periodFor, paidOn: input.paidOn, amount: input.amount, currency: item.currency, inrPaise: inr, gstPaise: input.gstPaise ?? null, note: input.note ?? null,
      }).onConflictDoNothing().returning({ id: costPayments.id })
      if (!paid) return refuse('already_paid')
      await auditStaff(tx, staff, { action: 'costs.pay', target: itemId, detail: { periodFor: input.periodFor } })
      return { ok: true, paymentId: paid.id }
    })
  } catch (e) { return failed(e) }
}

/** Undoes a payment. One older than ten minutes needs a fresh passkey check. The audit row keeps what was deleted. */
export async function undoPayment(staff: StaffOk, itemId: string, paymentId: string, now: Date): Promise<CostResult> {
  adminOnly(staff)
  try {
    return await adminDb().transaction(async (tx): Promise<CostResult> => {
      const [p] = await tx.select().from(costPayments).where(and(eq(costPayments.id, paymentId), eq(costPayments.itemId, itemId)))
      if (!p) return refuse('not_found')
      if (now.getTime() - p.createdAt.getTime() > UNDO_FREE_MS && !confirmedRecently(staff, now.getTime())) return refuse('confirm_first')
      const gone = await tx.delete(costPayments).where(and(eq(costPayments.id, paymentId), eq(costPayments.itemId, itemId))).returning({ id: costPayments.id })
      if (!gone.length) return refuse('not_found')
      // A one-time cost is its payment: with that gone the entry is kept as removed (ended on its paid day), never an orphan.
      await tx.update(costItems).set({ endsOn: sql`${costItems}.anchor_on` }).where(and(eq(costItems.id, itemId), eq(costItems.kind, 'one_time')))
      await auditStaff(tx, staff, { action: 'costs.unpay', target: itemId, detail: { itemId, periodFor: p.periodFor, inrPaise: p.inrPaise, gstPaise: p.gstPaise } })
      return { ok: true }
    })
  } catch (e) { return failed(e) }
}

/** Ends a repeating cost on a day: dues after it stop. Nothing is deleted. */
export async function endCost(staff: StaffOk, itemId: string, endsOn: string): Promise<CostResult> {
  adminOnly(staff)
  try {
    return await adminDb().transaction(async (tx): Promise<CostResult> => {
      const [row] = await tx.select().from(costItems).where(eq(costItems.id, itemId))
      if (!row) return refuse('not_found')
      if (row.kind !== 'recurring') return refuse('locked')
      if (endsOn < row.anchorOn) return refuse('bad_input')
      const [last] = await tx.select({ p: sql<string | null>`max(${costPayments.periodFor})::text` }).from(costPayments).where(eq(costPayments.itemId, itemId))
      if (last?.p && endsOn < last.p) return refuse('bad_input')
      await tx.update(costItems).set({ endsOn }).where(eq(costItems.id, itemId))
      await auditStaff(tx, staff, { action: 'costs.item.end', target: itemId, detail: { fields: ['endsOn'] } })
      return { ok: true }
    })
  } catch (e) { return failed(e) }
}

export type CostPatch = Partial<{
  name: string; vendor: string | null; category: CostCategory; note: string | null; varies: boolean; source: CostSource | null
  amount: number; currency: CostCurrency; cadence: Cadence; anchorOn: string
}>

/** Edits a cost. Amount, currency and anchor need a fresh passkey check; a cadence change is refused once there is a
 *  payment (End the cost and add a new one); the anchor moves only past the last paid period; a one-time cost keeps
 *  its figures (Undo its payment and add again). */
export async function editCost(staff: StaffOk, itemId: string, patch: CostPatch, now: Date): Promise<CostResult> {
  adminOnly(staff)
  const fields = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (!fields.length) return refuse('bad_input')
  // An amount and its currency change together: one without the other would read paise as micro-dollars.
  if ((patch.amount !== undefined) !== (patch.currency !== undefined)) return refuse('bad_input')
  // Money and schedule: the figures that reach the CA and the burn. Needs a passkey check in the last 5 minutes.
  const money = fields.some((f) => f === 'amount' || f === 'currency' || f === 'anchorOn' || f === 'cadence')
  if (money && !confirmedRecently(staff, now.getTime())) return refuse('confirm_first')
  try {
    return await adminDb().transaction(async (tx): Promise<CostResult> => {
      const [row] = await tx.select().from(costItems).where(eq(costItems.id, itemId))
      if (!row) return refuse('not_found')
      if (row.kind === 'one_time' && fields.some((f) => f === 'amount' || f === 'currency' || f === 'varies' || f === 'cadence' || f === 'anchorOn')) return refuse('locked')
      if (patch.cadence !== undefined || patch.anchorOn !== undefined) {
        const [last] = await tx.select({ p: sql<string | null>`max(${costPayments.periodFor})::text`, n: sql<number>`count(*)::int` }).from(costPayments).where(eq(costPayments.itemId, itemId))
        if (patch.cadence !== undefined && patch.cadence !== row.cadence && (last?.n ?? 0) > 0) return refuse('locked')
        if (patch.anchorOn !== undefined && !anchorMayMove(patch.anchorOn, last?.p ?? null)) return refuse('locked')
      }
      if (patch.source !== undefined && patch.source !== null && (row.kind !== 'recurring' || row.currency !== 'USD')) return refuse('bad_input')
      await tx.update(costItems).set(patch).where(eq(costItems.id, itemId))
      await auditStaff(tx, staff, { action: 'costs.item.edit', target: itemId, detail: { fields } })
      return { ok: true }
    })
  } catch (e) { return failed(e) }
}

/** Admin › Today's source (C2): one item per repeating cost overdue or due within a week, oldest first. It reads the shared due set
 *  and the engine's one definition of "due" (`dueRows`); Today never reads these tables itself (check:tenant § 10). */
export async function dueCostItems(staff: StaffOk, today: string): Promise<TodayItem[]> {
  adminOnly(staff)
  const { items, payments } = await loadCosts(today)
  const paidBy = new Map<string, Set<string>>()
  for (const p of payments) { const s = paidBy.get(p.itemId) ?? new Set<string>(); s.add(p.periodFor); paidBy.set(p.itemId, s) }
  const byId = new Map(items.map((i) => [i.id, i]))
  return dueRows(items, paidBy, today).map((row) => {
    const item = byId.get(row.id)!
    const amount = item.currency === 'INR' ? formatInr(paise(item.amount), { decimals: item.amount % 100 !== 0 }) : formatUsd(item.amount as MicroUsd)
    const when = row.tone === 'overdue' ? `overdue ${row.overdueDays} ${row.overdueDays === 1 ? 'day' : 'days'}` : row.inDays === 0 ? 'due today' : `due in ${row.inDays} ${row.inDays === 1 ? 'day' : 'days'}`
    return {
      kind: 'cost_due' as const, key: `${row.id}:${row.next}`, title: `${row.name} is ${when}`,
      line: `${item.varies ? 'About ' : ''}${amount} · ${dayMonthIN(new Date(`${row.next}T12:00:00+05:30`))}`, action: 'Mark paid',
      href: `/admin/costs?view=all&id=${row.id}`, since: new Date(`${row.next}T00:00:00+05:30`),
    }
  })
}

/** What Cashflow's forecast needs from the due set: each month's repeating costs from the next month on, and what is still unpaid to the end of this month. */
export async function costForecastInputs(staff: StaffOk, today: string, months: number): Promise<{ dueByMonth: Record<string, number>; unpaidToMonthEnd: number; unrated: number }> {
  adminOnly(staff)
  const { items, payments, rate } = await loadCosts(today)
  const paidBy = new Map<string, Set<string>>()
  for (const p of payments) { const s = paidBy.get(p.itemId) ?? new Set<string>(); s.add(p.periodFor); paidBy.set(p.itemId, s) }
  const r = rate ? rate.rateE4 : null
  const { byMonth, unrated } = dueCostsByMonth(items, r, monthKey(today, 1), months)
  return { dueByMonth: byMonth, unpaidToMonthEnd: unpaidCostsToMonthEnd(items, paidBy, r, today), unrated }
}

/** A vendor's figure for the bill a cost is next due to pay. */
export type VendorFigure = { source: CostSource; month: string; micros: number }

/** For every repeating dollar cost that names a source: what that vendor's daily charges add up to for the month the next bill covers,
 *  offered only once that month has ended (a running month is partial). Nothing is saved; Mark paid opens with it for the person to confirm.
 *  A cost whose month has no rows read, or whose pull failed, is simply absent (the bill stays typed by hand, never a zero). */
export async function vendorFigures(staff: StaffOk, today: string): Promise<Record<string, VendorFigure>> {
  adminOnly(staff)
  const { items, payments } = await loadCosts(today)
  const paidBy = new Map<string, Set<string>>()
  for (const p of payments) { const s = paidBy.get(p.itemId) ?? new Set<string>(); s.add(p.periodFor); paidBy.set(p.itemId, s) }
  const wanted: { id: string; source: CostSource; month: string }[] = []
  for (const it of items) {
    if (!it.source || it.kind !== 'recurring' || !isLive(it, today)) continue
    const next = dueState(it, paidBy.get(it.id) ?? new Set<string>(), today).next
    if (!next) continue
    const month = billMonthOf(next)
    if (monthEnded(month, today)) wanted.push({ id: it.id, source: it.source, month })
  }
  const out: Record<string, VendorFigure> = {}
  for (const source of new Set(wanted.map((w) => w.source))) {
    const mine = wanted.filter((w) => w.source === source)
    const rows = await usageRows(source, `${mine.map((w) => w.month).sort()[0]}-01`).catch(() => [])
    for (const w of mine) { const micros = monthMicros(rows, w.month); if (micros !== null && micros > 0) out[w.id] = { source, month: w.month, micros } }
  }
  return out
}

// ── Admin › Cashflow reads Costs only through these exports (check:tenant § 10: no other file names the cost tables) ────────────────

/** What was paid between two days (`from` inclusive, `to` exclusive), in paise, by month or as one total (key ''). */
export async function costOut(staff: StaffOk, from: string, to: string, by: 'month' | 'total'): Promise<Record<string, number>> {
  adminOnly(staff)
  const where = and(gte(costPayments.paidOn, from), sql`${costPayments.paidOn} < ${to}::date`)
  if (by === 'total') {
    const [r] = await adminDb().select({ n: sql<string>`coalesce(sum(${costPayments.inrPaise}), 0)::text` }).from(costPayments).where(where)
    return { '': Number(r?.n ?? 0) }
  }
  const key = sql<string>`to_char(${costPayments.paidOn}, 'YYYY-MM')`
  const rows = await adminDb().select({ k: key, n: sql<string>`coalesce(sum(${costPayments.inrPaise}), 0)::text` }).from(costPayments).where(where).groupBy(key)
  return Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]))
}

/** Payments with the cost's name, for a month's Movements: newest first, capped, one row past the cap says there is more. */
export async function costPaymentsBetween(staff: StaffOk, from: string, to: string, cap: number): Promise<{ rows: { id: string; itemId: string; name: string; category: string; paidOn: string; inrPaise: number }[]; more: boolean }> {
  adminOnly(staff)
  const rows = await adminDb().select({ id: costPayments.id, itemId: costPayments.itemId, name: costItems.name, category: costItems.category, paidOn: costPayments.paidOn, inrPaise: costPayments.inrPaise })
    .from(costPayments).innerJoin(costItems, eq(costItems.id, costPayments.itemId))
    .where(and(gte(costPayments.paidOn, from), sql`${costPayments.paidOn} < ${to}::date`)).orderBy(desc(costPayments.paidOn), desc(costPayments.id)).limit(cap + 1)
  return { rows: rows.slice(0, cap), more: rows.length > cap }
}
