import 'server-only'
import { sql } from 'drizzle-orm'
import { bucketOf, DAYS, HOUR_BUCKETS } from '@/domains/analytics/kit'
import type { Window } from '@/domains/analytics/period'
import { istDayKey, IST_OFFSET_MS } from '@/domains/time/day'
import { dayMonthIN } from '@/lib/format-date'
import { monthStartIST } from '@/domains/time/month'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { holdingSql, paymentKindSql, stageSql, standingSql } from '@/lib/db/order-predicates'
import { discounts } from '@/lib/db/schema-discounts'
import { orders } from '@/lib/db/schema-orders'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/queries/analytics-series.ts — ANALYTICS' CHARTS (Neel N1b·3; speed review 2026-11-15 shapes).
//
// Inside analyticsPage's transaction, after the window read, ONE savepoint holds every series, pipelined, under an
// 800 ms ceiling: a failure rolls back to it and the chart sections hide, the page stays (savepoints cannot nest under
// Promise.all on one connection). Counts and Sales only, which every member already sees: no cost here.
//  (abc) ONE statement at the finest grain, 3-hour IST slot × payment kind × came back, for the SAME orders the Sales
//        figure counts (standing or holding); days, weeks × paid/COD and weekday × hours are derived here. Came back is
//        counted on the day the order was placed, as the figure is, so the trend and the figure agree.
//  (d)   orders with an outcome and came back, by delivery state (index-only: orders_outcome_state, 0127).
//  (e)   shoppers who come back: per phone over all history, its first order and a month mask over the four whole
//        months before this one (orders_phone_history, 0127).
//  (f)   offers that started in the window: notes on the trend.
// =============================================================================

const DAY = 86_400_000
const SLOT = 3 * 3_600_000

export type SeriesDay = { key: string; sales: number; orders: number; rto: number; prevSales: number; prevOrders: number }
export type Series = {
  days: SeriesDay[]
  /** 7-day blocks from the window's start (a short last one says its days), or days under 14 days. */
  weeks: { label: string; a: number; b: number }[]
  /** weekday (Monday first) × hour bucket (kit HOUR_BUCKETS): orders in the window. */
  heat: number[][]
  states: { state: string; outcomes: number; rto: number }[]
  /** Four whole months before this one, oldest first; `again[j]` is month j+1 after, null while it has not come yet. */
  cohort: { month: Date; shoppers: number; again: (number | null)[] }[]
  notes: { key: string; title: string }[]
}

type SlotRow = { slot: number; cur: boolean; kind: 'cod' | 'paid' | 'unpaid'; rto: boolean; n: number; sales: string }

/** The series on their own, in the shop's tenant transaction (a snapshot): the int test, and any page without Analytics'
 * figures. Analytics itself reads them inside its own transaction (seriesIn), after the figures. */
export async function seriesFor(tenantId: string, w: Window, now = new Date()): Promise<Series | null> {
  return withTenant(tenantId, (tx) => seriesIn(tx, tenantId, w, now), { snapshot: true })
}

/** The series for the window, or null when they could not be read in time (their sections hide). */
export async function seriesIn(tx: Tx, tenantId: string, w: Window, now: Date): Promise<Series | null> {
  // t0 starts this IST month; t1 … t4 the four before it (t4 the oldest).
  const t0 = monthStartIST(now)
  const [t1, t2, t3, t4] = monthsBack(t0)
  try {
    return await tx.transaction(async (sp) => {
      await sp.execute(sql`select set_config('statement_timeout', '800ms', true)`)
      const iso = (d: Date) => sql`${d.toISOString()}::timestamptz`
      const [slots, states, cohort, notes] = await Promise.all([
        sp.execute<SlotRow>(sql`
          select floor((extract(epoch from o.placed_at) + 19800) / 10800)::int slot, (o.placed_at >= ${iso(w.start)}) cur,
                 ${paymentKindSql('o')} kind, (${stageSql('o')} = 'rto') rto, count(*)::int n, coalesce(sum(o.total), 0)::bigint sales
            from ${orders} o
           where o.tenant_id = ${tenantId} and o.placed_at >= ${iso(w.prevStart)} and o.placed_at < ${iso(w.end)}
             and (o.placed_at >= ${iso(w.start)} or o.placed_at < ${iso(w.prevEnd)})
             and (${standingSql('o')} or ${holdingSql(now, 'o')})
           group by 1, 2, 3, 4`),
        sp.execute<{ state: string; outcomes: number; rto: number }>(sql`
          select o.state, count(*)::int outcomes, (count(*) filter (where o.rto_initiated_at is not null))::int rto
            from ${orders} o
           where o.tenant_id = ${tenantId} and o.placed_at >= ${iso(w.start)} and o.placed_at < ${iso(w.end)} and o.cancelled_at is null
             and (o.rto_initiated_at is not null or o.delivered_at is not null or o.lost_at is not null) and o.state <> ''
           group by 1`),
        sp.execute<{ k: number; shoppers: number; m1: number; m2: number; m3: number }>(sql`
          select k, count(*)::int shoppers,
                 (count(*) filter (where mask & (1 << (k + 1)) <> 0))::int m1,
                 (count(*) filter (where mask & (1 << (k + 2)) <> 0))::int m2,
                 (count(*) filter (where mask & (1 << (k + 3)) <> 0))::int m3
            from (select case when first < ${iso(t3)} then 0 when first < ${iso(t2)} then 1 when first < ${iso(t1)} then 2 else 3 end k, mask
                    from (select min(o.placed_at) first,
                                 bit_or(case when o.placed_at < ${iso(t4)} then 0 when o.placed_at < ${iso(t3)} then 1 when o.placed_at < ${iso(t2)} then 2
                                             when o.placed_at < ${iso(t1)} then 4 when o.placed_at < ${iso(t0)} then 8 else 16 end) mask
                            from ${orders} o
                           where o.tenant_id = ${tenantId} and o.phone <> '' and ${standingSql('o')}
                           group by o.phone) p
                   where first >= ${iso(t4)} and first < ${iso(t0)}) c
           group by k order by k`),
        sp.execute<{ title: string; starts_at: Date | string }>(sql`
          select d.title, d.starts_at from ${discounts} d
           where d.tenant_id = ${tenantId} and d.starts_at >= ${iso(w.start)} and d.starts_at < ${iso(w.end)}
           order by d.starts_at limit 5`),
      ])
      return shape(w, [...slots], [...states], [...cohort], [...notes], [t4, t3, t2, t1])
    })
  } catch (err) {
    console.error('[analytics] series', errName(err))
    return null
  }
}

/** The starts of the four IST months before the one `t0` starts, newest first (t1 … t4). */
function monthsBack(t0: Date): [Date, Date, Date, Date] {
  const out: Date[] = []
  let at = t0
  for (let i = 0; i < 4; i++) { at = monthStartIST(new Date(at.getTime() - DAY)); out.push(at) }
  return out as [Date, Date, Date, Date]
}

/** The rows as the charts read them (exported for its unit test). */
export function shape(w: Window, slots: SlotRow[], states: { state: string; outcomes: number; rto: number }[],
  cohort: { k: number; shoppers: number; m1: number; m2: number; m3: number }[], notes: { title: string; starts_at: Date | string }[],
  monthStarts: [Date, Date, Date, Date]): Series {
  const back = w.days * DAY
  const dayKeys = Array.from({ length: w.days }, (_, i) => istDayKey(new Date(w.start.getTime() + i * DAY + DAY / 2)))
  const at = new Map(dayKeys.map((k, i) => [k, i]))
  const days: SeriesDay[] = dayKeys.map((key) => ({ key, sales: 0, orders: 0, rto: 0, prevSales: 0, prevOrders: 0 }))
  const heat = DAYS.map(() => HOUR_BUCKETS.map(() => 0))
  const byDay = days.map(() => ({ a: 0, b: 0 }))
  for (const r of slots) {
    const startMs = r.slot * SLOT - IST_OFFSET_MS // the slot's first moment, UTC
    const day = istDayKey(new Date(startMs + (r.cur ? 0 : back)))
    const i = at.get(day)
    if (i === undefined) continue
    const d = days[i]!
    if (r.cur) {
      d.orders += r.n; d.sales += Number(r.sales); if (r.rto) d.rto += r.n
      if (r.kind === 'paid') byDay[i]!.a += r.n; else if (r.kind === 'cod') byDay[i]!.b += r.n
      const istHour = Math.floor(((startMs + IST_OFFSET_MS) % DAY) / 3_600_000)
      const weekday = (Math.floor((startMs + IST_OFFSET_MS) / DAY) + 3) % 7 // 1970-01-01 was a Thursday; Monday is 0
      heat[weekday]![bucketOf(istHour)]! += r.n
    } else { d.prevOrders += r.n; d.prevSales += Number(r.sales) }
  }
  // Weeks: 7-day blocks from the start (a short last block says its days); under 14 days, by day.
  const weeks = w.days < 14
    ? dayKeys.map((k, i) => ({ label: dayLabel(k), ...byDay[i]! }))
    : Array.from({ length: Math.ceil(w.days / 7) }, (_, b) => {
      const part = byDay.slice(b * 7, b * 7 + 7)
      const n = part.length
      return { label: n === 7 ? `Week ${b + 1}` : `Week ${b + 1} · ${n} day${n === 1 ? '' : 's'}`, a: part.reduce((s, x) => s + x.a, 0), b: part.reduce((s, x) => s + x.b, 0) }
    })
  // Cohorts oldest first; a month after the first that has not begun yet is null ("not yet"), never 0.
  const cohortRows = monthStarts.map((month, k) => {
    const row = cohort.find((c) => c.k === k)
    const again = [1, 2, 3].map((j) => {
      const target = k + j // 4 is this month, so far; past it, not yet
      if (target > 4) return null
      return row ? [row.m1, row.m2, row.m3][j - 1]! : 0
    })
    return { month, shoppers: row?.shoppers ?? 0, again }
  })
  return {
    days, weeks, heat, states,
    cohort: cohortRows,
    notes: notes.map((n) => ({ key: istDayKey(new Date(n.starts_at)), title: n.title })),
  }
}

/** "13 Nov" for an IST day key (noon IST, so no zone can move it to another day). */
const dayLabel = (key: string) => dayMonthIN(new Date(`${key}T06:30:00Z`))
