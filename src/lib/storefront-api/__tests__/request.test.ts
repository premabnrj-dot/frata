import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { newKey } from '@/domains/storefront-api/keys'

const rows = new Map<string, { keyId: string; tenantId: string; kind: 'public' | 'test'; expiresAt: string | null }>()
const limits = { over: false, within: true }
vi.mock('@/lib/queries/storefront-keys', () => ({ storefrontKeyFor: vi.fn(async (k: string) => rows.get(k) ?? null) }))
vi.mock('@/lib/queries/storefront-api', () => ({ markKeySeen: vi.fn(async () => {}), siteOriginFor: vi.fn(async () => 'https://kesarstudio.in') }))
vi.mock('@/lib/db/rate-limit', () => ({
  LIMITS: { apiMissIp: {}, apiTestIp: {}, apiSearchIp: {} },
  overLimit: vi.fn(async () => limits.over),
  withinLimit: vi.fn(async () => limits.within),
}))
const { apiRequest } = await import('../request')
const limiter = await import('@/lib/db/rate-limit')
const seenApi = await import('@/lib/queries/storefront-api')

const rnd = (n: number) => new Uint8Array(randomBytes(n))
const LIVE = newKey('public', rnd), TEST = newKey('test', rnd), OTHER = newKey('public', rnd)
const A = '11111111-1111-1111-1111-111111111111'
const Shop = z.object({ name: z.string() }).strict()

// A Request whose every read throws: proves the cached (isr) tree never touches it.
const untouchable = () => new Proxy({} as Request, { get() { throw new Error('the ISR tree read the request') } })
const req = (h: Record<string, string> = {}, url = 'https://api.frrata.shop/2026-12/k/x/shop') => new Request(url, { headers: h })
const at = (key: string, more: Record<string, string> = {}) => ({ params: Promise.resolve({ key, ...more }) })

describe('apiRequest (ADR-0018 § 5)', () => {
  beforeEach(() => {
    rows.clear(); limits.over = false; limits.within = true
    rows.set(LIVE, { keyId: 'k1', tenantId: A, kind: 'public', expiresAt: null })
    rows.set(TEST, { keyId: 'k2', tenantId: A, kind: 'test', expiresAt: null })
  })
  const seenBy: string[] = []
  const live = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'shop', schema: Shop, run: async (ctx) => { seenBy.push(ctx.tenantId); return { name: 'Kesar Studio' } } })
  const test = apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: 'shop', schema: Shop, run: async () => ({ name: 'Kesar Studio' }) })

  it('answers a live key from its shop, never reading the request, CORS * and no cookie', async () => {
    const r = await live(untouchable(), at(LIVE))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ name: 'Kesar Studio' })
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
    expect(r.headers.get('access-control-allow-credentials')).toBeNull()
    expect(r.headers.get('set-cookie')).toBeNull()
    expect(r.headers.get('frrata-api-version')).toBe('2026-12')
    expect(seenBy.at(-1)).toBe(A)
  })
  it('gives one 404 body for a bad shape, an unknown key and the wrong tree', async () => {
    const bodies = new Set<string>()
    for (const [h, k] of [[live, 'frs_pub_nope'], [live, OTHER], [live, TEST], [test, LIVE]] as const) {
      const r = await h(h === live ? untouchable() : req(), at(k))
      expect(r.status).toBe(404)
      bodies.add(await r.text())
    }
    expect([...bodies]).toEqual(['{"error":"not_found"}'])
  })
  it('refuses a key whose definer row is of another kind', async () => {
    rows.set(LIVE, { keyId: 'k1', tenantId: A, kind: 'test', expiresAt: null })
    expect((await live(untouchable(), at(LIVE))).status).toBe(404)
  })
  it('never lets an answer leave unparsed: an extra field is a 500, not a leak', async () => {
    const leaky = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'shop', schema: Shop, run: async () => ({ name: 'x', cogs: 1 } as never) })
    const r = await leaky(untouchable(), at(LIVE))
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('cogs')
  })
  it('a test key: no-store, CORS only to the shop’s site or localhost', async () => {
    let r = await test(req({ origin: 'https://kesarstudio.in' }), at(TEST))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(r.headers.get('access-control-allow-origin')).toBe('https://kesarstudio.in')
    r = await test(req({ origin: 'http://localhost:3000' }), at(TEST))
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    for (const o of ['https://evil.in', 'null', 'http://localhost.evil.in', 'https://localhost:3000']) {
      r = await test(req({ origin: o }), at(TEST))
      expect(r.headers.get('access-control-allow-origin')).toBeNull()
    }
  })
  it('fails closed when a limit is over or can’t be read', async () => {
    limits.within = false
    expect((await test(req(), at(TEST))).status).toBe(429)
    limits.within = true; limits.over = true
    expect((await test(req(), at(TEST))).status).toBe(429)
  })
  it('public search reads its query and is cached by URL at the CDN', async () => {
    const search = apiRequest({ version: '2026-12', tree: 'live', mode: 'dynamic', resource: 'search', schema: z.object({ q: z.string() }).strict(), limit: 'search',
      params: (_r, s) => { const q = s?.get('q') ?? ''; return q.length >= 1 && q.length <= 60 ? { q } : null }, run: async (_c, p) => ({ q: p.q }) })
    const r = await search(req({}, 'https://api.frrata.shop/2026-12/k/x/search?q=kurta'), at(LIVE))
    expect(await r.json()).toEqual({ q: 'kurta' })
    expect(r.headers.get('cache-control')).toBe('public, s-maxage=60')
    expect((await search(req({}, 'https://api.frrata.shop/2026-12/k/x/search?q='), at(LIVE))).status).toBe(404)
  })
  it('counts a miss and checks every limit failing closed', async () => {
    vi.mocked(limiter.withinLimit).mockClear(); vi.mocked(limiter.overLimit).mockClear()
    await test(req(), at(newKey('test', rnd)))
    expect(vi.mocked(limiter.overLimit).mock.calls.every((c) => c[3] === true)).toBe(true)
    expect(vi.mocked(limiter.withinLimit).mock.calls.some((c) => c[0] === limiter.LIMITS.apiMissIp && c[3] === true)).toBe(true)
    vi.mocked(limiter.withinLimit).mockClear()
    await test(req(), at(TEST))
    expect(vi.mocked(limiter.withinLimit).mock.calls.length).toBeGreaterThan(0)
    expect(vi.mocked(limiter.withinLimit).mock.calls.every((c) => c[3] === true)).toBe(true)
  })
  it('null from run is the same 404; a test route declared cached is refused', async () => {
    const none = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'product', schema: Shop, run: async () => null })
    expect(await (await none(untouchable(), at(LIVE))).text()).toBe('{"error":"not_found"}')
    const wrong = apiRequest({ version: '2026-12', tree: 'test', mode: 'isr', resource: 'shop', schema: Shop, run: async () => ({ name: 'x' }) })
    expect((await wrong(req(), at(TEST))).status).toBe(404)
  })
  it('notes a key seen only on the cached tree', async () => {
    vi.mocked(seenApi.markKeySeen).mockClear()
    await live(untouchable(), at(LIVE))
    expect(seenApi.markKeySeen).toHaveBeenCalledTimes(1)
    await test(req(), at(TEST))
    expect(seenApi.markKeySeen).toHaveBeenCalledTimes(1)
  })
  it('refuses params that name a shop (the shop is ctx, from the key)', async () => {
    const bad = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'shop', schema: Shop, params: () => ({ shopId: 'x' }), run: async () => ({ name: 'x' }) })
    expect((await bad(untouchable(), at(LIVE))).status).toBe(500)
  })
})
