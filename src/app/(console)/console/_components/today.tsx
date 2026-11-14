import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Money } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { paise } from '@/domains/money/paise'
import { toConfirmLine, waitLine, weekBars, type TileLine } from '@/domains/orders/today'
import { formatInr } from '@/lib/format'
import { waitedIN, weekdayShortIN } from '@/lib/format-date'
import type { Setup } from '@/lib/queries/settings'
import type { TodaySummary } from '@/lib/queries/today'
import { cn } from '@/lib/utils'
import { STATE, TABS } from '../orders/_components/labels'
import { applies } from '@/domains/orders/work'
import { placeLine } from '@/domains/orders/place-line'
import { CopyLink } from './copy-link'
import { PictoTile } from '@/components/brand/illustrations'
import { NextToConfirm, type NextRow } from './next-to-confirm'

// =============================================================================
// FILE: src/app/(console)/console/_components/today.tsx
//
// HOME ONCE THE SHOP IS OPEN (docs/specs/2026-11-07-ux-today.md, mockup approved 2026-11-07): is anything
// waiting (three counts, each a link to its tab), what to do first (the oldest order to confirm, one tap), how
// the week went, and the setup steps still open. Counts are queueCounts' (the pill and the tabs agree); a count
// that could not be read is never a 0. No suggestions, no feature cards.
// =============================================================================

const EMPTY = Object.fromEntries(TABS.map((t) => [t.tab, t.empty.title])) as Record<string, string>
const TILES = [
  { tab: 'to_confirm', label: 'To confirm', href: '/console/orders' },
  { tab: 'to_pack', label: 'To pack', href: '/console/orders?tab=to_pack' },
  { tab: 'on_hold', label: 'On hold', href: '/console/orders?tab=on_hold' },
] as const

const count = (n: number) => n.toLocaleString('en-IN')

/** A tile's chip (Neel § Screens · Home): the oldest wait in warn, "Nothing waiting" in ok, high risk in danger. */
function chipFor(tab: string, l: TileLine, now: Date): { node: React.ReactNode; words: string } {
  const old = (since: Date | null) => (since ? `Oldest ${waitedIN(since, now)}` : '')
  switch (l.kind) {
    case 'uncounted': return { node: <Badge tone="danger">Couldn’t count</Badge>, words: 'could not count' }
    case 'none': return { node: <Badge tone="ok">Nothing waiting</Badge>, words: EMPTY[tab] ?? 'nothing waiting' }
    case 'risk_unavailable': return { node: <Badge>Risk unavailable</Badge>, words: 'risk unavailable' }
    case 'high': return { node: <Badge tone="danger">{count(l.high)} high risk</Badge>, words: `${count(l.high)} high risk${l.since ? `, oldest waiting ${waitedIN(l.since, now)}` : ''}` }
    case 'oldest': return { node: l.since ? <Badge tone="warn">{old(l.since)}</Badge> : null, words: l.since ? `oldest waiting ${waitedIN(l.since, now)}` : '' }
  }
}

export function Today({ s, setup, now }: { s: TodaySummary | null; setup: Setup; now: Date }) {
  const lines: Record<(typeof TILES)[number]['tab'], TileLine> = {
    to_confirm: toConfirmLine(s?.counts.to_confirm ?? null, s ? s.high : null, s?.next?.since ?? null),
    to_pack: waitLine(s?.counts.to_pack ?? null, s?.oldest.to_pack ?? null),
    on_hold: waitLine(s?.counts.on_hold ?? null, s?.oldest.on_hold ?? null),
  }
  const bars = s ? weekBars(s.week, now) : null
  const weekOrders = bars?.reduce((t, b) => t + b.orders, 0) ?? 0
  const weekValue = bars?.reduce((t, b) => t + b.value, 0) ?? 0
  const top = Math.max(1, ...(bars ?? []).map((b) => b.orders))
  // Built here, on the server, by the queue's own rules: whether it can be confirmed (applies), its state's words.
  const rows: NextRow[] = (s?.nextFive ?? []).map((n) => ({
    id: n.id, label: n.label, number: n.number, name: n.customerName, total: n.total, cod: n.cod,
    place: placeLine(n.city, n.items), canConfirm: applies('confirm', n.state),
    state: n.state === 'unconfirmed' ? null : STATE[n.state],
    risk: n.state === 'refund_due' ? 'low' : n.risk ?? 'unknown', waited: waitedIN(n.since, now),
  }))

  return (
    <div className="space-y-6">
      {/* Three counts in one card, each a link to its tab (Neel § Screens · Home: 30/36 figures, a chip under each). */}
      <Section flush><nav aria-label="Waiting for you" className="grid md:grid-cols-3">
        {TILES.map((t) => {
          const n = s ? s.counts[t.tab] : null, chip = chipFor(t.tab, lines[t.tab], now)
          return (
            <Link key={t.tab} href={t.href} data-tile={t.tab} aria-label={`${t.label}, ${n === null ? 'not counted' : count(n)}, ${chip.words}`}
              className="grid justify-items-start gap-1 border-b border-line-soft px-5 py-4.5 last:border-b-0 hover:bg-side md:border-b-0 md:border-l md:first:border-l-0">
              <span className="text-label font-medium text-muted-foreground">{t.label}</span>
              <b className={cn('font-num text-display font-semibold', !n && 'text-text-3')}>{n === null ? '—' : count(n)}</b>
              {chip.node}
            </Link>
          )
        })}
      </nav></Section>

      {s && !rows.length && s.counts.to_pack === 0 && s.counts.to_ship === 0 && s.counts.on_hold === 0 && <p className="font-semibold">You’re up to date.</p>}
      {rows.length ? (
        <Section title="Next to confirm" action={<Link href="/console/orders" className="inline-flex min-h-6 items-center text-sm font-medium text-link hover:underline">All {count(s?.counts.to_confirm ?? rows.length)}</Link>}>
          <NextToConfirm rows={rows} />
        </Section>
      ) : null}

      {s && weekOrders === 0 && s.counts.all === 0 ? (
        // A brand empty state (brand spec, chapter 5): one pictogram on its tile; the words carry the meaning.
        <Section ariaLabel="No orders yet">
          <div className="grid justify-items-start gap-3">
            <PictoTile name="store" tone="haldi" />
            <h2 className="text-section font-semibold">No orders yet</h2>
            <p className="text-sm text-muted-foreground">Share your shop on Instagram or WhatsApp. Orders land here.</p>
            <CopyLink address={setup.address} />
          </div>
        </Section>
      ) : bars ? (
        <Section title="Last 7 days" action={<span className="text-small text-muted-foreground">{count(weekOrders)} orders · <Money paise={paise(weekValue)} /></span>}>
          {/* Bars in --chart, today still running in --chart-now; each day's count over its bar (Neel § Screens · Home). */}
          <div role="img" aria-label={`Orders placed per day: ${bars.map((b) => `${b.today ? 'today so far' : weekdayShortIN(b.day)} ${b.orders}`).join(', ')}`}
            className="grid h-38 grid-cols-7 items-end gap-2.5 border-b border-edge pt-2.5">
            {bars.map((b) => (
              <div key={b.day} className="grid h-full grid-rows-[auto_1fr_auto] justify-items-center gap-1.5 text-small text-muted-foreground" title={`${b.orders} · ${formatInr(paise(b.value))}`}>
                <span className="font-num">{b.orders}</span>
                <span className="flex w-full items-end"><i className={cn('block w-full rounded-t-xs', b.today ? 'bg-chart-now' : 'bg-chart')} style={{ height: `${Math.max(2, (b.orders / top) * 100)}%` }} /></span>
                <span className="leading-tight">{b.today ? 'Today so far' : weekdayShortIN(b.day)}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {setup.left.length > 0 ? (
        <Link href="/console/setup" className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-edge px-4 py-2.5 text-sm hover:bg-side">
          <Badge tone="warn">{setup.left.length} setup step{setup.left.length === 1 ? '' : 's'} left</Badge>
          <span>{setup.left.map((x) => x.title).join(', ')} →</span>
        </Link>
      ) : null}
    </div>
  )
}
