import { z } from 'zod'
import { ekReply, requireEk } from '@/lib/ekcode/require-ek'
import { clearFlow, readFlow } from '@/lib/ekcode/flow-cookie'
import { continueToShop } from '@/lib/ekcode/signin'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Continue to the shop: the grant, and the address to go to — built on the server from the flow row. The island then
// does location.assign(url) (form-action 'self' would block a POST that redirects to another host).
export const dynamic = 'force-dynamic'
const Body = z.object({ addressId: z.string().uuid().nullable() })

export async function POST(request: Request) {
  const g = await requireEk(request, Body)
  if (!g.ok) return g.response
  const flow = await readFlow()
  if (!flow) return ekReply({ error: 'expired' }, 410)
  const url = await continueToShop(flow, g.body.addressId)
  if (!url) return ekReply({ ok: false }, 409)
  await clearFlow()
  return ekReply({ ok: true, url })
}
