import 'server-only'
import { after } from 'next/server'
import { agentOf, isBot } from '@/domains/analytics/device'
import { BeaconZ, cityOf, MAX_BODY_BYTES, toBatch } from '@/domains/analytics/event'
import { visitorInput } from '@/domains/analytics/visitor'
import { requireShop } from '@/lib/auth/require-shop'
import { ingestBatch } from '@/lib/db/analytics'
import { isCountingVisits } from '@/lib/env'
import { ipBucket } from '@/lib/http/client-ip'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/analytics/ingest.ts — /api/shop/e, the visit beacon's ingest (A·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md,
// A2·2 amendment with its speed and security reviews). Public and unauthenticated, so it is the cheapest request we
// have and the most suspicious: every check that needs only headers runs before the shop lookup, the lookup is the
// cached one (requireShop: 60 s), the body is read with a running count, and the insert runs after the answer.
// Nothing it stores names a person: the network and User-Agent become a daily-salted hash in the analytics database.
// It answers 404 before reading anything while counting is off (security HIGH-1).
// =============================================================================

const PER_IP_MINUTE = 120
const PER_SHOP_MINUTE = 6_000
const KEYS = 5_000

/** A fixed-window counter per key for one minute, bounded: the oldest key goes when the map is full (an LRU by insertion). */
function windowCap(limit: number) {
  const m = new Map<string, { n: number; until: number }>()
  return (key: string, now: number) => {
    let c = m.get(key)
    if (!c || c.until <= now) {
      m.delete(key)
      if (m.size >= KEYS) m.delete(m.keys().next().value!)
      c = { n: 0, until: now + 60_000 }
      m.set(key, c)
    }
    return ++c.n <= limit
  }
}
const ipOk = windowCap(PER_IP_MINUTE)
const shopOk = windowCap(PER_SHOP_MINUTE)
/** Hosts that are no shop, for 60 s: random names under a wildcard domain must not each reach the database. */
const misses = new Map<string, number>()

const empty = (status: number) => new Response(null, { status, headers: { 'cache-control': 'no-store' } })

/** The body, refused past the cap as it streams (a missing or lying Content-Length can't get past it). */
async function readCapped(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.byteLength }
  return new TextDecoder().decode(all)
}

export async function ingest(request: Request): Promise<Response> {
  if (!isCountingVisits()) return empty(404)
  const h = request.headers
  const type = h.get('content-type') ?? ''
  if (!/^(text\/plain|application\/json)\b/.test(type)) return empty(415)
  const host = (h.get('host') ?? '').toLowerCase().replace(/:\d+$/, '')
  let sameOrigin = false
  try { sameOrigin = new URL(h.get('origin') ?? '').hostname === host } catch { sameOrigin = false }
  if (!host || !sameOrigin) return empty(403)
  const ua = h.get('user-agent') ?? ''
  if (isBot(ua)) return empty(204) // dropped without saying so
  const now = Date.now()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '').trim()
  if (!ipOk(ipBucket(ip || 'unknown'), now)) return empty(429)
  if (Number(h.get('content-length') ?? 0) > MAX_BODY_BYTES) return empty(413)
  const missed = misses.get(host)
  if (missed && missed > now) return empty(404)
  const shop = await requireShop(request)
  if (!shop.ok) {
    if (shop.status === 404) { if (misses.size >= KEYS) misses.delete(misses.keys().next().value!); misses.set(host, now + 60_000) }
    return empty(shop.status)
  }
  if (!shopOk(shop.tenantId, now)) return empty(429)
  const text = await readCapped(request).catch(() => null)
  if (text === null) return empty(413)
  let json: unknown
  try { json = JSON.parse(text) } catch { return empty(400) }
  const beacon = BeaconZ.safeParse(json)
  if (!beacon.success) return empty(400)
  // Everything the insert needs is taken now: nothing is read from the request, or shared between requests, later.
  const tenantId = shop.tenantId
  const input = visitorInput(ip, ua)
  const batch = toBatch(beacon.data, agentOf(ua), cityOf(h.get('x-vercel-ip-city')))
  after(() => ingestBatch(tenantId, input, batch).then(() => undefined, (e) => console.error('[ingest]', errName(e))))
  return empty(204)
}
