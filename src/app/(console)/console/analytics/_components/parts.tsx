import Link from 'next/link'
import { Section } from '@/components/layout/section'
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

const HOW = 'A source is the tagged link a shopper came on. Without a tag, it is the site they came from. Without either, it is "Direct or unknown". WhatsApp and many apps hide this. Make a link fixes that. The last source before the order counts. Visits and orders use the same rule.'

type Row = { key: string; muted?: boolean; cur: Totals; prev: Totals | null; name: string; href: string | null; sub: string; visitors: number | null }

/** Where orders came from, as drawn, most orders first. `visits` adds Visits and Orders per 100 visits (A·2). */
export function Sources({ a, pq, visits }: { a: Analytics; pq: string; visits?: { by: ReadonlyMap<string, SourceVisits>; rates: boolean } }) {
  const { rows, other } = foldSources(a.sources)
  const rest = visits ? otherVisits(visits.by, new Set(rows.map((r) => r.slug))) : 0
  // As drawn: Direct or unknown sits last and muted, whatever its count (it is what no link told us).
  const ordered = [...rows.filter((r) => r.channel !== 'direct'), ...rows.filter((r) => r.channel === 'direct')]
  const list: Row[] = ordered.map((s) => ({
    key: s.slug, muted: s.channel === 'direct', cur: s.cur, prev: s.prev, name: s.label,
    // A source with visits but no orders has no page of its own (its orders list would be empty: a 404).
    href: s.cur.orders ? `/console/analytics/${encodeURIComponent(s.slug)}?${pq}` : null,
    sub: s.campaigns.length ? `${s.campaigns[0]!.name}${s.campaigns.length > 1 ? ` and ${s.campaigns.length - 1} more` : ''}` : '',
    visitors: visits ? visits.by.get(s.slug)?.visitors ?? 0 : null,
  }))
  if (other || rest) list.push({ key: 'other', muted: true, cur: other ?? EMPTY_TOTALS, prev: null, name: 'Other', href: null, sub: 'sources with few orders, and tags typed by hand', visitors: visits ? rest : null })
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
    <Section id="sources" flush flatOnPhone title={<span className="inline-flex items-center gap-1">Where orders came from<InfoTip about="how a source is decided">{HOW}</InfoTip></span>}
      action={a.cur.orders ? <span className="text-label text-muted-foreground">Source known for {formatPercent(a.known / a.cur.orders, 0)}</span> : undefined}>
      <div className="px-5 pb-4 max-md:hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Where orders came from</caption>
          <thead><tr className="text-label text-muted-foreground [&>th]:py-2 [&>th]:pl-4 [&>th]:align-bottom [&>th]:font-medium [&>th:first-child]:pl-0">
            <th scope="col" className="text-left">Source</th><th scope="col" className="text-right whitespace-nowrap" aria-sort="descending">Orders ↓</th><th scope="col" className="pl-6 text-left">Share</th>
            {visits ? <><th scope="col" className="text-right">Visits</th><th scope="col" className="text-right">Orders per 100 visits</th></> : null}
            <th scope="col" className="text-right">Came back</th>{a.costs ? <th scope="col" className="text-right">₹ kept an order</th> : null}<th scope="col" className="text-right">Change</th>
          </tr></thead>
          <tbody>
            {list.map((r) => {
              const c = ch(r), per = rate(r)
              return (
                <tr key={r.key} className={`border-t border-line-soft [&>td]:py-2.5 [&>td]:pl-4 ${r.muted ? 'text-muted-foreground' : ''}`}>
                  <th scope="row" className="text-left font-normal">
                    {r.href && !r.muted ? <Link href={r.href} prefetch={false} className="text-link underline underline-offset-2">{r.name}</Link> : r.name}
                    {r.sub ? <span className="block text-small text-muted-foreground">{r.sub}</span> : null}</th>
                  <td className="text-right"><Numeric>{r.cur.orders}</Numeric></td>
                  <td className="w-[22%] pl-6"><ShareBar share={r.cur.orders / top} tone={r.muted ? 'muted' : 'chart'} /></td>
                  {visits ? <>
                    <td className="text-right">{r.visitors !== null && r.visitors >= K_MIN ? <Numeric>{formatCount(r.visitors)}</Numeric> : '—'}</td>
                    <td className="text-right">{per === null ? '—' : per.toFixed(1)}</td>
                  </> : null}
                  <td className={`text-right ${bad(r.cur) ? 'text-danger-text' : ''}`}>{back(r.cur)}</td>
                  {a.costs ? <td className="text-right">{kept(r.cur)}</td> : null}
                  <td className={`pl-4 text-right whitespace-nowrap ${r.muted ? 'text-muted-foreground' : toneText(c)}`}>{c?.words ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* A phone, as drawn: the name and its orders; the share and its change; came back and ₹ kept an order. */}
      <ul className="md:hidden" aria-label="Where orders came from">
        {list.map((r) => {
          const c = ch(r)
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3"><span className={`min-w-0 truncate font-medium ${r.muted ? 'text-muted-foreground' : ''}`}>{r.name}</span><Numeric className="font-medium">{r.cur.orders}</Numeric></span>
              <span className="flex items-center gap-3"><ShareBar share={r.cur.orders / top} tone={r.muted ? 'muted' : 'chart'} className="flex-1" /><span className={`text-small ${r.muted ? 'text-muted-foreground' : toneText(c)}`}>{c?.words ?? '—'}</span></span>
              {outcomes(r.cur) ? <span className={`text-small ${bad(r.cur) ? 'text-danger-text' : 'text-muted-foreground'}`}>{back(r.cur)} came back{a.costs && r.cur.kept && judgeable(r.cur.kept.counted) && keptPerOrder(r.cur.kept) !== null ? <> · {kept(r.cur)} kept an order</> : null}</span> : null}
            </>
          )
          return (
            <li key={r.key} className="border-t border-line-soft">
              {r.href && !r.muted ? <Link href={r.href} prefetch={false} className="flex flex-col gap-1.5 px-4 py-3">{body}</Link> : <div className="flex flex-col gap-1.5 px-4 py-3">{body}</div>}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** PIN codes with the most returns, as drawn: counts, a bar in the bad colour (no ₹: True Profit's). */
export function Pincodes({ a }: { a: Analytics }) {
  if (!a.pincodes.length) return null
  return (
    <Section id="pincodes" title="PIN codes with the most returns" flatOnPhone>
      <table className="w-full text-sm">
        <caption className="sr-only">PIN codes with the most returns</caption>
        <thead><tr className="text-label text-muted-foreground [&>th]:py-2 [&>th]:font-medium"><th scope="col" className="text-left">PIN code</th><th scope="col" className="text-right">Came back</th><th scope="col" className="w-[45%] pl-6 text-left">Of orders with an outcome</th></tr></thead>
        <tbody>
          {a.pincodes.map((p) => (
            <tr key={p.pincode} className="border-t border-line-soft [&>*]:py-2.5">
              <th scope="row" className="text-left font-normal"><Numeric>{p.pincode}</Numeric></th>
              <td className="text-right whitespace-nowrap">{p.rto} of {p.outcomes}</td>
              <td className="pl-6"><ShareBar share={p.outcomes ? p.rto / p.outcomes : 0} tone="bad" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
