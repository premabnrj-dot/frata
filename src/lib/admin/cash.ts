import 'server-only'
import { cache } from 'react'
import { and, asc, desc, eq, gte, isNull, lt, or } from 'drizzle-orm'
import {
  averageNet, booksFigure, cashToday, differenceOf, latestBalances, monthRow, signed,
  type Balance, type CashKind, type CashModel, type Entry, type MonthRow, type Window,
} from '@/domains/admin/cash'
import { addMonths, monthKey, monthRange } from '@/domains/time/month'
import { ADMIN_ONLY, confirmedRecently, type StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { cashAccounts, cashBalances, cashEntries, cashSettings } from '@/lib/db/schema-cash'
import { errName } from '@/lib/log'
import { auditStaff } from './audit'
import { billingIn } from './billing'
import { costOut, costPaymentsBetween, UNDO_FREE_MS } from './costs'

// =============================================================================
// FILE: src/lib/admin/cash.ts — ADMIN › CASHFLOW'S reads and writes (spec docs/specs/2026-11-23-admin-cashflow.md; plan
// docs/plans/2026-11-23-admin-cashflow.md task 4). frata_admin only through adminDb(); the four cash tables are named nowhere else
// (check:tenant § 10, the Cash family). Support staff share the frata_admin connection, so EVERY export checks ADMIN_ONLY itself. Billing and
// Costs are read ONLY through their exports. Reads are plain statements, one cached load per request keyed by the day (never an object): the page
// and, in R2, the Today item share it. A write is one transaction calling only `tx.*` and `auditStaff(tx)`.
// AUDIT DETAIL (kept forever; spec § Who may): a balance row carries `{accountId, asOf}`, never the amount; a done entry's edit or delete carries the
// old `{kind, amountPaise, happenedOn}` (a record that reaches the CA must survive); everything else carries field names only.
// =============================================================================

const adminOnly = (staff: StaffOk) => { if (!(ADMIN_ONLY as readonly string[]).includes(staff.role)) throw new Error('cashflow is ADMIN_ONLY') }

export type CashError = 'not_found' | 'confirm_first' | 'bad_input' | 'unknown'
export type CashResult<T = object> = ({ ok: true } & T) | { ok: false; error: CashError }
const refuse = (error: CashError): { ok: false; error: CashError } => ({ ok: false, error })
const failed = (e: unknown): { ok: false; error: CashError } => {
  console.error('[cash]', errName(e))
  const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code
  return refuse(code === '23514' || code === '22007' || code === '22008' || code === '23502' || code === '23503' ? 'bad_input' : 'unknown')
}

const SIX = 6
const dayAfter = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
const addYears = (day: string, n: number) => `${Number(day.slice(0, 4)) + n}${day.slice(4)}`

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Account = { id: string; name: string }
export type EntryRow = Entry & { note: string | null; createdAt: Date }
export type CashData = {
  accounts: Account[]
  balances: Balance[]
  entries: EntryRow[]
  settings: { floor: number | null; mainAccountId: string | null }
  billingByMonth: Record<string, number>
  costsByMonth: Record<string, number>
  /** What came in and went out since the main account's last balance, through today (for the books' roll-forward). */
  window: Window
}

const toBalance = (r: typeof cashBalances.$inferSelect): Balance => ({ id: r.id, accountId: r.accountId, asOf: r.asOf, paise: r.balancePaise, createdAt: r.createdAt.toISOString() })
const toEntry = (r: typeof cashEntries.$inferSelect): EntryRow => ({
  id: r.id, kind: r.kind as CashKind, amount: r.amountPaise, happenedOn: r.happenedOn, expectedOn: r.expectedOn, accountId: r.accountId, note: r.note, createdAt: r.createdAt,
})

/** Everything the Overview, the Accounts tab and (R2) Today need, read once per request: the cash tables in parallel, Billing and Costs through their exports. */
const loadCash = cache(async (staff: StaffOk, today: string): Promise<CashData> => {
  const db = adminDb()
  const from = `${monthKey(today, -SIX)}-01`, to = `${monthKey(today, 1)}-01`
  const [accounts, balances, entries, [settings], billing, costs] = await Promise.all([
    db.select().from(cashAccounts).orderBy(asc(cashAccounts.createdAt), asc(cashAccounts.id)),
    db.select().from(cashBalances).orderBy(desc(cashBalances.asOf), desc(cashBalances.createdAt), desc(cashBalances.id)).limit(400),
    db.select().from(cashEntries).where(or(gte(cashEntries.happenedOn, from), isNull(cashEntries.happenedOn))).orderBy(desc(cashEntries.createdAt)).limit(501),
    db.select().from(cashSettings).where(eq(cashSettings.id, 1)),
    billingIn(staff, from, to, 'month'),
    costOut(staff, from, to, 'month'),
  ])
  const bals = balances.map(toBalance)
  const main = latestBalances(bals).find((b) => b.accountId === settings?.mainAccountId) ?? null
  const window: Window = main && main.asOf < today
    ? { billingIn: (await billingIn(staff, dayAfter(main.asOf), dayAfter(today), 'total'))[''] ?? 0, costsOut: (await costOut(staff, dayAfter(main.asOf), dayAfter(today), 'total'))[''] ?? 0 }
    : { billingIn: 0, costsOut: 0 }
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })), balances: bals, entries: entries.map(toEntry),
    settings: { floor: settings?.floorPaise ?? null, mainAccountId: settings?.mainAccountId ?? null },
    billingByMonth: billing, costsByMonth: costs, window,
  }
})

export async function cashData(staff: StaffOk, today: string): Promise<CashData> { adminOnly(staff); return loadCash(staff, today) }

export type AccountView = { id: string; name: string; main: boolean; latest: Balance | null; earlier: Balance[] }
export type CashOverview = {
  today: string
  accounts: AccountView[]
  /** Cash in the bank today (the main account rolled forward); null with no balance yet. */
  cash: number | null
  /** The oldest of the accounts' latest balance days: the date the figure is "as of". */
  asOf: string | null
  floor: number | null
  /** Net each month: the average of the last three full months. */
  net: number | null
  /** The six full months before this one, and this month so far. */
  rows: MonthRow[]
}

const modelOf = (d: CashData, today: string): CashModel => ({
  today, billingByMonth: d.billingByMonth, costsByMonth: d.costsByMonth, dueCosts: {}, entries: d.entries, gstActual: { thisMonth: null, nextMonth: null }, gstBps: 1800,
})

export async function cashOverview(staff: StaffOk, today: string): Promise<CashOverview> {
  adminOnly(staff)
  const d = await loadCash(staff, today)
  const latest = latestBalances(d.balances)
  const byAccount = new Map<string, Balance[]>()
  for (const b of d.balances) byAccount.set(b.accountId, [...(byAccount.get(b.accountId) ?? []), b])
  const accounts: AccountView[] = d.accounts.map((a) => {
    const all = byAccount.get(a.id) ?? []
    const last = latest.find((b) => b.accountId === a.id) ?? null
    return { id: a.id, name: a.name, main: a.id === d.settings.mainAccountId, latest: last, earlier: all.filter((b) => b.id !== last?.id).slice(0, 2) }
  })
  const m = modelOf(d, today)
  const rows: MonthRow[] = []
  let bal = 0
  for (let i = SIX; i >= 0; i--) { const r = monthRow(monthKey(today, -i), bal, { ...m, today: i === 0 ? addMonths(new Date(`${today}T00:00:00Z`), 1).toISOString().slice(0, 10) : today }); rows.push(r); bal = r.closing }
  return {
    today, accounts, cash: latest.length ? cashToday(latest, d.settings.mainAccountId, d.window, d.entries, today) : null,
    asOf: latest.length ? latest.map((b) => b.asOf).sort()[0]! : null, floor: d.settings.floor, net: averageNet(m), rows,
  }
}

export type Line = { key: string; date: string; name: string; sub: string | null; source: 'Billing' | 'Costs' | 'Entered' | 'Planned'; amount: number; href: string | null; entryId: string | null; done: boolean }
export type Movements = { month: string; lines: Line[]; in: number; out: number; more: boolean }

/** A month's lines from the three sources, merged here (newest first). Each source is capped and one row past the cap says there is more; the month is
 *  read whole, never keyset-paged across three sources. */
export async function movementsOf(staff: StaffOk, ym: string): Promise<Movements> {
  adminOnly(staff)
  const { from, to } = monthRange(ym)
  const next = dayAfter(to)
  const [days, costs, entryRows] = await Promise.all([
    billingIn(staff, from, next, 'day'),
    costPaymentsBetween(staff, from, next, 600),
    adminDb().select().from(cashEntries).where(or(and(gte(cashEntries.happenedOn, from), lt(cashEntries.happenedOn, next)), and(gte(cashEntries.expectedOn, from), lt(cashEntries.expectedOn, next)))).orderBy(desc(cashEntries.createdAt)).limit(501),
  ])
  const lines: Line[] = []
  for (const [day, p] of Object.entries(days)) if (p !== 0) lines.push({ key: `b:${day}`, date: day, name: 'Billing payments', sub: null, source: 'Billing', amount: p, href: '/admin/billing', entryId: null, done: true })
  for (const c of costs.rows) lines.push({ key: `c:${c.id}`, date: c.paidOn, name: c.name, sub: c.category, source: 'Costs', amount: -c.inrPaise, href: `/admin/costs?view=all&id=${c.itemId}`, entryId: null, done: true })
  for (const e of entryRows.slice(0, 500).map(toEntry)) {
    const planned = e.happenedOn === null
    lines.push({ key: `e:${e.id}`, date: (e.happenedOn ?? e.expectedOn)!, name: e.kind, sub: e.note, source: planned ? 'Planned' : 'Entered', amount: signed(e), href: null, entryId: e.id, done: !planned })
  }
  lines.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
  const done = lines.filter((l) => l.done)
  return { month: ym, lines, in: done.filter((l) => l.amount > 0).reduce((t, l) => t + l.amount, 0), out: -done.filter((l) => l.amount < 0).reduce((t, l) => t + l.amount, 0), more: costs.more || entryRows.length > 500 }
}

/** What the books say for the main account at a typed day, and the difference from a typed balance: the server's own sum, never the client's. */
export async function booksFor(staff: StaffOk, typed: number, asOf: string, today: string): Promise<{ books: number; difference: number } | null> {
  adminOnly(staff)
  const d = await loadCash(staff, today)
  const main = latestBalances(d.balances).find((b) => b.accountId === d.settings.mainAccountId) ?? null
  if (!main || main.asOf >= asOf) return null
  const [bill, cost] = await Promise.all([billingIn(staff, dayAfter(main.asOf), dayAfter(asOf), 'total'), costOut(staff, dayAfter(main.asOf), dayAfter(asOf), 'total')])
  const books = booksFigure(main, { billingIn: bill[''] ?? 0, costsOut: cost[''] ?? 0 }, d.entries, asOf)
  const diff = differenceOf(typed, books)
  return books === null || diff === null ? null : { books, difference: diff }
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type BalanceInput = { accountId: string; asOf: string; paise: number; note?: string | null; floorPaise?: number | null }

/** Records what the bank said. The floor is written only when it changed, as its own audit row. */
export async function setBalance(staff: StaffOk, input: BalanceInput, today: string): Promise<CashResult<{ id: string }>> {
  adminOnly(staff)
  if (!uuid.test(input.accountId) || input.asOf > today || input.asOf < '2020-01-01') return refuse('bad_input')
  try {
    return await adminDb().transaction(async (tx) => {
      const [acct] = await tx.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, input.accountId))
      if (!acct) return refuse('not_found')
      const [row] = await tx.insert(cashBalances).values({ accountId: input.accountId, asOf: input.asOf, balancePaise: input.paise, note: input.note ?? null }).returning({ id: cashBalances.id })
      if (!row) return refuse('unknown')
      await auditStaff(tx, staff, { action: 'cash.balance.set', target: row.id, detail: { accountId: input.accountId, asOf: input.asOf } })
      if (input.floorPaise !== undefined) {
        const [cur] = await tx.select({ floor: cashSettings.floorPaise }).from(cashSettings).where(eq(cashSettings.id, 1))
        if ((cur?.floor ?? null) !== input.floorPaise) {
          await tx.update(cashSettings).set({ floorPaise: input.floorPaise, updatedAt: new Date() }).where(eq(cashSettings.id, 1))
          await auditStaff(tx, staff, { action: 'cash.settings.set', target: '1', detail: { fields: ['floorPaise'] } })
        }
      }
      return { ok: true as const, id: row.id }
    })
  } catch (e) { return failed(e) }
}

/** Removes a balance (Undo). One older than ten minutes needs a fresh passkey check; the audit keeps the account and day, never the amount. */
export async function undoBalance(staff: StaffOk, accountId: string, balanceId: string, now: Date): Promise<CashResult> {
  adminOnly(staff)
  if (!uuid.test(accountId) || !uuid.test(balanceId)) return refuse('not_found')
  try {
    return await adminDb().transaction(async (tx) => {
      const [b] = await tx.select().from(cashBalances).where(and(eq(cashBalances.id, balanceId), eq(cashBalances.accountId, accountId)))
      if (!b) return refuse('not_found')
      if (now.getTime() - b.createdAt.getTime() > UNDO_FREE_MS && !confirmedRecently(staff, now.getTime())) return refuse('confirm_first')
      const gone = await tx.delete(cashBalances).where(and(eq(cashBalances.id, balanceId), eq(cashBalances.accountId, accountId))).returning({ id: cashBalances.id })
      if (!gone.length) return refuse('not_found')
      await auditStaff(tx, staff, { action: 'cash.balance.undo', target: balanceId, detail: { accountId, asOf: b.asOf } })
      return { ok: true as const }
    })
  } catch (e) { return failed(e) }
}

export type EntryInput = { kind: CashKind; amount: number; happenedOn?: string | null; expectedOn?: string | null; accountId?: string | null; note?: string | null }

const entryDaysOk = (happenedOn: string | null | undefined, expectedOn: string | null | undefined, today: string) =>
  (happenedOn == null) !== (expectedOn == null) &&
  (happenedOn == null || (happenedOn <= today && happenedOn >= '2020-01-01')) &&
  (expectedOn == null || (expectedOn <= addYears(today, 2) && expectedOn >= '2020-01-01'))

export async function addEntry(staff: StaffOk, input: EntryInput, today: string): Promise<CashResult<{ id: string }>> {
  adminOnly(staff)
  if (!entryDaysOk(input.happenedOn, input.expectedOn, today) || (input.accountId && !uuid.test(input.accountId))) return refuse('bad_input')
  try {
    return await adminDb().transaction(async (tx) => {
      if (input.accountId) { const [a] = await tx.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, input.accountId)); if (!a) return refuse('not_found') }
      const [row] = await tx.insert(cashEntries).values({
        kind: input.kind, amountPaise: input.amount, happenedOn: input.happenedOn ?? null, expectedOn: input.expectedOn ?? null, accountId: input.accountId ?? null, note: input.note ?? null,
      }).returning({ id: cashEntries.id })
      if (!row) return refuse('unknown')
      await auditStaff(tx, staff, { action: 'cash.entry.add', target: row.id, detail: { kind: input.kind, planned: input.happenedOn == null } })
      return { ok: true as const, id: row.id }
    })
  } catch (e) { return failed(e) }
}

export type EntryPatch = Partial<{ kind: CashKind; amount: number; happenedOn: string | null; expectedOn: string | null; accountId: string | null; note: string | null }>

/** The old figures a done entry's audit keeps (a record that reaches the CA must survive an edit or a delete). */
const oldOf = (e: typeof cashEntries.$inferSelect) => ({ kind: e.kind, amountPaise: e.amountPaise, happenedOn: e.happenedOn })

/** Edits an entry. A done entry older than ten minutes needs a fresh passkey check; so does making a planned one done with a different amount or day. */
export async function editEntry(staff: StaffOk, id: string, patch: EntryPatch, today: string, now: Date): Promise<CashResult> {
  adminOnly(staff)
  const fields = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (!uuid.test(id) || !fields.length) return refuse('bad_input')
  try {
    return await adminDb().transaction(async (tx) => {
      const [e] = await tx.select().from(cashEntries).where(eq(cashEntries.id, id))
      if (!e) return refuse('not_found')
      const next = {
        kind: patch.kind ?? e.kind, amountPaise: patch.amount ?? e.amountPaise,
        happenedOn: patch.happenedOn !== undefined ? patch.happenedOn : e.happenedOn, expectedOn: patch.expectedOn !== undefined ? patch.expectedOn : e.expectedOn,
        accountId: patch.accountId !== undefined ? patch.accountId : e.accountId, note: patch.note !== undefined ? patch.note : e.note,
      }
      if (!entryDaysOk(next.happenedOn, next.expectedOn, today) || (next.accountId && !uuid.test(next.accountId))) return refuse('bad_input')
      if (next.accountId && next.accountId !== e.accountId) { const [a] = await tx.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, next.accountId)); if (!a) return refuse('not_found') }
      const wasDone = e.happenedOn !== null
      const becomesDone = !wasDone && next.happenedOn !== null
      const old = now.getTime() - e.createdAt.getTime() > UNDO_FREE_MS
      const changedFigures = becomesDone && (next.amountPaise !== e.amountPaise || next.happenedOn !== e.expectedOn)
      if (((wasDone && old) || changedFigures) && !confirmedRecently(staff, now.getTime())) return refuse('confirm_first')
      await tx.update(cashEntries).set({ kind: next.kind, amountPaise: next.amountPaise, happenedOn: next.happenedOn, expectedOn: next.expectedOn, accountId: next.accountId, note: next.note }).where(eq(cashEntries.id, id))
      await auditStaff(tx, staff, { action: 'cash.entry.edit', target: id, detail: wasDone ? { ...oldOf(e), fields } : { fields } })
      return { ok: true as const }
    })
  } catch (e) { return failed(e) }
}

export async function deleteEntry(staff: StaffOk, id: string, now: Date): Promise<CashResult> {
  adminOnly(staff)
  if (!uuid.test(id)) return refuse('not_found')
  try {
    return await adminDb().transaction(async (tx) => {
      const [e] = await tx.select().from(cashEntries).where(eq(cashEntries.id, id))
      if (!e) return refuse('not_found')
      const done = e.happenedOn !== null
      if (done && now.getTime() - e.createdAt.getTime() > UNDO_FREE_MS && !confirmedRecently(staff, now.getTime())) return refuse('confirm_first')
      const gone = await tx.delete(cashEntries).where(eq(cashEntries.id, id)).returning({ id: cashEntries.id })
      if (!gone.length) return refuse('not_found')
      await auditStaff(tx, staff, { action: 'cash.entry.delete', target: id, detail: done ? oldOf(e) : { kind: e.kind } })
      return { ok: true as const }
    })
  } catch (e) { return failed(e) }
}

/** Adds an account. The first one becomes the main account (where Billing and Costs land), as its own audit row. */
export async function addAccount(staff: StaffOk, name: string): Promise<CashResult<{ id: string }>> {
  adminOnly(staff)
  try {
    return await adminDb().transaction(async (tx) => {
      const [row] = await tx.insert(cashAccounts).values({ name }).returning({ id: cashAccounts.id })
      if (!row) return refuse('unknown')
      await auditStaff(tx, staff, { action: 'cash.account.add', target: row.id, detail: {} })
      const [cur] = await tx.select({ main: cashSettings.mainAccountId }).from(cashSettings).where(eq(cashSettings.id, 1))
      if (!cur?.main) {
        await tx.update(cashSettings).set({ mainAccountId: row.id, updatedAt: new Date() }).where(eq(cashSettings.id, 1))
        await auditStaff(tx, staff, { action: 'cash.settings.set', target: '1', detail: { fields: ['mainAccountId'] } })
      }
      return { ok: true as const, id: row.id }
    })
  } catch (e) { return failed(e) }
}

/** Changes the main account or the floor (field names only in the audit). */
export async function setSettings(staff: StaffOk, patch: { floorPaise?: number | null; mainAccountId?: string | null }): Promise<CashResult> {
  adminOnly(staff)
  const fields = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (!fields.length || (patch.mainAccountId && !uuid.test(patch.mainAccountId))) return refuse('bad_input')
  try {
    return await adminDb().transaction(async (tx) => {
      if (patch.mainAccountId) { const [a] = await tx.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, patch.mainAccountId)); if (!a) return refuse('not_found') }
      await tx.update(cashSettings).set({ ...patch, updatedAt: new Date() }).where(eq(cashSettings.id, 1))
      await auditStaff(tx, staff, { action: 'cash.settings.set', target: '1', detail: { fields } })
      return { ok: true as const }
    })
  } catch (e) { return failed(e) }
}

