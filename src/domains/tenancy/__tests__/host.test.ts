import { describe, expect, it } from 'vitest'
import { routeFor, shopRewrites, shopSlugFromHost, platformHost, surfaceFor } from '../host'

describe('surfaceFor', () => {
  it('knows the console', () => {
    expect(surfaceFor('app.frata.in', 'app.frata.in')).toEqual({ kind: 'console' })
    expect(surfaceFor('APP.frata.in:443', 'app.frata.in')).toEqual({ kind: 'console' })
  })
  it('treats Vercel aliases as the console', () => {
    expect(surfaceFor('frata-git-main.vercel.app', 'app.frata.in')).toEqual({ kind: 'console' })
  })
  it('treats every other host as a storefront, normalised', () => {
    expect(surfaceFor('Shop.Brand.in.', 'app.frata.in')).toEqual({ kind: 'storefront', host: 'shop.brand.in' })
  })
  it('treats localhost as local', () => {
    expect(surfaceFor('localhost:3000', 'app.frata.in')).toEqual({ kind: 'local' })
    expect(surfaceFor(null, 'app.frata.in')).toEqual({ kind: 'local' })
  })
})

describe('shopSlugFromHost', () => {
  it('reads the slug of a platform address', () => {
    expect(shopSlugFromHost('kesar.frata.store', 'frata.store')).toBe('kesar')
    expect(shopSlugFromHost('KESAR.frata.store.', 'frata.store')).toBe('kesar')
    expect(shopSlugFromHost('kesar.frata.store:443', 'frata.store')).toBe('kesar')
  })
  it('is null for own domains, the bare domain and nested labels', () => {
    expect(shopSlugFromHost('shop.kesar.in', 'frata.store')).toBeNull()
    expect(shopSlugFromHost('frata.store', 'frata.store')).toBeNull()
    expect(shopSlugFromHost('a.b.frata.store', 'frata.store')).toBeNull()
    expect(shopSlugFromHost('evilfrata.store', 'frata.store')).toBeNull()
    // The one builder and the one reader agree (shop addresses D·0).
    expect(shopSlugFromHost(platformHost('kesar-studio', 'FRRATA.shop'), 'frrata.shop')).toBe('kesar-studio')
  })
})

describe('routeFor and shopRewrites: /s/ is reachable only through the rewrite', () => {
  const C = 'app.frata.in'
  it('passes a shop host to the rewrite, refuses a malformed one', async () => {
    const { routeFor } = await import('../host')
    expect(routeFor('kesar.frata.store', '/products/kurta', C, false, 'frata.store')).toEqual({ kind: 'shop' })
    // The bare shop domain holds no shop: its home page is Frrata's own site, every other path is sent there
    // instead; its subdomains stay shops.
    expect(routeFor('frata.store', '/', C, false, 'frata.store')).toEqual({ kind: 'platform_site' })
    expect(routeFor('FRATA.STORE:443', '/x', C, false, 'frata.store')).toEqual({ kind: 'platform_apex' })
    expect(routeFor('kesar.frata.store', '/', C, false, 'frata.store')).toEqual({ kind: 'shop' })
    expect(routeFor('kesar.frata.store', '/s/b.frata.store/products/x.png', C, false, 'frata.store')).toEqual({ kind: 'shop' })
    expect(routeFor('x/../kesar.frata.store', '/', C, false, 'frata.store')).toEqual({ kind: 'not_found' })
  })
  it('404s /s/ on the console, vercel.app and localhost in production', async () => {
    const { routeFor } = await import('../host')
    for (const h of [C, 'frata.vercel.app', 'localhost:3000', '127.0.0.1', null]) {
      expect(routeFor(h, '/s/b.frata.store/products/x.png', C, false, 'frata.store')).toEqual({ kind: 'not_found' })
      expect(routeFor(h, '/s/b.frata.store', C, false, 'frata.store')).toEqual({ kind: 'not_found' })
    }
    expect(routeFor('localhost:3000', '/s/b.frata.store', C, true, 'frata.store')).toEqual({ kind: 'console' })
    expect(routeFor(C, '/style.png', C, false, 'frata.store')).toEqual({ kind: 'console' })
  })
  it('rewrites every shop path under /s/<host>, root files and /api aside', async () => {
    const { shopRewrites } = await import('../host')
    // @ts-expect-error -- Next's compiled copy has no types; it is the matcher Next itself uses for rewrites.
    const { pathToRegexp } = await import('next/dist/compiled/path-to-regexp')
    const [rest, root] = shopRewrites(C)
    const matches = (src: string, path: string) => pathToRegexp(src).test(path)
    expect(root!.destination).toBe('/s/:shop')
    // The rewritten root is not caught again by the rule before it (rules run in order).
    expect(matches(root!.source, '/s/kesar.frata.store')).toBe(false)
    for (const p of ['/products/kurta', '/s/b.frata.store/products/x.png', '/console/preview/a.png', '/policies/shipping', '/images/a.png']) expect(matches(rest!.source, p)).toBe(true)
    for (const p of ['/favicon.ico', '/apple-touch-icon.png', '/api/x', '/_next/static/a.js', '/fe.js']) expect(matches(rest!.source, p)).toBe(false)
    // The beacon's exemption is exact (security review 2026-11-11): nothing near its name escapes the shop. Rewrites
    // match without case (as the image rule does), so /FE.JS is exempted too; the file lookup is exact, so it is a 404.
    for (const p of ['/fe.js/x', '/fe.json', '/fe%2ejs', '/xfe.js', '/fe.jsx']) expect(matches(rest!.source, p), p).toBe(true)
    const notShop = new RegExp(`^${rest!.missing[0]!.value}$`)
    for (const h of [C, 'frata.vercel.app', 'frata-abc-team.vercel.app', 'localhost', '127.0.0.1']) expect(notShop.test(h)).toBe(true)
    for (const h of ['kesar.frata.store', 'shop.brand.in', 'app.frata.in.evil.com']) expect(notShop.test(h)).toBe(false)
  })
  it('takes a host param only in normal form', async () => {
    const { shopHostParam } = await import('../host')
    expect(shopHostParam('kesar.frata.store')).toBe('kesar.frata.store')
    expect(shopHostParam('Kesar.frata.store')).toBeNull()
    expect(shopHostParam('kesar.frata.store%3A443')).toBeNull()
    expect(shopHostParam('localhost')).toBeNull()
    expect(shopHostParam('frata.vercel.app')).toBeNull()
    expect(shopHostParam('%E0%A4')).toBeNull()
  })
})

describe('the bare shop domain serves Frrata\'s own site, stopgap (owner, 2026-11-15)', () => {
  const C = 'app.frata.in'
  it('only PLATFORM_SITE_PATHS; everything else still redirects, and a subdomain is still a shop', () => {
    expect(routeFor('frrata.shop', '/', C, false, 'frrata.shop')).toEqual({ kind: 'platform_site' })
    expect(routeFor('frrata.shop', '/privacy-policy', C, false, 'frrata.shop')).toEqual({ kind: 'platform_site' })
    expect(routeFor('FRRATA.SHOP:443', '/privacy-policy', C, false, 'frrata.shop')).toEqual({ kind: 'platform_site' })
    expect(routeFor('frrata.shop', '/login', C, false, 'frrata.shop')).toEqual({ kind: 'platform_apex' })
    expect(routeFor('kesar-studio.frrata.shop', '/', C, false, 'frrata.shop')).toEqual({ kind: 'shop' })
  })
  it('is left out of the shop rewrite; a subdomain is not', () => {
    const rules = shopRewrites(C, 'frrata.shop')
    const shop = rules.find((x) => x.destination.startsWith('/s/'))!
    const notShop = new RegExp(`^${shop.missing[0]!.value}$`)
    expect(notShop.test('frrata.shop')).toBe(true)
    expect(notShop.test('FRRATA.SHOP')).toBe(false) // the header is lower-cased by surfaceFor before this ever runs
    expect(notShop.test('kesar-studio.frrata.shop')).toBe(false)
  })
})

describe('EkCode host (P1 task 6)', () => {
  const EK = 'ekcode.test'
  const r = (host: string, path: string) => routeFor(host, path, 'app.frata.test', false, 'frata.store', EK).kind
  it('serves only its own pages and API; www goes to the apex', () => {
    for (const p of ['/', '/privacy', '/terms', '/contact', '/continue', '/api/ek/code', '/_next/static/x.js']) expect(r(EK, p)).toBe('ekcode')
    for (const p of ['/console', '/login', '/api/shop/quote', '/s/x', '/ek', '/checkout', '/api/webhooks/whatsapp']) expect(r(EK, p)).toBe('not_found')
    expect(r('www.ekcode.test', '/')).toBe('ekcode_www')
  })
  it('its paths are a 404 on every other host', () => {
    for (const host of ['app.frata.test', 'kesar.frata.store', 'shop.brand.in', 'x.vercel.app']) {
      expect(r(host, '/ek')).toBe('not_found')
      expect(r(host, '/ek/continue')).toBe('not_found')
      expect(r(host, '/api/ek/code')).toBe('not_found')
    }
  })
  it('is never a storefront, and off when no EkCode host is set', () => {
    expect(surfaceFor(EK, 'app.frata.test', EK)).toEqual({ kind: 'ekcode', www: false })
    expect(surfaceFor(EK, 'app.frata.test').kind).toBe('storefront')
  })
  it('rewrites its pages to /ek first, and leaves it out of the shop rewrite', () => {
    const rules = shopRewrites('app.frata.test', '', EK)
    expect(rules[0]!.destination).toBe('/ek/:page')
    expect(rules[1]!.destination).toBe('/ek')
    const shop = rules.find((x) => x.destination.startsWith('/s/'))!
    expect(new RegExp(`^${shop.missing[0]!.value}$`).test(EK)).toBe(true)
    expect(new RegExp(`^${shop.missing[0]!.value}$`).test('www.ekcode.test')).toBe(true)
    expect(new RegExp(`^${shop.missing[0]!.value}$`).test('kesar.frata.store')).toBe(false)
  })
})

describe('the Storefront API host (ADR-0018; V1 plan § SA0·1)', () => {
  const C = 'app.frata.in', D = 'frrata.shop', E = 'ekcode.in', A = 'api.frrata.shop'
  it('is its own surface, exact and normalised, and only when set', () => {
    expect(surfaceFor('api.frrata.shop', C, E, A)).toEqual({ kind: 'api' })
    expect(surfaceFor('API.frrata.shop.', C, E, A)).toEqual({ kind: 'api' })
    expect(surfaceFor('api.frrata.shop:443', C, E, A)).toEqual({ kind: 'api' })
    expect(surfaceFor('www.api.frrata.shop', C, E, A)).toEqual({ kind: 'storefront', host: 'www.api.frrata.shop' })
    expect(surfaceFor('api.frrata.shop', C, E, '')).toEqual({ kind: 'storefront', host: 'api.frrata.shop' })
    expect(surfaceFor('frata-git-x.vercel.app', C, E, A)).toEqual({ kind: 'console' })
  })
  it('answers versioned paths only on the API host', () => {
    expect(routeFor(A, '/2026-12/k/frs_pub_x/shop', C, false, D, E, A)).toEqual({ kind: 'api' })
    expect(routeFor(A, '/2026-12/openapi.json', C, false, D, E, A)).toEqual({ kind: 'api' })
    expect(routeFor(A, '/console', C, false, D, E, A)).toEqual({ kind: 'not_found' })
    expect(routeFor(A, '/api/storefront/2026-12/k/x/shop', C, false, D, E, A)).toEqual({ kind: 'not_found' })
    expect(routeFor(A, '/2025-01/k/x/shop', C, false, D, E, A)).toEqual({ kind: 'not_found' })
    expect(routeFor(A, '/s/kesar.frrata.shop/', C, false, D, E, A)).toEqual({ kind: 'not_found' })
  })
  it('refuses the API handlers on every other host', () => {
    for (const host of [C, 'kesar.frrata.shop', 'shop.brand.in', 'frata-git-x.vercel.app', E, 'localhost:3000']) {
      expect(routeFor(host, '/api/storefront/2026-12/k/frs_pub_x/shop', C, true, D, E, A)).toEqual({ kind: 'not_found' })
      expect(routeFor(host, '/api/storefront', C, true, D, E, A)).toEqual({ kind: 'not_found' })
    }
  })
  it('rewrites test keys to the dynamic tree, live keys to the cached tree, the API host only', async () => {
    const { apiRewrites, KEY_BODY } = await import('../host')
    expect(apiRewrites('')).toEqual([])
    const r = apiRewrites('API.frrata.shop')
    expect(r.every((x) => x.has[0]?.value === 'api\\.frrata\\.shop')).toBe(true)
    const test = r.find((x) => x.source.includes('frs_test_'))!, pub = r.find((x) => x.source.includes('frs_pub_'))!
    expect(test.destination).toBe('/api/storefront/2026-12/t/:key/:rest*')
    expect(pub.destination).toBe('/api/storefront/2026-12/k/:key/:rest*')
    expect(KEY_BODY).toBe('[0-9A-Za-z]{38}')
  })
  it('serves its docs on the API host only, by their public paths (SA1b D·9; security review M1)', async () => {
    const { apiRewrites, apiRedirects } = await import('../host')
    for (const p of ['/docs', '/docs/bag-link', '/docs/reference/products-handle', '/llms.txt', '/_next/static/chunks/x.js'])
      expect(routeFor(A, p, C, false, D, E, A), p).toEqual({ kind: 'api' })
    for (const p of ['/docs/a/b/c', '/docs/Bad', '/api-docs', '/api-docs/bag-link', '/docs.txt']) expect(routeFor(A, p, C, false, D, E, A), p).toEqual({ kind: 'not_found' })
    // the internal path answers nowhere by name
    for (const host of [C, 'kesar.frrata.shop', 'shop.brand.in', 'frata-git-x.vercel.app', E, 'localhost:3000'])
      expect(routeFor(host, '/api-docs/bag-link', C, true, D, E, A), host).toEqual({ kind: 'not_found' })
    const r = apiRewrites('api.frrata.shop')
    expect(r.slice(0, 3).map((x) => [x.source, x.destination])).toEqual([['/docs', '/api-docs'], ['/docs/:rest*', '/api-docs/:rest*'], ['/llms.txt', '/api-docs/llms.txt']])
    expect(apiRedirects('api.frrata.shop')).toEqual([{ source: '/', destination: '/docs', permanent: false, has: [{ type: 'host', value: 'api\\.frrata\\.shop' }] }])
    expect(apiRedirects('')).toEqual([])
  })
  it('keeps the API host out of the shop rewrite', () => {
    const shop = shopRewrites(C, E, A)
    const miss = new RegExp(`^${shop[shop.length - 1]?.missing[0]?.value}$`)
    expect(miss.test('api.frrata.shop')).toBe(true)
    expect(miss.test('kesar.frrata.shop')).toBe(false)
  })
})
