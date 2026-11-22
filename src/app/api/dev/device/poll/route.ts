import { isDeviceSecret } from '@/domains/storefront-api/device'
import { pollDeviceSignIn } from '@/lib/storefront-api/device'
import { ipFrom } from '@/lib/http/client-ip'
import { errName } from '@/lib/log'

// G·3: the CLI polls with its device secret (never logged). Pending until the person confirms; then the build key, once.
// Unknown, ended or already claimed: one 404. Limited per network and per device, failing closed. Never cached.
export const dynamic = 'force-dynamic'
export const maxDuration = 10
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text()
  if (raw.length > 512) return json(413, { error: 'too_large' })
  let device: unknown
  try { device = (JSON.parse(raw) as { device?: unknown }).device } catch { return json(400, { error: 'bad_request' }) }
  if (!isDeviceSecret(device)) return json(404, { error: 'not_found' })
  try {
    const r = await pollDeviceSignIn(device, ipFrom(req.headers))
    if (!r) return json(404, { error: 'not_found' })
    if (r.status === 'pending') return json(202, { status: 'pending' })
    if (r.status === 'busy') return json(429, { error: 'busy' })
    if (r.status === 'refused') return json(403, { error: 'not_allowed' })
    return json(200, { key: r.key, expiresAt: r.expiresAt })
  } catch (err) {
    console.error('[device] poll', errName(err))
    return json(500, { error: 'unavailable' })
  }
}
