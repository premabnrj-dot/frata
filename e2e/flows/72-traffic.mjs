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
import { CONSOLE, PORTS, SHOP, SHOP_DOMAIN, playwright, signedIn, until } from '../lib.mjs'

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

    // Console › Analytics (A2·4): the visits beside the orders.
    const OTHER = '99999999-0000-0000-0000-00000000aaaa'
    const open = async (opts) => { const c = await signedIn(t.browser, 'owner', opts); const pg = await c.newPage(); pg.setDefaultTimeout(10_000); pg.on('pageerror', (e) => t.errors.push(e.message)); return { c, pg } }
    await t.step('Console › Analytics, no visits yet: the orders stand, and visits count from today', async () => {
      const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
      await adb`delete from traffic_daily where tenant_id = ${KESAR}`
      try {
        const { c, pg } = await open()
        await pg.goto(CONSOLE + '/console/analytics?period=30')
        await pg.getByText('Visits count from today').waitFor()
        await pg.getByText('from today').first().waitFor()
        await c.close()
      } finally { await adb`select analytics_rollup(${today}::date)` }
    })

    await t.step('Console › Analytics, the first days: visits counted, too few to judge, sources with a Visits column', async () => {
      const { c, pg } = await open()
      await pg.goto(CONSOLE + '/console/analytics?period=30')
      await pg.getByText('Orders per 100 visits').first().waitFor()
      await pg.getByText(/Too few to judge: \d+ visits so far/).waitFor()
      await pg.getByRole('columnheader', { name: 'Visits', exact: true }).first().waitFor()
      await c.close()
    })

    const yday = new Date(Date.now() + 5.5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10)
    const old = new Date(Date.now() + 5.5 * 3_600_000 - 65 * 86_400_000).toISOString().slice(0, 10)
    const [prod] = await t.db`select id, title from products where tenant_id = ${KESAR} and handle = 'chanderi-kurta-set'`
    const lcp = Array(64).fill(0); lcp[Math.floor(Math.log(2101) / Math.log(1.2))] = 400
    const inp = Array(64).fill(0); inp[Math.floor(Math.log(151) / Math.log(1.2))] = 400
    const cls = Array(64).fill(0); cls[Math.floor(Math.log(41) / Math.log(1.2))] = 400
    const slow = Array(64).fill(0); slow[Math.floor(Math.log(3401) / Math.log(1.2))] = 60
    const seed = async (tenant) => {
      await adb`insert into traffic_daily (tenant_id, day, visitors, views, product_visitors, bag_visitors, checkout_visitors, ordered_visitors, phone, computer, tablet)
        values (${tenant}, ${yday}, 18400, 41000, 9900, 1420, 610, 200, 16700, 1500, 200) on conflict do nothing`
      await adb`insert into source_daily (tenant_id, day, us, um, visitors, ordered_visitors) values (${tenant}, ${yday}, 'instagram', 'bio', 6200, 80) on conflict do nothing`
      await adb`insert into source_daily (tenant_id, day, us, um, visitors, ordered_visitors) values (${tenant}, ${yday}, 'whatsapp', 'broadcast', 1100, 40) on conflict do nothing`
      await adb`insert into browser_daily (tenant_id, day, device, browser, in_app, visitors, ordered_visitors) values
        (${tenant}, ${yday}, 'phone', 'chrome', 'instagram', 8400, 60), (${tenant}, ${yday}, 'phone', 'chrome', '', 5700, 90), (${tenant}, ${yday}, 'phone', 'safari', '', 2200, 40) on conflict do nothing`
      await adb`insert into city_daily (tenant_id, day, city, visitors, ordered_visitors) values (${tenant}, ${yday}, 'Mumbai', 3900, 50), (${tenant}, ${yday}, 'Pune', 2100, 30) on conflict do nothing`
    }
    try {
      await seed(KESAR); await seed(OTHER)
      // Another shop's product id under Kesar: it must never be named.
      await adb`insert into product_daily (tenant_id, day, product_id, views, adds) values (${KESAR}, ${yday}, ${prod.id}, 2900, 406), (${KESAR}, ${yday}, '12345678-0000-4000-8000-000000000000', 9000, 10) on conflict do nothing`
      await adb`insert into vitals_daily (tenant_id, day, metric, product_id, n, buckets) values
        (${KESAR}, ${yday}, 'lcp', '00000000-0000-0000-0000-000000000000', 400, ${lcp}), (${KESAR}, ${yday}, 'inp', '00000000-0000-0000-0000-000000000000', 400, ${inp}),
        (${KESAR}, ${yday}, 'cls', '00000000-0000-0000-0000-000000000000', 400, ${cls}), (${KESAR}, ${yday}, 'lcp', ${prod.id}, 60, ${slow}) on conflict do nothing`

      await t.step('Console › Analytics, partly counted: visits and the funnel show, no rate divides a month of orders by a day of visits', async () => {
        const { c, pg } = await open()
        await pg.goto(CONSOLE + '/console/analytics?period=30')
        await pg.getByRole('heading', { name: /From visit to delivered/ }).waitFor()
        // Visits began yesterday: the 30 days aren't all counted, so orders per visit wait for their date.
        await pg.getByText(/Biggest drop: saw a product → added to bag/).waitFor()
        const strip = await pg.locator('dl').first().innerText()
        assert.match(strip, /Orders per 100 visits\s*—/, 'no rate yet')
        assert.match(strip, /from \d{1,2} [A-Z][a-z]{2}/, 'the date the rates start')
        await c.close()
      })

      // Visits counted since 65 days ago: this window and the one before are both fully counted.
      await adb`insert into traffic_daily (tenant_id, day, visitors) values (${KESAR}, ${old}, 1) on conflict do nothing`

      await t.step('Console › Analytics, ready: the funnel, sources with visits, where they browse, cities, products, speed', async () => {
        const { c, pg } = await open()
        await pg.goto(CONSOLE + '/console/analytics?period=30')
        await pg.getByRole('heading', { name: /From visit to delivered/ }).waitFor()
        await pg.getByText('Saw a product').waitFor()
        // Fully counted: orders per 100 visits is a number, and the funnel's order steps are counted (grouped as India does).
        assert.match(await pg.locator('dl').first().innerText(), /Orders per 100 visits\s*\d+\.\d\d/)
        await pg.getByText(/Biggest drop: /).waitFor()
        await pg.getByText('9,901').waitFor()
        await pg.getByText('Instagram’s in-app browser').waitFor()
        await pg.getByRole('cell', { name: 'Mumbai' }).waitFor()
        await pg.getByRole('link', { name: prod.title }).first().waitFor()
        assert.equal(await pg.getByText('12345678-0000-4000-8000-000000000000').count(), 0, 'a forged product id is never named')
        await pg.getByRole('heading', { name: /Speed on phones/ }).waitFor()
        await pg.getByText('Good', { exact: true }).waitFor()
        await pg.getByText(new RegExp(`Slowest page: ${prod.title}`)).waitFor()
        // Kesar's own visits (18,400 + today's), never the other shop's seeded twin.
        const tile = await pg.locator('dl').first().innerText()
        assert.ok(/18,4\d\d/.test(tile) && !/36,8\d\d/.test(tile), 'Kesar\'s visits, and not another shop\'s added in')
        await pg.screenshot({ path: t.out('console-analytics'), fullPage: true })
        await c.close()
      })

      await t.step('Phone: the page has no sideways scroll', async () => {
        const { c, pg } = await open({ viewport: { width: 390, height: 844 } })
        await pg.goto(CONSOLE + '/console/analytics?period=30')
        await pg.getByRole('heading', { name: /From visit to delivered/ }).waitFor()
        assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
        await pg.screenshot({ path: t.out('console-analytics-phone'), fullPage: true })
        await c.close()
      })
    } finally {
      for (const table of ['traffic_daily', 'source_daily', 'browser_daily', 'city_daily', 'product_daily', 'vitals_daily']) {
        await adb.unsafe(`delete from ${table} where day in ($1, $4) and tenant_id in ($2, $3)`, [yday, KESAR, OTHER, old])
      }
    }
  },
}
