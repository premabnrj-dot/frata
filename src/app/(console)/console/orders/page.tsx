import { Pager } from '@/components/data/pager'
import { SearchField } from '@/components/data/search-field'
import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { currentMethod, orderState, paidAfterSwitch, QUEUE_TABS, type QueueTab } from '@/domains/orders/order-state'
import { risk } from '@/domains/orders/risk'
import { applies, may } from '@/domains/orders/work'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { riskFactsFor } from '@/lib/queries/order-risk'
import { listOrders, ORDERS_PAGE, queueShopFor, queueCounts } from '@/lib/queries/orders'
import { PAYMENT, STATE, TABS } from './_components/labels'
import { Queue, type QueueRow } from './_components/queue'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/(console)/console/orders/page.tsx
//
// THE ORDERS QUEUE (1D·4b, docs/specs/2026-11-07-orders.md § 1D·1): tabs with
// counts over every order (queueCounts, the same predicates the list filters
// with), one search, 50 a page, two badges per row (how it is paid, where it
// is), risk only when Medium or High, and the queue's keys and bulk confirm
// (./_components/queue.tsx). The view is in the address: ?tab=&q=&page=.
// =============================================================================

export const metadata = { title: 'Orders' }

const fail = <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const sp = await searchParams
  const tab: QueueTab = (QUEUE_TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as QueueTab) : 'to_confirm'
  const q = (sp.q ?? '').trim().slice(0, 60)
  const now = new Date()
  const tenantId = auth.membership.tenantId
  const role = auth.membership.role
  // Counts, the page asked for and the order prefix in parallel (speed review P8: they ran one after another); the
  // rare page past the end is fetched again once the count says where the end is.
  const asked = Number(sp.page)
  const pagesFor = (n: number) => Math.max(1, Math.ceil(n / ORDERS_PAGE))
  const wanted = Number.isSafeInteger(asked) ? Math.min(Math.max(1, asked), 1_000) : 1
  const [counts, first, queueShop] = await Promise.all([
    queueCounts(tenantId, now).catch((err) => { console.error('[orders]', errName(err)); return null }),
    listOrders(tenantId, { tab, page: wanted, q, now }).catch((err) => { console.error('[orders]', errName(err)); return null }),
    queueShopFor(tenantId),
  ])
  const prefix = queueShop.prefix
  if (!counts || !first) return fail
  // The pager's total: the tab's own count, or (searching) how many match, from the list query itself.
  const page = q ? wanted : Math.min(wanted, pagesFor(counts[tab]))
  let list = page === wanted ? first : ((await listOrders(tenantId, { tab, page, q, now }).catch(() => null)) ?? [])
  // A search link past its last page (results shrank since): show its first page, and say so in the pager.
  const refetched = q !== '' && !list.length && page > 1
  if (refetched) list = (await listOrders(tenantId, { tab, page: 1, q, now }).catch(() => [])) ?? []
  const total = q ? (list[0]?.matching ?? 0) : counts[tab]
  const pages = pagesFor(total)
  const shownPage = refetched ? 1 : page

  // If the risk facts cannot be read, rows say "Risk unavailable" and c opens instead of confirming: never fail open.
  const facts = await riskFactsFor(tenantId, list.map((o) => o.id), now).catch((err) => { console.error('[orders] risk', errName(err)); return null })
  const rows: QueueRow[] = list.map((o) => {
    const state = orderState(o, now)
    const method = currentMethod(o)
    const f = facts?.get(o.id)
    return {
      id: o.id, n: o.number, number: `${prefix}-${o.number}`, href: `/console/orders/${o.number}`,
      customer: o.customerName, place: [o.city, `${o.items} item${o.items === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
      payment: method === 'cod' ? PAYMENT.cod : o.paidAt ? PAYMENT.paid : PAYMENT.unpaid, state: STATE[state], doNotCollect: paidAfterSwitch(o),
      // Risk is for orders still to be decided; once confirmed, packed or paid it is not news.
      risk: state === 'unconfirmed' || state === 'held' ? (facts === null ? 'unknown' : f ? risk(f).level : 'low') : 'low',
      canConfirm: applies('confirm', state), canHold: applies('hold', state), canPrint: applies('print', state),
      total: Number(o.total), placed: dateTimeIN(o.placedAt), dimmed: STATE[state].tone === 'neutral',
      shipStep: o.byCourier ? null : may('ship_self', state, role) ? 'ship' : may('deliver', state, role) ? 'deliver' : null,
    }
  })

  const href = (p: { tab?: QueueTab; page?: number; q?: string }) => {
    const u = new URLSearchParams()
    const t = p.tab ?? tab
    if (t !== 'to_confirm') u.set('tab', t)
    if (p.q ?? q) u.set('q', p.q ?? q)
    if ((p.page ?? 1) > 1) u.set('page', String(p.page))
    const s = u.toString()
    return `/console/orders${s ? `?${s}` : ''}`
  }
  const info = TABS.find((t) => t.tab === tab)!
  // Couldn't deliver jumps to the front when it holds anything (design language 53): a failed delivery is today's work.
  const ordered = counts.couldnt_deliver > 0 ? [...TABS].sort((a, b) => Number(b.tab === 'couldnt_deliver') - Number(a.tab === 'couldnt_deliver')) : TABS
  // Couldn't deliver and Coming back show only while they hold an order (or are the open view): nothing records a
  // failed delivery yet (ndr_at is never written), so an always-empty tab would only widen the row.
  const shown = ordered.filter((t) => (t.tab !== 'couldnt_deliver' && t.tab !== 'coming_back') || counts[t.tab] > 0 || t.tab === tab)
  return (
    <>
      <PageHeader title="Orders" />
      <ViewTabs label="Order views" scroll tabs={shown.map((t) => ({ href: href({ tab: t.tab, q: '' }), label: t.label, count: counts[t.tab], current: t.tab === tab, apart: t.tab === 'not_paid' }))} />
      <SearchField label="Search orders" placeholder="Search number, name or phone" value={q} clearHref={href({ q: '' })} hidden={tab !== 'to_confirm' ? { tab } : undefined} />
      {/* Always the Queue, even empty: its toast (and Undo) must outlive the last row leaving the tab (e2e 49). */}
      <Queue rows={rows} label={`Orders · ${info.label}`} slipSize={queueShop.slipSize} empty={
        <Panel title={q ? 'No order matches that search' : info.empty.title}>
          {q ? <>Try the order number, the customer&apos;s name or the last digits of their phone.</> : info.empty.body ?? null}
        </Panel>} />
      {rows.length > 0 ? (
        <Pager first={(shownPage - 1) * ORDERS_PAGE + 1} shown={rows.length} total={total} suffix="newest first" prevLabel="Newer" nextLabel="Older"
          prevHref={shownPage > 1 ? href({ page: shownPage - 1 }) : undefined} nextHref={shownPage < pages ? href({ page: shownPage + 1 }) : undefined} />
      ) : null}
    </>
  )
}
