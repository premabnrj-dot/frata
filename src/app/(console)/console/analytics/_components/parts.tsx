import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Pictogram } from '@/components/brand/pictogram'
import { Icon } from '@/components/icons/icon'
import { InfoTip } from '@/components/ui/info-tip'
import { JUDGE_MIN, judgeable } from '@/domains/analytics/judge'
import { paise } from '@/domains/money/paise'
import { keptPerOrder, type Kept } from '@/domains/orders/kept'
import { formatPercent } from '@/lib/format'
import type { Analytics, SourceStat, Totals } from '@/lib/queries/analytics'

// =============================================================================
// ANALYTICS · THE PAGE'S PARTS (A·1; mockup https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt, as drawn, with Ship
// S·0's words). Server components: ₹ kept is computed and sent only for a viewer who sees costs (seesCosts). One
// question first (₹ kept after returns), then the flow of orders, four numbers, where orders came from, and returns
// by pincode. Under 30, counts ("3 of 24 came back"), never a rate; every rate names what it is a share of.
// =============================================================================

const outcomes = (t: Totals) => t.delivered + t.rto + t.lost
/** A share, or a count under 30: "18%" or "3 of 24". */
export const shareOf = (n: number, of: number) => (judgeable(of) ? formatPercent(of ? n / of : 0, 0) : `${n} of ${of}`)

/** The change from the period before, with its own words: "18% more than 349" / "from ₹1,09,300". */
function Change({ now, before, money = false }: { now: number; before: number; money?: boolean }) {
  if (before === 0 && now === 0) return null
  const up = now >= before
  const word = money ? <Money paise={paise(before)} /> : <Numeric>{before}</Numeric>
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <Icon name={up ? 'up' : 'down'} className="size-3.5" />
      <span className="text-muted-foreground">from {word}</span>
    </span>
  )
}

/** What ₹ kept counted and left out, in words, with the way to fix it. */
function KeptNote({ k, estimate }: { k: Kept; estimate: boolean }) {
  const lines: React.ReactNode[] = []
  if (k.basis === 'estimate') lines.push('Shipping estimated')
  if (k.basis === 'none' || !estimate) lines.push(<>Before shipping costs · <Link href="/console/settings/shipping-costs" className="underline">set them</Link></>)
  if (k.leftOut) lines.push(<><Numeric>{k.leftOut}</Numeric> left out (costs not known yet) · <Link href="/console/products" className="underline">add costs</Link></>)
  return <p className="text-xs text-muted-foreground">Before ads and packaging{lines.map((l, i) => <span key={i}> · {l}</span>)}</p>
}

/** The one question first: ₹ kept after returns (or, for a viewer without costs, the orders), then the flow. */
export function Summary({ a }: { a: Analytics }) {
  const c = a.cur, k = c.kept
  const out = outcomes(c)
  return (
    <Section>
      {a.costs && k ? (
        k.counted > 0 ? (
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">₹ kept after returns</span>
            <Money paise={paise(k.kept)} className="text-2xl font-semibold" />
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {a.prev.kept && a.prev.kept.counted > 0 ? <Change now={k.kept} before={a.prev.kept.kept} money /> : null}
              <span><Money paise={paise(k.delivered.kept)} /> on <Numeric>{k.delivered.n}</Numeric> delivered{k.rto.n ? <>, less <Money paise={paise(-k.rto.kept)} /> on <Numeric>{k.rto.n}</Numeric> returns</> : null}{k.lost.n ? <>, <Money paise={paise(-k.lost.kept)} /> on <Numeric>{k.lost.n}</Numeric> lost</> : null}</span>
            </span>
            <KeptNote k={k} estimate={a.estimate} />
          </div>
        ) : (
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">₹ kept after returns</span>
            <p className="text-sm">Shows once orders are delivered or come back. <Numeric>{c.onTheWay}</Numeric> on the way, <Numeric>{c.notSent}</Numeric> not sent yet.</p>
            <p className="text-xs"><Link href="/console/orders?tab=on_the_way" className="underline">On the way</Link> · <Link href="/console/orders?tab=to_ship" className="underline">To ship</Link></p>
          </div>
        )
      ) : null}
      {/* The flow of orders, drawn with the icon set (rule 20a), its words in the page. */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Where this period's orders are">
        <span><Numeric className="font-semibold">{c.orders}</Numeric> orders</span>
        <Icon name="chevron" className="size-4 text-muted-foreground" />
        <span><Numeric className="font-semibold">{c.delivered}</Numeric> delivered</span>
        <span className="text-muted-foreground">·</span>
        <span><Numeric className="font-semibold">{c.rto}</Numeric> came back{out ? <span className="text-muted-foreground"> ({shareOf(c.rto, out)} of {out} with an outcome)</span> : null}</span>
        {c.lost ? <><span className="text-muted-foreground">·</span><span><Numeric className="font-semibold">{c.lost}</Numeric> lost</span></> : null}
        <span className="text-muted-foreground">·</span>
        <span><Numeric className="font-semibold">{c.onTheWay}</Numeric> on the way</span>
        <span className="text-muted-foreground">·</span>
        <span><Numeric className="font-semibold">{c.notSent}</Numeric> not sent yet</span>
      </p>
    </Section>
  )
}

/** Four numbers against the period before; under 30 orders, the tally and a count to go instead (rule 20a). */
export function Strip({ a }: { a: Analytics }) {
  const c = a.cur, p = a.prev
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
    <div className="grid min-w-0 gap-0.5 bg-card p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono text-lg font-semibold tabular-nums">{v}</dd><dd>{d}</dd></div>
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

/** Sources beyond the first 12, and values a shopper typed, fold into one "Other" row (spec § Design 3). */
export function foldSources(sources: SourceStat[], keep = 12): { rows: SourceStat[]; other: Totals | null } {
  const shown = sources.filter((s) => s.channel !== 'other').slice(0, keep)
  const rest = sources.filter((s) => !shown.includes(s))
  if (!rest.length) return { rows: shown, other: null }
  const sum = (xs: Totals[]): Totals => {
    const kepts = xs.map((x) => x.kept).filter((k): k is Kept => !!k)
    const add = (f: (k: Kept) => number) => kepts.reduce((n, k) => n + f(k), 0)
    return {
      orders: xs.reduce((n, x) => n + x.orders, 0), sales: xs.reduce((n, x) => n + x.sales, 0), cod: xs.reduce((n, x) => n + x.cod, 0),
      delivered: xs.reduce((n, x) => n + x.delivered, 0), rto: xs.reduce((n, x) => n + x.rto, 0), lost: xs.reduce((n, x) => n + x.lost, 0),
      onTheWay: xs.reduce((n, x) => n + x.onTheWay, 0), notSent: xs.reduce((n, x) => n + x.notSent, 0),
      kept: kepts.length ? { kept: add((k) => k.kept), counted: add((k) => k.counted), leftOut: add((k) => k.leftOut), delivered: { n: add((k) => k.delivered.n), kept: add((k) => k.delivered.kept) }, rto: { n: add((k) => k.rto.n), kept: add((k) => k.rto.kept) }, lost: { n: add((k) => k.lost.n), kept: add((k) => k.lost.kept) }, basis: null } : null,
    }
  }
  return { rows: shown, other: sum(rest.map((s) => s.cur)) }
}

const HOW = 'A source is the tagged link the shopper arrived on, else the site they came from, else "Direct or unknown" (WhatsApp chats and many apps hide where a tap came from: a link from Make a link fixes that). The last one before the order, in that browser tab. Anyone can type tags into an address, so a source is what the link said.'

/** Where orders came from: one row per source, most ₹ kept after returns first; on a phone, rows become cards. */
export function Sources({ a, period }: { a: Analytics; period: number }) {
  const { rows, other } = foldSources(a.sources)
  const line = (t: Totals, name: React.ReactNode, href: string | null, sub: React.ReactNode) => {
    const out = outcomes(t)
    const k = t.kept
    return (
      <>
        <Td cell="a">{href ? <Link href={href} data-row-link prefetch={false} className="font-medium hover:underline">{name}</Link> : <span className="font-medium">{name}</span>}
          <span className="block text-xs text-muted-foreground">{sub}</span></Td>
        <Td cell="b" className="text-right">{a.costs && k && k.counted ? <Money paise={paise(k.kept)} /> : <><span className="text-xs text-muted-foreground md:hidden">Orders </span><Numeric>{t.orders}</Numeric></>}</Td>
        <Td cell="hide" className="text-right"><Numeric>{t.orders}</Numeric></Td>
        <Td cell="hide" className="text-right"><Money paise={paise(t.sales)} /></Td>
        <Td cell="hide" className="text-right">{t.orders ? formatPercent(t.cod / t.orders, 0) : '—'}</Td>
        <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Delivered </span><Numeric>{t.delivered}</Numeric></Td>
        <Td cell="e" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Came back </span>{out ? shareOf(t.rto, out) : '—'}</Td>
        {a.costs ? <Td cell="f" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Per order with an outcome </span>{k && keptPerOrder(k) !== null ? (judgeable(k.counted) ? <Money paise={paise(keptPerOrder(k)!)} /> : <span className="text-xs text-muted-foreground">too few to judge</span>) : '—'}</Td> : null}
      </>
    )
  }
  return (
    <Section flush title={<span className="inline-flex items-center gap-1">Where orders came from<InfoTip about="how a source is decided">{HOW}</InfoTip></span>}>
      <DataTable label="Where orders came from">
        <DataTableHead>
          <th>Source</th><th className="text-right">{a.costs ? '₹ kept after returns' : 'Orders'}</th><th className="text-right">Orders</th><th className="text-right">Sales</th><th className="text-right">COD</th>
          <th className="text-right">Delivered</th><th className="text-right">Came back</th>{a.costs ? <th className="text-right">Per order with an outcome</th> : null}
        </DataTableHead>
        <DataTableBody>
          {rows.map((s) => (
            <DataTableRow key={s.slug}>{line(s.cur, s.label, `/console/analytics/${encodeURIComponent(s.slug)}?period=${period}`,
              s.campaigns.length ? `${s.campaigns[0]!.name}${s.campaigns.length > 1 ? ` and ${s.campaigns.length - 1} more` : ''}` : s.channel === 'direct' ? 'chats, typed address, apps that hide it' : '')}</DataTableRow>
          ))}
          {other ? <DataTableRow key="other">{line(other, 'Other', null, 'sources with few orders, and tags typed by hand')}</DataTableRow> : null}
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
            <DataTableRow key={p.pincode}><Td cell="a"><Numeric>{p.pincode}</Numeric></Td><Td cell="b" className="text-right">{judgeable(p.outcomes) ? `${formatPercent(p.rto / p.outcomes, 0)} of ${p.outcomes}` : `${p.rto} of ${p.outcomes}`}</Td></DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}
