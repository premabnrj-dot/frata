import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { parseFilters } from '@/domains/orders/filters'
import { QUEUE_TABS, type QueueTab } from '@/domains/orders/order-state'
import { MAX_SEARCH } from '@/domains/orders/search'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { errName } from '@/lib/log'
import { countOrders, ordersPage } from '@/lib/queries/orders'
import { toRows } from '../_components/rows'

// =============================================================================
// FILE: src/app/(console)/console/orders/rows/route.ts — THE ORDERS LIST AS YOU TYPE (Neel N1c·3).
// GET with the page's own query (?tab=&q=&page= and the filters): the rows the page would render, built by the same
// toRows, from one transaction (ordersPage: list ‖ prefix, then risk). No counts. The tenant is the member's own,
// never a parameter. Limited per member (failing open: the page itself is never limited). Never cached. Logs never
// carry `q` (names and phone digits): errName only.
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(request: Request) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return json(403, { error: auth.message })
  const sp = new URL(request.url).searchParams
  const tab: QueueTab = (QUEUE_TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as QueueTab) : 'to_confirm'
  const q = (sp.get('q') ?? '').trim().slice(0, MAX_SEARCH)
  const page = Math.min(Math.max(1, Number(sp.get('page')) || 1), 1_000)
  const filters = parseFilters(Object.fromEntries(sp))
  const now = new Date()
  try {
    if (!(await withinLimit(LIMITS.ordersReadMember, auth.userId, now))) return json(429, { error: 'Too many searches in the last few minutes. Try again shortly.' })
    // ?count=1: how many, no rows (the phone sheet's and the filter panel's "Show 25 orders").
    if (sp.get('count') === '1') return json(200, { count: await countOrders(auth.membership.tenantId, { tab, q, filters, now }) })
    const view = await ordersPage(auth.membership.tenantId, { tab, page, q, filters, now })
    return json(200, { rows: toRows(view, q, auth.membership.role, now), more: view.more })
  } catch (err) {
    console.error('[orders/rows]', errName(err))
    return json(500, { error: 'We could not search just now. Press Enter to try again.' })
  }
}
