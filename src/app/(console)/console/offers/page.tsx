import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { OFFER_STATUSES, type OfferStatus } from '@/domains/checkout/offer-status'
import { paise } from '@/domains/money/paise'
import { ANY_MEMBER, CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { listOffers, offerStats } from '@/lib/queries/discounts'
import { STATUS, terms } from './_components/data'
import { keptNote, OfferStrip } from './_components/offer-results'

export const metadata = { title: 'Offers' }

// OFFERS (spec § Console; mockup "The founder's side"): by status, each with its uses, ₹ given, and — the point —
// ₹ kept per delivered order; above them, the 30-day strip (O·3). Status, uses and money are derived (lib/queries/discounts.ts).
export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  const [rows, stats] = await Promise.all([listOffers(auth.membership.tenantId, now), offerStats(auth.membership.tenantId, now, { role: auth.membership.role })])
    .catch((err) => { console.error('[offers]', err instanceof Error ? err.name : err); return [null, null] as const })
  if (!rows || !stats) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const tab = ((await searchParams).tab ?? 'live') as OfferStatus
  const current = (OFFER_STATUSES as readonly string[]).includes(tab) ? tab : 'live'
  const count = (s: OfferStatus) => rows.filter((r) => r.status === s).length
  const shown = rows.filter((r) => r.status === current)
  const canBuild = (CAN_BUILD as readonly string[]).includes(auth.membership.role)
  // ₹ kept is a profit: who sees it is seesCosts, read with the stats (owners and admins; a partner before handover).
  const costs = stats.costs
  const add = canBuild ? <Link href="/console/offers/new" className={button()}>New offer</Link> : undefined
  if (!rows.length) return (
    <>
      <PageHeader title="Offers" actions={add} />
      <Panel title="No offers yet">Run a festive sale, give a saving for paying online, or free shipping above a bag value. Shoppers see the best offer applied for them, and you see what each one kept on delivered orders.
        {canBuild ? <div className="mt-3"><Link href="/console/offers/new?style=pay_online" className={button({ variant: 'secondary' })}>Start with “Pay online, save”</Link></div> : null}</Panel>
    </>
  )
  // Stopped (by Frrata, O·4) shows only when there is one.
  const order: OfferStatus[] = ['live', 'scheduled', 'draft', 'paused', ...(count('stopped') ? ['stopped' as const] : []), 'ended']
  return (
    <>
      <PageHeader title="Offers" actions={add} />
      <OfferStrip s={stats} />
      <ViewTabs label="Offers by status" tabs={order.map((s) => ({ href: `/console/offers?tab=${s}`, label: STATUS[s].label, count: count(s), current: s === current }))} />
      {!shown.length ? <Panel title={`No ${STATUS[current].label.toLowerCase()} offers`}>{current === 'live' ? 'Start a draft, or make a new offer.' : 'Nothing here right now.'}</Panel> : (
        <DataTable>
          <DataTableHead><th>Offer</th><th>How</th><th className="text-right">Uses</th><th className="text-right">₹ given</th><th className="text-right">Delivered · 30 days</th>{costs ? <th className="text-right">₹ kept per order, after returns · 30 days</th> : null}</DataTableHead>
          <DataTableBody>
            {shown.map((r) => { const x = stats.offers.get(r.id); return (
              <DataTableRow key={r.id}>
                <Td cell="a"><Link href={`/console/offers/${r.id}`} data-row-link prefetch={false} className="font-medium hover:underline">{r.title}</Link>
                  <span className="block text-xs text-muted-foreground">{terms(r)}{r.announce ? ' · in the bar' : ''}</span></Td>
                <Td cell="d">{r.code ? <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs">{r.code}</span> : <Badge tone="neutral">Automatic</Badge>}</Td>
                <Td cell="b" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Uses </span><Numeric>{r.useCount}</Numeric>{r.limitTotal ? <span className="text-muted-foreground"> / {r.limitTotal}</span> : null}</Td>
                <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Given </span><Money paise={paise(r.given)} /></Td>
                <Td cell="e" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Delivered </span><Numeric>{x?.delivered ?? 0}</Numeric></Td>
                {costs ? <Td cell="f" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Kept each </span>{x?.keptPerOrder == null ? <span className="text-muted-foreground" title="Shows once orders with this offer are delivered or come back, and their costs are known">—</span> : <><Money paise={paise(x.keptPerOrder)} />{keptNote(x.keptBasis) ? <span className="block text-xs text-muted-foreground">{keptNote(x.keptBasis)}</span> : null}</>}</Td> : null}
              </DataTableRow>
            ) })}
          </DataTableBody>
        </DataTable>
      )}
    </>
  )
}
