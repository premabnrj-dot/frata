// =============================================================================
// FLOW: storefront-sale (V1 Storefront API SA1b; plan docs/plans/2026-11-16-sa1b.md § D·10; mockup
// docs/mockups/2026-11-16-sa1b.html). The store's Website runs elsewhere and it is open: its own site's bag lands on
// Frrata's checkout through the bag link, the order reads "Your website" (the site's own utm wins when it sends one);
// the store's product page moves the shopper to the site with the link's tags, the bag stays; a hidden page previews
// on the site under a token and nowhere else; the Accept screen lists a partner's keys; Frrata Admin sees the store;
// the starter builds and reads the store through the API host. Phone widths. Puts everything back.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { CONSOLE, FAKE_CHECKOUT, OWN_DOMAIN, PORTS, SHOP, USERS, expectToast, playwright, signedIn, until } from '../lib.mjs'

const API = 'api.localhost'
const SITE = `https://${OWN_DOMAIN}`
const get = (path, headers = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: PORTS.app, path, headers: { host: API, ...headers } }, (m) => { let b = ''; m.on('data', (d) => (b += d)); m.on('end', () => res({ status: m.statusCode, body: b, headers: m.headers })) })
  r.on('error', rej); r.end()
})
const ROOT = new URL('../..', import.meta.url).pathname

export default {
  name: 'storefront-sale',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const domain = '0f0f0f0f-0000-4000-8000-000000000092'
    const page = '0f0f0f0f-0000-4000-8000-0000000000a2'
    const [variant] = await db`select v.id from variants v join products p on p.id = v.product_id where p.handle = 'chanderi-kurta-set' and v.option_values = '{M,Rust}'`
    const reset = async () => {
      await db`delete from storefront_keys where tenant_id = ${T}`
      await db`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${T}`
      await db`delete from shop_domains where id = ${domain}`
      await db`delete from shop_pages where id = ${page}`
    }
    await reset()
    await db`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${domain}, ${T}, ${OWN_DOMAIN}, ${OWN_DOMAIN}, false, ${USERS.owner.id}, now(), now())`
    await db`insert into shop_pages (id, tenant_id, template, draft, updated_by) values (${page}, ${T}, 'about', ${db.json({ title: 'Our weavers', handle: 'our-weavers', fill: {}, hidden: true })}, ${USERS.owner.id})`
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message))
    let key = ''
    try {
      await t.step('the owner points the Website at its domain and makes a live key', async () => {
        await p.goto(`${CONSOLE}/console/settings/website`)
        await p.getByRole('radio', { name: /Your own website/ }).click()
        await p.getByLabel('Unsaved changes').getByRole('button', { name: /^Save/ }).click()
        await expectToast(p, 'Saved', 'ok')
        await p.getByRole('button', { name: 'Create key' }).click()
        const dialog = p.getByRole('dialog', { name: 'Create key' })
        await dialog.getByRole('button', { name: 'Create key' }).click()
        await dialog.getByText('Copy this key now. We show it once.').waitFor()
        key = (await dialog.textContent()).match(/frs_pub_[0-9A-Za-z]{38}/)?.[0] ?? ''
        await dialog.getByRole('button', { name: 'Done' }).click()
        assert.ok(key)
        await p.getByRole('link', { name: 'Open docs' }).waitFor()
        await p.getByRole('link', { name: 'Open starter code' }).waitFor()
        const shop = JSON.parse((await get(`/2026-12/k/${key}/shop`)).body)
        assert.equal(shop.cart.url, `${shop.checkoutOrigin}/cart`)
        assert.deepEqual([shop.cart.maxLines, shop.cart.maxQty], [20, 10])
      })

      const ctx = await t.browser.newContext({ ...playwright.devices['Pixel 7'] })
      await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_CHECKOUT }))
      const moved = []
      await ctx.route(`${SITE}/**`, (r) => { moved.push(r.request().url()); return r.fulfill({ contentType: 'text/html', body: '<p>the brand’s own site</p>' }) })
      const s = await ctx.newPage(); s.setDefaultTimeout(15_000); s.on('pageerror', (e) => t.errors.push(e.message))
      const fill = async () => {
        await s.fill('#phone', '98290 43210'); await s.fill('#name', 'Ananya Sharma'); await s.fill('#pincode', '302001'); await s.fill('#city', 'Jaipur')
        await s.fill('#addressLine', 'B-14, Tilak Marg'); await s.fill('#area', 'C-Scheme'); await s.selectOption('#state', 'Rajasthan')
      }
      const order = async (query) => {
        await s.goto(`${SHOP}/bag`); await s.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
        await s.goto(`${SHOP}/cart?l=${variant.id}:1${query}`, { referer: `${SITE}/bag` })
        await s.waitForURL(/\/checkout$/)
        assert.deepEqual(await s.evaluate(() => JSON.parse(localStorage.getItem('frata.bag.v1'))), [{ variantId: variant.id, qty: 1 }], 'the bag is the link’s lines')
        await fill(); await s.getByText('Pay on delivery', { exact: true }).click()
        await s.getByRole('button', { name: /Place order/ }).click(); await s.waitForURL(/\/orders(#t=|$)/)
        const [o] = await db`select id, number, checkout->'attribution' a from orders where tenant_id = ${T} order by placed_at desc limit 1`
        return o
      }

      await t.step('the site’s bag lands on checkout and the order reads Your website', async () => {
        const o = await order('')
        assert.equal(o.a.via_site, '1')
        await p.goto(`${CONSOLE}/console/orders/${o.number}`)
        await p.getByText('Your website').first().waitFor()
        await s.screenshot({ path: t.out('order-390'), fullPage: true })
      })

      await t.step('the site’s own utm wins: Instagram', async () => {
        const o = await order('&utm_source=instagram&utm_medium=bio')
        assert.equal(o.a.utm_source, 'instagram'); assert.equal(o.a.via_site, '1')
        await p.goto(`${CONSOLE}/console/orders/${o.number}`)
        await p.getByText('Instagram bio').first().waitFor()
      })

      await t.step('a bag link that doesn’t read shows one state and changes nothing', async () => {
        await s.goto(`${SHOP}/cart?l=nonsense`)
        await s.getByText('This bag link doesn’t work').waitFor()
        assert.ok(await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll')
        await s.screenshot({ path: t.out('bag-link-broken-390') })
      })

      await t.step('the store’s product page moves to the site with its tags; the bag stays', async () => {
        await s.evaluate(() => sessionStorage.clear())
        await s.goto(`${SHOP}/products/chanderi-kurta-set?utm_source=ig&code=RIYA`, { waitUntil: 'commit' })
        await until(async () => moved.some((u) => u === `${SITE}/products/chanderi-kurta-set?utm_source=ig&code=RIYA`), 10_000)
        await s.goto(`${SHOP}/bag`)
        await s.getByRole('heading', { name: /bag/i }).first().waitFor()
        assert.equal(new URL(s.url()).host, new URL(SHOP).host, 'the bag stays on Frrata')
      })

      await t.step('a hidden page previews on the site under its token, and nowhere else', async () => {
        await p.goto(`${CONSOLE}/console/content?tab=pages`)
        await p.getByRole('button', { name: 'Preview on website' }).click()
        const dialog = p.getByRole('dialog', { name: 'Preview of Our weavers' })
        await dialog.getByText('The link works for 10 minutes.').waitFor()
        await p.screenshot({ path: t.out('preview-1280') })
        const url = new URL(await dialog.locator('.font-mono').first().textContent())
        assert.equal(url.origin, SITE); assert.equal(url.searchParams.get('to'), '/pages/our-weavers')
        const token = url.searchParams.get('token')
        const ok = await get(`/2026-12/k/${key}/preview/pages/our-weavers`, { 'frrata-preview': token })
        assert.equal(ok.status, 200, ok.body.slice(0, 200)); assert.equal(JSON.parse(ok.body).title, 'Our weavers')
        assert.equal(ok.headers['cache-control'], 'private, no-store'); assert.equal(ok.headers['access-control-allow-origin'], undefined)
        assert.equal((await get(`/2026-12/k/${key}/preview/pages/our-weavers`)).status, 404)
        assert.equal((await get(`/2026-12/k/${key}/preview/faq`, { 'frrata-preview': token })).status, 404, 'a token opens its own page only')
        assert.equal((await get(`/2026-12/k/${key}/pages/our-weavers`)).status, 404, 'never under the live key without one')
      })

      await t.step('Frrata Admin sees the store on the API', async () => {
        await db`insert into platform_staff (user_id, email, role) values (${USERS.frata.id}, ${USERS.frata.email}, 'admin') on conflict (user_id) do nothing`
        const staff = await signedIn(t.browser, 'frata', { viewport: { width: 1280, height: 900 } })
        const a = await staff.newPage(); a.setDefaultTimeout(15_000)
        await a.goto(`${CONSOLE}/admin/storefront-api?id=${T}`)
        await a.getByRole('heading', { name: 'Storefront API', level: 1 }).waitFor()
        await a.getByText(OWN_DOMAIN).first().waitFor()
        assert.equal(await a.getByText(/frs_pub_/).count(), 0, 'Admin never shows a key')
        await a.screenshot({ path: t.out('admin-1280'), fullPage: true })
        await a.setViewportSize({ width: 390, height: 844 })
        await a.reload(); await a.getByText('Live keys').waitFor()
        assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= 390))
        await a.screenshot({ path: t.out('admin-390'), fullPage: true })
        await staff.close()
      })

      await t.step('the Accept screen lists the partner’s website keys', async () => {
        const H = '0f0f0f0f-0000-4000-8000-0000000000b2', P = '0f0f0f0f-0000-4000-8000-0000000000c2', D = '0f0f0f0f-0000-4000-8000-0000000000d2'
        const B = USERS.brand
        await db`insert into auth.users (id, email, email_confirmed_at) values (${B.id}, ${B.email}, now()) on conflict (id) do nothing`
        await db`insert into tenants (id, slug, name) values (${H}, 'handover-92', 'Neem and Indigo') on conflict do nothing`
        await db`insert into shop_settings (tenant_id, pickup_pincode) values (${H}, '302001') on conflict do nothing`
        await db`insert into partners (id, user_id, email, name, business_name, phone, city, brands_now, terms_version, agreed_at, approved_at)
          values (${P}, ${'0f0f0f0f-0000-4000-8000-0000000000e2'}, 'arc@studio92.test', 'Arc', 'Arc Studio', '919845000092', 'Pune', '0', 1, now(), now()) on conflict do nothing`
        await db`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${H}, ${P}, 2000, 24, 90) on conflict do nothing`
        await db`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${D}, ${H}, 'neemindigo-e2e.in', 'neemindigo-e2e.in', false, ${USERS.owner.id}, now(), now()) on conflict do nothing`
        await db`update shop_settings set site_origin = 'https://neemindigo-e2e.in', site_domain_id = ${D} where tenant_id = ${H}`
        await db`insert into storefront_keys (tenant_id, kind, name, hash, prefix, partner_id, created_by, expires_at) values
          (${H}, 'public', 'Website', ${'9'.repeat(63) + '2'}, 'frs_pub_n92aaa', ${P}, ${USERS.owner.id}, null),
          (${H}, 'test', 'Arc Studio preview', ${'9'.repeat(63) + '3'}, 'frs_test_n92bbb', ${P}, ${USERS.owner.id}, now() + interval '20 days')`
        await db`insert into invites (tenant_id, email, role, created_by) values (${H}, ${B.email}, 'owner', ${USERS.owner.id})`
        const brand = await signedIn(t.browser, 'brand', { viewport: { width: 390, height: 844 } })
        const h = await brand.newPage(); h.setDefaultTimeout(15_000)
        try {
          await h.goto(`${CONSOLE}/handover`)
          await h.getByText('Neem and Indigo is ready').waitFor()
          const keys = h.getByRole('list', { name: 'Website keys' })
          await keys.getByText('Arc Studio preview').waitFor()
          await keys.getByText('Ends when the store opens').waitFor()
          assert.equal(await h.getByText(/frs_(pub|test)_/).count(), 0, 'the screen names keys, never their codes')
          assert.ok(await h.evaluate(() => document.documentElement.scrollWidth <= 390))
          await h.screenshot({ path: t.out('handover-390'), fullPage: true })
        } finally {
          await brand.close()
          await db`delete from invites where tenant_id = ${H}`; await db`delete from storefront_keys where tenant_id = ${H}`
          await db`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${H}`; await db`delete from shop_domains where id = ${D}`
          await db`delete from partner_links where tenant_id = ${H}`; await db`delete from partners where id = ${P}`
          await db`delete from shop_settings where tenant_id = ${H}`; await db`delete from tenants where id = ${H}`
        }
      })

      await t.step('the docs answer on the API host only', async () => {
        assert.equal((await get('/docs/bag-link')).status, 200)
        assert.equal((await get('/llms.txt')).status, 200)
        const root = await get('/'); assert.ok([307, 308].includes(root.status) && root.headers.location?.endsWith('/docs'), `root: ${root.status}`)
        const elsewhere = await new Promise((res) => http.get({ host: '127.0.0.1', port: PORTS.app, path: '/api-docs/bag-link', headers: { host: 'localhost' } }, (m) => res(m.statusCode)))
        assert.equal(elsewhere, 404)
      })

      await t.step('the starter builds and reads the store through the API host', async () => {
        const dir = `${ROOT}kit/starter`
        // A tiny proxy: the starter's fetch can't set a Host header, so it reads http://127.0.0.1:<port> and this adds it.
        const proxy = http.createServer((req, res) => {
          const up = http.request({ host: '127.0.0.1', port: PORTS.app, path: req.url, method: req.method, headers: { ...req.headers, host: API } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
          up.on('error', () => { res.writeHead(502); res.end() }); req.pipe(up)
        }).listen(4092)
        const env = { ...process.env, FRRATA_KEY: key, FRRATA_API_ORIGIN: 'http://127.0.0.1:4092', NEXT_TELEMETRY_DISABLED: '1' }
        let srv
        try {
          execFileSync(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: dir, env, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 })
          execFileSync(process.execPath, ['scripts/scan-bundle.mjs'], { cwd: dir, env, stdio: 'pipe' })
          srv = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'start', '-p', '4093'], { cwd: dir, env, stdio: 'ignore' })
          await until(async () => (await fetch('http://127.0.0.1:4093/bag').catch(() => null))?.ok, 30_000)
          const home = await (await fetch('http://127.0.0.1:4093/')).text()
          assert.ok(home.includes('Chanderi kurta set'), 'the starter lists the store')
          assert.ok(home.includes('Kesar Studio LLP'), 'the legal block on every page')
          const prod = await fetch('http://127.0.0.1:4093/products/chanderi-kurta-set')
          assert.equal(prod.status, 200)
          assert.ok(!(await prod.text()).includes(key), 'the key never reaches a page')
        } finally { srv?.kill(); proxy.close() }
      })
      await ctx.close()
    } finally {
      await owner.close()
      await reset()
    }
  },
}
