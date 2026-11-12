import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { InfoTip } from '@/components/ui/info-tip'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dayMonthIN } from '@/lib/format-date'
import { PRESETS, type Preset } from '@/domains/analytics/link'
import { classifySource } from '@/domains/analytics/source'
import { PERIODS, analyticsPage, isPeriod, windowOf, type Period, type SourceStat } from '@/lib/queries/analytics'
import { trafficNames, trafficRead } from '@/lib/queries/traffic'
import { browserShares, cityShares, coverage, emptyTotals, enoughVisits, funnel, productLines, slowestPage, speedOf, visitOnly, visitsBySource, type SourceVisits } from '@/domains/analytics/traffic'
import { EMPTY_TOTALS } from '@/domains/analytics/totals'
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
  // The shop's own words for what visits carry (labels, product names, returns by city) follow the visits, as their
  // product ids decide which names are asked for — chained to that read, so both run beside A·1's (speed review M1). A
  // failure of either makes the visits unavailable (below); the orders still show.
  const visitsAndNames = trafficRead(tenantId, start, prevStart, now)
    .catch((err: unknown) => { console.error('[analytics] visits', errName(err), urlProblem(err)); return 'failed' as const })
    .then(async (r) => {
      if (typeof r !== 'object') return { read: r, names: null }
      const names = await trafficNames(tenantId, [...r.products.map((p) => p.productId), ...r.productLcp.map((p) => p.productId)], start)
        .catch((err: unknown) => { console.error('[analytics] visit names', errName(err)); return null })
      return { read: r, names }
    })
  const [page, { read, names }] = await Promise.all([
    analyticsPage(tenantId, role, period, now).catch((err: unknown) => readFailed('[analytics]', err)),
    visitsAndNames,
  ])
  if ('failed' in page) return page.failed
  const { a, targets, shop } = page
  const traffic = typeof read === 'object' ? read : null

  // What each preset's orders show as, said by the server (the classifier stays out of the browser bundle).
  const showsAs = Object.fromEntries((Object.keys(PRESETS) as Preset[]).map((k) => [k, classifySource({ utm_source: PRESETS[k].source, utm_medium: PRESETS[k].medium }, null).label])) as Record<Preset, string>
  const make = <MakeLink origin={`https://${shop.host ?? ''}`} open={shop.open && !!shop.slug} products={targets.products} collections={targets.collections} showsAs={showsAs} />
  const dayBefore = new Date(a.start.getTime() - 86_400_000)
  const tabs = <ViewTabs label="Period" tabs={PERIODS.map((p) => ({ href: `/console/analytics?period=${p}`, label: `${p} days`, current: p === period }))} />
  // The two periods stay in the line (design language 61); how they are counted is the (i) tip (Rule 0).
  const range = `${dayMonthIN(a.start)} – today (so far), against ${dayMonthIN(a.prevStart)} – ${dayMonthIN(dayBefore)}`
  const metaLine = (visitsSince: Date | null) => (
    <span className="inline-flex flex-wrap items-center gap-x-1">{range}
      <InfoTip about="these dates">Orders count on the day they were placed (IST); today&apos;s numbers still change.{visitsSince ? ` Visits counted since ${dayMonthIN(visitsSince)}.` : ''}</InfoTip>
    </span>
  )

  if (a.cur.orders === 0 && a.prev.orders === 0 && !traffic?.cur.visitors) {
    return (
      <>
        <PageHeader title="Analytics" actions={make} />
        {tabs}
        <Panel title={`No orders in the last ${period} days`}>Share your shop with a link that says where it was shared, and orders from it show here.</Panel>
      </>
    )
  }
  // Visits (A·2, as the mockup): off (A·1 as it was), unavailable (the analytics read or the names failed: creator
  // labels would be lost otherwise), none yet, the first days (under 1,000), or ready. Rates of orders per visit only
  // over a window visits fully cover (coverage).
  const on = read !== 'off'
  const failed = read === 'failed' || (!!traffic && !names)
  const t = failed ? null : traffic
  const cov = coverage(t?.firstDay ?? null, a.start, a.prevStart, period)
  const enough = !!t && enoughVisits(t.cur.visitors)
  const rates = enough && cov.cur
  const prevRates = cov.prev && !!t && enoughVisits(t.prev.visitors)
  const by = t && names ? visitsBySource(t.sources, names.labels) : new Map<string, SourceVisits>()
  // A source with visits but no orders in the window is a row too (from 5 visitors), after the ones with orders.
  const extra: SourceStat[] = visitOnly(by, new Set(a.sources.map((x) => x.slug)))
    .map((v) => ({ slug: v.slug, label: v.label, channel: v.channel, cur: EMPTY_TOTALS, prev: EMPTY_TOTALS, campaigns: [] }))
  const f = t ? funnel(t.cur, cov.cur ? a.cur.orders : null, cov.cur ? a.cur.delivered : null) : null
  // Only the shop's own product pages compete for slowest (a forged slow id must not hide the real one: tenancy audit).
  const slow = t && names ? slowestPage(t.productLcp.filter((r) => names.products.has(r.productId))) : null
  return (
    <>
      <PageHeader title="Analytics" actions={make} meta={metaLine(on && cov.since && cov.since > a.start ? cov.since : null)} />
      {tabs}
      <Summary a={a} />
      <Strip a={a} visits={on && !failed ? { cur: t?.cur ?? emptyTotals(), prev: t?.prev ?? emptyTotals(), since: cov.since, rates, prevRates, fullFrom: cov.fullFrom } : undefined} />
      {!on ? null : failed ? <VisitsUnavailable /> : !t?.firstDay ? <NoVisitsYet /> : !enough ? <TooFewVisits visits={t.cur.visitors} /> : f ? <Funnel steps={f.steps} drop={f.drop} fullFrom={cov.fullFrom} /> : null}
      {a.cur.orders > 0 && a.known / a.cur.orders < 0.5 ? (
        <p className="rounded-md bg-info px-3 py-2 text-sm text-info-text">Most orders came without a source. A link from Make a link tells an Instagram bio from a WhatsApp broadcast.</p>
      ) : null}
      <Sources a={on && !failed ? { ...a, sources: [...a.sources, ...extra] } : a} period={period} visits={on && !failed ? { by, rates } : undefined} />
      {t && names && enough ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Browse shares={browserShares(t.browsers)} devices={t.cur} />
            <Cities shares={cityShares(t.cities)} returns={names.cityReturns} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Products lines={productLines(t.products, names.products)} />
            <SpeedOnPhones s={speedOf(t.vitals)} slowest={slow && names.products.get(slow.productId) ? { title: names.products.get(slow.productId)!.title, lcpMs: slow.lcpMs } : null} />
          </div>
        </>
      ) : null}
      <Pincodes a={a} />
    </>
  )
}
