import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { Panel } from '@/components/ui/panel'
import { ShareBar } from '@/components/charts/share-bar'
import { Pictogram } from '@/components/brand/pictogram'
import { judgeable, VISITS_MIN } from '@/domains/analytics/judge'
import type { FunnelStep, ProductLine, Share, Speed } from '@/domains/analytics/traffic'
import { formatCount, formatPercent } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'

// =============================================================================
// ANALYTICS · VISITS (A·2 · A2·4; mockup docs/mockups/2026-11-10-analytics-a2.html, as approved): the strip's visit
// numbers, from visit to delivered, where they browse, cities, products, speed on phones. Server components; every
// number arrives computed (src/domains/analytics/traffic.ts). Text a shopper's browser sent (a site, a city) is shown as
// text, never as a link (security review LOW: forged content in the Console).
// =============================================================================

export const HOW_VISITS = 'Counted without cookies or stored IP addresses: a visitor counts once a day on a device; bots are left out. Ad blockers and closed tabs mean a few percent go uncounted.'
const HOW_CITY = 'From the visitor’s network: a hint, often the nearest big city. The exact pincode comes from checkout. Orders here are counted in the browser, so a few may be missing.'
const HOW_BROWSE = 'Orders here are counted in the browser, so a few may be missing against your orders.'
const HOW_SPEED = 'What 3 in 4 shoppers’ phones measured on your pages, from the browser. Good: page shows by 2.5 s, taps answer by 0.2 s, nothing jumps.'

const per = (v: number | null) => (v === null ? <span className="text-xs text-muted-foreground">too few</span> : v.toFixed(1))
const bar = (share: number) => (
  <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full origin-left rounded-full bg-foreground" style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, share))})` }} /></span>
)

/** The first days: too few visits to judge any share yet, with how far to go. */
export function TooFewVisits({ visits }: { visits: number }) {
  return (
    <Section title="From visit to order">
      <div className="flex items-center gap-4">
        <Pictogram name="tally" size={48} className="shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">Too few to judge: <Numeric>{formatCount(visits)}</Numeric> {visits === 1 ? 'visit' : 'visits'} so far. Shares mean something from <Numeric>{formatCount(VISITS_MIN)}</Numeric>.</p>
          {bar(visits / VISITS_MIN)}
        </div>
      </div>
    </Section>
  )
}

/** Before the first visit: the orders above stand; visits arrive as shoppers do. */
export function NoVisitsYet() {
  return <Panel title="Visits count from today">Your orders above are unchanged. Visits, devices and cities show here as shoppers arrive.</Panel>
}

/** The analytics database didn't answer: the orders above are still right. */
export function VisitsUnavailable() {
  return <Panel title="Visits unavailable">Your orders above are unchanged. Try again in a minute.</Panel>
}

/** Where most leave, in the words drawn: keyed by the step they did not reach. */
const LEAVE: Record<string, [string, string]> = {
  'Viewed a product': ['the visit and the product', 'visit don’t view a product'],
  'Added to bag': ['the product and the bag', 'view a product don’t add it'],
  'Began checkout': ['the bag and checkout', 'add to bag don’t begin checkout'],
  Ordered: ['checkout and the order', 'begin checkout don’t order'],
}

/** From visit to order, as drawn: five figures in a row, each with its bar, and where most leave in one sentence.
 * Delivered is the figures' and the flow line's (above); the order step waits for full coverage (`fullFrom`). */
export function Funnel({ steps, drop, fullFrom }: { steps: FunnelStep[]; drop: { from: string; to: string; leave: number } | null; fullFrom: Date | null }) {
  const five = steps.slice(0, 5)
  const max = five[0]?.n || 1
  const words = drop ? LEAVE[drop.to] : undefined
  const inTen = drop ? Math.max(1, Math.round(drop.leave * 10)) : 0
  return (
    <Section id="funnel" title="From visit to order" flatOnPhone>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5" aria-label="From visit to order">
        {five.map((s) => (
          <li key={s.name} className="flex min-w-0 flex-col gap-1">
            <span className="text-label text-muted-foreground">{s.name}</span>
            {s.n === null
              ? <span className="text-label text-muted-foreground">{fullFrom ? `Shows from ${dayMonthIN(fullFrom)}` : '—'}</span>
              : <><Numeric className="text-title font-semibold">{formatCount(s.n)}</Numeric><ShareBar share={s.n / max} track={false} /></>}
          </li>
        ))}
      </ol>
      {drop && words ? <p className="text-sm text-muted-foreground">Most leave between {words[0]}: {inTen >= 10 ? 'almost all' : `${inTen} in 10`} who {words[1]}.</p> : null}
    </Section>
  )
}

/** Where they browse: in-app browsers and browsers by share, with orders per 100 visits; devices below. */
export function Browse({ shares, devices }: { shares: Share[]; devices: { phone: number; computer: number; tablet: number } }) {
  if (!shares.length) return null
  const all = devices.phone + devices.computer + devices.tablet
  return (
    <Section title="Where they browse" action={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Orders per 100 visits<InfoTip about="where these orders are counted">{HOW_BROWSE}</InfoTip></span>}>
      <ul className="grid gap-2.5">
        {shares.map((s) => (
          <li key={s.name} className="grid gap-1 text-sm">
            <span className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate">{s.name} <span className="text-xs text-muted-foreground">· {formatPercent(s.share, 0)}</span></span><span className="font-num">{per(s.perHundred)}</span></span>
            {bar(s.share)}
          </li>
        ))}
      </ul>
      {all ? <p className="mt-3 text-xs text-muted-foreground">Phone {formatPercent(devices.phone / all, 0)} · computer {formatPercent(devices.computer / all, 0)} · tablet {formatPercent(devices.tablet / all, 0)}</p> : null}
    </Section>
  )
}

/** Cities from the network, with orders per 100 visits and returns from the shop's orders in that city. */
export function Cities({ shares, returns }: { shares: Share[]; returns: ReadonlyMap<string, { rto: number; outcomes: number }> }) {
  if (!shares.length) return null
  return (
    <Section flush title={<span className="inline-flex items-center gap-1">Cities<InfoTip about="where a city comes from">{HOW_CITY}</InfoTip></span>}>
      <DataTable label="Cities">
        <DataTableHead><th>City</th><th className="text-right">Visits</th><th className="text-right">Orders per 100</th><th className="text-right">Came back</th></DataTableHead>
        <DataTableBody>
          {shares.map((c) => {
            const r = c.name === 'Other' ? undefined : returns.get(c.name.toLowerCase())
            return (
              <DataTableRow key={c.name}>
                <Td cell="a">{c.name}</Td>
                <Td cell="b" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Visits </span><Numeric>{formatCount(c.visitors)}</Numeric></Td>
                <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Per 100 </span>{per(c.perHundred)}</Td>
                <Td cell="d" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Came back </span>{r && r.outcomes ? (judgeable(r.outcomes) ? formatPercent(r.rto / r.outcomes, 0) : `${r.rto} of ${r.outcomes}`) : '—'}</Td>
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}

/** The most viewed products: views, the share added to bag, and orders in the window. */
export function Products({ lines }: { lines: ProductLine[] }) {
  if (!lines.length) return null
  return (
    <Section flush title="Products" action={<span className="text-xs text-muted-foreground">Most viewed</span>}>
      <DataTable label="Products">
        <DataTableHead><th>Product</th><th className="text-right">Views</th><th className="text-right">Added to bag</th><th className="text-right">Ordered</th></DataTableHead>
        <DataTableBody>
          {lines.map((l) => (
            <DataTableRow key={l.productId}>
              <Td cell="a"><Link href={`/console/products/${encodeURIComponent(l.handle)}`} className="font-medium hover:underline">{l.title}</Link>{l.hint ? <span className="block text-xs text-muted-foreground">{l.hint}</span> : null}</Td>
              <Td cell="b" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Views </span><Numeric>{formatCount(l.views)}</Numeric></Td>
              <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Bagged </span>{l.bagged === null ? <span className="text-xs text-muted-foreground">too few</span> : formatPercent(l.bagged, 0)}</Td>
              <Td cell="d" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Ordered </span><Numeric>{formatCount(l.ordered)}</Numeric></Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}

const VERDICT = { good: ['ok', 'Good'], improve: ['warn', 'Could be faster'], poor: ['danger', 'Slow'] } as const
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`

/** Speed on phones at the 75th percentile, with the slowest product page. */
export function SpeedOnPhones({ s, slowest }: { s: Speed; slowest: { title: string; lcpMs: number } | null }) {
  if (s.lcpMs === null || !s.verdict) return null
  const [tone, word] = VERDICT[s.verdict]
  const cell = (k: string, v: string) => <div className="grid gap-0.5"><span className="text-xs text-muted-foreground">{k}</span><span className="font-num text-lg font-semibold tabular-nums">{v}</span></div>
  return (
    <Section title={<span className="inline-flex items-center gap-1">Speed on phones<InfoTip about="how speed is measured">{HOW_SPEED}</InfoTip></span>} action={<Badge tone={tone}>{word}</Badge>}>
      <div className="grid grid-cols-3 gap-3">
        {cell('Page shows', secs(s.lcpMs))}
        {cell('Tap answers', s.inpMs === null ? '—' : secs(s.inpMs))}
        {cell('Layout jumps', s.cls === null ? '—' : s.cls.toFixed(2))}
      </div>
      {slowest ? <p className="mt-3 text-xs text-muted-foreground">Slowest page: {slowest.title}, {secs(slowest.lcpMs)}</p> : null}
    </Section>
  )
}
