import { z } from 'zod'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { consentToDrops } from '@/lib/queries/drops'
import { errName } from '@/lib/log'

// "Email me new drops": the tap on the page the email links to (a POST: a mail scanner's GET never consents).
export const dynamic = 'force-dynamic'
const Body = z.object({ o: z.uuid(), t: z.string().regex(/^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$/) })

export async function POST(request: Request) {
  const g = await shopRequest(request, Body, LIMITS.emailDropsIp, true)
  if (!g.ok) return g.response
  try {
    const r = await consentToDrops(g.tenantId, g.body.o, g.body.t)
    return r === 'bad_link' ? reply({ error: 'This link has expired.' }, 404) : reply({ ok: true })
  } catch (err) { console.error('[shop/email-drops]', errName(err)); return reply({ error: 'We could not save that. Try again.' }, 500) }
}
