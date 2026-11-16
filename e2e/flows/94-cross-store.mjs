// =============================================================================
// FLOW: cross-store (one-address plan P4a·3, spec § 6). Store hosts are siblings under the shop domain (frrata.shop in
// production, frata.test here), so until the Public Suffix List carries it (P4b) store Y's page is same-site with
// store X. Y's code sets large and many Domain cookies and sends requests to X with the shopper's cookies:
//   - Y's __Host- cookies are refused by the browser (here because they are Secure on plain http; in production the
//     prefix forbids Domain, and check:cookies keeps every name X reads __Host-: src/lib/ekcode/cookie-name.ts);
//   - Y's forged session and EkCode state sign nobody in at X (src/lib/ekcode/handshake.ts). On plain http the stack's
//     names are plain, so X does receive Y's planted shop_s: recorded as the local residual, not claimed as proof;
//   - Y's requests reach X with Sec-Fetch-Site: same-site; X refuses Y's POSTs (Origin), and requireShop
//     (src/lib/auth/require-shop.ts, fetch-site.ts) logs Y's GET while FETCH_SITE_MODE is 'log', refuses it once 'enforce';
//   - the residuals, recorded not asserted: a cookie bomb from Y and the eviction of X's host-only cookies by Y's many
//     Domain cookies (the per-site cookie cap). Only the listing (P4b) removes them. Printed, and in
//     e2e/.out/cross-store-residual.txt.
// =============================================================================
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { OUT, SHOP, SHOP_DOMAIN, until } from '../lib.mjs'

const X = SHOP
const XHOST = new URL(SHOP).host
const Y = `http://another-store.${SHOP_DOMAIN}`
// The mode the build was made with (a --no-build run after a flip tests the old one: rebuild after flipping).
const MODE = readFileSync(new URL('../../src/lib/auth/fetch-site.ts', import.meta.url), 'utf8').match(/FETCH_SITE_MODE: 'log' \| 'enforce' = '(log|enforce)'/)?.[1]
const appLog = () => { try { return readFileSync(`${OUT}next.log`, 'utf8') } catch { return '' } }
const TOKEN43 = 'A'.repeat(43)

export default {
  name: 'cross-store',
  async run(t) {
    assert.ok(MODE, 'FETCH_SITE_MODE not found in src/lib/auth/fetch-site.ts')
    const ctx = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
    const y = await ctx.newPage(); y.setDefaultTimeout(30_000)
    await y.goto(Y + '/', { waitUntil: 'domcontentloaded' }) // any answer: Y's page is the attacker's code
    assert.ok(y.url().startsWith(Y), `Y's page moved to ${y.url()}`)
    const x = await ctx.newPage(); x.setDefaultTimeout(30_000)
    const plant = (cookies) => y.evaluate((list) => { for (const c of list) document.cookie = c }, cookies)
    const domainOnes = async () => (await ctx.cookies()).filter((c) => c.domain === `.${SHOP_DOMAIN}`)
    // A request from Y's page to X with the shopper's cookies (no-cors: Y cannot read the answer); X's answer as seen.
    const fromY = async (path, init = {}) => {
      const seen = y.waitForResponse((r) => r.url() === `${X}${path}`, { timeout: 10_000 })
      const sent = y.evaluate(([u, i]) => fetch(u, { ...i, mode: 'no-cors', credentials: 'include' }).then(() => 'sent', (e) => String(e)), [`${X}${path}`, init])
      const [res, how] = await Promise.all([seen.catch(() => null), sent])
      assert.ok(res, `no answer from X to Y's ${init.method ?? 'GET'} ${path} (${how})`)
      return res
    }
    const residual = []

    try {
      await t.step('Y plants Domain cookies, large and many; Y\'s __Host- ones are refused by the browser', async () => {
        await plant([
          `shop_s=forged-session-from-y; Domain=${SHOP_DOMAIN}; Path=/`,
          `ek_state=${TOKEN43}.forged-verifier; Domain=${SHOP_DOMAIN}; Path=/`,
          `__Host-shop_s=forged; Domain=${SHOP_DOMAIN}; Path=/; Secure`,
          `__Host-ek_state=forged; Domain=${SHOP_DOMAIN}; Path=/; Secure`,
          ...Array.from({ length: 20 }, (_, i) => `pad${i}=${'y'.repeat(400)}; Domain=${SHOP_DOMAIN}; Path=/`),
        ])
        const names = (await domainOnes()).map((c) => c.name)
        assert.ok(names.includes('shop_s') && names.includes('pad19'), `Y's Domain cookies were not set: ${names.join(',')}`)
        assert.ok(!names.some((n) => n.startsWith('__Host-')), `a __Host- cookie took a Domain: ${names.join(',')}`)
        assert.ok(!(await ctx.cookies(X)).some((c) => c.name.startsWith('__Host-')), 'X holds a __Host- cookie Y planted')
      })

      await t.step('Y\'s forged session and EkCode state sign nobody in at X (plain names reach X here: recorded)', async () => {
        await x.goto(X + '/', { waitUntil: 'domcontentloaded' })
        const [meRes] = await Promise.all([
          x.waitForResponse((r) => r.url() === `${X}/api/shop/ekcode/me`),
          x.evaluate(() => fetch('/api/shop/ekcode/me', { cache: 'no-store' })),
        ])
        assert.equal(meRes.status(), 200)
        assert.equal((await meRes.json()).signedIn, false, 'X signed in a session Y forged')
        const carried = /(^|;\s*)shop_s=forged-session-from-y/.test((await meRes.request().allHeaders()).cookie ?? '')
        residual.push(`local stack (plain http, plain names): X ${carried ? 'RECEIVED' : 'did not receive'} Y's planted shop_s; production reads __Host-shop_s, which Y cannot plant`)
        const [back] = await Promise.all([
          x.waitForResponse((r) => r.url().startsWith(`${X}/api/shop/ekcode/return`)),
          x.goto(`${X}/api/shop/ekcode/return?code=${TOKEN43}&state=${TOKEN43}`, { waitUntil: 'domcontentloaded' }),
        ])
        assert.equal(back.status(), 303)
        assert.equal(back.headers().location, `${X}/checkout`, 'a planted state signed the shopper in (#ek)')
        assert.equal(await x.evaluate(async () => (await (await fetch('/api/shop/ekcode/me', { cache: 'no-store' })).json()).signedIn), false)
      })

      await t.step(`Y's requests reach X as same-site; X refuses Y's POSTs, and ${MODE === 'enforce' ? 'refuses' : 'logs'} Y's GET`, async () => {
        const view = await fromY('/api/shop/orders/view', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: 'x'.repeat(22) }) })
        assert.equal((await view.request().allHeaders())['sec-fetch-site'], 'same-site')
        assert.equal(view.status(), 403, 'X answered a POST from a sibling store')
        assert.equal((await fromY('/api/shop/ekcode/me', { method: 'POST' })).status(), 403, 'a sibling store signed the shopper out')
        // A personal GET with the shopper's cookies. Only this flow sends one, and the server logs a kind once a minute
        // (logOnce): a flow sending the same same-site GET before this one would hide the line.
        const before = appLog().length
        const me = await fromY('/api/shop/ekcode/me')
        assert.equal((await me.request().allHeaders())['sec-fetch-site'], 'same-site')
        if (MODE === 'enforce') assert.equal(me.status(), 403, 'enforce: X answered a personal GET from a sibling store')
        else {
          assert.equal(me.status(), 200, 'log mode answers as before')
          await until(async () => /\[fetch-site\] would refuse same-site GET \/api\/shop\/ekcode\/me/.test(appLog().slice(before)), 10_000)
          const lines = appLog().slice(before).split('\n').filter((l) => l.includes('[fetch-site]'))
          assert.doesNotMatch(lines.join('\n'), new RegExp(XHOST.replace(/\./g, '\\.')), 'the log line names the host')
        }
        // X's own page: same-origin, answered.
        assert.equal(await x.evaluate(async () => (await fetch('/api/shop/ekcode/me', { cache: 'no-store' })).status), 200)
      })

      await t.step('the residuals, recorded: a cookie bomb from Y, and X\'s host-only cookie evicted by Y\'s many', async () => {
        await ctx.clearCookies()
        await ctx.addCookies([{ name: 'shop_s', value: 'x-own-session', domain: XHOST, path: '/', sameSite: 'Lax' }])
        await plant(Array.from({ length: 200 }, (_, i) => `evict${i}=1; Domain=${SHOP_DOMAIN}; Path=/`))
        const kept = (await ctx.cookies(X)).some((c) => c.name === 'shop_s' && c.value === 'x-own-session')
        await ctx.clearCookies()
        await plant(Array.from({ length: 12 }, (_, i) => `bomb${i}=${'b'.repeat(4000)}; Domain=${SHOP_DOMAIN}; Path=/`))
        const viaPage = await x.goto(X + '/', { waitUntil: 'domcontentloaded' }).then((r) => r?.status() ?? 'no answer').catch(() => 'no answer')
        residual.push(
          `eviction: after 200 Domain cookies from Y, X's host-only session cookie ${kept ? 'survived' : 'was EVICTED (the shopper is signed out)'}`,
          `cookie bomb: 12 Domain cookies of 4 kB from Y; X's next page answered ${viaPage}`,
        )
        await ctx.clearCookies()
      })
    } finally {
      await ctx.close()
      if (residual.length) {
        const text = [`cross-store residuals (one-address spec § 6; removed only by the Public Suffix List, P4b), ${new Date().toISOString()}`, ...residual].join('\n')
        console.log(text.replace(/^/gm, '     '))
        writeFileSync(`${OUT}cross-store-residual.txt`, text + '\n')
      }
    }
  },
}
