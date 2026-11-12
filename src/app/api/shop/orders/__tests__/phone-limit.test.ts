// The phone's order limit counts ORDERS (shopper batch 2026-11-12): every 409 "changed", refusal, busy, failure and
// network retry that finds its order gives its try back; only a placement that writes a new order keeps it. The per-IP
// cap (shopRequest) still counts every try, first. The limiter is an in-memory twin of rate_limits' fixed window.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const counts = new Map<string, number>()
vi.mock('@/lib/db/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/rate-limit')>()),
  withinLimit: vi.fn(async (l: { action: string; max: number }, subject: string) => { const k = `${l.action}:${subject}`; const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n <= l.max }),
  uncount: vi.fn(async (l: { action: string }, subject: string) => { const k = `${l.action}:${subject}`; counts.set(k, Math.max(0, (counts.get(k) ?? 0) - 1)) }),
}))
vi.mock('@/lib/http/shop-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/http/shop-api')>()),
  shopRequest: async (req: Request) => ({ ok: true, tenantId: 't1', host: 'kesar.frata.test', ip: '1.2.3.4', body: await req.json() }),
  codeToTry: async () => null, codeTried: async () => {}, publicQuote: () => ({}),
}))
const results: unknown[] = []
vi.mock('@/lib/orders/place', () => ({ placeOrder: vi.fn(async () => { const r = results.shift(); if (r instanceof Error) throw r; return r }) }))
vi.mock('@/lib/ekcode/handshake', () => ({ sessionToken: async () => null }))
vi.mock('@/lib/outbox/drain', () => ({ drainSoon: () => {} }))

const { POST } = await import('../route')
const body = { idempotencyKey: 'k'.repeat(22), bag: [{ variantId: '11111111-1111-4111-8111-111111111111', qty: 1 }], method: 'cod', expectedTotal: 99900,
  address: { name: 'Int Shopper', phone: '9829012345', addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan', email: '' } }
const tap = async (result: unknown) => { results.push(result); return (await POST(new Request('http://x/api/shop/orders', { method: 'POST', body: JSON.stringify(body) }))).status }
const placed = (fresh: boolean) => ({ kind: 'placed', token: 't', number: 1001, method: 'cod', total: 99900, pay: null, fresh })
const phoneCount = () => counts.get('shop_place:phone:t1:9829012345') ?? 0

describe('the phone limit counts orders, not taps', () => {
  beforeEach(() => { counts.clear(); results.length = 0 })
  it('a "changed", a refusal, a busy, a failure and a retry that finds its order all give the try back', async () => {
    expect(await tap({ kind: 'changed', quote: {} })).toBe(409)
    expect(await tap({ kind: 'refused', status: 422, error: 'no' })).toBe(422)
    expect(await tap({ kind: 'refused', status: 503, error: 'busy' })).toBe(503)
    expect(await tap(new Error('boom'))).toBe(500)
    expect(await tap(placed(false))).toBe(200)
    expect(phoneCount()).toBe(0)
  })
  it('five orders an hour, however many taps between them; the sixth order is refused', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await tap({ kind: 'changed', quote: {} })).toBe(409) // a price changed: not an order
      expect(await tap(placed(true))).toBe(200)
    }
    expect(phoneCount()).toBe(5)
    expect(await tap(placed(true))).toBe(429)
    expect(phoneCount()).toBe(5) // the refused try is given back too: the count is the orders
  })
})
