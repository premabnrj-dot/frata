import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { newKey } from '@/domains/storefront-api/keys'

const rows = new Map<string, { keyId: string; tenantId: string; kind: 'public' | 'test' | 'build'; expiresAt: string | null }>()
const limits = { over: false, within: true }
vi.mock('@/lib/queries/storefront-keys', () => ({ keyHash: (k: string) => `h:${k}`, storefrontKeyFor: vi.fn(async (k: string) => rows.get(k) ?? null), storefrontKeyNow: vi.fn(async (k: string) => rows.get(k) ?? null) }))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<object>()), STOREFRONT_PREVIEW_KEY: Buffer.alloc(32, 7) }))
vi.mock('@/lib/queries/storefront-api', () => ({ markKeySeen: vi.fn(async () => {}), siteOriginFor: vi.fn(async () => 'https://kesarstudio.in') }))
vi.mock('@/lib/db/rate-limit', () => ({
  LIMITS: { apiMissIp: { n: 'missIp' }, apiMissKey: { n: 'missKey' }, apiTestKey: { n: 'testKey' }, apiSearchIp: { n: 'searchIp' }, apiPreviewKey: { n: 'previewKey' } },
  overLimit: vi.fn(async () => limits.over),
  withinLimit: vi.fn(async () => limits.within),
}))
const { apiRequest } = await import('../request')
const limiter = await import('@/lib/db/rate-limit')
const seenApi = await import('@/lib/queries/storefront-api')

const rnd = (n: number) => new Uint8Array(randomBytes(n))
const LIVE = newKey('public', rnd), TEST = newKey('test', rnd), OTHER = newKey('public', rnd), BUILD = newKey('build', rnd)
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
    rows.set(BUILD, { keyId: 'k3', tenantId: A, kind: 'build', expiresAt: null })
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
  it('never lets an answer leave unparsed: an extra field fails, never leaks', async () => {
    const leaky = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'shop', schema: Shop, run: async () => ({ name: 'x', cogs: 1 } as never) })
    // A cached route throws (Next keeps its last good copy, nothing is sent); a test route answers 500. Never the field.
    await expect(leaky(untouchable(), at(LIVE))).rejects.toThrow()
    const leakyTest = apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: 'shop', schema: Shop, run: async () => ({ name: 'x', cogs: 1 } as never) })
    const r = await leakyTest(req(), at(TEST))
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
  it('a filter grammar error is a 400 naming the parameter, cleaned, only after the key checks out', async () => {
    const { BadParam } = await import('../request')
    const filter = apiRequest({ version: '2026-12', tree: 'live', mode: 'dynamic', resource: 'filter', schema: z.object({ n: z.number() }).strict(), limit: 'search',
      params: (_r, s) => (s?.has('evil') ? new BadParam('ev<il>"x') : { n: 1 }), run: async (_c, p) => p })
    const r = await filter(req({}, 'https://api.frrata.shop/2026-12/k/x/filter/page/1?evil=1'), at(LIVE))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'bad_filter', param: 'evilx' })
    expect((await filter(req({}, 'https://api.frrata.shop/2026-12/k/x/filter/page/1?evil=1'), at(OTHER))).status).toBe(404)
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
  it('G·1: a test key is limited per key only, its search too; a live key’s search per network', async () => {
    vi.mocked(limiter.withinLimit).mockClear()
    const search = apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: 'search', schema: Shop, limit: 'search', run: async () => ({ name: 'x' }) })
    expect((await search(req({ 'x-forwarded-for': '203.0.113.9' }), at(TEST))).status).toBe(200)
    const calls = vi.mocked(limiter.withinLimit).mock.calls
    expect(calls.map((c) => [c[0], c[1]])).toEqual([[limiter.LIMITS.apiTestKey, 'k2']])
    vi.mocked(limiter.withinLimit).mockClear()
    const liveSearch = apiRequest({ version: '2026-12', tree: 'live', mode: 'dynamic', resource: 'search', schema: Shop, limit: 'search', run: async () => ({ name: 'x' }) })
    expect((await liveSearch(req(), at(LIVE))).status).toBe(200)
    expect(vi.mocked(limiter.withinLimit).mock.calls.map((c) => c[0])).toEqual([limiter.LIMITS.apiSearchIp])
  })
  it('G·1: a miss counts per network and per key hash; a hash over its count is refused before any lookup', async () => {
    vi.mocked(limiter.withinLimit).mockClear()
    const stale = newKey('test', rnd)
    await test(req(), at(stale))
    expect(vi.mocked(limiter.withinLimit).mock.calls.map((c) => [c[0], c[1]])).toEqual(expect.arrayContaining([[limiter.LIMITS.apiMissKey, `h:${stale}`], [limiter.LIMITS.apiMissIp, expect.any(String)]]))
    const keys = await import('@/lib/queries/storefront-keys')
    vi.mocked(keys.storefrontKeyFor).mockClear()
    vi.mocked(limiter.overLimit).mockImplementation(async (l, subject) => l === limiter.LIMITS.apiMissKey && subject === `h:${stale}`)
    try {
      expect((await test(req(), at(stale))).status).toBe(429)
      expect(keys.storefrontKeyFor).not.toHaveBeenCalled()
      expect((await test(req(), at(TEST))).status).toBe(200) // another key on the same network still reads
    } finally { vi.mocked(limiter.overLimit).mockImplementation(async () => limits.over) }
    // both miss counts are asked failing closed; the network over its count refuses whatever the hash's count says
    vi.mocked(limiter.overLimit).mockClear()
    vi.mocked(limiter.overLimit).mockImplementation(async (l) => l === limiter.LIMITS.apiMissIp)
    try {
      expect((await test(req(), at(TEST))).status).toBe(429)
      expect(vi.mocked(limiter.overLimit).mock.calls.map((c) => [c[0], c[3]])).toEqual(expect.arrayContaining([[limiter.LIMITS.apiMissKey, true], [limiter.LIMITS.apiMissIp, true]]))
    } finally { vi.mocked(limiter.overLimit).mockImplementation(async () => limits.over) }
  })
  it('G·1: a test key past its own count is busy; a live key’s search past its network’s count is busy', async () => {
    vi.mocked(limiter.withinLimit).mockImplementation(async (l) => l !== limiter.LIMITS.apiTestKey)
    try { expect((await test(req(), at(TEST))).status).toBe(429) } finally { vi.mocked(limiter.withinLimit).mockImplementation(async () => limits.within) }
    const liveSearch = apiRequest({ version: '2026-12', tree: 'live', mode: 'dynamic', resource: 'search', schema: Shop, limit: 'search', run: async () => ({ name: 'x' }) })
    vi.mocked(limiter.withinLimit).mockImplementation(async (l) => l !== limiter.LIMITS.apiSearchIp)
    try { expect((await liveSearch(req(), at(LIVE))).status).toBe(429) } finally { vi.mocked(limiter.withinLimit).mockImplementation(async () => limits.within) }
  })
  describe('the header tree (G·2; ADR-0018’s build-key amendment)', () => {
    const h = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'shop', schema: Shop, run: async (ctx) => { seenBy.push(`${ctx.keyKind}:${ctx.tenantId}`); return { name: 'Kesar Studio' } } })
    const noKey = { params: Promise.resolve({}) }
    it('reads a build key from Frrata-Key: private, no-store, Vary on the header, no CORS header at all', async () => {
      const keys = await import('@/lib/queries/storefront-keys')
      vi.mocked(keys.storefrontKeyFor).mockClear(); vi.mocked(keys.storefrontKeyNow).mockClear()
      const r = await h(req({ 'Frrata-Key': BUILD, Origin: 'http://localhost:3000' }), noKey)
      expect(r.status).toBe(200)
      expect(seenBy.at(-1)).toBe(`build:${A}`)
      expect(r.headers.get('cache-control')).toBe('private, no-store')
      expect(r.headers.get('vary')).toBe('Frrata-Key')
      expect([...r.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([])
      expect(r.headers.get('set-cookie')).toBeNull()
      // looked up uncached: a deleted key or a removed maker stops at once
      expect(keys.storefrontKeyNow).toHaveBeenCalled()
      expect(keys.storefrontKeyFor).not.toHaveBeenCalled()
      expect(vi.mocked(seenApi.markKeySeen).mock.calls.at(-1)?.[0]).toMatchObject({ keyId: 'k3' })
    })
    it('one 404 for no header, a key of another kind, a build key in a path tree, a definer row of another kind', async () => {
      const bodies = new Set<string>()
      for (const r of [await h(req(), noKey), await h(req({ 'Frrata-Key': TEST }), noKey), await h(req({ 'Frrata-Key': LIVE }), noKey),
        await test(req(), at(BUILD)), await live(untouchable(), at(BUILD)), await h(req({ 'Frrata-Key': 'frs_build_nope' }), noKey)]) {
        expect(r.status).toBe(404)
        bodies.add(await r.text())
      }
      rows.set(BUILD, { keyId: 'k3', tenantId: A, kind: 'test', expiresAt: null })
      expect((await h(req({ 'Frrata-Key': BUILD }), noKey)).status).toBe(404)
      expect([...bodies]).toEqual(['{"error":"not_found"}'])
    })
    it('is limited per key only, its search too, failing closed; never cached or token-bound', async () => {
      vi.mocked(limiter.withinLimit).mockClear()
      const search = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'search', schema: Shop, limit: 'search', run: async () => ({ name: 'x' }) })
      expect((await search(req({ 'Frrata-Key': BUILD }), noKey)).status).toBe(200)
      expect(vi.mocked(limiter.withinLimit).mock.calls.map((c) => [c[0], c[1], c[3]])).toEqual([[limiter.LIMITS.apiTestKey, 'k3', true]])
      vi.mocked(limiter.withinLimit).mockImplementation(async (l) => l !== limiter.LIMITS.apiTestKey)
      try { expect((await h(req({ 'Frrata-Key': BUILD }), noKey)).status).toBe(429) } finally { vi.mocked(limiter.withinLimit).mockImplementation(async () => limits.within) }
      const cached = apiRequest({ version: '2026-12', tree: 'header', mode: 'isr', resource: 'shop', schema: Shop, run: async () => ({ name: 'x' }) })
      expect((await cached(req({ 'Frrata-Key': BUILD }), noKey)).status).toBe(404)
    })
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

  describe('preview (ADR-0018 § 12; SA1b D·4)', () => {
    const page = apiRequest({ version: '2026-12', tree: 'live', mode: 'preview', resource: 'preview_page', schema: Shop,
      params: (raw) => (typeof raw.handle === 'string' ? { handle: raw.handle } : null), entry: (p: { handle: string }) => `page:${p.handle}` as const,
      run: async () => ({ name: 'Draft about' }) })
    const tok = async (scope: { tenantId: string; keyId: string }, entry: 'faq' | `page:${string}`, now = new Date()) =>
      (await import('../preview-token')).signPreview(scope, entry, now)!
    const pr = (token?: string) => req(token ? { 'frrata-preview': token } : {})
    it('a live key with a token for this store, key and page reads the draft, never cached, no CORS', async () => {
      vi.mocked(seenApi.markKeySeen).mockClear()
      const r = await page(pr(await tok({ tenantId: A, keyId: 'k1' }, 'page:about')), at(LIVE, { handle: 'about' }))
      expect(r.status).toBe(200)
      expect(r.headers.get('cache-control')).toBe('private, no-store')
      expect(r.headers.get('access-control-allow-origin')).toBeNull()
      expect(seenApi.markKeySeen).not.toHaveBeenCalled()
    })
    it('no token, another page, another key, another store, an old or tampered token: the one 404', async () => {
      const bodies = new Set<string>()
      const past = new Date(Date.now() - 11 * 60_000)
      for (const t of [undefined, await tok({ tenantId: A, keyId: 'k1' }, 'page:other'), await tok({ tenantId: A, keyId: 'k2' }, 'page:about'),
        await tok({ tenantId: '22222222-2222-2222-2222-222222222222', keyId: 'k1' }, 'page:about'), await tok({ tenantId: A, keyId: 'k1' }, 'page:about', past), 'v1.abc.def']) {
        const r = await page(pr(t), at(LIVE, { handle: 'about' }))
        expect(r.status).toBe(404)
        bodies.add(await r.text())
      }
      const good = await tok({ tenantId: A, keyId: 'k1' }, 'page:about')
      const [v, p, sig] = good.split('.')
      for (const bad of [`${v}.${p}.${sig!.slice(0, 42)}${sig!.at(-1) === "A" ? "E" : "A"}`, `${v}.${p}x.${sig}`, `${v}.${p}.${sig}=`]) {
        const r = await page(pr(bad), at(LIVE, { handle: 'about' }))
        expect(r.status).toBe(404)
        bodies.add(await r.text())
      }
      expect([...bodies]).toEqual(['{"error":"not_found"}'])
    })
    it('is limited per key and fails closed', async () => {
      limits.within = false
      expect((await page(pr(await tok({ tenantId: A, keyId: 'k1' }, 'page:about')), at(LIVE, { handle: 'about' }))).status).toBe(429)
    })
  })
})
