// =============================================================================
// FLOW: security — the review fixes of 2026-11-08 hold in the built app.
//   S3  a signed-in console page carries a per-request script nonce, its own
//       scripts run under it (the page hydrates, no CSP violation), and the
//       nonce differs per request; the public pages and shops keep no nonce.
//   S13 a Razorpay webhook body over the cap is refused before anything is read.
//   D·0 the bare shop domain (frrata.shop in production, frata.test here) holds no shop: 307 to Frrata's site.
//   D2·1 HSTS: includeSubDomains on the console host and *.SHOP_DOMAIN only; an own domain gets max-age=31536000.
// =============================================================================
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { CONSOLE, SHOP, signedIn } from '../lib.mjs'
import { PORTS, SHOP_DOMAIN } from '../constants.mjs'

export default {
  name: 'security',
  async run(t) {
    await t.step('console pages run under a nonce; shops and public pages are untouched', async () => {
      const ctx = await signedIn(t.browser, 'owner')
      const p = await ctx.newPage(); const violations = [], errs = []
      p.on('console', (m) => { if (/Content Security Policy|Refused to (load|execute)/i.test(m.text())) violations.push(m.text()) })
      p.on('pageerror', (e) => errs.push(e.message))
      const res = await p.goto(CONSOLE + '/console/orders')
      const csp = res.headers()['content-security-policy'] ?? ''
      assert.match(csp, /script-src 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/, `console CSP: ${csp}`)
      assert.match(csp, /form-action 'self'/)
      // Hydrated: a client control answers (the nav's More, or any button that needs React).
      await p.waitForLoadState('networkidle')
      assert.equal(await p.evaluate(() => !!document.querySelector('script[nonce]')), true, 'Next did not put the nonce on its scripts')
      assert.deepEqual(violations, [], violations.join(' | '))
      assert.deepEqual(errs, [], errs.join(' | '))
      const again = await (await ctx.request.get(CONSOLE + '/console/orders')).headers()['content-security-policy']
      assert.notEqual(again?.match(/nonce-([^']+)/)?.[1], csp.match(/nonce-([^']+)/)?.[1], 'the nonce repeated')
      await ctx.close()
      // Through the browser: only it resolves the shop's host (--host-resolver-rules).
      const anon = await t.browser.newContext(); const pg = await anon.newPage()
      for (const url of [CONSOLE + '/', SHOP + '/']) {
        const h = (await pg.goto(url)).headers()['content-security-policy'] ?? ''
        assert.match(h, /frame-ancestors 'none'/, `${url} lost the global policy`)
        assert.doesNotMatch(h, /nonce-/, `${url} got a nonce`)
      }
      // A shop sends only its origin onward (Analytics A·1, security review: asserted, not set again).
      assert.equal((await pg.goto(SHOP + '/')).headers()['referrer-policy'], 'strict-origin-when-cross-origin')
      // A shop request over 32 kB is refused before it is parsed.
      const big = await pg.evaluate(async () => (await fetch('/api/shop/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(40 * 1024) }) })).status)
      assert.equal(big, 413)
      await anon.close()
    })
    await t.step('the bare shop domain sends people to Frrata\'s site (307 until frrata.com); a shop on it still opens', async () => {
      const head = (host) => new Promise((resolve, reject) => {
        const r = request({ host: '127.0.0.1', port: PORTS.app, path: '/products?x=1', method: 'GET', headers: { host } }, (res) => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location, hsts: res.headers['strict-transport-security'] }) })
        r.on('error', reject); r.end()
      })
      const apex = await head(SHOP_DOMAIN)
      assert.equal(apex.status, 307)
      assert.match(apex.location ?? '', /^https:\/\/localhost\/$/)
      assert.notEqual((await head(`kesar-studio.${SHOP_DOMAIN}`)).status, 308, 'a shop on the shop domain must not redirect')
      // D2·1: includeSubDomains only on our own hosts; a merchant's own domain gets a year without it.
      assert.equal((await head(`kesar-studio.${SHOP_DOMAIN}`)).hsts, 'max-age=63072000; includeSubDomains')
      assert.equal((await head('localhost')).hsts, 'max-age=63072000; includeSubDomains')
      assert.equal((await head('kesarstudio.example')).hsts, 'max-age=31536000')
    })
    await t.step('an oversized Razorpay webhook is refused with 413', async () => {
      const ctx = await t.browser.newContext()
      const r = await ctx.request.post(CONSOLE + '/api/webhooks/razorpay/k_' + 'z'.repeat(32), { data: 'x'.repeat(300 * 1024), headers: { 'content-type': 'application/json' } })
      assert.equal(r.status(), 413)
      await ctx.close()
    })
  },
}
