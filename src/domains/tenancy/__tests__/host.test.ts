import { describe, expect, it } from 'vitest'
import { shopSlugFromHost, surfaceFor } from '../host'

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
  })
})

describe('routeFor: /s/ is reachable only through the rewrite', () => {
  const C = 'app.frata.in'
  it('rewrites a shop host, image paths of /s/ included', async () => {
    const { routeFor } = await import('../host')
    expect(routeFor('kesar.frata.store', '/products/kurta', C, false)).toEqual({ kind: 'rewrite', path: '/s/kesar.frata.store/products/kurta' })
    expect(routeFor('kesar.frata.store', '/', C, false)).toEqual({ kind: 'rewrite', path: '/s/kesar.frata.store' })
    // Another shop's path on this shop: prefixed, so it matches no page.
    expect(routeFor('kesar.frata.store', '/s/b.frata.store/products/x.png', C, false)).toEqual({ kind: 'rewrite', path: '/s/kesar.frata.store/s/b.frata.store/products/x.png' })
    expect(routeFor('kesar.frata.store', '/favicon.ico', C, false)).toEqual({ kind: 'pass' })
    expect(routeFor('kesar.frata.store', '/api/x', C, false)).toEqual({ kind: 'pass' })
  })
  it('404s /s/ on the console, vercel.app and localhost in production', async () => {
    const { routeFor } = await import('../host')
    for (const h of [C, 'frata.vercel.app', 'localhost:3000', '127.0.0.1', null]) {
      expect(routeFor(h, '/s/b.frata.store/products/x.png', C, false)).toEqual({ kind: 'not_found' })
      expect(routeFor(h, '/s/b.frata.store', C, false)).toEqual({ kind: 'not_found' })
    }
    expect(routeFor('localhost:3000', '/s/b.frata.store', C, true)).toEqual({ kind: 'console' })
    expect(routeFor(C, '/console', C, false)).toEqual({ kind: 'console' })
    expect(routeFor(C, '/style.png', C, false)).toEqual({ kind: 'console' })
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
