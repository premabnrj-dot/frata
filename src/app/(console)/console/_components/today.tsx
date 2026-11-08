import Link from 'next/link'
import { CardLink } from '@/components/layout/card-link'
import { Section } from '@/components/layout/section'
import { CountTiles } from '@/components/data/count-tiles'
import { Name } from '@/components/data/name'
import { Money } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { paise } from '@/domains/money/paise'
import { toConfirmLine, waitLine, weekBars, type TileLine } from '@/domains/orders/today'
import { formatInr } from '@/lib/format'
import { waitedIN, weekdayShortIN } from '@/lib/format-date'
import type { Setup } from '@/lib/queries/settings'
import type { TodaySummary } from '@/lib/queries/today'
import { cn } from '@/lib/utils'
import { PAYMENT, RISK_LABEL, STATE, TABS } from '../orders/_components/labels'
import { CopyLink } from './copy-link'
import { PictoTile } from '@/components/brand/illustrations'

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

function lineText(tab: string, l: TileLine, now: Date): { node: React.ReactNode; words: string } {
  const wait = (since: Date | null) => (since ? `oldest waiting ${waitedIN(since, now)}` : '')
  switch (l.kind) {
    case 'uncounted': return { node: <span className="text-danger-text">Couldn’t count. Open the list →</span>, words: 'could not count' }
    case 'none': return { node: EMPTY[tab], words: EMPTY[tab]! }
    case 'risk_unavailable': return { node: <><Badge tone="neutral">Risk unavailable</Badge>{l.since ? ` · ${wait(l.since)}` : ''}</>, words: `risk unavailable${l.since ? `, ${wait(l.since)}` : ''}` }
    case 'high': return { node: <><Badge tone="danger">{count(l.high)} high risk</Badge>{l.since ? ` · ${wait(l.since)}` : ''}</>, words: `${count(l.high)} high risk${l.since ? `, ${wait(l.since)}` : ''}` }
    case 'oldest': return { node: wait(l.since), words: wait(l.since) }
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
  const next = s?.next ?? null
  const nextRisk = next ? (next.state === 'refund_due' ? null : next.risk) : null

  return (
    <div className="space-y-4">
      {s && !next && s.counts.to_pack === 0 && s.counts.on_hold === 0 && <p className="font-semibold">You’re up to date.</p>}
      {next && (
        // On a phone the next order comes first: it is the one tap the page exists for.
        <CardLink href={`/console/orders/${next.number}`} data-next-order className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
          <span className="col-span-2 text-xs text-muted-foreground">Next to confirm, oldest first</span>
          {/* Line 1: the number and what to know first (risk, or a refund due); line 2: who, how much, how long. On a
              phone the name truncates, never the badge or the amount's line. */}
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <b className="font-mono text-sm">{next.label}</b>
            {next.state === 'refund_due' ? <Badge tone={STATE.refund_due.tone}>{STATE.refund_due.label}</Badge>
              : nextRisk === 'high' || nextRisk === 'medium' ? <Badge tone={nextRisk === 'high' ? 'danger' : 'warn'}>{RISK_LABEL[nextRisk]} risk</Badge>
              : nextRisk === null ? <span className="text-xs text-muted-foreground">Risk unavailable</span> : null}
          </span>
          <span className="row-span-2 self-center text-sm font-semibold whitespace-nowrap">Open →</span>
          <span className="flex min-w-0 gap-1 text-sm text-muted-foreground">
            <span className="min-w-0 truncate"><Name>{next.customerName}</Name></span>
            <span className="shrink-0">· <Money paise={paise(next.total)} /> · {next.cod ? PAYMENT.cod.label : PAYMENT.paid.label} · {waitedIN(next.since, now)}</span>
          </span>
        </CardLink>
      )}

      <CountTiles label="Waiting for you" tiles={TILES.map((t) => {
        const n = s ? s.counts[t.tab] : null, txt = lineText(t.tab, lines[t.tab], now)
        return { key: t.tab, label: t.label, href: t.href, value: n === null ? '—' : count(n), zero: !n, line: txt.node, ariaLabel: `${t.label}, ${n === null ? 'not counted' : count(n)}, ${txt.words}` }
      })} />

      {s && weekOrders === 0 && s.counts.all === 0 ? (
        // A brand empty state (brand spec, chapter 5): one pictogram on its tile; the words carry the meaning.
        <Section ariaLabel="No orders yet">
          <div className="grid justify-items-start gap-3">
            <PictoTile name="store" tone="haldi" />
            <h2 className="font-display text-xl font-semibold tracking-tight">No orders yet</h2>
            <p className="text-sm text-muted-foreground">Share your shop on Instagram or WhatsApp. Orders land here.</p>
            <CopyLink address={setup.address} />
          </div>
        </Section>
      ) : bars ? (
        <Section title="Last 7 days" action={<Link href="/console/orders?tab=all" className="inline-flex min-h-6 items-center text-sm underline">All orders</Link>}>
          <div className="grid items-end gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex gap-6 md:grid md:gap-3">
              <p className="grid"><b className="font-mono text-xl font-semibold tabular-nums">{count(weekOrders)}</b><span className="text-xs text-muted-foreground">orders placed</span></p>
              <p className="grid"><b className="font-mono text-xl font-semibold tabular-nums"><Money paise={paise(weekValue)} /></b><span className="text-xs text-muted-foreground">their value · cancelled left out</span></p>
            </div>
            <div>
              {/* Each day's count over its bar, and today said to be still going (visual changes, owner-approved 2026-11-08). */}
              <div className="mb-1 grid grid-cols-7 gap-1.5 text-center font-mono text-xs tabular-nums text-muted-foreground" aria-hidden>
                {bars.map((b) => <span key={b.day}>{b.orders}</span>)}
              </div>
              <div role="img" aria-label={`Orders placed per day: ${bars.map((b) => `${b.today ? 'today so far' : weekdayShortIN(b.day)} ${b.orders}`).join(', ')}`} className="grid h-16 grid-cols-7 items-end gap-1.5">
                {bars.map((b) => <span key={b.day} title={`${b.orders} · ${formatInr(paise(b.value))}`} className={cn('block h-full min-h-0.5 origin-bottom rounded-t-sm bg-foreground', b.today ? 'opacity-45' : 'opacity-80')} style={{ transform: `scaleY(${Math.max(b.share, 0.02)})` }} />)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground" aria-hidden>
                {bars.map((b) => <span key={b.day} className="leading-tight">{b.today ? <>Today<span className="block">so far</span></> : weekdayShortIN(b.day)}</span>)}
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {setup.left.length > 0 ? (
        <Link href="/console/setup" className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm hover:border-input">
          <Badge tone="warn">{setup.left.length} setup step{setup.left.length === 1 ? '' : 's'} left</Badge>
          <span>{setup.left.map((x) => x.title).join(', ')} →</span>
        </Link>
      ) : (
        // The way to close the shop again lives with the checklist: always one tap from Home (impact review U·4).
        <p className="text-sm text-muted-foreground"><Badge tone="ok">Shop open</Badge> <Link href="/console/setup" className="inline-flex min-h-6 items-center underline">Setup, or close the shop for now</Link></p>
      )}
    </div>
  )
}
