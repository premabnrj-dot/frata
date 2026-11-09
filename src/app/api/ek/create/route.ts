import { z } from 'zod'
import { ekReply, requireEk } from '@/lib/ekcode/require-ek'
import { readFlow } from '@/lib/ekcode/flow-cookie'
import { create } from '@/lib/ekcode/signin'

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
