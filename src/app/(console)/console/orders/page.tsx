import { FilterBar } from '@/components/data/filter-bar'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { chipsFor, filterParams, filterQuery, hasFilters, parseFilters, type OrderFilters } from '@/domains/orders/filters'
import { QUEUE_TABS, type QueueTab } from '@/domains/orders/order-state'
import { MAX_SEARCH } from '@/domains/orders/search'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { countOrders, ORDERS_PAGE, ordersPage, queueCounts } from '@/lib/queries/orders'
import { savedViewsFor, viewCounts } from '@/lib/queries/saved-views'
import { errName } from '@/lib/log'
import { TABS } from './_components/labels'
import { AddFilter, FilterSheet } from './_components/filter-panel'
import { OrdersList } from './_components/orders-list'
import { toRows } from './_components/rows'

// =============================================================================
// FILE: src/app/(console)/console/orders/page.tsx
//
// THE ORDERS QUEUE (1D·4b; Neel N1c § Finding): tabs with counts under the filters (queueCounts, the same predicates
// the list filters with), the filters as chips that read back as a sentence, one search over every order whatever the
// tab (as you type: ./_components/orders-list.tsx and ./rows), 50 a page, the queue's keys and bulk confirm. The view
// is in the address: ?tab=&q=&page= and the filters (src/domains/orders/filters.ts). Reads: counts ‖ the page (list
// and prefix, then risk) ‖ the tab's unfiltered count when filters are on, each its own transaction.
// =============================================================================

export const metadata = { title: 'Orders' }

const fail = <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
type SP = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const sp = await searchParams
  const tab: QueueTab = (QUEUE_TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as QueueTab) : 'to_confirm'
  const q = one(sp.q).trim().slice(0, MAX_SEARCH)
  const filters = parseFilters(sp)
  const filtered = hasFilters(filters)
  const now = new Date()
  const tenantId = auth.membership.tenantId
  const asked = Number(one(sp.page))
  const wanted = Number.isSafeInteger(asked) ? Math.min(Math.max(1, asked), 1_000) : 1
  const log = (err: unknown) => { console.error('[orders]', errName(err)); return null }
  const [counts, first, unfiltered, views] = await Promise.all([
    queueCounts(tenantId, now, filters).catch(log),
    ordersPage(tenantId, { tab, page: wanted, q, filters, now }).catch(log),
    filtered && !q ? countOrders(tenantId, { tab, now }).catch(log) : null,
    savedViewsFor(tenantId).catch((err) => { log(err); return [] }),
  ])
  if (!counts || !first) return fail
  // A page past the end (rows left since the link was made): its last page instead (a search: its first).
  const last = Math.max(1, Math.ceil((q ? 1 : counts[tab]) / ORDERS_PAGE))
  const page = !first.list.length && wanted > 1 ? (q ? 1 : Math.min(wanted, last)) : wanted
  const view = page === wanted ? first : ((await ordersPage(tenantId, { tab, page, q, filters, now }).catch(log)) ?? first)
  const rows = toRows(view, q, auth.membership.role, now)

  // Hrefs keep the tab, the search and every filter (Back restores exactly this).
  const href = (o: { tab?: QueueTab; q?: string; filters?: OrderFilters }) => {
    const u = new URLSearchParams(filterParams(o.filters ?? filters))
    const t = o.tab ?? tab
    if (t !== 'to_confirm') u.set('tab', t)
    if (o.q ?? q) u.set('q', o.q ?? q)
    const s = new URLSearchParams([...u.entries()].sort(([a], [b]) => a.localeCompare(b))).toString()
    return `/console/orders${s ? `?${s}` : ''}`
  }
  const info = TABS.find((t) => t.tab === tab)!
  // Couldn't deliver jumps to the front when it holds anything (design language 53): a failed delivery is today's work.
  const ordered = counts.couldnt_deliver > 0 ? [...TABS].sort((a, b) => Number(b.tab === 'couldnt_deliver') - Number(a.tab === 'couldnt_deliver')) : TABS
  // Couldn't deliver and Coming back show only while they hold an order (or are the open view).
  const shown = ordered.filter((t) => (t.tab !== 'couldnt_deliver' && t.tab !== 'coming_back') || counts[t.tab] > 0 || t.tab === tab)
  const chips = chipsFor(filters).map((c) => ({ label: c.label, href: href({ filters: c.without }) }))
  const ask = { tab, q, filters: new URLSearchParams(filterParams(filters)).toString() }
  const n = (x: number) => x.toLocaleString('en-IN')
  const summary = filtered && !q && unfiltered !== null ? `${n(counts[tab])} of ${n(unfiltered)} orders` : null
  const waiting = counts.to_confirm
  // A view is current when the address holds exactly its tab and filters (no ?view= to go stale).
  const here = filterQuery(filters)
  const viewLinks = views.map((v) => ({ id: v.id, name: v.name, href: href({ tab: v.tab, q: '', filters: v.filters }), current: !q && v.tab === tab && v.query === here }))
  return (
    <>
      <PageHeader title="Orders" badges={waiting > 0 ? <span className="md:hidden"><Badge tone="warn">{n(waiting)} to confirm</Badge></span> : undefined} />
      <OrdersList tab={tab} q={q} filters={ask.filters} page={page} rows={rows} more={view.more} total={counts[tab]} filtered={filtered}
        slipSize={view.slipSize}
        tabs={shown.map((t) => ({ tab: t.tab, label: t.label, count: counts[t.tab], apart: t.tab === 'not_paid' }))}
        empty={info.empty}
        empties={{ search: { title: 'No order matches that search', body: 'Searched order numbers, names, phones and tracking numbers.' }, filters: { title: 'No order matches these filters' } }}
        views={viewLinks} viewCounts={viewCounts(tenantId, views, now)} saveable={filtered && !viewLinks.some((v) => v.current)}
        bar={<FilterBar chips={chips} clearHref={href({ filters: {} })} summary={summary}
          add={<><AddFilter ask={ask} /><FilterSheet ask={ask} active={chips.length} /></>} />} />
    </>
  )
}
