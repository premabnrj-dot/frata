import { Pager } from '@/components/data/pager'
import { SearchField } from '@/components/data/search-field'
import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { currentMethod, orderState, paidAfterSwitch, QUEUE_TABS, type QueueTab } from '@/domains/orders/order-state'
import { risk } from '@/domains/orders/risk'
import { applies } from '@/domains/orders/work'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { riskFactsFor } from '@/lib/queries/order-risk'
import { listOrders, ORDERS_PAGE, orderPrefixFor, queueCounts } from '@/lib/queries/orders'
import { PAYMENT, STATE, TABS } from './_components/labels'
import { Queue, type QueueRow } from './_components/queue'

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
  const counts = await queueCounts(tenantId, now).catch((err) => { console.error('[orders]', err instanceof Error ? err.name : err); return null })
  if (!counts) return fail
  // The pager's total: the tab's own count, or (searching) how many match, from the list query itself.
  const asked = Number(sp.page)
  const pagesFor = (n: number) => Math.max(1, Math.ceil(n / ORDERS_PAGE))
  const page = Number.isSafeInteger(asked) ? Math.min(Math.max(1, asked), q ? 1_000 : pagesFor(counts[tab])) : 1
  let list = await listOrders(tenantId, { tab, page, q, now }).catch((err) => { console.error('[orders]', err instanceof Error ? err.name : err); return null })
  if (!list) return fail
  if (q && !list.length && page > 1) list = (await listOrders(tenantId, { tab, page: 1, q, now }).catch(() => [])) ?? []
  const total = q ? (list[0]?.matching ?? 0) : counts[tab]
  const pages = pagesFor(total)
  const shownPage = q && !list.length ? 1 : page

  const prefix = await orderPrefixFor(tenantId)
  const facts = await riskFactsFor(tenantId, list.map((o) => o.id), now).catch(() => new Map())
  const rows: QueueRow[] = list.map((o) => {
    const state = orderState(o, now)
    const method = currentMethod(o)
    const f = facts.get(o.id)
    return {
      id: o.id, number: `${prefix}-${o.number}`, href: `/console/orders/${o.number}`,
      customer: o.customerName, place: [o.city, `${o.items} item${o.items === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
      payment: method === 'cod' ? PAYMENT.cod : o.paidAt ? PAYMENT.paid : PAYMENT.unpaid, state: STATE[state], doNotCollect: paidAfterSwitch(o),
      // Risk is for orders still to be decided; once confirmed, packed or paid it is not news.
      risk: f && (state === 'unconfirmed' || state === 'held') ? risk(f).level : 'low',
      canConfirm: applies('confirm', state), canHold: applies('hold', state),
      total: Number(o.total), placed: dateTimeIN(o.placedAt), dimmed: STATE[state].tone === 'neutral',
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
  return (
    <>
      <PageHeader title="Orders" />
      <ViewTabs label="Order views" tabs={TABS.map((t) => ({ href: href({ tab: t.tab, q: '' }), label: t.label, count: counts[t.tab], current: t.tab === tab, apart: t.tab === 'not_paid' }))} />
      <SearchField label="Search orders" placeholder="Search number, name or phone" value={q} clearHref={href({ q: '' })} hidden={tab !== 'to_confirm' ? { tab } : undefined} />
      {rows.length === 0 ? (
        <Panel title={q ? 'No order matches that search' : info.empty.title}>
          {q ? <>Try the order number, the customer&apos;s name or the last digits of their phone.</> : info.empty.body ?? null}
        </Panel>
      ) : (
        <Queue rows={rows} label={`Orders · ${info.label}`} />
      )}
      {rows.length > 0 ? (
        <Pager first={(shownPage - 1) * ORDERS_PAGE + 1} shown={rows.length} total={total} suffix="newest first" prevLabel="Newer" nextLabel="Older"
          prevHref={shownPage > 1 ? href({ page: shownPage - 1 }) : undefined} nextHref={shownPage < pages ? href({ page: shownPage + 1 }) : undefined} />
      ) : null}
    </>
  )
}
