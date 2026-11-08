import { describe, expect, it } from 'vitest'
import { shopSlugFromHost, platformHost, surfaceFor } from '../host'

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
    // The bare shop domain holds no shop: it is sent to Frrata's site; its subdomains stay shops.
    expect(routeFor('frata.store', '/', C, false, 'frata.store')).toEqual({ kind: 'platform_apex' })
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
    for (const p of ['/favicon.ico', '/apple-touch-icon.png', '/api/x', '/_next/static/a.js']) expect(matches(rest!.source, p)).toBe(false)
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
