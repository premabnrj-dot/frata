import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Figure } from '@/components/charts/figure'
import { ShareBar } from '@/components/charts/share-bar'
import { change, type Change as Ch } from '@/domains/analytics/kit'
import { InfoTip } from '@/components/ui/info-tip'
import { judgeable } from '@/domains/analytics/judge'
import { paise } from '@/domains/money/paise'
import { keptPerOrder, type Kept } from '@/domains/orders/kept'
import { formatCount, formatPercent } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import { EMPTY_TOTALS, foldSources } from '@/domains/analytics/totals'
import type { Analytics, Totals } from '@/lib/queries/analytics'
import { K_MIN, otherVisits, perHundred, type SourceVisits, type TrafficTotals } from '@/domains/analytics/traffic'
import { HOW_VISITS } from './traffic'

// =============================================================================
// ANALYTICS · THE PAGE'S PARTS (A·1, redrawn as Neel N1b's mockup docs/mockups/2026-11-15-analytics-n1b/, as approved).
// Server components: ₹ kept is computed and sent only for a viewer who sees costs (seesCosts). Where orders came from is
// ONE table as drawn (Source · Orders ↓ · Share · Came back · ₹ kept an order · Change); with visits counted (A·2) it
// gains Visits and Orders per 100 visits. On a phone, each source is a two-line row. Under 30, counts ("3 of 24").
// =============================================================================

const outcomes = (t: Totals) => t.delivered + t.rto + t.lost
/** A share, or a count under 30: "18%" or "3 of 24". */
export const shareOf = (n: number, of: number) => (judgeable(of) ? formatPercent(of ? n / of : 0, 0) : `${n} of ${of}`)
const toneText = (c: Ch | null) => (c?.tone === 'good' ? 'text-ok-text' : c?.tone === 'bad' ? 'text-danger-text' : 'text-muted-foreground')

/** What ₹ kept leaves out, in one short line under its figure (as drawn: "Before shipping costs"). */
export function KeptNote({ k, estimate }: { k: Kept; estimate: boolean }) {
  if (k.leftOut) return <><Numeric>{k.leftOut}</Numeric> left out · <Link href="/console/products" className="underline">add costs</Link></>
  if (k.basis === 'none' || !estimate) return <>Before shipping costs</>
  if (k.basis === 'estimate') return <>Shipping estimated</>
  return null
}

export type VisitTotals = { cur: TrafficTotals; prev: TrafficTotals; since: Date | null; rates: boolean; prevRates: boolean }

/** Visits (A·2) as two figures at the head of From visit to order: visits, and orders per 100 visits over a window
 * visits fully cover. Visits compare whole days only, so a window that runs to now today shows no change. */
export function VisitFigures({ a, visits }: { a: Analytics; visits: VisitTotals }) {
  const w = a.window
  const v = visits.cur.visitors
  const rate = visits.rates ? perHundred(a.cur.orders, v, 1, 2) : null
  const before = visits.prevRates ? perHundred(a.prev.orders, visits.prev.visitors, 1, 2) : null
  const comparable = visits.prevRates && !(w.toNow && w.days === 1)
  const since = visits.since && visits.since > w.start ? `Counting since ${dayMonthIN(visits.since)}` : undefined
  return (
    <section aria-label="Visits" className="grid grid-cols-2 gap-2 md:gap-3">
      <Figure label={<span className="inline-flex items-center gap-1">Visits<InfoTip about="how visits are counted">{HOW_VISITS}</InfoTip></span>}
        value={v ? <Numeric>{formatCount(v)}</Numeric> : '—'}
        change={comparable ? change(v, visits.prev.visitors, { kind: 'count', good: 'up' }) : null} note={since} />
      <Figure label="Orders per 100 visits" value={rate === null ? '—' : rate.toFixed(2)}
        change={comparable && rate !== null && before !== null ? change(rate, before, { kind: 'count', good: 'up' }) : null} />
    </section>
  )
}

const HOW = 'A source is the tagged link the shopper arrived on, else the site they came from, else "Direct or unknown" (WhatsApp chats and many apps hide where a tap came from: a link from Make a link fixes that). The last one before the order, in that browser tab. Anyone can type tags into an address, so a source is what the link said. Visits and orders use the same rule.'

type Row = { key: string; cur: Totals; prev: Totals | null; name: string; href: string | null; sub: string; visitors: number | null }

/** Where orders came from, as drawn, most orders first. `visits` adds Visits and Orders per 100 visits (A·2). */
export function Sources({ a, pq, visits }: { a: Analytics; pq: string; visits?: { by: ReadonlyMap<string, SourceVisits>; rates: boolean } }) {
  const { rows, other } = foldSources(a.sources)
  const rest = visits ? otherVisits(visits.by, new Set(rows.map((r) => r.slug))) : 0
  const list: Row[] = rows.map((s) => ({
    key: s.slug, cur: s.cur, prev: s.prev, name: s.label,
    // A source with visits but no orders has no page of its own (its orders list would be empty: a 404).
    href: s.cur.orders ? `/console/analytics/${encodeURIComponent(s.slug)}?${pq}` : null,
    sub: s.campaigns.length ? `${s.campaigns[0]!.name}${s.campaigns.length > 1 ? ` and ${s.campaigns.length - 1} more` : ''}` : '',
    visitors: visits ? visits.by.get(s.slug)?.visitors ?? 0 : null,
  }))
  if (other || rest) list.push({ key: 'other', cur: other ?? EMPTY_TOTALS, prev: null, name: 'Other', href: null, sub: 'sources with few orders, and tags typed by hand', visitors: visits ? rest : null })
  if (!list.length) return null
  const top = Math.max(1, ...list.map((r) => r.cur.orders))
  const kept = (t: Totals) => {
    const k = t.kept, per = k ? keptPerOrder(k) : null
    return k && per !== null ? (judgeable(k.counted) ? <Money paise={paise(per)} /> : 'too few') : '—'
  }
  const back = (t: Totals) => { const o = outcomes(t); return o ? shareOf(t.rto, o) : '—' }
  const bad = (t: Totals) => { const o = outcomes(t); return judgeable(o) && t.rto / o >= 0.2 }
  const ch = (r: Row) => (r.prev && (r.prev.orders || r.cur.orders) ? change(r.cur.orders, r.prev.orders, { kind: 'count', good: 'up' }) : null)
  const rate = (r: Row) => (visits?.rates && r.visitors ? perHundred(r.cur.orders, r.visitors) : null)
  return (
    <Section id="sources" flush title={<span className="inline-flex items-center gap-1">Where orders came from<InfoTip about="how a source is decided">{HOW}</InfoTip></span>}
      action={a.cur.orders ? <span className="text-label text-muted-foreground">Source known for {formatPercent(a.known / a.cur.orders, 0)}</span> : undefined}>
      <div className="max-md:hidden">
        <DataTable label="Where orders came from">
          <DataTableHead>
            <th>Source</th><th className="text-right whitespace-nowrap" aria-sort="descending">Orders ↓</th><th>Share</th>
            {visits ? <><th className="text-right">Visits</th><th className="text-right">Orders per 100 visits</th></> : null}
            <th className="text-right">Came back</th>{a.costs ? <th className="text-right">₹ kept an order</th> : null}<th className="text-right">Change</th>
          </DataTableHead>
          <DataTableBody>
            {list.map((r) => {
              const c = ch(r), per = rate(r)
              return (
                <DataTableRow key={r.key} tall>
                  <Td>{r.href ? <Link href={r.href} data-row-link prefetch={false} className="font-medium hover:underline">{r.name}</Link> : <span className="font-medium text-muted-foreground">{r.name}</span>}
                    {r.sub ? <span className="block text-small text-muted-foreground">{r.sub}</span> : null}</Td>
                  <Td className="text-right"><Numeric>{r.cur.orders}</Numeric></Td>
                  <Td className="w-[20%]"><ShareBar share={r.cur.orders / top} tone={r.href ? 'chart' : 'muted'} /></Td>
                  {visits ? <>
                    <Td className="text-right">{r.visitors !== null && r.visitors >= K_MIN ? <Numeric>{formatCount(r.visitors)}</Numeric> : '—'}</Td>
                    <Td className="text-right">{per === null ? '—' : per.toFixed(1)}</Td>
                  </> : null}
                  <Td className={`text-right ${bad(r.cur) ? 'text-danger-text' : ''}`}>{back(r.cur)}</Td>
                  {a.costs ? <Td className="text-right">{kept(r.cur)}</Td> : null}
                  <Td className={`text-right whitespace-nowrap ${toneText(c)}`}>{c?.words ?? '—'}</Td>
                </DataTableRow>
              )
            })}
          </DataTableBody>
        </DataTable>
      </div>
      {/* A phone, as drawn: the name and its orders; the share and its change; came back and ₹ kept an order. */}
      <ul className="md:hidden" aria-label="Where orders came from">
        {list.map((r) => {
          const c = ch(r)
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate font-medium">{r.name}</span><Numeric className="font-medium">{r.cur.orders}</Numeric></span>
              <span className="flex items-center gap-3"><ShareBar share={r.cur.orders / top} tone={r.href ? 'chart' : 'muted'} className="flex-1" /><span className={`text-small ${toneText(c)}`}>{c?.words ?? '—'}</span></span>
              <span className={`text-small ${bad(r.cur) ? 'text-danger-text' : 'text-muted-foreground'}`}>{back(r.cur)} came back{a.costs && r.cur.kept && judgeable(r.cur.kept.counted) && keptPerOrder(r.cur.kept) !== null ? <> · {kept(r.cur)} kept an order</> : null}</span>
            </>
          )
          return (
            <li key={r.key} className="border-t border-line-soft">
              {r.href ? <Link href={r.href} prefetch={false} className="flex flex-col gap-1.5 px-4 py-3">{body}</Link> : <div className="flex flex-col gap-1.5 px-4 py-3">{body}</div>}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** Pincodes with the most returns, as drawn: counts, a share from 30, a bar in the bad colour (no ₹: True Profit's). */
export function Pincodes({ a }: { a: Analytics }) {
  if (!a.pincodes.length) return null
  return (
    <Section id="pincodes" flush title="Pincodes with the most returns">
      <DataTable label="Pincodes with the most returns">
        <DataTableHead><th>Pincode</th><th className="text-right">Came back</th><th className="w-[45%]">Of orders with an outcome</th></DataTableHead>
        <DataTableBody>
          {a.pincodes.map((p) => (
            <DataTableRow key={p.pincode}>
              <Td cell="a"><Numeric>{p.pincode}</Numeric></Td>
              <Td cell="b" className="text-right">{p.rto} of {p.outcomes}</Td>
              <Td cell="c"><ShareBar share={p.outcomes ? p.rto / p.outcomes : 0} tone="bad" /></Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}
