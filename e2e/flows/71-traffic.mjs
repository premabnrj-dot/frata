// =============================================================================
// FLOW: traffic beacon (A·2 · A2·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md, A2·2 amendment). A shopper lands
// from an Instagram bio link on a phone, opens a product by a soft navigation, adds it to the bag and starts checkout;
// when the tab hides, one beacon carries it all to /api/shop/e, which stores it in the analytics database under the
// shop of the host. The fold then gives the shop's rollups and nobody else's. Then the refusals: another Origin, a bot,
// an unknown host, a body too large, an unknown key. /fe.js is served immutable, outside the shop rewrite.
// Guards: a beacon that stops sending, a source lost, a tenant from the body, a lookup before the cheap checks.
// =============================================================================
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { PORTS, SHOP, SHOP_DOMAIN, playwright, until } from '../lib.mjs'

const { devices } = playwright
const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const HOST = new URL(SHOP).hostname
const PHONE_UA = devices['Pixel 7'].userAgent

/** A POST to the app as if from a browser on `host` (node:http lets us set Host; fetch doesn't). */
function post(path, body, { host = HOST, origin = `http://${host}`, ua = PHONE_UA, type = 'text/plain;charset=UTF-8', chunked = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const r = httpRequest({ host: '127.0.0.1', port: PORTS.app, path, method: 'POST', headers: { host, origin, 'user-agent': ua, 'content-type': type, ...(chunked ? { 'transfer-encoding': 'chunked' } : { 'content-length': data.length }) } },
      (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers })) })
    r.on('error', reject); r.end(data)
  })
}
/** A GET as if on `host` (the text and headers). */
function get(path, host = HOST) {
  return new Promise((resolve, reject) => {
    httpRequest({ host: '127.0.0.1', port: PORTS.app, path, headers: { host, 'user-agent': PHONE_UA } }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: d }))
    }).on('error', reject).end()
  })
}
const hide = (p) => p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
})

export default {
  name: 'traffic',
  async run(t) {
    const { adb } = t
    await adb`delete from events where tenant_id = ${KESAR}`
    const kinds = async () => (await adb`select kind, path, landing, us, um, rh, product_id, device from events where tenant_id = ${KESAR} order by at`)

    await t.step('The shop loads /fe.js (versioned, immutable) and it is served outside the shop rewrite', async () => {
      const page = await get('/')
      const v = /<script[^>]+src="\/fe\.js\?v=([0-9a-f]{12})"/.exec(page.text)
      assert.ok(v, 'the shell mounts the beacon')
      const js = await get(`/fe.js?v=${v[1]}`)
      assert.equal(js.status, 200)
      assert.match(String(js.headers['cache-control'] ?? ''), /immutable/)
      assert.match(js.text, /sendBeacon/)
      // While visits are counted, the shop's privacy policy says so (security review MED-A).
      const privacy = await get('/policies/privacy')
      assert.match(privacy.text, /We count visits to this shop/)
      assert.doesNotMatch(privacy.text, /nothing else without asking you/)
    })

    const ctx = await t.browser.newContext({ ...devices['Pixel 7'] })
    // Every page load samples its Web Vitals (the beacon takes 1 in 4 by Math.random).
    await ctx.addInitScript(() => { Math.random = () => 0 })
    const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('A phone visit from an Instagram bio link: landing, product, bag and checkout, sent when the tab hides', async () => {
        await p.goto(SHOP + '/?utm_source=instagram&utm_medium=bio', { waitUntil: 'load', referer: 'https://l.instagram.com/?u=x' })
        await p.waitForFunction(() => window.__fe === 1)
        await p.locator('a[href="/products/chanderi-kurta-set"]').first().click()
        await p.waitForURL(/\/products\/chanderi-kurta-set$/)
        await p.getByRole('button', { name: /^Rust/ }).click(); await p.getByRole('button', { name: 'M', exact: true }).click()
        await p.getByRole('button', { name: /Add to bag/ }).click(); await p.getByRole('dialog', { name: 'Your bag' }).waitFor()
        // Headless Chromium here delivers nothing sent while a page unloads (neither sendBeacon nor a keepalive fetch,
        // though pagehide fires: checked 2026-11-11), so the tab is hidden first, as a phone does when the shopper
        // switches app. The pagehide send itself is checked by hand on a phone before counting goes live.
        await hide(p)
        await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/)
        await p.waitForFunction(() => window.__fe === 1)
        await hide(p)
        const rows = await until(async () => { const r = await kinds(); return r.some((e) => e.kind === 'begin_checkout') && r.some((e) => e.kind === 'add_to_cart') ? r : null }, 10_000)
        const landing = rows.find((e) => e.kind === 'page_view' && e.landing)
        assert.deepEqual([landing.path, landing.us, landing.um, landing.rh, landing.device], ['/', 'instagram', 'bio', 'l.instagram.com', 'phone'])
        assert.ok(rows.some((e) => e.kind === 'page_view' && e.path === '/products/chanderi-kurta-set' && !e.landing), 'the soft navigation is a page view')
        const item = rows.find((e) => e.kind === 'view_item')
        assert.ok(item?.product_id, 'view_item carries the product')
        assert.ok(rows.some((e) => e.kind === 'add_to_cart' && e.product_id === item.product_id), 'add to bag carries the product')
        assert.equal(rows.filter((e) => e.landing).length, 1, 'one landing per tab')
        assert.ok(rows.some((e) => e.kind === 'web_vital'), 'a phone sends its Web Vitals')
      })

      await t.step('A purchase is sent once, on the order page the checkout leaves for', async () => {
        // The checkout sets this flag just before it goes to /orders (checkout.tsx done()); the order itself is not placed here.
        await p.evaluate(() => sessionStorage.setItem('fe.p', '1'))
        await p.goto(SHOP + '/orders', { waitUntil: 'load' })
        await p.waitForFunction(() => window.__fe === 1)
        await hide(p)
        await until(async () => (await adb`select 1 from events where tenant_id = ${KESAR} and kind = 'purchase'`).length > 0 || null, 10_000)
        await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.__fe === 1); await hide(p)
        await new Promise((r) => setTimeout(r, 1500))
        assert.equal((await adb`select count(*)::int n from events where tenant_id = ${KESAR} and kind = 'purchase'`)[0].n, 1, 'a reopened order page is not another purchase')
      })
    } finally { await ctx.close() }

    await t.step('The fold: the shop\'s own rollups, from its own events', async () => {
      await adb`update events set at = at - interval '5 minutes' where tenant_id = ${KESAR}`
      await adb`update fold_state set through = now() - interval '1 hour'`
      await adb`select analytics_fold()`
      const [tr] = await adb`select visitors, product_visitors, bag_visitors, checkout_visitors, phone from traffic_daily where tenant_id = ${KESAR} order by day desc limit 1`
      assert.ok(tr && tr.visitors >= 1 && tr.product_visitors >= 1 && tr.bag_visitors >= 1 && tr.checkout_visitors >= 1 && tr.phone >= 1, JSON.stringify(tr))
      assert.ok((await adb`select 1 from source_daily where tenant_id = ${KESAR} and us = 'instagram' and um = 'bio'`).length, 'the Instagram bio source')
    })

    await t.step('Refused or dropped: another Origin, a bot, an unknown host, too large, a bad body, a tenant in the body', async () => {
      const before = (await adb`select count(*)::int n from events`)[0].n
      const ok = { e: [{ k: 'page_view', p: '/' }] }
      assert.equal((await post('/api/shop/e', ok, { origin: 'https://evil.example' })).status, 403)
      assert.equal((await post('/api/shop/e', ok, { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).status, 204)
      assert.equal((await post('/api/shop/e', ok, { host: `nobody-here.${SHOP_DOMAIN}` })).status, 404)
      assert.equal((await post('/api/shop/e', 'x'.repeat(9000))).status, 413)
      assert.equal((await post('/api/shop/e', 'x'.repeat(9000), { chunked: true })).status, 413, 'a body with no length is counted as it streams')
      assert.equal((await post('/api/shop/e', '{not json')).status, 400)
      assert.equal((await post('/api/shop/e', { e: [{ k: 'page_view' }], tenant: '00000000-0000-0000-0000-000000000000' })).status, 400)
      assert.equal((await post('/api/shop/e', ok, { type: 'multipart/form-data' })).status, 415)
      await new Promise((r) => setTimeout(r, 1500))
      assert.equal((await adb`select count(*)::int n from events`)[0].n, before, 'nothing refused was stored, and the bot was dropped')
      // The one that passes: it lands under the host's shop.
      assert.equal((await post('/api/shop/e', { e: [{ k: 'page_view', p: '/9876543210' }] })).status, 204)
      const row = await until(async () => (await adb`select tenant_id, path from events where path = 'other' order by at desc limit 1`)[0] ?? null, 5000)
      assert.equal(row.tenant_id, KESAR, 'the host decides the shop')
    })
  },
}
