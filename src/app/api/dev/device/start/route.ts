import { isStoreSlug } from '@/domains/storefront-api/device'
import { ipFrom } from '@/lib/http/client-ip'
import { startDeviceSignIn } from '@/lib/storefront-api/device'
import { errName } from '@/lib/log'

// G·3: the CLI (`npm run frrata` in the starter; `npx frrata dev <store>` once published) starts a device sign-in. No sign-in here and no shop read: the answer is the
// same for any well-formed store name; the person confirms in Frrata, signed in. Limited per network, failing closed.
export const dynamic = 'force-dynamic'
export const maxDuration = 10
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

// Each answer keeps its code for machines and says in one line what the person at the CLI does next (words review).
const SAY = {
  too_large: 'Run `npm run frrata` again.', bad_request: 'Run `npm run frrata` again.',
  busy: 'Too many tries. Wait a minute, then run it again.', unavailable: 'Frrata could not answer. Try again in a minute.',
  not_found: 'This sign-in ended. Run `npm run frrata` again.', not_allowed: 'This sign-in was refused. Start again and confirm it in Frrata.',
} as const
const fail = (status: number, error: keyof typeof SAY) => json(status, { error, message: SAY[error] })
/** A body over 512 bytes is refused before it is read (security LOW-5). */
const tooBig = (req: Request) => Number(req.headers.get('content-length') ?? '0') > 512

export async function POST(req: Request): Promise<Response> {
  if (tooBig(req)) return fail(413, 'too_large')
  const raw = await req.text()
  if (raw.length > 512) return fail(413, 'too_large')
  let store: unknown
  try { store = (JSON.parse(raw) as { store?: unknown }).store } catch { return fail(400, 'bad_request') }
  if (!isStoreSlug(store)) return fail(400, 'bad_request')
  try {
    const started = await startDeviceSignIn(store, ipFrom(req.headers))
    return started ? json(200, started) : fail(429, 'busy')
  } catch (err) {
    console.error('[device] start', errName(err))
    return fail(500, 'unavailable')
  }
}
