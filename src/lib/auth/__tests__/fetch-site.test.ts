// P4a·2 (one-address spec § 6): a shop request another site sent — a sibling store under frrata.shop is `same-site` —
// is logged a week, then refused; absent passes; EkCode's return and the beacon are exempt by name.
import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/public-env', () => ({ CONSOLE_HOST: 'localhost:3077', SHOP_DOMAIN: 'frrata.shop', API_HOST: 'api.frrata.shop', EKCODE_HOST: 'ekcode.in' }))
const shopIdForHost = vi.fn(async (_host: string) => 't-amber')
vi.mock('@/lib/queries/storefront', () => ({ shopIdForHost }))

const req = (path: string, init: { method?: string; site?: string | null; origin?: string } = {}) => {
  const headers: Record<string, string> = { host: 'amber.frrata.shop' }
  if (init.site) headers['sec-fetch-site'] = init.site
  if (init.origin) headers.origin = init.origin
  return new Request(`https://amber.frrata.shop${path}`, { method: init.method ?? 'GET', headers })
}

describe('fetchSiteVerdict', async () => {
  const { fetchSiteVerdict, fetchSiteAction, FETCH_SITE_EXEMPT, FETCH_SITE_MODE } = await import('../fetch-site')
  it('same-origin and absent pass; same-site, cross-site, none and junk are refused', () => {
    expect(fetchSiteVerdict('same-origin', 'POST', '/api/shop/orders')).toEqual({ refuse: false, why: 'same-origin' })
    expect(fetchSiteVerdict(null, 'POST', '/api/shop/orders')).toEqual({ refuse: false, why: 'absent' })
    for (const s of ['same-site', 'cross-site', 'none', 'SAME-SITE', 'weird'])
      expect(fetchSiteVerdict(s, 'GET', '/api/shop/ekcode/me').refuse).toBe(true)
  })
  it('a refusal names the site from a fixed set, so junk headers cannot make new log lines', () => {
    expect(fetchSiteVerdict('junk-' + 'x'.repeat(50), 'GET', '/x')).toEqual({ refuse: true, site: 'other' })
    expect(fetchSiteVerdict(' Cross-Site ', 'GET', '/x')).toEqual({ refuse: true, site: 'cross-site' })
  })
  it('each exemption is a real route that exports its method (a move would refuse EkCode sign-in silently)', () => {
    for (const e of FETCH_SITE_EXEMPT) {
      const file = `src/app${e.path}/route.ts`
      expect(existsSync(file), file).toBe(true)
      expect(readFileSync(file, 'utf8')).toMatch(new RegExp(`export (async function|const) ${e.method}\\b`))
    }
  })
  it('the two named exemptions, by exact method and path only', () => {
    expect(fetchSiteVerdict('cross-site', 'GET', '/api/shop/ekcode/return')).toEqual({ refuse: false, why: 'exempt' })
    expect(fetchSiteVerdict('same-site', 'POST', '/api/shop/e')).toEqual({ refuse: false, why: 'exempt' })
    expect(fetchSiteVerdict('cross-site', 'POST', '/api/shop/ekcode/return').refuse).toBe(true)
    expect(fetchSiteVerdict('same-site', 'POST', '/api/shop/ekcode/me').refuse).toBe(true)
    expect(FETCH_SITE_EXEMPT.map((e) => e.path)).toEqual(['/api/shop/ekcode/return', '/api/shop/e'])
    expect(FETCH_SITE_EXEMPT.every((e) => e.why.length > 20)).toBe(true)
  })
  it('ships log-only; enforce refuses', () => {
    expect(FETCH_SITE_MODE).toBe('log')
    const bad = fetchSiteVerdict('same-site', 'POST', '/api/shop/orders')
    expect(fetchSiteAction(bad, 'log')).toEqual({ act: 'log', site: 'same-site' })
    expect(fetchSiteAction(bad, 'enforce')).toEqual({ act: 'refuse' })
    expect(fetchSiteAction(fetchSiteVerdict('same-origin', 'POST', '/x'), 'enforce')).toEqual({ act: 'pass' })
  })
  it('logs a key once a minute', async () => {
    const { logOnce } = await import('../fetch-site')
    expect(logOnce('k', 1_000)).toBe(true)
    expect(logOnce('k', 30_000)).toBe(false)
    expect(logOnce('k', 62_000)).toBe(true)
  })
  it('holds at most 200 keys, dropping the oldest', async () => {
    const { logOnce } = await import('../fetch-site')
    expect(logOnce('first', 100_000)).toBe(true)
    for (let i = 0; i < 200; i++) logOnce(`k${i}`, 100_000)
    expect(logOnce('first', 100_001)).toBe(true) // evicted, so logged again
    expect(logOnce('k199', 100_001)).toBe(false)
  })
  it('the path in the log line is route-shaped, else other', async () => {
    const { logPath } = await import('../fetch-site')
    expect(logPath('/api/shop/ekcode/me')).toBe('/api/shop/ekcode/me')
    expect(logPath('/api/shop/orders/view/Abc123tokenxyz')).toBe('other')
    expect(logPath('/api/shop/%0d%0aevil')).toBe('other')
  })
  it('the mode in the log line is from a fixed set', async () => {
    const { fetchMode } = await import('../fetch-site')
    expect(fetchMode('NO-CORS')).toBe('no-cors')
    expect(fetchMode('<script>')).toBe('other')
    expect(fetchMode(null)).toBe('')
  })
})

describe('requireShop and Sec-Fetch-Site', () => {
  beforeEach(() => { vi.resetModules(); vi.doUnmock('../fetch-site'); shopIdForHost.mockClear() })

  it('log mode: a sibling store’s request is answered as before, and one line says which kind, without the host', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { requireShop } = await import('../require-shop')
    expect(await requireShop(req('/api/shop/ekcode/me', { site: 'same-site' }))).toMatchObject({ ok: true, tenantId: 't-amber' })
    expect(warn).toHaveBeenCalledWith('[fetch-site] would refuse', 'same-site', 'GET', '/api/shop/ekcode/me', '')
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/amber/)
    warn.mockRestore()
  })
  it('log mode is silent for same-origin, absent and exempt requests', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { requireShop } = await import('../require-shop')
    await requireShop(req('/api/shop/ekcode/me', { site: 'same-origin' }))
    await requireShop(req('/api/shop/ekcode/me'))
    await requireShop(req('/api/shop/ekcode/return', { site: 'cross-site' }))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
  it('log mode keeps the Origin check: a sibling’s POST is still refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { requireShop } = await import('../require-shop')
    expect(await requireShop(req('/api/shop/orders', { method: 'POST', site: 'same-site', origin: 'https://basil.frrata.shop' }))).toEqual({ ok: false, status: 403, error: 'Not allowed' })
    warn.mockRestore()
  })

  describe('enforce mode', () => {
    beforeEach(() => {
      vi.doMock('../fetch-site', async (orig) => ({ ...(await orig<typeof import('../fetch-site')>()), FETCH_SITE_MODE: 'enforce' }))
    })
    it('refuses same-site, cross-site and none on personal and state-changing routes, before any lookup', async () => {
      const { requireShop } = await import('../require-shop')
      for (const site of ['same-site', 'cross-site', 'none']) {
        expect(await requireShop(req('/api/shop/ekcode/me', { site }))).toEqual({ ok: false, status: 403, error: 'Not allowed' })
        expect(await requireShop(req('/api/shop/ekcode/start', { site }))).toEqual({ ok: false, status: 403, error: 'Not allowed' })
        expect(await requireShop(req('/api/shop/orders/view', { method: 'POST', site, origin: 'https://amber.frrata.shop' }))).toEqual({ ok: false, status: 403, error: 'Not allowed' })
      }
      expect(shopIdForHost).not.toHaveBeenCalled()
    })
    it('passes same-origin, an absent header (iOS before 16.4), EkCode’s return and the beacon', async () => {
      const { requireShop } = await import('../require-shop')
      expect(await requireShop(req('/api/shop/ekcode/me', { site: 'same-origin' }))).toMatchObject({ ok: true })
      expect(await requireShop(req('/api/shop/orders', { method: 'POST', origin: 'https://amber.frrata.shop' }))).toMatchObject({ ok: true })
      expect(await requireShop(req('/api/shop/ekcode/return', { site: 'cross-site' }))).toMatchObject({ ok: true })
      // The beacon's own requests are same-origin; a header forced to anything else (an extension, a proxy) still passes.
      expect(await requireShop(req('/api/shop/e', { method: 'POST', site: 'cross-site', origin: 'https://amber.frrata.shop' }))).toMatchObject({ ok: true })
    })
    it('how the routes answer a refusal: start goes back to checkout, a shop POST is 403 JSON', async () => {
      vi.doMock('@/lib/db/platform', () => ({ tenantForHost: vi.fn() }))
      vi.doMock('@/lib/http/client-ip', () => ({ clientIp: async () => '1.2.3.4' }))
      vi.doMock('@/lib/db/rate-limit', () => ({ LIMITS: {}, withinLimit: vi.fn(async () => true), overLimit: vi.fn() }))
      vi.doMock('@/lib/ekcode/handshake', () => ({ beginAtShop: vi.fn() }))
      vi.doMock('@/lib/ekcode/cookie-name', () => ({ scheme: () => 'https' }))
      vi.doMock('@/lib/modules/ekcode/gate', () => ({ ekcodeOnAt: vi.fn() }))
      const { GET } = await import('@/app/api/shop/ekcode/start/route')
      const r = await GET(req('/api/shop/ekcode/start', { site: 'same-site' }))
      expect(r.status).toBe(303)
      expect(r.headers.get('location')).toBe('/checkout')
      const { shopRequest } = await import('@/lib/http/shop-api')
      const { z } = await import('zod')
      const s = await shopRequest(req('/api/shop/quote', { method: 'POST', site: 'same-site', origin: 'https://amber.frrata.shop' }), z.object({}), {} as never)
      expect(s.ok).toBe(false)
      if (!s.ok) { expect(s.response.status).toBe(403); expect(await s.response.json()).toEqual({ error: 'Not allowed' }) }
    })
    it('a host that is no shop is still 404 first', async () => {
      const { requireShop } = await import('../require-shop')
      const r = new Request('https://ekcode.in/api/shop/ekcode/me', { headers: { host: 'ekcode.in', 'sec-fetch-site': 'cross-site' } })
      expect(await requireShop(r)).toMatchObject({ ok: false, status: 404 })
    })
  })
})
