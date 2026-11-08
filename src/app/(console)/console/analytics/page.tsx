import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dayMonthIN } from '@/lib/format-date'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { PERIODS, analyticsFor, isPeriod, linkTargets, type Period } from '@/lib/queries/analytics'
import { shopWithSettings } from '@/lib/queries/settings'
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
// =============================================================================

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const asked = Number((await searchParams).period ?? 30)
  const period: Period = isPeriod(asked) ? asked : 30
  const now = new Date()
  const { tenantId, role } = auth.membership
  const [a, targets, shop] = await Promise.all([
    analyticsFor(tenantId, role, period, now), linkTargets(tenantId), shopWithSettings(tenantId),
  ]).catch((err) => { console.error('[analytics]', err instanceof Error ? err.name : 'error'); return [null, null, null] as const })
  if (!a || !targets || !shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>

  const open = shop.settings.publishedAt !== null
  const make = <MakeLink origin={`https://${shop.slug}.${SHOP_DOMAIN}`} open={open} products={targets.products} collections={targets.collections} />
  const dayBefore = new Date(a.start.getTime() - 86_400_000)
  const tabs = <ViewTabs label="Period" tabs={PERIODS.map((p) => ({ href: `/console/analytics?period=${p}`, label: `${p} days`, current: p === period }))} />
  const meta = `${dayMonthIN(a.start)} – today (so far), against ${dayMonthIN(a.prevStart)} – ${dayMonthIN(dayBefore)}. Orders by the day they were placed (IST); today's numbers still change.`

  if (a.cur.orders === 0 && a.prev.orders === 0) {
    return (
      <>
        <PageHeader title="Analytics" actions={make} />
        {tabs}
        <Panel title={`No orders in the last ${period} days`}>Share your shop with a link that says where it was shared, and orders from it show here.</Panel>
      </>
    )
  }
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
