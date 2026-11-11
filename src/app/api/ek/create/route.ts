import { z } from 'zod'
import { ekReply, requireEk } from '@/lib/ekcode/require-ek'
import { readFlow } from '@/lib/ekcode/flow-cookie'
import { create } from '@/lib/ekcode/signin'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

export const dynamic = 'force-dynamic'
const Body = z.object({ name: z.string().min(2).max(80) })

export async function POST(request: Request) {
  const g = await requireEk(request, Body)
  if (!g.ok) return g.response
  const flow = await readFlow()
  if (!flow) return ekReply({ error: 'expired' }, 410)
  const view = await create(flow, g.body.name)
  return view ? ekReply({ ok: true, view }) : ekReply({ ok: false }, 409)
}
