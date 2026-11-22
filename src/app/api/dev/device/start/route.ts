import { isStoreSlug } from '@/domains/storefront-api/device'
import { ipFrom } from '@/lib/http/client-ip'
import { startDeviceSignIn } from '@/lib/storefront-api/device'
import { errName } from '@/lib/log'

// G·3: the CLI (`npx frrata dev <store>`) starts a device sign-in. No sign-in here and no shop read: the answer is the
// same for any well-formed store name; the person confirms in Frrata, signed in. Limited per network, failing closed.
export const dynamic = 'force-dynamic'
export const maxDuration = 10
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text()
  if (raw.length > 512) return json(413, { error: 'too_large' })
  let store: unknown
  try { store = (JSON.parse(raw) as { store?: unknown }).store } catch { return json(400, { error: 'bad_request' }) }
  if (!isStoreSlug(store)) return json(400, { error: 'bad_request' })
  try {
    const started = await startDeviceSignIn(store, ipFrom(req.headers))
    return started ? json(200, started) : json(429, { error: 'busy' })
  } catch (err) {
    console.error('[device] start', errName(err))
    return json(500, { error: 'unavailable' })
  }
}
