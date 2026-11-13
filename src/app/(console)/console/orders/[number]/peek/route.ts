import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { errName } from '@/lib/log'
import { orderPrefixFor, peekOrder } from '@/lib/queries/orders'
import { toPeek } from './peek'

// =============================================================================
// FILE: src/app/(console)/console/orders/[number]/peek/route.ts — QUICK LOOK (Neel N1c·4).
// GET: one order of the member's own shop, in words (toPeek: named fields, no cost). Another shop's number is the same
// 404 as a missing one. Limited per member, failing closed (it carries an address and a phone). Never cached.
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return json(403, { error: auth.message })
  const n = Number((await params).number)
  if (!Number.isSafeInteger(n) || n < 1) return json(404, { error: 'Order not found.' })
  const now = new Date()
  try {
    if (!(await withinLimit(LIMITS.peekMember, auth.userId, now, true))) return json(429, { error: 'Too many orders opened in the last few minutes. Open the order page instead.' })
    const tenantId = auth.membership.tenantId
    const [r, prefix] = await Promise.all([peekOrder(tenantId, n), orderPrefixFor(tenantId)])
    if (!r) return json(404, { error: 'Order not found.' })
    return json(200, toPeek(r, prefix, now))
  } catch (err) {
    console.error('[orders/peek]', errName(err))
    return json(500, { error: 'We could not open this order. Open the order page instead.' })
  }
}
