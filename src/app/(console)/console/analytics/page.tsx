import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dayMonthIN } from '@/lib/format-date'
import { PRESETS, type Preset } from '@/domains/analytics/link'
import { classifierNotice, classifySource } from '@/domains/analytics/source'
import { analyticsPage, type SourceStat } from '@/lib/queries/analytics'
import { compareWords, parsePeriod, periodQuery, windowFor } from '@/domains/analytics/period'
import { istDayKey } from '@/domains/time/day'
import { PeriodPicker } from '@/components/charts/period-picker'
import { trafficNames, trafficRead } from '@/lib/queries/traffic'
import { browserShares, cityShares, coverage, enoughVisits, funnel, productLines, slowestPage, speedOf, visitOnly, visitsBySource, type SourceVisits } from '@/domains/analytics/traffic'
import { EMPTY_TOTALS } from '@/domains/analytics/totals'
import { errName } from '@/lib/log'
import { urlProblem } from '@/lib/db/url'
import { Browse, Cities, Funnel, NoVisitsYet, Products, SpeedOnPhones, TooFewVisits, VisitsUnavailable } from './_components/traffic'
import { readFailed } from './_components/read-failed'
import { MakeLink } from './_components/make-link'
import { KeptNote, Pincodes, Sources, VisitFigures } from './_components/parts'
import { ByState, ComeBack, Figures, FlowLine, PaidAndCod, SalesByDay, TooFew, WhenOrdersCome } from './_components/charts'
import { JUDGE_MIN } from '@/domains/analytics/judge'

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

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  // One window for every read (src/domains/analytics/period.ts): orders, visits and the charts.
  const w = windowFor(parsePeriod(await searchParams, now), now)
  const pq = periodQuery(w.choice)
  const compare = compareWords(w)
  const { tenantId, role } = auth.membership
  // One snapshot transaction: the numbers, Make a link's targets and the shop's address (speed review A1·7). Visits
  // (A·2) come from the analytics database beside it, never inside it: if that read fails, the orders still show.
  // The shop's own words for what visits carry (labels, product names, returns by city) follow the visits, as their
  // product ids decide which names are asked for — chained to that read, so both run beside A·1's (speed review M1). A
  // failure of either makes the visits unavailable (below); the orders still show.
  const visitsAndNames = trafficRead(tenantId, w)
    .catch((err: unknown) => { console.error('[analytics] visits', errName(err), urlProblem(err)); return 'failed' as const })
    .then(async (r) => {
      if (typeof r !== 'object') return { read: r, names: null }
      const names = await trafficNames(tenantId, [...r.products.map((p) => p.productId), ...r.productLcp.map((p) => p.productId)], w)
        .catch((err: unknown) => { console.error('[analytics] visit names', errName(err)); return null })
      return { read: r, names }
    })
  const [page, { read, names }] = await Promise.all([
    analyticsPage(tenantId, role, w, now).catch((err: unknown) => readFailed('[analytics]', err)),
    visitsAndNames,
  ])
  if ('failed' in page) return page.failed
  const { a, targets, shop, series } = page
  const traffic = typeof read === 'object' ? read : null

  // What each preset's orders show as, said by the server (the classifier stays out of the browser bundle).
  const showsAs = Object.fromEntries((Object.keys(PRESETS) as Preset[]).map((k) => [k, classifySource({ utm_source: PRESETS[k].source, utm_medium: PRESETS[k].medium }, null).label])) as Record<Preset, string>
  const make = <MakeLink origin={`https://${shop.host ?? ''}`} open={shop.open && !!shop.slug} products={targets.products} collections={targets.collections} showsAs={showsAs} />
  // The dates stay in the line, as drawn (design language 61); on a phone what they are against joins them.
  const lastDay = new Date(w.end.getTime() - 1)
  const range = `${dayMonthIN(a.window.start)} – ${dayMonthIN(lastDay)}${w.toNow ? ' (today so far)' : ''}`
  const metaLine = () => <>{range}<span className="max-md:hidden"> · India time</span><span className="md:hidden">, {w.toNow && w.days === 1 ? compare : `vs the ${w.days} days before`}</span></>
  const picker = <PeriodPicker path="/console/analytics" choice={w.choice} compare={compare} today={istDayKey(now)} />
  const actions = <>{picker}{make}</>

  if (a.cur.orders === 0 && a.prev.orders === 0 && !traffic?.cur.visitors) {
    return (
      <>
        <PageHeader title="Analytics" wideActions actions={actions} meta={metaLine()} />
        <Panel title="No orders in these days">Share your store with a link from Make a link. Orders from it show here.</Panel>
      </>
    )
  }
  // Visits (A·2, as the mockup): off (A·1 as it was), unavailable (the analytics read or the names failed: creator
  // labels would be lost otherwise), none yet, the first days (under 1,000), or ready. Rates of orders per visit only
  // over a window visits fully cover (coverage).
  const on = read !== 'off'
  const failed = read === 'failed' || (!!traffic && !names)
  const t = failed ? null : traffic
  const cov = coverage(t?.firstDay ?? null, a.window.start, a.window.prevStart, w.days)
  const enough = !!t && enoughVisits(t.cur.visitors)
  const rates = enough && cov.cur
  const prevRates = cov.prev && !!t && enoughVisits(t.prev.visitors)
  const by = t && names ? visitsBySource(t.sources, names.labels, a.site) : new Map<string, SourceVisits>()
  // A source with visits but no orders in the window is a row too (from 5 visitors), after the ones with orders.
  const extra: SourceStat[] = visitOnly(by, new Set(a.sources.map((x) => x.slug)))
    .map((v) => ({ slug: v.slug, label: v.label, channel: v.channel, cur: EMPTY_TOTALS, prev: EMPTY_TOTALS, campaigns: [] }))
  const f = t ? funnel(t.cur, cov.cur ? a.cur.orders : null, cov.cur ? a.cur.delivered : null) : null
  // Only the shop's own product pages compete for slowest (a forged slow id must not hide the real one: tenancy audit).
  const slow = t && names ? slowestPage(t.productLcp.filter((r) => names.products.has(r.productId))) : null
  const visitsOn = on && !failed
  return (
    <>
      <PageHeader title="Analytics" wideActions actions={actions} meta={metaLine()} />
      {/* One column; on a phone the sections come in the drawn order (trend, sources, paid/COD, when, state, cohort). */}
      <div className="flex flex-col gap-6">
        {a.cur.orders < JUDGE_MIN ? <TooFew n={a.cur.orders} /> : null}
        <Figures a={a} compare={compare} series={series} keptNote={a.cur.kept ? <KeptNote k={a.cur.kept} estimate={a.estimate} /> : undefined} />
        <div className="max-md:hidden"><FlowLine c={a.cur} /></div>
        {series ? <SalesByDay s={series} compareName={compare.replace(/^vs /, '').replace(/^(.)/, (m) => m.toUpperCase())} /> : null}
        {series ? <div className="grid gap-4 max-md:order-2 lg:grid-cols-2"><PaidAndCod s={series} /><WhenOrdersCome s={series} /></div> : null}
        {a.cur.orders > 0 && a.known / a.cur.orders < 0.5 ? (
          <p className="rounded-md bg-info px-3 py-2 text-sm text-info-text max-md:order-1">Most orders came without a source. A link from Make a link tells an Instagram bio from a WhatsApp broadcast.</p>
        ) : null}
        <div className="max-md:order-1"><Sources a={visitsOn ? { ...a, sources: [...a.sources, ...extra] } : a} pq={pq} visits={visitsOn ? { by, rates } : undefined} renamed={classifierNotice(now)} /></div>
        {series ? <div className="grid gap-4 max-md:order-3 lg:grid-cols-2"><ByState s={series} /><ComeBack s={series} /></div> : null}
        <div className="flex flex-col gap-6 max-md:order-4">
          {visitsOn && t?.firstDay ? <VisitFigures a={a} visits={{ cur: t.cur, prev: t.prev, since: cov.since, rates, prevRates }} /> : null}
          {!on ? null : failed ? <VisitsUnavailable /> : !t?.firstDay ? <NoVisitsYet /> : !enough ? <TooFewVisits visits={t.cur.visitors} /> : f ? <Funnel steps={f.steps} drop={f.drop} fullFrom={cov.fullFrom} /> : null}
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
        </div>
      </div>
    </>
  )
}
