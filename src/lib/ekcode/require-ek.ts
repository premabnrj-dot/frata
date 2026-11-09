import 'server-only'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { EKCODE_HOST } from '@/lib/public-env'
import { clientIp } from '@/lib/http/client-ip'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { ekcodeConfigured } from './keys'
import { scheme } from './cookie-name'

// =============================================================================
// FILE: src/lib/ekcode/require-ek.ts — THE CHECK EVERY EKCODE.IN API CALL PASSES (security review H1, M1): the request
// is for EkCode's host; a POST comes from EkCode's own page (Origin, Sec-Fetch-Site) as small JSON; the network is
// under its limit (fail closed). Replies are never cached.
// =============================================================================

export const noStore = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }
export const ekReply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore })

export async function requireEk<T extends z.ZodTypeAny>(request: Request, schema: T | null):
  Promise<{ ok: true; body: z.output<T>; net: string } | { ok: false; response: NextResponse }> {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '')
  if (!EKCODE_HOST || host !== EKCODE_HOST || !ekcodeConfigured()) return { ok: false, response: ekReply({ error: 'Not found' }, 404) }
  if (request.method !== 'GET') {
    const site = request.headers.get('sec-fetch-site')
    if (request.headers.get('origin') !== `${scheme()}://${EKCODE_HOST}` || (site && site !== 'same-origin')) return { ok: false, response: ekReply({ error: 'Not allowed' }, 403) }
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return { ok: false, response: ekReply({ error: 'Bad request' }, 400) }
  }
  const net = await clientIp()
  if (!(await withinLimit(LIMITS.ekApiIp, net, new Date(), true))) return { ok: false, response: ekReply({ error: 'Too many tries from here. Wait a few minutes.' }, 429) }
  if (!schema) return { ok: true, body: undefined as z.output<T>, net }
  let json: unknown
  try {
    const text = await request.text()
    if (text.length > 4096) return { ok: false, response: ekReply({ error: 'Too large' }, 413) }
    json = JSON.parse(text)
  } catch { return { ok: false, response: ekReply({ error: 'Bad request' }, 400) } }
  const parsed = schema.safeParse(json)
  return parsed.success ? { ok: true, body: parsed.data, net } : { ok: false, response: ekReply({ error: 'Bad request' }, 400) }
}
