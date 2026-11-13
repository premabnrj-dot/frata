'use client'

import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Suspense, use, useEffect, useRef, useState } from 'react'
import { Pager } from '@/components/data/pager'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import type { QueueTab } from '@/domains/orders/order-state'
import { Queue, type QueueRow } from './queue'
import { SaveView, ViewMenu } from './views'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/orders-list.tsx — THE ORDERS LIST AND ITS SEARCH (Neel N1c·3).
//
// One island owns what a search changes: the rows, the pager, the empty state, the list's label and which tab is
// current. The box asks ../rows 150 ms after the last key (the one in flight aborted) and writes ?q= with
// history.replaceState: no page render per key. Enter, Back and a reload render the page as before, with every
// filter kept. The server's rows win whenever they arrive (after an action's refresh, or a navigation).
// =============================================================================

export type TabLink = { tab: QueueTab; label: string; count: number; apart?: boolean }
export type Empty = { title: string; body?: string }
export type ViewLink = { id: string; name: string; href: string; current: boolean }
type Live = { q: string; rows: QueueRow[]; more: boolean } | null

const PAGE = 50
const DEBOUNCE_MS = 150

export function OrdersList({ tab, tabs, q: initialQ, filters, page, rows, more, total, filtered, slipSize, empty, empties, bar, views, viewCounts, saveable }: {
  tab: QueueTab; tabs: TabLink[]; q: string; filters: string; page: number; rows: QueueRow[]; more: boolean
  /** The tab's count under the filters (no search), for the pager. */
  total: number; filtered: boolean; slipSize: 'a4' | 'label'; empty: Empty; empties: Record<'search' | 'filters', Empty>
  /** The filter chips, "+ Filter" and the phone's sheet (server-rendered from the address). */
  bar: React.ReactNode
  /** Saved views (N1c·2) after the queue's own tabs; their counts stream in after the page. */
  views: ViewLink[]; viewCounts: Promise<Record<string, number> | null>; saveable: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [live, setLive] = useState<Live>(null)
  const [failed, setFailed] = useState(false)
  const inflight = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const href = (o: { tab?: QueueTab; q?: string; page?: number }) => {
    const u = new URLSearchParams(filters)
    const t = o.tab ?? tab
    if (t !== 'to_confirm') u.set('tab', t)
    const qq = (o.q ?? '').trim()
    if (qq) u.set('q', qq)
    if ((o.page ?? 1) > 1) u.set('page', String(o.page))
    // Keys in one order, so a link equals what Back restores.
    const s = new URLSearchParams([...u.entries()].sort(([a], [b]) => a.localeCompare(b))).toString()
    return `/console/orders${s ? `?${s}` : ''}`
  }

  // The server's answer is the truth: a fresh render (an action's refresh, Back, Enter) replaces what was typed live.
  useEffect(() => { setLive(null); setQ(initialQ); setFailed(false) }, [rows, initialQ])
  useEffect(() => () => { inflight.current?.abort(); if (timer.current) clearTimeout(timer.current) }, [])

  function type(next: string) {
    setQ(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void find(next), DEBOUNCE_MS)
  }

  async function find(next: string) {
    inflight.current?.abort()
    const qq = next.trim()
    window.history.replaceState(window.history.state, '', href({ q: qq }))
    if (qq === initialQ.trim()) { setLive(null); setFailed(false); return } // back to what the page holds
    if (!qq) { setLive({ q: '', rows: [], more: false }); router.replace(href({}), { scroll: false }); return }
    const ctl = new AbortController(); inflight.current = ctl
    try {
      const u = new URL(href({ q: qq }), window.location.origin)
      const res = await fetch(`/console/orders/rows${u.search}`, { signal: ctl.signal, headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json() as { rows: QueueRow[]; more: boolean }
      if (!ctl.signal.aborted) { setLive({ q: qq, rows: body.rows, more: body.more }); setFailed(false) }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setFailed(true)
    }
  }

  const searching = live ? live.q !== '' : initialQ.trim() !== ''
  const shown = live?.rows ?? rows
  const shownMore = live ? live.more : more
  const shownPage = live ? 1 : page
  const qShown = live ? live.q : initialQ.trim()
  const first = (shownPage - 1) * PAGE + 1
  const pagerTotal = searching ? `${(first - 1 + shown.length).toLocaleString('en-IN')}${shownMore ? '+' : ''}` : total
  const label = searching ? 'Orders · Search' : `Orders · ${tabs.find((t) => t.tab === tab)?.label ?? 'All'}`
  const none = searching ? empties.search : filtered ? empties.filters : empty

  return (
    <>
      {(() => {
        const tabRow = (counts: Record<string, number> | null) => (
          <ViewTabs label="Order views" scroll
            tabs={[
              ...tabs.map((t) => ({ href: href({ tab: t.tab }), label: t.label, count: t.count, current: !searching && !views.some((v) => v.current) && t.tab === tab, apart: t.apart })),
              ...views.map((v) => ({ href: v.href, label: v.name, count: counts?.[v.id], current: !searching && v.current,
                menu: v.current ? <ViewMenu id={v.id} name={v.name} leaveTo={href({ tab })} /> : undefined })),
            ]}
            trailing={saveable && !searching ? <SaveView tab={tab} query={filters} /> : undefined} />
        )
        return views.length ? <Suspense fallback={tabRow(null)}><ViewCounts promise={viewCounts}>{tabRow}</ViewCounts></Suspense> : tabRow(null)
      })()}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <form role="search" className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); router.push(href({ q })) }}>
        <label htmlFor="search-orders" className="sr-only">Search orders</label>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring md:h-9 md:max-w-md">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input id="search-orders" name="q" type="search" value={q} onChange={(e) => type(e.target.value)} autoComplete="off" maxLength={60}
            onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); type('') } }}
            placeholder="Search number, name, phone or AWB" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {q && <button type="button" aria-label="Clear search" onClick={() => type('')} className="inline-grid size-6 place-items-center rounded-sm text-muted-foreground hover:text-foreground"><X aria-hidden="true" className="size-4" /></button>}
        </div>
      </form>
      {bar}
      </div>
      {/* Said once the list has changed under the person's typing (or a filter): how many rows they now see. */}
      <p role="status" className="sr-only">{failed ? 'Search did not run' : `${shown.length}${shownMore ? ' or more' : ''} orders`}</p>
      {failed ? <Panel title="We could not search just now">Press Enter to try again.</Panel> : null}
      <Queue rows={shown} label={label} slipSize={slipSize} query={qShown} empty={
        <Panel title={searching ? `No order matches “${qShown}”` : none.title}>{none.body ?? null}</Panel>} />
      {shown.length > 0 ? (
        <Pager first={first} shown={shown.length} total={pagerTotal} suffix="newest first" prevLabel="Newer" nextLabel="Older"
          prevHref={shownPage > 1 ? href({ q: qShown, page: shownPage - 1 }) : undefined}
          nextHref={(searching ? shownMore : shownPage * PAGE < total) ? href({ q: qShown, page: shownPage + 1 }) : undefined} />
      ) : null}
    </>
  )
}

/** The saved views' counts once they arrive (streamed: the page never waits on them). */
function ViewCounts({ promise, children }: { promise: Promise<Record<string, number> | null>; children: (c: Record<string, number> | null) => React.ReactNode }) {
  return <>{children(use(promise))}</>
}
