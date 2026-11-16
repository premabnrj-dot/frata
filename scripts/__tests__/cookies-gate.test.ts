import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// check:cookies (one-address plan P4a·1): store hosts are siblings under frrata.shop, so every cookie the shop and
// secure host code touches is host-only with a __Host- name.
describe('check:cookies', async () => {
  const { checkSource, checkHelper } = await import('../check-cookies.mjs')
  const run = (src: string) => checkSource('x.ts', src)

  it('passes the ways the shop sets cookies today', () => {
    expect(run(`const STATE = () => cookieName('ek_state')
export const HINT = 'shop_in'
;(await cookies()).set(STATE(), v, { httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 600 })
jar.set(HINT, '1', { httpOnly: false, secure: cookieSecure(), sameSite: 'lax', path: '/' })
jar.get(STATE())?.value
res.cookies.set('__Host-x', '1', {
  secure: true,
  path: '/',
})`)).toEqual([])
  })
  it('fails a Domain attribute, in options or a header string', () => {
    expect(run(`jar.set('__Host-a', '1', { secure: true, path: '/', domain: 'frrata.shop' })`).join()).toMatch(/Domain/)
    expect(run(`const h = 'a=1; Domain=frrata.shop'`).join()).toMatch(/Domain/)
  })
  it('fails a plain name, a constant it cannot read, and a name passed in an object', () => {
    expect(run(`jar.set('shop_s', '1', { secure: true, path: '/' })`).join()).toMatch(/cookie name 'shop_s'/)
    expect(run(`jar.get(nameFrom(req))`).join()).toMatch(/cookie name/)
    expect(run(`const N = 'ek_flow'\njar.get(N)`).join()).toMatch(/cookie name N/)
    expect(run(`res.cookies.set({ name: '__Host-a', value: '1' })`).join()).toMatch(/name first/)
  })
  it('fails a set without Secure or without Path=/', () => {
    expect(run(`jar.set('__Host-a', '1', { path: '/' })`).join()).toMatch(/secure/)
    expect(run(`jar.set('__Host-a', '1', { secure: true, path: '/checkout' })`).join()).toMatch(/path/)
  })
  it('fails a raw Cookie or Set-Cookie header and a document.cookie write', () => {
    expect(run(`headers.set('Set-Cookie', 'a=1')`).join()).toMatch(/Set-Cookie/)
    expect(run(`request.headers.get('cookie')`).join()).toMatch(/Cookie header/)
    expect(run(`document.cookie = 'a=1; path=/'`).join()).toMatch(/document\.cookie/)
    expect(run(`if (document.cookie.includes('shop_in=1')) go()`)).toEqual([])
  })
  it('reads any jar assigned from cookies(), and fails getAll and delete', () => {
    expect(run(`const c = await cookies()\nc.set('shop_s', 'x', { secure: true, path: '/' })`).join()).toMatch(/cookie name 'shop_s'/)
    expect(run(`const store = cookies()\nstore.get('plain')`).join()).toMatch(/cookie name 'plain'/)
    expect(run(`jar.getAll()`).join()).toMatch(/getAll/)
    expect(run(`jar.delete('__Host-a')`).join()).toMatch(/sends no Secure/)
    expect(run(`params.get('state'); map.set('k', 1)`)).toEqual([])
  })
  it('Domain: the shorthand inside a cookie set fails; a domain key elsewhere does not', () => {
    expect(run(`jar.set('__Host-a', '1', { secure: true, path: '/', domain })`).join()).toMatch(/Domain/)
    expect(run(`const row = { domain: shop.domain, host }`)).toEqual([])
  })
  it('fails the Cookie header read through headers()', () => {
    expect(run(`const raw = (await headers()).get('cookie')`).join()).toMatch(/Cookie header/)
  })
  it('client code: document.cookie and cookieStore writes only', async () => {
    const { checkSource: c } = await import('../check-cookies.mjs')
    expect(c('x.tsx', `cookieStore.set('a', '1')`, { client: true }).join()).toMatch(/cookieStore/)
    expect(c('x.tsx', `document.cookie = 'a=1'`, { client: true }).join()).toMatch(/document\.cookie/)
    expect(c('x.tsx', `if (document.cookie.includes('shop_in=1')) go(); params.get('x')`, { client: true })).toEqual([])
  })
  it('an allowed plain name is an own key only; constants pointing at each other fail, not crash', () => {
    expect(run(`jar.get('constructor')`).join()).toMatch(/cookie name/)
    expect(run(`const A = B\nconst B = A\njar.get(A)`).join()).toMatch(/cookie name A/)
  })
  it('a line opening with * outside a block comment is code', () => {
    expect(run(`const n = 2\n  * jar.get('plain')`).join()).toMatch(/cookie name 'plain'/)
    expect(run(`/*\n * jar.get('plain')\n */`)).toEqual([])
  })
  it('skips comment lines, so its own header passes', () => {
    expect(run(`// jar.set('plain', '1', { domain: 'frrata.shop' })\n/**\n * Set-Cookie: a=1; Domain=frrata.shop\n */`)).toEqual([])
    expect(checkSource('scripts/check-cookies.mjs', readFileSync('scripts/check-cookies.mjs', 'utf8'))).toEqual([])
  })
  it('the helper gives __Host- off the local e2e stack', () => {
    expect(checkHelper(readFileSync('src/lib/ekcode/cookie-name.ts', 'utf8'))).toEqual([])
    expect(checkHelper("const insecure = () => true\nexport const cookieName = (base: string) => base").length).toBe(2)
  })
})
