import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Money, Numeric } from '@/components/data/numeric'
import { paise } from '@/domains/money/paise'
import { formatPercent } from '@/lib/format'
import { JUDGE_MIN as JUDGE_MIN_ORDERS } from '@/domains/analytics/judge'
import type { KeptBasis, OfferStat, OfferStats } from '@/lib/queries/discounts'
import { Pictogram } from '@/components/brand/pictogram'

// =============================================================================
// DID IT MAKE MONEY? (offers O·3; mockup "Did it make money?"). The 30-day strip on the Offers list and an offer's own
// numbers, both read from offerStats() (the one computation). Server components: a merchant's cost stays here, and
// ₹ kept (a profit, so a cost) shows only to whoever `seesCosts` (owners and admins; a partner before handover).
// =============================================================================

const share = (a: number, b: number) => (b > 0 ? formatPercent(a / b, 0) : '—')
const rtoRate = (o: { delivered: number; rto: number }) => share(o.rto, o.delivered + o.rto)
const rs = (p: number | null) => (p === null ? '—' : <Money paise={paise(p)} />)

/** How ₹ kept counted shipping (freight.ts): said beside the figure whenever it is not the courier's actual charge. */
export const keptNote = (b: KeptBasis) => (b === 'estimate' ? 'Shipping estimated' : b === 'none' ? 'Before shipping costs (returns count once they are set)' : null)

function Kpi({ k, v, f }: { k: string; v: React.ReactNode; f: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-num text-lg font-semibold">{v}</dd>
      <dd className="text-xs text-muted-foreground">{f}</dd>
    </div>
  )
}

/** The Offers list's strip: every order with an offer in the window, against the shop's orders without one. */
export function OfferStrip({ s }: { s: OfferStats }) {
  const a = s.all, w = s.without
  return (
    <Section title={`Last ${s.days} days`} id="strip">
      {a.orders < JUDGE_MIN_ORDERS ? <p className="text-sm text-muted-foreground">Too few orders with an offer to judge yet: <Numeric>{a.orders}</Numeric> of {JUDGE_MIN_ORDERS}.</p> : null}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi k="₹ given" v={<Money paise={paise(a.given)} />} f={<><Numeric>{a.orders}</Numeric> orders with an offer</>} />
        <Kpi k="Prepaid share" v={share(a.prepaid, a.orders)} f="of orders with an offer" />
        <Kpi k="Average order with an offer" v={rs(a.aov)} f={<>{rs(w.aov)} without</>} />
        <Kpi k="₹ given per delivered order" v={rs(a.givenPerDelivered)} f={<><Numeric>{a.delivered}</Numeric> delivered</>} />
      </dl>
    </Section>
  )
}

/** One offer's numbers over the window. Under 30 orders it says so before any number. */
export function OfferNumbers({ o, s, costs }: { o: OfferStat | undefined; s: OfferStats; costs: boolean }) {
  const x: OfferStat = o ?? { orders: 0, given: 0, aov: null, prepaid: 0, repeat: 0, fresh: 0, delivered: 0, rto: 0, keptPerOrder: null, keptBasis: null, keptLeftOut: 0, givenPerDelivered: null, creators: [] }
  const w = s.without
  return (
    <Section title={`Last ${s.days} days`} id="numbers">
      {/* Under the threshold the eight numbers would be noise (mostly zeros): one line, a picture and a count to go
          (visual changes, owner-approved 2026-11-08). */}
      {x.orders < JUDGE_MIN_ORDERS ? (
        <div className="flex items-center gap-4">
          <Pictogram name="tally" size={48} className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm">Too few to judge: <Numeric>{x.orders}</Numeric> {x.orders === 1 ? 'order' : 'orders'} so far. The numbers mean something from {JUDGE_MIN_ORDERS}.</p>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full origin-left rounded-full bg-foreground" style={{ transform: `scaleX(${x.orders / JUDGE_MIN_ORDERS})` }} /></div>
          </div>
        </div>
      ) : (
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Orders</dt><dd className="font-num text-lg"><Numeric>{x.orders}</Numeric></dd>
          <dd className="text-xs text-muted-foreground"><Numeric>{x.fresh}</Numeric> new · <Numeric>{x.repeat}</Numeric> repeat buyers</dd></div>
        <div><dt className="text-xs text-muted-foreground">₹ given</dt><dd className="font-num text-lg"><Money paise={paise(x.given)} /></dd>
          <dd className="text-xs text-muted-foreground">{rs(x.givenPerDelivered)} per delivered order</dd></div>
        <div><dt className="text-xs text-muted-foreground">Average order</dt><dd className="font-num text-lg">{rs(x.aov)}</dd>
          <dd className="text-xs text-muted-foreground">{rs(w.aov)} without an offer</dd></div>
        <div><dt className="text-xs text-muted-foreground">Prepaid</dt><dd className="font-num text-lg">{share(x.prepaid, x.orders)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Delivered</dt><dd className="font-num text-lg"><Numeric>{x.delivered}</Numeric></dd></div>
        <div><dt className="text-xs text-muted-foreground">Returned (RTO)</dt><dd className="font-num text-lg">{rtoRate(x)}</dd>
          <dd className="text-xs text-muted-foreground">{rtoRate(w)} without an offer</dd></div>
        {costs ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">₹ kept per order, after returns</dt><dd className="font-num text-lg">{rs(x.keptPerOrder)}</dd>
          <dd className="text-xs text-muted-foreground">Delivered, came back or lost · before ads and packaging{x.keptLeftOut ? ` · ${x.keptLeftOut} left out (cost of goods or courier charges not known yet)` : ''}</dd>
          {x.keptPerOrder === null ? <dd className="text-xs text-muted-foreground">Once orders are delivered or come back, and their costs are known.</dd>
            : keptNote(x.keptBasis) ? <dd className="text-xs text-muted-foreground">{keptNote(x.keptBasis)}{x.keptBasis === 'none' ? <> · <Link href="/console/settings/shipping-costs" className="underline">set shipping costs</Link></> : null}</dd> : null}</div> : null}
      </dl>
      )}
    </Section>
  )
}

/** A creator code's line on the offer page: what it brought in the window, and its leak alert. */
export const creatorLine = (c: OfferStat['creators'][number] | undefined) => c
  ? { orders: String(c.orders), delivered: String(c.delivered), rto: rtoRate(c), byLink: share(c.viaLink, c.orders), leak: c.leak?.text ?? null }
  : { orders: '0', delivered: '0', rto: '—', byLink: '—', leak: null }
