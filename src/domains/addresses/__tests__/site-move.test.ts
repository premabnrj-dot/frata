import { describe, expect, it } from 'vitest'
import { siteMove, siteMoveScript } from '../names'

const at = (pathname: string, search = '', hash = '', host = 'checkout.kesarstudio.in') => ({ host, pathname, search, hash })
const O = 'https://kesarstudio.in'

describe('siteMove (SA1b D·2): the store pages the site has move there, with the tags', () => {
  it('home, a product and a collection move, keeping query and fragment', () => {
    expect(siteMove(O, at('/'))).toBe('https://kesarstudio.in/')
    expect(siteMove(O, at('/products/ilkal-saree', '?utm_source=instagram&code=RIYA', '#size'))).toBe('https://kesarstudio.in/products/ilkal-saree?utm_source=instagram&code=RIYA#size')
    expect(siteMove(O, at('/collections/sarees/'))).toBe('https://kesarstudio.in/collections/sarees/')
  })
  it('the bag, checkout, the bag link, orders, policies, pages and lists stay', () => {
    for (const p of ['/bag', '/checkout', '/cart', '/orders/x', '/policies/returns', '/pages/about', '/products', '/collections', '/search', '/products/a/b'])
      expect(siteMove(O, at(p))).toBeNull()
  })
  it('never leaves the site origin', () => {
    for (const p of ['//evil.com', '/\\evil.com', '/%2F%2Fevil.com', '\\\\evil.com/products/x', '//evil.com/products/x'])
      expect(siteMove(O, at(p))).toBeNull()
    expect(siteMove(O, at('///products/x'))).toBe('https://kesarstudio.in/products/x')
  })
  it('no loop: no move on the site host or its www/apex twin', () => {
    expect(siteMove(O, at('/', '', '', 'kesarstudio.in'))).toBeNull()
    expect(siteMove(O, at('/', '', '', 'www.kesarstudio.in'))).toBeNull()
    expect(siteMove('https://www.kesarstudio.in', at('/', '', '', 'kesarstudio.in:443'))).toBeNull()
  })
  it('an origin that is not a bare https origin moves nowhere', () => {
    for (const o of ['http://kesarstudio.in', 'https://kesarstudio.in/x', 'https://kesarstudio.in:8443', 'javascript:alert(1)', 'not a url'])
      expect(siteMove(o, at('/'))).toBeNull()
  })
  it('the inline script is the same rule (its source text), and guards a second move within 10 s', () => {
    const calls: string[] = []
    const store = new Map<string, string>()
    const run = (pathname: string, now: number) => {
      const env = { location: { host: 'checkout.kesarstudio.in', pathname, search: '?utm_source=ig', hash: '', replace: (u: string) => calls.push(u) },
        sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
        window: {} as Record<string, unknown>, Date: { now: () => now }, history: { pushState: () => {} }, addEventListener: () => {} }
      new Function('location', 'sessionStorage', 'window', 'Date', 'history', 'addEventListener', siteMoveScript(O))(env.location, env.sessionStorage, env.window, env.Date, env.history, env.addEventListener)
      return env.window
    }
    const w = run('/products/x', 1_000_000)
    expect(calls).toEqual(['https://kesarstudio.in/products/x?utm_source=ig'])
    expect(w.__fe).toBe(1)
    run('/products/y', 1_005_000)
    expect(calls).toHaveLength(1)
    run('/products/y', 1_020_000)
    expect(calls).toHaveLength(2)
    run('/bag', 2_000_000)
    expect(calls).toHaveLength(2)
  })
  it('a soft navigation is checked too: after the router’s pushState', () => {
    const calls: string[] = []
    const loc = { host: 'checkout.kesarstudio.in', pathname: '/bag', search: '', hash: '', replace: (u: string) => calls.push(u) }
    const hist = { pushState(_s: unknown, _t: string, url: string) { loc.pathname = url } }
    new Function('location', 'sessionStorage', 'window', 'Date', 'history', 'addEventListener', siteMoveScript(O))(loc, { getItem: () => null, setItem: () => {} }, {}, { now: () => 1e12 }, hist, () => {})
    expect(calls).toEqual([])
    hist.pushState(null, '', '/products/x')
    expect(calls).toEqual(['https://kesarstudio.in/products/x'])
  })
  it('the script embeds the origin as a JSON string', () => {
    expect(siteMoveScript('https://a.in")</script><script>x')).not.toContain('</script>')
  })
})
