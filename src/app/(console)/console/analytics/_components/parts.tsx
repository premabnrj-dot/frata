import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Pictogram } from '@/components/brand/pictogram'
import { ShareBar } from '@/components/charts/share-bar'
import { change } from '@/domains/analytics/kit'
import { InfoTip } from '@/components/ui/info-tip'
import { JUDGE_MIN, judgeable } from '@/domains/analytics/judge'
import { paise } from '@/domains/money/paise'
import { keptPerOrder, type Kept } from '@/domains/orders/kept'
import { formatCount, formatPercent } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import { foldSources } from '@/domains/analytics/totals'
import type { Analytics, Totals } from '@/lib/queries/analytics'
import { K_MIN, otherVisits, perHundred, type SourceVisits, type TrafficTotals } from '@/domains/analytics/traffic'
import { EMPTY_TOTALS } from '@/domains/analytics/totals'
import { HOW_VISITS, visitChange } from './traffic'

// =============================================================================
// ANALYTICS · THE PAGE'S PARTS (A·1; mockup https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt, as drawn, with Ship
// S·0's words). Server components: ₹ kept is computed and sent only for a viewer who sees costs (seesCosts). One
// question first (₹ kept after returns), then the flow of orders, four numbers, where orders came from, and returns
// by pincode. Under 30, counts ("3 of 24 came back"), never a rate; every rate names what it is a share of.
// =============================================================================

const outcomes = (t: Totals) => t.delivered + t.rto + t.lost
/** A share, or a count under 30: "18%" or "3 of 24". */
export const shareOf = (n: number, of: number) => (judgeable(of) ? formatPercent(of ? n / of : 0, 0) : `${n} of ${of}`)

/** The change from the period before: the kit's one rule (src/domains/analytics/kit.ts change), coloured by meaning. */
function Change({ now, before, money = false }: { now: number; before: number; money?: boolean }) {
  if (before === 0 && now === 0) return null
  const c = change(now, before, { kind: money ? 'money' : 'count', good: 'up' })
  return <span className={`text-xs ${c.tone === 'good' ? 'text-ok-text' : c.tone === 'bad' ? 'text-danger-text' : 'text-muted-foreground'}`}>{c.words}</span>
}

/** What ₹ kept counted and left out, in words, with the way to fix it. */
export function KeptNote({ k, estimate }: { k: Kept; estimate: boolean }) {
  const lines: React.ReactNode[] = []
  if (k.basis === 'estimate') lines.push('Shipping estimated')
  if (k.basis === 'none' || !estimate) lines.push(<>Before shipping costs · <Link href="/console/settings/shipping-costs" className="underline">set them</Link></>)
  if (k.leftOut) lines.push(<><Numeric>{k.leftOut}</Numeric> left out (costs not known yet) · <Link href="/console/products" className="underline">add costs</Link></>)
  return <p className="text-xs text-muted-foreground">Before ads and packaging{lines.map((l, i) => <span key={i}> · {l}</span>)}</p>
}

/** What the strip knows of visits (A·2): this window, the one before, the first counted day, and coverage: a rate of
 * orders per visit shows only over a window visits fully cover, with enough visits (traffic.ts coverage). */
export type StripVisits = { cur: TrafficTotals; prev: TrafficTotals; since: Date | null; rates: boolean; prevRates: boolean; fullFrom: Date | null }

/** Four numbers against the period before; under 30 orders, the tally and a count to go instead (rule 20a). With
 * visits counted (A·2), the four are visits, orders per 100 visits, orders and returns, as the mockup draws them. */
export function Strip({ a, visits }: { a: Analytics; visits?: StripVisits }) {
  const c = a.cur, p = a.prev
  if (visits) {
    const out = outcomes(c)
    const v = visits.cur.visitors
    const rate = visits.rates ? perHundred(c.orders, v, 1, 2) : null
    const before = visits.prevRates ? perHundred(p.orders, visits.prev.visitors, 1, 2) : null
    const tile = (k: React.ReactNode, val: React.ReactNode, d: React.ReactNode) => (
      <div className="grid min-w-0 gap-0.5 bg-card p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-num text-lg font-semibold tabular-nums">{val}</dd><dd>{d}</dd></div>
    )
    return (
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
        {tile(<span className="inline-flex items-center gap-1">Visits<InfoTip about="how visits are counted">{HOW_VISITS}</InfoTip></span>, v ? <Numeric>{formatCount(v)}</Numeric> : '—', visitChange(v, visits.prev.visitors, visits.since, a.start, visits.prevRates))}
        {tile('Orders per 100 visits', rate === null ? '—' : rate.toFixed(2),
          rate !== null && before !== null ? <span className="text-xs text-muted-foreground">from {before.toFixed(2)}</span>
            : rate === null && visits.since && visits.since > a.start ? <span className="text-xs text-muted-foreground">Counting since {dayMonthIN(visits.since)}</span> : null)}
        {tile('Orders', <Numeric>{c.orders}</Numeric>, <Change now={c.orders} before={p.orders} />)}
        {tile('Came back (RTO)', out ? shareOf(c.rto, out) : '—', <span className="text-xs text-muted-foreground">{out ? `of ${out} with an outcome` : 'none with an outcome yet'}</span>)}
      </dl>
    )
  }
  if (c.orders < JUDGE_MIN) {
    return (
      <Section>
        <div className="flex items-center gap-4">
          <Pictogram name="tally" size={48} className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm">Too few to judge: <Numeric>{c.orders}</Numeric> {c.orders === 1 ? 'order' : 'orders'} so far. Shares mean something from {JUDGE_MIN}.</p>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full origin-left rounded-full bg-foreground" style={{ transform: `scaleX(${Math.min(1, c.orders / JUDGE_MIN)})` }} /></div>
          </div>
        </div>
      </Section>
    )
  }
  const out = outcomes(c)
  const tile = (k: string, v: React.ReactNode, d: React.ReactNode) => (
    <div className="grid min-w-0 gap-0.5 bg-card p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-num text-lg font-semibold tabular-nums">{v}</dd><dd>{d}</dd></div>
  )
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
      {tile('Orders', <Numeric>{c.orders}</Numeric>, <Change now={c.orders} before={p.orders} />)}
      {tile('Sales', <Money paise={paise(c.sales)} />, <Change now={c.sales} before={p.sales} money />)}
      {tile('Came back (RTO)', out ? shareOf(c.rto, out) : '—', <span className="text-xs text-muted-foreground">{out ? `of ${out} with an outcome` : 'none with an outcome yet'}</span>)}
      {tile('Source known', formatPercent(c.orders ? a.known / c.orders : 0, 0), <span className="text-xs text-muted-foreground"><Numeric>{c.orders - a.known}</Numeric> came without one</span>)}
    </dl>
  )
}


const HOW = 'A source is the tagged link the shopper arrived on, else the site they came from, else "Direct or unknown" (WhatsApp chats and many apps hide where a tap came from: a link from Make a link fixes that). The last one before the order, in that browser tab. Anyone can type tags into an address, so a source is what the link said. Visits and orders use the same rule.'

/** Where orders came from: one row per source, most ₹ kept after returns first; on a phone, rows become cards. */
export function Sources({ a, pq, visits }: { a: Analytics; pq: string; visits?: { by: ReadonlyMap<string, SourceVisits>; rates: boolean } }) {
  if (visits) return <SourcesWithVisits a={a} pq={pq} visits={visits} />
  const { rows, other } = foldSources(a.sources)
  const top = Math.max(1, ...rows.map((r) => r.cur.orders), other?.orders ?? 0)
  // As drawn (Neel N1b): Source · Orders · Share · Came back · ₹ kept an order (who sees costs) · Change.
  const line = (t: Totals, before: Totals | null, name: React.ReactNode, href: string | null, sub: React.ReactNode) => {
    const out = outcomes(t)
    const k = t.kept
    const ch = before ? change(t.orders, before.orders, { kind: 'count', good: 'up' }) : null
    return (
      <>
        <Td cell="a">{href ? <Link href={href} data-row-link prefetch={false} className="font-medium hover:underline">{name}</Link> : <span className="font-medium text-muted-foreground">{name}</span>}
          {sub ? <span className="block text-xs text-muted-foreground">{sub}</span> : null}</Td>
        <Td cell="b" className="text-right"><Numeric>{t.orders}</Numeric></Td>
        <Td cell="hide" className="w-[22%]"><ShareBar share={t.orders / top} tone={href ? 'chart' : 'muted'} /></Td>
        <Td cell="c" className={`text-right ${out && judgeable(out) && t.rto / out >= 0.2 ? 'text-danger-text' : ''}`}><span className="text-xs text-muted-foreground md:hidden">Came back </span>{out ? shareOf(t.rto, out) : '—'}</Td>
        {a.costs ? <Td cell="e" className="text-right"><span className="text-xs text-muted-foreground md:hidden">₹ kept an order </span>{k && keptPerOrder(k) !== null ? (judgeable(k.counted) ? <Money paise={paise(keptPerOrder(k)!)} /> : <span className="text-xs text-muted-foreground">too few to judge</span>) : '—'}</Td> : null}
        <Td cell="d" className={`text-right ${ch?.tone === 'good' ? 'text-ok-text' : ch?.tone === 'bad' ? 'text-danger-text' : 'text-muted-foreground'}`}>{ch ? ch.words : '—'}</Td>
      </>
    )
  }
  return (
    <Section flush title={<span className="inline-flex items-center gap-1">Where orders came from<InfoTip about="how a source is decided">{HOW}</InfoTip></span>}
      action={a.cur.orders ? <span className="text-label text-muted-foreground">Source known for {formatPercent(a.known / a.cur.orders, 0)}</span> : undefined}>
      <DataTable label="Where orders came from">
        <DataTableHead>
          <th>Source</th><th className="text-right" aria-sort="descending">Orders</th><th>Share</th><th className="text-right">Came back</th>{a.costs ? <th className="text-right">₹ kept an order</th> : null}<th className="text-right">Change</th>
        </DataTableHead>
        <DataTableBody>
          {rows.map((s) => (
            <DataTableRow key={s.slug} tall>{line(s.cur, s.prev, s.label, `/console/analytics/${encodeURIComponent(s.slug)}?${pq}`,
              s.campaigns.length ? `${s.campaigns[0]!.name}${s.campaigns.length > 1 ? ` and ${s.campaigns.length - 1} more` : ''}` : '')}</DataTableRow>
          ))}
          {other ? <DataTableRow key="other">{line(other, null, 'Other', null, 'sources with few orders, and tags typed by hand')}</DataTableRow> : null}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}

/** Returns by pincode: counts, a share from 30 (no ₹: the cost of returns by pincode is True Profit's). */
export function Pincodes({ a }: { a: Analytics }) {
  if (!a.pincodes.length) return null
  return (
    <Section flush title="Returns by pincode">
      <DataTable label="Returns by pincode">
        <DataTableHead><th>Pincode</th><th className="text-right">Came back</th></DataTableHead>
        <DataTableBody>
          {a.pincodes.map((p) => (
            <DataTableRow key={p.pincode}><Td cell="a"><Numeric>{p.pincode}</Numeric></Td><Td cell="b" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Came back </span>{judgeable(p.outcomes) ? `${formatPercent(p.rto / p.outcomes, 0)} of ${p.outcomes}` : `${p.rto} of ${p.outcomes}`}</Td></DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}

/** Where orders came from, with visits (A·2, as the mockup): each source's ₹ kept (or orders), visits, orders per 100
 * visits, returns and ₹ kept per visit. A source with visits but no orders yet is a row too (from 5 visitors). */
function SourcesWithVisits({ a, pq, visits }: { a: Analytics; pq: string; visits: { by: ReadonlyMap<string, SourceVisits>; rates: boolean } }) {
  const { rows, other } = foldSources(a.sources)
  const rest = otherVisits(visits.by, new Set(rows.map((r) => r.slug)))
  const line = (t: Totals, v: number, name: React.ReactNode, href: string | null, sub: React.ReactNode) => {
    const out = outcomes(t)
    const k = t.kept
    // Rates only over a window visits fully cover (coverage); a row's own number needs its own 100 visits.
    const rate = visits.rates ? perHundred(t.orders, v) : null
    const perVisit = a.costs && k && k.counted && rate !== null ? Math.round(k.kept / v) : null
    // Fewer than 5 visitors is never shown as a number (k ≥ 5), on any row.
    const shown = v >= K_MIN
    return (
      <>
        <Td cell="a">{href ? <Link href={href} data-row-link prefetch={false} className="font-medium hover:underline">{name}</Link> : <span className="font-medium">{name}</span>}
          <span className="block text-xs text-muted-foreground">{sub}</span></Td>
        <Td cell="b" className="text-right">{a.costs && k && k.counted ? <Money paise={paise(k.kept)} /> : <><span className="text-xs text-muted-foreground md:hidden">Orders </span><Numeric>{t.orders}</Numeric></>}</Td>
        <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Visits </span>{shown ? <Numeric>{formatCount(v)}</Numeric> : '—'}</Td>
        <Td cell="d" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Per 100 </span>{rate === null ? (shown && visits.rates ? <span className="text-xs text-muted-foreground">too few</span> : '—') : rate.toFixed(1)}</Td>
        <Td cell="e" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Came back </span>{out ? shareOf(t.rto, out) : '—'}</Td>
        {a.costs ? <Td cell="f" className={`text-right ${perVisit !== null && perVisit < 0 ? 'text-danger-text' : ''}`}><span className="text-xs text-muted-foreground md:hidden">Per visit </span>{perVisit === null ? '—' : <Money paise={paise(perVisit)} />}</Td> : null}
      </>
    )
  }
  return (
    <Section flush title={<span className="inline-flex items-center gap-1">Where orders came from<InfoTip about="how a source is decided">{HOW}</InfoTip></span>}>
      <DataTable label="Where orders came from">
        <DataTableHead>
          <th>Source</th><th className="text-right">{a.costs ? '₹ kept after returns' : 'Orders'}</th><th className="text-right">Visits</th><th className="text-right">Orders per 100 visits</th>
          <th className="text-right">Came back</th>{a.costs ? <th className="text-right">₹ kept per visit</th> : null}
        </DataTableHead>
        <DataTableBody>
          {rows.map((s) => (
            // A source with visits but no orders has no page of its own (its orders list would be empty: a 404).
            <DataTableRow key={s.slug}>{line(s.cur, visits.by.get(s.slug)?.visitors ?? 0, s.label, s.cur.orders ? `/console/analytics/${encodeURIComponent(s.slug)}?${pq}` : null,
              s.campaigns.length ? `${s.campaigns[0]!.name}${s.campaigns.length > 1 ? ` and ${s.campaigns.length - 1} more` : ''}` : s.channel === 'direct' ? 'chats, typed address, apps that hide it' : '')}</DataTableRow>
          ))}
          {other || rest ? <DataTableRow key="other">{line(other ?? EMPTY_TOTALS, rest, 'Other', null, 'sources with few orders or visits, and tags typed by hand')}</DataTableRow> : null}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}
