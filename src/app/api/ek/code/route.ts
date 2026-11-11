import { z } from 'zod'
import { ekReply, requireEk } from '@/lib/ekcode/require-ek'
import { readFlow, writeFlow } from '@/lib/ekcode/flow-cookie'
import { codeArrived, sendCode } from '@/lib/ekcode/signin'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// POST: send a code to the typed number (with a proof-of-work answer when one was asked for). GET: has it arrived?
// The flow and the code come from the sealed cookie only.
export const dynamic = 'force-dynamic'
const Pow = z.object({ nonce: z.string().max(40), bits: z.number().int().min(0).max(24), exp: z.number().int(), sig: z.string().max(60), counter: z.number().int().min(0).max(2 ** 31) })
const Body = z.object({ phone: z.string().max(20), pow: Pow.nullish() })

export async function POST(request: Request) {
  const g = await requireEk(request, Body)
  if (!g.ok) return g.response
  const flow = await readFlow()
  if (!flow) return ekReply({ error: 'expired' }, 410)
  const r = await sendCode(flow, g.body.phone, g.net, g.body.pow ?? null)
  if (!r.ok) return ekReply(r, r.reason === 'invalid' ? 400 : r.reason === 'expired' ? 410 : 200)
  await writeFlow(r.cookie)
  return ekReply({ ok: true })
}

export async function GET(request: Request) {
  const g = await requireEk(request, null)
  if (!g.ok) return g.response
  const flow = await readFlow()
  const s = flow ? await codeArrived(flow) : null
  return s ? ekReply(s) : ekReply({ error: 'expired' }, 410)
}
