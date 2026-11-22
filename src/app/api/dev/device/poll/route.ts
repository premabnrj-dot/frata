import { isDeviceSecret } from '@/domains/storefront-api/device'
import { pollDeviceSignIn } from '@/lib/storefront-api/device'
import { ipFrom } from '@/lib/http/client-ip'
import { errName } from '@/lib/log'

// G·3: the CLI polls with its device secret (never logged). Pending until the person confirms; then the build key, once.
// Unknown, ended or already claimed: one 404. Limited per network and per device, failing closed. Never cached.
export const dynamic = 'force-dynamic'
export const maxDuration = 10
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

// Each answer keeps its code for machines and says in one line what the person at the CLI does next (words review).
const SAY = {
  too_large: 'That request was too large.', bad_request: 'Run `npx frrata dev <your store>` again.',
  busy: 'Too many tries. Wait a minute, then run it again.', unavailable: 'Frrata could not answer. Try again in a minute.',
  not_found: 'This sign-in ended. Run `npx frrata dev` again.', not_allowed: 'This sign-in was refused. Start again and confirm it in Frrata.',
} as const
const fail = (status: number, error: keyof typeof SAY) => json(status, { error, message: SAY[error] })
/** A body over 512 bytes is refused before it is read (security LOW-5). */
const tooBig = (req: Request) => Number(req.headers.get('content-length') ?? '0') > 512

export async function POST(req: Request): Promise<Response> {
  if (tooBig(req)) return fail(413, 'too_large')
  const raw = await req.text()
  if (raw.length > 512) return fail(413, 'too_large')
  let device: unknown
  try { device = (JSON.parse(raw) as { device?: unknown }).device } catch { return fail(400, 'bad_request') }
  if (!isDeviceSecret(device)) return fail(404, 'not_found')
  try {
    const r = await pollDeviceSignIn(device, ipFrom(req.headers))
    if (!r) return fail(404, 'not_found')
    if (r.status === 'pending') return json(202, { status: 'pending' })
    if (r.status === 'busy') return fail(429, 'busy')
    if (r.status === 'refused') return fail(403, 'not_allowed')
    return json(200, { key: r.key, expiresAt: r.expiresAt })
  } catch (err) {
    console.error('[device] poll', errName(err))
    return fail(500, 'unavailable')
  }
}
