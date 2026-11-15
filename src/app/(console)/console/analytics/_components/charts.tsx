import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { CohortTable } from '@/components/charts/cohort-table'
import { Figure } from '@/components/charts/figure'
import { Heatmap } from '@/components/charts/heatmap'
import { SplitBars, SplitLegend } from '@/components/charts/split-bars'
import { StateTiles } from '@/components/charts/state-tiles'
import { TrendChart } from '@/components/charts/trend-chart'
import { TrendLegend } from '@/components/charts/trend-legend'
import { Money, Numeric } from '@/components/data/numeric'
import { change, shortValue } from '@/domains/analytics/kit'
import { JUDGE_MIN } from '@/domains/analytics/judge'
import { paise } from '@/domains/money/paise'
import { formatPercent } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import type { Series } from '@/lib/queries/analytics-series'
import type { Analytics, Totals } from '@/lib/queries/analytics'

// =============================================================================
// ANALYTICS · THE KIT ON THE PAGE (Neel N1b, screen mockup docs/mockups/2026-11-15-analytics-n1b/, as approved). Server
// components: each takes the page's numbers (₹ kept only when the viewer sees costs) and the series, and draws them with
// src/components/charts/. Every change says what it is against (once per row); colour by meaning (returns up is bad).
// =============================================================================

const outcomes = (t: Totals) => t.delivered + t.rto + t.lost
const inrShort = (p: number) => shortValue(p, 'money')

/** The four figures as drawn: Sales, Orders, Came back, ₹ kept after returns (only for whoever sees costs). */
export function Figures({ a, compare, series, keptNote }: { a: Pick<Analytics, 'cur' | 'prev' | 'costs'>; compare: string; series: Series | null; keptNote?: React.ReactNode }) {
  const c = a.cur, p = a.prev
  const out = outcomes(c), outBefore = outcomes(p)
  const spark = (k: 'sales' | 'orders') => series?.days.map((d) => d[k])
  const k = c.kept
  return (
    <section aria-label="Figures" className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
      <Figure label="Sales" value={<Money paise={paise(c.sales)} />} change={change(c.sales, p.sales, { kind: 'money', good: 'up' })} against={compare} spark={spark('sales')} />
      <Figure label="Orders" value={<Numeric>{c.orders}</Numeric>} change={change(c.orders, p.orders, { kind: 'count', good: 'up' })} spark={spark('orders')} />
      <Figure label="Came back (RTO)"
        value={out >= JUDGE_MIN ? formatPercent(c.rto / out, 1) : `${c.rto} of ${out}`}
        change={out >= JUDGE_MIN && outBefore >= JUDGE_MIN ? change(c.rto / out, p.rto / outBefore, { kind: 'share', good: 'down' }) : null}
        note={out ? `${c.rto} of ${out} with an outcome` : 'None with an outcome yet'} />
      {a.costs ? (
        k && k.counted > 0
          ? <Figure label="₹ kept after returns" value={<Money paise={paise(k.kept)} />} change={p.kept && p.kept.counted > 0 ? change(k.kept, p.kept.kept, { kind: 'money', good: 'up' }) : null} note={keptNote} />
          : <Figure label="₹ kept after returns" value={null} empty={<>Shows once orders are delivered or come back · <Numeric>{c.onTheWay}</Numeric> on the way</>} />
      ) : null}
    </section>
  )
}

/** "512 orders → 388 delivered · 61 came back · 3 lost · 41 on the way · 19 not sent yet" (as drawn). */
export function FlowLine({ c }: { c: Totals }) {
  const n = (v: number) => <Numeric className="font-medium text-foreground">{v}</Numeric>
  return (
    <p className="text-sm text-muted-foreground">
      {n(c.orders)} orders → {n(c.delivered)} delivered{' · '}{n(c.rto)} came back
      {c.lost ? <>{' · '}{n(c.lost)} lost</> : null}
      {' · '}{n(c.onTheWay)} on the way{' · '}{n(c.notSent)} not sent yet
    </p>
  )
}

/** Sales by day, this period against the one before; came back marked on the day those orders were placed. */
export function SalesByDay({ s, compareName }: { s: Series; compareName: string }) {
  const points = s.days.map((d) => ({ key: d.key, label: dayMonthIN(new Date(`${d.key}T06:30:00Z`)), value: d.sales, prev: d.prevSales, marks: d.rto }))
  if (points.length < 2) return <Section id="sales-by-day" title="Sales by day" flatOnPhone><p className="text-sm text-muted-foreground">One day so far. The trend needs two.</p></Section>
  const first = points[0]!, last = points.at(-1)!
  const summary = `Sales a day from ${first.label} to ${last.label}. ${inrShort(first.value)} to ${inrShort(last.value)}.${s.notes.length ? ` ${s.notes.map((n) => `${n.title} from ${dayMonthIN(new Date(`${n.key}T06:30:00Z`))}.`).join(' ')}` : ''}`
  return (
    <Section id="sales-by-day" title="Sales by day" flatOnPhone action={<TrendLegend names={['This period', compareName]} marks="Came back" className="justify-end max-md:hidden" />}>
      {/* A phone has no room beside the heading: the key goes under it. */}
      <TrendLegend names={['This period', compareName]} marks="Came back" className="md:hidden" />
      <TrendChart points={points} summary={summary} unit="money" seriesNames={['This period', compareName]} notes={s.notes} marksName="came back" />
    </Section>
  )
}

export function PaidAndCod({ s }: { s: Series }) {
  if (!s.weeks.some((w) => w.a + w.b > 0)) return null
  return <Section id="paid-cod" flatOnPhone action={<SplitLegend a="Paid online" b="COD" className="justify-end max-md:hidden" />} title={s.weeks.length && s.weeks[0]!.label.startsWith('Week') ? 'Paid online and COD, by week' : 'Paid online and COD, by day'}><SplitLegend a="Paid online" b="COD" className="md:hidden" /><SplitBars rows={s.weeks} a="Paid online" b="COD" /></Section>
}

export function WhenOrdersCome({ s }: { s: Series }) {
  if (!s.heat.flat().some((n) => n > 0)) return null
  return <Section id="when" title="When orders come" flatOnPhone><Heatmap grid={s.heat} /></Section>
}

export function ByState({ s }: { s: Series }) {
  if (!s.states.length) return null
  return <StateTiles id="by-state" title="Came back, by state" rows={s.states} />
}

export function ComeBack({ s }: { s: Series }) {
  // As drawn: the three whole months before this one (the oldest month read only feeds the mask).
  const rows = s.cohort.slice(-3)
  if (!rows.some((c) => c.shoppers > 0)) return null
  return <Section id="come-back" title="Shoppers who come back" flatOnPhone><CohortTable rows={rows} /></Section>
}

/** The under-30 state (rule 63): the tally and a count to go, in place of the figures' shares. */
export function TooFew({ n }: { n: number }) {
  return (
    <p className="text-sm text-muted-foreground">
      Too few to judge: <Numeric>{n}</Numeric> {n === 1 ? 'order' : 'orders'} so far. Shares mean something from {JUDGE_MIN}.{' '}
      <Link href="/console/orders?tab=all" className="text-link underline underline-offset-2">See the orders</Link>
    </p>
  )
}
