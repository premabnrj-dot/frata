// =============================================================================
// FILE: src/domains/orders/filters.ts — WHAT A FILTER ON ORDERS MEANS (Neel N1c, § Finding things).
//
// A filter lives in the address (Back works, a link can be shared, a saved view stores it): `pay=cod,paid`,
// `st=10,32` (GST state codes, short and closed), `placed=7d` or `from=2026-11-01&to=2026-11-10` (IST days), `min=500&max=2000`
// (whole rupees, as a person types them; paise inside). parseFilters keeps only what it understands, so a hand-edited
// link or a stored view can never reach SQL as typed; filterParams writes the one canonical form back. chipsFor is the
// words ("Payment is COD", "Total ₹500–₹2,000"), one copy for the chips, the phone sheet and a saved view's tooltip.
// Pure (check:layers): src/lib/db/order-predicates.ts turns it into SQL.
// =============================================================================

import { STATE_CODE, type State } from '@/domains/checkout/states'
import { fromRupees, type Paise } from '@/domains/money/paise'
import { istDayStart, IST_OFFSET_MS } from '@/domains/time/day'
import { QUEUE_TABS, type QueueTab } from './order-state'

/** How an order is paid now, as a filter reads it: the same three the queue's Payment column shows. */
export const PAY = ['cod', 'paid', 'unpaid'] as const
export type Pay = (typeof PAY)[number]
/** The words for each (labels.ts reads these: one copy for the column and the chips). */
export const PAY_WORDS: Record<Pay, string> = { cod: 'COD', paid: 'Paid online', unpaid: 'Online, not paid' }

export const PLACED = ['today', '7d', '30d'] as const
export type PlacedPreset = (typeof PLACED)[number]
const PLACED_WORDS: Record<PlacedPreset, string> = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days' }

const CODE_STATE = Object.fromEntries(Object.entries(STATE_CODE).map(([s, c]) => [c, s as State])) as Partial<Record<string, State>>
const MAX_STATES = 10
const MAX_RUPEES = 10_000_000 // ₹1 crore: past any order a shop takes; a bigger number is a typo

export type OrderFilters = {
  pay?: Pay[]
  /** State NAMES as orders store them (orders.state), from their GST codes in the address. */
  states?: State[]
  placed?: PlacedPreset | { from?: string; to?: string }
  total?: { min?: Paise; max?: Paise }
}

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 200) ?? ''
const list = (v: string | string[] | undefined) => one(v).split(',').map((s) => s.trim()).filter(Boolean)
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)
const rupees = (s: string) => (/^\d{1,8}$/.test(s) && Number(s) <= MAX_RUPEES ? Number(s) : null)

/** The filters in an address (or a stored view), keeping only what is understood. Empty → {}. */
export function parseFilters(p: Params): OrderFilters {
  const f: OrderFilters = {}
  const pay = [...new Set(list(p.pay))].filter((x): x is Pay => (PAY as readonly string[]).includes(x))
  if (pay.length && pay.length < PAY.length) f.pay = PAY.filter((x) => pay.includes(x)) // all three is no filter
  const states = [...new Set(list(p.st))].map((c) => CODE_STATE[c]).filter((s): s is State => !!s).slice(0, MAX_STATES)
  if (states.length) f.states = states.sort()
  const placed = one(p.placed)
  if ((PLACED as readonly string[]).includes(placed)) f.placed = placed as PlacedPreset
  else {
    let from = isDay(one(p.from)) ? one(p.from) : undefined
    let to = isDay(one(p.to)) ? one(p.to) : undefined
    if (from && to && from > to) [from, to] = [to, from]
    if (from || to) f.placed = { ...(from ? { from } : {}), ...(to ? { to } : {}) }
  }
  let min = rupees(one(p.min)), max = rupees(one(p.max))
  if (min !== null && max !== null && min > max) [min, max] = [max, min]
  if (min === 0) min = null
  if (min !== null || max !== null) f.total = { ...(min !== null ? { min: fromRupees(min) } : {}), ...(max !== null ? { max: fromRupees(max) } : {}) }
  return f
}

/** The canonical address form, in a fixed order (two equal filters give the same string: a saved view compares them). */
export function filterParams(f: OrderFilters): [string, string][] {
  const out: [string, string][] = []
  if (f.pay?.length) out.push(['pay', f.pay.join(',')])
  if (f.states?.length) out.push(['st', f.states.map((s) => STATE_CODE[s]).sort().join(',')])
  if (typeof f.placed === 'string') out.push(['placed', f.placed])
  else if (f.placed) { if (f.placed.from) out.push(['from', f.placed.from]); if (f.placed.to) out.push(['to', f.placed.to]) }
  if (f.total?.min !== undefined) out.push(['min', String(f.total.min / 100)])
  if (f.total?.max !== undefined) out.push(['max', String(f.total.max / 100)])
  return out
}

export const filterQuery = (f: OrderFilters) => new URLSearchParams(filterParams(f)).toString()
export const hasFilters = (f: OrderFilters) => filterParams(f).length > 0
export const sameFilters = (a: OrderFilters, b: OrderFilters) => filterQuery(a) === filterQuery(b)

/** The IST moments a Placed filter covers: [from, before). */
export function placedRange(p: OrderFilters['placed'], now: Date): { from?: Date; before?: Date } {
  if (!p) return {}
  if (p === 'today') return { from: istDayStart(now) }
  if (p === '7d') return { from: istDayStart(now, -6) }
  if (p === '30d') return { from: istDayStart(now, -29) }
  const day = (s: string, plus = 0) => new Date(Date.parse(`${s}T00:00:00Z`) + plus * 86_400_000 - IST_OFFSET_MS)
  return { ...(p.from ? { from: day(p.from) } : {}), ...(p.to ? { before: day(p.to, 1) } : {}) }
}

const rs = (p: Paise) => `₹${(p / 100).toLocaleString('en-IN')}`
const dayWords = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const or = (xs: string[]) => (xs.length < 3 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`)

export type FilterField = 'pay' | 'st' | 'placed' | 'total'
/** `label` is the whole sentence (the × names it); `lead` and `value` are its two parts, the value shown in bold. */
export type Chip = { field: FilterField; label: string; lead: string; value: string; without: OrderFilters }

/** Each filter as a chip that reads back as a sentence, with the filters left when its × is pressed. */
export function chipsFor(f: OrderFilters): Chip[] {
  const out: Chip[] = []
  const drop = (k: keyof OrderFilters): OrderFilters => { const c = { ...f }; delete c[k]; return c }
  const chip = (field: FilterField, lead: string, value: string, k: keyof OrderFilters) => out.push({ field, lead, value, label: `${lead} ${value}`, without: drop(k) })
  if (f.pay?.length) chip('pay', 'Payment is', or(f.pay.map((p) => PAY_WORDS[p])), 'pay')
  if (f.states?.length) chip('st', 'State is', or(f.states.length > 3 ? [...f.states.slice(0, 2), `${f.states.length - 2} more`] : f.states), 'states')
  if (typeof f.placed === 'string') chip('placed', 'Placed', PLACED_WORDS[f.placed], 'placed')
  else if (f.placed) {
    const { from, to } = f.placed
    if (from && to && from === to) chip('placed', 'Placed on', dayWords(from), 'placed')
    else if (from && to) chip('placed', 'Placed', `${dayWords(from)}–${dayWords(to)}`, 'placed')
    else if (from) chip('placed', 'Placed from', dayWords(from), 'placed')
    else chip('placed', 'Placed up to', dayWords(to!), 'placed')
  }
  if (f.total) {
    const { min, max } = f.total
    if (min !== undefined && max !== undefined) chip('total', 'Total', `${rs(min)}–${rs(max)}`, 'total')
    else if (min !== undefined) chip('total', 'Total', `${rs(min)} or more`, 'total')
    else chip('total', 'Total up to', rs(max!), 'total')
  }
  return out
}

/** A queue tab from the address; anything else is To confirm, the list's first view (one copy: page, routes, panel). */
export function parseTab(v: string | null | undefined): QueueTab {
  return (QUEUE_TABS as readonly string[]).includes(v ?? '') ? (v as QueueTab) : 'to_confirm'
}

/** The Orders list's address: the tab (unless To confirm), the filters, a search and a page, keys sorted, so a link
 * built anywhere equals what Back restores and what a saved view compares with. */
export function ordersHref(o: { tab: QueueTab; filters: OrderFilters; q?: string; page?: number }, extra: Record<string, string> = {}): string {
  const u = new URLSearchParams(filterParams(o.filters))
  if (o.tab !== 'to_confirm') u.set('tab', o.tab)
  if (o.q?.trim()) u.set('q', o.q.trim())
  if ((o.page ?? 1) > 1) u.set('page', String(o.page))
  for (const [k, v] of Object.entries(extra)) u.set(k, v)
  const s = new URLSearchParams([...u.entries()].sort(([a], [b]) => a.localeCompare(b))).toString()
  return `/console/orders${s ? `?${s}` : ''}`
}
