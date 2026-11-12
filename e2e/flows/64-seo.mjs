// =============================================================================
// FLOW: search and sharing (S·0, the regression net written before any SEO change — plan
// docs/plans/2026-11-09-seo-and-sharing.md). Each page type is fetched as each crawler fetches it — a plain GET with
// that user agent, no JavaScript — and the raw <head> is read the way the crawler reads it. Asserts what the shop
// serves today; each later task (S·1, S·2) extends it.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { writeFileSync } from 'node:fs'
import { CONSOLE, PORTS, SHOP_DOMAIN, expectToast, signedIn } from '../lib.mjs'

const HOST = `kesar-studio.${SHOP_DOMAIN}`
const CRAWLERS = {
  whatsapp: 'WhatsApp/2.23.20.0 A',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  x: 'Twitterbot/1.0',
  pinterest: 'Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)',
  telegram: 'TelegramBot (like TwitterBot)',
  linkedin: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
}

/** One GET as a crawler would make it (node:http: undici drops a Host header — frata-gotchas). */
function get(path, ua, host = HOST) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORTS.app, path, method: 'GET', headers: { host, 'user-agent': ua, accept: 'text/html,*/*' } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    r.on('error', reject); r.setTimeout(15_000, () => r.destroy(new Error(`timeout ${path}`))); r.end()
  })
}

function getBytes(path, host = HOST) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORTS.app, path, method: 'GET', headers: { host, 'user-agent': CRAWLERS.whatsapp } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    r.on('error', reject); r.setTimeout(30_000, () => r.destroy(new Error(`timeout ${path}`))); r.end()
  })
}
/** A JPEG's size from its first frame header (SOF0–SOF3). */
function jpegSize(b) {
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1], len = b.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
/** The raw <head> as sent: crawlers read no JavaScript and no streamed tags after it. */
function head(html) {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  assert.ok(m, 'a <head> in the first HTML')
  const h = m[1]
  const attr = (tag, a) => { const x = tag.match(new RegExp(`\\s${a}="([^"]*)"`, 'i')); return x ? unescape(x[1]) : null }
  const metas = [...h.matchAll(/<meta\b[^>]*>/gi)].map((x) => x[0])
  const prop = (p) => metas.filter((t) => attr(t, 'property') === p || attr(t, 'name') === p).map((t) => attr(t, 'content'))
  const link = (rel) => [...h.matchAll(/<link\b[^>]*>/gi)].map((x) => x[0]).filter((t) => attr(t, 'rel') === rel).map((t) => attr(t, 'href'))
  const title = h.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
  return { raw: h, prop, one: (p) => prop(p)[0] ?? null, link, title: title ? unescape(title) : null }
}
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
const ldOfType = (blocks, type) => blocks.flatMap((b) => [b, ...(b['@graph'] ?? [])]).filter((b) => [].concat(b['@type']).includes(type))

export default {
  name: 'seo',
  async run(t) {
    const { db } = t
    const [product] = await db`select p.id, p.handle, p.title from products p join tenants tn on tn.id = p.tenant_id
      where tn.slug = 'kesar-studio' and p.handle = 'chanderi-kurta-set'`
    const prices = (await db`select price from variants where product_id = ${product.id}`).map((v) => Number(v.price))

    await t.step('every crawler gets the product page with its tags in the first HTML', async () => {
      for (const [name, ua] of Object.entries(CRAWLERS)) {
        const r = await get(`/products/${product.handle}`, ua)
        assert.equal(r.status, 200, `${name}: status`)
        const h = head(r.body)
        assert.equal(h.link('canonical')[0], `https://${HOST}/products/${product.handle}`, `${name}: canonical`)
        assert.ok(h.title?.includes(product.title), `${name}: title`)
        assert.equal(h.one('og:url'), `https://${HOST}/products/${product.handle}`, `${name}: og:url`)
        assert.ok(h.one('og:title'), `${name}: og:title`)
        assert.ok(h.one('og:description'), `${name}: og:description`)
        assert.match(h.one('og:image') ?? '', /^https:\/\//, `${name}: og:image absolute https`)
        assert.ok(r.body.length < 1_000_000, `${name}: page under 1 MB (Apple, Meta)`)
        assert.ok(Buffer.byteLength(r.body.slice(0, r.body.indexOf('</head>'))) < 300_000, `${name}: <head> in the first 300 KB (WhatsApp)`)
      }
      // S1·1: one builder — a product card with its price (Meta, Pinterest), a large X card, the locale, large previews.
      const h = head((await get(`/products/${product.handle}`, CRAWLERS.facebook)).body)
      assert.deepEqual(h.prop('og:type'), ['product'], 'exactly one og:type, product')
      assert.ok(prices.includes(Math.round(Number(h.one('product:price:amount')) * 100)), `product:price:amount ${h.one('product:price:amount')} is a variant's price`)
      assert.equal(h.one('product:price:currency'), 'INR')
      assert.match(h.one('product:availability') ?? '', /^(in stock|out of stock|preorder)$/)
      assert.equal(h.one('og:locale'), 'en_IN')
      assert.equal(h.one('twitter:card'), 'summary_large_image')
      assert.ok(h.one('og:image:alt'), 'og:image:alt')
      assert.ok((h.one('og:description') ?? '').length <= 80, 'og:description within WhatsApp\'s 80')
      assert.doesNotMatch(h.one('og:title') ?? '', /Kesar Studio/, 'og:title without the shop name')
      assert.match(h.one('robots') ?? '', /max-image-preview:large/)
      return Object.keys(CRAWLERS).join(', ')
    })

    await t.step('a shared link with utm tags previews as the clean page: the same canonical and og:url', async () => {
      const clean = head((await get(`/products/${product.handle}`, CRAWLERS.whatsapp)).body)
      const tagged = head((await get(`/products/${product.handle}?utm_source=whatsapp&utm_medium=social`, CRAWLERS.whatsapp)).body)
      assert.equal(tagged.link('canonical')[0], clean.link('canonical')[0])
      assert.equal(tagged.one('og:url'), clean.one('og:url'))
      assert.equal(tagged.one('og:image'), clean.one('og:image'))
    })

    await t.step('the product markup parses and states a price the product has', async () => {
      const r = await get(`/products/${product.handle}`, CRAWLERS.google)
      const blocks = jsonLd(r.body)
      assert.ok(blocks.length > 0, 'JSON-LD present')
      const items = [...ldOfType(blocks, 'Product'), ...ldOfType(blocks, 'ProductGroup').flatMap((g) => g.hasVariant ?? [])]
      assert.ok(items.length > 0, 'a Product or ProductGroup')
      const offered = items.flatMap((i) => [].concat(i.offers ?? [])).map((o) => Math.round(Number(o.price) * 100))
      assert.ok(offered.length > 0, 'offers')
      for (const p of offered) assert.ok(prices.includes(p), `offer price ${p} is a variant's price (${prices.join(', ')})`)
      for (const o of items.flatMap((i) => [].concat(i.offers ?? []))) assert.equal(o.priceCurrency, 'INR')
      // A merchant's costs never reach a page (ADR-0003): no cost word in the head or the markup.
      assert.doesNotMatch(head(r.body).raw + JSON.stringify(blocks), /\b(cogs|cost_price|costPrice|unit_cost|freight|margin)\b/i)
    })

    await t.step('home, a collection, the product list and a policy answer every crawler with a canonical', async () => {
      const [c] = await db`select handle from collections c join tenants tn on tn.id = c.tenant_id where tn.slug = 'kesar-studio' order by handle limit 1`
      for (const path of ['/', `/collections/${c.handle}`, '/products', '/policies/returns']) {
        for (const [name, ua] of Object.entries(CRAWLERS)) {
          const r = await get(path, ua)
          assert.equal(r.status, 200, `${path} ${name}`)
          const canonical = head(r.body).link('canonical')[0]
          assert.equal(canonical, `https://${HOST}${path === '/' ? '/' : path}`, `${path} ${name}: canonical`)
        }
      }
      // A shop's card never carries Frrata's own words (the root layout's description).
      for (const path of ['/products', '/policies/returns']) {
        const h = head((await get(path, CRAWLERS.whatsapp)).body)
        for (const k of ['description', 'og:description', 'twitter:description']) assert.doesNotMatch(h.one(k) ?? '', /Frrata|Fashion commerce/, `${path} ${k}`)
      }
      const home = head((await get('/', CRAWLERS.facebook)).body)
      assert.ok(home.one('og:title') && home.one('og:url'), 'home: og:title and og:url')
      assert.ok(ldOfType(jsonLd((await get('/', CRAWLERS.google)).body), 'OnlineStore').length === 1, 'home: OnlineStore markup')
    })

    await t.step('a draft product is not found, and the bag is never indexed', async () => {
      const draft = await get('/products/secret-draft', CRAWLERS.google)
      assert.equal(draft.status, 404)
      const bag = head((await get('/bag', CRAWLERS.google)).body)
      assert.match(bag.one('robots') ?? '', /noindex/)
    })

    await t.step('S1·3: every page shares a 1200×630 JPEG card under 300 KB; odd addresses never draw one', async () => {
      const [c] = await db`select c.handle from collections c join tenants tn on tn.id = c.tenant_id where tn.slug = 'kesar-studio' order by c.handle limit 1`
      const seen = new Set()
      for (const path of ['/', `/products/${product.handle}`, `/collections/${c.handle}`, '/products', '/policies/returns']) {
        const h = head((await get(path, CRAWLERS.whatsapp)).body)
        const img = h.one('og:image')
        assert.match(img ?? '', new RegExp(`^https://${HOST.replace(/\./g, '\\.')}/og/(product|collection)/[0-9a-f-]{36}/[0-9a-f]{16}\\.jpg$|^https://${HOST.replace(/\./g, '\\.')}/og/shop/[0-9a-f]{16}\\.jpg$`), `${path}: og:image is a card`)
        assert.equal(h.one('og:image:type'), 'image/jpeg', `${path}: type`)
        assert.equal(h.one('og:image:width'), '1200'); assert.equal(h.one('og:image:height'), '630')
        assert.ok(h.one('og:image:alt'), `${path}: alt`)
        assert.equal(h.one('twitter:card'), 'summary_large_image', `${path}: X card`)
        if (seen.has(img)) continue
        seen.add(img)
        const r = await getBytes(new URL(img).pathname)
        assert.equal(r.status, 200, `${path}: card served`)
        assert.equal(r.headers['content-type'], 'image/jpeg')
        assert.ok(r.body.length > 1000 && r.body.length <= 300_000, `${path}: ${r.body.length} bytes`)
        assert.match(r.headers['cache-control'] ?? '', /^public, max-age=(86400|300), s-maxage=(86400|300)$/)
        // JPEG SOF0/SOF2 dimensions
        const dims = jpegSize(r.body)
        assert.deepEqual(dims, { w: 1200, h: 630 }, `${path}: 1200×630`)
        writeFileSync(t.out(`card-${seen.size}`).replace(/\.png$/, '.jpg'), r.body)
      }
      const [draft] = await db`select id from products where handle = 'secret-draft'`
      const productCard = [...seen].find((u) => u.includes('/og/product/'))
      const path = new URL(productCard).pathname
      assert.equal((await getBytes(`${path}?v=2`)).status, 308, 'a query string redirects, never draws')
      assert.equal((await getBytes(path.toUpperCase().replace('/OG/', '/og/'))).status, 404, 'capitals: not a card')
      assert.equal((await getBytes(`/og/product/${draft.id}/0123456789abcdef.jpg`)).status, 404, 'a draft has no card')
      assert.equal((await getBytes('/og/product/not-a-uuid/0123456789abcdef.jpg')).status, 404)
      const stale = await getBytes(path.replace(/[0-9a-f]{16}\.jpg$/, '0000000000000000.jpg'))
      assert.equal(stale.status, 200, 'an old card address shows the current card')
      assert.match(stale.headers['cache-control'] ?? '', /max-age=300/, 'briefly')
      return `${seen.size} cards`
    })

    await t.step('S1·7: the owner shares a product — its card, WhatsApp and Facebook links tagged, a QR code, the link', async () => {
      const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
      const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(`${CONSOLE}/console/products/${product.handle}`)
      await p.getByRole('button', { name: 'Share', exact: true }).click()
      const d = p.getByRole('dialog', { name: `Share ${product.title}` }); await d.waitFor()
      assert.match(await d.locator('img').first().getAttribute('src'), /\/og\/product\/[0-9a-f-]{36}\/[0-9a-f]{16}\.jpg$/)
      const wa = new URL(await d.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'))
      assert.equal(wa.host, 'wa.me')
      assert.match(wa.searchParams.get('text'), /utm_source=whatsapp&utm_medium=share/)
      const fb = new URL(await d.getByRole('link', { name: 'Facebook' }).getAttribute('href'))
      assert.match(fb.searchParams.get('u'), new RegExp(`^https://${HOST.replace(/\./g, '\\.')}/products/${product.handle}\\?utm_source=facebook`))
      assert.match(await d.getByLabel('Link').inputValue(), /utm_source=share&utm_medium=link$/)
      await d.getByRole('button', { name: 'QR code' }).click()
      await d.getByRole('img', { name: `QR code for ${product.title}` }).waitFor()
      await p.screenshot({ path: t.out('share-sheet') })
      await d.getByRole('button', { name: 'Done' }).click()
      await ctx.close()
    })

    await t.step('S2: breadcrumbs, the site, a collection\'s list, free shipping; the sitemap has photos and no empty collections', async () => {
      const [c] = await db`select c.handle from collections c join tenants tn on tn.id = c.tenant_id where tn.slug = 'kesar-studio' order by c.handle limit 1`
      assert.equal(ldOfType(jsonLd((await get(`/products/${product.handle}`, CRAWLERS.google)).body), 'BreadcrumbList').length, 1, 'product breadcrumb')
      const home = jsonLd((await get('/', CRAWLERS.google)).body)
      assert.equal(ldOfType(home, 'WebSite').length, 1, 'WebSite')
      assert.ok(ldOfType(home, 'OnlineStore')[0].hasShippingService.handlingTime, 'handling time')
      const col = await get(`/collections/${c.handle}`, CRAWLERS.google)
      assert.equal(col.status, 200, `/collections/${c.handle}`)
      assert.equal(ldOfType(jsonLd(col.body), 'ItemList').length, 1, 'ItemList')
      const sm = (await get('/sitemap.xml', CRAWLERS.google)).body
      assert.match(sm, /<image:image><image:loc>https:\/\//)
      for (const h of ['/products', '/policies/returns']) assert.ok(head((await get(h, CRAWLERS.google)).body).one('description'), `${h}: description`)
    })

    await t.step('S2·2: a renamed collection keeps its old address (308), its own page title, and can go back', async () => {
      const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
      const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      const rename = async (from, to, title) => {
        await p.goto(`${CONSOLE}/console/collections/${from}`)
        await p.getByLabel('Address').fill(to)
        await p.locator('summary', { hasText: 'Search and sharing' }).click()
        await p.getByLabel('Page title').fill(title)
        await p.getByRole('button', { name: 'Save', exact: true }).click()
        await p.waitForURL(`${CONSOLE}/console/collections/${to}`)
      }
      await rename('kurtas', 'kurtas-and-sets', 'Kurtas and sets online')
      await p.screenshot({ path: t.out('collection-seo') })
      const deadline = Date.now() + 70_000
      let old
      do { old = await get('/collections/kurtas', CRAWLERS.google); if (old.status === 308) break; await new Promise((r) => setTimeout(r, 2000)) } while (Date.now() < deadline)
      assert.equal(old.status, 308, 'the old address redirects')
      assert.equal(old.headers.location, '/collections/kurtas-and-sets')
      assert.equal(head((await get('/collections/kurtas-and-sets', CRAWLERS.google)).body).title, 'Kurtas and sets online')
      // Another collection may not take an old address; this one may go back to its own.
      await p.goto(`${CONSOLE}/console/collections/festive-edit`)
      await p.getByLabel('Address').fill('kurtas')
      await p.getByRole('button', { name: 'Save', exact: true }).click()
      await p.getByText('Another collection uses (or used) this address.').waitFor()
      await p.getByRole('button', { name: 'Discard' }).click().catch(() => {})
      await rename('kurtas-and-sets', 'kurtas', '')
      await ctx.close()
    })

    await t.step('S·3: Search and sharing lists the fixes with links, and Home’s own title reaches Google', async () => {
      const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
      const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(`${CONSOLE}/console/search`)
      await p.getByRole('heading', { name: /^(To fix · \d+|Nothing to fix)$/ }).waitFor()
      for (const a of await p.locator('#fixes a').all()) assert.match(await a.getAttribute('href'), /^\/console\/(products|collections)\//)
      await p.getByLabel('Page title').fill('Kesar Studio — handwoven kurtas')
      await p.getByRole('button', { name: 'Save', exact: true }).click()
      await expectToast(p, 'Saved.', 'ok') // the save's result is a toast (design-language § Feedback)
      await p.screenshot({ path: t.out('search-page') })
      const deadline = Date.now() + 70_000
      let title
      do { title = head((await get('/', CRAWLERS.google)).body).title; if (title === 'Kesar Studio — handwoven kurtas') break; await new Promise((r) => setTimeout(r, 2000)) } while (Date.now() < deadline)
      assert.equal(title, 'Kesar Studio — handwoven kurtas')
      await p.getByLabel('Page title').fill('')
      await p.getByRole('button', { name: 'Save', exact: true }).click()
      await expectToast(p, 'Saved.', 'ok')
      await ctx.close()
    })

    await t.step('S1·6: the shop has its own icon (its initial or logo, never Frrata\'s), served as PNG', async () => {
      const h = head((await get('/', CRAWLERS.google)).body)
      const icons = [...h.raw.matchAll(/<link\b[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((x) => x[0].match(/href="([^"]+)"/)[1])
      assert.ok(icons.length >= 2, `icon links: ${icons.join(', ')}`)
      for (const href of icons) {
        assert.match(href, /^\/icon\/(32|180|192|512)\/[0-9a-f]{16}\.png$/)
        const r = await getBytes(href)
        assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'image/png')
      }
      assert.equal((await getBytes(icons[0].replace(/\/icon\/\d+\//, '/icon/64/'))).status, 404, 'only the listed sizes')
      const stale = await getBytes(icons[0].replace(/[0-9a-f]{16}\.png$/, '0000000000000000.png'))
      assert.equal(stale.status, 302, 'a stale icon address points at the current one, drawing nothing')
      assert.equal((await get('/collections/constructor', CRAWLERS.google)).status, 404, 'an object key is not an old address')
      const vp = h.raw.match(/<meta name="theme-color" content="([^"]+)"/)
      assert.ok(vp, 'theme-color')
    })

    await t.step('robots.txt allows crawling and names the sitemap; the sitemap lists the product', async () => {
      const robots = await get('/robots.txt', CRAWLERS.google)
      assert.equal(robots.status, 200)
      assert.match(robots.body, /Allow: \//)
      assert.match(robots.body, new RegExp(`Sitemap: https://${HOST.replace(/\./g, '\\.')}/sitemap\\.xml`))
      const sitemap = await get('/sitemap.xml', CRAWLERS.google)
      assert.equal(sitemap.status, 200)
      assert.ok(sitemap.body.includes(`https://${HOST}/products/${product.handle}`), 'product in the sitemap')
      assert.ok(!sitemap.body.includes('/products/secret-draft'), 'no draft in the sitemap')
    })
  },
}
