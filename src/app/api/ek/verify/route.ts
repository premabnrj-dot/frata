import { z } from 'zod'
import { ekReply, requireEk } from '@/lib/ekcode/require-ek'
import { readFlow, writeFlow } from '@/lib/ekcode/flow-cookie'
import { verify } from '@/lib/ekcode/signin'

export const dynamic = 'force-dynamic'
const Body = z.object({ code: z.string().regex(/^\d{6}$/) })

export async function POST(request: Request) {
  const g = await requireEk(request, Body)
  if (!g.ok) return g.response
  const flow = await readFlow()
  if (!flow) return ekReply({ error: 'expired' }, 410)
  const r = await verify(flow, g.body.code)
  if (!r.ok) return ekReply({ ok: false, triesLeft: r.triesLeft })
  await writeFlow(r.cookie)
  return ekReply({ ok: true, view: r.view })
}
