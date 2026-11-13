import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { parseFilters, parseTab } from '@/domains/orders/filters'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { filterValues, isValueField } from '@/lib/queries/orders'

// =============================================================================
// FILE: src/app/(console)/console/orders/filter-values/route.ts — "+ Filter"'s values with their counts (Neel N1c·1).
// GET ?field=pay|st&tab=… and the filters: each value and how many orders in the tab (under the other filters) have
// it. `field` is one of a closed set mapped to fixed SQL (anything else: 400). The member's own shop only; limited per
// member with the instant search; never cached. Counts unreadable (the 800 ms ceiling) → values: null.
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(request: Request) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return json(403, { error: auth.message })
  const sp = new URL(request.url).searchParams
  const field = sp.get('field') ?? ''
  if (!isValueField(field)) return json(400, { error: 'Unknown filter.' })
  const tab = parseTab(sp.get('tab'))
  const now = new Date()
  if (!(await withinLimit(LIMITS.ordersReadMember, auth.userId, now))) return json(429, { error: 'Too many requests in the last few minutes. Try again shortly.' })
  return json(200, { values: await filterValues(auth.membership.tenantId, field, { tab, filters: parseFilters(Object.fromEntries(sp)), now }) })
}
