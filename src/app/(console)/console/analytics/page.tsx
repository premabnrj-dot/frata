import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dayMonthIN } from '@/lib/format-date'
import { PRESETS, type Preset } from '@/domains/analytics/link'
import { classifySource } from '@/domains/analytics/source'
import { PERIODS, analyticsPage, isPeriod, windowOf, type Period, type SourceStat } from '@/lib/queries/analytics'
import { trafficNames, trafficRead } from '@/lib/queries/traffic'
import { browserShares, cityShares, enoughVisits, funnel, K_MIN, productLines, slowestPage, speedOf, visitsBySource } from '@/domains/analytics/traffic'
import { errName } from '@/lib/log'
import { urlProblem } from '@/lib/db/url'
import { Browse, Cities, Funnel, NoVisitsYet, Products, SpeedOnPhones, TooFewVisits, VisitsUnavailable } from './_components/traffic'
import { readFailed } from './_components/read-failed'
import { MakeLink } from './_components/make-link'
import { Pincodes, Sources, Strip, Summary } from './_components/parts'

export const metadata = { title: 'Analytics' }
// The viewer's role decides what is computed (₹ only for seesCosts), and "so far" includes today: never cached.
export const dynamic = 'force-dynamic'

// =============================================================================
// CONSOLE › ANALYTICS (A·1; spec docs/specs/2026-11-08-analytics-a1.md, mockup as approved): where this period's orders
// came from, judged on ₹ kept after returns, against the period before; a source opens its own orders; one primary
// action, Make a link. Every member reads it; ₹ only for whoever seesCosts (owners and admins; a partner before
// handover). Reads: src/lib/queries/analytics.ts (one transaction), link targets and the shop's address.
// Visits (A·2 · A2·4, mockup docs/mockups/2026-11-10-analytics-a2.html): src/lib/queries/traffic.ts reads the analytics
// database beside that transaction (never inside it), joined by IST day and source in src/domains/analytics/traffic.ts.
// States: counting off (A·1 as it was), visits unavailable, no visits yet, the first days (under 1,000), ready.
// =============================================================================

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const asked = Number((await searchParams).period ?? 30)
  const period: Period = isPeriod(asked) ? asked : 30
  const now = new Date()
  const { tenantId, role } = auth.membership
  // One snapshot transaction: the numbers, Make a link's targets and the shop's address (speed review A1·7). Visits
  // (A·2) come from the analytics database beside it, never inside it: if that read fails, the orders still show.
  const { start, prevStart } = windowOf(period, now)
  const [page, read] = await Promise.all([
    analyticsPage(tenantId, role, period, now).catch((err: unknown) => readFailed('[analytics]', err)),
    trafficRead(tenantId, start, prevStart, now).catch((err: unknown) => { console.error('[analytics] visits', errName(err), urlProblem(err)); return 'failed' as const }),
  ])
  if ('failed' in page) return page.failed
  const { a, targets, shop } = page
  const traffic = typeof read === 'object' ? read : null
  // The shop's own words for what visits carry (labels, product names, returns by city): only after the visits, as
  // their product ids decide which names are asked for. A failure here only hides the names.
  const names = traffic ? await trafficNames(tenantId, [...traffic.products.map((p) => p.productId), ...traffic.productLcp.map((p) => p.productId)], start)
    .catch((err: unknown) => { console.error('[analytics] visit names', errName(err)); return null }) : null

  // What each preset's orders show as, said by the server (the classifier stays out of the browser bundle).
  const showsAs = Object.fromEntries((Object.keys(PRESETS) as Preset[]).map((k) => [k, classifySource({ utm_source: PRESETS[k].source, utm_medium: PRESETS[k].medium }, null).label])) as Record<Preset, string>
  const make = <MakeLink origin={`https://${shop.host ?? ''}`} open={shop.open && !!shop.slug} products={targets.products} collections={targets.collections} showsAs={showsAs} />
  const dayBefore = new Date(a.start.getTime() - 86_400_000)
  const tabs = <ViewTabs label="Period" tabs={PERIODS.map((p) => ({ href: `/console/analytics?period=${p}`, label: `${p} days`, current: p === period }))} />
  const meta = `${dayMonthIN(a.start)} – today (so far), against ${dayMonthIN(a.prevStart)} – ${dayMonthIN(dayBefore)}. Orders by the day they were placed (IST); today's numbers still change.`

  if (a.cur.orders === 0 && a.prev.orders === 0 && !traffic?.cur.visitors) {
    return (
      <>
        <PageHeader title="Analytics" actions={make} />
        {tabs}
        <Panel title={`No orders in the last ${period} days`}>Share your shop with a link that says where it was shared, and orders from it show here.</Panel>
      </>
    )
  }
  if (read === 'off') {
    return (
      <>
        <PageHeader title="Analytics" actions={make} meta={meta} />
        {tabs}
        <Summary a={a} />
        <Strip a={a} />
        {a.cur.orders > 0 && a.known / a.cur.orders < 0.5 ? (
          <p className="rounded-md bg-info px-3 py-2 text-sm text-info-text">Most orders came without a source. A link from Make a link tells an Instagram bio from a WhatsApp broadcast.</p>
        ) : null}
        <Sources a={a} period={period} />
        <Pincodes a={a} />
      </>
    )
  }

  // Visits (A·2, as the mockup): none yet, the first days (under 1,000), or ready.
  const since = traffic?.firstDay ? new Date(`${traffic.firstDay}T00:00:00+05:30`) : null
  const enough = !!traffic && enoughVisits(traffic.cur.visitors)
  const by = traffic ? visitsBySource(traffic.sources, names?.labels ?? new Map()) : new Map()
  // A source with visits but no orders in the window is a row too (from 5 visitors), after the ones with orders.
  const zero = { orders: 0, sales: 0, cod: 0, delivered: 0, rto: 0, lost: 0, onTheWay: 0, notSent: 0, kept: null }
  const visitOnly: SourceStat[] = [...by.values()].filter((v) => v.visitors >= K_MIN && v.slug !== 'other' && !a.sources.some((s) => s.slug === v.slug))
    .sort((x, y) => y.visitors - x.visitors).map((v) => ({ slug: v.slug, label: v.label, channel: v.channel, cur: zero, prev: zero, campaigns: [] }))
  const withVisits = { ...a, sources: [...a.sources, ...visitOnly] }
  const visits = { by, total: traffic?.cur.visitors ?? 0, enough }
  const f = traffic ? funnel(traffic.cur, a.cur.orders, a.cur.delivered) : null
  const slow = traffic && names ? slowestPage(traffic.productLcp) : null
  const metaVisits = since && since > a.start ? `${meta} Visits counted since ${dayMonthIN(since)}.` : meta
  return (
    <>
      <PageHeader title="Analytics" actions={make} meta={metaVisits} />
      {tabs}
      <Summary a={a} />
      <Strip a={a} visits={traffic ? { cur: traffic.cur, prev: traffic.prev, since, enough } : undefined} />
      {read === 'failed' ? <VisitsUnavailable /> : !traffic?.firstDay ? <NoVisitsYet /> : !enough ? <TooFewVisits visits={traffic.cur.visitors} /> : f ? <Funnel steps={f.steps} drop={f.drop} /> : null}
      {a.cur.orders > 0 && a.known / a.cur.orders < 0.5 ? (
        <p className="rounded-md bg-info px-3 py-2 text-sm text-info-text">Most orders came without a source. A link from Make a link tells an Instagram bio from a WhatsApp broadcast.</p>
      ) : null}
      <Sources a={withVisits} period={period} visits={traffic ? visits : undefined} />
      {traffic && enough ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Browse shares={browserShares(traffic.browsers)} devices={traffic.cur} />
            <Cities shares={cityShares(traffic.cities)} returns={names?.cityReturns ?? new Map()} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Products lines={names ? productLines(traffic.products, names.products) : []} />
            <SpeedOnPhones s={speedOf(traffic.vitals)} slowest={slow && names?.products.get(slow.productId) ? { title: names.products.get(slow.productId)!.title, lcpMs: slow.lcpMs } : null} />
          </div>
        </>
      ) : null}
      <Pincodes a={a} />
    </>
  )
}
